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
    var ov = opts.overlay;                     // second series, same units, drawn as a line
    if (ov && ov.values && ov.values.length) {
      maxRaw = Math.max(maxRaw, Math.max.apply(null, ov.values));
    }
    var top = niceMax(maxRaw * 1.08);
    var slot = plotW / data.length;
    var barW = Math.min(opts.maxBarW || 24, slot - 5);

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
      var isLast = opts.highlight === 'none' ? false : (i === data.length - 1);

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
        var title = opts.tipTitle ? opts.tipTitle(d) : d.year;
        var html = '<strong>' + title + '</strong><div class="t-row"><span>' + opts.tipLabel +
                   '</span><span>' + fmt(v) + '</span></div>';
        if (ov && ov.values && ov.values[i] !== undefined) {
          html += '<div class="t-row"><span>' + (ov.tipLabel || ov.label) + '</span><span>' +
                  fmt(ov.values[i]) + '</span></div>';
        }
        return html + (opts.tipExtra ? opts.tipExtra(d) : '');
      });
      g.appendChild(hit);
      svg.appendChild(g);

      if ((isLast || v === maxRaw) && opts.hideValueLabels !== true) {
        var lbl = el('text', { x: x + barW / 2, y: y - 6, 'class': 'val-label' });
        lbl.textContent = fmt(v, true);
        svg.appendChild(lbl);
      }
      if (i % everyN === 0 || isLast || opts.labelEvery === 1) {
        var xl = el('text', { x: x + barW / 2, y: H - 9, 'text-anchor': 'middle', 'class': 'axis-label' });
        xl.textContent = opts.label ? opts.label(d) : ("'" + String(d.year).slice(2));
        svg.appendChild(xl);
      }
    });

    if (ov && ov.values && ov.values.length === data.length) {
      var cx = function (i) { return padL + i * slot + slot / 2; };
      var cy = function (v) { return padT + plotH - ((v || 0) / top) * plotH; };
      var dLine = ov.values.map(function (v, i) {
        return (i ? 'L' : 'M') + cx(i).toFixed(1) + ' ' + cy(v).toFixed(1);
      }).join(' ');
      var op = el('path', { d: dLine, fill: 'none', stroke: ov.color || 'var(--series-a)',
                            'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      svg.appendChild(op);
      ov.values.forEach(function (v, i) {
        svg.appendChild(el('circle', { cx: cx(i), cy: cy(v), r: 2.6,
                                       fill: ov.color || 'var(--series-a)',
                                       stroke: 'var(--surface)', 'stroke-width': 1.5 }));
      });
      try {
        var L = op.getTotalLength();
        op.style.strokeDasharray = L; op.style.strokeDashoffset = L;
        op.getBoundingClientRect();
        op.style.transition = 'stroke-dashoffset .8s cubic-bezier(.22,.61,.36,1)';
        op.style.strokeDashoffset = 0;
      } catch (e) {}
    }
  }



  /* ---------- responsive sizing ----------
     A fixed viewBox scaled into a 360px phone shrinks every label with it: the
     19-year chart ends up drawing 10px type at a third of its size. On small
     screens we instead draw the chart at real pixel size, so a 10px label is a
     10px label, and let the holder scroll sideways when the data genuinely
     needs more room than the screen has. */
  function fit(svgId, opts) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var holder = svg.parentNode;
    var avail = holder && holder.clientWidth ? holder.clientWidth : 0;
    var small = window.matchMedia && window.matchMedia('(max-width: 700px)').matches;
    if (!small || !avail) {                       // desktop: leave the design alone
      svg.style.width = '';
      svg.setAttribute('viewBox', '0 0 ' + opts.w + ' ' + opts.h);
      return;
    }
    var gutter = 66;                              // y-axis labels plus right padding
    var need = opts.count ? opts.count * (opts.minSlot || 30) + gutter : 0;
    var W = Math.max(avail, need);
    var H = opts.mobileH || Math.round(opts.h * 0.92);
    svg.setAttribute('viewBox', '0 0 ' + Math.round(W) + ' ' + H);
    svg.style.width = Math.round(W) + 'px';
    // A time series that does not fit opens on the newest data, not on 2008.
    if (opts.scrollTo === 'end' && W > avail + 4) {
      requestAnimationFrame(function () { holder.scrollLeft = W; });
    } else {
      // Switching views reuses the same holder; without this it would keep the
      // sideways scroll from whatever was drawn there before.
      holder.scrollLeft = 0;
    }
  }

  /* ---------- single-series line ----------
     Used for the rolling twelve-month view: one quantity through time, so one
     hue and no legend. Every point is hoverable, but only a few are drawn as
     dots — 200-odd visible dots would read as noise rather than as data. */
  function line(svgId, points, opts) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var vb = svg.viewBox.baseVal;
    var W = vb.width, H = vb.height;
    svg.innerHTML = '';
    if (points.length < 2) return;

    var padL = 52, padR = 12, padT = 18, padB = 28;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var fmt = opts.format;
    var maxRaw = Math.max.apply(null, points.map(function (p) { return p.value || 0; }));
    var top = niceMax(maxRaw * 1.08);

    for (var i = 0; i <= 4; i++) {
      var yv = top * i / 4;
      var gy = padT + plotH - (yv / top) * plotH;
      svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: gy, y2: gy,
                                   'class': i === 0 ? 'baseline' : 'grid-line' }));
      var t = el('text', { x: padL - 8, y: gy + 3.5, 'text-anchor': 'end', 'class': 'axis-label' });
      t.textContent = fmt(yv, true);
      svg.appendChild(t);
    }

    var X = function (i) { return padL + (points.length === 1 ? plotW / 2 : i * plotW / (points.length - 1)); };
    var Y = function (v) { return padT + plotH - ((v || 0) / top) * plotH; };

    var dArea = 'M' + X(0) + ' ' + (padT + plotH);
    var dLine = '';
    points.forEach(function (p, i) {
      dArea += ' L' + X(i).toFixed(1) + ' ' + Y(p.value).toFixed(1);
      dLine += (i ? ' L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.value).toFixed(1);
    });
    dArea += ' L' + X(points.length - 1) + ' ' + (padT + plotH) + ' Z';

    svg.appendChild(el('path', { d: dArea, fill: 'var(--brand-wash)', stroke: 'none' }));
    var path = el('path', { d: dLine, fill: 'none', stroke: 'var(--brand)',
                            'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
                            'class': 'line-path' });
    svg.appendChild(path);
    // Draw the line on, left to right.
    try {
      var len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      path.getBoundingClientRect();
      path.style.transition = 'stroke-dashoffset .7s cubic-bezier(.22,.61,.36,1)';
      path.style.strokeDashoffset = 0;
    } catch (e) {}

    // Final point, called out.
    var lastI = points.length - 1;
    svg.appendChild(el('circle', { cx: X(lastI), cy: Y(points[lastI].value), r: 3.5,
                                   fill: 'var(--brand)', stroke: 'var(--surface)', 'stroke-width': 2 }));
    var lbl = el('text', { x: X(lastI), y: Y(points[lastI].value) - 9, 'text-anchor': 'end', 'class': 'val-label' });
    lbl.textContent = fmt(points[lastI].value, true);
    svg.appendChild(lbl);

    // Hover columns across the whole plot.
    var slot = plotW / points.length;
    points.forEach(function (p, i) {
      var hit = el('rect', { x: X(i) - slot / 2, y: padT, width: slot, height: plotH, 'class': 'bar-hit' });
      bindTip(hit, function () {
        return '<strong>' + p.label + '</strong><div class="t-row"><span>' + opts.tipLabel +
               '</span><span>' + fmt(p.value) + '</span></div>' + (p.extra || '');
      });
      svg.appendChild(hit);
    });

    // Sparse x labels.
    var everyN = Math.max(1, Math.round(points.length / 8));
    points.forEach(function (p, i) {
      if (i % everyN && i !== lastI) return;
      var xl = el('text', { x: X(i), y: H - 9, 'text-anchor': 'middle', 'class': 'axis-label' });
      xl.textContent = p.short;
      svg.appendChild(xl);
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

  /* ---------- ranked ordinal bars ----------
     Rows are keyed by label and reused across renders, so switching the
     All/Buyer/Seller filter reorders and resizes them instead of tearing the
     list down. Movement uses FLIP: measure where each surviving row sits,
     re-order the DOM, then play it back from its old position. */
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tweenNumber(node, to, suffix) {
    var from = Number(node.getAttribute('data-n') || 0);
    node.setAttribute('data-n', to);
    if (REDUCED || from === to) { node.textContent = to + suffix(to); return; }
    var t0 = null, dur = 480;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3);                 // easeOutCubic
      var v = Math.round(from + (to - from) * e);
      node.textContent = v + suffix(v);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function ranked(hostId, items, opts) {
    opts = opts || {};
    var host = document.getElementById(hostId);
    if (!host) return;

    // Percentages are of the whole population, which may be larger than the
    // rows shown (a truncated tail still belongs in the denominator).
    var total = opts.pctBase || items.reduce(function (a, d) { return a + d.count; }, 0) || 1;
    var max = Math.max.apply(null, items.map(function (d) { return d.count; })) || 1;
    // Rank only the real categories; catch-all buckets sit outside the ramp
    // so a darker step always means a bigger share.
    var realRanked = items.filter(function (d) { return !d.neutral; });

    // --- FLIP, first pass: where is everything now? ---
    var prev = {};
    Array.prototype.forEach.call(host.querySelectorAll('.obar'), function (row) {
      if (!row.classList.contains('is-leaving')) prev[row.getAttribute('data-key')] = row.offsetTop;
    });

    var pool = {};
    Array.prototype.forEach.call(host.querySelectorAll('.obar'), function (row) {
      pool[row.getAttribute('data-key')] = row;
    });

    var seen = {}, order = [];
    items.forEach(function (d, i) {
      var key = d.label;
      seen[key] = true;
      var pct = d.count / total * 100;
      var w = d.count / max * 100;
      var fill;
      if (d.neutral) {
        fill = 'var(--ink-3)';
      } else {
        var rank = realRanked.indexOf(d);
        var step = Math.min(6, Math.max(1, 6 - Math.floor(rank * 6 / Math.max(realRanked.length, 1))));
        fill = 'var(--ramp-' + step + ')';
      }

      var row = pool[key];
      var isNew = !row;
      if (isNew) {
        row = document.createElement('div');
        row.className = 'obar';
        row.setAttribute('data-key', key);
        row.innerHTML =
          '<div class="obar__label"></div>' +
          '<div class="obar__track"><div class="obar__fill" style="width:0"></div></div>' +
          '<div class="obar__val" data-n="0"></div>';
        row.querySelector('.obar__label').textContent = d.label;
      }
      row.classList.remove('is-leaving');

      var f = row.querySelector('.obar__fill');
      f.style.background = fill;
      var val = row.querySelector('.obar__val');
      tweenNumber(val, d.count, function (v) { return ' · ' + Math.round(v / total * 100) + '%'; });

      order.push({ row: row, w: w, isNew: isNew, i: i });
    });

    // Rows that no longer apply fade out, then leave for real.
    Object.keys(pool).forEach(function (k) {
      if (seen[k]) return;
      var row = pool[k];
      if (row.classList.contains('is-leaving')) return;
      row.classList.add('is-leaving');
      setTimeout(function () { if (row.parentNode) row.parentNode.removeChild(row); }, REDUCED ? 0 : 300);
    });

    // Re-order / insert. Appending an existing node moves it.
    var caption = host.querySelector('.obar-caption');
    order.forEach(function (o) { host.appendChild(o.row); });

    // --- FLIP, second pass: play each survivor back from where it was ---
    order.forEach(function (o) {
      var was = prev[o.row.getAttribute('data-key')];
      if (!REDUCED && was !== undefined) {
        var dy = was - o.row.offsetTop;
        if (dy) {
          o.row.style.transition = 'none';
          o.row.style.transform = 'translateY(' + dy + 'px)';
          requestAnimationFrame(function () {
            o.row.style.transition = 'transform .5s var(--ease), opacity .3s var(--ease)';
            o.row.style.transform = '';
          });
        }
      }
      if (o.isNew) {
        o.row.classList.add('is-entering');
        o.row.style.animationDelay = Math.min(o.i * 45, 320) + 'ms';
        // Drop the class once it has played, otherwise it sticks to the row
        // forever and the next entrance never animates.
        o.row.addEventListener('animationend', function onDone() {
          o.row.classList.remove('is-entering');
          o.row.style.animationDelay = '';
          o.row.removeEventListener('animationend', onDone);
        });
      }
      // Let the width land on the next frame so the CSS transition runs.
      var f = o.row.querySelector('.obar__fill');
      requestAnimationFrame(function () { f.style.width = o.w + '%'; });
    });

    // Caption lives at the bottom and is reused so it never flickers.
    if (opts.caption) {
      if (!caption) {
        caption = document.createElement('div');
        caption.className = 'obar-caption';
        host.appendChild(caption);
      } else {
        host.appendChild(caption);
      }
      caption.textContent = opts.caption;
    } else if (caption) {
      caption.parentNode.removeChild(caption);
    }
  }

  /* ---------- stacked columns (house vs. each teammate) ----------
     One stack per year. Segments are separated by a 2px surface gap rather
     than a stroke, so the bar reads as parts of a whole. */
  function stacked(svgId, years, keys, opts) {
    opts = opts || {};
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var vb = svg.viewBox.baseVal;
    var W = vb.width, H = vb.height;
    svg.innerHTML = '';
    if (!years.length || !keys.length) return;

    var padL = 62, padR = 12, padT = 18, padB = 30;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var totals = years.map(function (y) {
      return keys.reduce(function (a, k) { return a + (y.parts[k.key] || 0); }, 0);
    });
    var top = niceMax(Math.max.apply(null, totals) * 1.08);
    var slot = plotW / years.length;
    var barW = Math.min(30, slot - 8);
    var GAP = 2;

    for (var i = 0; i <= 4; i++) {
      var yv = top * i / 4;
      var yy = padT + plotH - (yv / top) * plotH;
      svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, 'class': i === 0 ? 'baseline' : 'grid-line' }));
      var t = el('text', { x: padL - 9, y: yy + 3.5, 'text-anchor': 'end', 'class': 'axis-label' });
      t.textContent = money(yv, true);
      svg.appendChild(t);
    }

    years.forEach(function (y, i) {
      var x = padL + i * slot + (slot - barW) / 2;
      var cursor = padT + plotH;
      var g = el('g', { 'class': 'bar-group' });

      keys.forEach(function (k, ki) {
        var v = y.parts[k.key] || 0;
        if (v <= 0) return;
        var h = (v / top) * plotH;
        var drawH = Math.max(h - GAP, 1);
        var rect = el('rect', {
          x: x, y: cursor - h, width: barW, height: drawH,
          rx: ki === 0 ? 2.5 : 0, fill: k.color, 'class': 'bar-rect'
        });
        rect.style.animationDelay = (i * 22) + 'ms';
        g.appendChild(rect);
        cursor -= h;
      });

      var hit = el('rect', { x: padL + i * slot, y: padT, width: slot, height: plotH, 'class': 'bar-hit' });
      bindTip(hit, function () {
        var tot = keys.reduce(function (a, k) { return a + (y.parts[k.key] || 0); }, 0);
        var lines = keys.filter(function (k) { return (y.parts[k.key] || 0) > 0; })
          .map(function (k) {
            var v = y.parts[k.key];
            return '<div class="t-row"><span>' + k.label + '</span><span>' + money(v) +
                   '  ' + Math.round(v / tot * 100) + '%</span></div>';
          }).join('');
        return '<strong>' + y.year + '</strong>' + lines +
               '<div class="t-row" style="margin-top:4px;opacity:.75"><span>Total net</span><span>' + money(tot) + '</span></div>';
      });
      g.appendChild(hit);
      svg.appendChild(g);

      var xl = el('text', { x: x + barW / 2, y: H - 10, 'text-anchor': 'middle', 'class': 'axis-label' });
      xl.textContent = y.year;
      svg.appendChild(xl);
    });
  }

  /* ---------- sparkline ----------
     One series, so identity needs no colour and the single-hue constraint
     that breaks a 6-way stack does not apply here. This is how per-teammate
     trend gets shown without asking a blue ramp to carry six identities. */
  function sparkline(values, opts) {
    opts = opts || {};
    var W = opts.width || 84, H = opts.height || 22, pad = 2;
    if (!values.length) return '';
    var max = Math.max.apply(null, values) || 1;
    var n = values.length;
    var step = n > 1 ? (W - pad * 2) / (n - 1) : 0;
    var pts = values.map(function (v, i) {
      var x = pad + i * step;
      var y = H - pad - (v / max) * (H - pad * 2);
      return [x, y];
    });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var area = d + ' L' + pts[n - 1][0].toFixed(1) + ' ' + (H - pad) + ' L' + pts[0][0].toFixed(1) + ' ' + (H - pad) + ' Z';
    var last = pts[n - 1];
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" style="display:block">' +
      '<path d="' + area + '" fill="var(--brand)" opacity="0.14"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--brand)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.4" fill="var(--brand)"/>' +
    '</svg>';
  }

  return { fit: fit, columns: columns, line: line, grouped: grouped, ranked: ranked, stacked: stacked,
           sparkline: sparkline, money: money, niceMax: niceMax };
})();
