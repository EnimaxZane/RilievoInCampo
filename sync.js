/* Sincronizzazione dei rilievi con Google Drive (cartella "Rilievo in Campo").
   Usa lo scope drive.file: l'app vede solo i file che ha creato lei. */
(function () {
'use strict';
const RC = window.RC;
const { h, toast, DB } = RC;

// Client ID OAuth di Google (tipo "Applicazione web"). Si può anche inserire dall'app.
const DEFAULT_CLIENT_ID = '';
const FOLDER_NAME = 'Rilievo in Campo';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

const ls = {
  get(k, d) { try { const v = localStorage.getItem('rcs_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rcs_' + k, JSON.stringify(v)); } catch (e) { /* */ } },
  del(k) { try { localStorage.removeItem('rcs_' + k); } catch (e) { /* */ } }
};
const st = { token: null, exp: 0, busy: false, gis: null, status: '', detail: '' };
try { const t = JSON.parse(sessionStorage.getItem('rcs_tok') || 'null'); if (t && t.exp > Date.now()) { st.token = t.token; st.exp = t.exp; } } catch (e) { /* */ }

const clientId = () => (ls.get('clientId', '') || DEFAULT_CLIENT_ID).trim();
const enabled = () => !!ls.get('enabled', false) && !!clientId();
const tokenValid = () => st.token && Date.now() < st.exp - 60000;

// ------------------------------------------------------------ autenticazione
function loadGIS() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if (!st.gis) st.gis = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => res(); s.onerror = () => { st.gis = null; rej(new Error('Google non raggiungibile: controlla la connessione')); };
    document.head.append(s);
  });
  return st.gis;
}
async function getToken(interactive) {
  if (tokenValid()) return st.token;
  if (!interactive) return null;
  await loadGIS();
  return new Promise((res, rej) => {
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: clientId(), scope: SCOPE, prompt: ls.get('consented', false) ? '' : 'consent', hint: ls.get('email', undefined),
      callback: (r) => {
        if (r.error) { rej(new Error(r.error_description || r.error)); return; }
        st.token = r.access_token; st.exp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        try { sessionStorage.setItem('rcs_tok', JSON.stringify({ token: st.token, exp: st.exp })); } catch (e) { /* */ }
        ls.set('consented', true); res(st.token);
      },
      error_callback: (e) => rej(new Error(e && e.type === 'popup_closed' ? 'Accesso a Google annullato' : (e && (e.message || e.type)) || 'Accesso a Google non riuscito'))
    });
    tc.requestAccessToken();
  });
}
function dropToken() { st.token = null; st.exp = 0; try { sessionStorage.removeItem('rcs_tok'); } catch (e) { /* */ } }

// ------------------------------------------------------------ Drive API
class AuthError extends Error {}
async function req(url, opt = {}) {
  const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + st.token }, opt.headers || {}) }));
  if (r.status === 401) { dropToken(); throw new AuthError('Accesso a Google scaduto'); }
  if (!r.ok) { let m = r.status + ''; try { const j = await r.json(); m = (j.error && j.error.message) || m; } catch (e) { /* */ } throw new Error('Google Drive: ' + m); }
  return r;
}
const q = (s) => encodeURIComponent(s);
async function listAll(query, fields) {
  const out = []; let page = '';
  do {
    const r = await (await req(API + 'files?q=' + q(query) + '&spaces=drive&pageSize=1000&fields=' + q('nextPageToken,files(' + fields + ')') + (page ? '&pageToken=' + q(page) : ''))).json();
    out.push(...(r.files || [])); page = r.nextPageToken || '';
  } while (page);
  return out;
}
async function upload(meta, blob, id) {
  const b = 'rc' + Math.random().toString(36).slice(2);
  const body = new Blob(['--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + b + '\r\nContent-Type: ' + (blob.type || 'application/octet-stream') + '\r\n\r\n', blob, '\r\n--' + b + '--\r\n']);
  const r = await req(UPLOAD + (id ? '/' + id : '') + '?uploadType=multipart&fields=id', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
  return (await r.json()).id;
}
async function download(id) { return await (await req(API + 'files/' + id + '?alt=media')).blob(); }
async function trash(id) { await req(API + 'files/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); }
async function ensureFolder() {
  const saved = ls.get('folderId', '');
  if (saved) {
    try { const f = await (await req(API + 'files/' + saved + '?fields=id,trashed')).json(); if (!f.trashed) return { id: saved, fresh: false }; }
    catch (e) { if (e instanceof AuthError) throw e; }
  }
  const found = await listAll("mimeType='application/vnd.google-apps.folder' and name='" + FOLDER_NAME + "' and trashed=false", 'id');
  if (found.length) { ls.set('folderId', found[0].id); return { id: found[0].id, fresh: !saved }; }
  const r = await (await req(API + 'files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }) })).json();
  ls.set('folderId', r.id); return { id: r.id, fresh: true };
}

// ------------------------------------------------------------ rilievi
function refIds(p) {
  const s = new Set();
  for (const sh of p.sheets || []) { if (sh.srcId) s.add(sh.srcId); if (sh.baseId) s.add(sh.baseId); for (const o of sh.objs || []) for (const x of o.ph || []) s.add(x); }
  return s;
}
async function pushProject(p, folder, rFiles, remoteId) {
  for (const fid of refIds(p)) {
    if (rFiles.has(fid)) continue;
    const f = await DB.get('files', fid); if (!f) continue;
    st.detail = 'Carico ' + (f.kind === 'photo' ? 'foto' : 'planimetria') + ' di "' + p.name + '"…'; render();
    rFiles.set(fid, await upload({ name: fid + (f.kind === 'photo' ? '.jpg' : f.kind === 'pdf' ? '.pdf' : '.jpg'), parents: [folder], mimeType: f.type || f.blob.type, appProperties: { type: 'file', rcId: fid, pid: p.id, kind: f.kind || '' } }, f.blob));
  }
  const meta = { name: (p.name || 'Rilievo').replace(/[\\/]/g, '-') + '.rilievo.json', mimeType: 'application/json', appProperties: { type: 'project', pid: p.id, upd: String(p.updatedAt) } };
  if (!remoteId) meta.parents = [folder];
  return upload(meta, new Blob([JSON.stringify(p)], { type: 'application/json' }), remoteId);
}
async function fetchProject(r, rFiles) {
  st.detail = 'Scarico "' + (r.name || '').replace(/\.rilievo\.json$/, '') + '"…'; render();
  const p = JSON.parse(await (await download(r.id)).text());
  const blobs = new Map();
  for (const fid of refIds(p)) {
    const loc = await DB.get('files', fid);
    if (loc && loc.pid === p.id) continue;
    const rid = rFiles.get(fid); if (!rid && !loc) continue;
    blobs.set(fid, loc ? { blob: loc.blob, kind: loc.kind, type: loc.type } : { blob: await download(rid), kind: '', type: '' });
  }
  return { p, blobs };
}
async function saveFetched({ p, blobs }) {
  for (const [fid, f] of blobs) await DB.put('files', { id: fid, pid: p.id, kind: f.kind || guessKind(p, fid), type: f.type || f.blob.type, blob: f.blob });
  await DB.put('projects', p);
}
function guessKind(p, fid) { for (const sh of p.sheets) { if (sh.srcId === fid) return 'pdf'; if (sh.baseId === fid) return 'base'; } return 'photo'; }
async function saveAsCopy({ p, blobs }, suffix) {
  const np = JSON.parse(JSON.stringify(p)); np.id = RC.uid(); np.name = (np.name || 'Rilievo') + suffix; np.lastSheet = null; np.updatedAt = Date.now();
  const map = {};
  for (const fid of refIds(p)) {
    let f = blobs.get(fid); if (!f) { const loc = await DB.get('files', fid); if (loc) f = loc; }
    if (!f) continue;
    const nid = RC.uid(); map[fid] = nid;
    await DB.put('files', { id: nid, pid: np.id, kind: f.kind || guessKind(p, fid), type: f.type || f.blob.type, blob: f.blob });
  }
  for (const sh of np.sheets) { sh.id = RC.uid(); if (sh.srcId) sh.srcId = map[sh.srcId]; sh.baseId = map[sh.baseId]; for (const o of sh.objs) if (o.ph) o.ph = o.ph.map((x) => map[x]).filter(Boolean); }
  await DB.put('projects', np);
}

async function run(interactive) {
  if (st.busy || !enabled()) return;
  if (RC.isEditing()) return;
  if (!navigator.onLine) { st.status = 'offline'; render(); return; }
  let token;
  try { token = await getToken(interactive); } catch (e) { st.status = 'error'; st.detail = e.message; render(); return; }
  if (!token) { st.status = 'needauth'; render(); return; }
  st.busy = true; st.status = 'run'; st.detail = 'Controllo Google Drive…'; render();
  let up = 0, down = 0, gone = 0, conflicts = 0;
  try {
    const { id: folder, fresh } = await ensureFolder();
    const remoteP = await listAll("'" + folder + "' in parents and trashed=false and appProperties has { key='type' and value='project' }", 'id,name,appProperties');
    const remoteF = await listAll("'" + folder + "' in parents and trashed=false and appProperties has { key='type' and value='file' }", 'id,appProperties');
    const rFiles = new Map(remoteF.map((f) => [f.appProperties.rcId, f.id]));
    const rProj = new Map(remoteP.map((f) => [f.appProperties.pid, { id: f.id, name: f.name, upd: Number(f.appProperties.upd) || 0 }]));
    const synced = fresh ? {} : ls.get('synced', {});
    // rilievi eliminati su questo dispositivo
    for (const pid of ls.get('tomb', [])) {
      const r = rProj.get(pid);
      if (r) { await trash(r.id); for (const f of remoteF) if (f.appProperties.pid === pid) { await trash(f.id); rFiles.delete(f.appProperties.rcId); } rProj.delete(pid); }
      delete synced[pid];
    }
    ls.set('tomb', []);
    const locals = await DB.all('projects');
    for (const p of locals) {
      const r = rProj.get(p.id); const last = synced[p.id];
      if (!r) {
        if (last != null && p.updatedAt <= last) { await RC.deleteProjectLocal(p.id); delete synced[p.id]; gone++; continue; }
        await pushProject(p, folder, rFiles, null); synced[p.id] = p.updatedAt; up++; continue;
      }
      rProj.delete(p.id);
      if (p.updatedAt === r.upd) { synced[p.id] = r.upd; continue; }
      const localChanged = last == null || p.updatedAt > last, remoteChanged = last == null || r.upd > last;
      if (r.upd > p.updatedAt) {
        const got = await fetchProject(r, rFiles);
        if (localChanged && last != null) { await saveAsCopy({ p, blobs: new Map() }, ' (versione di questo dispositivo)'); conflicts++; }
        await saveFetched(got); synced[p.id] = r.upd; down++;
      } else {
        if (remoteChanged && last != null) { await saveAsCopy(await fetchProject(r, rFiles), ' (versione da altro dispositivo)'); conflicts++; }
        await pushProject(p, folder, rFiles, r.id); synced[p.id] = p.updatedAt; up++;
      }
    }
    for (const [pid, r] of rProj) { await saveFetched(await fetchProject(r, rFiles)); synced[pid] = r.upd; down++; }
    ls.set('synced', synced);
    ls.set('last', Date.now());
    st.status = 'ok';
    const parts = []; if (up) parts.push(up + ' inviati'); if (down) parts.push(down + ' ricevuti'); if (gone) parts.push(gone + ' eliminati'); if (conflicts) parts.push(conflicts + ' copie per modifiche in conflitto');
    st.detail = parts.join(', ');
    if (down || gone || conflicts) await RC.renderHome();
    if (conflicts) toast('Un rilievo era stato modificato su due dispositivi: ho tenuto entrambe le versioni', 5000);
  } catch (e) {
    console.error(e);
    st.status = e instanceof AuthError ? 'needauth' : 'error'; st.detail = e.message;
  } finally { st.busy = false; render(); }
}

// ------------------------------------------------------------ interfaccia
const fmtTime = (t) => { if (!t) return ''; const d = new Date(t), n = new Date(); const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); return d.toDateString() === n.toDateString() ? 'oggi alle ' + hm : d.toLocaleDateString('it-IT') + ' alle ' + hm; };
function render() {
  const box = document.getElementById('syncCard'); if (!box) return;
  box.innerHTML = '';
  const dot = (c) => h('i', { style: { width: '10px', height: '10px', borderRadius: '50%', background: c, flex: 'none', display: 'inline-block' } });
  if (!enabled()) {
    box.append(h('div', { class: 'card' }, h('div', { class: 'main' },
      h('h3', {}, 'Sincronizzazione Google Drive'),
      h('div', { class: 'meta' }, 'Salva i rilievi nel tuo Drive e ritrovali sugli altri dispositivi.'),
      h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn sm primary', onclick: connect }, 'Collega Google Drive')))));
    return;
  }
  let col = 'var(--ok)', title = 'Sincronizzato', sub = ls.get('last', 0) ? 'Ultima sincronizzazione ' + fmtTime(ls.get('last', 0)) : '';
  if (st.status === 'run') { col = 'var(--accent)'; title = 'Sincronizzazione in corso…'; sub = st.detail; }
  else if (st.status === 'needauth') { col = 'var(--accent)'; title = 'Tocca "Sincronizza" per accedere a Google'; }
  else if (st.status === 'offline') { col = 'var(--mute)'; title = 'Nessuna connessione'; sub = 'I rilievi restano sul telefono e verranno inviati alla prossima sincronizzazione.'; }
  else if (st.status === 'error') { col = 'var(--danger)'; title = 'Sincronizzazione non riuscita'; sub = st.detail; }
  else if (st.status === 'ok' && st.detail) sub = sub + ' · ' + st.detail;
  box.append(h('div', { class: 'card' }, h('div', { class: 'main' },
    h('h3', { style: 'display:flex;align-items:center;gap:8px' }, dot(col), title),
    sub ? h('div', { class: 'meta' }, sub) : null,
    h('div', { style: 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap' },
      h('button', { class: 'btn sm primary', disabled: st.busy, onclick: () => run(true) }, st.busy ? 'Attendere…' : 'Sincronizza'),
      h('button', { class: 'btn sm', disabled: st.busy, onclick: settingsDlg }, 'Impostazioni')))));
}
async function connect() {
  if (!clientId()) { const ok = await askClientId(); if (!ok) return; }
  try { await getToken(true); } catch (e) { toast(e.message, 4500); return; }
  ls.set('enabled', true); render(); run(true);
}
async function askClientId() {
  const v = await RC.formDlg('Chiave Google Drive', [{ id: 'cid', label: 'Client ID OAuth', value: clientId(), placeholder: '1234…apps.googleusercontent.com', required: true }], 'Salva',
    'Serve il Client ID creato nella Google Cloud Console (tipo "Applicazione web", origine autorizzata ' + location.origin + ').');
  if (!v) return false;
  const c = v.cid.trim(); if (!/\.apps\.googleusercontent\.com$/.test(c)) { toast('Il Client ID deve finire con .apps.googleusercontent.com', 4500); return false; }
  ls.set('clientId', c); return true;
}
async function settingsDlg() {
  const v = await RC.dialog({
    title: 'Sincronizzazione Google Drive',
    body: h('div', {}, h('p', {}, 'I rilievi vengono salvati nella cartella "' + FOLDER_NAME + '" del tuo Google Drive. La sincronizzazione parte da sola quando apri l\'app e quando chiudi un rilievo.'),
      h('p', { style: 'font-size:12.5px' }, 'Client ID: ' + clientId())),
    buttons: [{ label: 'Chiudi', value: null }, { label: 'Cambia Client ID', value: 'cid' }, { label: 'Scollega', value: 'off', cls: 'danger' }]
  });
  if (v === 'cid') { if (await askClientId()) { dropToken(); ls.set('consented', false); render(); } }
  else if (v === 'off') {
    if (!(await RC.confirmDlg('Scollegare Google Drive?', 'I rilievi restano sul telefono e su Drive, ma smettono di sincronizzarsi.', 'Scollega', true))) return;
    try { if (st.token && window.google) google.accounts.oauth2.revoke(st.token, () => {}); } catch (e) { /* */ }
    dropToken(); ls.set('enabled', false); ls.set('consented', false); ls.del('synced'); ls.del('folderId'); render();
  }
}

window.RCSync = {
  busy: () => st.busy,
  enabled,
  deleted(pid) { const t = ls.get('tomb', []); if (!t.includes(pid)) t.push(pid); ls.set('tomb', t); },
  auto() { render(); if (enabled()) run(false); },
  init() { render(); if (enabled()) run(false); window.addEventListener('online', () => { if (enabled() && !RC.isEditing()) run(false); }); },
  run, _st: st, _ls: ls
};
})();
