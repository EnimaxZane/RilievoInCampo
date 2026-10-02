/* Rilievo in Campo — app per rilievi su planimetria (offline, PWA) */
(function () {
'use strict';

const { CAT, BY_ID, LIST, LINES } = window.SYMS;
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = (o) => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DIMC = '#0b7a5c';
const ROOM_SUGG = ['Soggiorno', 'Cucina', 'Bagno', 'Camera', 'Camera 2', 'Disimpegno', 'Ingresso', 'Studio', 'Ripostiglio', 'Lavanderia', 'Bagno 2', 'Corridoio', 'Garage', 'Cantina', 'Centrale termica', 'Balcone', 'Esterno'];

if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const ICON = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  gal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
  rot: '<path d="M20 12a8 8 0 11-2.3-5.7"/><path d="M20 4v5h-5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  more: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pdf: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 14h6M9 17h4"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  save: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  back: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'
};
const icon = (n) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i'); s.innerHTML = ICON[n]; return s; };

// ---------------------------------------------------------------- UI helpers
const layer = $('#layer');
const openLayers = [];
function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast', role: 'status' }, msg); document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
function busy(msg) {
  const b = h('div', { class: 'busy' }, h('div', { class: 'spin' }), h('div', { class: 'msg' }, msg));
  document.body.append(b);
  return { set: (m) => { b.querySelector('.msg').textContent = m; }, close: () => b.remove() };
}
function dialog({ title, body, buttons = [{ label: 'OK', value: true, cls: 'primary' }], dismiss = null }) {
  return new Promise((resolve) => {
    let done = false;
    const close = (v) => { if (done) return; done = true; wrap.remove(); const i = openLayers.indexOf(entry); if (i >= 0) openLayers.splice(i, 1); resolve(v); };
    const acts = h('div', { class: 'acts' });
    const bodyEl = h('div', { class: 'body' });
    const dlg = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true' }, h('h2', {}, title), bodyEl, acts);
    const wrap = h('div', { class: 'dlg-wrap', onclick: (e) => { if (e.target === wrap) close(dismiss); } }, dlg);
    const content = typeof body === 'function' ? body(close) : body;
    if (content) bodyEl.append(content);
    if (!content) bodyEl.remove();
    for (const b of buttons) {
      acts.append(h('button', { class: 'btn ' + (b.cls || ''), onclick: async () => {
        if (b.validate && !(await b.validate())) return;
        close(typeof b.value === 'function' ? b.value() : b.value);
      } }, b.label));
    }
    if (!buttons.length) acts.remove();
    const entry = { close: () => close(dismiss) };
    openLayers.push(entry);
    layer.append(wrap);
    const f = dlg.querySelector('input:not([type=checkbox]):not([type=radio]),textarea');
    if (f) setTimeout(() => { f.focus(); if (f.select && f.type !== 'date') f.select(); }, 60);
  });
}
function confirmDlg(title, text, ok = 'Conferma', danger = false) {
  return dialog({ title, body: h('p', {}, text), buttons: [{ label: 'Annulla', value: false }, { label: ok, value: true, cls: danger ? 'danger' : 'primary' }], dismiss: false });
}
function field(f) {
  const id = 'f_' + f.id;
  let input;
  if (f.type === 'textarea') input = h('textarea', { id, placeholder: f.placeholder || '', rows: 3 }, f.value || '');
  else if (f.type === 'select') input = h('select', { id }, f.options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(f.value) }, o.label)));
  else input = h('input', { id, type: f.type || 'text', value: f.value == null ? '' : f.value, placeholder: f.placeholder || '', inputmode: f.inputmode, step: f.step, min: f.min, autocomplete: 'off' });
  return h('div', { class: 'field' }, h('label', { for: id }, f.label), input);
}
async function formDlg(title, fields, ok = 'Salva', note) {
  let root;
  const v = await dialog({
    title,
    body: () => (root = h('form', { onsubmit: (e) => { e.preventDefault(); root.closest('.dlg').querySelector('.acts .primary').click(); } }, note ? h('p', {}, note) : null, fields.map(field), h('button', { type: 'submit', hidden: true }))),
    buttons: [{ label: 'Annulla', value: null }, { label: ok, cls: 'primary', value: () => {
      const out = {}; for (const f of fields) out[f.id] = root.querySelector('#f_' + f.id).value; return out;
    }, validate: () => {
      for (const f of fields) if (f.required && !root.querySelector('#f_' + f.id).value.trim()) { toast('Compila: ' + f.label); return false; }
      return true;
    } }]
  });
  return v;
}
function pickList(title, items, extra) {
  // items: [{label, sub, value, on}]
  return dialog({
    title,
    body: (close) => h('div', {}, h('div', { class: 'list' }, items.map((it) => h('button', { class: it.on ? 'on' : '', onclick: () => close(it.value) },
      it.icon ? it.icon : null, h('div', {}, h('div', {}, it.label), it.sub ? h('div', { class: 'sub' }, it.sub) : null)))), extra ? extra(close) : null),
    buttons: [{ label: 'Chiudi', value: null }]
  });
}
function pickFile(input, accept) {
  return new Promise((res) => {
    if (accept != null) input.accept = accept;
    input.value = '';
    input.onchange = () => res([...input.files]);
    input.click();
  });
}

// ---------------------------------------------------------------- Storage (IndexedDB + fallback)
const DB = {
  db: null, mem: { projects: new Map(), files: new Map() },
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('rilievo-campo', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          d.createObjectStore('projects', { keyPath: 'id' });
          d.createObjectStore('files', { keyPath: 'id' }).createIndex('pid', 'pid');
        };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch (e) { this.db = null; console.warn('IndexedDB non disponibile', e); }
  },
  req(store, mode, fn) {
    if (!this.db) return Promise.resolve(fn(null));
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, mode); const st = tx.objectStore(store);
      const r = fn(st); let val;
      if (r && 'onsuccess' in r) r.onsuccess = () => { val = r.result; };
      tx.oncomplete = () => res(val); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  },
  get(store, id) { return this.db ? this.req(store, 'readonly', (s) => s.get(id)) : Promise.resolve(this.mem[store].get(id)); },
  put(store, obj) { return this.db ? this.req(store, 'readwrite', (s) => s.put(obj)) : Promise.resolve(this.mem[store].set(obj.id, obj)); },
  del(store, id) { return this.db ? this.req(store, 'readwrite', (s) => s.delete(id)) : Promise.resolve(this.mem[store].delete(id)); },
  all(store) { return this.db ? this.req(store, 'readonly', (s) => s.getAll()) : Promise.resolve([...this.mem[store].values()]); },
  filesOf(pid) { return this.db ? this.req('files', 'readonly', (s) => s.index('pid').getAll(pid)) : Promise.resolve([...this.mem.files.values()].filter((f) => f.pid === pid)); }
};
async function putFile(pid, blob, kind) { const id = uid(); await DB.put('files', { id, pid, kind, type: blob.type, blob }); return id; }
async function getBlob(id) { const f = await DB.get('files', id); return f ? f.blob : null; }
const urlCache = new Map();
async function fileURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await getBlob(id); if (!b) return '';
  const u = URL.createObjectURL(b); urlCache.set(id, u); return u;
}
const settings = {
  get(k, d) { try { const v = localStorage.getItem('rc_' + k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rc_' + k, v); } catch (e) { /* ignore */ } }
};

// ---------------------------------------------------------------- Stato
const S = {
  proj: null, sheet: null, img: null, view: { s: 1, tx: 0, ty: 0 },
  tool: 'pan', sym: null, lineStyle: 'af', sel: null, draft: null,
  undo: [], redo: [], room: '', panelOpen: false, symCat: 'E', nums: new Map(), editSnap: false,
  recent: (settings.get('recent', '') || '').split(',').filter((x) => BY_ID[x])
};
let saveTimer = 0;
function saveSoon() {
  if (!S.proj) return;
  S.proj.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => DB.put('projects', S.proj).catch((e) => toast('Errore di salvataggio: ' + e.message)), 350);
}
async function saveNow() { clearTimeout(saveTimer); if (S.proj) await DB.put('projects', S.proj); }

function hasInfo(o) { return (o.n && o.n.trim()) || (o.ph && o.ph.length) || (o.hq !== undefined && o.hq !== null && o.hq !== ''); }
function numbering(proj) {
  const m = new Map(); const c = { E: 0, I: 0, T: 0, A: 0, L: 0 };
  for (const sh of proj.sheets) for (const o of sh.objs) {
    if (o.k === 'sym') {
      const d = BY_ID[o.t]; if (!d) continue;
      if (d.cat === 'A' && !hasInfo(o)) continue;
      m.set(o.id, d.cat + (++c[d.cat]));
    } else if (o.k === 'line' && hasInfo(o)) m.set(o.id, 'L' + (++c.L));
  }
  return m;
}
function refreshNums() { if (S.proj) S.nums = numbering(S.proj); }

// ---------------------------------------------------------------- Geometria
function sizePx(sh, o) { const ppcm = sh.ppm ? sh.ppm / 100 : sh.u / 45; return [o.w * ppcm, o.h * ppcm]; }
function ext(sh, o) {
  if (o.k === 'sym') {
    const d = BY_ID[o.t];
    if (!d || d.kind === 'pt') { const r = sh.u * (o.sc || 1) / 2; return { ex: r, ey: r }; }
    const [w, hh] = sizePx(sh, o); const a = (o.rot || 0) * Math.PI / 180; const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    return { ex: (w * c + hh * s) / 2, ey: (w * s + hh * c) / 2 };
  }
  if (o.k === 'text') { const sz = sh.u * 0.42 * (o.sc || 1); const ls = String(o.tx || '').split('\n'); const mw = Math.max(...ls.map((l) => l.length), 1); return { w: mw * sz * 0.58, h: ls.length * sz * 1.2, sz }; }
  return { ex: 0, ey: 0 };
}
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy;
  let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0; t = clamp(t, 0, 1);
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function dimGeom(sh, o) {
  const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, off = (o.off || 0) * sh.u;
  return { L, ux, uy, nx, ny, a: [o.x1 + nx * off, o.y1 + ny * off], b: [o.x2 + nx * off, o.y2 + ny * off] };
}
const fmtM = (m) => m.toFixed(2).replace('.', ',');
function dimLabel(sh, o) { if (o.v && String(o.v).trim()) return String(o.v).trim(); if (sh.ppm) return fmtM(dimGeom(sh, o).L / sh.ppm); return '?'; }
function lineLen(sh, o) { let L = 0; for (let i = 1; i < o.pts.length; i++) L += Math.hypot(o.pts[i][0] - o.pts[i - 1][0], o.pts[i][1] - o.pts[i - 1][1]); return sh.ppm ? L / sh.ppm : null; }
function snapOrtho(p0, p) {
  const dx = p[0] - p0[0], dy = p[1] - p0[1], t = Math.tan(5 * Math.PI / 180);
  if (Math.abs(dy) < Math.abs(dx) * t) return [p[0], p0[1]];
  if (Math.abs(dx) < Math.abs(dy) * t) return [p0[0], p[1]];
  return p;
}

// ---------------------------------------------------------------- Disegno oggetti (schermo ed esportazione)
function haloText(c, s, x, y, size, color, align) {
  c.save();
  c.font = '700 ' + size + 'px Roboto, "Segoe UI", Arial, sans-serif';
  c.textAlign = align || 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = size * 0.3; c.strokeStyle = 'rgba(255,255,255,0.95)';
  c.strokeText(s, x, y); c.fillStyle = color; c.fillText(s, x, y);
  c.restore();
}
function drawSym(c, sh, o, opt) {
  const d = BY_ID[o.t]; if (!d) return;
  c.save(); c.translate(o.x, o.y); c.rotate((o.rot || 0) * Math.PI / 180);
  c.strokeStyle = d.color; c.fillStyle = d.color; c.lineJoin = 'round'; c.lineCap = 'round';
  if (d.kind === 'pt') { const u = sh.u * (o.sc || 1); c.lineWidth = u * 0.075; d.draw(c, { u, r: u / 2, col: d.color }); }
  else { const [w, hh] = sizePx(sh, o); c.lineWidth = sh.u * 0.045; d.draw(c, { w, h: hh, u: sh.u, col: d.color }); }
  c.restore();
  const { ex, ey } = ext(sh, o);
  const lab = opt.nums && opt.nums.get(o.id);
  if (lab && sh.showNums !== false) haloText(c, lab, o.x + ex + sh.u * 0.04, o.y - ey + sh.u * 0.05, sh.u * 0.32, d.color, 'left');
  if (o.hq !== undefined && o.hq !== null && o.hq !== '') haloText(c, 'h' + o.hq, o.x, o.y + ey + sh.u * 0.22, sh.u * 0.28, '#1e2530', 'center');
}
function drawDim(c, sh, o) {
  const g = dimGeom(sh, o); const u = sh.u;
  c.save(); c.strokeStyle = DIMC; c.lineWidth = u * 0.035; c.lineCap = 'round';
  c.beginPath(); c.moveTo(g.a[0], g.a[1]); c.lineTo(g.b[0], g.b[1]); c.stroke();
  if (o.off) {
    const e = Math.sign(o.off) * u * 0.12;
    c.save(); c.lineWidth = u * 0.022;
    c.beginPath(); c.moveTo(o.x1, o.y1); c.lineTo(g.a[0] + g.nx * e, g.a[1] + g.ny * e); c.moveTo(o.x2, o.y2); c.lineTo(g.b[0] + g.nx * e, g.b[1] + g.ny * e); c.stroke(); c.restore();
  }
  const t = u * 0.16, tx = (g.ux + g.nx) * t, ty = (g.uy + g.ny) * t;
  c.lineWidth = u * 0.06;
  for (const p of [g.a, g.b]) { c.beginPath(); c.moveTo(p[0] - tx, p[1] - ty); c.lineTo(p[0] + tx, p[1] + ty); c.stroke(); }
  let ang = Math.atan2(g.uy, g.ux); if (ang > Math.PI / 2 + 0.01 || ang < -Math.PI / 2 + 0.01) ang += Math.PI;
  const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2;
  c.translate(mx, my); c.rotate(ang);
  haloText(c, dimLabel(sh, o), 0, -u * 0.24, u * 0.34, DIMC, 'center');
  c.restore();
}
function drawLine(c, sh, o, opt) {
  const st = LINES[o.st] || LINES.gen; if (!o.pts || o.pts.length < 2) return;
  c.save(); c.strokeStyle = st.color; c.lineWidth = sh.u * 0.085 * st.w; c.lineJoin = 'round'; c.lineCap = 'round';
  if (st.dash) c.setLineDash(st.dash.map((v) => v * sh.u * 0.13));
  c.beginPath(); c.moveTo(o.pts[0][0], o.pts[0][1]); for (let i = 1; i < o.pts.length; i++) c.lineTo(o.pts[i][0], o.pts[i][1]); c.stroke();
  c.setLineDash([]);
  let best = 1, bl = -1;
  for (let i = 1; i < o.pts.length; i++) { const l = Math.hypot(o.pts[i][0] - o.pts[i - 1][0], o.pts[i][1] - o.pts[i - 1][1]); if (l > bl) { bl = l; best = i; } }
  const a = o.pts[best - 1], b = o.pts[best], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const lab = opt.nums && opt.nums.get(o.id);
  const tag = [st.tag, sh.showNums !== false ? lab : ''].filter(Boolean).join(' · ');
  if (tag) {
    const fs = sh.u * 0.26; c.font = '700 ' + fs + 'px Roboto, Arial, sans-serif';
    const w = c.measureText(tag).width + fs * 0.8, hh = fs * 1.35;
    c.fillStyle = st.color; c.strokeStyle = '#fff'; c.lineWidth = fs * 0.15;
    c.beginPath(); c.rect(mx - w / 2, my - hh / 2, w, hh); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(tag, mx, my + fs * 0.04);
  }
  c.restore();
}
function drawText(c, sh, o) {
  const e = ext(sh, o); const ls = String(o.tx || '').split('\n');
  ls.forEach((l, i) => haloText(c, l, o.x, o.y + i * e.sz * 1.2, e.sz, '#18202c', 'left'));
}
const LAYER = (sh, o) => o.k === 'line' ? 0 : o.k === 'sym' ? (BY_ID[o.t] && BY_ID[o.t].kind === 'sz' ? 1 : 3) : o.k === 'dim' ? 2 : 4;
function sortedObjs(sh) { return sh.objs.map((o, i) => [o, i]).sort((a, b) => LAYER(sh, a[0]) - LAYER(sh, b[0]) || a[1] - b[1]).map((x) => x[0]); }
function drawObjects(c, sh, opt) {
  for (const o of sortedObjs(sh)) {
    if (o.k === 'sym') drawSym(c, sh, o, opt);
    else if (o.k === 'dim') drawDim(c, sh, o);
    else if (o.k === 'line') drawLine(c, sh, o, opt);
    else if (o.k === 'text') drawText(c, sh, o);
  }
}
function symIcon(id, size, cv) {
  cv = cv || document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d'); c.clearRect(0, 0, size, size);
  const d = BY_ID[id]; if (!d) return cv;
  c.save(); c.translate(size / 2, size / 2); c.strokeStyle = d.color; c.fillStyle = d.color; c.lineJoin = 'round'; c.lineCap = 'round';
  if (d.kind === 'pt') { const u = size * 0.8; c.lineWidth = u * 0.075; d.draw(c, { u, r: u / 2, col: d.color }); }
  else {
    const m = size * 0.84, k = m / Math.max(d.w, d.h); const w = d.w * k, hh = Math.max(d.h * k, size * 0.12);
    c.lineWidth = Math.max(1, size * 0.028); d.draw(c, { w, h: hh, u: size * 0.55, col: d.color });
  }
  c.restore(); return cv;
}
function lineIcon(st, size, cv) {
  cv = cv || document.createElement('canvas'); cv.width = size * 2; cv.height = size * 0.5;
  const c = cv.getContext('2d'); const s = LINES[st]; c.strokeStyle = s.color; c.lineWidth = size * 0.08 * s.w; c.lineCap = 'round';
  if (s.dash) c.setLineDash(s.dash.map((v) => v * size * 0.12));
  c.beginPath(); c.moveTo(size * 0.1, size * 0.25); c.lineTo(size * 1.9, size * 0.25); c.stroke(); return cv;
}

// ---------------------------------------------------------------- Canvas editor
const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
let dpr = 1, raf = 0;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const r = stage.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  draw();
}
new ResizeObserver(resize).observe(stage);
function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
function paint() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  const sh = S.sheet; if (!sh) return;
  const v = S.view;
  ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.tx, dpr * v.ty);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 12 / v.s; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sh.W, sh.H); ctx.restore();
  if (S.img) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(S.img, 0, 0, sh.W, sh.H); }
  drawObjects(ctx, sh, { nums: S.nums });
  if (S.sel) drawSelection(S.sel);
  drawDraft();
}
function drawSelection(o) {
  const sh = S.sheet, s = S.view.s; const c = ctx;
  c.save(); c.lineWidth = 2.5 / s; c.strokeStyle = '#16233a'; c.setLineDash([7 / s, 5 / s]);
  const hand = (x, y) => { c.save(); c.setLineDash([]); c.beginPath(); c.arc(x, y, 9 / s, 0, 7); c.fillStyle = '#f2b705'; c.fill(); c.lineWidth = 2 / s; c.strokeStyle = '#16233a'; c.stroke(); c.restore(); };
  if (o.k === 'sym') { const { ex, ey } = ext(sh, o); const p = 6 / s; c.strokeRect(o.x - ex - p, o.y - ey - p, 2 * (ex + p), 2 * (ey + p)); c.strokeStyle = '#f2b705'; c.lineDashOffset = 6 / s; c.strokeRect(o.x - ex - p, o.y - ey - p, 2 * (ex + p), 2 * (ey + p)); }
  else if (o.k === 'text') { const e = ext(sh, o); c.strokeRect(o.x - 4 / s, o.y - e.sz * 0.7, e.w + 8 / s, e.h + 4 / s); }
  else if (o.k === 'dim') { hand(o.x1, o.y1); hand(o.x2, o.y2); }
  else if (o.k === 'line') { c.setLineDash([]); o.pts.forEach((p) => hand(p[0], p[1])); }
  c.restore();
}
function drawDraft() {
  const d = S.draft; if (!d) return; const s = S.view.s, c = ctx;
  const mark = (p) => { c.save(); c.strokeStyle = '#d6336c'; c.lineWidth = 2.5 / s; c.beginPath(); c.moveTo(p[0] - 12 / s, p[1]); c.lineTo(p[0] + 12 / s, p[1]); c.moveTo(p[0], p[1] - 12 / s); c.lineTo(p[0], p[1] + 12 / s); c.stroke(); c.restore(); };
  if (d.k === 'line') {
    const st = LINES[S.lineStyle];
    c.save(); c.strokeStyle = st.color; c.lineWidth = S.sheet.u * 0.085 * st.w; c.globalAlpha = 0.75; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); d.pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); c.restore();
    d.pts.forEach(mark);
  } else if (d.p) mark(d.p);
}
const toW = (p) => [(p.x - S.view.tx) / S.view.s, (p.y - S.view.ty) / S.view.s];
function fit() {
  const sh = S.sheet; if (!sh) return; const r = stage.getBoundingClientRect();
  const s = Math.min((r.width - 24) / sh.W, (r.height - 24) / sh.H);
  S.view = { s, tx: (r.width - sh.W * s) / 2, ty: (r.height - sh.H * s) / 2 }; draw();
}
function zoomAt(f, cx, cy) {
  const r = stage.getBoundingClientRect(); if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
  const v = S.view, ns = clamp(v.s * f, minScale(), 12);
  const wx = (cx - v.tx) / v.s, wy = (cy - v.ty) / v.s;
  S.view = { s: ns, tx: cx - wx * ns, ty: cy - wy * ns }; draw();
}
function minScale() { const sh = S.sheet; if (!sh) return 0.01; const r = stage.getBoundingClientRect(); return Math.min(r.width / sh.W, r.height / sh.H) * 0.4; }

// hit test
function hitObj(w) {
  const sh = S.sheet, tol = 14 / S.view.s; const list = sortedObjs(sh).reverse();
  for (const o of list) {
    if (o.k === 'sym') {
      const d = BY_ID[o.t];
      if (d && d.kind === 'sz') {
        const [ww, hh] = sizePx(sh, o); const a = -(o.rot || 0) * Math.PI / 180; const dx = w[0] - o.x, dy = w[1] - o.y;
        const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(lx) <= ww / 2 + tol && Math.abs(ly) <= hh / 2 + tol) return o;
      } else { const { ex, ey } = ext(sh, o); if (Math.abs(w[0] - o.x) <= ex + tol && Math.abs(w[1] - o.y) <= ey + tol) return o; }
    } else if (o.k === 'dim') {
      const g = dimGeom(sh, o); if (distSeg(w, g.a, g.b) < tol + sh.u * 0.3) return o;
    } else if (o.k === 'line') {
      for (let i = 1; i < o.pts.length; i++) if (distSeg(w, o.pts[i - 1], o.pts[i]) < tol + sh.u * 0.1) return o;
    } else if (o.k === 'text') {
      const e = ext(sh, o); if (w[0] >= o.x - tol && w[0] <= o.x + e.w + tol && w[1] >= o.y - e.sz && w[1] <= o.y + e.h + tol) return o;
    }
  }
  return null;
}
function hitHandle(w) {
  const o = S.sel; if (!o) return null; const tol = 22 / S.view.s;
  if (o.k === 'dim') { if (Math.hypot(w[0] - o.x1, w[1] - o.y1) < tol) return { kind: 'h', i: 0 }; if (Math.hypot(w[0] - o.x2, w[1] - o.y2) < tol) return { kind: 'h', i: 1 }; }
  if (o.k === 'line') for (let i = 0; i < o.pts.length; i++) if (Math.hypot(w[0] - o.pts[i][0], w[1] - o.pts[i][1]) < tol) return { kind: 'h', i };
  return null;
}
function applyDrag(dr, w) {
  const o = S.sel;
  if (dr.kind === 'move') {
    const dx = w[0] - dr.w0[0], dy = w[1] - dr.w0[1], g = dr.orig;
    if (o.k === 'sym' || o.k === 'text') { o.x = g.x + dx; o.y = g.y + dy; }
    else if (o.k === 'dim') { o.x1 = g.x1 + dx; o.y1 = g.y1 + dy; o.x2 = g.x2 + dx; o.y2 = g.y2 + dy; }
    else if (o.k === 'line') o.pts = g.pts.map((p) => [p[0] + dx, p[1] + dy]);
  } else if (dr.kind === 'h') {
    if (o.k === 'dim') {
      if (dr.i === 0) { const p = snapOrtho([o.x2, o.y2], w); o.x1 = p[0]; o.y1 = p[1]; } else { const p = snapOrtho([o.x1, o.y1], w); o.x2 = p[0]; o.y2 = p[1]; }
    } else if (o.k === 'line') {
      const ref = o.pts[dr.i - 1] || o.pts[dr.i + 1]; o.pts[dr.i] = ref ? snapOrtho(ref, w) : w;
    }
  }
}

// pointer
const ptrs = new Map(); let G = null;
const ptOf = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
cv.addEventListener('pointerdown', (e) => {
  if (!S.sheet) return;
  try { cv.setPointerCapture(e.pointerId); } catch (_) { /* */ }
  const p = ptOf(e); ptrs.set(e.pointerId, p);
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    G = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: { ...S.view } };
    return;
  }
  if (ptrs.size > 2) return;
  G = { type: 'pending', s: p, last: p, moved: false };
  const w = toW(p);
  if (S.sel && (S.tool === 'pan' || S.tool === 'sym')) {
    const hnd = hitHandle(w);
    if (hnd) G.drag = hnd;
    else if (hitObj(w) === S.sel) G.drag = { kind: 'move', w0: w, orig: clone(S.sel) };
  }
});
cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  const p = ptOf(e); ptrs.set(e.pointerId, p);
  if (G && G.type === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0 = G.v0;
    const s = clamp(v0.s * d / G.d0, minScale(), 12);
    const wx = (G.c0.x - v0.tx) / v0.s, wy = (G.c0.y - v0.ty) / v0.s;
    S.view = { s, tx: c.x - wx * s, ty: c.y - wy * s }; draw(); return;
  }
  if (!G || G.type !== 'pending') return;
  if (!G.moved && Math.hypot(p.x - G.s.x, p.y - G.s.y) > 8) { G.moved = true; if (G.drag) { pushUndo(); } }
  if (G.moved) {
    if (G.drag) applyDrag(G.drag, toW(p));
    else { S.view.tx += p.x - G.last.x; S.view.ty += p.y - G.last.y; }
    draw();
  }
  G.last = p;
});
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return;
  const p = ptOf(e); ptrs.delete(e.pointerId);
  if (G && G.type === 'pinch') {
    if (ptrs.size === 1) { const q = [...ptrs.values()][0]; G = { type: 'pending', s: q, last: q, moved: true }; } else G = null;
    return;
  }
  if (G && G.type === 'pending') {
    if (!G.moved && e.type === 'pointerup') onTap(toW(p));
    else if (G.drag && G.moved) { changed(); renderPanel(); }
  }
  G = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = ptOf(e); zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
$('#zIn').onclick = () => zoomAt(1.4); $('#zOut').onclick = () => zoomAt(1 / 1.4); $('#zFit').onclick = fit;

// undo
function snapshot() { return JSON.stringify({ objs: S.sheet.objs, ppm: S.sheet.ppm }); }
function pushUndo() { if (!S.sheet) return; S.undo.push(snapshot()); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function restore(st) { const v = JSON.parse(st); S.sheet.objs = v.objs; S.sheet.ppm = v.ppm; select(null); changed(); }
function undo() { if (!S.undo.length) { toast('Niente da annullare'); return; } S.redo.push(snapshot()); restore(S.undo.pop()); }
function redo() { if (!S.redo.length) { toast('Niente da ripetere'); return; } S.undo.push(snapshot()); restore(S.redo.pop()); }
$('#btnUndo').onclick = undo;

function changed() { refreshNums(); draw(); saveSoon(); }

// ---------------------------------------------------------------- Strumenti
function setTool(t) {
  if (t !== S.tool) S.draft = null;
  S.tool = t;
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === t || (t === 'cal' && b.dataset.tool === 'dim')));
  renderCtx(); draw();
}
document.querySelectorAll('.tool').forEach((b) => b.onclick = () => {
  const t = b.dataset.tool;
  if (t === 'sym') { if (S.tool === 'sym' || !S.sym) openPalette(); else setTool('sym'); return; }
  setTool(t);
});
function setHint(msg) { const el = $('#hint'); el.hidden = !msg; el.textContent = msg || ''; }
function renderCtx() {
  const bar = $('#ctxbar'); bar.innerHTML = ''; bar.hidden = true; setHint('');
  if (!S.sheet) return;
  const t = S.tool;
  if (t === 'sym' && S.sym) {
    const d = BY_ID[S.sym];
    const ic = symIcon(S.sym, 80); ic.style.cssText = 'width:38px;height:38px;background:#fff;border-radius:7px;border:1px solid var(--line)';
    bar.append(ic, h('div', { class: 'grow' }, h('b', {}, d.name), h('div', { style: 'font-size:12.5px;color:var(--mute)' }, 'Tocca la pianta per inserire')),
      h('button', { class: 'btn sm', onclick: openPalette }, 'Cambia'));
    bar.hidden = false;
  } else if (t === 'line') {
    const chips = h('div', { class: 'chips', style: 'width:100%' }, Object.entries(LINES).map(([k, s]) =>
      h('button', { class: 'chip' + (S.lineStyle === k ? ' on' : ''), onclick: () => { S.lineStyle = k; renderCtx(); draw(); } }, h('i', { class: 'sw', style: { background: s.color } }), s.name)));
    const n = S.draft ? S.draft.pts.length : 0;
    bar.append(chips, h('div', { class: 'grow', style: 'font-size:13px;color:var(--mute)' }, n ? n + ' punti — tocca per aggiungerne' : 'Tocca i vertici del tracciato'),
      h('button', { class: 'btn sm', disabled: !n, onclick: () => { S.draft.pts.pop(); if (!S.draft.pts.length) S.draft = null; renderCtx(); draw(); } }, 'Togli punto'),
      h('button', { class: 'btn sm primary', disabled: n < 2, onclick: finishLine }, icon('check'), 'Fine'));
    bar.hidden = false;
  } else if (t === 'dim') {
    setHint(S.draft ? 'Tocca il secondo punto della quota' : 'Tocca il primo punto della quota');
    if (!S.sheet.ppm) { bar.append(h('div', { class: 'grow', style: 'font-size:13px' }, 'Scala non impostata: le misure andranno scritte a mano.'), h('button', { class: 'btn sm', onclick: scaleDialog }, 'Imposta scala')); bar.hidden = false; }
  } else if (t === 'cal') {
    setHint(S.draft ? 'Tocca il secondo estremo della misura nota' : 'Tocca il primo estremo di una misura nota');
    bar.append(h('div', { class: 'grow', style: 'font-size:13px' }, 'Calibrazione scala: scegli un lato di cui conosci la lunghezza.'), h('button', { class: 'btn sm', onclick: () => setTool('pan') }, 'Annulla'));
    bar.hidden = false;
  } else if (t === 'text') setHint('Tocca dove scrivere il testo');
}
function newObjBase() { return { id: uid(), r: S.room || '' }; }
async function onTap(w) {
  const sh = S.sheet; const t = S.tool;
  if (t === 'pan') { select(hitObj(w)); return; }
  if (t === 'sym') {
    const d = BY_ID[S.sym]; if (!d) return;
    pushUndo();
    const o = Object.assign(newObjBase(), { k: 'sym', t: d.id, x: w[0], y: w[1], rot: 0 });
    if (d.kind === 'sz') { o.w = d.w; o.h = d.h; }
    sh.objs.push(o); changed(); select(o, false); return;
  }
  if (t === 'line') {
    if (!S.draft) S.draft = { k: 'line', pts: [w] };
    else { const last = S.draft.pts[S.draft.pts.length - 1]; S.draft.pts.push(snapOrtho(last, w)); }
    renderCtx(); draw(); return;
  }
  if (t === 'dim' || t === 'cal') {
    if (!S.draft) { S.draft = { k: t, p: w }; renderCtx(); draw(); return; }
    const p1 = S.draft.p, p2 = snapOrtho(p1, w); S.draft = null; renderCtx(); draw();
    const Lpx = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); if (Lpx < 2) return;
    if (t === 'cal') {
      const v = await formDlg('Misura nota', [{ id: 'm', label: 'Lunghezza reale in metri', type: 'text', inputmode: 'decimal', placeholder: 'es. 3,60', required: true }], 'Imposta scala',
        'Hai tracciato un segmento: scrivi quanto misura nella realtà.');
      if (v) {
        const m = parseFloat(String(v.m).replace(',', '.'));
        if (m > 0) { pushUndo(); sh.ppm = Lpx / m; sh.ratio = null; changed(); renderPanel(); toast('Scala impostata: 1 m = ' + Math.round(sh.ppm) + ' px'); }
        else toast('Valore non valido');
      }
      setTool('pan'); return;
    }
    const o = Object.assign(newObjBase(), { k: 'dim', x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], off: 0, v: '' });
    if (!sh.ppm) {
      const v = await formDlg('Valore della quota', [{ id: 'v', label: 'Misura (es. 3,45 oppure h 2,70)', placeholder: '3,45' }], 'Inserisci');
      if (v === null) return; o.v = v.v;
    }
    pushUndo(); sh.objs.push(o); changed(); select(o, false); return;
  }
  if (t === 'text') {
    const v = await formDlg('Testo sulla pianta', [{ id: 'tx', label: 'Testo', type: 'textarea', required: true }], 'Inserisci');
    if (!v) return;
    pushUndo(); const o = Object.assign(newObjBase(), { k: 'text', x: w[0], y: w[1], tx: v.tx, sc: 1 }); sh.objs.push(o); changed(); select(o, true);
  }
}
function finishLine() {
  if (!S.draft || S.draft.pts.length < 2) return;
  pushUndo();
  const o = Object.assign(newObjBase(), { k: 'line', st: S.lineStyle, pts: S.draft.pts, n: '' });
  S.sheet.objs.push(o); S.draft = null; changed(); renderCtx(); select(o, false);
}

// ---------------------------------------------------------------- Palette simboli
function updateSymToolIcon() { const c = $('#symIco'); if (S.sym) symIcon(S.sym, 44, c); else { const x = c.getContext('2d'); x.clearRect(0, 0, 44, 44); x.strokeStyle = '#9aa6bb'; x.lineWidth = 3; x.strokeRect(10, 10, 24, 24); } }
function openPalette() {
  let scrim, sh;
  const close = () => { scrim.remove(); sh.remove(); const i = openLayers.indexOf(entry); if (i >= 0) openLayers.splice(i, 1); };
  const entry = { close };
  const grid = h('div', { class: 'symgrid' });
  const tabs = h('div', { class: 'tabs' });
  const search = h('input', { type: 'search', placeholder: 'Cerca simbolo (es. presa, radiatore, wc)', style: 'width:100%;min-height:44px;border:1px solid var(--line);background:var(--bg);border-radius:9px;padding:8px 12px;font-size:16px' });
  const cats = [['R', 'Recenti', '#888']].concat(Object.entries(CAT).map(([k, c]) => [k, c.name, c.color]));
  const fill = () => {
    tabs.innerHTML = '';
    for (const [k, n, col] of cats) {
      if (k === 'R' && !S.recent.length) continue;
      tabs.append(h('button', { class: S.symCat === k ? 'on' : '', onclick: () => { S.symCat = k; search.value = ''; fill(); } }, h('i', { class: 'dot', style: { background: col } }), n));
    }
    grid.innerHTML = '';
    const q = search.value.trim().toLowerCase();
    let list = q ? LIST.filter((s) => s.name.toLowerCase().includes(q)) : S.symCat === 'R' ? S.recent.map((id) => BY_ID[id]) : LIST.filter((s) => s.cat === S.symCat);
    if (!list.length) grid.append(h('p', { style: 'color:var(--mute)' }, 'Nessun simbolo trovato.'));
    for (const s of list) {
      const ic = symIcon(s.id, 92);
      grid.append(h('button', { class: 'symbtn' + (S.sym === s.id ? ' on' : ''), onclick: () => {
        S.sym = s.id; S.recent = [s.id].concat(S.recent.filter((x) => x !== s.id)).slice(0, 12); settings.set('recent', S.recent.join(','));
        updateSymToolIcon(); close(); setTool('sym');
      } }, ic, s.name + (s.kind === 'sz' ? ' · ' + s.w + '×' + s.h : '')));
    }
  };
  if (S.symCat === 'R' && !S.recent.length) S.symCat = 'E';
  search.oninput = fill;
  scrim = h('div', { class: 'scrim', onclick: close });
  sh = h('div', { class: 'sheet', role: 'dialog', style: 'height:78vh' }, h('div', { class: 'grab' }),
    h('div', { class: 'sheet-head' }, h('h2', {}, 'Scegli simbolo'), h('button', { class: 'iconbtn', onclick: close, 'aria-label': 'Chiudi' }, icon('close'))),
    h('div', { class: 'symsearch' }, search), tabs, h('div', { class: 'sheet-body', style: 'flex:1' }, grid));
  fill(); layer.append(scrim, sh); openLayers.push(entry);
}

// ---------------------------------------------------------------- Pannello oggetto selezionato
const objpanel = h('div', { id: 'objpanel', class: 'objpanel', hidden: true });
document.head.append(h('style', {}, `
.objpanel{background:var(--surface);color:var(--fg);border-top:1px solid var(--line);display:flex;flex-direction:column;max-height:46vh;z-index:4;box-shadow:0 -4px 14px rgba(0,0,0,.08)}
.objpanel .pbody{overflow:auto;padding:0 14px 14px}
@media (min-width:820px){.objpanel{position:absolute;right:12px;top:64px;width:380px;max-height:calc(100% - 140px);border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.2)} .objpanel .objhead{padding-top:10px}}
`));
function select(o, open) {
  S.sel = o || null; S.editSnap = false;
  if (open !== undefined) S.panelOpen = open;
  renderPanel(); draw();
}
function editBegin() { if (!S.editSnap) { pushUndo(); S.editSnap = true; } }
function stepper(val, fmt, onStep) {
  const out = h('output', {}, fmt(val));
  return h('div', { class: 'stepper' }, h('button', { class: 'btn sm', onclick: () => out.textContent = fmt(onStep(-1)) }, '−'), out, h('button', { class: 'btn sm', onclick: () => out.textContent = fmt(onStep(1)) }, '+'));
}
function roomSelect(o) {
  const sel = h('select', { id: 'f_room' }, h('option', { value: '' }, '— nessuna —'), S.proj.rooms.map((r) => h('option', { value: r, selected: o.r === r }, r)), h('option', { value: '__new' }, '+ Nuova stanza…'));
  sel.onchange = async () => {
    if (sel.value === '__new') { const r = await askNewRoom(); if (r) { editBegin(); o.r = r; } renderPanel(); }
    else { editBegin(); o.r = sel.value; saveSoon(); renderPanel(); }
  };
  return h('div', { class: 'field' }, h('label', { for: 'f_room' }, 'Stanza'), sel);
}
function photoBlock(o) {
  const grid = h('div', { class: 'photos' });
  (o.ph || []).forEach((id, i) => {
    const d = h('button', { class: 'ph', 'aria-label': 'Foto ' + (i + 1), onclick: () => viewPhoto(o, id) }, h('b', {}, String(i + 1)));
    fileURL(id).then((u) => { d.style.backgroundImage = 'url(' + u + ')'; });
    grid.append(d);
  });
  grid.append(h('button', { class: 'addph', onclick: () => addPhotos(o, 'cam') }, icon('cam'), 'Scatta'), h('button', { class: 'addph', onclick: () => addPhotos(o, 'gal') }, icon('gal'), 'Galleria'));
  return h('div', { class: 'field' }, h('label', {}, 'Foto'), grid);
}
function renderPanel() {
  const o = S.sel; objpanel.innerHTML = '';
  if (!o || !S.sheet) { objpanel.hidden = true; return; }
  objpanel.hidden = false;
  const sh = S.sheet; let title, sub = '', ic = null;
  const lab = S.nums.get(o.id);
  if (o.k === 'sym') { const d = BY_ID[o.t]; title = d ? d.name : o.t; sub = CAT[d.cat].name; ic = symIcon(o.t, 80); ic.className = 'ico'; }
  else if (o.k === 'dim') { title = 'Quota ' + dimLabel(sh, o) + (o.v ? '' : (sh.ppm ? ' m' : '')); sub = o.v ? 'valore scritto a mano' : sh.ppm ? 'misurata dalla scala' : ''; }
  else if (o.k === 'line') { const st = LINES[o.st] || LINES.gen; title = 'Tracciato: ' + st.name; const L = lineLen(sh, o); sub = L != null ? 'lunghezza ' + fmtM(L) + ' m' : o.pts.length + ' vertici'; ic = lineIcon(o.st, 40); ic.className = 'ico'; ic.style.cssText = 'width:40px;height:40px;object-fit:contain;padding:12px 2px'; }
  else if (o.k === 'text') { title = 'Testo'; sub = String(o.tx).split('\n')[0]; }
  if (o.r && o.k !== 'dim' && o.k !== 'text') sub = o.r + (sub ? ' · ' + sub : '');
  objpanel.append(h('div', { class: 'grab', style: 'width:36px;height:4px;border-radius:2px;background:var(--line);margin:6px auto 4px' }),
    h('div', { class: 'objhead' }, ic, h('div', { class: 'nm' }, h('b', {}, title), h('span', {}, sub)), lab ? h('span', { class: 'numtag' }, lab) : null,
      h('button', { class: 'iconbtn', 'aria-label': S.panelOpen ? 'Riduci' : 'Dettagli', onclick: () => { S.panelOpen = !S.panelOpen; renderPanel(); } }, icon(S.panelOpen ? 'down' : 'up')),
      h('button', { class: 'iconbtn', 'aria-label': 'Deseleziona', onclick: () => select(null) }, icon('close'))));
  const quick = h('div', { class: 'quick' });
  if (o.k === 'sym' || o.k === 'line') quick.append(h('button', { class: 'btn sm', onclick: () => addPhotos(o, 'cam') }, icon('cam'), 'Foto' + (o.ph && o.ph.length ? ' (' + o.ph.length + ')' : '')));
  if (o.k === 'sym') quick.append(h('button', { class: 'btn sm', onclick: () => { editBegin(); o.rot = ((o.rot || 0) + 90) % 360; changed(); } }, icon('rot'), '90°'));
  if (!S.panelOpen && (o.k === 'sym' || o.k === 'line')) quick.append(h('button', { class: 'btn sm', onclick: () => { S.panelOpen = true; renderPanel(); setTimeout(() => { const n = $('#f_note'); if (n) n.focus(); }, 50); } }, 'Note e altezza'));
  if (o.k === 'sym' || o.k === 'text') quick.append(h('button', { class: 'btn sm', onclick: () => duplicate(o) }, icon('copy'), 'Duplica'));
  quick.append(h('button', { class: 'btn sm danger', onclick: () => { pushUndo(); S.sheet.objs = S.sheet.objs.filter((x) => x !== o); select(null); changed(); toast('Eliminato · tocca Annulla per recuperarlo'); } }, icon('trash'), 'Elimina'));
  objpanel.append(quick);
  if (!S.panelOpen) return;
  const body = h('div', { class: 'pbody' });
  if (o.k === 'sym') {
    const d = BY_ID[o.t];
    body.append(roomSelect(o));
    const hq = h('input', { id: 'f_hq', type: 'number', inputmode: 'numeric', value: o.hq == null ? '' : o.hq, placeholder: d.cat === 'E' ? 'es. 30 / 110' : 'es. 55' });
    hq.oninput = () => { editBegin(); o.hq = hq.value === '' ? null : hq.value; changed(); };
    const rot = stepper(o.rot || 0, (v) => v + '°', (k) => { editBegin(); o.rot = ((o.rot || 0) + k * 15 + 360) % 360; changed(); return o.rot; });
    body.append(h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { for: 'f_hq' }, 'Altezza da pavimento (cm)'), hq), h('div', { class: 'field' }, h('label', {}, 'Rotazione'), rot)));
    if (d.kind === 'sz') {
      const mk = (key, label) => { const i = h('input', { id: 'f_' + key, type: 'number', inputmode: 'numeric', value: o[key] }); i.oninput = () => { const v = parseFloat(i.value); if (v > 0) { editBegin(); o[key] = v; changed(); } }; return h('div', { class: 'field' }, h('label', { for: 'f_' + key }, label), i); };
      body.append(h('div', { class: 'row' }, mk('w', 'Larghezza (cm)'), mk('h', 'Profondità (cm)')));
      if (!sh.ppm) body.append(h('p', { style: 'font-size:12.5px;color:var(--mute);margin:-6px 0 12px' }, 'Imposta la scala della tavola per vedere gli arredi in dimensione reale.'));
    } else {
      body.append(h('div', { class: 'field' }, h('label', {}, 'Dimensione simbolo'), stepper(o.sc || 1, (v) => Math.round(v * 100) + '%', (k) => { editBegin(); o.sc = clamp(Math.round(((o.sc || 1) + k * 0.25) * 100) / 100, 0.5, 3); changed(); return o.sc; })));
    }
  }
  if (o.k === 'line') {
    const sel = h('select', { id: 'f_st' }, Object.entries(LINES).map(([k, s]) => h('option', { value: k, selected: o.st === k }, s.name)));
    sel.onchange = () => { editBegin(); o.st = sel.value; changed(); renderPanel(); };
    body.append(h('div', { class: 'field' }, h('label', { for: 'f_st' }, 'Tipo di tracciato'), sel), roomSelect(o));
  }
  if (o.k === 'sym' || o.k === 'line') {
    const nt = h('textarea', { id: 'f_note', rows: 3, placeholder: o.k === 'sym' ? 'es. radiatore 10 elementi in ghisa, valvola da sostituire' : 'es. multistrato 20×2 sotto traccia' }, o.n || '');
    nt.oninput = () => { editBegin(); o.n = nt.value; changed(); };
    nt.onblur = () => renderPanelHead();
    body.append(h('div', { class: 'field' }, h('label', { for: 'f_note' }, 'Note'), nt), photoBlock(o));
  }
  if (o.k === 'dim') {
    const v = h('input', { id: 'f_v', value: o.v || '', placeholder: sh.ppm ? 'automatica: ' + fmtM(dimGeom(sh, o).L / sh.ppm) : 'es. 3,45' });
    v.oninput = () => { editBegin(); o.v = v.value; changed(); };
    body.append(h('div', { class: 'field' }, h('label', { for: 'f_v' }, sh.ppm ? 'Valore (lascia vuoto per la misura automatica)' : 'Valore'), v),
      h('div', { class: 'field' }, h('label', {}, 'Distanza della linea di quota'), stepper(o.off || 0, (x) => (x > 0 ? '+' : '') + x, (k) => { editBegin(); o.off = clamp((o.off || 0) + k * 0.5, -6, 6); changed(); return o.off; })));
  }
  if (o.k === 'text') {
    const t = h('textarea', { id: 'f_tx', rows: 3 }, o.tx || '');
    t.oninput = () => { editBegin(); o.tx = t.value; changed(); };
    body.append(h('div', { class: 'field' }, h('label', { for: 'f_tx' }, 'Testo'), t),
      h('div', { class: 'field' }, h('label', {}, 'Dimensione'), stepper(o.sc || 1, (v) => Math.round(v * 100) + '%', (k) => { editBegin(); o.sc = clamp(Math.round(((o.sc || 1) + k * 0.25) * 100) / 100, 0.5, 4); changed(); return o.sc; })));
  }
  objpanel.append(body);
}
function renderPanelHead() { const ae = document.activeElement; if (ae && objpanel.contains(ae)) return; renderPanel(); }
function duplicate(o) {
  pushUndo(); const c = clone(o); c.id = uid(); c.ph = []; c.n = ''; const off = S.sheet.u * 1.2;
  if (c.k === 'sym' || c.k === 'text') { c.x += off; c.y += off * 0.3; }
  S.sheet.objs.push(c); changed(); select(c);
}
async function compressImage(file, max = 1600, q = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
  } finally { URL.revokeObjectURL(url); }
}
async function addPhotos(o, src) {
  const files = await pickFile(src === 'cam' ? $('#fileCam') : $('#fileGal'));
  if (!files.length) return;
  const b = busy('Salvo le foto…');
  try {
    editBegin(); o.ph = o.ph || [];
    for (const f of files) { const blob = await compressImage(f); o.ph.push(await putFile(S.proj.id, blob, 'photo')); }
    changed(); S.panelOpen = true; renderPanel(); toast(files.length === 1 ? 'Foto aggiunta' : files.length + ' foto aggiunte');
  } catch (e) { toast('Impossibile leggere la foto'); console.error(e); } finally { b.close(); }
}
async function viewPhoto(o, id) {
  const u = await fileURL(id); let v;
  const close = () => { v.remove(); const i = openLayers.indexOf(entry); if (i >= 0) openLayers.splice(i, 1); };
  const entry = { close };
  v = h('div', { class: 'viewer' }, h('div', { class: 'vbar' },
    h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg('Eliminare la foto?', 'La foto verrà tolta da questo elemento.', 'Elimina', true)) { editBegin(); o.ph = o.ph.filter((x) => x !== id); changed(); renderPanel(); close(); } } }, icon('trash'), 'Elimina'),
    h('button', { class: 'iconbtn', style: 'color:#fff', onclick: close, 'aria-label': 'Chiudi' }, icon('close'))), h('img', { src: u, alt: 'Foto' }));
  document.body.append(v); openLayers.push(entry);
}

// ---------------------------------------------------------------- Stanze
async function askNewRoom() {
  const used = new Set(S.proj.rooms);
  let input;
  const v = await dialog({
    title: 'Nuova stanza',
    body: (close) => {
      input = h('input', { id: 'f_newroom', placeholder: 'Nome stanza', autocomplete: 'off' });
      return h('form', { onsubmit: (e) => { e.preventDefault(); close(input.value); } },
        h('div', { class: 'field' }, h('label', { for: 'f_newroom' }, 'Nome'), input),
        h('div', { class: 'chips', style: 'flex-wrap:wrap' }, ROOM_SUGG.filter((r) => !used.has(r)).map((r) => h('button', { type: 'button', class: 'chip', onclick: () => close(r) }, r))));
    },
    buttons: [{ label: 'Annulla', value: null }, { label: 'Aggiungi', cls: 'primary', value: () => input.value }]
  });
  const name = (v || '').trim(); if (!name) return null;
  if (!S.proj.rooms.includes(name)) S.proj.rooms.push(name);
  saveSoon(); return name;
}
function updateRoomChip() { $('#tRoom').textContent = S.room || 'Nessuna stanza'; }
$('#btnRoom').onclick = async () => {
  const items = [{ label: 'Nessuna stanza', value: '' , on: !S.room }].concat(S.proj.rooms.map((r) => ({ label: r, value: r, on: S.room === r, sub: countRoom(r) })));
  const v = await pickList('Stanza corrente', items, (close) => h('div', { style: 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap' },
    h('button', { class: 'btn primary sm', onclick: async () => { close(undefined); const r = await askNewRoom(); if (r) { S.room = r; updateRoomChip(); } } }, icon('plus'), 'Nuova stanza'),
    S.proj.rooms.length ? h('button', { class: 'btn sm', onclick: async () => { close(undefined); manageRooms(); } }, 'Rinomina / elimina') : null));
  if (v === null || v === undefined) return;
  S.room = v; updateRoomChip(); toast(v ? 'I nuovi elementi andranno in: ' + v : 'I nuovi elementi non avranno stanza');
};
function countRoom(r) { let n = 0; for (const sh of S.proj.sheets) for (const o of sh.objs) if (o.r === r && o.k !== 'dim' && o.k !== 'text') n++; return n ? n + ' elementi' : ''; }
async function manageRooms() {
  const r = await pickList('Gestisci stanze', S.proj.rooms.map((x) => ({ label: x, value: x, sub: countRoom(x) })));
  if (!r) return;
  const act = await dialog({ title: r, body: null, buttons: [{ label: 'Chiudi', value: null }, { label: 'Elimina', value: 'del', cls: 'danger' }, { label: 'Rinomina', value: 'ren', cls: 'primary' }] });
  if (act === 'ren') {
    const v = await formDlg('Rinomina stanza', [{ id: 'n', label: 'Nuovo nome', value: r, required: true }]);
    if (!v) return; const nn = v.n.trim();
    S.proj.rooms = S.proj.rooms.map((x) => x === r ? nn : x); for (const sh of S.proj.sheets) for (const o of sh.objs) if (o.r === r) o.r = nn;
    if (S.room === r) S.room = nn;
  } else if (act === 'del') {
    if (!(await confirmDlg('Eliminare la stanza?', 'Gli elementi resteranno sulla pianta ma senza stanza.', 'Elimina', true))) return;
    S.proj.rooms = S.proj.rooms.filter((x) => x !== r); for (const sh of S.proj.sheets) for (const o of sh.objs) if (o.r === r) o.r = '';
    if (S.room === r) S.room = '';
  }
  updateRoomChip(); renderPanel(); saveSoon();
}

// ---------------------------------------------------------------- Tavole (planimetrie)
const A3 = [1190.55, 841.89];
function defaultU(W, H) { return Math.max(W, H) / 70; }
async function canvasToBlob(c, type, q) { return new Promise((res) => c.toBlob(res, type, q)); }
async function renderPdfPage(page, maxSide) {
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min(maxSide / Math.max(vp1.width, vp1.height), 5);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: x, viewport: vp }).promise;
  return { c, vp1 };
}
async function addSheetFlow() {
  const choice = await pickList('Aggiungi planimetria', [
    { label: 'PDF o immagine dal telefono', sub: 'Planimetria catastale, progetto, scansione', value: 'file' },
    { label: 'Foto di una pianta cartacea', sub: 'Usa la fotocamera', value: 'cam' },
    { label: 'Foglio quadrettato', sub: 'A3 orizzontale in scala 1:50, per schizzi senza planimetria', value: 'blank' }
  ]);
  if (!choice) return;
  if (choice === 'blank') return addBlankSheet();
  const files = await pickFile(choice === 'cam' ? $('#fileCam') : $('#fileAny'), choice === 'cam' ? null : 'application/pdf,image/*');
  if (!files.length) return;
  const f = files[0];
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return addPdfSheets(f);
  return addImageSheet(f);
}
async function addPdfSheets(f) {
  let b = busy('Apro il PDF…'); let pdf, bytes;
  try { bytes = await f.arrayBuffer(); pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise; }
  catch (e) { b.close(); toast('Impossibile aprire il PDF: ' + (e.message || e)); return; }
  b.close();
  let pages = [0];
  const base = f.name.replace(/\.pdf$/i, '');
  if (pdf.numPages > 1) {
    const box = h('div', { class: 'pages' });
    const n = Math.min(pdf.numPages, 40);
    for (let i = 0; i < n; i++) {
      const c = h('canvas', {}); const cb = h('input', { type: 'checkbox', value: i, checked: i === 0 });
      box.append(h('label', {}, c, h('span', { class: 'check', style: 'min-height:0' }, cb, 'Pag. ' + (i + 1))));
      pdf.getPage(i + 1).then(async (pg) => { const vp = pg.getViewport({ scale: 1 }); const k = 200 / Math.max(vp.width, vp.height); const v2 = pg.getViewport({ scale: k }); c.width = v2.width; c.height = v2.height; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: v2 }).promise; });
    }
    const sel = await dialog({ title: 'Quali pagine?', body: h('div', {}, h('p', {}, 'Il PDF ha ' + pdf.numPages + ' pagine. Ogni pagina scelta diventa una tavola.'), box),
      buttons: [{ label: 'Annulla', value: null }, { label: 'Aggiungi', cls: 'primary', value: () => [...box.querySelectorAll('input:checked')].map((x) => +x.value) }] });
    if (!sel || !sel.length) return;
    pages = sel;
  }
  b = busy('Preparo la planimetria…');
  try {
    const srcId = await putFile(S.proj.id, new Blob([bytes], { type: 'application/pdf' }), 'pdf');
    let last;
    for (const i of pages) {
      b.set('Preparo pagina ' + (i + 1) + '…');
      const page = await pdf.getPage(i + 1);
      const { c, vp1 } = await renderPdfPage(page, 3200);
      const baseId = await putFile(S.proj.id, await canvasToBlob(c, 'image/jpeg', 0.9), 'base');
      last = { id: uid(), name: pages.length > 1 || pdf.numPages > 1 ? base + ' – pag. ' + (i + 1) : base, src: 'pdf', srcId, page: i, rot: page.rotate || 0,
        ptW: vp1.width, ptH: vp1.height, W: c.width, H: c.height, baseId, u: defaultU(c.width, c.height), ppm: null, ratio: null, showNums: true, objs: [] };
      S.proj.sheets.push(last);
    }
    await saveNow(); await openSheet(last.id);
    b.close();
    askScaleAfterImport();
  } catch (e) { b.close(); toast('Errore: ' + (e.message || e)); console.error(e); }
}
async function addImageSheet(f) {
  const b = busy('Preparo l\'immagine…');
  try {
    const blob = await compressImage(f, 3200, 0.9);
    const bmp = await createImageBitmap(blob);
    const W = bmp.width, H = bmp.height; const land = W >= H;
    const ptW = land ? A3[0] : A3[0] * W / H, ptH = land ? A3[0] * H / W : A3[0];
    const baseId = await putFile(S.proj.id, blob, 'base');
    const sh = { id: uid(), name: f.name ? f.name.replace(/\.[a-z0-9]+$/i, '') : 'Pianta', src: 'img', ptW, ptH, W, H, baseId, u: defaultU(W, H), ppm: null, ratio: null, showNums: true, objs: [] };
    S.proj.sheets.push(sh); await saveNow(); await openSheet(sh.id); b.close(); askScaleAfterImport();
  } catch (e) { b.close(); toast('Immagine non leggibile'); console.error(e); }
}
async function addBlankSheet() {
  const W = 3200, H = Math.round(3200 * A3[1] / A3[0]);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  const ppm = (1000 / 50) * (72 / 25.4) * (W / A3[0]);
  for (let i = 0, gx = 0; gx <= W; i++, gx = i * ppm / 2) { x.strokeStyle = i % 2 ? '#eef1f4' : '#dfe4ea'; x.lineWidth = i % 2 ? 1 : 2; x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
  for (let i = 0, gy = 0; gy <= H; i++, gy = i * ppm / 2) { x.strokeStyle = i % 2 ? '#eef1f4' : '#dfe4ea'; x.lineWidth = i % 2 ? 1 : 2; x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
  const baseId = await putFile(S.proj.id, await canvasToBlob(c, 'image/jpeg', 0.92), 'base');
  const n = S.proj.sheets.filter((s) => s.src === 'blank').length + 1;
  const sh = { id: uid(), name: 'Schizzo ' + n, src: 'blank', ptW: A3[0], ptH: A3[1], W, H, baseId, u: defaultU(W, H), ppm, ratio: 50, showNums: true, objs: [] };
  S.proj.sheets.push(sh); await saveNow(); await openSheet(sh.id);
  toast('Quadretti da 50 cm, griglia scura ogni metro');
}
async function askScaleAfterImport() {
  const ok = await dialog({ title: 'Impostare la scala?', body: h('p', {}, 'Con la scala le quote si misurano da sole e gli arredi compaiono in dimensione reale. Puoi farlo anche dopo dal menu.'),
    buttons: [{ label: 'Più tardi', value: false }, { label: 'Imposta scala', value: true, cls: 'primary' }], dismiss: false });
  if (ok) scaleDialog();
}
async function scaleDialog() {
  const sh = S.sheet; if (!sh) return;
  const cur = sh.ppm ? (sh.ratio ? 'Attuale: 1:' + sh.ratio : 'Attuale: calibrata (1 m = ' + Math.round(sh.ppm) + ' px)') : 'Scala non impostata';
  const ratios = sh.src === 'img' ? [] : [20, 50, 100, 200, 500];
  const v = await dialog({
    title: 'Scala della tavola',
    body: (close) => h('div', {}, h('p', {}, cur),
      h('button', { class: 'btn primary', style: 'width:100%;margin-bottom:12px', onclick: () => close('cal') }, 'Calibra su una misura nota'),
      ratios.length ? h('div', {}, h('p', { style: 'margin-bottom:8px' }, 'Oppure, se il PDF è stato esportato in scala dal CAD:'),
        h('div', { class: 'chips', style: 'flex-wrap:wrap' }, ratios.map((r) => h('button', { class: 'chip' + (sh.ratio === r ? ' on' : ''), onclick: () => close(r) }, '1:' + r)))) : null,
      sh.ppm ? h('button', { class: 'btn danger sm', style: 'margin-top:14px', onclick: () => close('none') }, 'Rimuovi scala') : null),
    buttons: [{ label: 'Chiudi', value: null }]
  });
  if (v === null || v === undefined) return;
  if (v === 'cal') { select(null); setTool('cal'); return; }
  pushUndo();
  if (v === 'none') { sh.ppm = null; sh.ratio = null; }
  else { sh.ratio = v; sh.ppm = (1000 / v) * (72 / 25.4) * (sh.W / sh.ptW); }
  changed(); renderPanel(); renderCtx(); toast(sh.ppm ? 'Scala 1:' + v + ' impostata' : 'Scala rimossa');
}
async function symSizeDialog() {
  const sh = S.sheet; const def = defaultU(sh.W, sh.H); const before = sh.u;
  const r = h('input', { type: 'range', min: 40, max: 250, step: 5, value: Math.round(sh.u / def * 100), style: 'width:100%' });
  const out = h('b', {}, r.value + '%');
  r.oninput = () => { sh.u = def * r.value / 100; out.textContent = r.value + '%'; draw(); };
  const ok = await dialog({ title: 'Dimensione dei simboli', body: h('div', {}, h('p', {}, 'Vale per tutti i simboli, le scritte e le quote di questa tavola.'), out, r),
    buttons: [{ label: 'Annulla', value: false }, { label: 'Applica', value: true, cls: 'primary' }], dismiss: false });
  if (!ok) { sh.u = before; draw(); } else changed();
}
async function openSheet(id) {
  const sh = S.proj.sheets.find((s) => s.id === id); if (!sh) return;
  S.sheet = sh; S.sel = null; S.draft = null; S.undo = []; S.redo = []; S.img = null;
  S.proj.lastSheet = id;
  updateTitles(); renderPanel(); renderCtx(); renderEmpty();
  try {
    const blob = await getBlob(sh.baseId);
    if (blob) S.img = await createImageBitmap(blob);
  } catch (e) { console.error(e); toast('Immagine della tavola non leggibile'); }
  requestAnimationFrame(() => { resize(); fit(); });
}
function updateTitles() {
  $('#tProj').textContent = S.proj.name;
  $('#tSheet').textContent = S.sheet ? S.sheet.name + (S.proj.sheets.length > 1 ? '  ▾  ' + (S.proj.sheets.indexOf(S.sheet) + 1) + '/' + S.proj.sheets.length : '  ▾') : 'Nessuna tavola';
}
function renderEmpty() {
  let e = $('#emptyStage'); if (e) e.remove();
  if (S.sheet) return;
  stage.append(h('div', { id: 'emptyStage', style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;z-index:2' },
    h('div', { class: 'empty', style: 'background:var(--surface);max-width:380px' }, h('b', {}, 'Aggiungi la prima planimetria'),
      h('div', { style: 'margin-bottom:14px' }, 'Carica il PDF della pianta (catastale o di progetto), una foto, oppure usa un foglio quadrettato.'),
      h('button', { class: 'btn primary', onclick: addSheetFlow }, icon('plus'), 'Aggiungi planimetria'))));
}
$('#btnSheets').onclick = async () => {
  if (!S.proj.sheets.length) return addSheetFlow();
  const v = await pickList('Tavole del rilievo', S.proj.sheets.map((s, i) => ({ label: (i + 1) + '. ' + s.name, value: s.id, on: s === S.sheet, sub: s.objs.length + ' elementi' + (s.ppm ? ' · in scala' : '') })),
    (close) => h('button', { class: 'btn primary', style: 'width:100%;margin-top:12px', onclick: () => { close('__add'); } }, icon('plus'), 'Aggiungi planimetria'));
  if (v === '__add') addSheetFlow(); else if (v) openSheet(v);
};

// ---------------------------------------------------------------- Menu
$('#btnMenu').onclick = async () => {
  const sh = S.sheet;
  const items = [
    { label: 'Esporta PDF del rilievo', sub: 'Tavole, legenda, riepilogo per stanza e foto', value: 'pdf' },
    sh ? { label: 'Ripeti', sub: S.redo.length ? 'Ripristina l\'ultima azione annullata' : 'Nessuna azione da ripetere', value: 'redo' } : null,
    sh ? { label: 'Scala della tavola', sub: sh.ppm ? (sh.ratio ? '1:' + sh.ratio : 'calibrata') : 'non impostata', value: 'scale' } : null,
    sh ? { label: 'Dimensione simboli', value: 'size' } : null,
    sh ? { label: (sh.showNums !== false ? 'Nascondi' : 'Mostra') + ' numerazione sui simboli', value: 'nums' } : null,
    sh ? { label: 'Rinomina tavola', sub: sh.name, value: 'ren' } : null,
    { label: 'Aggiungi planimetria', value: 'add' },
    { label: 'Dati del rilievo', sub: 'Committente, indirizzo, riferimenti catastali', value: 'data' },
    { label: 'Salva backup del rilievo', sub: 'File unico con tavole e foto, da conservare o spostare su un altro dispositivo', value: 'bak' },
    sh ? { label: 'Elimina questa tavola', value: 'del' } : null
  ].filter(Boolean);
  const v = await pickList('Menu', items);
  if (v === 'pdf') exportFlow();
  else if (v === 'redo') redo();
  else if (v === 'scale') scaleDialog();
  else if (v === 'size') symSizeDialog();
  else if (v === 'nums') { sh.showNums = sh.showNums === false; changed(); }
  else if (v === 'ren') { const r = await formDlg('Rinomina tavola', [{ id: 'n', label: 'Nome', value: sh.name, required: true }]); if (r) { sh.name = r.n.trim(); updateTitles(); saveSoon(); } }
  else if (v === 'add') addSheetFlow();
  else if (v === 'data') { if (await editProjectData(S.proj)) { updateTitles(); saveSoon(); } }
  else if (v === 'bak') backupProject(S.proj);
  else if (v === 'del') {
    if (!(await confirmDlg('Eliminare la tavola?', '"' + sh.name + '" e i suoi ' + sh.objs.length + ' elementi verranno eliminati.', 'Elimina', true))) return;
    S.proj.sheets = S.proj.sheets.filter((x) => x !== sh); await saveNow();
    S.sheet = null; S.img = null; select(null);
    if (S.proj.sheets.length) openSheet(S.proj.sheets[0].id); else { updateTitles(); renderEmpty(); renderCtx(); draw(); }
  }
};

// ---------------------------------------------------------------- Progetti
const PROJ_FIELDS = (p) => [
  { id: 'name', label: 'Nome del rilievo', value: p.name, required: true, placeholder: 'es. Rossi – appartamento 2° piano' },
  { id: 'client', label: 'Committente', value: p.client },
  { id: 'addr', label: 'Indirizzo / Comune', value: p.addr },
  { id: 'cat', label: 'Riferimenti catastali', value: p.cat, placeholder: 'es. Fg. 12 Map. 345 Sub. 6' },
  { id: 'date', label: 'Data del sopralluogo', type: 'date', value: p.date },
  { id: 'notes', label: 'Note generali', type: 'textarea', value: p.notes }
];
async function editProjectData(p) {
  const v = await formDlg('Dati del rilievo', PROJ_FIELDS(p)); if (!v) return false;
  Object.assign(p, v); p.name = p.name.trim(); return true;
}
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };
async function newProject() {
  const p = { id: uid(), name: '', client: '', addr: '', cat: '', date: today(), notes: '', rooms: [], sheets: [], createdAt: Date.now(), updatedAt: Date.now() };
  const v = await formDlg('Nuovo rilievo', PROJ_FIELDS(p), 'Crea'); if (!v) return;
  Object.assign(p, v); p.name = p.name.trim();
  await DB.put('projects', p); await openProject(p.id); addSheetFlow();
}
async function openProject(id) {
  const p = await DB.get('projects', id); if (!p) return;
  S.proj = p; S.room = ''; S.sheet = null; S.img = null; refreshNums();
  $('#home').hidden = true; $('#editor').hidden = false;
  history.pushState({ v: 'ed' }, '');
  updateRoomChip(); updateTitles(); updateSymToolIcon(); setTool('pan');
  const sid = p.lastSheet && p.sheets.find((s) => s.id === p.lastSheet) ? p.lastSheet : p.sheets[0] && p.sheets[0].id;
  if (sid) await openSheet(sid); else { renderEmpty(); draw(); }
  wake();
}
async function closeProject() {
  await saveNow(); S.proj = null; S.sheet = null; S.img = null; S.sel = null; renderPanel();
  for (const u of urlCache.values()) URL.revokeObjectURL(u); urlCache.clear();
  $('#editor').hidden = true; $('#home').hidden = false; renderHome();
}
$('#btnBack').onclick = () => history.back();
window.addEventListener('popstate', () => {
  if (openLayers.length) { openLayers[openLayers.length - 1].close(); if (!$('#editor').hidden) history.pushState({ v: 'ed' }, ''); return; }
  if (!$('#editor').hidden) closeProject();
});

async function renderHome() {
  const list = $('#projList'); list.innerHTML = '';
  const ps = (await DB.all('projects')).sort((a, b) => b.updatedAt - a.updatedAt);
  if (!ps.length) {
    list.append(h('div', { class: 'empty' }, h('b', {}, 'Nessun rilievo ancora'),
      h('div', { style: 'margin-bottom:14px' }, 'Crea un rilievo, carica la planimetria in PDF e inizia a posizionare arredi e impianti.'),
      h('button', { class: 'btn', onclick: makeExample }, 'Apri un rilievo di esempio')));
  }
  for (const p of ps) {
    let nObj = 0, nPh = 0; for (const s of p.sheets) for (const o of s.objs) { if (o.k === 'sym' || o.k === 'line') nObj++; nPh += (o.ph || []).length; }
    list.append(h('div', { class: 'card', style: 'margin-bottom:10px' },
      h('button', { class: 'main', style: 'border:0;background:transparent;text-align:left;padding:0', onclick: () => openProject(p.id) },
        h('h3', {}, p.name || 'Senza nome'),
        h('div', { class: 'meta' }, p.client ? h('span', {}, p.client) : null, p.addr ? h('span', {}, p.addr) : null, p.date ? h('span', {}, fmtDate(p.date)) : null),
        h('div', { class: 'stats' }, h('span', { class: 'pill' }, p.sheets.length + (p.sheets.length === 1 ? ' tavola' : ' tavole')), h('span', { class: 'pill' }, nObj + ' elementi'), h('span', { class: 'pill' }, nPh + ' foto'))),
      h('button', { class: 'iconbtn', 'aria-label': 'Opzioni', onclick: () => projMenu(p) }, icon('more'))));
  }
  try { const est = await navigator.storage.estimate(); $('#storageInfo').textContent = 'Spazio occupato sul telefono: ' + (est.usage / 1048576).toFixed(1) + ' MB. I rilievi restano nel telefono: salva un backup dei lavori importanti.'; } catch (e) { /* */ }
}
async function projMenu(p) {
  const v = await pickList(p.name, [
    { label: 'Apri', value: 'open' }, { label: 'Modifica dati', value: 'edit' }, { label: 'Esporta PDF', value: 'pdf' },
    { label: 'Salva backup', value: 'bak' }, { label: 'Duplica', value: 'dup' }, { label: 'Elimina rilievo', value: 'del' }]);
  if (v === 'open') openProject(p.id);
  else if (v === 'edit') { if (await editProjectData(p)) { p.updatedAt = Date.now(); await DB.put('projects', p); renderHome(); } }
  else if (v === 'pdf') { const b = busy('Preparo…'); S.proj = p; b.close(); await exportFlow(); S.proj = null; }
  else if (v === 'bak') backupProject(p);
  else if (v === 'dup') { const b = busy('Duplico…'); try { const data = await buildBackup(p); await importBackupData(data, ' (copia)'); } finally { b.close(); } renderHome(); }
  else if (v === 'del') {
    if (!(await confirmDlg('Eliminare il rilievo?', '"' + p.name + '" con tutte le tavole e le foto verrà eliminato dal telefono. L\'operazione non si può annullare.', 'Elimina', true))) return;
    for (const f of await DB.filesOf(p.id)) await DB.del('files', f.id);
    await DB.del('projects', p.id); renderHome(); toast('Rilievo eliminato');
  }
}
$('#btnNew').onclick = newProject;
const techInput = $('#setTech');
techInput.value = settings.get('tech', 'Per. Ed. Ernesto Zanettin');
techInput.oninput = () => settings.set('tech', techInput.value);

// ---------------------------------------------------------------- Esempio
async function makeExample() {
  const b = busy('Creo il rilievo di esempio…');
  try {
    const p = { id: uid(), name: 'Esempio – appartamento tipo', client: 'Committente di prova', addr: 'Via Esempio 1, Cibiana di Cadore', cat: 'Fg. 0 Map. 000 Sub. 0', date: today(), notes: 'Rilievo dimostrativo: puoi modificarlo o eliminarlo.', rooms: ['Soggiorno', 'Cucina', 'Bagno', 'Camera', 'Disimpegno'], sheets: [], createdAt: Date.now(), updatedAt: Date.now() };
    const W = 3200, H = Math.round(3200 * A3[1] / A3[0]); const ppm = (1000 / 50) * (72 / 25.4) * (W / A3[0]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    const ox = 700, oy = 420, m = (v) => v * ppm, X = (v) => ox + m(v), Y = (v) => oy + m(v);
    x.fillStyle = '#222';
    const wall = (x1, y1, x2, y2, t) => { const tt = m(t); if (y1 === y2) x.fillRect(X(Math.min(x1, x2)) - tt / 2, Y(y1) - tt / 2, m(Math.abs(x2 - x1)) + tt, tt); else x.fillRect(X(x1) - tt / 2, Y(Math.min(y1, y2)) - tt / 2, tt, m(Math.abs(y2 - y1)) + tt); };
    wall(0, 0, 11, 0, 0.3); wall(0, 8, 11, 8, 0.3); wall(0, 0, 0, 8, 0.3); wall(11, 0, 11, 8, 0.3);
    wall(6.5, 0, 6.5, 8, 0.12); wall(0, 5, 6.5, 5, 0.12); wall(6.5, 4.5, 11, 4.5, 0.12); wall(4, 5, 4, 8, 0.12); wall(9, 4.5, 9, 8, 0.12); wall(3.6, 0, 3.6, 5, 0.12);
    x.fillStyle = '#fff';
    const gap = (cx, cy, w, hh) => x.fillRect(X(cx) - m(w) / 2, Y(cy) - m(hh) / 2, m(w), m(hh));
    gap(5.2, 5, 0.85, 0.3); gap(6.5, 3.4, 0.3, 0.85); gap(7.6, 4.5, 0.85, 0.3); gap(4, 6.6, 0.3, 0.85); gap(3.6, 3.8, 0.3, 1.2); gap(2, 8, 1.2, 0.4); gap(1.8, 0, 1.8, 0.4); gap(8.8, 0, 1.4, 0.4); gap(11, 6.2, 0.4, 0.9);
    x.strokeStyle = '#222'; x.lineWidth = 3;
    for (const [cx, cy, w, v] of [[2, 8, 1.2, 0], [1.8, 0, 1.8, 0], [8.8, 0, 1.4, 0], [11, 6.2, 0.9, 1]]) {
      if (!v) { x.strokeRect(X(cx) - m(w) / 2, Y(cy) - m(0.15), m(w), m(0.3)); x.beginPath(); x.moveTo(X(cx) - m(w) / 2, Y(cy)); x.lineTo(X(cx) + m(w) / 2, Y(cy)); x.stroke(); }
      else { x.strokeRect(X(cx) - m(0.15), Y(cy) - m(w) / 2, m(0.3), m(w)); x.beginPath(); x.moveTo(X(cx), Y(cy) - m(w) / 2); x.lineTo(X(cx), Y(cy) + m(w) / 2); x.stroke(); }
    }
    x.fillStyle = '#8a8f98'; x.font = '600 ' + Math.round(m(0.32)) + 'px Arial'; x.textAlign = 'center';
    for (const [t, cx, cy] of [['SOGGIORNO', 1.8, 2.4], ['CUCINA', 5.05, 2.4], ['CAMERA', 8.75, 2.3], ['CAMERA 2', 2, 6.6], ['DISIMP.', 5.25, 6.9], ['BAGNO', 7.75, 7.3], ['RIP.', 10, 6.4]]) x.fillText(t, X(cx), Y(cy));
    x.font = '700 ' + Math.round(m(0.4)) + 'px Arial'; x.fillStyle = '#222'; x.textAlign = 'left'; x.fillText('PIANTA PIANO PRIMO – scala 1:50', X(0), Y(-1.2));
    const baseId = await putFile(p.id, await canvasToBlob(c, 'image/jpeg', 0.92), 'base');
    const u = defaultU(W, H);
    const S_ = (t, r, xx, yy, extra) => { const d = BY_ID[t]; const o = Object.assign({ id: uid(), k: 'sym', t, x: X(xx), y: Y(yy), rot: 0, r }, d.kind === 'sz' ? { w: d.w, h: d.h } : {}, extra || {}); return o; };
    const objs = [
      S_('divano3', 'Soggiorno', 1.6, 1.1), S_('tavolo', 'Soggiorno', 1.8, 3.6), S_('mobileTV', 'Soggiorno', 1.6, 4.65, { rot: 180 }),
      S_('presa16', 'Soggiorno', 0.35, 2.2, { rot: 90, hq: 30 }), S_('presaTV', 'Soggiorno', 2.4, 4.7, { rot: 180, hq: 30 }), S_('presa10', 'Soggiorno', 3.25, 1.5, { rot: 270, hq: 30 }),
      S_('interr', 'Soggiorno', 3.3, 4.35, { hq: 110 }), S_('luce', 'Soggiorno', 1.8, 2.5), S_('radiatore', 'Soggiorno', 1.8, 0.3, { n: 'Radiatore in ghisa 10 elementi, valvola manuale' }),
      S_('cucina', 'Cucina', 5.05, 0.45), S_('lavello', 'Cucina', 4.6, 0.45), S_('fuochi', 'Cucina', 5.9, 0.45), S_('frigo', 'Cucina', 6.05, 1.6, { rot: 90 }),
      S_('caldaia', 'Cucina', 4.0, 0.35, { n: 'Caldaia murale a condensazione, anno 2015', hq: 160 }), S_('contG', 'Cucina', 3.95, 1.2, { hq: 120 }), S_('presa16', 'Cucina', 5.5, 0.3, { hq: 110 }), S_('presaC', 'Cucina', 6.2, 0.3, { hq: 110 }),
      S_('letto2', 'Camera', 8.75, 1.4), S_('comodino', 'Camera', 7.5, 0.45), S_('comodino', 'Camera', 10, 0.45), S_('armadio', 'Camera', 8.75, 4.05, { rot: 180, w: 220 }),
      S_('deviat', 'Camera', 6.8, 3.0, { hq: 110 }), S_('deviat', 'Camera', 10.2, 1.2, { hq: 70 }), S_('luce', 'Camera', 8.75, 2.2), S_('radiatore', 'Camera', 8.8, 0.25),
      S_('wc', 'Bagno', 8.6, 7.55, { rot: 180 }), S_('bidet', 'Bagno', 8.1, 7.55, { rot: 180 }), S_('lavabo', 'Bagno', 6.95, 6.6, { rot: 90 }), S_('doccia', 'Bagno', 7.2, 7.4),
      S_('scaldas', 'Bagno', 8.85, 5.6, { rot: 90, n: 'Scaldasalviette elettrico da sostituire' }), S_('af', 'Bagno', 6.75, 6.2, { hq: 55 }), S_('ac', 'Bagno', 6.75, 6.95, { hq: 55 }), S_('scarico', 'Bagno', 6.95, 6.1, { hq: 45 }),
      S_('tirante', 'Bagno', 7.4, 6.8), S_('applique', 'Bagno', 6.75, 5.6, { rot: 90, hq: 200 }),
      S_('quadro', 'Disimpegno', 4.35, 7.3, { rot: 90, hq: 160, n: 'Quadro 12 moduli, differenziale 30 mA presente' }), S_('collI', 'Disimpegno', 6.25, 6.3, { rot: 90 })
    ];
    objs.push({ id: uid(), k: 'line', st: 'af', r: 'Cucina', pts: [[X(4.25), Y(0.35)], [X(4.25), Y(4.75)], [X(6.4), Y(4.75)], [X(6.4), Y(6.2)], [X(6.75), Y(6.2)]], n: '' });
    objs.push({ id: uid(), k: 'line', st: 'ac', r: 'Cucina', pts: [[X(3.85), Y(0.35)], [X(3.85), Y(4.85)], [X(6.3), Y(4.85)], [X(6.3), Y(6.95)], [X(6.75), Y(6.95)]], n: 'Multistrato 16x2 sotto pavimento (da verificare)' });
    objs.push({ id: uid(), k: 'line', st: 'gas', r: 'Cucina', pts: [[X(3.95), Y(1.2)], [X(3.95), Y(0.75)], [X(5.9), Y(0.75)]], n: '' });
    objs.push({ id: uid(), k: 'dim', x1: X(0.15), y1: Y(-0.6), x2: X(6.44), y2: Y(-0.6), off: 0, v: '' });
    objs.push({ id: uid(), k: 'dim', x1: X(6.56), y1: Y(-0.6), x2: X(10.85), y2: Y(-0.6), off: 0, v: '' });
    objs.push({ id: uid(), k: 'dim', x1: X(11.6), y1: Y(0.15), x2: X(11.6), y2: Y(4.44), off: 0, v: '' });
    objs.push({ id: uid(), k: 'text', x: X(6.7), y: Y(8.6), tx: 'Altezza locali h 2,70', sc: 1 });
    p.sheets.push({ id: uid(), name: 'Piano primo', src: 'blank', ptW: A3[0], ptH: A3[1], W, H, baseId, u, ppm, ratio: 50, showNums: true, objs });
    await DB.put('projects', p);
    b.close(); await openProject(p.id);
  } catch (e) { b.close(); toast('Errore: ' + e.message); console.error(e); }
}

// ---------------------------------------------------------------- Esportazione PDF
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function san(s) {
  s = String(s == null ? '' : s).replace(/\r/g, '').replace(/\t/g, ' ').replace(/[≈]/g, '~').replace(/[×]/g, 'x').replace(/[≤]/g, '<=').replace(/[≥]/g, '>=').replace(/[Ø⌀]/g, 'Ø');
  let o = ''; for (const ch of s) { const c = ch.codePointAt(0); if (ch === '\n' || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.includes(ch)) o += ch; else if (c > 255) o += '?'; }
  return o;
}
function fitText(s, font, size, maxW) {
  s = san(s).replace(/\n/g, ' '); if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxW) s = s.slice(0, -1);
  return s + '…';
}
function wrapText(text, font, size, maxW) {
  const out = [];
  for (const para of san(text).split('\n')) {
    const words = para.split(/ +/); let line = '';
    for (let w of words) {
      while (font.widthOfTextAtSize(w, size) > maxW && w.length > 1) {
        let k = w.length; while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > maxW) k--;
        if (line) { out.push(line); line = ''; } out.push(w.slice(0, k)); w = w.slice(k);
      }
      const t = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(t, size) <= maxW) line = t; else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}
async function overlayPNG(sh, nums) {
  const k = Math.min(1.5, 4200 / Math.max(sh.W, sh.H));
  const c = document.createElement('canvas'); c.width = Math.round(sh.W * k); c.height = Math.round(sh.H * k);
  const x = c.getContext('2d'); x.scale(k, k); drawObjects(x, sh, { nums });
  const blob = await canvasToBlob(c, 'image/png'); c.width = c.height = 1;
  return new Uint8Array(await blob.arrayBuffer());
}
async function exportFlow() {
  const p = S.proj; if (!p) return;
  if (!p.sheets.length) { toast('Aggiungi prima una planimetria'); return; }
  const box = h('div', {});
  const opts = [['plans', 'Tavole con simboli e quote', true], ['legend', 'Dati del rilievo e legenda', true], ['summary', 'Riepilogo per stanza ed elenco elementi', true], ['photos', 'Foto (4 per pagina)', true]];
  for (const [k, l, d] of opts) box.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'x_' + k, checked: d }), l));
  const fname = h('input', { id: 'f_fname', value: san('Rilievo ' + p.name + ' ' + fmtDate(p.date).replace(/\//g, '-')).replace(/[\\/:*?"<>|]/g, '-').trim() });
  box.append(h('div', { class: 'field', style: 'margin-top:8px' }, h('label', { for: 'f_fname' }, 'Nome del file'), fname));
  const o = await dialog({ title: 'Esporta PDF', body: box, buttons: [{ label: 'Annulla', value: null }, { label: 'Crea PDF', cls: 'primary', value: () => {
    const r = {}; for (const [k] of opts) r[k] = box.querySelector('#x_' + k).checked; r.name = (fname.value.trim() || 'Rilievo') + '.pdf'; return r; } }] });
  if (!o) return;
  const b = busy('Creo il PDF…');
  try {
    await saveNow();
    const bytes = await buildPDF(p, o, (m) => b.set(m));
    b.close();
    await deliverFile(bytes, o.name, 'application/pdf', 'PDF pronto');
  } catch (e) { b.close(); console.error(e); toast('Errore nella creazione del PDF: ' + (e.message || e), 5000); }
}
async function buildPDF(p, o, progress) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const tech = settings.get('tech', '');
  doc.setTitle(san('Rilievo – ' + p.name)); doc.setAuthor(san(tech)); doc.setCreator('Rilievo in Campo'); doc.setSubject('Rilievo arredi e impianti');
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const INK = rgb(0.09, 0.12, 0.17), MUTE = rgb(0.4, 0.43, 0.48), RULE = rgb(0.78, 0.8, 0.83), BAND = rgb(0.93, 0.94, 0.95), NAVY = rgb(0.086, 0.137, 0.227);
  const hex = (s) => { const n = parseInt(s.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  const nums = numbering(p);
  const items = []; let pn = 0;
  p.sheets.forEach((sh, si) => sh.objs.forEach((ob) => {
    if (ob.k !== 'sym' && ob.k !== 'line') return;
    const it = { o: ob, sh, si, num: nums.get(ob.id) || '', name: ob.k === 'sym' ? (BY_ID[ob.t] || {}).name : 'Tracciato ' + (LINES[ob.st] || LINES.gen).name.toLowerCase(), cat: ob.k === 'sym' ? (BY_ID[ob.t] || {}).cat : 'L' };
    it.photoNums = (ob.ph || []).map(() => ++pn); items.push(it);
  }));
  const A4 = [595.28, 841.89], M = 40, CW = A4[0] - 2 * M;
  const reportPages = [];
  // --- writer
  let page, y;
  const head = () => {
    page = doc.addPage(A4); reportPages.push(page);
    page.drawText(san(p.name), { x: M, y: A4[1] - 30, size: 9, font: FB, color: INK });
    const r = 'Rilievo arredi e impianti'; page.drawText(r, { x: A4[0] - M - F.widthOfTextAtSize(r, 9), y: A4[1] - 30, size: 9, font: F, color: MUTE });
    page.drawLine({ start: { x: M, y: A4[1] - 37 }, end: { x: A4[0] - M, y: A4[1] - 37 }, thickness: 0.6, color: RULE });
    y = A4[1] - 60;
  };
  const ensure = (hh) => { if (!page || y - hh < 50) head(); };
  const h1 = (t) => { ensure(40); page.drawText(san(t), { x: M, y: y - 16, size: 17, font: FB, color: INK }); y -= 30; };
  const h2 = (t) => { ensure(48); y -= 8; page.drawText(san(t), { x: M, y: y - 12, size: 12.5, font: FB, color: NAVY }); page.drawLine({ start: { x: M, y: y - 18 }, end: { x: A4[0] - M, y: y - 18 }, thickness: 1.2, color: NAVY }); y -= 28; };
  const table = (cols, rows, opt = {}) => {
    const fs = opt.fs || 8.6, lh = fs * 1.28, pad = 4;
    const drawHead = () => {
      ensure(lh + pad * 2 + 20);
      page.drawRectangle({ x: M, y: y - lh - pad * 2 + 2, width: CW, height: lh + pad * 2 - 2, color: BAND });
      let x = M; for (const c of cols) { page.drawText(san(c.label), { x: x + pad, y: y - pad - fs, size: fs * 0.95, font: FB, color: MUTE }); x += c.w; }
      y -= lh + pad * 2;
    };
    drawHead();
    for (const r of rows) {
      if (r.group) {
        ensure(lh + pad * 2 + lh * 2); if (y > A4[1] - 70) drawHead();
        page.drawText(san(r.group), { x: M + pad, y: y - pad - fs - 3, size: fs * 1.08, font: FB, color: INK }); y -= lh + pad * 2 + 3;
        page.drawLine({ start: { x: M, y: y + 2 }, end: { x: A4[0] - M, y: y + 2 }, thickness: 0.5, color: RULE }); continue;
      }
      const cells = cols.map((c, i) => wrapText(r.cells[i] == null ? '' : String(r.cells[i]), c.bold ? FB : F, fs, c.w - pad * 2));
      const n = Math.max(...cells.map((l) => l.length)); const rh = n * lh + pad * 2;
      if (y - rh < 50) { head(); drawHead(); }
      let x = M;
      cols.forEach((c, i) => {
        cells[i].forEach((l, j) => {
          const fnt = c.bold ? FB : F; const tw = fnt.widthOfTextAtSize(l, fs);
          const tx = c.align === 'right' ? x + c.w - pad - tw : x + pad;
          page.drawText(l, { x: tx, y: y - pad - fs - j * lh + 1, size: fs, font: fnt, color: c.color || INK });
        });
        x += c.w;
      });
      y -= rh; page.drawLine({ start: { x: M, y: y }, end: { x: A4[0] - M, y: y }, thickness: 0.35, color: RULE });
    }
    y -= 10;
  };
  const kv = (rows) => {
    for (const [k, v] of rows) {
      if (!v) continue; const ls = wrapText(v, F, 10, CW - 130); ensure(ls.length * 13 + 6);
      page.drawText(san(k), { x: M, y: y - 10, size: 9, font: FB, color: MUTE });
      ls.forEach((l, i) => page.drawText(l, { x: M + 130, y: y - 10 - i * 13, size: 10, font: F, color: INK }));
      y -= ls.length * 13 + 6;
    }
  };
  // --- 1. Dati e legenda
  if (o.legend) {
    progress('Legenda…');
    head(); h1('Rilievo arredi e impianti');
    kv([['Rilievo', p.name], ['Committente', p.client], ['Indirizzo', p.addr], ['Rif. catastali', p.cat], ['Data sopralluogo', fmtDate(p.date)], ['Tecnico rilevatore', tech],
      ['Tavole', p.sheets.map((s, i) => (i + 1) + '. ' + s.name).join('\n')], ['Note', p.notes]]);
    y -= 6; h2('Legenda');
    const used = new Map(); for (const it of items) if (it.o.k === 'sym') used.set(it.o.t, (used.get(it.o.t) || 0) + 1);
    const lused = new Map(); for (const it of items) if (it.o.k === 'line') { const e = lused.get(it.o.st) || { n: 0, L: 0, has: false }; e.n++; const L = lineLen(it.sh, it.o); if (L != null) { e.L += L; e.has = true; } lused.set(it.o.st, e); }
    const iconCache = {};
    const colW = CW / 2; const rowH = 24;
    for (const [ck, cat] of Object.entries(CAT)) {
      const ids = [...used.keys()].filter((id) => BY_ID[id] && BY_ID[id].cat === ck);
      const lks = [...lused.keys()].filter((k) => (LINES[k] || LINES.gen).cat === ck);
      if (!ids.length && !lks.length) continue;
      ensure(30 + rowH);
      page.drawRectangle({ x: M, y: y - 12, width: 8, height: 8, color: hex(cat.color) });
      page.drawText(san(cat.name) + (ck !== 'A' ? '  (numerazione ' + ck + '1, ' + ck + '2…)' : ''), { x: M + 14, y: y - 11, size: 10, font: FB, color: INK }); y -= 22;
      const entries = ids.map((id) => ({ t: 's', id })).concat(lks.map((k) => ({ t: 'l', k })));
      for (let i = 0; i < entries.length; i += 2) {
        ensure(rowH);
        for (let j = 0; j < 2 && i + j < entries.length; j++) {
          const e = entries[i + j]; const x = M + j * colW;
          if (e.t === 's') {
            if (!iconCache[e.id]) iconCache[e.id] = await doc.embedPng(await canvasToBlob(symIcon(e.id, 96), 'image/png').then((bb) => bb.arrayBuffer()));
            page.drawImage(iconCache[e.id], { x, y: y - 20, width: 20, height: 20 });
            page.drawText(san(BY_ID[e.id].name), { x: x + 28, y: y - 13, size: 9.5, font: F, color: INK });
            const q = 'n. ' + used.get(e.id); page.drawText(q, { x: x + colW - 14 - F.widthOfTextAtSize(q, 9), y: y - 13, size: 9, font: F, color: MUTE });
          } else {
            const st = LINES[e.k] || LINES.gen; const en = lused.get(e.k);
            page.drawLine({ start: { x: x + 1, y: y - 10 }, end: { x: x + 21, y: y - 10 }, thickness: 1.6 * st.w, color: hex(st.color), dashArray: st.dash ? st.dash.map((v) => v * 1.4) : undefined });
            page.drawText(san(st.name + (st.tag ? ' (' + st.tag + ')' : '')), { x: x + 28, y: y - 13, size: 9.5, font: F, color: INK });
            const q = en.has ? fmtM(en.L) + ' m' : 'n. ' + en.n; page.drawText(q, { x: x + colW - 14 - F.widthOfTextAtSize(q, 9), y: y - 13, size: 9, font: F, color: MUTE });
          }
        }
        y -= rowH;
      }
      y -= 6;
    }
    const lg = lused.get('gen'); if (lg) { ensure(rowH); page.drawText('Tracciati generici: ' + lg.n, { x: M, y: y - 12, size: 9.5, font: F, color: INK }); y -= rowH; }
    ensure(40); y -= 4;
    page.drawText(san('Quote in metri. hNN = altezza da pavimento in cm.'), { x: M, y: y - 10, size: 8.5, font: F, color: MUTE }); y -= 16;
    page.drawText(san('Il numero accanto al simbolo rimanda al riepilogo e alle foto.'), { x: M, y: y - 10, size: 8.5, font: F, color: MUTE }); y -= 16;
  }
  // --- 2. Tavole
  if (o.plans) {
    const srcDocs = {};
    for (let si = 0; si < p.sheets.length; si++) {
      const sh = p.sheets[si]; progress('Tavola ' + (si + 1) + ' di ' + p.sheets.length + '…');
      let emb = null, img = null, pw = sh.ptW, ph = sh.ptH;
      if (sh.src === 'pdf' && !sh.rot) {
        try {
          if (!srcDocs[sh.srcId]) { const bl = await getBlob(sh.srcId); srcDocs[sh.srcId] = await PDFDocument.load(await bl.arrayBuffer(), { ignoreEncryption: true }); }
          const sp = srcDocs[sh.srcId].getPage(sh.page); const cb = sp.getCropBox();
          emb = await doc.embedPage(sp, { left: cb.x, bottom: cb.y, right: cb.x + cb.width, top: cb.y + cb.height });
          pw = cb.width; ph = cb.height;
        } catch (e) { console.warn('Uso immagine al posto del PDF vettoriale', e); emb = null; }
      }
      if (!emb) { const bl = await getBlob(sh.baseId); img = await doc.embedJpg(new Uint8Array(await bl.arrayBuffer())); }
      const strip = clamp(pw * 0.04, 42, 96), fs = strip * 0.2;
      const pg = doc.addPage([pw, ph + strip]);
      if (emb) pg.drawPage(emb, { x: 0, y: strip, width: pw, height: ph }); else pg.drawImage(img, { x: 0, y: strip, width: pw, height: ph });
      const ov = await doc.embedPng(await overlayPNG(sh, nums));
      pg.drawImage(ov, { x: 0, y: strip, width: pw, height: ph });
      pg.drawRectangle({ x: 0, y: 0, width: pw, height: strip, color: rgb(1, 1, 1) });
      pg.drawLine({ start: { x: 0, y: strip }, end: { x: pw, y: strip }, thickness: 0.8, color: INK });
      const pad = strip * 0.22;
      pg.drawText(san(p.name), { x: pad, y: strip - pad - fs * 1.1, size: fs * 1.15, font: FB, color: INK });
      pg.drawText(san('Tav. ' + (si + 1) + ' – ' + sh.name), { x: pad, y: strip - pad - fs * 2.5, size: fs, font: F, color: INK });
      const mid = [p.client, p.addr].filter(Boolean).join(' – ');
      const midX = pw * 0.36, midW = pw * 0.3;
      if (mid) pg.drawText(fitText(mid, F, fs, midW), { x: midX, y: strip - pad - fs * 1.1, size: fs, font: F, color: INK });
      if (p.cat) pg.drawText(fitText(p.cat, F, fs, midW), { x: midX, y: strip - pad - fs * 2.5, size: fs, font: F, color: MUTE });
      const right = [fmtDate(p.date), tech].filter(Boolean).join('  ·  ');
      if (right) pg.drawText(san(right), { x: pw - pad - F.widthOfTextAtSize(san(right), fs), y: strip - pad - fs * 1.1, size: fs, font: F, color: INK });
      // scala grafica
      if (sh.ppm) {
        const ptPerM = sh.ppm * pw / sh.W; const target = pw * 0.12;
        let Lm = [0.5, 1, 2, 5, 10, 20, 50].find((v) => v * ptPerM >= target * 0.6) || 50;
        const len = Lm * ptPerM, bx = pw - pad - len - F.widthOfTextAtSize(String(Lm).replace('.', ',') + ' m', fs * 0.8) - 4, by = strip - pad - fs * 2.6, bh = fs * 0.5;
        for (let i = 0; i < 4; i++) pg.drawRectangle({ x: bx + i * len / 4, y: by, width: len / 4, height: bh, color: i % 2 ? rgb(1, 1, 1) : INK, borderColor: INK, borderWidth: 0.5 });
        const lab = (sh.ratio ? '1:' + sh.ratio + '   ' : '') + '0';
        pg.drawText(lab, { x: bx - F.widthOfTextAtSize(lab, fs * 0.8) - 2, y: by, size: fs * 0.8, font: F, color: INK });
        pg.drawText(String(Lm).replace('.', ',') + ' m', { x: bx + len + 2, y: by, size: fs * 0.8, font: F, color: INK });
      }
    }
  }
  // --- 3. Riepilogo
  if (o.summary) {
    progress('Riepilogo…');
    page = null; head(); h1('Riepilogo per stanza');
    const rooms = p.rooms.slice(); const extra = [...new Set(items.map((i) => i.o.r || ''))].filter((r) => r && !rooms.includes(r)); rooms.push(...extra, '');
    const rows = [];
    for (const r of rooms) {
      const its = items.filter((i) => (i.o.r || '') === r); if (!its.length) continue;
      rows.push({ group: r || 'Senza stanza' });
      const by = new Map();
      for (const it of its) { const key = it.o.k === 'sym' ? 's:' + it.o.t : 'l:' + it.o.st; const e = by.get(key) || { name: it.name, cat: it.cat, n: 0, nums: [], L: 0, hasL: false }; e.n++; if (it.num) e.nums.push(it.num); if (it.o.k === 'line') { const L = lineLen(it.sh, it.o); if (L != null) { e.L += L; e.hasL = true; } } by.set(key, e); }
      const order = { E: 0, I: 1, T: 2, L: 3, A: 4 };
      [...by.values()].sort((a, b) => (order[a.cat] - order[b.cat]) || a.name.localeCompare(b.name)).forEach((e) =>
        rows.push({ cells: [e.name, e.hasL ? fmtM(e.L) + ' m' : String(e.n), e.nums.join(', ')] }));
    }
    if (rows.length) table([{ label: 'Elemento', w: 230 }, { label: 'Quantità', w: 70, align: 'right' }, { label: 'Numeri', w: CW - 300 }], rows);
    else { page.drawText('Nessun elemento inserito.', { x: M, y: y - 12, size: 10, font: F, color: MUTE }); y -= 24; }
    const det = items.filter((i) => hasInfo(i.o));
    if (det.length) {
      h2('Dettaglio elementi con note, altezze o foto');
      table([{ label: 'N.', w: 34, bold: true }, { label: 'Elemento', w: 112 }, { label: 'Stanza', w: 70 }, { label: 'Tav.', w: 30 }, { label: 'h cm', w: 34, align: 'right' }, { label: 'Note', w: CW - 340 }, { label: 'Foto', w: 60 }],
        det.map((i) => ({ cells: [i.num, i.name, i.o.r || '', String(i.si + 1), i.o.hq == null ? '' : String(i.o.hq), i.o.n || '', i.photoNums.join(', ')] })));
    }
  }
  // --- 4. Foto
  if (o.photos && pn) {
    page = null; head(); h1('Documentazione fotografica');
    const cellW = (CW - 14) / 2, imgH = 300, capH = 40;
    let idx = 0;
    for (const it of items) for (let k = 0; k < (it.o.ph || []).length; k++) {
      progress('Foto ' + (idx + 1) + ' di ' + pn + '…');
      const pos = idx % 4; if (idx > 0 && pos === 0) { head(); }
      const col = pos % 2, row = Math.floor(pos / 2);
      const top = (idx < 4 ? A4[1] - 100 : A4[1] - 60) - row * (imgH + capH + 14);
      const x = M + col * (cellW + 14);
      const bl = await getBlob(it.o.ph[k]);
      if (bl) {
        const by = new Uint8Array(await bl.arrayBuffer());
        let im; try { im = bl.type === 'image/png' ? await doc.embedPng(by) : await doc.embedJpg(by); } catch (e) { im = null; }
        if (im) {
          const sc = Math.min(cellW / im.width, imgH / im.height); const w = im.width * sc, hh = im.height * sc;
          page.drawRectangle({ x, y: top - imgH, width: cellW, height: imgH, color: BAND });
          page.drawImage(im, { x: x + (cellW - w) / 2, y: top - imgH + (imgH - hh) / 2, width: w, height: hh });
        }
      }
      const cap1 = 'Foto ' + it.photoNums[k] + (it.num ? ' – ' + it.num : '') + ' – ' + it.name + (it.o.r ? ' (' + it.o.r + ')' : '');
      const capL = wrapText(cap1, FB, 8.5, cellW).slice(0, 1).concat(it.o.n ? wrapText(it.o.n, F, 8, cellW).slice(0, 2) : []);
      capL.forEach((l, j) => page.drawText(l, { x, y: top - imgH - 12 - j * 10.5, size: j ? 8 : 8.5, font: j ? F : FB, color: j ? MUTE : INK }));
      idx++;
    }
  }
  // numeri di pagina
  const pages = doc.getPages(); const tot = pages.length;
  pages.forEach((pg, i) => {
    if (!reportPages.includes(pg)) return;
    const t = 'Pag. ' + (i + 1) + ' di ' + tot; const { width } = pg.getSize(); const fs = 8;
    pg.drawText(t, { x: width - M - F.widthOfTextAtSize(t, fs), y: 24, size: fs, font: F, color: MUTE });
    if (tech) pg.drawText(san(tech + (p.date ? '  ·  sopralluogo del ' + fmtDate(p.date) : '')), { x: M, y: 24, size: 8, font: F, color: MUTE });
  });
  progress('Salvo…');
  return await doc.save();
}

// ---------------------------------------------------------------- Consegna file
async function deliverFile(bytes, name, mime, title) {
  const blob = new Blob([bytes], { type: mime });
  const file = new File([blob], name, { type: mime });
  let canShare = false; try { canShare = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { /* */ }
  const size = blob.size > 1048576 ? (blob.size / 1048576).toFixed(1) + ' MB' : Math.round(blob.size / 1024) + ' KB';
  const save = () => { const u = URL.createObjectURL(blob); const a = h('a', { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); toast('Salvato in Download'); };
  const v = await dialog({ title, body: h('p', {}, name + ' · ' + size),
    buttons: [{ label: 'Chiudi', value: null }, { label: 'Salva', value: 'save', cls: canShare ? '' : 'primary' }].concat(canShare ? [{ label: 'Condividi', value: 'share', cls: 'primary' }] : []) });
  if (v === 'save') save();
  else if (v === 'share') { try { await navigator.share({ files: [file], title: name }); } catch (e) { if (e.name !== 'AbortError') save(); } }
}

// ---------------------------------------------------------------- Backup
const blobToB64 = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(b); });
async function buildBackup(p) {
  const files = [];
  for (const f of await DB.filesOf(p.id)) files.push({ id: f.id, kind: f.kind, type: f.type || f.blob.type, data: await blobToB64(f.blob) });
  return { format: 'rilievo-in-campo', v: 1, exported: new Date().toISOString(), project: p, files };
}
async function backupProject(p) {
  const b = busy('Preparo il backup…');
  try {
    await saveNow(); const data = await buildBackup(p); b.close();
    const name = san('Backup ' + p.name).replace(/[\\/:*?"<>|]/g, '-') + '.rilievo.json';
    await deliverFile(new TextEncoder().encode(JSON.stringify(data)), name, 'application/json', 'Backup pronto');
  } catch (e) { b.close(); toast('Errore backup: ' + e.message); }
}
async function importBackupData(data, suffix) {
  if (!data || data.format !== 'rilievo-in-campo') throw new Error('File non riconosciuto');
  const p = clone(data.project); const map = {}; p.id = uid(); if (suffix) p.name += suffix;
  for (const f of data.files) {
    const bin = atob(f.data); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const nid = uid(); map[f.id] = nid; await DB.put('files', { id: nid, pid: p.id, kind: f.kind, type: f.type, blob: new Blob([arr], { type: f.type }) });
  }
  for (const sh of p.sheets) { sh.id = uid(); if (sh.srcId) sh.srcId = map[sh.srcId]; sh.baseId = map[sh.baseId]; for (const o of sh.objs) if (o.ph) o.ph = o.ph.map((x) => map[x]).filter(Boolean); }
  p.lastSheet = null; p.updatedAt = Date.now(); await DB.put('projects', p); return p;
}
$('#btnImport').onclick = async () => {
  const files = await pickFile($('#fileAny'), '.json,application/json'); if (!files.length) return;
  const b = busy('Importo il backup…');
  try { const data = JSON.parse(await files[0].text()); const p = await importBackupData(data); b.close(); toast('Importato: ' + p.name); renderHome(); }
  catch (e) { b.close(); toast('Backup non valido: ' + e.message, 4000); }
};

// ---------------------------------------------------------------- Varie
let wakeLock = null;
async function wake() { try { if (navigator.wakeLock && !wakeLock && !$('#editor').hidden) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); else saveNow(); });
window.addEventListener('pagehide', () => { saveNow(); });

async function init() {
  $('#editor').insertBefore(objpanel, $('.toolbar'));
  await DB.open();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* */ }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  updateSymToolIcon();
  renderHome();
}
window.RC = { S, DB, buildPDF, makeExample, openProject, numbering };
init();
})();
