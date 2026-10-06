/* Fidelity Dark Mode - content.js: drives the recolor.js passes. Injected at
 * document_start in every frame after palette.js and recolor.js, with the theme
 * CSS already applied (manifest.json). Route bundles keep adding stylesheets,
 * so every pass is re-entrant and reads only sheets it has not seen.
 */
(function () {
  'use strict';

  const R = self.FidelityDarkRecolor;
  const root = document.documentElement;

  const DEFAULTS = {
    enabled: true
  };

  let settings = Object.assign({}, DEFAULTS);
  const ACE = '.ace-chart.ace-container';
  const emitted = [];          // our <style> elements, oldest first
  const asked = new Set();     // cross-origin sheets requested from the worker
  let observer = null;
  let idleHandle = null;
  /* set between beforeprint and afterprint: no pass may write while printing */
  let printing = false;

  /* --- boot veil ----------------------------------------------------------- */

  /* Until the first pass has read Fidelity's sheets every surface is suppressed
     (00-base.css); the veil lifts after the first pass or after 2.5 s. */
  root.classList.add('fdm-boot');
  let veilLifted = false;
  function liftVeil(force) {
    if (veilLifted) return;
    /* Not while the document is still parsing: a pass that early (the settings
       read can trigger one) has not seen the page's sheets yet. */
    if (!force && document.readyState === 'loading') return;
    veilLifted = true;
    root.classList.remove('fdm-boot');
  }
  /* the 2.5 s ceiling, even if the engine throws or finds no sheets to read */
  setTimeout(() => liftVeil(true), 2500);

  /* --- gate ---------------------------------------------------------------- */

  /* Until storage answers, the fdm-off class decides: background.js registers
     gate-off.js to set it at document_start while the theme is off. */
  let settingsKnown = false;
  function isOn() {
    if (!settingsKnown && root.classList.contains('fdm-off')) return false;
    return settings.enabled !== false;
  }

  /* An update, or a reload in chrome://extensions, leaves this script running
     without its extension: the theme CSS is withdrawn, but what this script
     wrote stays, and the page is left half dark. When chrome.runtime.id goes,
     the page is handed back as switching off would. */
  let orphaned = false;
  function orphanCheck() {
    if (orphaned) return true;
    try { if (chrome.runtime && chrome.runtime.id) return false; } catch (e) { /* context invalidated */ }
    orphaned = true;
    settings.enabled = false;
    settingsKnown = true;
    try { applyGate(); } catch (e) { /* non-fatal */ }
    try { if (observer) observer.disconnect(); headWatcher.disconnect(); } catch (e) { /* non-fatal */ }
    return true;
  }

  /* Switching off also reverts inline styles and attributes and stops the
     passes; the CSS gate alone only stops stylesheet rules. */
  let gateApplied = null;

  function applyGate() {
    const on = isOn();
    root.classList.toggle('fdm-off', !on);

    if (!on) {
      liftVeil(true);                 // theme off: never hold the page back
      releaseHeld();                  // and never hold a stylesheet back either
      clearShadowMarks();
      dropShadowSheets();
      try { R.revert(); } catch (e) { /* non-fatal */ }
      /* revert() forgets which sheets were read, so their rules go too, or
         switching back on would append a second copy */
      for (const el of emitted) el.remove();
      emitted.length = 0;
      asked.clear();
    } else if (gateApplied === false) {
      /* back on: nothing is remembered, so this is a first pass */
      try { R.revert(); } catch (e) { /* non-fatal */ }
      schedule();
    }
    if (gateApplied !== null && gateApplied !== on) canvasSays('reset');
    gateApplied = on;
  }

  /* --- canvas charts ------------------------------------------------------- */
  /* canvas.js runs in the page's world and asks here for each colour a
     Chart.js chart draws with. It hands over a detached node to talk through
     (see canvas.js); a question is its data-q, the answer its data-a, and
     an empty answer leaves the colour as it is. */
  document.addEventListener('fdm:canvas-hello', e => {
    const line = e.relatedTarget;
    if (!line || !line.setAttribute || line.getAttribute('data-ok') === '1') return;
    line.addEventListener('fdm:canvas-ask', () => {
      const q = line.getAttribute('data-q') || '';
      const cut = q.indexOf('|');
      let out = null;
      if (cut > 0 && isOn() && !printing) {
        try { out = R.canvasColor(q.slice(cut + 1), q.slice(0, cut)); } catch (err) { out = null; }
      }
      line.setAttribute('data-a', out || '');
    });
    line.setAttribute('data-ok', '1');
  });
  const canvasSays = type => { try { document.dispatchEvent(new Event('fdm:canvas-' + type)); } catch (e) { /* ignore */ } };
  /* The ACE chart takes Fidelity's own dark theme class (themeAce in
     recolor.js); a chart already drawn is told to draw again. */
  function themeAce(scope) {
    let n = 0;
    try { n = R.themeAce(scope); } catch (e) { n = 0; }
    if (n) canvasSays('ace');
  }
  /* Chart.js styles its canvas as it builds a chart, so a canvas showing up
     or restyled sends canvas.js looking, once per task. */
  let canvasScanQueued = false;
  function canvasScan() {
    if (canvasScanQueued) return;
    canvasScanQueued = true;
    queueMicrotask(() => { canvasScanQueued = false; canvasSays('scan'); });
  }

  /* A value matching what is applied is a no-op, except the first, which
     always applies the gate. */
  function useSettings(next) {
    const was = settingsKnown ? isOn() : null;
    settings = Object.assign({}, DEFAULTS, next);
    settingsKnown = true;
    if (was === isOn() && gateApplied !== null) return;
    applyGate();
    if (isOn()) schedule();
  }

  chrome.storage.sync.get(DEFAULTS, stored => useSettings(stored));

  /* Every Fidelity tab follows the switch through this event: the popup only
     writes storage and messages no tab. */
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.enabled) return;
      useSettings(Object.assign({}, settings, { enabled: changes.enabled.newValue }));
    });
  } catch (e) { /* no storage events here */ }


  /* --- the emitted stylesheet --------------------------------------------- */

  /* One <style> per batch, placed after the sheets it was read from. Adding
     to a single sheet made the browser reparse all of it (megabytes on a
     portfolio page) for every stylesheet a route injects. Its rules are
     gated by the fdm-off class like the theme's own (see gateSelector in
     recolor.js), so nothing here is ever disabled or re-enabled. */
  function append(css) {
    if (!css) return;
    const el = document.createElement('style');
    el.dataset.fidelityDark = 'emitted';
    el.media = 'screen';
    el.textContent = css;
    (document.head || root).appendChild(el);
    emitted.push(el);
  }

  /* --- passes -------------------------------------------------------------- */

  /* `done` runs once every sheet this pass found is themed, including the
     cross-origin ones the worker has to fetch. */
  function sheetPass(done) {
    const finish = () => { if (done) done(); };
    if (!isOn() || printing) { finish(); return; }
    try { append(R.processSheets(document)); } catch (e) { /* non-fatal */ }
    /* A held link's sheet is a new object once its media is restored, so the
       same address can come round again; each is asked for once, and again
       only if the worker could not fetch it. */
    const urls = [...R.pendingRemote].filter(u => !asked.has(u));
    R.pendingRemote.clear();
    if (urls.length) {
      for (const u of urls) asked.add(u);
      /* the worker takes 24 addresses per message */
      let waiting = Math.ceil(urls.length / 24);
      const landed = () => { if (--waiting === 0) finish(); };
      for (let i = 0; i < urls.length; i += 24) {
        const batch = urls.slice(i, i + 24);
        try {
          chrome.runtime.sendMessage({ type: 'fdm:fetchCss', urls: batch }, res => {
            void chrome.runtime.lastError;
            const got = new Set(((res && res.sheets) || []).map(s => s.url));
            for (const u of batch) if (!got.has(u)) asked.delete(u);
            if (res && res.sheets && isOn()) {
              for (const s of res.sheets) append(R.processText(s.text, s.url));
              try { R.recheckScrims(); } catch (e) { /* non-fatal */ }
            }
            landed();
          });
        } catch (e) { for (const u of batch) asked.delete(u); landed(); /* extension reloaded under the page */ }
      }
    } else finish();
    /* a stylesheet can swap a hero's picture out from under its scrim */
    try { R.recheckScrims(); } catch (e) { /* non-fatal */ }
  }

  function inlinePass(scope) {
    const nodes = (scope || document).querySelectorAll('[style]');
    for (const el of nodes) {
      if (el.dataset && el.dataset.fdmInline === '1') continue;
      if (el.dataset) el.dataset.fdmInline = '1';
      try { R.processInline(el); } catch (e) { /* non-fatal */ }
    }
  }

  /* --- shadow roots -------------------------------------------------------- */

  /* The theme CSS stops at a shadow root (Fidelity's grid overflow menu is in
     one), but custom properties cross it: every root adopts one compact sheet
     written against the --fdm-* variables. */
  const adopted = new WeakSet();
  const adoptedRoots = new Set();
  let shadowSheet = null;
  /* Each root also adopts a recolored copy of its own <style> and adopted
     sheets: nothing else reaches the component's internals. */
  const mappedSheets = new WeakMap();   // shadowRoot -> { sheet, text }

  /* adoptedRoots is a Set, so the off switch can withdraw every sheet; on a
     long single-page session it would otherwise keep every component a route
     ever showed. Past a size it sheds roots whose hosts have left the page
     (the WeakSet and WeakMap beside it let a host that comes back be seen as
     adopted already). */
  let shedRootsAt = 400;
  function noteRoot(sr) {
    adoptedRoots.add(sr);
    if (adoptedRoots.size < shedRootsAt) return;
    for (const r of adoptedRoots) {
      if (!r.host || !r.host.isConnected) adoptedRoots.delete(r);
    }
    shedRootsAt = adoptedRoots.size + 400;
  }

  /* revert() clears the inline pass's marks in the document only. These are
     the ones inside shadow roots, so the next inline pass revisits them. */
  function clearShadowMarks() {
    for (const sr of adoptedRoots) {
      try { for (const el of sr.querySelectorAll('[data-fdm-inline]')) el.removeAttribute('data-fdm-inline'); }
      catch (e) { /* ignore */ }
    }
  }

  /* A constructed sheet adopted by a shadow root is beyond any selector, so
     the fdm-off gate cannot reach it: it has to be withdrawn. */
  function dropShadowSheets() {
    for (const sr of adoptedRoots) {
      try {
        const m = mappedSheets.get(sr);
        sr.adoptedStyleSheets = sr.adoptedStyleSheets.filter(x => x !== shadowSheet && !(m && x === m.sheet));
      } catch (e) { /* ignore */ }
      adopted.delete(sr);
      mappedSheets.delete(sr);
    }
    adoptedRoots.clear();
  }

  function harvestShadow(sr) {
    let css = '';
    try { css += R.processSheets(sr); } catch (e) { /* non-fatal */ }
    try { css += R.processAdopted(sr); } catch (e) { /* non-fatal */ }
    if (!css) return;
    let m = mappedSheets.get(sr);
    if (!m) {
      try {
        const sheet = new CSSStyleSheet({ media: 'screen' });
        sheet.__fdm = true;
        m = { sheet, text: '' };
        mappedSheets.set(sr, m);
        sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet];
        noteRoot(sr);
      } catch (e) { return; }
    }
    m.text += '\n' + css;
    try { m.sheet.replaceSync(m.text); } catch (e) { /* ignore */ }
  }

  function getShadowSheet() {
    if (shadowSheet !== null) return shadowSheet;
    try {
      const s = new CSSStyleSheet({ media: 'screen' });
      s.__fdm = true;
      s.replaceSync(`
        :host { color-scheme: dark; color: var(--fdm-text, #FFFFFF); }
        :host([hidden]), [hidden] { display: none !important; }
        /* no :host background here - the light DOM decides that, and only for
           floating layers */
        .popup, .menu, [class*="menu"], [class*="popup"], [class*="dropdown"],
        [class*="panel"], [class*="container"], [class*="content"], [class*="body"],
        [class*="header"], [class*="footer"], [class*="wrapper"], [role="menu"],
        [role="listbox"], [role="dialog"], ul, ol, li, section, div, nav {
          background-color: transparent;
          color: inherit;
        }
        /* a ring spinner draws its arc in currentColor borders, so it keeps them */
        :is(.popup, .menu, [class*="menu"], [class*="popup"], [class*="dropdown"],
        [class*="panel"], [class*="container"], [class*="content"], [class*="body"],
        [class*="header"], [class*="footer"], [class*="wrapper"], [role="menu"],
        [role="listbox"], [role="dialog"], ul, ol, li, section, div, nav):not([class*="spin" i], [class*="spin" i] *) {
          border-color: var(--fdm-border, #403F3E);
        }
        :host > *:first-child { background-color: transparent; }
        a { color: var(--fdm-link, #8CC1FD); }
        button { background-color: transparent; color: inherit; border-color: var(--fdm-border-ctl, #ABAAA8); }
        [role="menuitem"]:hover, li:hover, button:hover { background-color: var(--fdm-surf-4, #403F3E); }
        /* an icon-only X paints nothing of its own: its light-mode fill is the
           bubble's white through a token, which maps a step apart from the
           bubble and left a square behind it (pwe-popover's close-popover) */
        [class*="close-button" i], [class*="popover__close" i], [class*="close-popover" i], [class*="modal__close" i],
        [class*="close-modal" i], [class*="search-close" i],
        :is(button, a, [role="button"])[class*="close" i]:empty,
        :is(button, a, [role="button"])[class*="close" i]:has(> svg:only-child),
        :is(button, a, [role="button"])[aria-label*="close" i]:empty,
        :is(button, a, [role="button"])[aria-label*="close" i]:has(> svg:only-child) {
          background-color: transparent !important;
          border-color: transparent !important;
        }
        hr, [class*="divider"], [class*="separator"] { border-color: var(--fdm-hair, #323232); }
        hr, [class*="divider"]:empty:not([class*="no_div" i], [class*="no-div" i]),
        [class*="separator"]:empty:not([class*="no_sep" i], [class*="no-sep" i]) { background-color: var(--fdm-hair, #323232); }
        svg { fill: currentColor; color: var(--fdm-text-2, #D9D8D5); }
        svg [fill="#ffffff" i], svg [fill="#fff" i], svg [fill="white" i] { fill: currentColor; }
        svg [fill="#000000" i], svg [fill="#000" i], svg [fill="black" i], svg [fill="#141414" i] { fill: currentColor; }
        input, select, textarea {
          background-color: var(--fdm-surf-2, #2F2F2F);
          color: var(--fdm-text, #FFFFFF);
          border-color: var(--fdm-border-ctl, #ABAAA8);
        }
      `);
      shadowSheet = s;
    } catch (e) { shadowSheet = false; }   // engine without constructable sheets
    return shadowSheet;
  }

  /* Only floating hosts get a surface (it closes the white strips around a
     menu's items); on every host it would put a plate behind each scoped icon
     component. Other hosts get ink only. */
  const FLOATING = /(menu|popup|modal|dialog|dropdown|overlay|flyout|popover)/i;

  function isFloatingHost(el) {
    if (FLOATING.test(el.tagName)) return true;
    const cls = String(el.className && (el.className.baseVal ?? el.className) || '');
    if (FLOATING.test(cls)) return true;
    const role = el.getAttribute && el.getAttribute('role');
    return role === 'menu' || role === 'dialog' || role === 'listbox';
  }

  /* A floating component that draws its own rounded bubble (the positions
     grid's kebab menu, <pwe-popover>) gets no host surface, or square corners
     show behind it. Ask after its own sheets are mapped. */
  function drawsOwnSurface(el) {
    const sr = el.shadowRoot;
    if (!sr) return false;
    for (const c of sr.children) {
      if (/^(STYLE|LINK|SLOT|SCRIPT|TEMPLATE)$/.test(c.tagName)) continue;
      const cs = getComputedStyle(c);
      const bg = R.parseColor(cs.backgroundColor);
      return !!(bg && bg.a >= 0.99 && parseFloat(cs.borderTopLeftRadius) > 0);
    }
    return false;
  }

  const HOST_INK = 'var(--fdm-text, #FFFFFF)';
  function styleShadowHost(el) {
    if (el.style.getPropertyValue('color') !== HOST_INK) R.writeStyle(el, 'color', HOST_INK, 'important');
    if (!isFloatingHost(el)) return;
    const want = drawsOwnSurface(el) ? 'transparent' : 'var(--fdm-surf-3, #323232)';
    if (el.style.getPropertyValue('background-color') !== want) R.writeStyle(el, 'background-color', want, 'important');
  }

  /* `src` and `class` as well: a picture the page swaps in place, or by a
     class, has to be looked at again (pictureChanged and picturesChanged in
     recolor.js). A class change costs one set lookup unless an edited picture
     sits at or under the element. */
  const OBSERVE = { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'src', 'class'] };
  const watchedRoots = new WeakSet();

  /* The document's observer does not see into shadow roots, so each visited
     root is observed too (Stencil writes the transfer page's <tc-source>
     styles after the host mounts). */
  function watchRoot(sr) {
    if (!observer || watchedRoots.has(sr)) return;
    try { observer.observe(sr, OBSERVE); watchedRoots.add(sr); } catch (e) { /* non-fatal */ }
  }

  function visitHost(el, left) {
    const sr = el.shadowRoot;
    if (!sr) return;
    if (adopted.has(sr)) {
      /* seen before, but it may have added styles (the harvest is idempotent
         per sheet) or nested children since */
      noteRoot(sr);
      harvestShadow(sr);
      watchRoot(sr);
      /* its bubble may have rendered since the first look */
      if (isFloatingHost(el)) styleShadowHost(el);
      shadowPass(sr, left);
      return;
    }
    adopted.add(sr);
    noteRoot(sr);
    watchRoot(sr);
    const sheet = getShadowSheet();
    if (sheet) {
      try { sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet]; }
      catch (e) { /* ignore */ }
    }
    /* Its own sheets, recolored (the Performance page's <skeleton-loader> bar
       is #eee from a <style> in its root), then the host, so drawsOwnSurface
       sees the mapped bubble. */
    harvestShadow(sr);
    styleShadowHost(el);
    inlinePass(sr);
    try { R.dimPlaceholders(sr); } catch (e) { /* non-fatal */ }
    /* icons too: pvd-footer keeps its logo <img> inside its shadow root */
    try { R.recolorIconImages(sr); } catch (e) { /* non-fatal */ }
    try { R.recolorSymbols(sr); } catch (e) { /* non-fatal */ }
    shadowPass(sr, left);   // components nest
  }

  function shadowPass(scope, budget) {
    const root_ = scope || document;
    let left = budget === undefined ? Infinity : budget;
    if (root_.shadowRoot) visitHost(root_, left);
    const hosts = root_.querySelectorAll('*');
    for (const el of hosts) {
      if (--left < 0) break;
      if (el.shadowRoot) visitHost(el, left);
    }
  }

  function fullPass() {
    if (orphanCheck() || !isOn()) { liftVeil(true); return; }
    if (printing) return;
    try { sheetPass(); } catch (e) { /* non-fatal */ }
    try { inlinePass(); } catch (e) { /* non-fatal */ }
    try { shadowPass(); } catch (e) { /* non-fatal */ }
    themeAce();
    /* Everything below measures what is painted, and under the boot veil every
       surface is transparent, so it waits for the veil to lift. */
    liftVeil();
    if (!veilLifted) return;
    try { R.recolorIconImages(); } catch (e) { /* non-fatal */ }
    try { R.recolorSymbols(); } catch (e) { /* non-fatal */ }
    try { R.recolorChartMarks(); } catch (e) { /* non-fatal */ }
    try { R.dimPlaceholders(); } catch (e) { /* non-fatal */ }
    try { R.fixSpinners(); } catch (e) { /* non-fatal */ }
    try { R.flattenPage(); } catch (e) { /* non-fatal */ }
    try { R.enforceIconContrast(); } catch (e) { /* non-fatal */ }
    // Last: measures what was painted and repairs any pair still short of AA.
    try { R.enforceContrast(); } catch (e) { /* non-fatal */ }
  }

  /* After the first pass, requests in a burst (a route injecting stylesheet
     after stylesheet) share one pass: it runs 250 ms after the last request,
     and no later than 1.2 s after the first. New sheets are still rewritten
     as they arrive (preflight), so only the measuring passes wait. */
  let burstStart = 0, burstTimer = null;
  function schedule() {
    if (idleHandle) return;
    const run = () => { idleHandle = null; fullPass(); };
    const idle = () => { idleHandle = (self.requestIdleCallback || setTimeout)(run, { timeout: 400 }); };
    if (!veilLifted) { idle(); return; }
    const now = performance.now();
    if (!burstStart) burstStart = now;
    clearTimeout(burstTimer);
    burstTimer = setTimeout(() => { burstStart = 0; burstTimer = null; idle(); },
      Math.max(0, Math.min(250, burstStart + 1200 - now)));
  }

  /* --- light pass ---------------------------------------------------------- */

  /* Content added without a stylesheet gets a light pass over the new subtree
     only, debounced 500 ms because Angular adds nodes in bursts. */
  let lightHandle = null;
  let lightScopes = [];
  /* asked for with no node: the whole document, whatever else was asked for */
  let lightAll = false;

  function scheduleLight(node) {
    if (node && node.nodeType === 1) lightScopes.push(node);
    else lightAll = true;
    if (lightHandle) return;
    lightHandle = setTimeout(() => {
      lightHandle = null;
      if (orphanCheck() || !isOn() || printing || !veilLifted) { lightScopes = []; lightAll = false; return; }
      /* Past 8 separate subtrees, one sweep of the document is cheaper and less
         likely to miss a reparented node. */
      const scopes = !lightAll && lightScopes.length && lightScopes.length <= 8
        ? lightScopes.filter(n => n.isConnected)
        : [null];
      lightScopes = [];
      lightAll = false;
      for (const sc of scopes) {
        try { R.recolorChartMarks(sc || document); } catch (e) { /* non-fatal */ }
        themeAce(sc || document);
        /* icons too: a widget with no stylesheet reaches only this pass (the
           Morningstar rating sprite on the Performance route) */
        try { R.recolorIconImages(sc || document); } catch (e) { /* non-fatal */ }
        try { R.recolorSymbols(sc || document); } catch (e) { /* non-fatal */ }
        try { R.dimPlaceholders(sc || document); } catch (e) { /* non-fatal */ }
        try { R.fixSpinners(sc || document); } catch (e) { /* non-fatal */ }
        try { R.enforceIconContrast(sc || document); } catch (e) { /* non-fatal */ }
        try { R.enforceContrast(sc || undefined); } catch (e) { /* non-fatal */ }
      }
      /* a route's tab panel can arrive with no new stylesheet */
      try { R.flattenPage(); } catch (e) { /* non-fatal */ }
    }, 500);
  }

  /* --- stylesheets before they paint --------------------------------------- */

  /* watch() starts at DOMContentLoaded, too late for <head>, so this runs from
     document_start. A readable sheet is rewritten in the task it was inserted
     in; a cross-origin one is held with media="not all" until the worker's
     rewrite lands (sheetPass(release)), for HOLD_MS at most. */
  const held = new WeakSet();
  /* Held links are also kept in a Set so releaseHeld() can let them all go at
     once when the theme is switched off. */
  const heldLinks = new Set();
  const HOLD_MS = 1200;
  const SYNC_BUDGET_MS = 250;
  let lastSyncPass = 0;

  function hold(link) {
    if (held.has(link) || !isOn()) return;
    let sameOrigin = true;
    try { sameOrigin = new URL(link.href, location.href).origin === location.origin; }
    catch (e) { sameOrigin = true; }
    if (sameOrigin) return;            // readable in place; no need to hold it
    held.add(link);
    heldLinks.add(link);
    const restore = link.media || 'all';
    link.media = 'not all';
    const release = () => {
      if (link.media === 'not all') link.media = restore;
      heldLinks.delete(link);
    };
    link.__fdmRelease = release;
    link.addEventListener('load', () => sheetPass(release), { once: true });
    link.addEventListener('error', release, { once: true });
    setTimeout(release, HOLD_MS);
  }

  function releaseHeld() {
    for (const link of [...heldLinks]) {
      try { if (link.__fdmRelease) link.__fdmRelease(); } catch (e) { /* ignore */ }
    }
    heldLinks.clear();
  }

  function preflight(node, deep) {
    if (node.nodeType !== 1) return false;
    const tag = node.tagName;
    if (tag === 'LINK') { if (node.rel === 'stylesheet') { hold(node); return true; } return false; }
    /* Our own <style>: appending to it or moving it is a childList mutation on
       <head>, and as a new sheet it would retrigger the sync pass forever. */
    if (node.dataset && node.dataset.fidelityDark !== undefined) return false;
    if (tag === 'STYLE') return true;
    /* This sees every node the router inserts, so the costly subtree query is
       only for nodes added to <head>, <html> or the document; elsewhere sheets
       arrive bare, caught above. */
    if (!deep || !node.querySelectorAll) return false;
    let found = false;
    for (const el of node.querySelectorAll('link[rel="stylesheet"],style')) {
      if (el.tagName === 'LINK') hold(el);
      found = true;
    }
    return found;
  }

  const headWatcher = new MutationObserver(records => {
    if (orphanCheck()) return;
    let any = false;
    for (const rec of records) {
      const t = rec.target;
      const deep = t === document.head || t === root || t === document;
      for (const node of rec.addedNodes) { if (preflight(node, deep)) any = true; }
    }
    if (!any || !isOn() || printing) return;
    /* In this task, so the sheet never paints light, but once per
       SYNC_BUDGET_MS at most: Stencil injects a <style> per component. */
    const now = Date.now();
    if (now - lastSyncPass < SYNC_BUDGET_MS) { schedule(); return; }
    lastSyncPass = now;
    try { sheetPass(); } catch (e) { /* non-fatal */ }
  });
  try { headWatcher.observe(root, { childList: true, subtree: true }); } catch (e) { /* non-fatal */ }

  /* --- watching ------------------------------------------------------------ */

  /* Styled nodes and style changes: the inline pass, at once. New sheets: the
     idle full pass. New text, images and src changes: the 500 ms light pass.
     Placeholders, shadow hosts, sprites and tooltip rows: in the same task. */
  function watch() {
    if (observer) return;
    observer = new MutationObserver(records => {
      /* every branch below writes to the page */
      if (orphanCheck() || !isOn() || printing) return;
      let needSheets = false;
      let contentArrived = false;
      let contentRoot = null;
      let contentMany = false;
      const inlineTargets = [];
      const pictures = [];
      const reclassed = [];
      for (const rec of records) {
        if (rec.target.tagName === 'CANVAS') canvasScan();
        if (rec.type === 'attributes') {
          if (rec.attributeName === 'src') {
            let fresh = false;
            try { fresh = R.pictureChanged(rec.target); } catch (e) { /* non-fatal */ }
            if (fresh) pictures.push(rec.target);
          } else if (rec.attributeName === 'class') {
            reclassed.push(rec.target);
          } else {
            inlineTargets.push(rec.target);
          }
          continue;
        }
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1) continue;
          const tag = node.tagName;
          if (tag === 'CANVAS' || (node.querySelector && node.querySelector('canvas'))) canvasScan();
          let sheetHere = false;
          if (tag === 'STYLE' || (tag === 'LINK' && node.rel === 'stylesheet')) {
            needSheets = sheetHere = true;
            if (tag === 'LINK') node.addEventListener('load', schedule, { once: true });
          } else if (node.querySelector && node.querySelector('style,link[rel="stylesheet"]')) {
            needSheets = sheetHere = true;
          }
          /* A sheet landing in a watched shadow root is harvested now, so the
             component never paints light; the idle full pass still follows. */
          if (sheetHere) {
            const rn = node.getRootNode ? node.getRootNode() : null;
            if (rn && rn !== document && rn.host) {
              try { harvestShadow(rn); } catch (e) { /* non-fatal */ }
            }
          }
          if (node.hasAttribute && node.hasAttribute('style')) inlineTargets.push(node);
          else if (node.querySelector && node.querySelector('[style]')) inlineTargets.push(node);
          /* An <img> is not content below, so it gets its own light pass (the
             classic Performance table rebuilds its sort arrow on each click). */
          if (tag === 'IMG' || (node.querySelector && node.querySelector('img'))) pictures.push(node);
          if (node.textContent && node.textContent.trim().length > 1) {
            if (contentArrived && contentRoot !== node) contentMany = true;
            contentArrived = true;
            contentRoot = node;
          }
          /* Placeholders are dimmed in the task they are inserted in; they are
             gone before a 500 ms debounce would reach them. Subtrees over 250
             elements are left to the later passes. */
          if (node.querySelectorAll && node.querySelectorAll('*').length <= 250) {
            try { R.dimPlaceholders(node); } catch (e) { /* non-fatal */ }
          }
          /* A chart container gets its theme class now, before ChartIQ reads
             its colours for the first drawing. */
          if (node.matches && (node.matches(ACE) || node.querySelector(ACE))) themeAce(node);
          /* shadow hosts too (the skeleton loader is one): capped at 900
             elements, not skipped, so a whole tile arriving at once is seen */
          if (node.querySelectorAll) {
            try { shadowPass(node, 900); } catch (e) { /* non-fatal */ }
          }
          /* a sprite is not content either: recolored now, so its <use> clones
             start from the corrected artwork */
          if (node.querySelector) {
            const tag = String(node.tagName).toLowerCase();
            if (tag === 'symbol' || tag === 'use' || node.querySelector('symbol,use')) {
              try { R.recolorSymbols(node); } catch (e) { /* non-fatal */ }
            }
          }
          /* Highcharts rebuilds its tooltip, keys in light colours, at every
             pointer step; a debounce never catches a moving pointer. */
          if (node.closest) {
            const TIP = '.highcharts-tooltip-container, .highcharts-tooltip';
            let tip = null;
            try { tip = node.closest(TIP); } catch (e) { /* ignore */ }
            if (tip) {
              try { R.recolorChartMarks(node === tip ? node : (node.parentElement || node)); } catch (e) { /* non-fatal */ }
            }
          }
        }
      }
      if (inlineTargets.length) {
        for (const t of inlineTargets) {
          if (t.nodeType !== 1) continue;
          /* Highcharts rewrites a point's style on every redraw; marks belong
             to the chart mapper, not the UI map. */
          if (R.isChartMark(t)) continue;
          if (t.hasAttribute('style') && t.dataset) { t.dataset.fdmInline = '0'; }
          /* the scope's descendants are read, so the parent is the scope; for
             a shadow root's top-level child that parent is the root itself */
          inlinePass(t.parentElement || t.parentNode || t);
        }
      }
      /* a class that swapped an edited background picture: the picture is
         forgotten, and looked at again by the light pass */
      if (reclassed.length) {
        let swapped = [];
        try { swapped = R.picturesChanged(reclassed); } catch (e) { /* non-fatal */ }
        /* the pass reads a scope's descendants, so the parent is the scope */
        for (const el of swapped) pictures.push(el.parentElement || el);
      }
      if (needSheets) schedule();
      else {
        if (contentArrived) scheduleLight(contentMany ? null : contentRoot);
        for (const p of pictures) scheduleLight(p.tagName === 'IMG' ? (p.parentElement || p) : p);
      }
    });
    observer.observe(root, OBSERVE);
    /* Roots visited by the first pass, before there was an observer. */
    for (const sr of adoptedRoots) watchRoot(sr);
  }

  /* Highcharts rewrites a point's fill attribute on hover; one capture
     listener is far cheaper than observing `fill` on every node. */
  function bindChartHooks() {
    const onOver = e => {
      if (!isOn() || printing) return;
      const c = e.target && e.target.closest && e.target.closest('.highcharts-container');
      if (!c) return;
      try { R.recolorChartMarks(c); } catch (err) { /* non-fatal */ }
    };
    document.addEventListener('mouseover', onOver, { passive: true, capture: true });
    document.addEventListener('focusin', onOver, { passive: true, capture: true });
  }

  /* --- printing ------------------------------------------------------------ */

  /* Prints get Fidelity's light styles: the theme CSS and emitted sheets are
     screen-only, and inline writes, which cannot be, are reverted for the
     print and redone after it. The gate class goes on too, while the page is
     still on screen media: the ACE chart redraws from its probes at once
     (canvas.js), and they must already read light. */
  function bindPrintHooks() {
    const toPrint = () => {
      if (printing) return;
      printing = true;
      clearShadowMarks();
      try { R.revert(true); } catch (e) { /* non-fatal */ }
      root.classList.add('fdm-off');
      canvasSays('print');
    };
    const toScreen = () => {
      if (!printing) return;
      printing = false;
      root.classList.toggle('fdm-off', !isOn());
      canvasSays('reset');
      if (isOn()) schedule();
    };
    self.addEventListener('beforeprint', toPrint);
    self.addEventListener('afterprint', toScreen);
    const mq = self.matchMedia && self.matchMedia('print');
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', e => { if (e.matches) toPrint(); else toScreen(); });
    }
  }

  /* --- lifecycle ----------------------------------------------------------- */

  const boot = () => { fullPass(); liftVeil(); watch(); bindPrintHooks(); bindChartHooks(); canvasScan(); };
  /* a tab left open through an update is handed back when it is looked at again */
  document.addEventListener('visibilitychange', orphanCheck);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  // Angular keeps adding bundles well past DOMContentLoaded.
  self.addEventListener('load', schedule, { once: true });
  setTimeout(schedule, 1500);
  setTimeout(schedule, 4000);
})();
