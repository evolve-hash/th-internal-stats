/* ============================================================
   app.js — UI wiring: KPIs, charts, filterable table, CRUD,
   theme toggle, toasts.
   ============================================================ */

(function () {
  'use strict';

  var cfg   = window.TH_CONFIG || {};
  var store = window.TH_STORE;
  var C     = window.TH_CHARTS;

  var state = {
    rows: [],
    search: '', year: '', side: '', source: '',
    mixSide: '',                       // side filter for the business-mix section
    sortKey: 'date', sortDir: 'desc',
    page: 1, perPage: 25,
    editingId: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var money = C.money;
  var fmtInt = function (v) { return (v === null || v === undefined) ? '—' : Math.round(v).toLocaleString('en-US'); };

  /* ==================== THEME ==================== */
  var THEME_KEY = 'teamhowe.theme';
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('brand-logo').src = theme === 'dark' ? 'assets/logo-dark.png' : 'assets/logo-light.png';
    safeSet(THEME_KEY, theme);
  }
  (function initTheme() {
    var saved = safeGet(THEME_KEY);
    if (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) saved = 'dark';
    applyTheme(saved === 'dark' ? 'dark' : 'light');
  })();
  $('theme-toggle').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    render();               // charts re-read CSS vars
  });

  /* ==================== AUTH ====================
     Reading is open to anyone with the link. Writing needs a signed-in user,
     enforced in the database by row-level security — the UI gating below is
     only there so nobody is offered a button that would fail. */
  function applyAuthState() {
    var canWrite = store.canWrite();
    var needsAuth = store.authAvailable();
    var user = store.user();

    document.body.classList.toggle('is-readonly', !canWrite);
    $('btn-signin').hidden = !needsAuth || !!user;
    $('who').hidden = !user;
    if (user) $('who-email').textContent = user.email || 'signed in';

    var meta = document.querySelector('.section-head .meta');
    if (meta && meta.textContent.indexOf('hover a row') > -1 && !canWrite) {
      meta.textContent = 'Click any column to sort';
    }
  }

  var authBackdrop = $('auth-backdrop');
  function openAuth() {
    $('auth-error').hidden = true;
    $('auth-form').reset();
    authBackdrop.classList.add('open');
    setTimeout(function () { $('auth-email').focus(); }, 60);
  }
  function closeAuth() { authBackdrop.classList.remove('open'); }

  $('btn-signin').addEventListener('click', openAuth);
  $('auth-close').addEventListener('click', closeAuth);
  $('auth-cancel').addEventListener('click', closeAuth);
  authBackdrop.addEventListener('click', function (e) { if (e.target === authBackdrop) closeAuth(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && authBackdrop.classList.contains('open')) closeAuth();
  });

  $('auth-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('auth-submit');
    var err = $('auth-error');
    err.hidden = true;
    btn.disabled = true; btn.textContent = 'Signing in…';
    store.signIn($('auth-email').value.trim(), $('auth-pass').value)
      .then(function (user) {
        closeAuth();
        toast('Signed in as ' + (user.email || 'you') + '.');
      })
      .catch(function (e2) {
        var m = String(e2.message || e2);
        if (/invalid login credentials/i.test(m)) m = 'That email and password combination did not match. Check both, or reset the password in Supabase.';
        else if (/email not confirmed/i.test(m)) m = 'That account exists but was never confirmed. In Supabase, open the user and use "Confirm email".';
        err.textContent = m;
        err.hidden = false;
      })
      .finally(function () { btn.disabled = false; btn.textContent = 'Sign in'; });
  });

  $('btn-signout').addEventListener('click', function () {
    store.signOut().then(function () { toast('Signed out. You can still read everything.'); });
  });

  store.onAuthChange(function () { applyAuthState(); });

  /* ==================== TOASTS ==================== */
  function toast(msg) {
    var wrap = $('toast-wrap');
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 300);
    }, 2600);
  }

  /* ==================== AGGREGATION ==================== */
  function byYear(rows) {
    var map = {};
    rows.forEach(function (r) {
      if (!r.year) return;
      if (!map[r.year]) map[r.year] = { year: r.year, count: 0, volume: 0, gross_comm: 0, net_comm: 0, hasNet: false };
      var y = map[r.year];
      y.count++;
      y.volume += r.sale_price || 0;
      y.gross_comm += r.gross_comm || 0;
      if (r.net_comm) { y.net_comm += r.net_comm; y.hasNet = true; }
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return a.year - b.year; })
      .map(function (y) { if (!y.hasNet) y.net_comm = null; return y; });
  }

  function ytdSlice(rows, year, month, day) {
    return rows.filter(function (r) {
      if (!r.date || r.year !== year) return false;
      var d = new Date(r.date + 'T00:00:00');
      var cutoff = new Date(year, month, day, 23, 59, 59);
      return d <= cutoff;
    });
  }
  function totals(rows) {
    return rows.reduce(function (a, r) {
      a.count++; a.volume += r.sale_price || 0;
      a.gross += r.gross_comm || 0; a.net += r.net_comm || 0;
      return a;
    }, { count: 0, volume: 0, gross: 0, net: 0 });
  }

  /* ==================== KPI RENDERING ==================== */
  function animateValue(node, text) {
    node.textContent = text;
    node.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 380, easing: 'cubic-bezier(.22,.61,.36,1)' }
    );
  }

  function tile(label, value, delta, accent) {
    var d = '';
    if (delta) {
      var up = delta.pct >= 0;
      d = '<div class="kpi__delta kpi__delta--' + (up ? 'up' : 'down') + '">' +
          (up ? '▲' : '▼') + ' ' + (up ? '+' : '') + Math.round(delta.pct) + '%' +
          ' <em>' + delta.vs + '</em></div>';
    }
    return '<div class="kpi' + (accent ? ' kpi--accent' : '') + '">' +
             '<div class="kpi__label">' + label + '</div>' +
             '<div class="kpi__value">' + value + '</div>' + d +
           '</div>';
  }

  function renderKPIs(rows) {
    var now = new Date();
    var thisYear = now.getFullYear();
    var years = byYear(rows);
    var latestYear = years.length ? years[years.length - 1].year : thisYear;
    var refYear = Math.max(thisYear, latestYear);

    var cur  = totals(ytdSlice(rows, refYear, now.getMonth(), now.getDate()));
    var prev = totals(ytdSlice(rows, refYear - 1, now.getMonth(), now.getDate()));

    var monthName = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    $('ytd-meta').textContent = refYear + ' through ' + monthName + ' vs. the same point in ' + (refYear - 1);

    function delta(c, p) {
      if (!p) return null;
      return { pct: (c - p) / p * 100, vs: 'vs ' + (refYear - 1) };
    }

    $('ytd-tiles').innerHTML =
      tile('Transactions', fmtInt(cur.count), delta(cur.count, prev.count)) +
      tile('Sales Volume', money(cur.volume, true), delta(cur.volume, prev.volume)) +
      tile('Gross Commission', money(cur.gross, true), delta(cur.gross, prev.gross)) +
      tile('Net Commission', money(cur.net, true), delta(cur.net, prev.net)) +
      tile('Avg Sale Price', cur.count ? money(cur.volume / cur.count, true) : '—',
           (prev.count && cur.count) ? delta(cur.volume / cur.count, prev.volume / prev.count) : null);

    var all = totals(rows);
    $('career-meta').textContent = years.length
      ? years[0].year + '–' + years[years.length - 1].year + ' · ' + years.length + ' years'
      : '';
    $('career-tiles').innerHTML =
      tile('Years Active', fmtInt(years.length), null, true) +
      tile('Total Transactions', fmtInt(all.count), null, true) +
      tile('Total Sales Volume', money(all.volume, true), null, true) +
      tile('Total Gross Commission', money(all.gross, true), null, true) +
      tile('Total Net Commission', money(all.net, true), null, true);

    Array.prototype.forEach.call(document.querySelectorAll('.kpi__value'), function (n, i) {
      n.animate([{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }],
                { duration: 420, delay: i * 35, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' });
    });
  }

  /* ==================== CHARTS ==================== */
  function renderCharts(rows) {
    var years = byYear(rows);
    C.columns('chart-volume', years, { key: 'volume', format: money, tipLabel: 'Sales volume' });
    C.columns('chart-count',  years, { key: 'count',
      format: function (v, compact) { return compact ? Math.round(v) : Math.round(v) + ' transactions'; },
      tipLabel: 'Transactions' });
    C.grouped('chart-comm', years, { keyA: 'gross_comm', keyB: 'net_comm' });

    renderMix(rows);
  }

  /* ---- "Where business comes from", filterable by side ---- */
  function renderMix(rows) {
    var side = state.mixSide;                       // '' | 'Buyer' | 'Seller'
    var scoped = side ? rows.filter(function (r) { return r.side === side; }) : rows;
    var noun = side ? side.toLowerCase() + '-side transactions' : 'closed transactions';

    // Source mix
    var srcMap = {};
    scoped.forEach(function (r) {
      var k = r.source || 'Not recorded';
      srcMap[k] = (srcMap[k] || 0) + 1;
    });
    var src = Object.keys(srcMap).map(function (k) {
      return { label: k, count: srcMap[k], neutral: (k === 'Not recorded' || k === 'Other') };
    }).sort(function (a, b) { return b.count - a.count; });
    var TOP = 8;
    if (src.length > TOP) {
      var rest = src.slice(TOP).reduce(function (a, d) { return a + d.count; }, 0);
      src = src.slice(0, TOP);
      if (rest) src.push({ label: 'Smaller sources', count: rest, neutral: true });
    }
    C.ranked('source-mix', src, { pctBase: scoped.length });

    $('source-sub').textContent = side
      ? 'Where Team Howe\'s ' + side.toLowerCase() + ' business came from — ' + scoped.length + ' transactions'
      : 'Ranked by transaction count — darker means a larger share';
    $('mix-meta').textContent = scoped.length.toLocaleString('en-US') + ' ' + noun;

    // Buyer / seller split — always the full picture, and doubles as the filter
    var buyer = rows.filter(function (r) { return r.side === 'Buyer'; }).length;
    var seller = rows.filter(function (r) { return r.side === 'Seller'; }).length;
    var known = buyer + seller;
    $('side-sub').textContent = known
      ? 'Of the ' + known + ' transactions where the side was recorded · tap a bar to filter'
      : 'No side recorded yet';
    if (known) {
      var bp = buyer / known * 100, sp = seller / known * 100;
      $('side-split').innerHTML =
        '<div class="splitbar__seg' + (side === 'Seller' ? ' is-dim' : '') + '" data-side="Buyer" ' +
          'style="flex:0 0 ' + bp + '%;background:var(--ramp-5);color:#fff">' + buyer + ' Buyer</div>' +
        '<div class="splitbar__seg' + (side === 'Buyer' ? ' is-dim' : '') + '" data-side="Seller" ' +
          'style="flex:0 0 ' + sp + '%;background:var(--ramp-2);color:#0b0b0b">' + seller + ' Seller</div>';
      $('side-legend').innerHTML =
        '<div class="legend-item"><span class="legend-swatch" style="background:var(--ramp-5)"></span>Buyer side — ' + bp.toFixed(0) + '%</div>' +
        '<div class="legend-item"><span class="legend-swatch" style="background:var(--ramp-2)"></span>Seller side — ' + sp.toFixed(0) + '%</div>';
    } else {
      $('side-split').innerHTML = ''; $('side-legend').innerHTML = '';
    }

    // Property type mix
    var propMap = {}, typed = 0;
    scoped.forEach(function (r) {
      if (r.prop_type) { propMap[r.prop_type] = (propMap[r.prop_type] || 0) + 1; typed++; }
    });
    var props = Object.keys(propMap).map(function (k) { return { label: k, count: propMap[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
    // Build the shell once — rebuilding it every render would throw away the
    // rows that C.ranked() reuses to animate the reorder.
    var shell = $('prop-mix');
    if (!shell.querySelector('.mix-subhead')) {
      shell.innerHTML = '<div class="mix-subhead"></div><div id="prop-mix-bars"></div>' +
                        '<div class="mix-empty" hidden>No property type recorded for this side.</div>';
    }
    shell.querySelector('.mix-subhead').textContent =
      'Property type' + (side ? ' — ' + side.toLowerCase() + ' side' : '');
    shell.querySelector('.mix-empty').hidden = props.length > 0;

    var untyped = scoped.length - typed;
    C.ranked('prop-mix-bars', props, {
      pctBase: typed,
      caption: props.length
        ? 'Share of the ' + typed + ' ' + (side ? side.toLowerCase() + '-side ' : '') +
          'transactions with a recorded property type' +
          (untyped ? '; ' + untyped + ' left it blank in the source workbook.' : '.')
        : ''
    });
  }

  function setMixSide(side) {
    if (state.mixSide === side) return;
    state.mixSide = side;
    Array.prototype.forEach.call(document.querySelectorAll('#mix-side .seg__btn'), function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-side') === side);
    });
    renderMix(state.rows);
  }

  $('mix-side').addEventListener('click', function (e) {
    var b = e.target.closest('.seg__btn');
    if (b) setMixSide(b.getAttribute('data-side'));
  });
  $('side-split').addEventListener('click', function (e) {
    var s = e.target.closest('.splitbar__seg');
    if (!s) return;
    var v = s.getAttribute('data-side');
    setMixSide(state.mixSide === v ? '' : v);   // tap the active one to clear
  });

  /* ==================== TABLE ==================== */
  function filtered() {
    var q = state.search.trim().toLowerCase();
    return state.rows.filter(function (r) {
      if (state.year && String(r.year) !== state.year) return false;
      if (state.side && r.side !== state.side) return false;
      if (state.source && r.source !== state.source) return false;
      if (q) {
        var hay = [r.client, r.address, r.city, r.referrer, r.source].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sorted(rows) {
    var k = state.sortKey, dir = state.sortDir === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (av === null || av === undefined || av === '') return 1;
      if (bv === null || bv === undefined || bv === '') return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(d) {
    if (!d) return '—';
    var parts = String(d).slice(0, 10).split('-');
    if (parts.length !== 3) return d;
    return parts[1] + '/' + parts[2] + '/' + parts[0].slice(2);
  }

  function renderTable(flashId) {
    var rows = sorted(filtered());
    var totalPages = Math.max(1, Math.ceil(rows.length / state.perPage));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.perPage;
    var pageRows = rows.slice(start, start + state.perPage);

    $('table-count').textContent = rows.length.toLocaleString('en-US') +
      (rows.length === state.rows.length ? ' transactions' : ' of ' + state.rows.length.toLocaleString('en-US'));

    var body = $('tx-body');
    body.innerHTML = pageRows.map(function (r, i) {
      var sideCell = r.side
        ? '<span class="pill pill--' + r.side.toLowerCase() + '">' + r.side + '</span>'
        : '<span style="color:var(--ink-3)">—</span>';
      return '<tr class="row-in' + (String(r.id) === String(flashId) ? ' row-flash' : '') +
             '" style="animation-delay:' + Math.min(i * 14, 260) + 'ms" data-id="' + esc(r.id) + '">' +
        '<td>' + fmtDate(r.date) + '</td>' +
        '<td class="client">' + esc(r.client || '—') + '</td>' +
        '<td>' + sideCell + '</td>' +
        '<td>' + esc(r.prop_type || '—') + '</td>' +
        '<td>' + esc(r.address || '—') + '</td>' +
        '<td class="num">' + (r.sale_price ? money(r.sale_price) : '—') + '</td>' +
        '<td class="num">' + (r.gross_comm ? money(r.gross_comm) : '—') + '</td>' +
        '<td class="num">' + (r.net_comm ? money(r.net_comm) : '—') + '</td>' +
        '<td>' + esc(r.source || '—') + '</td>' +
        '<td><div class="row-actions">' +
          '<button class="row-btn" data-act="edit" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>' +
          '<button class="row-btn row-btn--del" data-act="del" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    $('table-empty').innerHTML = rows.length ? '' :
      '<div class="empty">No transactions match these filters.<br><br><button class="btn-ghost" id="empty-reset">Clear filters</button></div>';
    var er = $('empty-reset');
    if (er) er.addEventListener('click', resetFilters);

    renderPager(rows.length, totalPages, start, pageRows.length);
  }

  function renderPager(total, totalPages, start, shown) {
    var p = $('pager');
    if (!total) { p.innerHTML = ''; return; }
    var btns = '';
    var win = [];
    for (var i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - state.page) <= 1) win.push(i);
      else if (win[win.length - 1] !== '…') win.push('…');
    }
    win.forEach(function (n) {
      btns += n === '…'
        ? '<span style="padding:0 4px;color:var(--ink-3);align-self:center">…</span>'
        : '<button class="page-btn" data-page="' + n + '" aria-current="' + (n === state.page) + '">' + n + '</button>';
    });
    p.innerHTML =
      '<div class="pager__info">Showing ' + (start + 1) + '–' + (start + shown) + ' of ' + total.toLocaleString('en-US') + '</div>' +
      '<div class="pager__btns">' +
        '<button class="page-btn" data-page="prev"' + (state.page === 1 ? ' disabled' : '') + '>Prev</button>' +
        btns +
        '<button class="page-btn" data-page="next"' + (state.page === totalPages ? ' disabled' : '') + '>Next</button>' +
      '</div>';
  }

  /* ==================== FILTER CONTROLS ==================== */
  function populateFilters() {
    var years = {}, sources = {};
    state.rows.forEach(function (r) {
      if (r.year) years[r.year] = 1;
      if (r.source) sources[r.source] = 1;
    });
    var ySel = $('f-year'), cur = ySel.value;
    ySel.innerHTML = '<option value="">All years</option>' +
      Object.keys(years).sort(function (a, b) { return b - a; })
        .map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
    ySel.value = cur;

    var sSel = $('f-source'), curS = sSel.value;
    sSel.innerHTML = '<option value="">All sources</option>' +
      Object.keys(sources).sort().map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    sSel.value = curS;
  }

  function resetFilters() {
    state.search = ''; state.year = ''; state.side = ''; state.source = ''; state.page = 1;
    $('f-search').value = ''; $('f-year').value = ''; $('f-side').value = ''; $('f-source').value = '';
    renderTable();
  }

  /* ==================== MODAL / CRUD ==================== */
  var backdrop = $('modal-backdrop');
  var form = $('tx-form');

  function openModal(row) {
    state.editingId = row ? row.id : null;
    $('modal-title').textContent = row ? 'Edit Sale' : 'Add a Sale';
    $('modal-save').textContent = row ? 'Save Changes' : 'Save Sale';
    $('hint-gross').style.display = row ? 'none' : '';
    form.reset();
    if (row) {
      $('i-date').value = row.date || '';
      $('i-client').value = row.client || '';
      $('i-side').value = row.side || '';
      $('i-prop').value = row.prop_type || '';
      $('i-address').value = row.address || '';
      $('i-city').value = row.city || '';
      $('i-price').value = row.sale_price === null ? '' : row.sale_price;
      $('i-gross').value = row.gross_comm === null ? '' : row.gross_comm;
      $('i-net').value = row.net_comm === null ? '' : row.net_comm;
      $('i-source').value = row.source || 'Referral';
      $('i-referrer').value = row.referrer || '';
    } else {
      $('i-city').value = 'San Francisco';
      $('i-source').value = 'Referral';
    }
    backdrop.classList.add('open');
    setTimeout(function () { $('i-date').focus(); }, 60);
  }
  function closeModal() {
    backdrop.classList.remove('open');
    state.editingId = null;
  }

  $('btn-add').addEventListener('click', function () { openModal(null); });
  $('modal-close').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) closeModal();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var rec = {};
    ['date','client','side','prop_type','address','city','sale_price','gross_comm','net_comm','source','referrer']
      .forEach(function (k) { rec[k] = fd.get(k); });

    if (!store.canWrite()) { closeModal(); openAuth(); return; }
    if (!rec.date || !rec.client || !rec.sale_price) {
      toast('Date, client, and sale price are required.');
      return;
    }
    // Editing a row without touching its date must not re-file it under a
    // different year — a few historical rows have a mistyped date but are
    // filed under the correct production year.
    if (state.editingId) {
      var original = state.rows.find(function (r) { return String(r.id) === String(state.editingId); });
      if (original && original.date === rec.date) rec.year = original.year;
    }
    // auto-fill gross commission on new records only
    if (!state.editingId && (rec.gross_comm === '' || rec.gross_comm === null)) {
      rec.gross_comm = Number(rec.sale_price) * (cfg.DEFAULT_COMMISSION_RATE || 0.025);
    }

    var btn = $('modal-save');
    btn.disabled = true; btn.textContent = 'Saving…';

    var op = state.editingId ? store.update(state.editingId, rec) : store.add(rec);
    op.then(function (saved) {
      state.rows = store.all();
      populateFilters();
      closeModal();
      render(saved && saved.id);
      toast(state.editingId ? 'Sale updated.' : 'Sale added — dashboard updated.');
    }).catch(function (err) {
      console.error(err);
      toast('Could not save: ' + (err.message || 'unknown error'));
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = state.editingId ? 'Save Changes' : 'Save Sale';
    });
  });

  /* ==================== EVENTS ==================== */
  $('tx-body').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (!store.canWrite()) { openAuth(); return; }
    var id = btn.closest('tr').getAttribute('data-id');
    var row = state.rows.find(function (r) { return String(r.id) === String(id); });
    if (!row) return;

    if (btn.getAttribute('data-act') === 'edit') { openModal(row); return; }

    if (!window.confirm('Remove this sale?\n\n' + (row.client || '') + ' — ' + (row.address || '') +
                        '\n' + (row.sale_price ? money(row.sale_price) : ''))) return;
    store.remove(id).then(function () {
      state.rows = store.all();
      populateFilters();
      render();
      toast('Sale removed.');
    }).catch(function (err) { toast('Could not remove: ' + (err.message || 'error')); });
  });

  document.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortKey = k; state.sortDir = (k === 'client' || k === 'address' || k === 'source' || k === 'side' || k === 'prop_type') ? 'asc' : 'desc'; }
      document.querySelectorAll('th[data-sort]').forEach(function (o) { o.classList.remove('sorted', 'sorted-desc'); });
      th.classList.add('sorted');
      if (state.sortDir === 'desc') th.classList.add('sorted-desc');
      state.page = 1;
      renderTable();
    });
  });

  var searchTimer;
  $('f-search').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    var v = e.target.value;
    searchTimer = setTimeout(function () { state.search = v; state.page = 1; renderTable(); }, 160);
  });
  ['year', 'side', 'source'].forEach(function (k) {
    $('f-' + k).addEventListener('change', function (e) { state[k] = e.target.value; state.page = 1; renderTable(); });
  });
  $('f-reset').addEventListener('click', resetFilters);

  $('pager').addEventListener('click', function (e) {
    var b = e.target.closest('[data-page]');
    if (!b || b.disabled) return;
    var v = b.getAttribute('data-page');
    var totalPages = Math.max(1, Math.ceil(filtered().length / state.perPage));
    if (v === 'prev') state.page = Math.max(1, state.page - 1);
    else if (v === 'next') state.page = Math.min(totalPages, state.page + 1);
    else state.page = Number(v);
    renderTable();
    document.querySelector('.table-scroll').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('btn-export').addEventListener('click', function () {
    var rows = sorted(filtered());
    var cols = ['date','year','client','side','prop_type','address','city','sale_price','gross_comm','net_comm','source','referrer'];
    var csv = [cols.join(',')].concat(rows.map(function (r) {
      return cols.map(function (c) {
        var v = r[c] === null || r[c] === undefined ? '' : r[c];
        return /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
      }).join(',');
    })).join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'team-howe-transactions-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Exported ' + rows.length + ' rows.');
  });

  /* ==================== RENDER ==================== */
  function render(flashId) {
    renderKPIs(state.rows);
    renderCharts(state.rows);
    renderTable(flashId);
  }

  /* ==================== BOOT ==================== */
  function setConnBadge(mode) {
    var el = $('conn'), label = $('conn-label');
    el.classList.remove('conn--cloud', 'conn--local');
    if (mode === 'cloud') {
      el.classList.add('conn--cloud'); label.textContent = 'Live';
      el.title = 'Connected to Supabase — changes are saved for everyone.';
    } else if (mode === 'memory') {
      el.classList.add('conn--local'); label.textContent = 'Preview';
      el.title = 'Browser storage is unavailable — changes last until you reload.';
    } else {
      el.classList.add('conn--local'); label.textContent = 'This device';
      el.title = 'Changes are saved in this browser only. Add Supabase keys in js/config.js to share them.';
    }
  }

  function setupBanner(info) {
    if (info.mode === 'cloud') return;
    if (safeGet('teamhowe.banner.dismissed') === '1') return;
    var msg = info.error
      ? '<strong>Could not reach Supabase</strong>, so the dashboard is running on this device only. Check the URL and anon key in <strong>js/config.js</strong>. (' + esc(info.error) + ')'
      : '<strong>Running on this device.</strong> Edits are saved in this browser only — Sherri would not see them. Add your Supabase project URL and anon key to <strong>js/config.js</strong> to make the data shared and live. See <strong>README.md</strong> for the 10-minute setup.';
    $('banner-slot').innerHTML =
      '<div class="banner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>' +
      '<div class="banner__text">' + msg + '</div>' +
      '<button class="banner__close" id="banner-close" aria-label="Dismiss">×</button></div>';
    $('banner-close').addEventListener('click', function () {
      safeSet('teamhowe.banner.dismissed', '1');
      $('banner-slot').innerHTML = '';
    });
  }

  $('page-sub').textContent = cfg.SUBTITLE || '';

  store.init().then(function (info) {
    state.rows = store.all();
    setConnBadge(info.mode);
    setupBanner(info);
    populateFilters();
    var th = document.querySelector('th[data-sort="date"]');
    th.classList.add('sorted', 'sorted-desc');
    render();
    // Restore any existing session before deciding what to show.
    store.initAuth().then(applyAuthState);
    if (info.seeded) toast('Database seeded with ' + state.rows.length + ' historical sales.');
    $('footer-storage').textContent = info.mode === 'cloud'
      ? 'Live data — every change is saved to the shared database.'
      : 'Running on this device — see README.md to connect the shared database.';
  }).catch(function (err) {
    console.error(err);
    document.querySelector('main').insertAdjacentHTML('afterbegin',
      '<div class="banner"><div class="banner__text"><strong>Something went wrong loading the data.</strong> ' + esc(err.message || err) + '</div></div>');
  });

  window.addEventListener('resize', function () {
    clearTimeout(window.__thResize);
    window.__thResize = setTimeout(function () { renderCharts(state.rows); }, 220);
  });
})();
