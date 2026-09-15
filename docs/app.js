/* ══════════════════════════════════════════════════════════════════
   Archivio Ricette — logica dell'interfaccia
   ══════════════════════════════════════════════════════════════════ */

const state = {
  recipes:   [],
  groups:    [],
  tagIndex:  {},       // id → {label, color, group}
  query:     '',
  active:    new Set(),
  favOnly:   false,
  sort:      'recent',
  editing:   null,     // ricetta in modifica, null = nuova
  draftImg:  null,     // url immagine del form
  openSheet: null,
  origin:    null,     // rect di partenza per l'animazione
  readonly:  false,    // true dove non si può scrivere
  draftComp: [],       // preparazioni collegate nel form
  stack:     [],       // ricette da cui si è arrivati, per tornare indietro
};

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Un ingrediente che comincia con "# " è un'intestazione di sezione
   (es. "# Per il pollo"): serve quando la stessa cosa torna in più parti
   della ricetta con dosi diverse. */
const isSezione = (riga) => /^#\s+/.test(String(riga || ''));
const testoSezione = (riga) => String(riga).replace(/^#\s+/, '');
const soloIngredienti = (lista) => (lista || []).filter((x) => !isSezione(x));

const fold = (s) => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Gli indirizzi sono tutti relativi: così l'app funziona sia su
// http://localhost:8790/ sia su https://utente.github.io/archivio-ricette/
const img = (p) => store.urlFoto(p);

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


/* ── Tempi ───────────────────────────────────────────────────────────
   Le fonti danno a volte un totale, a volte preparazione e cottura
   separate. Non si sommano: sulla card compaiono affiancati (5'+10'),
   nel dettaglio restano due voci distinte. */

/** Etichetta compatta per la card. */
function tempoCard(r) {
  if (r.time_min) return r.time_min + '′';
  const pezzi = [r.prep_min, r.cook_min].filter(Boolean);
  return pezzi.length ? pezzi.map((n) => n + '′').join('+') : null;
}

/** Numero solo per ordinare "più veloci": non viene mai mostrato. */
function tempoOrdine(r) {
  if (r.time_min) return r.time_min;
  const somma = (r.prep_min || 0) + (r.cook_min || 0);
  return somma || 9e9;
}

/* ── Placeholder grafico per le ricette senza foto ───────────────── */

const PH_EMOJI = {
  colazione: '🥣', dessert: '🍰', dolce: '🍰', zuppa: '🍲', insalata: '🥗',
  panino: '🥪', pesce: '🐟', carne: '🥩', vegano: '🥬', vegetariano: '🥦',
  primo: '🍝', secondo: '🍗', contorno: '🥕', spuntino: '🥜', forno: '🔥',
};

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function placeholder(r) {
  const h = hash(r.name || 'x');
  const a = h % 360, b = (a + 42) % 360;
  const grad = `linear-gradient(140deg, hsl(${a} 42% 17%), hsl(${b} 38% 11%))`;
  let emoji = '🍽️';
  for (const t of r.tags || []) { if (PH_EMOJI[t]) { emoji = PH_EMOJI[t]; break; } }
  return `<div class="rc-ph" style="--ph:${grad}"><span>${emoji}</span></div>`;
}


/* ── Caricamento dati ────────────────────────────────────────────── */

async function boot() {
  let dati;
  try {
    dati = await store.load();
  } catch (e) {
    toast(location.protocol === 'file:'
      ? '📂 Hai aperto il file direttamente. Apri invece il link dell\'archivio.'
      : '❌ Non riesco a leggere l\'archivio');
    return;
  }

  state.groups   = dati.cfg.tag_groups || [];
  state.recipes  = dati.recipes || [];
  state.groups.forEach((g) => g.tags.forEach((t) => {
    state.tagIndex[t.id] = { label: t.label, color: g.color, group: g.id };
  }));

  aggiornaModo();
  if (store.erroreChiave) toast('⚠️ ' + store.erroreChiave);

  buildFilters();
  buildTagPicker();
  render(true);
}

async function reload() {
  state.recipes = await store.list();
  render(true);
}

/** Mostra o nasconde i comandi di scrittura secondo il deposito attivo. */
function aggiornaModo() {
  state.readonly = !store.puoScrivere();

  $('#btnNew').hidden = state.readonly;
  if (!state.readonly) $('#btnNew').classList.add('pop');

  $('#btnKey').hidden = !store.githubDisponibile();
  $('#btnKey').classList.toggle('on', store.mode === 'github');
  $('#btnKey').title = store.mode === 'github'
    ? 'Chiave GitHub collegata' : 'Attiva la scrittura da qui';

  const badge = $('#roBadge');
  badge.hidden = !state.readonly;
  badge.title = 'Attiva la scrittura da qui';
}


/* ── Filtri ──────────────────────────────────────────────────────── */

function totalTags() {
  return state.groups.reduce((n, g) => n + g.tags.length, 0);
}

function buildFilters() {
  const row = $('#filterRow');
  row.hidden = totalTags() === 0;      // catalogo vuoto: niente barra filtri
  row.innerHTML = state.groups.map((g, i) => {
    const sep = i ? '<div class="grp-sep"></div>' : '';
    const chips = g.tags.map((t) => `
      <button class="tag-chip" data-tag="${t.id}" style="--c:${g.color}">
        <span class="dot"></span>${esc(t.label)}
      </button>`).join('');
    return sep + chips;
  }).join('');

  row.addEventListener('click', (e) => {
    const chip = e.target.closest('.tag-chip');
    if (!chip) return;
    const id = chip.dataset.tag;
    state.active.has(id) ? state.active.delete(id) : state.active.add(id);
    chip.classList.toggle('on', state.active.has(id));
    render();
  });
}

function filtered() {
  const q = fold(state.query.trim());

  // OR dentro lo stesso gruppo, AND fra gruppi diversi
  const byGroup = {};
  state.active.forEach((id) => {
    const g = state.tagIndex[id]?.group || '_';
    (byGroup[g] = byGroup[g] || []).push(id);
  });

  let out = state.recipes.filter((r) => {
    if (state.favOnly && !r.favorite) return false;

    for (const ids of Object.values(byGroup)) {
      if (!ids.some((id) => (r.tags || []).includes(id))) return false;
    }

    if (q) {
      const hay = fold([
        r.name,
        (r.ingredients || []).join(' '),
        (r.steps || []).join(' '),
        r.notes,
        (r.tags || []).map((t) => state.tagIndex[t]?.label || '').join(' '),
      ].join(' '));
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });

  const coll = new Intl.Collator('it', { sensitivity: 'base' });
  if (state.sort === 'name') {
    out.sort((a, b) => coll.compare(a.name, b.name));
  } else if (state.sort === 'time') {
    out.sort((a, b) => tempoOrdine(a) - tempoOrdine(b) || coll.compare(a.name, b.name));
  } else {
    out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }
  return out;
}


/* ── Griglia ─────────────────────────────────────────────────────── */

function cardHTML(r, i) {
  const tags = (r.tags || []).slice(0, 3).map((t) => {
    const info = state.tagIndex[t];
    if (!info) return '';
    return `<span class="mini-tag" style="--c:${info.color}">${esc(info.label)}</span>`;
  }).join('');
  const extra = (r.tags || []).length > 3
    ? `<span class="mini-tag more">+${r.tags.length - 3}</span>` : '';

  const media = r.image
    ? `<img src="${esc(img(r.image))}" alt="" loading="lazy">`
    : placeholder(r);

  const t = tempoCard(r);
  const time = t ? `<div class="rc-time">⏱ ${t}</div>` : '';

  return `
    <article class="rcard" data-id="${r.id}" style="animation-delay:${Math.min(i, 14) * 34}ms">
      <div class="rc-media">
        ${media}
        <div class="rc-sheen"></div>
        ${time}
        ${state.readonly
          ? (r.favorite ? '<div class="rc-fav on static">★</div>' : '')
          : `<button class="rc-fav${r.favorite ? ' on' : ''}" data-fav="${r.id}"
                title="Preferita" aria-label="Preferita">${r.favorite ? '★' : '☆'}</button>`}
      </div>
      <div class="rc-body">
        <h3 class="rc-name">${esc(r.name)}</h3>
        <div class="rc-tags">${tags}${extra}</div>
      </div>
    </article>`;
}

function render(animate) {
  const list = filtered();
  const grid = $('#grid');
  const empty = $('#empty');

  // le card entrano in scena al primo caricamento e dopo un salvataggio;
  // mentre si filtra o si cerca devono comparire subito, senza sfarfallii
  grid.classList.toggle('no-anim', !animate);
  grid.innerHTML = list.map(cardHTML).join('');
  grid.hidden = list.length === 0;
  empty.hidden = list.length !== 0;

  if (!list.length) {
    const virgin = state.recipes.length === 0;
    $('#empty .empty-title').textContent = virgin ? 'Archivio vuoto' : 'Nessun risultato';
    $('#emptySub').innerHTML = !virgin
      ? 'Prova a cambiare filtri o testo di ricerca.'
      : state.readonly
        ? 'Per aggiungere ricette da qui serve collegare una volta sola il tuo GitHub.'
        : "Aggiungi la prima ricetta e comincia a costruire l'archivio.";

    $('#btnNewEmpty').hidden = !virgin;
    $('#btnNewEmpty .lbl-txt').textContent = state.readonly
      ? 'Attiva la scrittura' : 'Nuova ricetta';
    $('#btnNewEmpty .ic-piu').hidden = state.readonly;
    $('#btnNewEmpty .ic-chiave').hidden = !state.readonly;
  }

  const tot = state.recipes.length;
  $('#countLabel').textContent = list.length === tot
    ? `${tot} ricett${tot === 1 ? 'a' : 'e'}`
    : `${list.length} di ${tot}`;

  const dirty = state.query || state.active.size || state.favOnly;
  $('#btnClear').hidden = !dirty;
}


/* ── Animazione di apertura / chiusura (FLIP) ────────────────────── */

function lockScroll(on) {
  if (on) {
    const sb = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = sb > 0 ? sb + 'px' : '';
    document.body.classList.add('locked');
  } else {
    document.body.classList.remove('locked');
    document.body.style.paddingRight = '';
  }
}

function openSheet(sheet, origin) {
  if (state.openSheet) closeSheet(true);
  state.openSheet = sheet;
  state.origin = origin ? (origin.getBoundingClientRect ? origin.getBoundingClientRect() : origin) : null;

  $('#scrim').classList.add('on');
  lockScroll(true);
  sheet.hidden = false;
  sheet.scrollTop = 0;

  const inner = $('.sheet-inner', sheet);
  if (reduced) { inner.style.opacity = 1; return; }

  const to = inner.getBoundingClientRect();
  const from = state.origin || {
    left: to.left + to.width / 2 - 40, top: window.innerHeight * 0.62,
    width: 80, height: 80,
  };
  const s = Math.max(0.08, Math.min(from.width / to.width, from.height / to.height));
  const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
  const dy = (from.top + from.height / 2) - (to.top + to.height / 2);

  inner.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0, filter: 'blur(6px)' },
    { opacity: 1, offset: 0.35, filter: 'blur(0px)' },
    { transform: 'translate(0px, 0px) scale(1)', opacity: 1, filter: 'blur(0px)' },
  ], { duration: 540, easing: EASE });

  // contenuto in cascata
  const form = $('.sheet-inner > form', sheet);
  $$(':scope > *', form || $('.sheet-inner', sheet)).slice(0, 10).forEach((el, i) => {
    el.animate(
      [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
      { duration: 460, delay: 90 + i * 45, easing: EASE, fill: 'backwards' }
    );
  });
}

function closeSheet(instant) {
  const sheet = state.openSheet;
  if (!sheet) return;
  state.openSheet = null;
  state.stack = [];

  $('#scrim').classList.remove('on');
  lockScroll(false);

  let settled = false;
  const finish = () => { if (settled) return; settled = true; sheet.hidden = true; };
  if (instant || reduced) return finish();

  const inner = $('.sheet-inner', sheet);
  const to = inner.getBoundingClientRect();
  const from = state.origin;
  let end = { transform: 'translateY(26px) scale(.94)', opacity: 0 };

  if (from && from.width) {
    const s = Math.max(0.08, Math.min(from.width / to.width, from.height / to.height));
    const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
    const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
    end = { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 };
  }

  const anim = inner.animate(
    [{ transform: 'none', opacity: 1 }, end],
    { duration: 340, easing: 'cubic-bezier(.4,0,.7,.2)' }
  );
  anim.onfinish = finish;
  anim.oncancel = finish;
  // rete di sicurezza: in una scheda in secondo piano l'animazione può non
  // arrivare mai in fondo, ma il pannello deve chiudersi comunque
  setTimeout(finish, 600);
}


/* ── Dettaglio ricetta ───────────────────────────────────────────── */

/** Riempie il pannello con una ricetta. Non lo apre: quello lo fa openDetail. */
function disegnaDettaglio(id) {
  const r = state.recipes.find((x) => x.id === id);
  if (!r) return false;

  const tags = (r.tags || []).map((t) => {
    const info = state.tagIndex[t];
    return info ? `<span class="mini-tag" style="--c:${info.color}">${esc(info.label)}</span>` : '';
  }).join('');

  const hero = r.image
    ? `<img src="${esc(img(r.image))}" alt="">`
    : placeholder(r);

  const pills = [
    r.prep_min  ? { i: '🔪', k: 'Preparazione', v: r.prep_min + ' min', c: 'var(--accent2)' } : null,
    r.cook_min  ? { i: '🔥', k: 'Cottura',      v: r.cook_min + ' min', c: 'var(--accent2)' } : null,
    r.time_min  ? { i: '⏱️', k: 'Tempo',        v: r.time_min + ' min', c: 'var(--accent2)' } : null,
    r.servings  ? { i: '🍽️', k: 'Porzioni', v: r.servings + (r.servings === 1 ? ' persona' : ' persone'), c: 'var(--cyan)' } : null,
    soloIngredienti(r.ingredients).length
      ? { i: '🧂', k: 'Ingredienti', v: soloIngredienti(r.ingredients).length, c: 'var(--accent)' } : null,
    (r.steps || []).length ? { i: '📋', k: 'Passaggi', v: r.steps.length, c: 'var(--violet)' } : null,
  ].filter(Boolean).map((p) => `
    <div class="meta-pill" style="--c:${p.c}">
      <span class="mi">${p.i}</span>
      <span><span class="mk">${p.k}</span><br><span class="mv">${esc(p.v)}</span></span>
    </div>`).join('');

  // Preparazioni: quelle che questa ricetta usa, e quelle che usano lei
  const usate = (r.components || []).map(ricettaPerId).filter(Boolean);
  const usanti = state.recipes.filter((x) => (x.components || []).includes(r.id));

  const rigaLink = (x, sotto) => `
    <button class="dt-link" data-vai="${x.id}">
      ${miniatura(x)}
      <span class="testo"><span class="nome">${esc(x.name)}</span>
        ${sotto ? `<span class="sotto">${esc(sotto)}</span>` : ''}</span>
      <span class="freccia"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M9 18l6-6-6-6"></path></svg></span>
    </button>`;

  const bloccoUsate = usate.length ? `
    <div class="dt-link-sec">
      <div class="sec-title">Usa anche</div>
      <div class="dt-links">${usate.map((x) => rigaLink(x,
        [tempoCard(x) ? tempoCard(x).replace(/′/g, ' min').replace('+', ' + ') : null,
         soloIngredienti(x.ingredients).length + ' ingredienti'].filter(Boolean).join(' · '))).join('')}</div>
    </div>` : '';

  const bloccoUsanti = usanti.length ? `
    <div class="dt-body" style="grid-template-columns:1fr;padding-top:0">
      <div>
        <div class="sec-title">Usata in</div>
        <div class="dt-links">${usanti.map((x) => rigaLink(x, '')).join('')}</div>
      </div>
    </div>` : '';

  const ing = (r.ingredients || []).length
    ? `<ul class="ing-list">${r.ingredients.map((x) => (isSezione(x)
        ? `<li class="ing-sez">${esc(testoSezione(x))}</li>`
        : `<li>${esc(x)}</li>`)).join('')}</ul>`
    : '<div class="dt-empty-note">Nessun ingrediente inserito.</div>';

  const steps = (r.steps || []).length
    ? `<ol class="step-list">${r.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`
    : '<div class="dt-empty-note">Nessun passaggio inserito.</div>';

  const nutri = (r.nutrition || []).length ? `
    <div class="dt-body" style="grid-template-columns:1fr;padding-top:0">
      <div>
        <div class="sec-title">Valori nutrizionali${r.nutrition_basis ? ' · ' + esc(r.nutrition_basis) : ''}</div>
        <div class="nutri-grid">
          ${r.nutrition.map((n) => `<div class="nutri-voce">
             <span class="nk">${esc(n.k)}</span><span class="nv">${esc(n.v)}</span></div>`).join('')}
        </div>
      </div>
    </div>` : '';

  const notes = r.notes
    ? `<div class="dt-notes"><span class="nk">Note</span>${esc(r.notes)}</div>` : '';

  const when = r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT',
    { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  $('#detailInner').innerHTML = `
    <div class="dt-bar"><div class="dt-tools">
        ${state.stack.length ? `
        <button class="icon-btn" data-act="indietro" title="Torna indietro">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>` : ''}
        ${state.readonly ? '' : `
        <button class="icon-btn${r.favorite ? ' on' : ''}" data-act="fav" title="Preferita">
          <span style="font-size:1rem;line-height:1">${r.favorite ? '★' : '☆'}</span>
        </button>
        <button class="icon-btn" data-act="edit" title="Modifica">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"></path>
          </svg>
        </button>`}
        <button class="icon-btn close" data-act="close" title="Chiudi (Esc)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
        </button>
      </div></div>
    <div class="dt-hero${r.image ? '' : ' noimg'}">
      ${hero}
      <div class="dt-title-wrap">
        <h2 class="dt-title">${esc(r.name)}</h2>
        <div class="dt-tags">${tags}</div>
      </div>
    </div>
    ${pills ? `<div class="dt-meta">${pills}</div>` : ''}
    <div class="dt-body">
      <div><div class="sec-title">Ingredienti</div>${ing}${bloccoUsate}</div>
      <div><div class="sec-title">Procedimento</div>${steps}</div>
    </div>
    ${nutri}
    ${bloccoUsanti}
    ${notes}
    <div class="dt-foot">Aggiunta il ${when}</div>`;

  $('#detailInner').dataset.id = r.id;
  return true;
}

function openDetail(id, fromEl) {
  state.stack = [];
  if (!disegnaDettaglio(id)) return;
  openSheet($('#detail'), fromEl);
}

/** Cambia ricetta dentro il pannello già aperto, con un dissolvenza breve. */
function apriCollegata(id) {
  if (!disegnaDettaglio(id)) return;
  $('#detail').scrollTop = 0;
  if (!reduced) {
    $('#detailInner').animate(
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: 320, easing: EASE });
  }
}

$('#detail').addEventListener('click', async (e) => {
  const li = e.target.closest('.ing-list li');
  if (li) { li.classList.toggle('done'); return; }

  const vai = e.target.closest('[data-vai]');
  if (vai) {
    state.stack.push($('#detailInner').dataset.id);
    apriCollegata(vai.dataset.vai);
    return;
  }

  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = $('#detailInner').dataset.id;

  if (btn.dataset.act === 'indietro') {
    const prima = state.stack.pop();
    if (prima) apriCollegata(prima);
    return;
  }

  if (btn.dataset.act === 'close') closeSheet();
  if (btn.dataset.act === 'edit') {
    const origin = state.origin;
    closeSheet(true);
    setTimeout(() => openEditor(state.recipes.find((r) => r.id === id), origin), 30);
  }
  if (btn.dataset.act === 'fav') {
    const r = await toggleFav(id);
    if (r) {
      btn.classList.toggle('on', r.favorite);
      btn.firstElementChild.textContent = r.favorite ? '★' : '☆';
    }
  }
});


/* ── Preferiti ───────────────────────────────────────────────────── */

async function toggleFav(id) {
  if (state.readonly) return null;
  try {
    const updated = await store.setFavorite(id, state.recipes);
    const i = state.recipes.findIndex((r) => r.id === id);
    if (i >= 0) state.recipes[i] = updated;
    render();
    return updated;
  } catch (e) { toast('❌ ' + (e.message || 'Non sono riuscito a salvare')); return null; }
}


/* ── Editor: liste dinamiche ─────────────────────────────────────── */

function lineRow(kind, value) {
  const row = document.createElement('div');
  row.className = 'line-row';
  row.innerHTML = `
    <span class="bullet">${kind === 'step' ? '' : '•'}</span>
    <input type="text" value="${esc(value || '')}"
           placeholder="${kind === 'step' ? 'Descrivi il passaggio…' : 'es. 200 g di riso'}">
    <button type="button" class="line-del" title="Rimuovi">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"></path></svg>
    </button>`;

  const input = $('input', row);
  const segnaSezione = () => row.classList.toggle('e-sez', kind !== 'step' && isSezione(input.value));
  segnaSezione();
  input.addEventListener('input', segnaSezione);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = row.nextElementSibling;
      if (next) { $('input', next).focus(); }
      else { addRow(kind, '', true); }
    }
    if (e.key === 'Backspace' && !input.value && row.parentElement.children.length > 1) {
      e.preventDefault();
      const prev = row.previousElementSibling;
      row.remove();
      renumber(kind);
      if (prev) { const p = $('input', prev); p.focus(); p.setSelectionRange(p.value.length, p.value.length); }
    }
  });

  // incolla multiriga → tante righe quante sono le linee
  input.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text.includes('\n')) return;
    e.preventDefault();
    const lines = text.split('\n').map((l) => l.replace(/^[\s\-•*\d.)]+/, '').trim()).filter(Boolean);
    if (!lines.length) return;
    input.value = lines[0];
    let ref = row;
    lines.slice(1).forEach((l) => { ref = addRow(kind, l, false, ref); });
    renumber(kind);
  });

  $('.line-del', row).addEventListener('click', () => {
    const list = row.parentElement;
    row.remove();
    if (!list.children.length) addRow(kind, '');
    renumber(kind);
  });

  return row;
}

function addRow(kind, value, focus, after) {
  const list = $(kind === 'step' ? '#stepList' : '#ingList');
  const row = lineRow(kind, value);
  if (after) after.after(row); else list.appendChild(row);
  renumber(kind);
  if (focus) $('input', row).focus();
  return row;
}

function renumber(kind) {
  if (kind !== 'step') return;
  $$('#stepList .bullet').forEach((b, i) => { b.textContent = i + 1; });
}

function setLines(kind, values) {
  const list = $(kind === 'step' ? '#stepList' : '#ingList');
  list.innerHTML = '';
  const vals = (values && values.length) ? values : [''];
  vals.forEach((v) => list.appendChild(lineRow(kind, v)));
  renumber(kind);
}

function getLines(kind) {
  const bulk = $(kind === 'step' ? '#stepBulk' : '#ingBulk');
  if (!bulk.hidden) {
    return bulk.value.split('\n').map((l) => l.replace(/^[\s\-•*]+/, '').trim()).filter(Boolean);
  }
  return $$(`#${kind === 'step' ? 'stepList' : 'ingList'} input`)
    .map((i) => i.value.trim()).filter(Boolean);
}


/* ── Editor: tag ─────────────────────────────────────────────────── */

function buildTagPicker() {
  const vuoto = totalTags() === 0;
  $('#tagPicker').hidden = vuoto;
  $('#tagLabel').hidden = vuoto;
  // con un solo gruppo l'intestazione è solo rumore: i tag parlano da soli
  const conTitoli = state.groups.length > 1;

  $('#tagPicker').innerHTML = state.groups.map((g) => `
    <div class="tp-group">
      ${conTitoli ? `<div class="tp-head"><span>${g.icon || ''}</span>${esc(g.label)}</div>` : ''}
      <div class="tp-tags">
        ${g.tags.map((t) => `<button type="button" class="tp-tag" data-tag="${t.id}"
              style="--c:${g.color}">${esc(t.label)}</button>`).join('')}
      </div>
    </div>`).join('');

  $('#tagPicker').addEventListener('click', (e) => {
    const b = e.target.closest('.tp-tag');
    if (b) b.classList.toggle('on');
  });
}


/* ── Valori nutrizionali: testo ⇄ coppie etichetta/valore ────────── */

function nutriDaTesto(testo) {
  return String(testo || '').split('\n').map((riga) => {
    const i = riga.indexOf(':');
    if (i < 1) return null;
    const k = riga.slice(0, i).trim();
    const v = riga.slice(i + 1).trim();
    return k && v ? { k, v } : null;
  }).filter(Boolean);
}

const nutriATesto = (lista) =>
  (lista || []).map((n) => `${n.k}: ${n.v}`).join('\n');

/* ── Editor: preparazioni collegate ──────────────────────────────── */

const ricettaPerId = (id) => state.recipes.find((r) => r.id === id);

/** Miniatura: la foto se c'è, altrimenti l'emoji del segnaposto. */
function miniatura(r) {
  if (r.image) return `<img class="mini-foto" src="${esc(img(r.image))}" alt="">`;
  const ph = placeholder(r).match(/<span>(.*?)<\/span>/);
  return `<span class="vuoto">${ph ? ph[1] : '🍽️'}</span>`;
}

function disegnaComponenti() {
  $('#compPicked').innerHTML = state.draftComp.map((id) => {
    const r = ricettaPerId(id);
    if (!r) return '';
    return `<span class="comp-chip">${esc(r.name)}
      <button type="button" class="via" data-via="${id}" title="Togli il collegamento">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M18 6L6 18M6 6l12 12"></path></svg>
      </button></span>`;
  }).join('');
}

function cercaComponenti(testo) {
  const box = $('#compResults');
  const q = fold(testo.trim());
  const escluso = state.editing ? state.editing.id : null;

  const trovate = state.recipes
    .filter((r) => r.id !== escluso && !state.draftComp.includes(r.id))
    .filter((r) => !q || fold(r.name).includes(q))
    .slice(0, 8);

  if (!q && !trovate.length) { box.hidden = true; return; }

  box.innerHTML = trovate.length
    ? trovate.map((r) => `<button type="button" class="comp-res" data-add-comp="${r.id}">
         ${miniatura(r)}<span>${esc(r.name)}</span></button>`).join('')
    : '<div class="comp-none">Nessuna ricetta con questo nome.</div>';
  box.hidden = false;
}

function setupComponenti() {
  const input = $('#compSearch');

  input.addEventListener('focus', () => cercaComponenti(input.value));
  input.addEventListener('input', () => cercaComponenti(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('#compResults').hidden = true; input.blur(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const primo = $('#compResults .comp-res');
      if (primo) primo.click();
    }
  });

  // mousedown invece di click: il blur dell'input chiuderebbe il menù prima
  $('#compResults').addEventListener('mousedown', (e) => {
    const b = e.target.closest('[data-add-comp]');
    if (!b) return;
    e.preventDefault();
    state.draftComp.push(b.dataset.addComp);
    disegnaComponenti();
    input.value = '';
    cercaComponenti('');
    input.focus();
  });

  $('#compPicked').addEventListener('click', (e) => {
    const b = e.target.closest('[data-via]');
    if (!b) return;
    state.draftComp = state.draftComp.filter((x) => x !== b.dataset.via);
    disegnaComponenti();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.comp-search')) $('#compResults').hidden = true;
  });
}

/* ── Editor: immagine ────────────────────────────────────────────── */

async function shrink(file, max = 1600, quality = 0.85) {
  if (file.size < 900 * 1024) return file;          // già leggera: non toccarla
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 2.5 * 1024 * 1024) return file;
    const c = document.createElement('canvas');
    c.width  = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
  } catch {
    return file;                                     // formati esotici → li manda il server
  }
}

async function uploadImage(file) {
  if (!file || !/^image\//.test(file.type || '')) { toast('❌ Serve un file immagine'); return; }
  const drop = $('#drop');
  const localUrl = URL.createObjectURL(file);
  $('#dzPreview').src = localUrl;
  drop.classList.add('has-img');
  $('#dzRemove').hidden = false;
  $('#dzProgress').hidden = false;

  try {
    const small = await shrink(file);
    state.draftImg = await store.putImage(small);
    $('#dzPreview').src = img(state.draftImg);
  } catch (err) {
    toast('❌ ' + (err.message || 'Caricamento non riuscito'));
    clearImage();
  } finally {
    $('#dzProgress').hidden = true;
    URL.revokeObjectURL(localUrl);
  }
}

function clearImage() {
  state.draftImg = null;
  $('#dzPreview').src = '';
  $('#drop').classList.remove('has-img');
  $('#dzRemove').hidden = true;
  $('#fImage').value = '';
}

function setupDropzone() {
  const drop = $('#drop');

  drop.addEventListener('click', (e) => { if (!e.target.closest('.dz-remove')) $('#fImage').click(); });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fImage').click(); } });
  $('#fImage').addEventListener('change', (e) => { if (e.target.files[0]) uploadImage(e.target.files[0]); });
  $('#dzRemove').addEventListener('click', (e) => { e.stopPropagation(); clearImage(); });

  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove('over');
  }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) uploadImage(f);
  });

  // incolla una foto dagli appunti mentre l'editor è aperto
  document.addEventListener('paste', (e) => {
    if ($('#editor').hidden) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); uploadImage(item.getAsFile()); }
  });
}


/* ── Editor: apertura / salvataggio ──────────────────────────────── */

function openEditor(recipe, origin) {
  state.editing = recipe || null;

  $('#edEyebrow').textContent = recipe ? 'Modifica ricetta' : 'Nuova ricetta';
  $('#fName').value     = recipe?.name || '';
  $('#fPrep').value     = recipe?.prep_min || '';
  $('#fCook').value     = recipe?.cook_min || '';
  $('#fTime').value     = recipe?.time_min || '';
  $('#fServings').value = recipe?.servings || '';
  $('#fNutriBasis').value = recipe?.nutrition_basis || '';
  $('#fNutri').value    = nutriATesto(recipe?.nutrition);
  $('#fNotes').value    = recipe?.notes || '';
  $('#edSave').textContent = recipe ? 'Salva modifiche' : 'Salva ricetta';
  $('#edDelete').hidden = !recipe;
  $('#edDelete').classList.remove('confirm');
  $('#edDelete').textContent = 'Elimina';

  clearImage();
  if (recipe?.image) {
    state.draftImg = recipe.image;
    $('#dzPreview').src = img(recipe.image);
    $('#drop').classList.add('has-img');
    $('#dzRemove').hidden = false;
  }

  $$('.tp-tag').forEach((b) => b.classList.toggle('on', (recipe?.tags || []).includes(b.dataset.tag)));

  ['ing', 'step'].forEach((k) => {
    const bulk = $(k === 'step' ? '#stepBulk' : '#ingBulk');
    bulk.hidden = true; bulk.value = '';
    $(`.link-btn[data-bulk="${k}"]`).classList.remove('on');
    $(k === 'step' ? '#stepList' : '#ingList').hidden = false;
    $(`.add-line[data-add="${k}"]`).hidden = false;
  });
  setLines('ing',  recipe?.ingredients);
  setLines('step', recipe?.steps);

  state.draftComp = [...(recipe?.components || [])].filter(ricettaPerId);
  disegnaComponenti();
  $('#compSearch').value = '';
  $('#compResults').hidden = true;

  openSheet($('#editor'), origin);
  setTimeout(() => { if (!recipe) $('#fName').focus(); }, 380);
}

async function saveRecipe(e) {
  e.preventDefault();
  const name = $('#fName').value.trim();
  if (!name) { $('#fName').focus(); toast('❌ Manca il nome della ricetta'); return; }

  const payload = {
    name,
    image:       state.draftImg,
    tags:        $$('.tp-tag.on').map((b) => b.dataset.tag),
    components:  [...state.draftComp],
    ingredients: getLines('ing'),
    steps:       getLines('step'),
    nutrition:   nutriDaTesto($('#fNutri').value),
    nutrition_basis: $('#fNutriBasis').value.trim(),
    notes:       $('#fNotes').value.trim(),
    prep_min:    $('#fPrep').value || null,
    cook_min:    $('#fCook').value || null,
    time_min:    $('#fTime').value || null,
    servings:    $('#fServings').value || null,
    favorite:    state.editing?.favorite || false,
  };

  const btn = $('#edSave');
  btn.disabled = true;
  try {
    const editing = state.editing;
    const salvata = await store.save(payload, editing, state.recipes);

    // aggiorno l'elenco qui invece di rileggere tutto: è immediato
    if (editing) {
      const i = state.recipes.findIndex((r) => r.id === editing.id);
      if (i >= 0) state.recipes[i] = salvata;
    } else {
      state.recipes.push(salvata);
    }

    closeSheet();
    render(true);
    toast(editing ? '✅ Ricetta aggiornata' : '✅ Ricetta salvata');
  } catch (err) {
    toast('❌ ' + (err.message || 'Errore di salvataggio'));
  } finally {
    btn.disabled = false;
  }
}

async function deleteRecipe() {
  const btn = $('#edDelete');
  if (!btn.classList.contains('confirm')) {
    btn.classList.add('confirm');
    btn.textContent = 'Confermi?';
    setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = 'Elimina'; }, 4000);
    return;
  }
  try {
    const id = state.editing.id;
    await store.remove(id, state.recipes);
    state.recipes = state.recipes.filter((r) => r.id !== id);
    closeSheet();
    render(true);
    toast('🗑️ Ricetta eliminata');
  } catch (e) { toast('❌ ' + (e.message || 'Eliminazione non riuscita')); }
}


/* ── Toast ───────────────────────────────────────────────────────── */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}


/* ── Eventi globali ──────────────────────────────────────────────── */

$('#grid').addEventListener('click', (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
  const card = e.target.closest('.rcard');
  if (card) openDetail(card.dataset.id, card);
});

$('#search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

$('#btnFav').addEventListener('click', (e) => {
  state.favOnly = !state.favOnly;
  e.currentTarget.classList.toggle('on', state.favOnly);
  render();
});

$('#btnClear').addEventListener('click', () => {
  state.query = ''; state.active.clear(); state.favOnly = false;
  $('#search').value = '';
  $('#btnFav').classList.remove('on');
  $$('.tag-chip.on').forEach((c) => c.classList.remove('on'));
  render();
});

$('#btnNew').addEventListener('click', (e) => openEditor(null, e.currentTarget));
$('#btnNewEmpty').addEventListener('click', (e) => {
  if (state.readonly) apriSetup(e.currentTarget);
  else openEditor(null, e.currentTarget);
});
$('#edClose').addEventListener('click', () => closeSheet());
$('#edCancel').addEventListener('click', () => closeSheet());
$('#edDelete').addEventListener('click', deleteRecipe);
$('#form').addEventListener('submit', saveRecipe);
$('#scrim').addEventListener('click', () => closeSheet());

$$('.link-btn[data-bulk]').forEach((btn) => btn.addEventListener('click', () => {
  const k = btn.dataset.bulk;
  const bulk = $(k === 'step' ? '#stepBulk' : '#ingBulk');
  const list = $(k === 'step' ? '#stepList' : '#ingList');
  const add  = $(`.add-line[data-add="${k}"]`);

  if (bulk.hidden) {                       // righe → testo unico
    bulk.value = getLines(k).join('\n');
    bulk.hidden = false; list.hidden = true; add.hidden = true;
    btn.classList.add('on'); btn.textContent = 'Torna a righe';
    bulk.focus();
  } else {                                 // testo unico → righe
    const lines = bulk.value.split('\n').map((l) => l.replace(/^[\s\-•*]+/, '').trim()).filter(Boolean);
    bulk.hidden = true; list.hidden = false; add.hidden = false;
    btn.classList.remove('on'); btn.textContent = 'Incolla lista';
    setLines(k, lines);
  }
}));

$$('.add-line[data-add]').forEach((btn) =>
  btn.addEventListener('click', () => addRow(btn.dataset.add, '', true)));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.openSheet) { closeSheet(); return; }

  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (typing || state.openSheet) return;

  if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
  if (e.key.toLowerCase() === 'n' && !state.readonly) { e.preventDefault(); openEditor(null, $('#btnNew')); }
});

/* ── Chiave GitHub ────────────────────────────────────────────────── */

function apriSetup(origine) {
  const c = store.repo;
  $('#setupRepo').textContent = c.repo;
  $('#setupToken').value = '';
  $('#setupMsg').textContent = '';
  $('#setupMsg').className = 'setup-msg';
  $('#setupForget').hidden = store.mode !== 'github';
  openSheet($('#setup'), origine);
  setTimeout(() => $('#setupToken').focus(), 420);
}

async function attivaChiave() {
  const t = $('#setupToken').value.trim();
  const msg = $('#setupMsg');
  if (!t) { msg.className = 'setup-msg ko'; msg.textContent = 'Incolla la chiave qui sopra.'; return; }

  const btn = $('#setupSave');
  btn.disabled = true;
  msg.className = 'setup-msg wait';
  msg.textContent = 'Controllo la chiave…';

  try {
    await verificaChiave(t);
    msg.className = 'setup-msg ok';
    msg.textContent = '✅ Fatto. Ricarico l\'archivio…';
    const dati = await store.load();
    state.recipes = dati.recipes || [];
    aggiornaModo();
    render(true);
    setTimeout(() => { closeSheet(); toast('🔑 Ora puoi aggiungere ricette da qui'); }, 700);
  } catch (e) {
    msg.className = 'setup-msg ko';
    msg.textContent = '❌ ' + (e.message || 'Chiave non accettata');
  } finally {
    btn.disabled = false;
  }
}

async function scollegaChiave() {
  tokenArchivio.clear();
  closeSheet();
  const dati = await store.load();
  state.recipes = dati.recipes || [];
  aggiornaModo();
  render(true);
  toast('🔒 Chiave rimossa da questo browser');
}

$('#btnKey').addEventListener('click', (e) => apriSetup(e.currentTarget));
$('#roBadge').addEventListener('click', (e) => apriSetup(e.currentTarget));
$('#setupClose').addEventListener('click', () => closeSheet());
$('#setupCancel').addEventListener('click', () => closeSheet());
$('#setupSave').addEventListener('click', attivaChiave);
$('#setupForget').addEventListener('click', scollegaChiave);
$('#setupToken').addEventListener('keydown', (e) => { if (e.key === 'Enter') attivaChiave(); });

setupDropzone();
setupComponenti();
boot();
