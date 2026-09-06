/* ══════════════════════════════════════════════════════════════════
   Dove vivono le ricette.

   Tre depositi possibili, scelti in questo ordine:

     github   c'è una chiave salvata → scrive dentro il repository.
              È il modo normale: funziona da qualsiasi dispositivo.
     local    gira il server sul Mac → usa la sua API.
     static   nessuno dei due → legge i file pubblicati, sola lettura.

   Chi chiama non deve sapere quale sia: l'interfaccia è la stessa.
   ══════════════════════════════════════════════════════════════════ */

const CHIAVE = 'archivio-ricette:token';

/* ── Dove sta il repository ──────────────────────────────────────── */

function repoInfo() {
  // Su GitHub Pages l'indirizzo dice già tutto: utente.github.io/nome-repo/
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (m) {
    const primo = location.pathname.split('/').filter(Boolean)[0];
    if (primo) return { owner: m[1], repo: primo, branch: 'main' };
  }
  // In locale non si può dedurre: questi sono i valori di partenza.
  return { owner: 'GiampyNormo', repo: 'archivio-ricette', branch: 'main' };
}

const REPO      = repoInfo();
const PERCORSO  = 'docs/data/recipes.json';
const CART_FOTO = 'docs/images';

const rawUrl = (nome) =>
  `https://raw.githubusercontent.com/${REPO.owner}/${REPO.repo}/${REPO.branch}/${CART_FOTO}/${nome}`;

/* ── Chiave di accesso: vive solo in questo browser ──────────────── */

const token = {
  get()  { try { return localStorage.getItem(CHIAVE) || null; } catch { return null; } },
  set(t) { try { localStorage.setItem(CHIAVE, t); } catch {} },
  clear(){ try { localStorage.removeItem(CHIAVE); } catch {} },
};

/* ── base64 che regge accenti ed emoji ───────────────────────────── */

function bytesToB64(bytes) {
  let s = '';
  const passo = 0x8000;                       // a pezzi: spread su array enormi esplode
  for (let i = 0; i < bytes.length; i += passo) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
  }
  return btoa(s);
}

const testoToB64 = (t) => bytesToB64(new TextEncoder().encode(t));

function b64ToTesto(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(arr);
}

async function fileToB64(file) {
  const buf = await file.arrayBuffer();
  return bytesToB64(new Uint8Array(buf));
}

/* ── Normalizzazione: le stesse regole del server, qui nel browser ─ */

function nuovoId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

const oraIso = () => new Date().toISOString().replace(/\.\d+Z$/, '+00:00');

function pulisciRighe(v, limite = 200) {
  if (typeof v === 'string') v = v.split('\n');
  if (!Array.isArray(v)) return [];
  return v.slice(0, limite)
    .map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 400))
    .filter(Boolean);
}

function interoTra(v, min, max) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function normalizza(dati, esistente, tagValidi) {
  const base = esistente || {};
  const nome = String(dati.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!nome) throw new Error('Il nome della ricetta è obbligatorio');

  const tags = [];
  for (const t of dati.tags || []) {
    if (tagValidi.has(t) && !tags.includes(t)) tags.push(t);
  }

  let foto = dati.image == null ? null : String(dati.image);
  if (foto && !foto.startsWith('/images/')) foto = null;

  return {
    id:          base.id || nuovoId(),
    name:        nome,
    image:       foto,
    tags,
    ingredients: pulisciRighe(dati.ingredients),
    steps:       pulisciRighe(dati.steps),
    notes:       String(dati.notes || '').trim().slice(0, 2000),
    servings:    interoTra(dati.servings, 1, 50),
    time_min:    interoTra(dati.time_min, 1, 1440),
    favorite:    Boolean(dati.favorite ?? base.favorite ?? false),
    created_at:  base.created_at || oraIso(),
    updated_at:  oraIso(),
  };
}

/* ── Chiamate a GitHub ───────────────────────────────────────────── */

async function gh(percorso, opzioni = {}) {
  const t = token.get();
  const res = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}${percorso}`, {
    ...opzioni,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(opzioni.headers || {}),
    },
  });
  if (res.status === 401) throw new Error('Chiave non valida o scaduta');
  if (res.status === 403) throw new Error('La chiave non ha il permesso di scrivere');
  return res;
}

async function verificaChiave(t) {
  const prima = token.get();
  token.set(t);
  try {
    const res = await gh('');
    if (!res.ok) throw new Error(res.status === 404
      ? 'La chiave non vede questo repository'
      : 'Chiave rifiutata da GitHub');
    const info = await res.json();
    if (info.permissions && info.permissions.push === false) {
      throw new Error('La chiave può solo leggere: serve il permesso di scrittura');
    }
    return true;
  } catch (e) {
    if (prima) token.set(prima); else token.clear();
    throw e;
  }
}

/* ── Il deposito ─────────────────────────────────────────────────── */

const store = {
  mode: 'static',
  sha: null,               // versione del file su GitHub, serve per non sovrascrivere
  tagValidi: new Set(),
  repo: REPO,

  puoScrivere() { return this.mode === 'github' || this.mode === 'local'; },
  githubDisponibile() { return this.mode === 'github' || this.mode === 'static'; },

  urlFoto(p) {
    const rel = String(p || '').replace(/^\//, '');
    if (!rel) return '';
    // Su GitHub la foto è raggiungibile appena committata, mentre il sito
    // pubblicato ci mette un minuto a rigenerarsi: così si vede subito.
    if (this.mode === 'github') return rawUrl(rel.replace(/^images\//, ''));
    return rel;
  },

  /* Sceglie il deposito e restituisce { cfg, recipes } */
  async load() {
    const cfg = await this.caricaConfig();
    this.tagValidi = new Set(
      (cfg.tag_groups || []).flatMap((g) => g.tags.map((t) => t.id))
    );

    if (token.get()) {
      try {
        const recipes = await this.leggiDaGithub();
        this.mode = 'github';
        return { cfg, recipes };
      } catch (e) {
        // chiave rotta: si continua a leggere, non si perde l'archivio
        console.warn('GitHub non raggiungibile:', e.message);
        this.erroreChiave = e.message;
      }
    }

    const api = await this.provaServerLocale();
    if (api) { this.mode = 'local'; return { cfg, recipes: api }; }

    this.mode = 'static';
    return { cfg, recipes: await this.leggiStatico() };
  },

  async caricaConfig() {
    try {
      const r = await fetch('api/config');
      if (r.ok && r.status !== 404) return await r.json();
    } catch {}
    const r = await fetch('data/config.json?v=' + Date.now());
    if (!r.ok) throw new Error('Configurazione non trovata');
    return await r.json();
  },

  async provaServerLocale(tentativi = 3) {
    for (let i = 0; i < tentativi; i++) {
      try {
        const r = await fetch('api/recipes');
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('api incompleta');
        return (await r.json()).recipes || [];
      } catch {
        if (i === tentativi - 1) return null;
        await new Promise((k) => setTimeout(k, 300 + i * 400));
      }
    }
    return null;
  },

  async leggiStatico() {
    const r = await fetch('data/recipes.json?v=' + Date.now());
    if (!r.ok) throw new Error('Archivio non trovato');
    return (await r.json()).recipes || [];
  },

  async leggiDaGithub() {
    const res = await gh(`/contents/${PERCORSO}?ref=${REPO.branch}&t=${Date.now()}`);
    if (res.status === 404) { this.sha = null; return []; }
    if (!res.ok) throw new Error('Non riesco a leggere l\'archivio da GitHub');
    const file = await res.json();
    this.sha = file.sha;
    return JSON.parse(b64ToTesto(file.content)).recipes || [];
  },

  /* Scrive l'elenco prodotto da `trasforma`.

     In caso di conflitto non riscrive la propria copia — perderebbe quello
     che ha appena salvato un altro dispositivo — ma rilegge la versione
     fresca e ci riapplica sopra la stessa modifica. */
  async applicaSuGithub(elenco, trasforma, messaggio) {
    for (let tentativo = 0; tentativo < 2; tentativo++) {
      const base = tentativo === 0 ? elenco : await this.leggiDaGithub();
      const nuovo = trasforma(base);
      const testo = JSON.stringify(
        { version: 1, updated_at: oraIso(), recipes: nuovo }, null, 2);

      const res = await gh(`/contents/${PERCORSO}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messaggio,
          content: testoToB64(testo),
          branch: REPO.branch,
          ...(this.sha ? { sha: this.sha } : {}),
        }),
      });

      if (res.status === 409 || res.status === 422) continue;   // riprova sul fresco
      if (!res.ok) throw new Error('Salvataggio su GitHub non riuscito');
      this.sha = (await res.json()).content.sha;
      return nuovo;
    }
    throw new Error('L\'archivio è cambiato altrove: riprova fra un istante');
  },

  /* Rilegge l'elenco dal deposito già scelto */
  async list() {
    if (this.mode === 'github') return await this.leggiDaGithub();
    if (this.mode === 'local')  return (await this.provaServerLocale()) || [];
    return await this.leggiStatico();
  },

  /* ── Operazioni ── */

  async save(dati, esistente, elenco) {
    if (this.mode === 'local') {
      const url = esistente ? `api/recipes/${esistente.id}` : 'api/recipes';
      const res = await fetch(url, {
        method: esistente ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dati),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Salvataggio non riuscito');
      return out;
    }

    const ricetta = normalizza(dati, esistente, this.tagValidi);
    await this.applicaSuGithub(
      elenco,
      (l) => (esistente
        ? (l.some((r) => r.id === esistente.id)
            ? l.map((r) => (r.id === esistente.id ? ricetta : r))
            : [...l, ricetta])          // cancellata altrove nel frattempo: la rimetto
        : [...l, ricetta]),
      (esistente ? 'Aggiorno' : 'Aggiungo') + ` la ricetta: ${ricetta.name}`);
    return ricetta;
  },

  async remove(id, elenco) {
    if (this.mode === 'local') {
      const res = await fetch(`api/recipes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Eliminazione non riuscita');
      return;
    }
    const via = elenco.find((r) => r.id === id);
    await this.applicaSuGithub(elenco, (l) => l.filter((r) => r.id !== id),
      `Elimino la ricetta: ${via ? via.name : id}`);
  },

  async setFavorite(id, elenco) {
    if (this.mode === 'local') {
      const res = await fetch(`api/recipes/${id}/favorite`, { method: 'POST' });
      if (!res.ok) throw new Error('Non sono riuscito a salvare');
      return await res.json();
    }
    const voluto = !(elenco.find((r) => r.id === id) || {}).favorite;
    let agg = null;
    await this.applicaSuGithub(elenco, (l) => l.map((r) => {
      if (r.id !== id) return r;
      agg = { ...r, favorite: voluto, updated_at: oraIso() };
      return agg;
    }), (voluto ? 'Preferita: ' : 'Non più preferita: ')
        + ((elenco.find((r) => r.id === id) || {}).name || id));
    if (!agg) throw new Error('Ricetta non trovata');
    return agg;
  },

  async putImage(file) {
    if (this.mode === 'local') {
      const fd = new FormData();
      fd.append('image', file, file.name || 'foto.jpg');
      const res = await fetch('api/images', { method: 'POST', body: fd });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Caricamento non riuscito');
      return out.url;
    }

    const est = (file.name || 'foto.jpg').split('.').pop().toLowerCase();
    const data = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const nome = `${data}-${nuovoId()}${nuovoId().slice(0, 4)}.${est}`;

    const res = await gh(`/contents/${CART_FOTO}/${nome}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Foto per una ricetta`,
        content: await fileToB64(file),
        branch: REPO.branch,
      }),
    });
    if (!res.ok) throw new Error('Caricamento della foto non riuscito');
    return '/images/' + nome;
  },
};

window.store = store;
window.tokenArchivio = token;
window.verificaChiave = verificaChiave;
