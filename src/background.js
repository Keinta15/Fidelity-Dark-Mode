/* Fidelity Dark Mode - service worker.
 * 1. Fetches stylesheets, SVG files and small icons that Fidelity serves
 *    cross-origin without CORS, so the content script can recolor them.
 * 2. While the theme is off, registers gate-off.js so a page is off from its
 *    first paint rather than from whenever chrome.storage answers.
 */
'use strict';

/** An https address on fidelity.com, fidelityrewards.com, a subdomain of
    either, or Fidelity's research provider (fidelity.wallst.com and its
    subdomains): the hosts manifest.json grants, and nothing else. */
function isFidelityUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && /(^|\.)fidelity(rewards)?\.com$|(^|\.)fidelity\.wallst\.com$/.test(x.hostname);
  } catch (e) { return false; }
}

/* Each fetch is anonymous (no cookies) and must land on a Fidelity host after
   any redirect; a response that went elsewhere is dropped unread. */
const CSS_MAX = 3000000;      // characters per stylesheet
const SVG_MAX = 120000;
const IMAGE_MAX = 100000;     // bytes

function fetchFidelity(url) {
  return fetch(url, { credentials: 'omit', cache: 'force-cache' })
    .then(r => (r.ok && isFidelityUrl(r.url || url) ? r : null));
}

function contentType(r) {
  return (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  /* only this extension's own content scripts ask */
  if (!msg || !sender || sender.id !== chrome.runtime.id || !sender.tab) return false;
  if (msg.type === 'fdm:fetchCss') {
    const urls = (Array.isArray(msg.urls) ? msg.urls : []).filter(u => typeof u === 'string' && isFidelityUrl(u)).slice(0, 24);
    Promise.all(urls.map(url =>
      fetchFidelity(url)
        .then(r => {
          if (!r) return '';
          /* a stylesheet is text/css; only an answer with no type at all is
             taken on the strength of a .css address */
          const type = contentType(r);
          if (type ? type !== 'text/css' : !/\.css(\?|$)/i.test(url)) return '';
          return r.text();
        })
        .then(text => (text && text.length <= CSS_MAX ? text : ''))
        .catch(() => '')
        .then(text => ({ url, text }))
    )).then(sheets => respond({ sheets: sheets.filter(s => s.text) }));
    return true;
  }
  if (msg.type === 'fdm:fetchSvg') {
    const url = String(msg.url || '');
    if (!isFidelityUrl(url) || !/\.svg(\?|$)/i.test(url)) { respond({ text: null }); return false; }
    fetchFidelity(url)
      .then(r => {
        if (!r) return null;
        const type = contentType(r);
        return type && type !== 'image/svg+xml' ? null : r.text();
      })
      .then(text => respond({ text: text && text.length <= SVG_MAX ? text : null }))
      .catch(() => respond({ text: null }));
    return true;
  }
  /* A small raster icon (the research pages' GIFs come from a host that sends
     no CORS headers, so the page cannot read their pixels), as a data: URL. */
  if (msg.type === 'fdm:fetchImage') {
    const url = String(msg.url || '');
    if (!isFidelityUrl(url)) { respond({ data: null }); return false; }
    fetchFidelity(url)
      .then(async r => {
        if (!r) return null;
        const type = contentType(r);
        if (!/^image\/(?:gif|png|jpeg|webp)$/.test(type)) return null;
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (bytes.length > IMAGE_MAX) return null;
        let bin = '';
        for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        return 'data:' + type + ';base64,' + btoa(bin);
      })
      .then(data => respond({ data }))
      .catch(() => respond({ data: null }));
    return true;
  }
  return false;
});

const GATE_ID = 'fdm-off-gate';
/* The content script's hosts (manifest.json): every frame the theme reaches. */
const MATCHES = ['https://*.fidelity.com/*', 'https://*.fidelityrewards.com/*', 'https://fmrpi.az1.qualtrics.com/*'];

/* One registration at a time: the startup read and a storage change can
   arrive together, and two interleaved unregister/register pairs would race.
   A registration that already matches the setting is left in place, so a
   worker waking with the theme off (every message wakes it) leaves no gap in
   which a page could paint dark first. */
let gateQueue = Promise.resolve();
function syncGate(enabled) {
  gateQueue = gateQueue.then(async () => {
    try {
      const have = await chrome.scripting.getRegisteredContentScripts({ ids: [GATE_ID] });
      const want = enabled === false;
      if (have.length === (want ? 1 : 0)) return;
      if (have.length) await chrome.scripting.unregisterContentScripts({ ids: [GATE_ID] });
      if (want) {
        await chrome.scripting.registerContentScripts([{
          id: GATE_ID, matches: MATCHES, js: ['src/gate-off.js'],
          runAt: 'document_start', allFrames: true, persistAcrossSessions: true
        }]);
      }
    } catch (e) { /* the content script's own storage read still applies */ }
  });
  return gateQueue;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) syncGate(changes.enabled.newValue);
});
chrome.storage.sync.get({ enabled: true }, s => syncGate(s.enabled));
