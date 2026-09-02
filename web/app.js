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
};

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fold = (s) => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


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
  try {
    const [cfg, list] = await Promise.all([
      fetch('/api/config').then((r) => r.json()),
      fetch('/api/recipes').then((r) => r.json()),
    ]);
    state.groups  = cfg.tag_groups || [];
    state.recipes = list.recipes || [];
    state.groups.forEach((g) => g.tags.forEach((t) => {
      state.tagIndex[t.id] = { label: t.label, color: g.color, group: g.id };
    }));
  } catch (e) {
    toast('❌ Server non raggiungibile');
    return;
  }
  buildFilters();
  buildTagPicker();
  render(true);
}

async function reload() {
  const res = await fetch('/api/recipes');
  state.recipes = (await res.json()).recipes || [];
  render(true);
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
    out.sort((a, b) => (a.time_min || 9e9) - (b.time_min || 9e9) || coll.compare(a.name, b.name));
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
    ? `<img src="${esc(r.image)}" alt="" loading="lazy">`
    : placeholder(r);

  const time = r.time_min ? `<div class="rc-time">⏱ ${r.time_min}′</div>` : '';

  return `
    <article class="rcard" data-id="${r.id}" style="animation-delay:${Math.min(i, 14) * 34}ms">
      <div class="rc-media">
        ${media}
        <div class="rc-sheen"></div>
        ${time}
        <button class="rc-fav${r.favorite ? ' on' : ''}" data-fav="${r.id}"
                title="Preferita" aria-label="Preferita">${r.favorite ? '★' : '☆'}</button>
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
    $('#emptySub').textContent = virgin
      ? "Aggiungi la prima ricetta e comincia a costruire l'archivio."
      : 'Prova a cambiare filtri o testo di ricerca.';
    $('#btnNewEmpty').hidden = !virgin;
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

function openDetail(id, fromEl) {
  const r = state.recipes.find((x) => x.id === id);
  if (!r) return;

  const tags = (r.tags || []).map((t) => {
    const info = state.tagIndex[t];
    return info ? `<span class="mini-tag" style="--c:${info.color}">${esc(info.label)}</span>` : '';
  }).join('');

  const hero = r.image
    ? `<img src="${esc(r.image)}" alt="">`
    : placeholder(r);

  const pills = [
    r.time_min  ? { i: '⏱️', k: 'Tempo',    v: r.time_min + ' min', c: 'var(--accent2)' } : null,
    r.servings  ? { i: '🍽️', k: 'Porzioni', v: r.servings + (r.servings === 1 ? ' persona' : ' persone'), c: 'var(--cyan)' } : null,
    (r.ingredients || []).length ? { i: '🧂', k: 'Ingredienti', v: r.ingredients.length, c: 'var(--accent)' } : null,
    (r.steps || []).length ? { i: '📋', k: 'Passaggi', v: r.steps.length, c: 'var(--violet)' } : null,
  ].filter(Boolean).map((p) => `
    <div class="meta-pill" style="--c:${p.c}">
      <span class="mi">${p.i}</span>
      <span><span class="mk">${p.k}</span><br><span class="mv">${esc(p.v)}</span></span>
    </div>`).join('');

  const ing = (r.ingredients || []).length
    ? `<ul class="ing-list">${r.ingredients.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '<div class="dt-empty-note">Nessun ingrediente inserito.</div>';

  const steps = (r.steps || []).length
    ? `<ol class="step-list">${r.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`
    : '<div class="dt-empty-note">Nessun passaggio inserito.</div>';

  const notes = r.notes
    ? `<div class="dt-notes"><span class="nk">Note</span>${esc(r.notes)}</div>` : '';

  const when = r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT',
    { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  $('#detailInner').innerHTML = `
    <div class="dt-bar"><div class="dt-tools">
        <button class="icon-btn${r.favorite ? ' on' : ''}" data-act="fav" title="Preferita">
          <span style="font-size:1rem;line-height:1">${r.favorite ? '★' : '☆'}</span>
        </button>
        <button class="icon-btn" data-act="edit" title="Modifica">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"></path>
          </svg>
        </button>
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
      <div><div class="sec-title">Ingredienti</div>${ing}</div>
      <div><div class="sec-title">Procedimento</div>${steps}</div>
    </div>
    ${notes}
    <div class="dt-foot">Aggiunta il ${when}</div>`;

  $('#detailInner').dataset.id = r.id;
  openSheet($('#detail'), fromEl);
}

$('#detail').addEventListener('click', async (e) => {
  const li = e.target.closest('.ing-list li');
  if (li) { li.classList.toggle('done'); return; }

  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = $('#detailInner').dataset.id;

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
  try {
    const res = await fetch(`/api/recipes/${id}/favorite`, { method: 'POST' });
    if (!res.ok) throw 0;
    const updated = await res.json();
    const i = state.recipes.findIndex((r) => r.id === id);
    if (i >= 0) state.recipes[i] = updated;
    render();
    return updated;
  } catch { toast('❌ Non sono riuscito a salvare'); return null; }
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
    const fd = new FormData();
    fd.append('image', small, small.name || 'foto.jpg');
    const res = await fetch('/api/images', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'upload fallito');
    state.draftImg = data.url;
    $('#dzPreview').src = data.url;
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
  $('#fTime').value     = recipe?.time_min || '';
  $('#fServings').value = recipe?.servings || '';
  $('#fNotes').value    = recipe?.notes || '';
  $('#edSave').textContent = recipe ? 'Salva modifiche' : 'Salva ricetta';
  $('#edDelete').hidden = !recipe;
  $('#edDelete').classList.remove('confirm');
  $('#edDelete').textContent = 'Elimina';

  clearImage();
  if (recipe?.image) {
    state.draftImg = recipe.image;
    $('#dzPreview').src = recipe.image;
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
    ingredients: getLines('ing'),
    steps:       getLines('step'),
    notes:       $('#fNotes').value.trim(),
    time_min:    $('#fTime').value || null,
    servings:    $('#fServings').value || null,
    favorite:    state.editing?.favorite || false,
  };

  const btn = $('#edSave');
  btn.disabled = true;
  try {
    const editing = state.editing;
    const res = await fetch(editing ? `/api/recipes/${editing.id}` : '/api/recipes', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'salvataggio fallito');

    closeSheet();
    await reload();
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
    const res = await fetch(`/api/recipes/${state.editing.id}`, { method: 'DELETE' });
    if (!res.ok) throw 0;
    closeSheet();
    await reload();
    toast('🗑️ Ricetta eliminata');
  } catch { toast('❌ Eliminazione non riuscita'); }
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
$('#btnNewEmpty').addEventListener('click', (e) => openEditor(null, e.currentTarget));
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
  if (e.key.toLowerCase() === 'n') { e.preventDefault(); openEditor(null, $('#btnNew')); }
});

setupDropzone();
boot();
