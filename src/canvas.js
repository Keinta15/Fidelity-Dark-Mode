/* Fidelity Dark Mode - canvas.js. Chart.js draws its charts on a canvas, out
 * of reach of CSS, with a context only the page's own world can see, so this
 * file runs there (manifest.json, "world": "MAIN"). It wraps the drawing calls
 * of each Chart.js canvas's own context, never the shared prototype, so every
 * other canvas on the page draws as it always did. It decides no colour
 * itself: each is asked of content.js, which answers from the same tables as
 * the chart's HTML key, and leaves every colour alone while the theme is off
 * or the page is printing. It also tells a ChartIQ chart (the quote pages'
 * ACE chart) to read its colours again when the theme comes or goes.
 */
(function () {
  'use strict';
  if (typeof CanvasRenderingContext2D === 'undefined') return;

  const proto = CanvasRenderingContext2D.prototype;
  const FILL = Object.getOwnPropertyDescriptor(proto, 'fillStyle');
  const STROKE = Object.getOwnPropertyDescriptor(proto, 'strokeStyle');
  /* drawing call -> the style it paints with, and what it paints */
  const DRAWS = {
    fill: [FILL, 'fill'], fillRect: [FILL, 'fill'], fillText: [FILL, 'text'],
    stroke: [STROKE, 'stroke'], strokeRect: [STROKE, 'stroke'], strokeText: [STROKE, 'text']
  };

  /* --- the line to content.js --------------------------------------------- */
  /* A node held by both worlds and never put in the document, so the page
     sees none of the traffic. It is handed over as an event's relatedTarget. */
  const line = document.createElement('div');
  let linked = false;
  function link() {
    if (!linked) {
      try { document.dispatchEvent(new MouseEvent('fdm:canvas-hello', { relatedTarget: line })); } catch (e) { /* ignore */ }
      linked = line.getAttribute('data-ok') === '1';
    }
    return linked;
  }

  let answers = new Map();             // "role|colour" -> colour to draw with, or null
  function answer(colour, role) {
    const key = role + '|' + colour;
    if (answers.has(key)) return answers.get(key);
    if (!link()) return null;           // content.js not here yet: ask again next time
    line.setAttribute('data-q', key);
    line.removeAttribute('data-a');
    line.dispatchEvent(new Event('fdm:canvas-ask'));
    const out = line.getAttribute('data-a') || null;
    answers.set(key, out);
    return out;
  }

  /* --- the charts --------------------------------------------------------- */
  const patched = new WeakSet();
  const charts = new Set();

  function patch(canvas) {
    let ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx) return false;
    patched.add(canvas);
    for (const name of Object.keys(DRAWS)) {
      const [style, role] = DRAWS[name];
      const draw = proto[name];
      Object.defineProperty(ctx, name, {
        configurable: true, writable: true,
        value: function () {
          const was = style.get.call(this);
          const now = typeof was === 'string' ? answer(was, role) : null;
          if (!now || now === was) return draw.apply(this, arguments);
          style.set.call(this, now);
          try { return draw.apply(this, arguments); } finally { style.set.call(this, was); }
        }
      });
    }
    return true;
  }

  /* Chart.js marks its canvas with a $chartjs property, seen only here. */
  function scan() {
    const fresh = [];
    for (const cv of document.querySelectorAll('canvas')) {
      if (patched.has(cv) || !cv.$chartjs) continue;
      if (patch(cv)) { charts.add(cv); fresh.push(cv); }
    }
    for (const cv of charts) if (!cv.isConnected) charts.delete(cv);
    /* A chart found before its first frame (an animated one) needs nothing
       more; one that already drew draws again. */
    if (!document.documentElement.classList.contains('fdm-off')) fresh.filter(drawn).forEach(redraw);
  }

  /* Anything on it yet? It is copied small into a canvas of our own and that
     is read, so the chart's own bitmap is never read back. */
  let probe = null;
  function drawn(cv) {
    if (!cv.width || !cv.height) return false;
    try {
      if (!probe) {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 32;
        probe = c.getContext('2d', { willReadFrequently: true });
      }
      probe.clearRect(0, 0, 64, 32);
      probe.drawImage(cv, 0, 0, 64, 32);
      const d = probe.getImageData(0, 0, 64, 32).data;
      for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
      return false;
    } catch (e) { return true; }
  }

  /* Chart.js redraws when its box changes size, and otherwise only on hover.
     The box is made a pixel narrower until the chart has redrawn at that
     size, then given back. */
  const nudging = new WeakSet();
  function redraw(cv) {
    const box = cv.parentNode;
    if (!box || !box.style || !cv.isConnected || nudging.has(cv)) return;
    const width = box.getBoundingClientRect().width;
    if (!width) return;
    nudging.add(cv);
    const prev = box.style.getPropertyValue('width'), prio = box.style.getPropertyPriority('width');
    const w0 = cv.width;
    let timer = 0;
    const mo = new MutationObserver(() => { if (cv.width !== w0) restore(); });
    function restore() {
      mo.disconnect(); clearTimeout(timer);
      if (prev) box.style.setProperty('width', prev, prio); else box.style.removeProperty('width');
      nudging.delete(cv);
    }
    mo.observe(cv, { attributes: true, attributeFilter: ['width'] });
    timer = setTimeout(restore, 800);
    box.style.setProperty('width', (width - 1) + 'px', 'important');
  }

  /* --- printing ----------------------------------------------------------- */
  /* A print takes the canvas as it stands, and a chart cannot be made to
     redraw in time, so its pixels are put back to the colours they were drawn
     from. Edge pixels are stored with less alpha and come back a little off,
     hence the nearest match rather than an exact one. */
  const rgbOf = s => {
    const m = /^#([0-9a-f]{6})/i.exec(s);
    if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    const p = /rgba?\(([^)]+)\)/i.exec(s);
    return p ? p[1].split(/[\s,/]+/).slice(0, 3).map(Number) : null;
  };
  function toPaper() {
    const back = [];
    for (const [key, out] of answers) {
      const src = out && rgbOf(key.slice(key.indexOf('|') + 1)), dst = out && rgbOf(out);
      if (src && dst && src.join() !== dst.join()) back.push([dst, src]);
    }
    /* anything drawn during the print asks again, and is left alone */
    answers = new Map();
    if (!back.length) return;
    for (const cv of charts) {
      let ctx, img;
      try { ctx = cv.getContext('2d'); img = ctx.getImageData(0, 0, cv.width, cv.height); } catch (e) { continue; }
      const d = img.data, memo = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        if (!a) continue;
        const k = ((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) * 2 + (a < 255 ? 1 : 0);
        let src = memo.get(k);
        if (src === undefined) {
          src = null;
          let best = (a < 255 ? 24 : 2) ** 2;
          for (const [dst, s] of back) {
            const e = (dst[0] - d[i]) ** 2 + (dst[1] - d[i + 1]) ** 2 + (dst[2] - d[i + 2]) ** 2;
            if (e < best) { best = e; src = s; }
          }
          memo.set(k, src);
        }
        if (src) { d[i] = src[0]; d[i + 1] = src[1]; d[i + 2] = src[2]; }
      }
      ctx.putImageData(img, 0, 0);
    }
  }

  /* --- ChartIQ ------------------------------------------------------------ */
  /* ChartIQ reads its drawing colours from hidden probe elements once and
     keeps them, so a chart drawn before the theme changed keeps the old
     colours until told otherwise. Each engine (ChartIQ puts it on its
     container as `stx`) forgets its styles and draws again. */
  function redrawChartIQ() {
    for (const box of document.querySelectorAll('.chartContainer')) {
      const stx = box.stx;
      if (!stx || typeof stx.clearStyles !== 'function' || typeof stx.draw !== 'function') continue;
      try {
        stx.clearStyles();
        if (typeof stx.clearPixelCache === 'function') stx.clearPixelCache();
        stx.draw();
      } catch (e) { /* a chart with nothing to draw yet */ }
    }
  }

  /* --- from content.js ---------------------------------------------------- */
  document.addEventListener('fdm:canvas-scan', () => { link(); scan(); });
  /* the theme was switched, or a print is over: every chart draws afresh */
  document.addEventListener('fdm:canvas-reset', () => { answers = new Map(); scan(); charts.forEach(redraw); redrawChartIQ(); });
  /* the ACE chart's theme class was put on a container */
  document.addEventListener('fdm:canvas-ace', redrawChartIQ);
  document.addEventListener('fdm:canvas-print', () => { toPaper(); redrawChartIQ(); });
  link();
})();
