/* =========================================================================
   Dashboard Conta Casinha — Tráfego pago (captação: LEAD + MENSAGEM)
   3 abas: Visão Geral · Tráfego Pago · Relatório.
   Dados: window.DASH (data.js) — daily[] (funil/dia) + grain[] (dia × anúncio).
   Fonte: Meta Graph API (insights nível anúncio). Resultado-headline = LEADS
   de formulário; mensagens (1ª resposta) como resultado secundário.
   CTR sempre de LINK. Imposto ×1,1385 sobre todo gasto.
   ========================================================================= */
(function () {
  "use strict";
  var D = window.DASH || {};
  var CLIENT = !!window.__CLIENT__;   // página do cliente (ranking.html): Visão Geral enxuta, sem aba Tráfego
  var arr = function (x) { return Array.isArray(x) ? x : (x ? [x] : []); };
  var daily = arr(D.daily).slice().sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  var grain = arr(D.grain);
  var TAX = D.tax || 1.1385;

  /* ---------------------------------------------------------------- formato */
  var nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf4 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
  function ok(v) { return v !== null && v !== undefined && isFinite(v); }
  function money(v) { return (v < 0 ? '−R$ ' : 'R$ ') + nf2.format(Math.abs(v || 0)); }
  function money0(v) { return (v < 0 ? '−R$ ' : 'R$ ') + nf0.format(Math.round(Math.abs(v || 0))); }
  function int(v) { return nf0.format(Math.round(v || 0)); }
  function pct1(v) { return nf1.format((v || 0) * 100) + '%'; }
  function taxStr(v) { return nf4.format(v || 1); }
  var M = {
    money: function (v) { return ok(v) ? money(v) : '—'; },
    money0: function (v) { return ok(v) ? money0(v) : '—'; },
    int: function (v) { return ok(v) ? int(v) : '—'; },
    pct1: function (v) { return ok(v) ? pct1(v) : '—'; }
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function $(id) { return document.getElementById(id); }
  function div(a, b) { return b > 0 ? a / b : null; }

  function dayAdd(ds, n) { var p = ds.split('-'); var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); }
  function brDate(ds) { var p = ds.split('-'); return p[2] + '/' + p[1]; }
  function brFull(ds) { var p = ds.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function diffDays(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5); }

  /* ---------------------------------------------------------------- período */
  var minDate = daily.length ? daily[0].d : '2026-01-01';
  var maxDate = daily.length ? daily[daily.length - 1].d : '2026-01-01';
  function firstOfMonth(ds) { return ds.slice(0, 7) + '-01'; }
  function clampD(ds) { return ds < minDate ? minDate : (ds > maxDate ? maxDate : ds); }

  var STATE = {
    from: minDate, to: maxDate, preset: 'month', compare: false, tab: 'overview',
    metric: 'spend', treeSort: { key: 'spend', dir: -1 }, expanded: {}, camps: null
  };
  // lista de campanhas presentes (por gasto desc)
  var CAMP_SPEND = {}; grain.forEach(function (g) { CAMP_SPEND[g.camp] = (CAMP_SPEND[g.camp] || 0) + g.spend; });
  var ALL_CAMPS = Object.keys(CAMP_SPEND).sort(function (a, b) { return CAMP_SPEND[b] - CAMP_SPEND[a]; });
  function campOK(c) { return !STATE.camps || STATE.camps[c] === true; }
  function campFilterActive() { return !!STATE.camps; }
  function campSelectedCount() { return STATE.camps ? Object.keys(STATE.camps).filter(function (k) { return STATE.camps[k]; }).length : ALL_CAMPS.length; }

  /* ---------------------------------------------------------------- objetivo da campanha */
  function funnelOf(camp) {
    var c = String(camp || '').toUpperCase();
    if (/\bLEAD/.test(c) || c.indexOf('FORM') >= 0) return 'Leads';
    if (/\bENG\b|WHATS|MENSAG|MSG|DIRECT/.test(c)) return 'Mensagens';
    return 'Outros';
  }
  function within(d, from, to) { return d >= from && d <= to; }

  /* ---------------------------------------------------------------- agregação (daily) */
  function blank() { return { spend: 0, impr: 0, reach: 0, clk: 0, lead: 0, msg: 0 }; }
  function spendByFunnel(from, to) {
    var o = { Leads: 0, Mensagens: 0, Outros: 0, total: 0 };
    for (var i = 0; i < grain.length; i++) { var g = grain[i]; if (!within(g.d, from, to)) continue; o[funnelOf(g.camp)] += g.spend; o.total += g.spend; }
    return o;
  }
  function derive(t) {
    var o = Object.assign({}, t);
    o.cpm = div(t.spend * 1000, t.impr);
    o.ctr = div(t.clk, t.impr);         // CTR de LINK (clk = link clicks)
    o.cpc = div(t.spend, t.clk);
    o.cpl = div(t.spend, t.lead);       // custo por lead (resultado-headline)
    o.cpmsg = div(t.spend, t.msg);      // custo por mensagem (secundário)
    o.leadRate = div(t.lead, t.clk);    // clique → lead
    o.result = (t.lead || 0) + (t.msg || 0);   // contatos totais (info)
    o.cpr = div(t.spend, o.result);     // custo por contato (info)
    return o;
  }
  function aggregate(from, to) {
    var t = blank();
    // tudo vem do grain (tem campanha) → respeita o filtro de campanha
    for (var i = 0; i < grain.length; i++) {
      var g = grain[i]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      t.spend += g.spend; t.impr += g.impr; t.reach += g.reach; t.clk += g.clk; t.lead += g.lead; t.msg += g.msg;
    }
    return derive(t);
  }
  function dailyRows(from, to) {
    var md = {};
    for (var j = 0; j < grain.length; j++) {
      var g = grain[j]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      var m = md[g.d] || (md[g.d] = { spend: 0, impr: 0, reach: 0, clk: 0, lead: 0, msg: 0 });
      m.spend += g.spend; m.impr += g.impr; m.reach += g.reach; m.clk += g.clk; m.lead += g.lead; m.msg += g.msg;
    }
    var out = [];
    for (var i = 0; i < daily.length; i++) {
      var x = daily[i]; if (!within(x.d, from, to)) continue;
      var m = md[x.d]; if (!m) { if (campFilterActive()) continue; m = { spend: x.spend, impr: x.impr, reach: x.reach, clk: x.clk, lead: x.lead, msg: x.msg }; }
      out.push(derive(Object.assign(blank(), { d: x.d }, m)));
    }
    return out;
  }

  /* ---------------------------------------------------------------- régua de benchmarks (Leandro)
     Classifica cada métrica em bom / médio / ruim. dir 'high' = maior é melhor. */
  var BANDS = {
    ctr: { label: 'CTR (link)', good: 0.01, mid: 0.006, dir: 'high', fmt: M.pct1 },
    cpc: { label: 'CPC (link)', good: 2, mid: 4, dir: 'low', fmt: M.money },
    cpm: { label: 'CPM', good: 35, mid: 60, dir: 'low', fmt: M.money }
  };
  function statusOf(v, b) {
    if (!ok(v)) return null;
    var lvl;
    if (b.dir === 'high') lvl = v >= b.good ? 'good' : v >= b.mid ? 'warn' : 'bad';
    else lvl = v <= b.good ? 'good' : v <= b.mid ? 'warn' : 'bad';
    var word = lvl === 'good' ? 'bom' : lvl === 'warn' ? 'médio' : 'ruim';
    var cls = lvl === 'good' ? 'g' : lvl === 'warn' ? 'y' : 'r';
    return { lvl: lvl, word: word, cls: cls };
  }
  function scoreOf(v, b) {
    if (!ok(v)) return null;
    if (b.dir === 'high') {
      if (v >= b.good) return 100;
      if (v >= b.mid) return 60 + (v - b.mid) / (b.good - b.mid) * 30;
      return Math.max(5, v / b.mid * 55);
    } else {
      if (v <= b.good) return 100;
      if (v <= b.mid) return 60 + (b.mid - v) / (b.mid - b.good) * 30;
      return Math.max(5, 55 - (v - b.mid) / b.mid * 55);
    }
  }
  var scoreColor = function (s) { return s == null ? 'var(--ink-3)' : s >= 75 ? 'var(--good)' : s >= 50 ? 'var(--warning)' : 'var(--critical)'; };
  var bandLabel = function (s) { return s == null ? 'sem dados' : s >= 80 ? 'Saudável' : s >= 60 ? 'Bom' : s >= 40 ? 'Atenção' : 'Crítico'; };

  // saúde = qualidade da mídia (CTR/CPC/CPM). Custo por lead varia por nicho → fora da nota.
  var HEALTH_KEYS = ['ctr', 'cpc', 'cpm'];
  function health(a) {
    var bars = HEALTH_KEYS.map(function (k) {
      var b = BANDS[k], v = a[k], sc = scoreOf(v, b);
      return { label: b.label, valueStr: b.fmt(v), score: sc, band: b, cls: (statusOf(v, b) || {}).cls };
    });
    var valid = bars.filter(function (b) { return b.score != null; });
    var score = valid.length ? Math.round(valid.reduce(function (s, b) { return s + b.score; }, 0) / valid.length) : null;
    return { score: score, band: bandLabel(score), bars: bars };
  }

  /* ---------------------------------------------------------------- SVG helpers */
  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(n, at) { var e = document.createElementNS(NS, n); for (var k in at) e.setAttribute(k, at[k]); return e; }
  function niceMax(v) { if (!(v > 0)) return 1; var e = Math.pow(10, Math.floor(Math.log10(v))); var f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  function ticks(max, n) { n = n || 4; var out = []; for (var i = 0; i <= n; i++) out.push(max * i / n); return out; }
  function labelStep(count, width) { return Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / 58)))); }

  var TIP = null;
  function showTip(html, ev) {
    TIP.innerHTML = html; TIP.style.opacity = 1;
    var r = TIP.getBoundingClientRect();
    var x = ev.clientX + 14, y = ev.clientY - r.height - 12;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y < 8) y = ev.clientY + 18;
    TIP.style.left = x + 'px'; TIP.style.top = y + 'px';
  }
  function hideTip() { TIP.style.opacity = 0; }

  // gráfico combinado barra(s) + linha com eixo duplo
  function comboChart(host, rows, cfg) {
    host.innerHTML = '';
    var W = Math.max(300, host.clientWidth || 520), H = 240;
    var P = { t: 22, r: 50, b: 28, l: 56 }, iw = W - P.l - P.r, ih = H - P.t - P.b, n = rows.length;
    var svg = svgEl('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img' });
    var leftMax = niceMax(Math.max.apply(null, rows.flatMap(function (r) { return cfg.bars.map(function (b) { return r[b.key] || 0; }); }).concat([0])));
    var rightVals = rows.map(function (r) { return r[cfg.line.key]; }).filter(ok);
    var rightMax = niceMax(Math.max.apply(null, rightVals.concat([0])));
    var yL = function (v) { return P.t + ih - (leftMax > 0 ? (v / leftMax) * ih : 0); };
    var yR = function (v) { return P.t + ih - (rightMax > 0 ? (v / rightMax) * ih : 0); };
    ticks(leftMax).forEach(function (t) { svg.appendChild(svgEl('line', { class: 'gl', x1: P.l, x2: P.l + iw, y1: yL(t), y2: yL(t) })); var tx = svgEl('text', { x: P.l - 7, y: yL(t) + 4, 'text-anchor': 'end' }); tx.textContent = cfg.leftFmt(t); svg.appendChild(tx); });
    ticks(rightMax).forEach(function (t) { var tx = svgEl('text', { x: P.l + iw + 7, y: yR(t) + 4, 'text-anchor': 'start' }); tx.textContent = cfg.rightFmt(t); svg.appendChild(tx); });
    svg.appendChild(svgEl('line', { class: 'ax', x1: P.l, x2: P.l + iw, y1: P.t + ih, y2: P.t + ih }));
    var slot = iw / Math.max(1, n), nb = cfg.bars.length;
    var groupW = Math.min(slot - 3, nb > 1 ? 40 : 30), bw = Math.max(2, groupW / nb - 1), step = labelStep(n, iw);
    rows.forEach(function (r, i) {
      var cx = P.l + slot * i + slot / 2;
      cfg.bars.forEach(function (b, bi) {
        var v = r[b.key] || 0, h = Math.max(v > 0 ? 1.5 : 0, P.t + ih - yL(v));
        var x = cx - groupW / 2 + bi * (groupW / nb) + (groupW / nb - bw) / 2;
        if (h > 0) svg.appendChild(svgEl('rect', { x: x, y: P.t + ih - h, width: bw, height: h, fill: b.color, rx: Math.min(3, bw / 2) }));
      });
      if (i % step === 0 || i === n - 1) { var tx = svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }); tx.textContent = brDate(r.d); svg.appendChild(tx); }
    });
    var pts = rows.map(function (r, i) { var v = r[cfg.line.key]; return ok(v) ? [P.l + slot * i + slot / 2, yR(v), v] : null; });
    var seg = [], segs = [];
    pts.forEach(function (p) { if (p) seg.push(p); else if (seg.length) { segs.push(seg); seg = []; } }); if (seg.length) segs.push(seg);
    segs.forEach(function (s) { var d = s.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' '); svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: cfg.line.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })); });
    if (n <= 45) pts.forEach(function (p) { if (p) svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 3.2, fill: cfg.line.color, stroke: 'var(--card)', 'stroke-width': 1.5 })); });
    var cross = svgEl('line', { class: 'cross', y1: P.t, y2: P.t + ih }); svg.appendChild(cross);
    var hit = svgEl('rect', { class: 'hit', x: P.l, y: P.t, width: iw, height: ih });
    hit.addEventListener('mousemove', function (ev) {
      var box = svg.getBoundingClientRect();
      var i = Math.max(0, Math.min(n - 1, Math.floor((((ev.clientX - box.left) / box.width) * W - P.l) / slot)));
      var r = rows[i], cx = P.l + slot * i + slot / 2;
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.opacity = 1;
      var html = '<b>' + brFull(r.d) + '</b>';
      cfg.bars.forEach(function (b) { html += '<div class="r"><em><i style="background:' + b.color + '"></i>' + b.name + '</em><strong>' + cfg.leftFmt(r[b.key] || 0) + '</strong></div>'; });
      html += '<div class="r"><em><i style="background:' + cfg.line.color + '"></i>' + cfg.line.name + '</em><strong>' + cfg.lineFmt(r[cfg.line.key]) + '</strong></div>';
      showTip(html, ev);
    });
    hit.addEventListener('mouseleave', function () { cross.style.opacity = 0; hideTip(); });
    svg.appendChild(hit);
    host.appendChild(svg);
  }

  // gráfico de linhas (1 ou 2 séries: atual/anterior)
  function lineChart(host, labels, series, fmt) {
    host.innerHTML = '';
    var W = Math.max(320, host.clientWidth || 900), H = 240;
    var P = { t: 16, r: 14, b: 28, l: 64 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
    var svg = svgEl('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img' });
    var all = series.flatMap(function (s) { return s.values.filter(ok); });
    var max = niceMax(Math.max.apply(null, all.concat([0])));
    var n = labels.length;
    var x = function (i) { return n === 1 ? P.l + iw / 2 : P.l + (iw * i) / (n - 1); };
    var y = function (v) { return P.t + ih - (max > 0 ? (v / max) * ih : 0); };
    ticks(max).forEach(function (t) { svg.appendChild(svgEl('line', { class: 'gl', x1: P.l, x2: P.l + iw, y1: y(t), y2: y(t) })); var tx = svgEl('text', { x: P.l - 8, y: y(t) + 4, 'text-anchor': 'end' }); tx.textContent = fmt(t); svg.appendChild(tx); });
    svg.appendChild(svgEl('line', { class: 'ax', x1: P.l, x2: P.l + iw, y1: P.t + ih, y2: P.t + ih }));
    var step = labelStep(n, iw);
    labels.forEach(function (lb, i) { if (i % step === 0 || i === n - 1) { var tx = svgEl('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }); tx.textContent = lb; svg.appendChild(tx); } });
    series.forEach(function (s) {
      var pts = s.values.map(function (v, i) { return [x(i), y(v || 0)]; });
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      var path = svgEl('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      if (s.dashed) path.setAttribute('stroke-dasharray', '5 4');
      svg.appendChild(path);
      if (n <= 40) pts.forEach(function (p) { svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 4, fill: s.color, stroke: 'var(--card)', 'stroke-width': 2 })); });
    });
    var cross = svgEl('line', { class: 'cross', y1: P.t, y2: P.t + ih }); svg.appendChild(cross);
    var hit = svgEl('rect', { class: 'hit', x: P.l - 4, y: P.t, width: iw + 8, height: ih });
    hit.addEventListener('mousemove', function (ev) {
      var box = svg.getBoundingClientRect();
      var rel = ((ev.clientX - box.left) / box.width) * W;
      var i = Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : ((rel - P.l) / iw) * (n - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.opacity = 1;
      showTip('<b>' + (series[0].fullLabels ? series[0].fullLabels[i] : labels[i]) + '</b>' +
        series.map(function (s) { return '<div class="r"><em><i style="background:' + s.color + '"></i>' + s.name + '</em><strong>' + fmt(s.values[i]) + '</strong></div>'; }).join(''), ev);
    });
    hit.addEventListener('mouseleave', function () { cross.style.opacity = 0; hideTip(); });
    svg.appendChild(hit);
    host.appendChild(svg);
  }

  function gauge(score, colorVar) {
    var s = ok(score) ? score : 0, r = 54, c = 2 * Math.PI * r, off = c * (1 - s / 100);
    var disp = ok(score) ? Math.round(score) : '—';
    return '<div class="gauge"><svg viewBox="0 0 132 132" width="132" height="132">' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="var(--plane)" stroke-width="12"/>' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="' + colorVar + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
      '</svg><div class="gv"><b>' + disp + '</b><span>de 100</span></div></div>';
  }

  /* ---------------------------------------------------------------- deltas */
  function miniDelta(cur, prev, better) {
    if (!STATE.compare || !ok(prev) || prev === 0 || !ok(cur)) return '';
    var ch = (cur - prev) / Math.abs(prev);
    var ar = Math.abs(ch) < 0.0005 ? '→' : (ch > 0 ? '▲' : '▼');
    var cls;
    if (better === null) cls = 'flat';
    else { var bad = better === false; cls = Math.abs(ch) < 0.0005 ? 'flat' : ((ch > 0) !== bad ? 'up' : 'down'); }
    return '<span class="' + cls + '">' + ar + ' ' + nf1.format(Math.abs(ch) * 100) + '%</span>';
  }

  /* ---------------------------------------------------------------- árvore campanha › conjunto › anúncio */
  function tblank(label) { return { label: label, spend: 0, impr: 0, reach: 0, clk: 0, lead: 0, msg: 0, kids: {} }; }
  function tderive(t) {
    var o = Object.assign({}, t);
    o.cpm = div(t.spend * 1000, t.impr); o.ctr = div(t.clk, t.impr); o.cpc = div(t.spend, t.clk);
    o.cpl = div(t.spend, t.lead); o.cpmsg = div(t.spend, t.msg); o.leadRate = div(t.lead, t.clk);
    return o;
  }
  function buildTree(from, to) {
    var root = {};
    for (var i = 0; i < grain.length; i++) {
      var g = grain[i]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      var c = root[g.camp] || (root[g.camp] = tblank(g.camp));
      var s = c.kids[g.adset] || (c.kids[g.adset] = tblank(g.adset));
      var a = s.kids[g.ad] || (s.kids[g.ad] = tblank(g.ad));
      a.spend += g.spend; a.impr += g.impr; a.reach += g.reach; a.clk += g.clk; a.lead += g.lead; a.msg += g.msg;
    }
    var RAW = ['spend', 'impr', 'reach', 'clk', 'lead', 'msg'];
    function roll(node, key, level) {
      var kids = Object.keys(node.kids).map(function (k) { return roll(node.kids[k], key + ' ▸ ' + k, level + 1); });
      var agg = tblank(node.label);
      RAW.forEach(function (k) { agg[k] = node[k]; });
      kids.forEach(function (c) { RAW.forEach(function (k) { agg[k] += c[k]; }); });
      var d = tderive(agg); d.key = key; d.level = level; d.kids = kids;
      return d;
    }
    return Object.keys(root).map(function (k) { return roll(root[k], k, 0); });
  }
  function adsByName(from, to) {
    var map = {};
    for (var i = 0; i < grain.length; i++) {
      var g = grain[i]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      var a = map[g.ad] || (map[g.ad] = tblank(g.ad));
      a.spend += g.spend; a.impr += g.impr; a.reach += g.reach; a.clk += g.clk; a.lead += g.lead; a.msg += g.msg;
    }
    return Object.keys(map).map(function (k) { return tderive(map[k]); }).filter(function (a) { return a.spend > 0 || a.lead > 0 || a.msg > 0; });
  }

  /* colunas da árvore/tabela */
  var TCOLS = [
    { k: 'label', label: 'Campanha › Conjunto › Anúncio' },
    { k: 'spend', label: 'Invest.', fmt: M.money },
    { k: 'cpm', label: 'CPM', fmt: M.money, scale: 'low' },
    { k: 'ctr', label: 'CTR (link)', fmt: M.pct1, scale: 'high' },
    { k: 'cpc', label: 'CPC (link)', fmt: M.money, scale: 'low' },
    { k: 'clk', label: 'Cliques (link)', fmt: M.int },
    { k: 'lead', label: 'Leads', fmt: M.int, scale: 'high' },
    { k: 'cpl', label: 'Custo/lead', fmt: M.money, scale: 'low' },
    { k: 'msg', label: 'Msgs', fmt: M.int },
    { k: 'cpmsg', label: 'Custo/msg', fmt: M.money, scale: 'low' }
  ];

  /* ================================================================ RANKING (leads dos formulários)
     Leitura AO VIVO da planilha de forms via gviz CSV (client-side, igual dash do Dr. Vinícius).
     Faixas por qualificação (Leandro): bate os 2 critérios = 🟢 Alta · bate 1 = 🟡 Média · 0 = 🔵 Baixa.
       Casamento   : convidados 30–60 (20_a_40|41_a_60)  ·  prazo ≤6m (até 3m | 3–6m)
       Corporativo : 60–80 pessoas (61_a_80)             ·  gastronomia happy hour | welcome coffee
     Só a LISTA com nome+WhatsApp (PII) fica atrás de senha; os NÚMEROS são públicos. */
  var RANK_CFG = {
    id: '1kVliNsOeAhXMisENdzn8yhxfxrhNjy3K2kkKTeslh5M',
    forms: [{ key: 'casamento', label: 'Casamento', tab: 'Casamento' },
            { key: 'corporativo', label: 'Corporativo', tab: 'Corporativo' }]
  };
  var RANK_PW = 'casinha';
  var RANK = { loaded: false, error: false, casamento: [], corporativo: [] };
  var rankUnlocked = false;
  try { rankUnlocked = sessionStorage.getItem('cc-rank') === '1'; } catch (e) { }
  var rankListTab = 'casamento';   // sub-aba da lista protegida (casamento/corporativo)
  var rankTierFilter = 'all';      // filtro de faixa na lista (all/alta/media/baixa)

  function normTok(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[áàâã]/g, 'a').replace(/[éèê]/g, 'e').replace(/[íì]/g, 'i')
      .replace(/[óòô]/g, 'o').replace(/[úù]/g, 'u').replace(/ç/g, 'c');
  }
  // 2 = bate os 2 critérios (Alta) · 1 = bate 1 (Média) · 0 = nenhum (Baixa)
  function tierScore(formKey, guest, when) {
    var g = normTok(guest), w = normTok(when), c1, c2;
    if (formKey === 'casamento') { c1 = /20_a_40|41_a_60/.test(g); c2 = /ate_3_meses|3_e_6/.test(w); }
    else { c1 = /61_a_80/.test(g); c2 = /happy_hour|welcome_coffee/.test(w); }
    return (c1 ? 1 : 0) + (c2 ? 1 : 0);
  }
  function tierName(s) { return s === 2 ? 'alta' : s === 1 ? 'media' : 'baixa'; }

  // parser CSV robusto (aspas, vírgulas e quebras de linha dentro de campo)
  function parseCSV(text) {
    var rows = [], row = [], f = '', i = 0, n = text.length, q = false, c;
    while (i < n) {
      c = text.charAt(i);
      if (q) {
        if (c === '"') { if (text.charAt(i + 1) === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
      i++;
    }
    if (f.length || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function cleanPhone(s) { return String(s == null ? '' : s).replace(/^p:/i, '').replace(/[^\d+]/g, ''); }

  function parseFormCsv(formKey, text) {
    var rows = parseCSV(text), out = [], seen = {};
    for (var r = 1; r < rows.length; r++) {
      var v = rows[r]; if (!v || v.length < 15) continue;
      var id = v[0], created = v[1] || '';
      if (!id || id === 'id' || created === 'created_time' || created.length < 10) continue;
      var day = created.slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      if (seen[id]) continue; seen[id] = 1;                       // dedupe por id
      out.push({ id: id, day: day, name: (v[16] || '').trim(), phone: cleanPhone(v[17]),
                 score: tierScore(formKey, v[12], v[14]) });
    }
    return out;
  }

  function fetchRanking() {
    var pend = RANK_CFG.forms.length;
    RANK_CFG.forms.forEach(function (fm) {
      var u = 'https://docs.google.com/spreadsheets/d/' + RANK_CFG.id +
        '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(fm.tab);
      fetch(u).then(function (r) { return r.text(); })
        .then(function (txt) { RANK[fm.key] = parseFormCsv(fm.key, txt); })
        .catch(function () { RANK.error = true; })
        .then(function () { if (--pend === 0) { RANK.loaded = true; if (STATE.tab === 'overview') paintRanking(); } });
    });
  }

  function rankInPeriod(list, from, to) {
    var a = { alta: 0, media: 0, baixa: 0, total: 0, rows: [] };
    for (var i = 0; i < list.length; i++) {
      var x = list[i]; if (x.day < from || x.day > to) continue;
      a.total++; a[tierName(x.score)]++; a.rows.push(x);
    }
    return a;
  }

  var RANK_TIERS = [
    { k: 'alta', emo: '🟢', lab: 'Alta', sub: 'bate os 2 critérios', cls: 't-alta' },
    { k: 'media', emo: '🟡', lab: 'Média', sub: 'bate 1 critério', cls: 't-media' },
    { k: 'baixa', emo: '🔵', lab: 'Baixa', sub: 'não bate nenhum', cls: 't-baixa' }
  ];

  function rankLockHTML() {
    return '<div class="rank-lock">' +
      '<div class="rl-head">🔒 <b>Lista ranqueada com contatos</b> <span>— protegida (contém nome e WhatsApp dos leads)</span></div>' +
      '<div class="rl-form"><input type="password" id="rankPw" placeholder="Senha" autocomplete="off">' +
      '<button class="btn on" id="rankGo">Ver lista</button></div>' +
      '<div class="rl-err" id="rankErr" hidden>Senha incorreta.</div></div>';
  }
  // barra de proporção + legenda por faixa (visual, sem PII)
  function rankFormVisual(fm, agg) {
    var segs = RANK_TIERS.map(function (t) { var q = agg[t.k]; return { t: t, q: q, pct: agg.total > 0 ? q / agg.total * 100 : 0 }; });
    var bar = agg.total > 0 ? segs.map(function (s) {
      if (s.pct <= 0) return '';
      return '<div class="rseg s-' + s.t.k + '" style="width:' + s.pct.toFixed(2) + '%" title="' + s.t.lab + ': ' + int(s.q) + ' (' + s.pct.toFixed(0) + '%)">' +
        (s.pct >= 8 ? '<span>' + int(s.q) + '</span>' : '') + '</div>';
    }).join('') : '<div class="rbar-empty">sem leads no período</div>';
    var legend = segs.map(function (s) {
      return '<div class="rleg"><span class="rdot s-' + s.t.k + '"></span>' + s.t.emo + ' <b>' + s.t.lab + '</b>' +
        '<span class="rn">' + int(s.q) + '</span><span class="rp">' + s.pct.toFixed(0) + '%</span></div>';
    }).join('');
    return '<div class="rankform"><h3>' + esc(fm.label) + ' <span>' + int(agg.total) + ' leads no período</span></h3>' +
      '<div class="rbar">' + bar + '</div><div class="rlegend">' + legend + '</div></div>';
  }
  // lista protegida: abas por form + rolagem + botão WhatsApp por linha
  function rankListHTML(from, to) {
    var counts = {}; RANK_CFG.forms.forEach(function (fm) { counts[fm.key] = rankInPeriod(RANK[fm.key], from, to); });
    var total = 0; RANK_CFG.forms.forEach(function (fm) { total += counts[fm.key].total; });
    var subtabs = RANK_CFG.forms.map(function (fm) {
      return '<button class="rl-tabbtn' + (fm.key === rankListTab ? ' on' : '') + '" data-rltab="' + fm.key + '">' +
        esc(fm.label) + ' <span>' + int(counts[fm.key].total) + '</span></button>';
    }).join('');
    // filtro por faixa (Todas / Alta / Média / Baixa) dentro do form selecionado
    var agg = counts[rankListTab] || { alta: 0, media: 0, baixa: 0, total: 0, rows: [] };
    var tierBtns = '<div class="rl-tierfilter">' +
      '<button class="rl-fbtn' + (rankTierFilter === 'all' ? ' on' : '') + '" data-rltier="all">Todas <span>' + int(agg.total) + '</span></button>' +
      RANK_TIERS.map(function (t) {
        return '<button class="rl-fbtn f-' + t.k + (rankTierFilter === t.k ? ' on' : '') + '" data-rltier="' + t.k + '">' +
          t.emo + ' ' + t.lab + ' <span>' + int(agg[t.k]) + '</span></button>';
      }).join('') + '</div>';
    var rows = agg.rows.slice();
    if (rankTierFilter !== 'all') rows = rows.filter(function (x) { return tierName(x.score) === rankTierFilter; });
    rows.sort(function (a, b) { return b.score - a.score || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0); });
    var TB = { 2: ['🟢', 'Alta', 't-alta'], 1: ['🟡', 'Média', 't-media'], 0: ['🔵', 'Baixa', 't-baixa'] };
    var body = rows.length ? rows.map(function (x, i) {
      var t = TB[x.score], waNum = (x.phone || '').replace(/\D/g, '');
      var btn = waNum ? '<a class="wabtn" href="https://wa.me/' + esc(waNum) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '<span class="rl-nowa">sem nº</span>';
      return '<tr><td class="rl-i">' + (i + 1) + '</td>' +
        '<td><span class="rl-badge ' + t[2] + '">' + t[0] + ' ' + t[1] + '</span></td>' +
        '<td class="rl-nm">' + esc(x.name || '—') + '<small>' + esc(x.phone || '') + '</small></td>' +
        '<td class="rl-d">' + brDate(x.day) + '</td>' +
        '<td class="rl-act">' + btn + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="rl-empty">Nenhum lead nesta faixa/período.</td></tr>';
    var head = '<div class="rl-head">🔓 <b>Lista ranqueada</b> <span>— ' + int(total) +
      ' leads no período, ordenados por qualificação</span><button class="btn rl-hide" id="rankHide">Ocultar</button></div>';
    return '<div class="rl-open">' + head +
      '<div class="rl-subtabs">' + subtabs + '</div>' + tierBtns +
      '<div class="rl-scroll"><table class="rl-tbl"><thead><tr><th>#</th><th>Faixa</th><th>Nome / WhatsApp</th><th>Data</th><th></th></tr></thead><tbody>' +
      body + '</tbody></table></div></div>';
  }

  function paintRanking() {
    var el = $('rankBody'); if (!el) return;
    if (!RANK.loaded) {
      el.innerHTML = RANK.error
        ? '<div class="loading">Não foi possível carregar o ranking dos formulários.</div>'
        : '<div class="loading">Carregando ranking dos formulários…</div>';
      return;
    }
    var from = STATE.from, to = STATE.to;
    var blocks = RANK_CFG.forms.map(function (fm) { return rankFormVisual(fm, rankInPeriod(RANK[fm.key], from, to)); }).join('');
    el.innerHTML = blocks + '<div class="ranklist">' + (rankUnlocked ? rankListHTML(from, to) : rankLockHTML()) + '</div>';
    var go = $('rankGo');
    if (go) {
      var tryUnlock = function () {
        if ((($('rankPw') && $('rankPw').value) || '') === RANK_PW) {
          rankUnlocked = true; try { sessionStorage.setItem('cc-rank', '1'); } catch (e) { } paintRanking();
        } else { var er = $('rankErr'); if (er) er.hidden = false; }
      };
      go.onclick = tryUnlock;
      var pwi = $('rankPw'); if (pwi) { pwi.onkeydown = function (e) { if (e.key === 'Enter') tryUnlock(); }; pwi.focus(); }
    }
    var hide = $('rankHide');
    if (hide) hide.onclick = function () { rankUnlocked = false; try { sessionStorage.removeItem('cc-rank'); } catch (e) { } paintRanking(); };
    Array.prototype.forEach.call(el.querySelectorAll('[data-rltab]'), function (b) { b.onclick = function () { rankListTab = b.dataset.rltab; rankTierFilter = 'all'; paintRanking(); }; });
    Array.prototype.forEach.call(el.querySelectorAll('[data-rltier]'), function (b) { b.onclick = function () { rankTierFilter = b.dataset.rltier; paintRanking(); }; });
  }

  /* ================================================================ VISÃO GERAL */
  function renderOverview() {
    var from = STATE.from, to = STATE.to, len = diffDays(from, to) + 1;
    var pTo = dayAdd(from, -1), pFrom = dayAdd(pTo, -(len - 1));
    var cur = aggregate(from, to);

    var h = health(cur), sc = scoreColor(h.score);
    var healthHTML = gauge(h.score, sc) +
      '<div><p class="health-head">Saúde da mídia' +
      '<span class="tag" style="background:color-mix(in srgb,' + sc + ' 20%,transparent);color:' + sc + '">' + h.band + '</span>' +
      '<span style="font-size:11.5px;font-weight:500;color:var(--ink-3);margin-left:6px">' + (h.score == null ? '—' : h.score + '/100') + ' · pela sua régua de benchmarks</span></p>' +
      '<div class="hbars" style="margin-top:12px">' + h.bars.map(function (b) {
        var col = b.score == null ? 'var(--ink-3)' : scoreColor(b.score);
        var w = b.score == null ? 0 : Math.max(0, Math.min(100, b.score));
        var lim = b.band.dir === 'high' ? 'bom ≥ ' + b.band.fmt(b.band.good) : 'bom ≤ ' + b.band.fmt(b.band.good);
        return '<div class="hbar"><div class="hb-top"><em>' + b.label + ' <span style="color:var(--ink-3);font-weight:500">· ' + lim + '</span></em><strong>' + b.valueStr + '</strong></div>' +
          '<div class="hb-track"><div class="hb-fill" style="width:' + w.toFixed(0) + '%;background:' + col + '"></div></div></div>';
      }).join('') + '</div></div>';

    var heroHTML =
      '<div class="hcard"><div class="hk">💸 Investimento <small>c/ imposto</small></div>' +
      '<div class="hv">' + M.money(cur.spend) + '</div><div class="hd">' + M.int(cur.impr) + ' impressões no período</div></div>' +
      '<div class="op">→</div>' +
      '<div class="hcard"><div class="hk">🧲 Leads <small>formulário</small></div>' +
      '<div class="hv g">' + M.int(cur.lead) + '</div><div class="hd">' + M.pct1(cur.leadRate) + ' dos cliques viram lead</div></div>' +
      '<div class="op">=</div>' +
      '<div class="hcard roas"><div class="hk">🎯 Custo por lead <small>CPL</small></div>' +
      '<div class="hv">' + M.money(cur.cpl) + '</div><div class="hd">por lead de formulário</div></div>' +
      (CLIENT ? '' :
        '<div class="op">·</div>' +
        '<div class="hcard"><div class="hk">💬 Mensagens <small>secundário</small></div>' +
        '<div class="hv">' + M.int(cur.msg) + '</div><div class="hd">custo/msg ' + M.money(cur.cpmsg) + '</div></div>');

    var totRes = cur.lead + cur.msg;
    var heroLine = (cur.lead > 0 || cur.msg > 0)
      ? '<b>' + int(totRes) + ' contatos</b> no período (' + int(cur.lead) + ' leads de formulário + ' + int(cur.msg) + ' mensagens) por <b>' + M.money(cur.spend) + '</b> investidos — custo médio por contato <b>' + M.money(cur.cpr) + '</b>.'
      : 'Sem lead nem mensagem no período.';

    // ---- Ranking de leads qualificados (dos formularios; leitura ao vivo via gviz, tiers + lista c/ senha) ----
    var rankPanel =
      '<div class="panel"><h2>Ranking de leads qualificados <span style="font-weight:500;color:var(--ink-3)">— dos formulários, no período</span></h2>' +
      '<p class="note"><b>Casamento:</b> 30–60 convidados <b>e</b> em até 6 meses. &nbsp;<b>Corporativo:</b> 60–80 pessoas <b>e</b> happy hour/welcome coffee. &nbsp;<b>🟢 Alta</b> bate os 2 · <b>🟡 Média</b> bate 1 · <b>🔵 Baixa</b> nenhum.</p>' +
      '<div id="rankBody"></div></div>';

    var overview =
      '<div class="panel"><div class="health" id="health">' + healthHTML + '</div></div>' +
      '<div class="hero" id="hero">' + heroHTML + '</div>' +
      '<p class="hero-line" style="margin-bottom:10px">' + heroLine + '</p>' +
      rankPanel +
      '<div class="grid-funnel">' +
      '<div class="panel"><h2>Funil completo</h2><p class="note">Investimento → Impressões → Cliques → Leads. Cada etapa mostra o <b>volume</b> e, à direita, o <b>custo</b> e a <b>taxa de passagem</b>.</p><div class="funnel" id="funnel"></div></div>' +
      '<div class="panel"><h2>Resultados por dia</h2><p class="note">Barras = <b>Investimento c/ imposto</b> (esq., R$) · linha = <b>Leads</b> (dir., nº).</p><div class="legend" id="legA"></div><div id="chA"></div>' +
      '<h2 style="margin-top:20px">Leads × Mensagens × Custo/lead</h2><p class="note">Barras = <b>Leads</b> e <b>Mensagens</b> (esq., nº) · linha = <b>Custo por lead</b> (dir., R$).</p><div class="legend" id="legB"></div><div id="chB"></div></div>' +
      '</div>' +
      (CLIENT ? '' :
        '<div class="panel"><h2 id="metricTitle">Investimento por dia</h2><p class="note">Escolha a métrica pra ver a evolução dia a dia no período.</p><div class="tabs" id="metricTabs"></div><div class="legend" id="legend"></div><div id="chMetric"></div></div>' +
        '<div class="panel"><h2>Visão diária — principais métricas por dia</h2><p class="note">Uma linha por dia, mais recente no topo — role pra ver os demais dias. Heatmap por coluna: <b style="color:var(--good-text)">verde = melhor</b>, <b style="color:var(--critical)">vermelho = pior</b> no período.</p><div class="tblwrap daily-scroll"><table id="dtbl" class="daily"></table></div></div>');

    $('overviewView').innerHTML = overview;
    paintRanking();

    renderFunnel(cur);
    var rows = dailyRows(from, to), pRows = dailyRows(pFrom, pTo);
    comboChart($('chA'), rows, { bars: [{ key: 'spend', color: 'var(--critical)', name: 'Investimento c/ imposto' }], line: { key: 'lead', color: 'var(--good)', name: 'Leads' }, leftFmt: M.money0, rightFmt: M.int, lineFmt: M.int });
    comboChart($('chB'), rows, { bars: [{ key: 'lead', color: 'var(--good)', name: 'Leads' }, { key: 'msg', color: 'var(--series-2)', name: 'Mensagens' }], line: { key: 'cpl', color: 'var(--ink-1)', name: 'Custo/lead' }, leftFmt: M.int, rightFmt: M.money0, lineFmt: M.money });
    var lgSq = function (c) { return '<i style="background:' + c + '"></i>'; }, lgLn = function (c) { return '<i style="width:15px;height:0;border-top:2px solid ' + c + ';border-radius:0"></i>'; };
    $('legA').innerHTML = '<span>' + lgSq('var(--critical)') + '<span style="color:var(--ink-2)">Investimento c/ imposto</span></span><span>' + lgLn('var(--good)') + '<span style="color:var(--ink-2)">Leads (eixo dir.)</span></span>';
    $('legB').innerHTML = '<span>' + lgSq('var(--good)') + '<span style="color:var(--ink-2)">Leads</span></span><span>' + lgSq('var(--series-2)') + '<span style="color:var(--ink-2)">Mensagens</span></span><span>' + lgLn('var(--ink-1)') + '<span style="color:var(--ink-2)">Custo/lead (eixo dir.)</span></span>';

    if (!CLIENT) {
      var METRICS = [
        { k: 'spend', label: 'Investimento', fmt: M.money0 }, { k: 'lead', label: 'Leads', fmt: M.int },
        { k: 'msg', label: 'Mensagens', fmt: M.int }, { k: 'cpl', label: 'Custo/lead', fmt: M.money },
        { k: 'cpmsg', label: 'Custo/msg', fmt: M.money }, { k: 'cpc', label: 'CPC (link)', fmt: M.money },
        { k: 'cpm', label: 'CPM', fmt: M.money0 }, { k: 'ctr', label: 'CTR (link)', fmt: M.pct1 },
        { k: 'impr', label: 'Impressões', fmt: M.int }, { k: 'clk', label: 'Cliques (link)', fmt: M.int }
      ];
      $('metricTabs').innerHTML = METRICS.map(function (x) { return '<button class="btn' + (x.k === STATE.metric ? ' on' : '') + '" data-metric="' + x.k + '">' + x.label + '</button>'; }).join('');
      var met = METRICS.find(function (m) { return m.k === STATE.metric; }) || METRICS[0];
      var series = [{ name: 'Período atual', color: 'var(--series-1)', values: rows.map(function (r) { return r[met.k]; }), fullLabels: rows.map(function (r) { return brFull(r.d); }) }];
      if (STATE.compare) series.push({ name: 'Período anterior', color: 'var(--series-2)', dashed: true, values: rows.map(function (_, i) { return pRows[i] ? pRows[i][met.k] : null; }) });
      $('legend').innerHTML = series.length > 1 ? series.map(function (s) { return '<span style="color:' + s.color + '"><i class="' + (s.dashed ? 'dash' : '') + '" style="background:' + (s.dashed ? 'transparent' : s.color) + '"></i><span style="color:var(--ink-2)">' + s.name + '</span></span>'; }).join('') : '';
      lineChart($('chMetric'), rows.map(function (r) { return brDate(r.d); }), series, met.fmt);
      $('metricTitle').textContent = met.label + ' por dia';
      Array.prototype.forEach.call(document.querySelectorAll('[data-metric]'), function (b) { b.onclick = function () { STATE.metric = b.dataset.metric; renderOverview(); }; });

      renderDaily(from, to);
    }
  }

  var FUNIL_META = {
    Leads: { color: 'var(--brand)', desc: 'formulário / Lead Ads' },
    Mensagens: { color: 'var(--series-2)', desc: 'conversas / WhatsApp' },
    Outros: { color: 'var(--ink-3)', desc: 'demais campanhas' }
  };
  function renderFunilInv(from, to) {
    var g = {}, total = 0;
    for (var i = 0; i < grain.length; i++) { var x = grain[i]; if (!within(x.d, from, to)) continue; if (!campOK(x.camp)) continue; var f = funnelOf(x.camp); (g[f] || (g[f] = { spend: 0, clk: 0, lead: 0, msg: 0, impr: 0 })); g[f].spend += x.spend; g[f].clk += x.clk; g[f].lead += x.lead; g[f].msg += x.msg; g[f].impr += x.impr; total += x.spend; }
    var cards = ['Leads', 'Mensagens', 'Outros'].filter(function (k) { return g[k]; }).map(function (k) {
      var o = g[k], m = FUNIL_META[k], share = total ? o.spend / total : 0;
      var detail = k === 'Leads' ? (int(o.lead) + ' leads · ' + money0(div(o.spend, o.lead) || 0) + '/lead') : k === 'Mensagens' ? (int(o.msg) + ' msgs · ' + money0(div(o.spend, o.msg) || 0) + '/msg') : (int(o.impr) + ' impressões · ' + int(o.clk) + ' cliques (link)');
      return '<div class="finv"><div class="fshare">' + pct1(share) + '</div><div class="ftop"><span class="fico" style="background:' + m.color + '"></span>' + k + '</div><div class="fmain" style="color:' + m.color + '">' + money0(o.spend) + '</div><div class="fmeta">' + m.desc + '<br>' + detail + '</div></div>';
    });
    cards.push('<div class="finv total"><div class="ftop">Σ Total</div><div class="fmain">' + money0(total) + '</div><div class="fmeta">soma dos objetivos · com imposto ×' + taxStr(TAX) + '</div></div>');
    $('funilInv').innerHTML = cards.join('');
  }
  function renderFunnel(c) {
    var stages = [
      { n: 'Investimento', big: M.money(c.spend), bg: '#8fe01e', ink: '#0c1400', cl: 'Gasto bruto', cv: M.money(c.spend / TAX), sub: '+ imposto ×' + taxStr(TAX) + ' = <b>' + M.money(c.spend) + '</b>' },
      { n: 'Impressões', big: M.int(c.impr), bg: '#7ecb1c', ink: '#0c1400', cl: 'CPM', cv: M.money(c.cpm), sub: 'CTR (link) <b>' + M.pct1(c.ctr) + '</b>' },
      { n: 'Cliques (link)', big: M.int(c.clk), bg: '#5aa60f', ink: '#fff', cl: 'CPC (link)', cv: M.money(c.cpc), sub: 'Clique → Lead <b>' + M.pct1(c.leadRate) + '</b>' },
      { n: 'Leads', big: M.int(c.lead), bg: '#356606', ink: '#fff', cl: 'Custo / Lead', cv: M.money(c.cpl), sub: c.msg > 0 ? '+ <b>' + M.int(c.msg) + '</b> mensagens (custo/msg ' + M.money(c.cpmsg) + ')' : 'resultado principal' }
    ];
    $('funnel').innerHTML = stages.map(function (s) {
      return '<div class="fstage"><div class="fl" style="background:' + s.bg + ';color:' + s.ink + '"><div class="fn">' + s.n + '</div><div class="fv">' + s.big + '</div></div>' +
        '<div class="fr"><div class="cl">' + s.cl + '</div><div class="cv">' + s.cv + '</div><div class="fsub">' + s.sub + '</div></div></div>';
    }).join('');
  }

  var DCOLS = [
    { k: 'd', label: 'Dia' }, { k: 'spend', label: 'Invest.', fmt: M.money }, { k: 'cpm', label: 'CPM', fmt: M.money, scale: 'low' },
    { k: 'cpc', label: 'CPC (link)', fmt: M.money, scale: 'low' }, { k: 'ctr', label: 'CTR (link)', fmt: M.pct1, scale: 'high' },
    { k: 'clk', label: 'Cliques (link)', fmt: M.int }, { k: 'lead', label: 'Leads', fmt: M.int, scale: 'high' }, { k: 'cpl', label: 'Custo/lead', fmt: M.money, scale: 'low' },
    { k: 'msg', label: 'Msgs', fmt: M.int }, { k: 'cpmsg', label: 'Custo/msg', fmt: M.money, scale: 'low' }
  ];
  function renderDaily(from, to) {
    var rows = dailyRows(from, to).reverse();
    var scales = {};
    DCOLS.filter(function (c) { return c.scale; }).forEach(function (c) {
      var vals = rows.filter(function (r) { return r.spend > 0 && ok(r[c.k]); }).map(function (r) { return r[c.k]; });
      if (vals.length > 1) scales[c.k] = { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals), dir: c.scale };
    });
    function heat(k, v) {
      var s = scales[k]; if (!s || !ok(v) || s.max === s.min) return '';
      var t = (v - s.min) / (s.max - s.min); if (s.dir === 'low') t = 1 - t;
      var hue = t >= 0.5 ? 'var(--good)' : 'var(--critical)', strength = Math.round(Math.abs(t - 0.5) * 2 * 32);
      return strength < 6 ? '' : 'background:color-mix(in srgb,' + hue + ' ' + strength + '%,transparent)';
    }
    var head = DCOLS.map(function (c) { return '<th>' + c.label + '</th>'; }).join('');
    var body = rows.map(function (r) {
      return '<tr>' + DCOLS.map(function (c) {
        if (c.k === 'd') return '<td>' + brFull(r.d) + '</td>';
        var st = c.scale ? heat(c.k, r[c.k]) : '', v = c.fmt(r[c.k]);
        return '<td>' + (st ? '<span class="cell-scale" style="' + st + '">' + v + '</span>' : v) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    $('dtbl').innerHTML = '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody>';
  }

  /* ================================================================ TRÁFEGO PAGO */
  function renderTraffic() {
    var from = STATE.from, to = STATE.to, len = diffDays(from, to) + 1;
    var pTo = dayAdd(from, -1), pFrom = dayAdd(pTo, -(len - 1));
    var cur = aggregate(from, to), prev = STATE.compare ? aggregate(pFrom, pTo) : null;

    function kpi(lbl, val, sub, delta) { return '<div class="kpi"><div class="k">' + lbl + '</div><div class="v sm">' + val + '</div><div class="d">' + (delta || '') + (sub ? '<span>' + sub + '</span>' : '') + '</div></div>'; }
    var kpis = [
      kpi('Investimento', M.money0(cur.spend), 'com imposto', miniDelta(cur.spend, prev && prev.spend, null)),
      kpi('CPM', M.money(cur.cpm), 'bom ≤ R$35', flagFor('cpm', cur.cpm)),
      kpi('CTR (link)', M.pct1(cur.ctr), 'bom ≥ 1%', flagFor('ctr', cur.ctr)),
      kpi('CPC (link)', M.money(cur.cpc), 'bom ≤ R$2', flagFor('cpc', cur.cpc)),
      kpi('Cliques (link)', M.int(cur.clk), int(cur.impr) + ' impressões', ''),
      kpi('Leads', M.int(cur.lead), 'custo/lead ' + M.money(cur.cpl), miniDelta(cur.lead, prev && prev.lead, true)),
      kpi('Mensagens', M.int(cur.msg), 'custo/msg ' + M.money(cur.cpmsg), miniDelta(cur.msg, prev && prev.msg, true)),
      kpi('Clique → Lead', M.pct1(cur.leadRate), 'leads ÷ cliques', '')
    ];

    $('trafficView').innerHTML =
      '<div class="scopenote"><span>🎯 Aba operacional: métricas de mídia (Meta) e resultado por anúncio. <b>Leads</b> = formulário (Lead Ads); <b>Mensagens</b> = 1ª resposta em conversa. CTR sempre de <b>link</b>.</span></div>' +
      '<div class="kpis">' + kpis.join('') + '</div>' +
      '<div class="panel"><h2>Otimização — Campanha › Conjunto › Anúncio</h2>' +
      '<p class="note">Clique numa <b>campanha</b> pra abrir os conjuntos, e num conjunto pra abrir os anúncios. Clique nos cabeçalhos pra ordenar. Heatmap: verde = melhor.</p>' +
      '<div class="tblwrap"><table id="tbl" class="tree"></table></div></div>';

    renderTree(from, to);
  }
  function flagFor(k, v) {
    var st = statusOf(v, BANDS[k]); if (!st) return '';
    return '<span class="rep-flag ' + st.cls + '">' + st.word + '</span>';
  }
  function sortNodes(list, key, dir) {
    return list.slice().sort(function (a, b) {
      if (key === 'label') return dir * a.label.localeCompare(b.label, 'pt-BR');
      var av = a[key], bv = b[key], an = !ok(av), bn = !ok(bv);
      if (an && bn) return 0; if (an) return 1; if (bn) return -1; return dir * (av - bv);
    });
  }
  function renderTree(from, to) {
    var camps = buildTree(from, to);
    var key = STATE.treeSort.key, dir = STATE.treeSort.dir;
    var scales = {};
    TCOLS.filter(function (c) { return c.scale; }).forEach(function (c) {
      var vals = camps.filter(function (r) { return r.spend > 0 && ok(r[c.k]); }).map(function (r) { return r[c.k]; });
      if (vals.length > 1) scales[c.k] = { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals), dir: c.scale };
    });
    function shade(k, v) { var s = scales[k]; if (!s || !ok(v) || s.max === s.min) return ''; var t = (v - s.min) / (s.max - s.min); if (s.dir === 'low') t = 1 - t; if (t < 0.15) return ''; return 'background:color-mix(in srgb,var(--scale-ink) ' + Math.round(t * 32) + '%,transparent)'; }
    var head = TCOLS.map(function (c) { var active = key === c.k; var arw = active ? (dir === 1 ? '▲' : '▼') : '▾'; return '<th data-k="' + c.k + '"' + (active ? ' data-active' : '') + '>' + c.label + '<span class="arw">' + arw + '</span></th>'; }).join('');
    function flatten() {
      var out = [];
      sortNodes(camps, key, dir).forEach(function (c) {
        out.push(c);
        if (STATE.expanded[c.key]) sortNodes(c.kids, key, dir).forEach(function (s) {
          out.push(s);
          if (STATE.expanded[s.key]) sortNodes(s.kids, key, dir).forEach(function (a) { out.push(a); });
        });
      });
      return out;
    }
    function rowHTML(r) {
      var exp = r.level < 2 && r.kids && r.kids.length > 0, open = STATE.expanded[r.key];
      var caret = '<span class="caret">' + (exp ? '▸' : '') + '</span>';
      return '<tr class="lv' + r.level + (exp ? ' exp' : '') + (open ? ' open' : '') + '" data-key="' + encodeURIComponent(r.key) + '">' +
        '<td><span class="nm">' + caret + esc(r.label) + '</span></td>' +
        TCOLS.slice(1).map(function (c) { var st = c.scale ? shade(c.k, r[c.k]) : ''; var v = c.fmt(r[c.k]); return '<td>' + (st ? '<span class="cell-scale" style="' + st + '">' + v + '</span>' : v) + '</td>'; }).join('') + '</tr>';
    }
    var RAW = ['spend', 'impr', 'reach', 'clk', 'lead', 'msg'];
    var tot = tderive(camps.reduce(function (t, r) { RAW.forEach(function (k) { t[k] += r[k]; }); return t; }, tblank('')));
    var rows = flatten();
    $('tbl').innerHTML = '<thead><tr>' + head + '</tr></thead><tbody>' +
      (rows.map(rowHTML).join('') || '<tr><td colspan="' + TCOLS.length + '" style="text-align:center;color:var(--ink-3);padding:32px">Sem dados no período.</td></tr>') +
      '</tbody><tfoot><tr><td>Total — ' + camps.length + ' campanha(s)</td>' + TCOLS.slice(1).map(function (c) { return '<td>' + c.fmt(tot[c.k]) + '</td>'; }).join('') + '</tr></tfoot>';
    Array.prototype.forEach.call(document.querySelectorAll('#tbl tbody tr.exp'), function (tr) {
      tr.querySelector('td:first-child').onclick = function () { var k = decodeURIComponent(tr.dataset.key); STATE.expanded[k] = !STATE.expanded[k]; renderTree(from, to); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('#tbl thead th'), function (th) {
      th.onclick = function () { var k = th.dataset.k; STATE.treeSort = key === k ? { key: k, dir: -dir } : { key: k, dir: k === 'label' ? 1 : -1 }; renderTree(from, to); };
    });
  }

  /* ================================================================ RELATÓRIO */
  function repStat(l, v) { return '<div class="rep-stat"><div class="l">' + l + '</div><div class="v">' + v + '</div></div>'; }
  function renderReport() {
    var from = STATE.from, to = STATE.to, days = diffDays(from, to) + 1;
    var pTo = dayAdd(from, -1), pFrom = dayAdd(pTo, -(days - 1));
    var cur = aggregate(from, to), prev = aggregate(pFrom, pTo);
    var dRows = dailyRows(from, to), camps = buildTree(from, to), ads = adsByName(from, to);
    var perLabel = days === 1 ? brFull(from) : brFull(from) + ' a ' + brFull(to) + ' · ' + days + ' dias';

    function selo(k, v) { var st = statusOf(v, BANDS[k]); return st ? '<span class="rep-flag ' + st.cls + '">' + st.word + '</span>' : ''; }
    var dTbl = '<div class="tblwrap"><table style="min-width:520px"><thead><tr><th style="text-align:left">Dia</th><th>Gasto</th><th>Cliques (link)</th><th>Leads</th><th>Custo/lead</th><th>Msgs</th></tr></thead><tbody>' +
      dRows.slice().reverse().map(function (r) { return '<tr><td style="text-align:left">' + brFull(r.d) + '</td><td>' + M.money(r.spend) + '</td><td>' + int(r.clk) + '</td><td>' + int(r.lead) + '</td><td>' + M.money(r.cpl) + '</td><td>' + int(r.msg) + '</td></tr>'; }).join('') + '</tbody></table></div>';

    var secVisual =
      '<div class="rep-sec"><div class="step">1 · RESUMO</div><h3>📊 Números do período</h3><div class="rep-stats">' +
      repStat('Investimento', M.money(cur.spend)) + repStat('Leads', int(cur.lead)) +
      repStat('Custo por lead', M.money(cur.cpl)) + repStat('Mensagens', int(cur.msg)) +
      repStat('Custo por msg', M.money(cur.cpmsg)) + repStat('Cliques (link)', int(cur.clk)) + '</div>' +
      '<p class="rep-p muted">' + int(cur.lead + cur.msg) + ' contatos no total (leads + mensagens) · custo médio por contato ' + M.money(cur.cpr) + '.</p></div>' +

      '<div class="rep-sec"><div class="step">2 · MÍDIA (TOPO)</div><h3>🚀 Eficiência da mídia</h3><div class="rep-stats">' +
      repStat('CTR (link) ' + selo('ctr', cur.ctr), M.pct1(cur.ctr)) + repStat('CPC (link) ' + selo('cpc', cur.cpc), M.money(cur.cpc)) +
      repStat('CPM ' + selo('cpm', cur.cpm), M.money(cur.cpm)) + repStat('Impressões', int(cur.impr)) + repStat('Cliques (link)', int(cur.clk)) + '</div>' +
      '<p class="rep-p muted">Selos pela régua de benchmarks: CTR (link) bom ≥ 1% · CPC (link) bom ≤ R$2 · CPM bom ≤ R$35.</p></div>' +

      '<div class="rep-sec"><div class="step">3 · DIA A DIA</div><h3>📅 Funil por dia</h3>' + dTbl + '</div>' +

      '<div class="rep-sec"><div class="step">4 · CAMPANHAS</div><h3>🗂️ Investimento e resultados</h3>' +
      '<div class="tblwrap"><table style="min-width:520px"><thead><tr><th style="text-align:left">Campanha</th><th>Gasto</th><th>CTR (link)</th><th>CPC (link)</th><th>Leads</th><th>Custo/lead</th><th>Msgs</th></tr></thead><tbody>' +
      camps.filter(function (c) { return c.spend > 0; }).sort(function (a, b) { return b.spend - a.spend; }).map(function (c) { return '<tr><td style="text-align:left">' + esc(c.label) + '</td><td>' + M.money(c.spend) + '</td><td>' + M.pct1(c.ctr) + '</td><td>' + M.money(c.cpc) + '</td><td>' + int(c.lead) + '</td><td>' + M.money(c.cpl) + '</td><td>' + int(c.msg) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +

      '<div class="rep-sec"><div class="step">5 · MELHORES ANÚNCIOS</div><h3>🏆 Destaques pra produzir mais</h3>' +
      (function () {
        var b = ads.filter(function (a) { return a.lead > 0; }).sort(function (a, z) { return (a.cpl || 1e9) - (z.cpl || 1e9); }).slice(0, 6);
        if (!b.length) b = ads.filter(function (a) { return a.msg > 0; }).sort(function (a, z) { return (a.cpmsg || 1e9) - (z.cpmsg || 1e9); }).slice(0, 6);
        return b.length ? b.map(function (a) { var res = a.lead > 0 ? int(a.lead) + ' lead(s) · custo/lead ' + M.money(a.cpl) : int(a.msg) + ' msg(s) · custo/msg ' + M.money(a.cpmsg); return '<div class="rep-ad"><div><span class="nm">' + esc(a.label) + '</span> <span class="mt">· ' + res + ' · ' + M.money(a.spend) + ' gastos</span></div><input data-adlink="' + encodeURIComponent(a.label) + '" placeholder="cole o link do anúncio (Instagram)"></div>'; }).join('')
          : '<p class="rep-p muted">Sem resultado atribuído a um anúncio específico no período.</p>';
      })() + '</div>';

    /* ---- briefing do gestor (interno) ---- */
    var brief = [];
    var xGeral = 'Investimento ' + M.money(cur.spend) + ' gerou ' + int(cur.lead) + ' lead(s) (custo/lead ' + M.money(cur.cpl) + ') e ' + int(cur.msg) + ' mensagem(ns) (custo/msg ' + M.money(cur.cpmsg) + '). Total de ' + int(cur.lead + cur.msg) + ' contatos no período.';
    brief.push({ t: 'Leitura geral', h: '<p>' + xGeral + '</p>', x: xGeral });

    var topStatus = [['ctr', cur.ctr], ['cpc', cur.cpc], ['cpm', cur.cpm]].map(function (p) { var st = statusOf(p[1], BANDS[p[0]]); return BANDS[p[0]].label + ' ' + BANDS[p[0]].fmt(p[1]) + ' (' + (st ? st.word : '—') + ')'; }).join(' · ');
    var allTopGood = ['ctr', 'cpc', 'cpm'].every(function (k) { var st = statusOf(cur[k], BANDS[k]); return st && st.lvl === 'good'; });
    var xTopo = 'Mídia: ' + topStatus + '. ' + (allTopGood ? 'A mídia está barata e atraente — o gargalo, se houver, está na quantidade/qualidade de lead, não no clique.' : 'Há espaço pra melhorar a mídia (criativo/público) antes de escalar.');
    brief.push({ t: 'Mídia (topo)', h: '<p>' + xTopo + '</p>', x: xTopo });

    var ds = dRows.filter(function (r) { return r.lead > 0; });
    var xDia;
    if (ds.length) {
      var best = ds.reduce(function (a, b) { return (b.cpl || 1e9) < (a.cpl || 1e9) ? b : a; });
      var worst = ds.reduce(function (a, b) { return (b.cpl || 0) > (a.cpl || 0) ? b : a; });
      xDia = ds.length + ' dia(s) com lead. Melhor: ' + brFull(best.d) + ' (custo/lead ' + M.money(best.cpl) + ', ' + int(best.lead) + ' leads)' + (worst !== best ? ' · pior: ' + brFull(worst.d) + ' (custo/lead ' + M.money(worst.cpl) + ')' : '') + '.';
    } else xDia = 'Sem leads dia a dia no período — verifique se há campanha de formulário ativa (as de mensagem não geram lead de form).';
    brief.push({ t: 'Dia a dia', h: '<p>' + xDia + '</p>', x: xDia });

    var winners = ads.filter(function (a) { return a.lead > 0 && ok(a.cpl); }).sort(function (a, b) { return a.cpl - b.cpl; }).slice(0, 4);
    var burning = ads.filter(function (a) { return a.spend >= (cur.cpl || 20) * 3 && a.lead === 0 && a.msg === 0; }).sort(function (a, b) { return b.spend - a.spend; }).slice(0, 4);
    var campHtml = '';
    if (winners.length) campHtml += '<p><span class="rep-flag g">CAMPEÕES</span> menor custo/lead:</p><ul>' + winners.map(function (a) { return '<li><b>' + esc(a.label) + '</b> — ' + int(a.lead) + ' lead(s), custo/lead ' + M.money(a.cpl) + ', ' + M.money(a.spend) + ' gastos.</li>'; }).join('') + '</ul>';
    if (burning.length) campHtml += '<p style="margin-top:10px"><span class="rep-flag r">QUEIMANDO VERBA</span> gasto relevante sem resultado:</p><ul>' + burning.map(function (a) { return '<li><b>' + esc(a.label) + '</b> — ' + M.money(a.spend) + ' gastos, 0 lead/msg — candidato a pausar/revisar criativo.</li>'; }).join('') + '</ul>';
    if (!campHtml) campHtml = '<p class="rep-p muted">Ainda sem volume por anúncio pra separar campeões de perdedores com segurança.</p>';
    var campX = 'Campeões (custo/lead): ' + (winners.map(function (a) { return a.label + ' (' + M.money(a.cpl) + ')'; }).join('; ') || '—') + '.\nQueimando verba: ' + (burning.map(function (a) { return a.label + ' (' + M.money(a.spend) + ', 0 resultado)'; }).join('; ') || '—') + '.';
    brief.push({ t: 'Campanhas / anúncios', h: campHtml, x: campX });

    // insights e gargalos
    var ins = [];
    var topGoods = ['ctr', 'cpc', 'cpm'].filter(function (k) { var st = statusOf(cur[k], BANDS[k]); return st && st.lvl === 'good'; });
    if (topGoods.length >= 2) ins.push(['✅', '<b>Mídia forte:</b> ' + topGoods.map(function (k) { return BANDS[k].label; }).join(', ') + ' dentro da faixa boa. A entrega está barata — o ganho está em converter o clique em lead.']);
    if (cur.lead > 0 && ok(cur.leadRate) && cur.leadRate < 0.05) ins.push(['🔎', '<b>Poucos leads por clique:</b> só ' + M.pct1(cur.leadRate) + ' dos cliques viram lead. Revisar formulário/oferta ou a promessa do criativo.']);
    if (cur.lead === 0 && cur.spend > 0) ins.push(['⏳', '<b>Sem lead no período:</b> ' + M.money(cur.spend) + ' investidos, 0 lead de formulário. Confirme se há campanha de Lead Ads ativa (as de mensagem geram conversa, não lead).']);
    burning.slice(0, 2).forEach(function (a) { ins.push(['🔥', '<b>Queimando verba:</b> "' + esc(a.label) + '" gastou ' + M.money(a.spend) + ' sem lead/msg — candidato a pausar.']); });
    winners.slice(0, 2).forEach(function (a) { ins.push(['⭐', '<b>Destaque:</b> "' + esc(a.label) + '" custo/lead ' + M.money(a.cpl) + ' com ' + int(a.lead) + ' lead(s) — colocar mais verba e criar variações.']); });
    ins.push(['🧭', allTopGood ? '<b>Resumo:</b> mídia saudável — foco em volume qualificado de lead e no atendimento rápido das conversas.' : '<b>Resumo:</b> ajustar mídia (criativo/público) antes de escalar verba.']);
    var insHtml = '<div>' + ins.map(function (i) { return '<div class="insight"><span class="ico">' + i[0] + '</span><span class="tx">' + i[1] + '</span></div>'; }).join('') + '</div>';
    brief.push({ t: 'Insights e gargalos', h: insHtml, x: ins.map(function (i) { return '• ' + i[1].replace(/<[^>]+>/g, ''); }).join('\n') });

    // próximos passos
    var sug = [];
    if (cur.lead === 0 && cur.spend > 0) sug.push('Confirmar campanha de Lead Ads ativa e rastreamento do formulário.');
    if (ok(cur.leadRate) && cur.leadRate < 0.05 && cur.lead > 0) sug.push('Melhorar conversão clique→lead: simplificar formulário, alinhar promessa do criativo com a oferta.');
    if (winners.length) sug.push('Escalar os campeões de custo/lead: ' + winners.slice(0, 3).map(function (a) { return esc(a.label); }).join(', ') + '.');
    burning.slice(0, 2).forEach(function (a) { sug.push('Pausar/revisar "' + esc(a.label) + '" (' + M.money(a.spend) + ' sem resultado).'); });
    if (allTopGood) sug.push('Não mexer na mídia (CTR/CPC/CPM já bons) — foco em volume e atendimento.');
    if (!sug.length) sug.push('Manter monitoramento diário do custo por lead e do volume.');
    brief.push({ t: 'Próximos passos (sugestões)', h: '<ul>' + sug.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>', x: sug.map(function (s) { return '• ' + s.replace(/<[^>]+>/g, ''); }).join('\n') });

    var briefText = 'BRIEFING DO GESTOR — Conta Casinha\n' + perLabel + '\n\n' + brief.map(function (s) { return s.t.toUpperCase() + '\n' + s.x; }).join('\n\n') + '\n\n— gerado pela dashboard (' + (D.generatedAt || '') + ' ' + (D.tz || 'BRT') + ')';

    var briefingBlock = '<div class="briefing"><div class="bh"><h3>🔒 Briefing do gestor <span style="font-weight:500;font-size:12px;color:var(--ink-3)">— uso interno, não vai no print/cliente.</span></h3><button class="rep-copy" id="repCopy">📋 Copiar briefing</button></div>' +
      brief.map(function (s) { return '<div class="brief-sub"><div class="bt">' + s.t + '</div>' + s.h + '</div>'; }).join('') +
      '<div class="brief-scratch"><div class="bt" style="color:var(--brand)">✍️ Suas anotações (rascunho)</div><textarea data-note="scratch" rows="3" placeholder="rascunho livre pra você…"></textarea></div></div>';

    $('reportView').innerHTML = '<div class="report"><div class="rep-head"><div><h2>📄 Relatório — ' + esc(perLabel) + '</h2>' +
      '<p class="sub" style="margin-top:2px">Muda sozinho conforme o período · dados de ' + esc(D.generatedAt || '—') + '</p></div></div>' +
      '<p class="sub" style="margin:0 0 8px">⬇️ Blocos visuais limpos (é o que você manda em print pro cliente). Seu <b style="color:var(--ink-2)">briefing interno</b> fica no final.</p>' +
      secVisual + briefingBlock + '</div>';

    Array.prototype.forEach.call(document.querySelectorAll('#reportView [data-note]'), function (t) {
      var k = 'cc-note-' + t.dataset.note; try { t.value = localStorage.getItem(k) || ''; } catch (e) { }
      t.oninput = function () { try { localStorage.setItem(k, t.value); } catch (e) { } };
    });
    Array.prototype.forEach.call(document.querySelectorAll('#reportView [data-adlink]'), function (inp) {
      var k = 'cc-adlink-' + decodeURIComponent(inp.dataset.adlink); try { inp.value = localStorage.getItem(k) || ''; } catch (e) { }
      inp.oninput = function () { try { localStorage.setItem(k, inp.value); } catch (e) { } };
    });
    $('repCopy').onclick = function (e) {
      var btn = e.currentTarget, scratch = ''; try { scratch = (localStorage.getItem('cc-note-scratch') || '').trim(); } catch (_) { }
      var full = briefText + (scratch ? '\n\nSUAS ANOTAÇÕES\n' + scratch : '');
      navigator.clipboard.writeText(full).then(function () { btn.textContent = '✅ Copiado!'; setTimeout(function () { btn.textContent = '📋 Copiar briefing'; }, 1800); }).catch(function () { btn.textContent = '❌ copie manualmente'; });
    };
  }

  /* ================================================================ filtro de campanha */
  function setCamps(sel) {
    if (!sel || sel.length === 0 || sel.length >= ALL_CAMPS.length) STATE.camps = null;
    else { STATE.camps = {}; sel.forEach(function (n) { STATE.camps[n] = true; }); }
    try { localStorage.setItem('cc-camps', STATE.camps ? JSON.stringify(Object.keys(STATE.camps)) : ''); } catch (e) { }
    updateCampBtn();
  }
  function updateCampBtn() {
    var b = $('campBtn'); if (!b) return;
    b.textContent = (STATE.camps ? (campSelectedCount() + ' de ' + ALL_CAMPS.length + ' campanhas') : 'Todas as campanhas') + ' ▾';
    b.classList.toggle('on', campFilterActive());
  }
  function renderCampPanel() {
    var p = $('campPanel'); if (!p) return;
    var allChecked = !STATE.camps;
    var rows = ALL_CAMPS.map(function (c) {
      var ck = allChecked || (STATE.camps && STATE.camps[c] === true);
      return '<label class="dd-item"><input type="checkbox" data-camp="' + encodeURIComponent(c) + '"' + (ck ? ' checked' : '') + '><b class="dd-sp">' + money0(CAMP_SPEND[c]) + '</b><span class="dd-nm">' + esc(c) + '</span></label>';
    }).join('');
    p.innerHTML = '<div class="dd-head"><span>Filtrar campanhas</span><button class="dd-mini" id="campAll">Selecionar todas</button></div>' + rows;
    function current() { var a = []; Array.prototype.forEach.call(p.querySelectorAll('[data-camp]'), function (cb) { if (cb.checked) a.push(decodeURIComponent(cb.dataset.camp)); }); return a; }
    Array.prototype.forEach.call(p.querySelectorAll('[data-camp]'), function (cb) { cb.onchange = function () { setCamps(current()); refresh(); }; });
    $('campAll').onclick = function () { Array.prototype.forEach.call(p.querySelectorAll('[data-camp]'), function (cb) { cb.checked = true; }); setCamps(null); refresh(); };
  }
  function initCampSelector() {
    var b = $('campBtn'), p = $('campPanel'); if (!b || !p) return;
    try { var saved = localStorage.getItem('cc-camps'); if (saved) { var arr = JSON.parse(saved).filter(function (n) { return ALL_CAMPS.indexOf(n) >= 0; }); if (arr.length && arr.length < ALL_CAMPS.length) { STATE.camps = {}; arr.forEach(function (n) { STATE.camps[n] = true; }); } } } catch (e) { }
    updateCampBtn();
    b.onclick = function (e) { e.stopPropagation(); var open = p.hidden; if (open) renderCampPanel(); p.hidden = !open; b.setAttribute('aria-expanded', String(open)); };
    p.onclick = function (e) { e.stopPropagation(); };
    document.addEventListener('click', function () { if (!p.hidden) { p.hidden = true; b.setAttribute('aria-expanded', 'false'); } });
  }
  function filterBarHTML() {
    if (!campFilterActive()) return '';
    return '<div class="filterbar">🔎 <b>Filtro de campanha ativo</b> — ' + campSelectedCount() + ' de ' + ALL_CAMPS.length + ' campanhas. Todos os números (investimento, leads, mensagens e mídia) refletem só as campanhas selecionadas.</div>';
  }

  /* ================================================================ shell / roteamento */
  function refresh() {
    var len = diffDays(STATE.from, STATE.to) + 1;
    $('filterBar').innerHTML = filterBarHTML();
    $('cmpNote').textContent = len + (len > 1 ? ' dias selecionados' : ' dia selecionado');
    $('overviewView').hidden = STATE.tab !== 'overview';
    var _tv = $('trafficView'); if (_tv) _tv.hidden = STATE.tab !== 'traffic';
    if (STATE.tab === 'traffic' && _tv) renderTraffic();
    else renderOverview();
  }
  function setPeriod(from, to, preset) {
    STATE.from = clampD(from); STATE.to = clampD(to); STATE.preset = preset || 'custom';
    $('from').value = STATE.from; $('to').value = STATE.to;
    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) { b.setAttribute('aria-pressed', b.dataset.preset === STATE.preset); });
    refresh();
  }

  function shell() {
    var m = D;
    $('subtitle').innerHTML = '<b>Funil de captação</b> · leads de formulário + mensagens · dados de ' + brFull(minDate) + ' a ' + brFull(maxDate) + ' · ' + int(daily.length) + ' dias com registro';
    $('updated').textContent = 'atualizado ' + esc(m.generatedAt || '—') + ' ' + esc(m.tz || 'BRT');
    $('taxBadge').textContent = TAX === 1 ? 'sem imposto' : 'imposto ×' + taxStr(TAX);
    $('from').min = $('to').min = minDate; $('from').max = $('to').max = maxDate;

    var totalSpend = daily.reduce(function (s, r) { return s + r.spend; }, 0);
    var totLead = daily.reduce(function (s, r) { return s + r.lead; }, 0);
    var totMsg = daily.reduce(function (s, r) { return s + r.msg; }, 0);
    $('footer').innerHTML =
      'Gasto total do período completo: ' + money(totalSpend) + ' (já com imposto ×' + taxStr(TAX) + '). ' +
      'Fonte: <b>Meta Graph API</b> (insights nível anúncio) · conta <code>' + esc(m.account || '') + '</code>. ' +
      '<b>Leads</b> = formulário (Lead Ads, ' + int(totLead) + ' no total) · <b>Mensagens</b> = 1ª resposta em conversa (' + int(totMsg) + '). ' +
      'CTR sempre de <b>link</b>. Somente leitura.';

    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
      b.onclick = function () {
        var p = b.dataset.preset;
        if (p === 'all') return setPeriod(minDate, maxDate, 'all');
        if (p === 'today') return setPeriod(maxDate, maxDate, 'today');
        if (p === 'yesterday') { var y = dayAdd(maxDate, -1); return setPeriod(y, y, 'yesterday'); }
        if (p === 'month') return setPeriod(firstOfMonth(maxDate), maxDate, 'month');
        var n = +p; return setPeriod(dayAdd(maxDate, -(n - 1)), maxDate, p);
      };
    });
    function clampDates() { var f = $('from').value, t = $('to').value; if (!f || !t) return; if (f > t) { var tmp = f; f = t; t = tmp; } setPeriod(f, t, 'custom'); }
    $('from').onchange = clampDates; $('to').onchange = clampDates;

    if (!CLIENT) { try { var tv = localStorage.getItem('cc-tab'); if (['overview', 'traffic'].indexOf(tv) >= 0) STATE.tab = tv; } catch (e) { } }
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === STATE.tab);
      b.onclick = function () {
        STATE.tab = b.dataset.tab;
        try { localStorage.setItem('cc-tab', STATE.tab); } catch (e) { }
        Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (x) { x.setAttribute('aria-selected', x.dataset.tab === STATE.tab); });
        refresh();
      };
    });

    setPeriod(firstOfMonth(maxDate), maxDate, 'month');
  }

  /* ---------------------------------------------------------------- tema */
  function applyTheme(t) { document.documentElement.dataset.theme = t; var tb = $('theme'); if (tb) tb.textContent = t === 'dark' ? 'Claro' : 'Escuro'; try { localStorage.setItem('cc-theme', t); } catch (e) { } }
  if ($('theme')) $('theme').onclick = function () { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); };
  if ($('refresh')) $('refresh').onclick = function () { var b = this; b.textContent = '⏳ Atualizando…'; b.disabled = true; setTimeout(function () { location.reload(); }, 60); };
  try { var saved = localStorage.getItem('cc-theme'); applyTheme(saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')); } catch (e) { applyTheme('dark'); }

  /* ---------------------------------------------------------------- boot */
  TIP = $('tip');
  var rt;
  addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (daily.length) refresh(); }, 180); });
  if (!daily.length) { $('overviewView').innerHTML = '<div class="panel"><div class="loading">Sem dados. Rode o build.</div></div>'; }
  else { shell(); fetchRanking(); }
})();
