/*!
 * dsm-track.js — self-contained analytics capture for standalone DSM pages.
 * ----------------------------------------------------------------------------
 * The React SPA instruments itself via src/lib/track.ts. The portfolio / AI-Lab
 * pages are plain HTML rendered in their own (iframed, same-origin) documents,
 * so they need their own tracker. This is a zero-dependency IIFE that emits the
 * SAME event schema to the SAME stable Ecommerce Apps Script sink, sharing the
 * durable anonymous id via localStorage so a visitor is one identity across the
 * shell and every embedded page.
 *
 * Drop-in:  <script src="/js/dsm-track.js" defer></script>
 * Transport: POST text/plain, mode:"no-cors", keepalive — fire-and-forget.
 * Privacy:   honours [data-no-track]; never reads form-field values.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__dsmTrackStarted) return;
  window.__dsmTrackStarted = true;

  var URL =
    (window.DSM_ANALYTICS_URL) ||
    'https://script.google.com/macros/s/AKfycbwn05r3WVqMpV4Tftn4n1qEs7I10cu3Z8S306jMXaXXCClxizt2EfOUSKa9cTha6pPD/exec';
  var STORE = window.DSM_STORE_NAME || 'DSM';

  var GRID = 20, ATT_SAMPLE = 120, ATT_FLUSH = 12000, SCROLL_MS = 200, MAX_TEXT = 80;
  var MILES = [25, 50, 75, 100];

  // ── identity (localStorage keys shared with the SPA tracker) ──
  function makeId(p) {
    try { if (window.crypto && crypto.randomUUID) return p + '_' + crypto.randomUUID(); } catch (e) {}
    return p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }
  function stored(store, key, p) {
    try { var v = store.getItem(key); if (v) return v; v = makeId(p); store.setItem(key, v); return v; }
    catch (e) { return makeId(p); }
  }
  var anonId = stored(window.localStorage, 'dsm.anonymousId', 'anon');
  var sessId = stored(window.sessionStorage, 'dsm.sessionId', 'sess');

  // ── transport ──
  function send(evt) {
    var payload = {
      type: 'telemetry', storeName: STORE, sessionId: sessId, anonymousId: anonId,
      pageUrl: location.href, userAgent: navigator.userAgent,
    };
    for (var k in evt) payload[k] = evt[k];
    try {
      fetch(URL, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      }).catch(function () {});
    } catch (e) {}
  }

  // ── helpers ──
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function pct(n) { return Math.round(n * 10) / 10; }
  function vp() {
    return {
      w: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
      h: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1),
    };
  }
  function depthPct() {
    var d = document.documentElement;
    var top = window.scrollY || d.scrollTop || 0;
    var scrollable = Math.max(1, d.scrollHeight - window.innerHeight);
    return Math.min(100, Math.max(0, (top / scrollable) * 100));
  }
  function bandOf(p) { return p >= 75 ? 3 : p >= 50 ? 2 : p >= 25 ? 1 : 0; }
  function closest(el, sel) { return el && el.closest ? el.closest(sel) : null; }
  function optedOut(el) { return !!closest(el, '[data-no-track]'); }

  function elId(el) {
    var n = el;
    for (var i = 0; n && i < 5; i++, n = n.parentElement) {
      var t = (n.getAttribute && n.getAttribute('data-track-id')) || n.id;
      if (t) return t;
    }
    if (!el) return undefined;
    var l = el.getAttribute && (el.getAttribute('data-testid') || el.getAttribute('aria-label'));
    if (l) return l;
    var cls = (typeof el.className === 'string' && el.className) ? '.' + el.className.trim().split(/\s+/)[0] : '';
    return (el.tagName ? el.tagName.toLowerCase() : 'node') + cls;
  }
  function prodId(el) { var h = closest(el, '[data-product-id]'); return h ? (h.getAttribute('data-product-id') || undefined) : undefined; }
  function safeText(el) {
    if (!el) return undefined;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return undefined;
    var raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) { var lbl = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title')); return lbl ? lbl.slice(0, MAX_TEXT) : undefined; }
    return raw.slice(0, MAX_TEXT);
  }

  // ── page state ──
  function fresh() {
    var t = now();
    return { maxDepth: 0, next: 0, band: [0, 0, 0, 0], lastBand: t, att: {}, lastCell: null, lastCellTs: t, url: location.href };
  }
  var page = fresh();

  // 1. page_view
  function pageView() {
    var v = vp();
    send({ event: 'page_view', eventType: 'page', metadata: {
      title: document.title, referrer: document.referrer || undefined,
      path: location.pathname + location.search, viewportW: v.w, viewportH: v.h,
      dpr: window.devicePixelRatio || 1, lang: navigator.language,
    }});
  }

  // 2. click
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (optedOut(t)) return;
    var v = vp(), a = closest(t, 'a');
    send({
      event: 'click', eventType: 'click', pageUrl: location.href,
      elementId: elId(t), elementText: safeText(t), productId: prodId(t),
      x: pct((e.clientX / v.w) * 100), y: pct((e.clientY / v.h) * 100),
      metadata: { tag: t && t.tagName ? t.tagName.toLowerCase() : undefined,
        href: a ? (a.getAttribute('href') || undefined) : undefined,
        button: e.button, rawX: Math.round(e.clientX), rawY: Math.round(e.clientY) },
    });
  }, true);

  // 3. scroll depth + dwell
  function attributeBand() { var t = now(); page.band[bandOf(depthPct())] += t - page.lastBand; page.lastBand = t; }
  var scScheduled = false;
  window.addEventListener('scroll', function () {
    if (scScheduled) return; scScheduled = true;
    setTimeout(function () {
      scScheduled = false; attributeBand();
      var d = depthPct(); if (d > page.maxDepth) page.maxDepth = d;
      while (page.next < MILES.length && page.maxDepth >= MILES[page.next]) {
        send({ event: 'scroll_depth', eventType: 'scroll', pageUrl: page.url, direction: 'down',
          metadata: { milestone: MILES[page.next], maxPercent: pct(page.maxDepth) } });
        page.next++;
      }
    }, SCROLL_MS);
  }, { passive: true });

  function scrollSummary() {
    attributeBand();
    var b = page.band, sum = b[0] + b[1] + b[2] + b[3];
    if (page.maxDepth <= 0 && sum < 250) return;
    send({ event: 'scroll_summary', eventType: 'scroll', pageUrl: page.url, metadata: {
      maxPercent: pct(page.maxDepth),
      dwellMs: { b0_25: Math.round(b[0]), b25_50: Math.round(b[1]), b50_75: Math.round(b[2]), b75_100: Math.round(b[3]) },
    }});
  }

  // 4. attention heatmap ("LOOK")
  function cellKey(x, y) {
    var v = vp();
    var c = Math.min(GRID - 1, Math.max(0, Math.floor((x / v.w) * GRID)));
    var r = Math.min(GRID - 1, Math.max(0, Math.floor((y / v.h) * GRID)));
    return c + ',' + r;
  }
  document.addEventListener('mousemove', function (e) {
    var t = now(), key = cellKey(e.clientX, e.clientY);
    if (page.lastCell !== null) {
      var dt = t - page.lastCellTs;
      if (dt >= ATT_SAMPLE) page.att[page.lastCell] = (page.att[page.lastCell] || 0) + Math.min(dt, 4000);
    }
    page.lastCell = key; page.lastCellTs = t;
  }, { passive: true });

  function flushAttention(final) {
    if (page.lastCell !== null) {
      var dt = now() - page.lastCellTs;
      if (dt >= ATT_SAMPLE) page.att[page.lastCell] = (page.att[page.lastCell] || 0) + Math.min(dt, 4000);
      page.lastCellTs = now();
    }
    var grid = {}, any = false;
    for (var k in page.att) { var ms = Math.round(page.att[k]); if (ms > 0) { grid[k] = ms; any = true; } }
    page.att = {};
    if (!any) return;
    send({ event: 'attention', eventType: 'custom', pageUrl: page.url,
      metadata: { grid: grid, cols: GRID, rows: GRID, unit: 'ms', final: !!final } });
  }
  setInterval(function () { flushAttention(false); }, ATT_FLUSH);

  // page-leave flushing
  function onHide() { scrollSummary(); flushAttention(true); page.band = [0, 0, 0, 0]; page.lastBand = now(); }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') onHide(); else page.lastBand = now();
  });
  window.addEventListener('pagehide', onHide);

  // boot
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pageView);
  else pageView();
})();
