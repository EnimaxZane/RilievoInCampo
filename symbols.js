/* Libreria simboli: arredi, idrico-sanitario, termico/clima, elettrico.
   Simboli "pt" = puntuali (dimensione in unità di disegno u)
   Simboli "sz" = in scala reale (larghezza w x profondità h in cm) */
(function () {
  'use strict';
  const PI = Math.PI;
  const CAT = {
    E: { name: 'Elettrico', short: 'Elettr.', color: '#7b2cbf' },
    I: { name: 'Idrico-sanitario', short: 'Idrico', color: '#0a62c9' },
    T: { name: 'Termico e clima', short: 'Termico', color: '#cf3f16' },
    A: { name: 'Arredi', short: 'Arredi', color: '#4f4842' }
  };
  const GAS = '#a87400', HOT = '#cf3f16', COLD = '#0a62c9', WASTE = '#7a4b1e';
  const WHITE = '#ffffff';

  // ---------- primitive ----------
  function circ(c, x, y, r, fill, stroke) {
    c.beginPath(); c.arc(x, y, r, 0, 2 * PI);
    if (fill) { c.save(); c.fillStyle = fill; c.fill(); c.restore(); }
    if (stroke !== false) c.stroke();
  }
  function ln(c, ...p) {
    c.beginPath(); c.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
    c.stroke();
  }
  function rc(c, x, y, w, h, fill, stroke) {
    c.beginPath(); c.rect(x, y, w, h);
    if (fill) { c.save(); c.fillStyle = fill; c.fill(); c.restore(); }
    if (stroke !== false) c.stroke();
  }
  function rrect(c, x, y, w, h, r, fill) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    if (fill) { c.save(); c.fillStyle = fill; c.fill(); c.restore(); }
    c.stroke();
  }
  function ell(c, x, y, rx, ry, fill) {
    c.beginPath(); c.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, 2 * PI);
    if (fill) { c.save(); c.fillStyle = fill; c.fill(); c.restore(); }
    c.stroke();
  }
  function txt(c, s, x, y, size, color, maxW) {
    c.save();
    c.font = '700 ' + size + 'px Roboto, "Segoe UI", Arial, sans-serif';
    if (maxW) {
      const w = c.measureText(s).width;
      if (w > maxW) { size = size * maxW / w; c.font = '700 ' + size + 'px Roboto, "Segoe UI", Arial, sans-serif'; }
    }
    c.fillStyle = color || c.strokeStyle;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(s, x, y + size * 0.04);
    c.restore();
  }
  function tagSize(s, r) { return s.length <= 1 ? r * 0.9 : s.length === 2 ? r * 0.72 : r * 0.55; }

  // ---------- generatori puntuali ----------
  const presa = (tag) => (c, d) => {
    const r = d.r;
    c.beginPath(); c.moveTo(-r * 0.9, r * 0.3); c.arc(0, r * 0.3, r * 0.9, PI, 0); c.closePath();
    c.save(); c.fillStyle = WHITE; c.fill(); c.restore(); c.stroke();
    ln(c, 0, r * 0.3, 0, r * 0.95);
    if (tag) txt(c, tag, 0, -r * 0.1, tagSize(tag, r) * 0.8, d.col, r * 1.3);
  };
  const circTag = (tag, col) => (c, d) => {
    const r = d.r; if (col) { c.strokeStyle = col; }
    circ(c, 0, 0, r * 0.82, WHITE);
    txt(c, tag, 0, 0, tagSize(tag, r) * 0.95, col || d.col, r * 1.35);
  };
  const rectTag = (tag, col) => (c, d) => {
    const r = d.r; if (col) c.strokeStyle = col;
    rc(c, -r * 0.95, -r * 0.62, r * 1.9, r * 1.24, WHITE);
    txt(c, tag, 0, 0, tagSize(tag, r) * 0.95, col || d.col, r * 1.65);
  };
  const filledTag = (tag, col) => (c, d) => {
    const r = d.r;
    c.strokeStyle = col; circ(c, 0, 0, r * 0.72, col);
    txt(c, tag, 0, 0, r * 0.85, WHITE);
  };
  const valve = (col, head) => (c, d) => {
    const r = d.r; if (col) c.strokeStyle = col;
    c.beginPath();
    c.moveTo(-r * 0.85, -r * 0.45); c.lineTo(0, 0); c.lineTo(-r * 0.85, r * 0.45); c.closePath();
    c.moveTo(r * 0.85, -r * 0.45); c.lineTo(0, 0); c.lineTo(r * 0.85, r * 0.45); c.closePath();
    c.save(); c.fillStyle = WHITE; c.fill(); c.restore(); c.stroke();
    if (head === 'stem') { ln(c, 0, 0, 0, -r * 0.7); ln(c, -r * 0.3, -r * 0.7, r * 0.3, -r * 0.7); }
    if (head === 'therm') { ln(c, 0, 0, 0, -r * 0.45); circ(c, 0, -r * 0.65, r * 0.22, WHITE); }
    if (head === 'three') {
      c.beginPath(); c.moveTo(-r * 0.45, r * 0.85); c.lineTo(0, 0); c.lineTo(r * 0.45, r * 0.85); c.closePath();
      c.save(); c.fillStyle = WHITE; c.fill(); c.restore(); c.stroke();
    }
  };
  const pump = (col) => (c, d) => {
    const r = d.r; if (col) c.strokeStyle = col;
    circ(c, 0, 0, r * 0.8, WHITE);
    c.beginPath(); c.moveTo(-r * 0.35, -r * 0.55); c.lineTo(r * 0.65, 0); c.lineTo(-r * 0.35, r * 0.55); c.closePath(); c.stroke();
  };
  const collettore = (c, d) => {
    const r = d.r;
    rc(c, -r * 0.95, -r * 0.3, r * 1.9, r * 0.6, WHITE);
    for (let i = -2; i <= 2; i++) ln(c, i * r * 0.36, r * 0.3, i * r * 0.36, r * 0.75);
  };
  const luce = (c, d) => {
    const r = d.r, k = r * 0.46;
    circ(c, 0, 0, r * 0.66, WHITE);
    ln(c, -k, -k, k, k); ln(c, -k, k, k, -k);
  };

  // ---------- definizioni ----------
  const L = [];
  function pt(cat, id, name, draw, extra) { L.push(Object.assign({ id, cat, name, kind: 'pt', draw }, extra || {})); }
  function sz(cat, id, name, w, h, draw, extra) { L.push(Object.assign({ id, cat, name, kind: 'sz', w, h, draw }, extra || {})); }

  // ELETTRICO
  pt('E', 'presa10', 'Presa 10A', presa('10'));
  pt('E', 'presa16', 'Presa 16A', presa('16'));
  pt('E', 'bipasso', 'Presa bipasso 10/16A', presa('B'));
  pt('E', 'schuko', 'Presa Schuko', presa('S'));
  pt('E', 'presaC', 'Presa comandata', presa('C'));
  pt('E', 'presaUSB', 'Presa USB', presa('USB'));
  pt('E', 'presaTV', 'Presa TV', presa('TV'));
  pt('E', 'presaSAT', 'Presa SAT', presa('SAT'));
  pt('E', 'presaLAN', 'Presa dati RJ45', presa('LAN'));
  pt('E', 'presaTEL', 'Presa telefono', presa('TEL'));
  pt('E', 'presaCEE', 'Presa industriale CEE', presa('CEE'));
  pt('E', 'interr', 'Interruttore', (c, d) => {
    const r = d.r; circ(c, 0, 0, r * 0.9, WHITE, false);
    circ(c, -r * 0.35, r * 0.35, r * 0.18, d.col);
    ln(c, -r * 0.35, r * 0.35, r * 0.5, -r * 0.5, r * 0.78, -r * 0.22);
  });
  pt('E', 'deviat', 'Deviatore', (c, d) => {
    const r = d.r; circ(c, 0, 0, r * 0.9, WHITE, false);
    circ(c, 0, 0, r * 0.17, d.col);
    ln(c, -r * 0.55, r * 0.55, r * 0.55, -r * 0.55);
    ln(c, r * 0.55, -r * 0.55, r * 0.8, -r * 0.3); ln(c, -r * 0.55, r * 0.55, -r * 0.8, r * 0.3);
  });
  pt('E', 'invert', 'Invertitore', (c, d) => {
    const r = d.r; circ(c, 0, 0, r * 0.9, WHITE, false);
    circ(c, 0, 0, r * 0.17, d.col);
    ln(c, -r * 0.55, r * 0.55, r * 0.55, -r * 0.55); ln(c, -r * 0.55, -r * 0.55, r * 0.55, r * 0.55);
    ln(c, r * 0.55, -r * 0.55, r * 0.8, -r * 0.3); ln(c, -r * 0.55, -r * 0.55, -r * 0.8, -r * 0.3);
  });
  pt('E', 'puls', 'Pulsante', (c, d) => { const r = d.r; circ(c, 0, 0, r * 0.62, WHITE); circ(c, 0, 0, r * 0.22, d.col); });
  pt('E', 'tirante', 'Pulsante a tirante', (c, d) => {
    const r = d.r; circ(c, 0, -r * 0.2, r * 0.55, WHITE); circ(c, 0, -r * 0.2, r * 0.18, d.col); ln(c, 0, r * 0.35, 0, r * 0.95);
  });
  pt('E', 'dimmer', 'Dimmer / regolatore', (c, d) => {
    const r = d.r; circ(c, 0, 0, r * 0.9, WHITE, false);
    circ(c, -r * 0.35, r * 0.35, r * 0.18, d.col);
    ln(c, -r * 0.35, r * 0.35, r * 0.5, -r * 0.5, r * 0.78, -r * 0.22);
    ln(c, -r * 0.7, -r * 0.1, -r * 0.1, -r * 0.7);
  });
  pt('E', 'luce', 'Punto luce a soffitto', luce);
  pt('E', 'applique', 'Punto luce a parete', (c, d) => { luce(c, d); ln(c, -d.r * 0.8, d.r * 0.88, d.r * 0.8, d.r * 0.88); });
  pt('E', 'faretto', 'Faretto a incasso', (c, d) => { const r = d.r; circ(c, 0, 0, r * 0.45, WHITE); circ(c, 0, 0, r * 0.16, d.col); });
  pt('E', 'emerg', 'Lampada di emergenza', (c, d) => { luce(c, d); circ(c, 0, 0, d.r * 0.9); });
  pt('E', 'quadro', 'Quadro elettrico', (c, d) => {
    const r = d.r; rc(c, -r * 0.95, -r * 0.55, r * 1.9, r * 1.1, WHITE);
    c.beginPath(); c.moveTo(r * 0.95, -r * 0.55); c.lineTo(r * 0.95, r * 0.55); c.lineTo(-r * 0.95, r * 0.55); c.closePath();
    c.save(); c.fillStyle = d.col; c.fill(); c.restore();
  });
  pt('E', 'contatoreE', 'Contatore energia', rectTag('kWh'));
  pt('E', 'deriv', 'Scatola di derivazione', (c, d) => { const r = d.r; rc(c, -r * 0.5, -r * 0.5, r, r, WHITE); ln(c, -r * 0.5, -r * 0.5, r * 0.5, r * 0.5); });
  pt('E', 'citof', 'Citofono', rectTag('CT'));
  pt('E', 'videoc', 'Videocitofono', rectTag('VC'));
  pt('E', 'campan', 'Campanello / suoneria', (c, d) => {
    const r = d.r; circ(c, 0, 0, r * 0.9, WHITE, false);
    c.beginPath(); c.moveTo(-r * 0.6, r * 0.35); c.arc(0, r * 0.35, r * 0.6, PI, 0); c.closePath(); c.stroke();
    ln(c, -r * 0.85, r * 0.35, r * 0.85, r * 0.35);
  });
  pt('E', 'fumo', 'Rilevatore di fumo', circTag('RF'));
  pt('E', 'presenza', 'Sensore di presenza', circTag('IR'));
  pt('E', 'router', 'Router / centralino dati', rectTag('RT'));
  pt('E', 'inverter', 'Inverter fotovoltaico', rectTag('INV'));
  pt('E', 'terra', 'Dispersore di terra', (c, d) => {
    const r = d.r; circ(c, 0, 0, r * 0.9, WHITE, false);
    ln(c, 0, -r * 0.8, 0, 0); ln(c, -r * 0.65, 0, r * 0.65, 0); ln(c, -r * 0.42, r * 0.28, r * 0.42, r * 0.28); ln(c, -r * 0.18, r * 0.56, r * 0.18, r * 0.56);
  });
  pt('E', 'puntoE', 'Punto elettrico generico', (c, d) => { circ(c, 0, 0, d.r * 0.35, d.col); });

  // IDRICO-SANITARIO
  pt('I', 'af', 'Attacco acqua fredda', filledTag('F', COLD));
  pt('I', 'ac', 'Attacco acqua calda', filledTag('C', HOT), { color: HOT });
  pt('I', 'scarico', 'Scarico', (c, d) => { const r = d.r; c.strokeStyle = WASTE; circ(c, 0, 0, r * 0.7, WHITE); circ(c, 0, 0, r * 0.3, WASTE); }, { color: WASTE });
  pt('I', 'attLV', 'Attacco lavatrice', rectTag('LV'));
  pt('I', 'attLS', 'Attacco lavastoviglie', rectTag('LS'));
  pt('I', 'valv', 'Rubinetto / valvola di arresto', valve(null, 'stem'));
  pt('I', 'contA', 'Contatore acqua', rectTag('m³'));
  pt('I', 'riduttore', 'Riduttore di pressione', rectTag('RP'));
  pt('I', 'filtro', 'Filtro / addolcitore', rectTag('FIL'));
  pt('I', 'collI', 'Collettore idrico', collettore);
  pt('I', 'pozzetto', 'Pozzetto', (c, d) => { const r = d.r; c.strokeStyle = WASTE; rc(c, -r * 0.65, -r * 0.65, r * 1.3, r * 1.3, WHITE); ln(c, -r * 0.65, -r * 0.65, r * 0.65, r * 0.65); ln(c, -r * 0.65, r * 0.65, r * 0.65, -r * 0.65); }, { color: WASTE });
  pt('I', 'colonna', 'Colonna di scarico', (c, d) => { const r = d.r; c.strokeStyle = WASTE; circ(c, 0, 0, r * 0.75, WHITE); circ(c, 0, 0, r * 0.42); }, { color: WASTE });
  pt('I', 'piletta', 'Piletta a pavimento', (c, d) => {
    const r = d.r; c.strokeStyle = WASTE; circ(c, 0, 0, r * 0.65, WHITE);
    ln(c, -r * 0.65, 0, r * 0.65, 0); ln(c, 0, -r * 0.65, 0, r * 0.65);
  }, { color: WASTE });
  pt('I', 'sfiato', 'Ventilazione / sfiato', circTag('V', WASTE), { color: WASTE });
  pt('I', 'boiler', 'Scaldabagno / boiler', circTag('B'));
  pt('I', 'pompaI', 'Pompa / autoclave', pump());
  pt('I', 'rubEst', 'Rubinetto esterno', rectTag('RE'));

  // TERMICO E CLIMA
  pt('T', 'termost', 'Termostato ambiente', circTag('T'));
  pt('T', 'crono', 'Cronotermostato', circTag('CT'));
  pt('T', 'sondaEst', 'Sonda esterna', circTag('SE'));
  pt('T', 'valvTerm', 'Valvola termostatica', valve(null, 'therm'));
  pt('T', 'valv3', 'Valvola miscelatrice / 3 vie', valve(null, 'three'));
  pt('T', 'valvT', 'Valvola di intercettazione', valve(null, 'stem'));
  pt('T', 'collT', 'Collettore riscaldamento', collettore);
  pt('T', 'circol', 'Circolatore', pump());
  pt('T', 'vaso', 'Vaso di espansione', (c, d) => { const r = d.r; circ(c, 0, 0, r * 0.75, WHITE); ln(c, -r * 0.75, 0, r * 0.75, 0); });
  pt('T', 'contG', 'Contatore gas', rectTag('G', GAS), { color: GAS });
  pt('T', 'rubG', 'Rubinetto gas', valve(GAS, 'stem'), { color: GAS });
  pt('T', 'canna', 'Canna fumaria', (c, d) => { const r = d.r; rc(c, -r * 0.7, -r * 0.7, r * 1.4, r * 1.4, WHITE); circ(c, 0, 0, r * 0.42); });
  pt('T', 'aria', "Presa d'aria / aerazione", (c, d) => {
    const r = d.r; rc(c, -r * 0.7, -r * 0.7, r * 1.4, r * 1.4, WHITE);
    for (let i = -1; i <= 1; i++) ln(c, -r * 0.45, i * r * 0.35, r * 0.45, i * r * 0.35);
  });

  // ---- in scala: drawing helpers (w,h in px, centro in 0,0) ----
  const box = (c, w, h, fill) => rc(c, -w / 2, -h / 2, w, h, fill === undefined ? 'rgba(255,255,255,0.82)' : fill);
  const lbl = (c, d, s) => txt(c, s, 0, 0, Math.min(d.h * 0.5, d.u * 0.45), d.col, d.w * 0.85);

  // IDRICO in scala
  sz('I', 'wc', 'WC', 37, 55, (c, d) => {
    const { w, h } = d; box(c, w, h * 0.27, 'rgba(255,255,255,0.85)');
    c.translate(0, -h / 2 + h * 0.135);
    ell(c, 0, h * 0.135 + (h * 0.73) / 2, w * 0.45, h * 0.73 / 2, 'rgba(255,255,255,0.85)');
    ell(c, 0, h * 0.135 + (h * 0.73) / 2 + h * 0.03, w * 0.28, h * 0.25);
  });
  sz('I', 'bidet', 'Bidet', 37, 55, (c, d) => {
    const { w, h } = d; ell(c, 0, 0, w / 2, h / 2, 'rgba(255,255,255,0.85)'); ell(c, 0, h * 0.06, w * 0.3, h * 0.3); circ(c, 0, -h * 0.36, Math.min(w, h) * 0.05, d.col);
  });
  sz('I', 'lavabo', 'Lavabo', 60, 48, (c, d) => {
    const { w, h } = d; rrect(c, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.15, 'rgba(255,255,255,0.85)'); ell(c, 0, h * 0.08, w * 0.36, h * 0.3); circ(c, 0, -h * 0.34, Math.min(w, h) * 0.05, d.col);
  });
  sz('I', 'doccia', 'Piatto doccia', 80, 80, (c, d) => {
    const { w, h } = d; box(c, w, h); c.save(); c.lineWidth *= 0.5; ln(c, -w / 2, -h / 2, w / 2, h / 2); ln(c, -w / 2, h / 2, w / 2, -h / 2); c.restore(); circ(c, 0, 0, Math.min(w, h) * 0.07, WHITE);
  });
  sz('I', 'vasca', 'Vasca da bagno', 170, 70, (c, d) => {
    const { w, h } = d; box(c, w, h); rrect(c, -w / 2 + h * 0.12, -h / 2 + h * 0.12, w - h * 0.24, h * 0.76, h * 0.3); circ(c, -w / 2 + h * 0.4, 0, h * 0.06, d.col);
  });
  sz('I', 'lavello', 'Lavello cucina', 120, 60, (c, d) => {
    const { w, h } = d; box(c, w, h); rrect(c, -w * 0.42, -h * 0.32, w * 0.42, h * 0.64, h * 0.08);
    c.save(); c.lineWidth *= 0.5; for (let i = 1; i <= 4; i++) ln(c, w * 0.08, -h * 0.3 + i * h * 0.12, w * 0.44, -h * 0.3 + i * h * 0.12); c.restore();
  });
  sz('I', 'lavatrice', 'Lavatrice', 60, 60, (c, d) => { const { w, h } = d; box(c, w, h); circ(c, 0, 0, Math.min(w, h) * 0.32); });
  sz('I', 'asciug', 'Asciugatrice', 60, 60, (c, d) => { const { w, h } = d; box(c, w, h); circ(c, 0, 0, Math.min(w, h) * 0.32); lbl(c, { ...d, h: h * 0.5 }, 'A'); });
  sz('I', 'lavatoio', 'Lavatoio', 60, 60, (c, d) => { const { w, h } = d; box(c, w, h); rrect(c, -w * 0.38, -h * 0.3, w * 0.76, h * 0.68, Math.min(w, h) * 0.08); });

  // TERMICO in scala
  sz('T', 'radiatore', 'Radiatore', 80, 10, (c, d) => {
    const { w, h } = d; box(c, w, h); const n = Math.max(3, Math.round(w / (d.h * 0.6)));
    c.save(); c.lineWidth *= 0.6; for (let i = 1; i < n; i++) { const x = -w / 2 + i * w / n; ln(c, x, -h / 2, x, h / 2); } c.restore();
  });
  sz('T', 'scaldas', 'Scaldasalviette', 50, 8, (c, d) => { const { w, h } = d; box(c, w, h); ln(c, -w / 2, 0, w / 2, 0); });
  sz('T', 'caldaia', 'Caldaia', 45, 35, (c, d) => { box(c, d.w, d.h); lbl(c, d, 'CALDAIA'); });
  sz('T', 'fancoil', 'Ventilconvettore', 80, 22, (c, d) => { box(c, d.w, d.h); lbl(c, d, 'FC'); });
  sz('T', 'split', 'Split clima (interno)', 80, 20, (c, d) => {
    const { w, h } = d; box(c, w, h); ln(c, -w / 2, h * 0.22, w / 2, h * 0.22); lbl(c, { ...d, h: h * 0.7 }, 'SPLIT');
  });
  sz('T', 'ue', 'Unità esterna clima', 80, 30, (c, d) => {
    const { w, h } = d; box(c, w, h); const r = Math.min(h * 0.4, w * 0.2); circ(c, w / 2 - r * 1.4, 0, r);
    ln(c, w / 2 - r * 1.4 - r, 0, w / 2 - r * 0.4, 0); ln(c, w / 2 - r * 1.4, -r, w / 2 - r * 1.4, r);
  });
  sz('T', 'pdc', 'Pompa di calore', 100, 40, (c, d) => {
    const { w, h } = d; box(c, w, h); const r = Math.min(h * 0.38, w * 0.2); circ(c, w / 2 - r * 1.4, 0, r); txt(c, 'PdC', -w * 0.12, 0, Math.min(h * 0.45, d.u * 0.45), d.col, w * 0.5);
  });
  sz('T', 'stufa', 'Stufa / camino', 70, 50, (c, d) => { box(c, d.w, d.h); circ(c, 0, -d.h * 0.5, Math.min(d.w, d.h) * 0.12, WHITE); lbl(c, { ...d, h: d.h * 0.6 }, 'STUFA'); });
  sz('T', 'puffer', 'Accumulo / puffer', 60, 60, (c, d) => { ell(c, 0, 0, d.w / 2, d.h / 2, 'rgba(255,255,255,0.85)'); lbl(c, d, 'ACC'); });

  // ARREDI
  const A = (id, name, w, h, fn) => sz('A', id, name, w, h, fn);
  A('letto2', 'Letto matrimoniale', 160, 200, (c, d) => {
    const { w, h } = d; box(c, w, h); const pw = w * 0.4, ph = h * 0.13;
    rrect(c, -w / 2 + w * 0.06, -h / 2 + h * 0.04, pw, ph, ph * 0.3); rrect(c, w / 2 - w * 0.06 - pw, -h / 2 + h * 0.04, pw, ph, ph * 0.3);
    ln(c, -w / 2, -h / 2 + h * 0.27, w / 2, -h / 2 + h * 0.27);
  });
  A('letto1', 'Letto singolo', 90, 200, (c, d) => {
    const { w, h } = d; box(c, w, h); const ph = h * 0.13; rrect(c, -w * 0.38, -h / 2 + h * 0.04, w * 0.76, ph, ph * 0.3); ln(c, -w / 2, -h / 2 + h * 0.27, w / 2, -h / 2 + h * 0.27);
  });
  const sofa = (n) => (c, d) => {
    const { w, h } = d; box(c, w, h); const a = Math.min(w * 0.12, h * 0.22), b = h * 0.24;
    rc(c, -w / 2, -h / 2, w, b, false); rc(c, -w / 2, -h / 2, a, h, false); rc(c, w / 2 - a, -h / 2, a, h, false);
    const sw = (w - 2 * a) / n; for (let i = 1; i < n; i++) ln(c, -w / 2 + a + i * sw, -h / 2 + b, -w / 2 + a + i * sw, h / 2);
  };
  A('divano3', 'Divano 3 posti', 210, 90, sofa(3));
  A('divano2', 'Divano 2 posti', 160, 90, sofa(2));
  A('poltrona', 'Poltrona', 80, 80, sofa(1));
  A('tavolo', 'Tavolo', 160, 90, (c, d) => box(c, d.w, d.h));
  A('tavoloR', 'Tavolo rotondo', 110, 110, (c, d) => ell(c, 0, 0, d.w / 2, d.h / 2, 'rgba(255,255,255,0.82)'));
  A('sedia', 'Sedia', 45, 45, (c, d) => { const { w, h } = d; box(c, w, h); ln(c, -w / 2, -h / 2 + h * 0.18, w / 2, -h / 2 + h * 0.18); });
  A('armadio', 'Armadio', 180, 60, (c, d) => {
    const { w, h } = d; box(c, w, h); c.save(); c.setLineDash([h * 0.12, h * 0.08]); ln(c, -w / 2 + h * 0.1, 0, w / 2 - h * 0.1, 0); c.restore();
  });
  A('comodino', 'Comodino', 45, 40, (c, d) => box(c, d.w, d.h));
  A('scrivania', 'Scrivania', 120, 60, (c, d) => box(c, d.w, d.h));
  A('libreria', 'Libreria / scaffale', 100, 35, (c, d) => {
    const { w, h } = d; box(c, w, h); const n = Math.max(2, Math.round(w / (h * 1.6))); for (let i = 1; i < n; i++) ln(c, -w / 2 + i * w / n, -h / 2, -w / 2 + i * w / n, h / 2);
  });
  A('mobileTV', 'Mobile TV / credenza', 160, 45, (c, d) => { const { w, h } = d; box(c, w, h); ln(c, -w / 2, h * 0.25, w / 2, h * 0.25); });
  A('cucina', 'Cucina (basi)', 240, 60, (c, d) => {
    const { w, h } = d; box(c, w, h); const n = Math.max(1, Math.round(w / h)); for (let i = 1; i < n; i++) ln(c, -w / 2 + i * w / n, -h / 2, -w / 2 + i * w / n, h / 2);
  });
  A('fuochi', 'Piano cottura', 60, 60, (c, d) => {
    const { w, h } = d; box(c, w, h); const r = Math.min(w, h) * 0.13;
    circ(c, -w * 0.22, -h * 0.22, r); circ(c, w * 0.22, -h * 0.22, r); circ(c, -w * 0.22, h * 0.22, r); circ(c, w * 0.22, h * 0.22, r);
  });
  A('frigo', 'Frigorifero', 60, 65, (c, d) => { box(c, d.w, d.h); lbl(c, d, 'FR'); });
  A('forno', 'Forno', 60, 60, (c, d) => { box(c, d.w, d.h); lbl(c, d, 'FO'); });
  A('lavast', 'Lavastoviglie', 60, 60, (c, d) => { box(c, d.w, d.h); lbl(c, d, 'LS'); });
  A('mobile', 'Mobile generico', 100, 50, (c, d) => { const { w, h } = d; box(c, w, h); ln(c, -w / 2, -h / 2, w / 2, h / 2); });
  A('porta', 'Porta a battente', 80, 80, (c, d) => {
    const { w, h } = d; c.save(); c.lineWidth *= 1.4; ln(c, -w / 2, h / 2, -w / 2, -h / 2); c.restore();
    c.save(); c.lineWidth *= 0.6; c.setLineDash([w * 0.05, w * 0.04]);
    c.beginPath(); c.ellipse(-w / 2, h / 2, w, h, 0, -PI / 2, 0); c.stroke(); c.restore();
  });
  A('scorrevole', 'Porta scorrevole', 80, 10, (c, d) => {
    const { w, h } = d; box(c, w, h); ln(c, -w * 0.3, 0, w * 0.3, 0); ln(c, w * 0.18, -h * 0.3, w * 0.3, 0, w * 0.18, h * 0.3);
  });
  A('finestra', 'Finestra', 120, 30, (c, d) => {
    const { w, h } = d; box(c, w, h); ln(c, -w / 2, -h * 0.12, w / 2, -h * 0.12); ln(c, -w / 2, h * 0.12, w / 2, h * 0.12);
  });

  const BY_ID = {}; L.forEach((s) => { BY_ID[s.id] = s; s.color = s.color || CAT[s.cat].color; });

  // Stili tracciati
  const LINES = {
    af: { name: 'Acqua fredda', tag: 'AF', color: COLD, dash: null, w: 1, cat: 'I' },
    ac: { name: 'Acqua calda', tag: 'AC', color: HOT, dash: null, w: 1, cat: 'I' },
    ric: { name: 'Ricircolo', tag: 'RIC', color: HOT, dash: [3, 2], w: 0.8, cat: 'I' },
    sc: { name: 'Scarico', tag: 'S', color: WASTE, dash: null, w: 1.8, cat: 'I' },
    mr: { name: 'Mandata riscaldamento', tag: 'M', color: '#e8590c', dash: null, w: 1, cat: 'T' },
    rr: { name: 'Ritorno riscaldamento', tag: 'R', color: '#1c7ed6', dash: [4, 2], w: 1, cat: 'T' },
    gas: { name: 'Gas', tag: 'G', color: GAS, dash: [5, 1.5, 1, 1.5], w: 1.1, cat: 'T' },
    el: { name: 'Linea elettrica', tag: 'EL', color: '#7b2cbf', dash: [2.5, 1.5], w: 0.8, cat: 'E' },
    dati: { name: 'Linea dati / TV', tag: 'D', color: '#2b8a3e', dash: [1.2, 1.2], w: 0.8, cat: 'E' },
    gen: { name: 'Generico', tag: '', color: '#333333', dash: null, w: 0.8, cat: '' }
  };

  window.SYMS = { CAT, LIST: L, BY_ID, LINES, txt };
})();
