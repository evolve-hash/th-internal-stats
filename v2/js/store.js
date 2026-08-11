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
                'sale_price','gross_comm','net_comm','source','referrer'];

  function clean(obj) {
    var out = {};
    FIELDS.forEach(function (f) {
      var v = obj[f];
      if (v === '' || v === undefined) v = null;
      if (['sale_price','gross_comm','net_comm'].indexOf(f) > -1) {
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
    var seed = (window.TH_SEED || []).map(function (r) { return clean(r); });
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
    var payload = clean(record);
    if (mode === 'cloud') {
      return supabase.from(cfg.TABLE || 'transactions').insert(payload).select().single()
        .then(function (res) {
          if (res.error) throw res.error;
          var row = normalize(res.data);
          rows.push(row);
          return row;
        });
    }
    payload.id = nextId();
    rows.push(payload);
    lsWrite(rows);
    return Promise.resolve(payload);
  }

  function update(id, record) {
    var payload = clean(record);
    if (mode === 'cloud') {
      return supabase.from(cfg.TABLE || 'transactions').update(payload).eq('id', id).select().single()
        .then(function (res) {
          if (res.error) throw res.error;
          var row = normalize(res.data);
          var i = rows.findIndex(function (r) { return String(r.id) === String(id); });
          if (i > -1) rows[i] = row;
          return row;
        });
    }
    var i = rows.findIndex(function (r) { return String(r.id) === String(id); });
    if (i > -1) { payload.id = rows[i].id; rows[i] = payload; lsWrite(rows); }
    return Promise.resolve(payload);
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

  return {
    init: init, all: all, add: add, update: update,
    remove: remove, mode: getMode, resetLocal: resetLocal,
    isMemoryOnly: function () { return memoryOnly; },

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
