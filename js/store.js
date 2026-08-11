/* ============================================================
   store.js — the data layer.

   Two interchangeable backends behind one API:
     • CLOUD : Supabase (shared, persistent, multi-device)
     • LOCAL : browser storage, with an in-memory fallback

   Everything else in the app talks only to TH_STORE and never
   needs to know which one is active.
   ============================================================ */

window.TH_STORE = (function () {
  'use strict';

  var LS_KEY = 'teamhowe.transactions.v1';
  var cfg = window.TH_CONFIG || {};
  var rows = [];
  var mode = 'local';         // 'cloud' | 'local' | 'memory'
  var supabase = null;
  var memoryOnly = false;

  /* ---------- field whitelist (keeps local + cloud shapes identical) ---------- */
  var FIELDS = ['date','client','side','prop_type','address','city',
                'sale_price','gross_comm','net_comm','source','referrer',
                'referral_fee','brokerage_fee','other_costs'];
  var NUMERIC = ['sale_price','gross_comm','net_comm',
                 'referral_fee','brokerage_fee','other_costs'];
  var DEDUCT  = ['referral_fee','brokerage_fee','other_costs'];

  // True until proven otherwise: a database that has not run phase3-deductions.sql
  // yet would reject a write carrying these columns, so we strip them there.
  var deductCols = true;

  // Strip anything the live database cannot store, so an un-migrated project
  // keeps working instead of erroring on every save.
  function payload(obj) {
    var p = clean(obj);
    if (!deductCols) DEDUCT.forEach(function (f) { delete p[f]; });
    return p;
  }

  function clean(obj) {
    var out = {};
    FIELDS.forEach(function (f) {
      var v = obj[f];
      if (v === '' || v === undefined) v = null;
      if (NUMERIC.indexOf(f) > -1) {
        v = (v === null || v === '') ? null : Number(v);
        if (isNaN(v)) v = null;
      }
      out[f] = v;
    });
    // The production year is its own field, not a slice of the date.
    // A handful of historical rows carry a mistyped date (e.g. "2012-01-04"
    // on a 2023 sale); the workbook's own year tab is the authority there and
    // is what reconciles to the original Stats tab. An explicit year always
    // wins; only fall back to the date when no year was supplied (new entries).
    var explicit = Number(obj.year);
    out.year = (obj.year !== null && obj.year !== undefined && obj.year !== '' && !isNaN(explicit))
      ? explicit
      : (out.date ? Number(String(out.date).slice(0, 4)) : null);
    return out;
  }

  function normalize(r) {
    var o = clean(r);
    o.id = r.id;
    return o;
  }

  /* ---------- local storage helpers (never throw) ---------- */
  function lsRead() {
    if (memoryOnly) return null;
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { memoryOnly = true; return null; }
  }
  function lsWrite(data) {
    if (memoryOnly) return;
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(data)); }
    catch (e) { memoryOnly = true; }
  }

  function nextId() {
    return rows.reduce(function (m, r) { return Math.max(m, Number(r.id) || 0); }, 0) + 1;
  }

  /* ---------- Supabase loader (CDN, only when configured) ---------- */
  function loadSupabase() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
      s.onload = function () {
        window.supabase && window.supabase.createClient
          ? resolve(window.supabase)
          : reject(new Error('Supabase client failed to initialise'));
      };
      s.onerror = function () { reject(new Error('Could not reach the Supabase CDN')); };
      document.head.appendChild(s);
    });
  }

  /* ---------- init ---------- */
  // A Supabase project that is paused, asleep, or behind a captive network can
  // leave a request pending forever. Without a ceiling on that wait the whole
  // dashboard renders empty and never recovers, which is the worst possible
  // failure: it looks like the data is gone. Always fall back to something.
  var BOOT_TIMEOUT_MS = 9000;

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error((label || 'The database') + ' did not respond within ' +
                         Math.round(ms / 1000) + ' seconds.'));
      }, ms);
      promise.then(function (v) {
        if (done) return;
        done = true; clearTimeout(timer); resolve(v);
      }, function (e) {
        if (done) return;
        done = true; clearTimeout(timer); reject(e);
      });
    });
  }

  function init() {
    var configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY;

    if (!configured) {
      var stored = lsRead();
      rows = (stored && stored.length ? stored : (window.TH_SEED || []).slice()).map(normalize);
      if (!stored) lsWrite(rows);
      mode = memoryOnly ? 'memory' : 'local';
      return Promise.resolve({ mode: mode, count: rows.length });
    }

    return withTimeout(loadSupabase(), BOOT_TIMEOUT_MS, 'The Supabase library')
      .then(function (lib) {
        supabase = lib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
        return withTimeout(
          Promise.resolve(
            supabase.from(cfg.TABLE || 'transactions')
              .select('*')
              .order('date', { ascending: true, nullsFirst: false })
          ),
          BOOT_TIMEOUT_MS,
          'Your Supabase project'
        );
      })
      .then(function (res) {
        if (res.error) throw res.error;
        // Does this database have the Phase 3b deduction columns yet? select('*')
        // returns every column that exists, so a missing key means a missing column.
        if (res.data && res.data.length) {
          deductCols = Object.prototype.hasOwnProperty.call(res.data[0], 'referral_fee');
        }
        rows = (res.data || []).map(normalize);
        mode = 'cloud';

        // First run against an empty table: offer to seed it.
        if (rows.length === 0) {
          return seedCloud().then(function () {
            return { mode: 'cloud', count: rows.length, seeded: true };
          });
        }
        return { mode: 'cloud', count: rows.length };
      })
      .catch(function (err) {
        // Cloud unreachable or misconfigured — degrade gracefully, never blank screen.
        console.warn('[Team Howe] Cloud mode unavailable, falling back to local:', err.message || err);
        var stored = lsRead();
        rows = (stored && stored.length ? stored : (window.TH_SEED || []).slice()).map(normalize);
        mode = memoryOnly ? 'memory' : 'local';
        return { mode: mode, count: rows.length, error: err.message || String(err) };
      });
  }

  function seedCloud() {
    var seed = (window.TH_SEED || []).map(function (r) { return payload(r); });
    if (!seed.length) return Promise.resolve();
    var chunks = [];
    for (var i = 0; i < seed.length; i += 250) chunks.push(seed.slice(i, i + 250));
    return chunks.reduce(function (chain, chunk) {
      return chain.then(function () {
        return supabase.from(cfg.TABLE || 'transactions').insert(chunk);
      });
    }, Promise.resolve()).then(function () {
      return supabase.from(cfg.TABLE || 'transactions')
        .select('*').order('date', { ascending: true, nullsFirst: false });
    }).then(function (res) {
      if (!res.error) rows = (res.data || []).map(normalize);
    });
  }

  /* ---------- CRUD ---------- */
  function all() { return rows.slice(); }
  function getMode() { return mode; }

  function add(record) {
    var body = payload(record);
    if (mode === 'cloud') {
      return supabase.from(cfg.TABLE || 'transactions').insert(body).select().single()
        .then(function (res) {
          if (res.error) throw res.error;
          var row = normalize(res.data);
          rows.push(row);
          return row;
        });
    }
    body.id = nextId();
    rows.push(body);
    lsWrite(rows);
    return Promise.resolve(body);
  }

  function update(id, record) {
    var body = payload(record);
    if (mode === 'cloud') {
      return supabase.from(cfg.TABLE || 'transactions').update(body).eq('id', id).select().single()
        .then(function (res) {
          if (res.error) throw res.error;
          var row = normalize(res.data);
          var i = rows.findIndex(function (r) { return String(r.id) === String(id); });
          if (i > -1) rows[i] = row;
          return row;
        });
    }
    var i = rows.findIndex(function (r) { return String(r.id) === String(id); });
    if (i > -1) { body.id = rows[i].id; rows[i] = body; lsWrite(rows); }
    return Promise.resolve(body);
  }

  function remove(id) {
    if (mode === 'cloud') {
      return supabase.from(cfg.TABLE || 'transactions').delete().eq('id', id)
        .then(function (res) {
          if (res.error) throw res.error;
          rows = rows.filter(function (r) { return String(r.id) !== String(id); });
        });
    }
    rows = rows.filter(function (r) { return String(r.id) !== String(id); });
    lsWrite(rows);
    return Promise.resolve();
  }

  function resetLocal() {
    rows = (window.TH_SEED || []).slice().map(normalize);
    lsWrite(rows);
    return Promise.resolve(rows.length);
  }

  /* ---------- auth ----------
     Only meaningful in cloud mode. In local mode there is nothing to protect —
     the data lives in this browser — so writing is always allowed. */
  var currentUser = null;
  var authListeners = [];

  function authAvailable() { return mode === 'cloud' && !!supabase; }

  function notifyAuth() {
    authListeners.forEach(function (fn) {
      try { fn(currentUser); } catch (e) { console.error(e); }
    });
  }

  function initAuth() {
    if (!authAvailable()) return Promise.resolve(null);
    return withTimeout(Promise.resolve(supabase.auth.getSession()), BOOT_TIMEOUT_MS, 'Supabase auth')
      .then(function (res) {
      currentUser = (res && res.data && res.data.session) ? res.data.session.user : null;
      supabase.auth.onAuthStateChange(function (_evt, session) {
        currentUser = session ? session.user : null;
        notifyAuth();
      });
      return currentUser;
    }).catch(function () { return null; });
  }

  function signIn(email, password) {
    if (!authAvailable()) return Promise.reject(new Error('Sign-in needs the shared database. This copy is running on your device only.'));
    return supabase.auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        if (res.error) throw res.error;
        currentUser = res.data.user;
        notifyAuth();
        return currentUser;
      });
  }

  function signOut() {
    if (!authAvailable()) return Promise.resolve();
    return supabase.auth.signOut().then(function () {
      currentUser = null;
      notifyAuth();
    });
  }

  /* ---------- agents & payouts ----------
     Payroll, so it only ever loads for a signed-in user. In local mode we use
     the bundled copy so the section is explorable without a database. */
  var agents = [];
  var payouts = [];
  var payoutsLoaded = false;

  // Signing in fires two notifications — one when signInWithPassword resolves,
  // one from Supabase's own onAuthStateChange. Both used to reach loadPayroll,
  // both saw empty tables, and both seeded: every figure came out doubled.
  // Collapsing concurrent calls onto one promise is what prevents that.
  var payrollInFlight = null;

  function loadPayroll() {
    if (payrollInFlight) return payrollInFlight;
    payrollInFlight = doLoadPayroll();
    payrollInFlight.catch(function () {}).then(function () { payrollInFlight = null; });
    return payrollInFlight;
  }

  function doLoadPayroll() {
    if (!authAvailable()) {                        // local / preview mode
      agents = (window.TH_AGENTS || []).slice();
      payouts = (window.TH_PAYOUTS || []).map(function (p) {
        return { transaction_id: p.tx, agent: p.agent, amount: p.amount, role: p.role, year: p.year };
      });
      payoutsLoaded = true;
      return Promise.resolve({ agents: agents.length, payouts: payouts.length, mode: 'local' });
    }
    if (!currentUser) {
      agents = []; payouts = []; payoutsLoaded = false;
      return Promise.resolve({ agents: 0, payouts: 0, mode: 'locked' });
    }
    // Already have it for this session; don't refetch on every auth ping.
    if (payoutsLoaded && payouts.length) {
      return Promise.resolve({ agents: agents.length, payouts: payouts.length, mode: 'cloud' });
    }

    return withTimeout(Promise.resolve(supabase.from('agents').select('*')), BOOT_TIMEOUT_MS, 'The agents table')
      .then(function (res) {
        if (res.error) throw res.error;
        agents = res.data || [];
        return withTimeout(Promise.resolve(
          supabase.from('payouts').select('*').limit(20000)
        ), BOOT_TIMEOUT_MS, 'The payouts table');
      })
      .then(function (res) {
        if (res.error) throw res.error;
        payouts = res.data || [];
        payoutsLoaded = true;
        if (!agents.length && !payouts.length) return seedPayroll();
        return { agents: agents.length, payouts: payouts.length, mode: 'cloud' };
      })
      .then(function (r) {
        return r || { agents: agents.length, payouts: payouts.length, mode: 'cloud' };
      });
  }

  // First run against empty tables: copy the bundled history up.
  function seedPayroll() {
    // Re-check immediately before writing. Cheap insurance against a second
    // caller that slipped past the in-flight guard, and against two people
    // opening the dashboard for the first time at the same moment.
    return supabase.from('agents').select('id').limit(1).then(function (chk) {
      if (chk.data && chk.data.length) {
        return Promise.all([
          supabase.from('agents').select('*'),
          supabase.from('payouts').select('*').limit(20000)
        ]).then(function (res) {
          if (res[0].data) agents = res[0].data;
          if (res[1].data) payouts = res[1].data;
          return { agents: agents.length, payouts: payouts.length, mode: 'cloud' };
        });
      }
      return doSeedPayroll();
    });
  }

  function doSeedPayroll() {
    var seedAgents = (window.TH_AGENTS || []).map(function (a) {
      return { name: a.name, role: a.role, level: a.level, level_source: a.level_source,
               first_year: a.first_year, last_year: a.last_year, active: !!a.active };
    });
    var seedPay = window.TH_PAYOUTS || [];
    if (!seedAgents.length) return Promise.resolve({ agents: 0, payouts: 0, mode: 'cloud' });

    // Bundled payout rows point at seed positions; resolve them to the real
    // transaction ids by matching on year + client + price.
    var byKey = {};
    rows.forEach(function (t) {
      byKey[[t.year, String(t.client || '').trim().toLowerCase(), t.sale_price].join('|')] = t.id;
    });

    return supabase.from('agents').insert(seedAgents)
      .then(function () {
        var payload = seedPay.map(function (p) {
          var k = [p.year, String(p.client || '').trim().toLowerCase(), p.sale_price].join('|');
          return { transaction_id: byKey[k] || null, agent: p.agent,
                   amount: p.amount, role: p.role, year: p.year };
        });
        var chunks = [];
        for (var i = 0; i < payload.length; i += 400) chunks.push(payload.slice(i, i + 400));
        return chunks.reduce(function (chain, c) {
          return chain.then(function () { return supabase.from('payouts').insert(c); });
        }, Promise.resolve());
      })
      .then(function () {
        return Promise.all([
          supabase.from('agents').select('*'),
          supabase.from('payouts').select('*').limit(20000)
        ]);
      })
      .then(function (res) {
        if (res[0].data) agents = res[0].data;
        if (res[1].data) payouts = res[1].data;
        return { agents: agents.length, payouts: payouts.length, mode: 'cloud', seeded: true };
      });
  }

  function addPayouts(transactionId, list) {
    var clean = (list || []).filter(function (p) { return p.agent && Number(p.amount); })
      .map(function (p) {
        return { transaction_id: transactionId, agent: p.agent,
                 amount: Number(p.amount), role: p.role || 'agent', year: p.year || null };
      });
    if (!clean.length) return Promise.resolve([]);
    if (!authAvailable()) {
      clean.forEach(function (p) { payouts.push(p); });
      return Promise.resolve(clean);
    }
    return supabase.from('payouts').insert(clean).select().then(function (res) {
      if (res.error) throw res.error;
      (res.data || []).forEach(function (p) { payouts.push(p); });
      return res.data;
    });
  }

  function replacePayouts(transactionId, list) {
    if (!authAvailable()) {
      payouts = payouts.filter(function (p) { return String(p.transaction_id) !== String(transactionId); });
      return addPayouts(transactionId, list);
    }
    return supabase.from('payouts').delete().eq('transaction_id', transactionId)
      .then(function () {
        payouts = payouts.filter(function (p) { return String(p.transaction_id) !== String(transactionId); });
        return addPayouts(transactionId, list);
      });
  }

  return {
    init: init, all: all, add: add, update: update,
    remove: remove, mode: getMode, resetLocal: resetLocal,
    isMemoryOnly: function () { return memoryOnly; },

    // payroll surface
    loadPayroll: loadPayroll,
    agents: function () { return agents.slice(); },
    payouts: function () { return payouts.slice(); },
    payoutsLoaded: function () { return payoutsLoaded; },
    addPayouts: addPayouts,
    replacePayouts: replacePayouts,
    payoutsFor: function (txId) {
      return payouts.filter(function (p) { return String(p.transaction_id) === String(txId); });
    },

    // auth surface
    initAuth: initAuth,
    signIn: signIn,
    signOut: signOut,
    authAvailable: authAvailable,
    user: function () { return currentUser; },
    // Local mode has nothing to guard; cloud mode needs a signed-in user.
    canWrite: function () { return !authAvailable() || !!currentUser; },
    onAuthChange: function (fn) { authListeners.push(fn); }
  };
})();
