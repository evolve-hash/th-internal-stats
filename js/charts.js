/* ============================================================
   charts.js — hand-built SVG charts on the Team Howe palette.
   No chart library: every mark follows the house spec —
   ≤24px bars, 4px rounded data-end, 2px surface gaps,
   hairline recessive grid, selective direct labels.
   ============================================================ */

window.TH_CHARTS = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var tip = document.getElementById('tooltip');

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    return n;
  }

  var hideTimer = null;
  var tipVisible = false;

  function showTip(evt, html) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    tip.innerHTML = html;
    tip.style.opacity = '1';
    tipVisible = true;

    // Keep the bubble inside the viewport — on a phone it otherwise runs off
    // the edge and gets clipped.
    var pad = 8;
    tip.style.left = '-9999px';
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var x = Math.min(Math.max(evt.clientX, w / 2 + pad), window.innerWidth - w / 2 - pad);
    var y = evt.clientY;
    if (y - h - 10 < pad) y = evt.clientY + h + 26;   // flip below when near the top
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';

    // A touch never fires mouseleave/pointerleave, so without this the bubble
    // would sit there forever. Auto-retire it.
    if (evt.pointerType === 'touch') hideTimer = setTimeout(hideTip, 2600);
  }

  function hideTip() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    tip.style.opacity = '0';
    tipVisible = false;
  }

  // Safety nets for touch: scrolling away or tapping outside a chart dismisses
  // the bubble. (touchmove is deliberately NOT here — a tap with a pixel of
  // finger travel would kill the tooltip before it was ever read.)
  ['scroll', 'touchcancel'].forEach(function (ev) {
    window.addEventListener(ev, function () { if (tipVisible) hideTip(); }, { passive: true });
  });
  document.addEventListener('pointerdown', function (e) {
    if (tipVisible && !(e.target.closest && e.target.closest('.chart-holder'))) hideTip();
  }, true);
  document.addEventListener('visibilitychange', function () { if (document.hidden) hideTip(); });

  function bindTip(node, htmlFor) {
    var show = function (e) { showTip(e, htmlFor()); };
    node.addEventListener('pointermove', show);
    node.addEventListener('pointerdown', show);
    // A touch pointer stops existing the instant the finger lifts, so the
    // browser fires pointerleave immediately after every tap. Honouring it
    // would blank the tooltip before it could be read — on touch the timer,
    // the scroll handler and the tap-outside handler do the dismissing.
    node.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'touch') hideTip();
    });
    node.addEventListener('pointercancel', hideTip);
  }

  function money(v, compact) {
    if (v === null || v === undefined) return '—';
    if (compact) {
      var a = Math.abs(v);
      if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
      if (a >= 1e6) return '$' + (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
      if (a >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
    }
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  // Round the axis top up to a value whose quarters are also round numbers,
  // so the four gridline labels never read like 125M / 94M / 63M / 31M.
  function niceMax(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 1.2, 1.6, 2, 2.4, 3.2, 4, 5, 6, 8, 10, 12];
    for (var i = 0; i < steps.length; i++) {
      if (mag * steps[i] >= v) return mag * steps[i];
    }
    return mag * 12;
  }

  /* ---------- single-series column chart ---------- */
  function columns(svgId, data, opts) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var vb = svg.viewBox.baseVal;
    var W = vb.width, H = vb.height;
    svg.innerHTML = '';
    if (!data.length) return;

    var padL = 52, padR = 10, padT = 18, padB = 28;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var key = opts.key, fmt = opts.format;
    var maxRaw = Math.max.apply(null, data.map(function (d) { return d[key] || 0; }));
    var top = niceMax(maxRaw * 1.08);
    var slot = plotW / data.length;
    var barW = Math.min(24, slot - 5);

    for (var i = 0; i <= 4; i++) {
      var yv = top * i / 4;
      var y = padT + plotH - (yv / top) * plotH;
      svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y, y2: y, 'class': i === 0 ? 'baseline' : 'grid-line' }));
      var t = el('text', { x: padL - 8, y: y + 3.5, 'text-anchor': 'end', 'class': 'axis-label' });
      t.textContent = fmt(yv, true);
      svg.appendChild(t);
    }

    var everyN = Math.max(1, Math.round(data.length / 10));
    data.forEach(function (d, i) {
      var v = d[key] || 0;
      var x = padL + i * slot + (slot - barW) / 2;
      var h = Math.max((v / top) * plotH, v > 0 ? 2 : 0);
      var y = padT + plotH - h;
      var isLast = i === data.length - 1;

      var g = el('g', { 'class': 'bar-group' });
      var rect = el('rect', {
        x: x, y: y, width: barW, height: h, rx: 3,
        fill: isLast ? 'var(--brand)' : 'var(--ramp-5)',
        'class': 'bar-rect'
      });
      rect.style.animationDelay = (i * 22) + 'ms';
      g.appendChild(rect);

      var hit = el('rect', { x: padL + i * slot, y: padT, width: slot, height: plotH, 'class': 'bar-hit' });
      bindTip(hit, function () {
        return '<strong>' + d.year + '</strong><div class="t-row"><span>' + opts.tipLabel + '</span><span>' + fmt(v) + '</span></div>';
      });
      g.appendChild(hit);
      svg.appendChild(g);

      if (isLast || v === maxRaw) {
        var lbl = el('text', { x: x + barW / 2, y: y - 6, 'class': 'val-label' });
        lbl.textContent = fmt(v, true);
        svg.appendChild(lbl);
      }
      if (i % everyN === 0 || isLast) {
        var xl = el('text', { x: x + barW / 2, y: H - 9, 'text-anchor': 'middle', 'class': 'axis-label' });
        xl.textContent = "'" + String(d.year).slice(2);
        svg.appendChild(xl);
      }
    });
  }

  /* ---------- two-series grouped columns ---------- */
  function grouped(svgId, data, opts) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var vb = svg.viewBox.baseVal;
    var W = vb.width, H = vb.height;
    svg.innerHTML = '';
    if (!data.length) return;

    var padL = 62, padR = 12, padT = 18, padB = 30;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var kA = opts.keyA, kB = opts.keyB;
    var maxRaw = Math.max.apply(null, data.map(function (d) {
      return Math.max(d[kA] || 0, d[kB] || 0);
    }));
    var top = niceMax(maxRaw * 1.1);
    var slot = plotW / data.length;
    var pairW = Math.min(30, slot - 8);
    var barW = (pairW - 2) / 2;      // 2px surface gap between the pair

    for (var i = 0; i <= 4; i++) {
      var yv = top * i / 4;
      var y = padT + plotH - (yv / top) * plotH;
      svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y, y2: y, 'class': i === 0 ? 'baseline' : 'grid-line' }));
      var t = el('text', { x: padL - 9, y: y + 3.5, 'text-anchor': 'end', 'class': 'axis-label' });
      t.textContent = money(yv, true);
      svg.appendChild(t);
    }

    data.forEach(function (d, i) {
      var gx = padL + i * slot + (slot - pairW) / 2;
      var g = el('g', { 'class': 'bar-group' });

      [[kA, 'var(--series-a)', 0], [kB, 'var(--series-b)', barW + 2]].forEach(function (spec) {
        var v = d[spec[0]];
        if (v === null || v === undefined || v <= 0) return;
        var h = Math.max((v / top) * plotH, 2);
        var r = el('rect', {
          x: gx + spec[2], y: padT + plotH - h, width: barW, height: h, rx: 2.5,
          fill: spec[1], 'class': 'bar-rect'
        });
        r.style.animationDelay = (i * 20) + 'ms';
        g.appendChild(r);
      });

      var hit = el('rect', { x: padL + i * slot, y: padT, width: slot, height: plotH, 'class': 'bar-hit' });
      bindTip(hit, function () {
        return '<strong>' + d.year + '</strong>' +
          '<div class="t-row"><span>Gross</span><span>' + money(d[kA]) + '</span></div>' +
          '<div class="t-row"><span>Net</span><span>' + (d[kB] ? money(d[kB]) : 'not tracked') + '</span></div>';
      });
      g.appendChild(hit);
      svg.appendChild(g);

      var xl = el('text', { x: gx + pairW / 2, y: H - 10, 'text-anchor': 'middle', 'class': 'axis-label' });
      xl.textContent = d.year;
      svg.appendChild(xl);
    });
  }

  /* ---------- ranked ordinal bars ---------- */
  function ranked(hostId, items, opts) {
    opts = opts || {};
    var host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    // Percentages are of the whole population, which may be larger than the
    // rows shown (a truncated tail still belongs in the denominator).
    var total = opts.pctBase || items.reduce(function (a, d) { return a + d.count; }, 0) || 1;
    var max = Math.max.apply(null, items.map(function (d) { return d.count; })) || 1;
    // Rank only the real categories; catch-all buckets sit outside the ramp
    // so a darker step always means a bigger share.
    var ranked = items.filter(function (d) { return !d.neutral; });

    items.forEach(function (d, i) {
      var pct = d.count / total * 100;
      var w = d.count / max * 100;
      var fill;
      if (d.neutral) {
        fill = 'var(--ink-3)';
      } else {
        var rank = ranked.indexOf(d);
        var step = Math.min(6, Math.max(1, 6 - Math.floor(rank * 6 / Math.max(ranked.length, 1))));
        fill = 'var(--ramp-' + step + ')';
      }
      var row = document.createElement('div');
      row.className = 'obar';
      row.innerHTML =
        '<div class="obar__label">' + d.label + '</div>' +
        '<div class="obar__track"><div class="obar__fill" style="width:' + w + '%;background:' + fill + ';animation-delay:' + (i * 55) + 'ms"></div></div>' +
        '<div class="obar__val">' + d.count + ' · ' + pct.toFixed(0) + '%</div>';
      host.appendChild(row);
      // force the width transition to run from 0
      requestAnimationFrame(function () {
        var f = row.querySelector('.obar__fill');
        if (f) f.style.width = w + '%';
      });
    });
    if (opts && opts.caption) {
      var c = document.createElement('div');
      c.style.cssText = 'font-size:11px;color:var(--ink-3);margin-top:12px;line-height:1.5;';
      c.textContent = opts.caption;
      host.appendChild(c);
    }
  }

  return { columns: columns, grouped: grouped, ranked: ranked, money: money, niceMax: niceMax };
})();
