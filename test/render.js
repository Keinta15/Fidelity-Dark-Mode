/* Fidelity Dark Mode - test/render.js
 *
 * Loads the theme CSS and palette.js, recolor.js and content.js, exactly as
 * manifest.json lists them, into Chromium over the fixtures in test/, and reads
 * back computed colours and pixels. Run: node test/render.js (needs Playwright
 * with Chromium). It needs no Fidelity login and uses no account data. */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* the same files, in the same order, that the manifest injects. canvas.js
   (the page-world entry) goes first, so it has to find content.js later. */
const ENTRIES = JSON.parse(read('manifest.json')).content_scripts;
const { css: THEME } = ENTRIES[0];
const SCRIPTS = [...ENTRIES.filter(e => e.world === 'MAIN').flatMap(e => e.js), ...ENTRIES[0].js];

let checks = 0, fails = 0;
function report(ok, msg) {
  checks++; if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`);
}

/* --- color helpers, on what the browser actually reports ------------------- */
const rgb = s => {
  const m = String(s).match(/(\d+(?:\.\d+)?)/g);
  return m ? { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 } : null;
};
const chan = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
const contrast = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const sat = c => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
const parseHex = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim()); if (!m) return null; const n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 }; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  /* chrome.* stubs. storage.sync.get answers with nothing stored, so
     content.js's defaults apply and the theme comes up on. */
  await page.addInitScript(() => {
    window.chrome = {
      storage: { sync: { get: (d, cb) => cb && cb({}), set: (v, cb) => cb && cb() }, onChanged: { addListener(fn) { window.__fdmStorageChanged = fn; } } },
      runtime: {
        id: 'fdm-test',
        sendMessage(msg, cb) { cb && cb({ sheets: [] }); },
        lastError: null
      }
    };
  });

  /* Served over HTTP: the engine fetch()es same-origin .svg icons to edit
     them, and fetch() is blocked on file://. */
  const TYPES = { '.html': 'text/html', '.svg': 'image/svg+xml', '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif', '.woff2': 'font/woff2' };
  const served = new Map();     // file name -> times requested
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    const name = path.basename(urlPath) || 'fixture.html';
    served.set(name, (served.get(name) || 0) + 1);
    /* HTML is served at any depth (the base-url test), other files only from
       the root, so a url resolved against the wrong base fails as on the site. */
    if (path.extname(name) !== '.html' && path.posix.dirname(urlPath) !== '/') { res.writeHead(404); res.end(); return; }
    /* the stand-in artwork lives in test/art */
    let file = path.join(__dirname, name);
    if (!fs.existsSync(file)) file = path.join(__dirname, 'art', name);
    if (!file.startsWith(__dirname) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;

  await page.goto(origin + '/fixture.html');

  /* Bulk CSS: the observer freeze scaled with the size of the emitted sheet,
     so the fixture needs Fidelity-sized stylesheets. */
  const bulk = [];
  const HUES = ['#ffffff', '#f9f7f5', '#1d252c', '#368727', '#dc1616', '#e6e4e1', '#666666'];
  for (let i = 0; i < 14000; i++) {
    const c = HUES[i % HUES.length], d = HUES[(i + 3) % HUES.length];
    bulk.push(`.syn-${i} .syn-inner-${i} > a:hover{color:${c};background-color:${d};border-color:${c}}`);
  }
  await page.addStyleTag({ content: bulk.join('\n') });

  /* --- the page untouched -------------------------------------------------- */
  /* Captured before the theme loads, for the reversibility checks at the end. */
  const BASELINE_SEL = ['#card', '#chartBox', '#balanceLine', '#fillA', '#pieDomestic',
                        '#swDomestic', '#skeleton', '#skelBar', '#iconPrint', '#chip',
                        '#segOn', '#segOff', '#roundTile', '#colGain', '#colLoss',
                        '#heat0', '#trackA', '#ratingsBox', '#asof', '#clear'];
  const snap = sels => page.evaluate(list => {
    const out = {};
    for (const sel of list) {
      const el = document.querySelector(sel);
      if (!el) { out[sel] = null; continue; }
      const cs = getComputedStyle(el);
      /* Computed values: any write reserializes the style attribute (`#143960`
         reads back as `rgb(20, 57, 96)`) even after a perfect revert. */
      out[sel] = {
        color: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor,
        borderRight: cs.borderRightColor, borderStyle: cs.borderTopStyle,
        fill: cs.fill, stroke: cs.stroke, bgImage: cs.backgroundImage,
        shadow: cs.boxShadow, filter: cs.filter, opacity: cs.opacity,
        src: el.getAttribute('src') || ''
      };
    }
    return out;
  }, sels);
  const baseline = await snap(BASELINE_SEL);
  /* rgb() triplets the page's own style attributes already use: a theme colour
     the fixture happens to share is not left behind by the theme */
  const ownInline = await page.evaluate(() => {
    const seen = new Set();
    for (const el of document.querySelectorAll('[style]')) {
      for (let i = 0; i < el.style.length; i++) {
        /* read through the CSSOM, which serializes #ffffff as rgb(255, 255, 255) */
        for (const m of el.style.getPropertyValue(el.style[i]).matchAll(/rgba?\((\d+), (\d+), (\d+)/g)) seen.add(m[1] + ', ' + m[2] + ', ' + m[3]);
      }
    }
    return [...seen];
  });

  /* Every element in the body, marked by 'tag' with an expando (an attribute
     would be a change) and found again by 'tag-kept'; 'index' pairs two fresh
     pages by document order. */
  const SNAP_PROPS = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderBottomColor',
                      'fill', 'stroke', 'filter', 'boxShadow', 'outlineColor', 'outlineStyle', 'opacity',
                      'textShadow', 'webkitTextFillColor', 'colorScheme'];
  const snapAll = (pg, mode) => pg.evaluate(({ mode, PROPS }) => {
    const out = {};
    let i = 0;
    for (const el of document.body.querySelectorAll('*')) {
      if (mode === 'tag') el.__fdmSnap = i;
      const id = mode === 'index' ? i : el.__fdmSnap;
      i++;
      if (id === undefined) continue;
      const cs = getComputedStyle(el);
      /* skip opacity on an animating element: its animation may move it */
      const moving = cs.animationName !== 'none';
      out[id] = { el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
                  v: PROPS.filter(p => !(moving && p === 'opacity')).map(p => p + ':' + cs[p]).join('; ') +
                     (el.tagName === 'IMG' ? '; src:' + (el.getAttribute('src') || '').slice(0, 60) : '') };
    }
    return out;
  }, { mode, PROPS: SNAP_PROPS });
  const diffSnaps = (a, b) => {
    const out = [];
    for (const id of Object.keys(a)) {
      if (!b[id] || a[id].v === b[id].v) continue;
      const pa = a[id].v.split('; '), pb = b[id].v.split('; ');
      out.push(a[id].el + ' ' + pa.filter((x, k) => x !== pb[k]).map((x, k) => x + ' -> ' + (pb[pa.indexOf(x)] || '?').split(':').slice(1).join(':')).join(', '));
    }
    return out;
  };
  const fullBase = await snapAll(page, 'tag');

  /* Theme CSS, marked data-fidelity-dark so the engine skips it: unlike a
     content-script sheet, a <style> tag shows in document.styleSheets. */
  for (const f of THEME) {
    const h = await page.addStyleTag({ content: read(f) });
    await h.evaluate(n => { n.dataset.fidelityDark = 'theme'; });
  }
  // then the engine
  for (const f of SCRIPTS) {
    await page.addScriptTag({ content: read(f) });
  }
  /* content.js runs another full pass at 1500ms, contrast backstop last;
     2200ms reads after it rather than during it. */
  await page.waitForTimeout(2200);

  const q = sel => page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const be = getComputedStyle(el, '::before');
    return {
      color: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor,
      fill: cs.fill, stroke: cs.stroke, bgImage: cs.backgroundImage,
      radius: cs.borderTopLeftRadius,
      beforeBgImage: be.backgroundImage,
      styleAttr: el.getAttribute('style') || ''
    };
  }, sel);

  /* Pixels read off a screenshot of an element, for what computed style
     cannot report (a range input's track). Points are fractions of its box. */
  const pixels = async (sel, pts) => {
    const el = await page.$(sel);
    if (!el) return [];
    const buf = await el.screenshot();
    return page.evaluate(async ({ b64, pts }) => {
      const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
      const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
      return pts.map(([fx, fy]) => [...ctx.getImageData(Math.min(cv.width - 1, Math.round(fx * cv.width)),
        Math.min(cv.height - 1, Math.round(fy * cv.height)), 1, 1).data].slice(0, 3));
    }, { b64: buf.toString('base64'), pts });
  };

  console.log('\nthe veil comes down');
  {
    const cls = await page.evaluate(() => document.documentElement.className);
    report(!/fdm-boot/.test(cls), `boot veil lifted after the first pass (html class: "${cls || 'none'}")`);
  }

  console.log('\ntokens: card ink is ink, not a surface');
  {
    const card = await q('#card');
    const asof = await q('#asof');
    const clear = await q('#clear');
    const cardBg = rgb(card.bg);
    for (const [name, got] of [['card', card.color], ['as-of', asof.color], ['Clear Filters', clear.color]]) {
      const c = rgb(got);
      const cr = contrast(c, cardBg);
      report(cr >= 4.5, `${name} text ${hex(c)} on card ${hex(cardBg)} = ${cr.toFixed(2)}:1`);
    }
    report(lum(cardBg) < 0.06, `the card itself is dark (${hex(cardBg)})`);
  }

  console.log('\nthe skeleton never paints light');
  {
    const sk = await q('#skeleton');
    const bar = await q('#skeleton .bar');
    report(lum(rgb(sk.bg)) < 0.08, `skeleton card ${hex(rgb(sk.bg))} is dark`);
    const bg = bar.bgImage || '';
    const light = (bg.match(/rgb\(\s*2[0-9]{2}/g) || []).length;
    report(light === 0, `shimmer gradient carries no near-white stop (${bg.slice(0, 54) || 'none'}…)`);
  }

  console.log('\nsort arrows: artwork replaced, not filtered');
  {
    const none = await q('#sortNone');
    const asc = await q('#sortAsc');
    report(/data:image\/svg/.test(none.beforeBgImage), 'unsorted arrow is served from an inlined data URI');
    report(/data:image\/svg/.test(asc.beforeBgImage), 'ascending arrow is served from an inlined data URI');
    report(!/sort_unsorting\.svg/.test(none.beforeBgImage), 'the black original is no longer referenced');
    const fillMatch = decodeURIComponent(none.beforeBgImage).match(/fill=['"]?(#[0-9A-Fa-f]{6})/);
    report(!!fillMatch && lum(rgb(
      'rgb(' + [1, 3, 5].map(i => parseInt(fillMatch[1].slice(i, i + 2), 16)).join(',') + ')'
    )) > 0.1, `the replacement carries a light fill (${fillMatch ? fillMatch[1] : 'none'})`);
  }

  console.log('\nchart marks: six categories stay six colors');
  {
    const ids = ['pieDomestic', 'pieForeign', 'pieBonds', 'pieShort', 'pieOther', 'pieUnknown'];
    const seen = [];
    for (const id of ids) {
      const el = await q('#' + id);
      const c = rgb(el.fill);
      seen.push(hex(c));
      report(sat(c) > 30, `${id} keeps its hue (${hex(c)}, chroma spread ${sat(c)})`);
    }
    report(new Set(seen).size === ids.length, `all six remain distinct (${new Set(seen).size}/6)`);
    const mud = seen.filter(h => {
      const c = rgb('rgb(' + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',') + ')');
      return sat(c) < 30;
    });
    report(mud.length === 0, `none collapsed into grey (${mud.length} muddy)`);
  }

  console.log('\nchart marks: gain and loss agree with the figures above them');
  {
    const g = rgb((await q('#colGain')).fill);
    const l = rgb((await q('#colLoss')).fill);
    report(g.g > g.r && g.g > g.b, `gain column reads green (${hex(g)})`);
    report(l.r > l.g && l.r > l.b, `loss column reads red (${hex(l)})`);
    const line = rgb((await q('#balanceLine')).stroke);
    report(lum(line) > 0.5, `the balance line, drawn stroke="black", comes out bright (${hex(line)})`);
    const kb = rgb(await page.evaluate(() => getComputedStyle(document.getElementById('keyBalance')).borderTopColor));
    report(kb && lum(kb) > 0.5 && Math.abs(lum(kb) - lum(line)) < 0.05, `the line-shaped key for that line is the line's colour (${kb ? hex(kb) : '?'} vs ${hex(line)})`);
    const kn = rgb(await page.evaluate(() => getComputedStyle(document.getElementById('keyNotInvested')).borderTopColor));
    report(kn && hex(kn) !== '#C293F9' && kn.b > kn.g + 40, `  and the dotted lilac key goes through the series map, as its line does (${kn ? hex(kn) : '?'})`);
    /* the gain/loss key dots: classless divs with an inline background */
    const kg = rgb(await page.evaluate(() => getComputedStyle(document.getElementById('keyGain')).backgroundColor));
    const kl = rgb(await page.evaluate(() => getComputedStyle(document.getElementById('keyLoss')).backgroundColor));
    report(kg && hex(kg) === hex(g), `the gain key dot is the gain column's colour (${kg ? hex(kg) : '?'} vs ${hex(g)})`);
    report(kl && hex(kl) === hex(l), `the loss key dot is the loss column's colour (${kl ? hex(kl) : '?'} vs ${hex(l)})`);
  }

  console.log('\nchart marks: the heatmap stays a scale');
  {
    const out = [];
    for (const id of ['heat0', 'heat1', 'heat2', 'heat3']) out.push(rgb((await q('#' + id)).fill));
    let mono = true;
    for (let i = 1; i < out.length; i++) if (lum(out[i]) < lum(out[i - 1]) - 1e-6) mono = false;
    report(mono, `four stops stay ordered (${out.map(hex).join(' → ')})`);
    const ink = rgb('rgb(255, 255, 255)');   // --fdm-text, the heatmap's label ink
    const worst = Math.min(...out.map(c => contrast(ink, c)));
    report(worst >= 4.5, `a printed cell value reads on every step (worst ${worst.toFixed(2)}:1)`);
  }

  console.log('\nthe allocation key agrees with the wedges');
  {
    for (const [sw, wedge] of [['#swDomestic', '#pieDomestic'], ['#swForeign', '#pieForeign'], ['#swBonds', '#pieBonds']]) {
      const s = rgb((await q(sw)).bg);
      const w = rgb((await q(wedge)).fill);
      report(hex(s) === hex(w), `${sw} ${hex(s)} matches its wedge ${hex(w)}`);
    }
    /* the summary card's key: 12px blocks with their colour inline */
    for (const [sw, wedge] of [['#blkDomestic', '#pieDomestic'], ['#blkBonds', '#pieBonds'], ['#blkOther', '#pieOther']]) {
      const s = rgb((await q(sw)).bg);
      const w = rgb((await q(wedge)).fill);
      report(hex(s) === hex(w), `${sw} ${hex(s)} matches its wedge ${hex(w)}, as a key, not as a surface`);
    }
  }

  console.log('\na selected chip states itself without shouting');
  {
    const chip = await q('#chip');
    const bg = rgb(chip.bg), fg = rgb(chip.color);
    report(lum(bg) < 0.12, `the fill is a raised surface, not a slab of brand green (${hex(bg)})`);
    report(contrast(fg, bg) >= 4.5, `its label reads at ${contrast(fg, bg).toFixed(2)}:1`);
    report(sat(rgb(chip.border)) > 20, `the edge carries the color instead (${hex(rgb(chip.border))})`);

    /* its text and icon too: a more specific descendant rule can darken them */
    for (const [sel, what] of [['#chipText', 'its label text'], ['#chipIcon', 'its check mark']]) {
      const c = rgb((await q(sel)).color);
      report(contrast(c, bg) >= 4.5, `${what} reads too, at ${contrast(c, bg).toFixed(2)}:1 (${hex(c)})`);
    }
  }

  console.log('\nwhite in a chart is a track, not a mark');
  {
    const a = rgb((await q('#trackA')).fill);
    const b = rgb((await q('#trackB')).fill);
    const fill = rgb((await q('#fillA')).fill);
    report(lum(a) < 0.06, `the bar track lands on a surface, not ink (${hex(a)})`);
    report(hex(a) === hex(b), 'both tracks agree');
    report(contrast(fill, a) >= 3, `the filled part still reads against it (${hex(fill)}, ${contrast(fill, a).toFixed(2)}:1)`);
    /* a bar-sized chart's grey background is its track; a full-size chart's
       grey background is a backdrop, and stays out of the way */
    const track = rgb((await q('#sectorTrack')).fill), big = (await q('#bigBackground')).fill;
    const sectorFill = rgb((await q('#sectorFill')).fill);
    report(hex(track) === '#403F3E', `a bar-sized chart's grey background is the unfilled bar and takes the track surface (${hex(track)})`);
    report(contrast(sectorFill, track) >= 2.5, `  and its filled part reads against it (${hex(sectorFill)}, ${contrast(sectorFill, track).toFixed(2)}:1)`);
    report(big === 'rgba(0, 0, 0, 0)', `  while a full-size chart's grey background stays see-through on the card (${big})`);
  }

  console.log('\na segmented control states its choice quietly');
  {
    const on = await q('#segOn');
    const bg = rgb(on.bg), fg = rgb(on.color);
    report(lum(bg) < 0.12, `the chosen segment is a raised surface, not a green slab (${hex(bg)})`);
    report(contrast(fg, bg) >= 4.5, `its label reads at ${contrast(fg, bg).toFixed(2)}:1`);
    const off = await q('#segOff');
    report(lum(rgb(off.border)) < 0.35, `the unchosen segment's edge is a hairline, not full ink (${hex(rgb(off.border))})`);
  }

  console.log('\nplaceholders are found by shape, not by name');
  {
    const bar = rgb((await q('#skelBar')).bg);
    report(lum(bar) < 0.08, `a light box with no text in it is dimmed (${hex(bar)})`);
    const shine = (await q('#skelShine')).bgImage || '';
    const bright = (shine.match(/rgb\(\s*2[0-4][0-9]|rgb\(\s*25[0-5]/g) || []).length;
    report(bright === 0, `and its shimmer carries no bright stop (${shine.slice(0, 58)}…)`);

    /* A box that loads empty and fills later (the Net worth page's summary
       band): dimmed as a skeleton first, then given back once it has content,
       or the placeholder grey would sit under the figures. */
    /* Its sheet comes from another origin (the engine cannot read it, and
       the test's worker stub hands nothing back), so the band is still light
       when the pass meets it, as a skeleton whose sheet has not landed is. */
    await page.evaluate(() => {
      const link = document.createElement('link');
      link.id = 'lateBandStyle'; link.rel = 'stylesheet';
      link.href = location.protocol + '//localhost:' + location.port + '/late_band.css';
      document.head.appendChild(link);
      return new Promise(r => { link.onload = r; link.onerror = r; setTimeout(r, 1500); });
    });
    await page.evaluate(() => {
      const band = document.createElement('div');
      band.id = 'lateBand'; band.className = 'late-band';
      document.querySelector('#card').appendChild(band);
    });
    await page.waitForTimeout(700);
    const dimmed = await page.evaluate(() => { const el = document.getElementById('lateBand'); return { inline: el.style.getPropertyValue('background-color'), bg: getComputedStyle(el).backgroundColor }; });
    report(dimmed.inline === 'rgb(47, 47, 47)', `an empty light band is dimmed as a skeleton while it loads (${dimmed.inline})`);
    await page.evaluate(() => {
      const band = document.getElementById('lateBand');
      band.classList.add('loaded');
      const p = document.createElement('p'); p.id = 'lateBandText'; p.textContent = 'Net worth $524,146.91';
      band.appendChild(p);
    });
    await page.waitForTimeout(1000);
    const filled = await page.evaluate(() => { const el = document.getElementById('lateBand'); return { inline: el.style.getPropertyValue('background-color'), bg: getComputedStyle(el).backgroundColor }; });
    report(filled.inline === '' && filled.bg !== 'rgb(47, 47, 47)',
      `  and given back once it holds content, so the placeholder grey is not under the figures (inline "${filled.inline}", ${filled.bg})`);
    await page.evaluate(() => { document.getElementById('lateBandStyle').remove(); document.getElementById('lateBand').remove(); });
  }

  console.log('\na layout wrapper does not become a second surface');
  {
    const wrap = await q('#sqWrapper');
    const tile = await q('#roundTile');
    const wb = rgb(wrap.bg), tb = rgb(tile.bg);
    report(wb.a === 0 || Math.abs(lum(wb) - lum(tb)) < 0.001,
      `the square wrapper does not paint a corner outside the rounded card (${wrap.bg})`);
    report(lum(tb) < 0.06, `and the card itself is still a card (${hex(tb)})`);
  }

  /* --- icons --------------------------------------------------------------- */
  /* Most of Fidelity's small icons are background images, out of `fill`'s
     reach and drawn with no fill attribute (so black): the pass edits them. */
  console.log('\nicons: artwork edited, not merely recolored around');
  {
    for (const [sel, label] of [['#iconPrint', 'a filled .svg with no fill attribute'],
                                ['#iconChevron', 'a stroked .svg drawn in currentColor'],
                                ['#iconInline', 'an icon inlined as a data: URI']]) {
      const el = await q(sel);
      const bg = el.bgImage || '';
      const isData = /data:image\/svg/.test(bg);
      if (!isData) { report(false, `${label}: still serving the original (${bg.slice(0, 40)})`); continue; }
      const svg = decodeURIComponent(bg);
      // either an explicit light fill, or the injected default for bare shapes
      const lightFill = /(?:fill|stroke)=['"]?#([0-9A-Fa-f]{6})/.exec(svg);
      const hasDefault = svg.includes(':not([fill])') || svg.includes('svg{color:');
      let ok = hasDefault;
      if (!ok && lightFill) {
        const c = rgb('rgb(' + [0, 2, 4].map(i => parseInt(lightFill[1].slice(i, i + 2), 16)).join(',') + ')');
        ok = lum(c) > 0.1;
      }
      report(ok, `${label}: re-served with light artwork`);
    }
    /* A toggle image: its stroked white knob is a drawn object, not a plate */
    const tog = await page.evaluate(() => { const img = document.querySelector('#helpToggleImg'); const src = img.currentSrc || img.src; const svg = /^data:/.test(src) ? decodeURIComponent(src.split(',')[1] || '') : ''; return { knob: (svg.match(/<circle[^>]*fill=["']([^"']*)["']/) || [])[1] || '', track: (svg.match(/<path[^>]*fill=["']([^"']*)["']/) || [])[1] || '' }; });
    report(/^#f{6}$/i.test(tog.knob), `a toggle image keeps its white knob as ink (knob fill ${tog.knob || 'missing'})`);
    report(tog.track && tog.track.toLowerCase() !== tog.knob.toLowerCase() && tog.track !== 'none', `  on a track that is neither the knob nor nothing (${tog.track || 'missing'})`);
  }

  console.log('\nan outline icon stays an outline');
  {
    const path = await q('#strokePath');
    report(path.fill === 'none', `its shape is not filled in (fill: ${path.fill})`);
    const st = rgb(path.stroke);
    report(st && lum(st) > 0.15, `and its stroke is lifted out of near-black (${st ? hex(st) : path.stroke})`);
  }

  console.log('\na sprite symbol is edited, not merely styled');
  {
    /* Chrome paints a <use> clone from the symbol's presentation attributes,
       not from CSS on the symbol, so the attribute must carry the theme value. */
    const sp = await page.evaluate(() => {
      /* asRgb reads an attribute's hex as the browser does, to compare it
         with computed values */
      const asRgb = v => { const d = document.createElement('i'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const info = document.getElementById('fxInfoPath');
      const solid = document.getElementById('fxSolidPath');
      const link = getComputedStyle(document.documentElement).getPropertyValue('--fdm-link').trim();
      return {
        infoAttr: info.getAttribute('stroke') || '', infoRgb: asRgb(info.getAttribute('stroke') || ''),
        infoComputed: getComputedStyle(info).stroke, link: asRgb(link),
        solidAttr: solid.getAttribute('fill') || '', solidRgb: asRgb(solid.getAttribute('fill') || ''),
        solidComputed: getComputedStyle(solid).fill
      };
    });
    const ia = rgb(sp.infoRgb), ic = rgb(sp.infoComputed);
    report(ia && ic && hex(ia) === hex(ic), `the info symbol's stroke attribute carries what the theme resolved (attr ${sp.infoAttr}, computed ${ic ? hex(ic) : sp.infoComputed})`);
    report(ia && hex(ia) !== '#1D3986' && lum(ia) > 0.3, `  and it is no longer the light-mode navy (${sp.infoAttr})`);
    const lk = rgb(sp.link);
    report(ia && lk && hex(ia) === hex(lk), `  it is the theme's link colour (${lk ? hex(lk) : sp.link})`);
    const sa = rgb(sp.solidRgb);
    report(sa && lum(sa) > 0.5, `a solid #141414 glyph in a sprite becomes ink in the attribute (${sp.solidAttr})`);
  }

  console.log('\nthe trade ticket: chevrons, the Shares segment, a raster wordmark');
  {
    /* The select chevron is two painted borders on a rotated square, inside
       a `.dropdown` wrapper that the popover caret rule also reaches. */
    const arrow = await q('#ticketArrow');
    const arrowExtra = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('ticketArrow')); return { right: c.borderRightColor, bottom: c.borderBottomColor }; });
    const card = rgb((await q('#ticket')).bg);
    report(rgb(arrow.bg) && rgb(arrow.bg).a === 0, `the select chevron paints no field of its own (${arrow.bg})`);
    const ar = rgb(arrowExtra.right);
    report(ar && contrast(ar, card) >= 4.5, `  and its two lines read on the card at ${ar ? contrast(ar, card).toFixed(2) : '?'}:1 (${ar ? hex(ar) : arrowExtra.right})`);
    report(arrowExtra.right === arrowExtra.bottom, `  both lines the same colour`);

    /* The Shares trigger has role="listbox" but is a flat segment of the
       Quantity box, not a popup. */
    const qt = await q('#qtyType');
    const outline = await q('#qtyOutline');
    report(rgb(qt.bg) && rgb(qt.bg).a === 0, `the Shares segment paints nothing over the Quantity box (${qt.bg})`);
    const qtShadow = await page.evaluate(() => getComputedStyle(document.getElementById('qtyType')).boxShadow);
    report(qtShadow === 'none', `  and carries no popover shadow (${qtShadow})`);
    const dv = rgb((await q('#qtyDivider')).bg);
    const ob = rgb(outline.bg);
    report(dv && ob && contrast(dv, ob) >= 1.8, `  the divider between Quantity and Shares is visible on the box (${dv ? hex(dv) : '?'} on ${ob ? hex(ob) : '?'}, ${dv && ob ? contrast(dv, ob).toFixed(2) : '?'}:1)`);
    const opt = await q('#qtyOptions');
    report(rgb(opt.bg) && lum(rgb(opt.bg)) > lum(ob) && rgb(opt.bg).a === 1, `  while the options list that drops from it is a lifted layer (${opt.bg})`);

    await page.focus('#ticketSelect');
    const fs = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('ticketSelect')); return { outline: c.outlineColor + ' ' + c.outlineWidth + ' ' + c.outlineStyle, shadow: c.boxShadow }; });
    report(fs.shadow === 'none', `a focused ticket field drops the site's black shadow ring (${fs.shadow})`);
    report(/solid/.test(fs.outline) && !/0px/.test(fs.outline), `  and wears the theme's ring instead (${fs.outline})`);

    /* A raster wordmark with a white knockout: the filter lands the knockout
       on the card it sits on. */
    const fl = await page.evaluate(() => getComputedStyle(document.getElementById('rasterLogo')).filter);
    const m = /invert\(1\) contrast\(([\d.]+)\) brightness\(([\d.]+)\)/.exec(fl);
    report(!!m, `the footer wordmark is inverted for the dark page (${fl})`);
    if (m) {
      const c = +m[1], k = +m[2];
      const knock = k * (0.5 - 0.5 * c);            // where pure white lands after the chain
      const cardLvl = (card.r + card.g + card.b) / 3 / 255;
      report(Math.abs(knock - cardLvl) < 0.03, `  its white knockout lands on the card it sits on (${(knock * 255).toFixed(0)} vs card ${(cardLvl * 255).toFixed(0)})`);
      const glyph = k * c + k * (0.5 - 0.5 * c);      // where pure black lands
      report(glyph > 0.55, `  and its black wordmark lands as ink (${(glyph * 255).toFixed(0)})`);
    }
    /* The real footer's colour comes from a sheet harvested after the icon
       pass, so a later full pass re-aims the filter. Here the mark moves onto
       the page and a late <style> triggers that pass. */
    await page.evaluate(() => {
      document.body.appendChild(document.getElementById('rasterLogo'));
      const st = document.createElement('style');
      st.textContent = '#ticketFooter { padding-bottom: 13px; }';
      document.head.appendChild(st);
    });
    await page.waitForTimeout(1800);
    const again = await page.evaluate(() => ({ filter: getComputedStyle(document.getElementById('rasterLogo')).filter, bg: getComputedStyle(document.body).backgroundColor }));
    const m2 = /invert\(1\) contrast\(([\d.]+)\) brightness\(([\d.]+)\)/.exec(again.filter);
    const fb = rgb(again.bg);
    if (m2 && fb) {
      const knock2 = +m2[2] * (0.5 - 0.5 * +m2[1]);
      const lvl2 = (fb.r + fb.g + fb.b) / 3 / 255;
      report(Math.abs(knock2 - lvl2) < 0.03, `  when the surface under it moves, the filter is re-aimed (${(knock2 * 255).toFixed(0)} vs footer ${(lvl2 * 255).toFixed(0)})`);
    } else {
      report(false, `  when the surface under it moves, the filter is re-aimed (${again.filter} on ${again.bg})`);
    }

    /* Fund research's footer logo, here a stand-in: a black SVG with white
       knockouts, filtered, never edited. */
    for (let t = 0; t < 30; t++) {
      if (await page.evaluate(() => getComputedStyle(document.getElementById('pgLogo')).filter !== 'none')) break;
      await page.waitForTimeout(100);
    }
    const pg = await page.evaluate(() => {
      const el = document.getElementById('pgLogo');
      let bg = null;
      for (let e = el; e && !bg; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)/.test(c)) bg = c;
      }
      return { filter: getComputedStyle(el).filter, img: getComputedStyle(el).backgroundImage.slice(0, 30), bg: bg || getComputedStyle(document.body).backgroundColor };
    });
    const pm = /invert\(1\) contrast\(([\d.]+)\) brightness\(([\d.]+)\)/.exec(pg.filter);
    report(!!pm, `a black SVG logo in the footer is inverted, not left black (${pg.filter})`);
    if (pm) {
      const c = +pm[1], k = +pm[2];
      const black = Math.min(1, k * c + k * (0.5 - 0.5 * c));
      const white = k * (0.5 - 0.5 * c);
      const under = rgb(pg.bg), lvl = (under.r + under.g + under.b) / 3 / 255;
      report(black >= 0.98, `  its black mark lands white, as the app draws its wordmark (${(black * 255).toFixed(0)})`);
      report(Math.abs(white - lvl) < 0.03, `  and its white rays land on the page behind it (${(white * 255).toFixed(0)} vs ${(lvl * 255).toFixed(0)})`);
    }
    report(/^url\("data:image\/svg\+xml;base64/.test(pg.img), `  the brand artwork itself is not rewritten (${pg.img})`);

    /* the retirement-score gauge */
    for (let t = 0; t < 30; t++) {
      if (await page.evaluate(() => /^data:/.test(document.getElementById('retireGauge').getAttribute('src')))) break;
      await page.waitForTimeout(100);
    }
    const gauge = await page.evaluate(() => {
      const src = document.getElementById('retireGauge').getAttribute('src');
      const text = /^data:/.test(src) ? decodeURIComponent(src.split(',')[1]) : '';
      return { edited: !!text, label: (text.match(/<text[^>]*fill="([^"]+)"/) || [])[1],
               strokes: [...new Set((text.match(/stroke="([^"]+)"/g) || []).map(x => x.slice(8, -1).toLowerCase()))],
               card: getComputedStyle(document.getElementById('gaugeCard')).backgroundColor };
    });
    const gCard = rgb(gauge.card);
    report(gauge.edited && gauge.label && contrast(parseHex(gauge.label) || rgb(gauge.label), gCard) >= 4.5,
      `a 200px gauge drawn for a white page has its "??" lifted to ink (${gauge.label || 'not edited'})`);
    report(gauge.strokes.length === 1 && gauge.strokes[0] === hex(gCard).toLowerCase(),
      `  and its white separators become the card it sits on, not a white rim (${gauge.strokes.join(', ')} on ${hex(gCard)})`);

    const rb = rgb((await q('#rewardsBar')).bg);
    report(rb && lum(rb) < 0.05 && contrast({ r: 255, g: 255, b: 255 }, rb) >= 7,
      `the Fidelity Rewards top bar is the app's dark header under its white wordmark (${rb ? hex(rb) : '?'})`);
  }

  console.log('\nthe Assistant panel: one box, one ring, solid dots');
  {
    const wrap = await q('#vaWrap');
    const ta = await q('#vaInput');
    report(rgb(ta.bg) && rgb(ta.bg).a === 0, `the question field paints nothing inside its box (${ta.bg})`);
    const wb = rgb(wrap.bg);
    report(wb && wb.a === 1 && lum(wb) < 0.06, `  the box is the control's one surface (${wrap.bg})`);
    await page.focus('#vaInput');
    const f = await page.evaluate(() => { const w = getComputedStyle(document.getElementById('vaWrap')); const t = getComputedStyle(document.getElementById('vaInput')); return { wrapShadow: w.boxShadow, taOutline: t.outlineStyle + ' ' + t.outlineWidth, taShadow: t.boxShadow }; });
    report(f.taOutline === 'none 0px' && f.taShadow === 'none', `  focus draws no ring on the textarea itself (${f.taOutline}, ${f.taShadow})`);
    const ring = rgb(f.wrapShadow);
    report(ring && lum(ring) > 0.6 && /0px 0px 0px 2px/.test(f.wrapShadow), `  the box wears the ring, 2px and light (${f.wrapShadow})`);
    /* The menu dots: spans with an inline black fill and border, a glyph
       drawn with background-color, so they map as ink. */
    const dot = await q('#vaDot1');
    const db = rgb(dot.bg), dbd = rgb(dot.border);
    report(db && lum(db) > 0.5, `a 6px inline-black dot inside a button is mapped as ink (${dot.bg})`);
    report(dbd && lum(dbd) > 0.5, `  and so is its border (${dot.border})`);
    /* The real panel builds its dots while closed, so the first look finds
       no layout box. The declared size has to do. */
    await page.evaluate(() => { document.getElementById('vaMenuHidden').style.display = 'grid'; });
    await page.waitForTimeout(300);
    const hid = await q('#vaDotHidden');
    const hb = rgb(hid.bg);
    report(hb && lum(hb) > 0.5, `  a dot first seen while its panel was closed is ink once shown (${hid.bg})`);
  }

  console.log('\na CTA label wears no shadow');
  {
    /* `.generic-button a` gets a text-shadow that a later rule turns off;
       re-emitted !important, the shadow must not win. */
    const sh = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('ctaShadow')); return { shadow: c.textShadow, color: c.color, bg: c.backgroundColor }; });
    report(sh.shadow === 'none', `the re-emitted shadow on the CTA label is off again (${sh.shadow})`);
    const ink = rgb(sh.color), fill = rgb(sh.bg);
    report(ink && fill && contrast(ink, fill) >= 4.5, `  and its label still reads on the fill at ${ink && fill ? contrast(ink, fill).toFixed(2) : '?'}:1`);
  }

  console.log('\nthe prospect header: a white glyph is the icon, not a plate');
  {
    const glyph = await page.evaluate(() => {
      const bg = getComputedStyle(document.getElementById('supportIcon')).backgroundImage;
      /* The quoted form, read to its closing quote: an encoded SVG keeps its
         parentheses raw, so a pattern that stops at ")" cuts it short. */
      const m = /^url\("(data:[\s\S]*)"\)$/.exec(bg) || /^url\((data:[^)]*)\)$/.exec(bg);
      if (!m) return { bg: bg.slice(0, 40), svg: '' };
      const uri = m[1];
      const comma = uri.indexOf(',');
      const meta = uri.slice(0, comma), body = uri.slice(comma + 1);
      let svg = '';
      try { svg = /base64/.test(meta) ? atob(body) : decodeURIComponent(body); } catch (e) { svg = ''; }
      return { bg: bg.slice(0, 40), svg };
    });
    const whitePaths = (glyph.svg.match(/<path[^>]*fill="white"/g) || []).length;
    report(whitePaths === 2, `the Customer Support glyph keeps both white paths (${whitePaths} of 2)`);
    const bar = rgb((await q('#prospectBar')).bg);
    report(bar && lum(bar) < 0.06, `  on the dark bar (${bar ? hex(bar) : '?'})`);
    await page.hover('#supportIcon');
    await page.waitForTimeout(150);
    const hov = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('supportIcon')); const t = getComputedStyle(document.querySelector('#supportIcon > span')); return { bg: c.backgroundColor, outline: c.outlineColor, tipBg: t.backgroundColor, tipColor: t.color }; });
    const hb = rgb(hov.bg);
    report(hb && sat(hb) < 20 && lum(hb) > lum(bar), `  hovered, the disc is a lifted neutral, not a green circle (${hov.bg})`);
    const ol = rgb(hov.outline);
    report(ol && lum(ol) > 0.8, `  and keeps its white ring (${hov.outline})`);
    const tb = rgb(hov.tipBg), tc = rgb(hov.tipColor);
    report(tb && tc && contrast(tc, tb) >= 4.5 && lum(tb) < 0.06, `  its label chip reads at ${tb && tc ? contrast(tc, tb).toFixed(2) : '?'}:1 (${hov.tipBg})`);
    await page.mouse.move(0, 0);
  }

  console.log('\nthe legacy header keeps its logo, on the dark bar');
  {
    /* `.pgnb a { background: transparent }` reads back as eight longhands,
       the unwritten ones "initial"; re-emitted !important, background-image
       would beat `.pgnb .pnlogout`, which draws the logo. */
    const lg = await page.evaluate(() => getComputedStyle(document.getElementById('legacyLogo')).backgroundImage);
    report(/^url\(/.test(lg), `the logo's background image survives a shorthand on every link (${lg.slice(0, 30)})`);
    const bar = rgb((await q('#legacyBar')).bg);
    report(bar && lum(bar) < 0.06 && sat(bar) < 20, `  and the bar is the app's dark bar, not lime (${bar ? hex(bar) : '?'})`);
  }

  console.log('\na checked-but-locked checkbox reads as locked');
  {
    const w = await q('#lockedWrap');
    const tick = await page.evaluate(() => getComputedStyle(document.getElementById('lockedTick')).fill);
    const wb = rgb(w.bg), tk = rgb(tick);
    report(wb && sat(wb) < 20 && lum(wb) < 0.1, `its box is a filled grey, not the live green (${w.bg})`);
    report(wb && tk && contrast(tk, wb) >= 4.5, `  and its tick reads on it at ${wb && tk ? contrast(tk, wb).toFixed(2) : '?'}:1 (${tick})`);
  }

  /* A GIF has no partial alpha: an icon anti-aliased against white has pale
     opaque edge pixels, a speckled outline on a dark page. */
  console.log('\na GIF icon edged against white loses the white edge');
  {
    for (let t = 0; t < 30; t++) {
      if (await page.evaluate(() => /^data:image\/png/.test(document.getElementById('searchMatte').getAttribute('src') || ''))) break;
      await page.waitForTimeout(100);
    }
    const m = await page.evaluate(async () => {
      const el = document.getElementById('searchMatte');
      const src = el.getAttribute('src') || '';
      if (!/^data:image\/png/.test(src)) return { src: src.slice(0, 40) };
      const im = new Image(); im.src = src; await im.decode();
      const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const inks = new Set(); let partial = 0, solid = 0, paleSolid = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        inks.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
        if (d[i + 3] < 250) partial++; else solid++;
        if (d[i + 3] >= 250 && d[i] > 200) paleSolid++;
      }
      return { src: src.slice(0, 30), w: cv.width, inks: [...inks], partial, solid, paleSolid,
               card: getComputedStyle(el.closest('.fds-card__card')).backgroundColor };
    });
    report(/^data:image\/png/.test(m.src) && m.w === 15, `the magnifier is redrawn at its own size (${m.src})`);
    /* one grey, give or take the rounding a canvas does on a faint pixel */
    const spread = m.inks ? Math.max(...[0, 1, 2].map(c => {
      const v = m.inks.map(s => +s.split(',')[c]);
      return Math.max(...v) - Math.min(...v);
    })) : 99;
    report(m.inks && spread <= 6 && m.paleSolid === 0, `  in one grey, with no pale pixel left in it (${m.inks ? m.inks.length + ' shades within ' + spread : '?'})`);
    report(m.partial > 10 && m.solid > 10, `  its edge carried as coverage instead, so it stays smooth (${m.partial} soft, ${m.solid} solid)`);
    const ink = m.inks && rgb('rgb(' + m.inks[0] + ')'), card = rgb(m.card);
    report(ink && card && contrast(ink, card) >= 3, `  and its grey reads on the card (${ink ? hex(ink) : '?'}, ${ink && card ? contrast(ink, card).toFixed(2) : '?'}:1)`);
  }

  console.log('\nthe ACE chart takes Fidelity\'s own dark theme, restated in the palette');
  {
    const ace = await page.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      const box = cs('aceBox');
      const stx = document.getElementById('aceContainer').stx;
      return {
        themed: document.getElementById('aceBox').classList.contains('fidchart-theme-dark'),
        filter: box.filter,
        bgToken: box.getPropertyValue('--fidchart-background-color').trim(),
        tail: box.getPropertyValue('--fidchart-chart-koi-100').trim(),
        tailFilter: box.getPropertyValue('--fidchart-accent-blueberry-filter').trim(),
        grid: cs('aceGrid').color, yaxis: cs('aceYaxis').color, candle: cs('aceCandle').color,
        plot: cs('aceContainer').backgroundColor,
        swatch: cs('aceSwatch').backgroundColor,
        icon: cs('aceIcon').filter, iconBorder: cs('aceIcon').borderTopColor, iconOn: cs('aceIconOn').filter,
        save: cs('aceSave').backgroundColor, saveInk: cs('aceSave').color,
        toolbar: cs('aceToolbar').backgroundColor, toolbarBorder: cs('aceToolbar').borderTopColor,
        delta: cs('aceDelta').color, link: cs('aceLink').color, name: cs('aceName').color,
        cleared: stx.cleared, drawn: stx.drawn
      };
    });
    report(ace.themed && ace.filter === 'none', `the container carries fidchart-theme-dark and nothing is inverted (filter ${ace.filter})`);
    report(ace.cleared >= 1 && ace.drawn >= 1, `  and the chart engine was told to forget its colours and draw again (${ace.cleared} / ${ace.drawn})`);
    report(ace.bgToken.toLowerCase() === '#292928', `the plot token is the card (${ace.bgToken})`);
    report(hex(rgb(ace.plot)) === '#292928' && hex(rgb(ace.grid)) === '#323232',
      `  ChartIQ's probes read the palette: plot ${hex(rgb(ace.plot))}, grid ${hex(rgb(ace.grid))}`);
    report(hex(rgb(ace.yaxis)) === '#D9D8D5' && hex(rgb(ace.candle)) === '#48AC36',
      `  axis labels in ink, candles in the gain fill (${hex(rgb(ace.yaxis))}, ${hex(rgb(ace.candle))})`);
    report(ace.tail === '#FF6262' && /invert\(83%\) sepia\(44%\)/.test(ace.tailFilter),
      `  the long tail keeps Fidelity's own dark values, unmapped (${ace.tail}, ${ace.tailFilter.slice(29, 60)}...)`);
    report(ace.swatch === 'rgb(128, 0, 128)', `  its key swatch keeps the series colour, as the line does (${ace.swatch})`);
    report(/invert\(0\.96\)/.test(ace.icon) && !/invert\(0\.57\)/.test(ace.icon),
      `a toolbar icon is drawn in ink through the palette's filter chain (${ace.icon.slice(0, 60)}...)`);
    report(/invert\(0\.57\)/.test(ace.iconOn), `  and the selected one in the gain green (${ace.iconOn.slice(0, 60)}...)`);
    report(ace.iconBorder === 'rgba(0, 0, 0, 0)', `  its reserved border stays transparent, not a square outline (${ace.iconBorder})`);
    const save = rgb(ace.save), saveInk = rgb(ace.saveInk);
    report(save && save.g > save.r + 40 && save.g > save.b + 40 && contrast(save, saveInk) >= 4.5,
      `the Save button is green with readable ink, as in light mode (${hex(save)} / ${hex(saveInk)})`);
    report(lum(rgb(ace.toolbar)) < 0.06 && lum(rgb(ace.toolbarBorder)) < 0.2,
      `the toolbar is themed as any panel is (${ace.toolbar}, border ${ace.toolbarBorder})`);
    const greenish = c => c && c.g > c.r + 30 && c.g > c.b + 30;
    report(greenish(rgb(ace.delta)) && greenish(rgb(ace.link)) && lum(rgb(ace.name)) > 0.6,
      `the readout's change and the Compare link are green, plain type is light (${ace.delta}, ${ace.link}, ${ace.name})`);
  }

  console.log('\nfund research: legacy buttons, rating scales, plates and pale arrows');
  {
    const go = await q('#legacyGo');
    const gb = rgb(go.bg), gc = rgb(go.color);
    report(gb && hex(gb) === '#5CBF4A', `the legacy green gradient button takes the site's CTA green (${gb ? hex(gb) : go.bg})`);
    report(!/rgb\(4[0-9], 7[0-9]/.test(go.bgImage) && !/45, 76, 19/.test(go.bgImage), `  with no dark olive gradient left over it (${go.bgImage.slice(0, 60)})`);
    report(gb && gc && contrast(gc, gb) >= 4.5, `  and a label that reads on it at ${gb && gc ? contrast(gc, gb).toFixed(2) : '?'}:1 (${go.color})`);

    const dis = await q('#legacyDisabled');
    const db = rgb(dis.bg), dc = rgb(dis.color);
    report(db && lum(db) < 0.06 && dis.bgImage === 'none', `a disabled legacy button is a flat quiet surface (${dis.bg}, ${dis.bgImage.slice(0, 20)})`);
    report(dc && lum(dc) < 0.3, `  with muted text, not the live white (${dis.color})`);

    const bb = rgb((await q('#boxBlue')).bg), bg_ = rgb((await q('#boxGray')).bg);
    const card = rgb((await q('#frCard')).bg);
    report(bb && contrast(bb, card) >= 3, `a filled Morningstar box reads on the card at ${bb ? contrast(bb, card).toFixed(2) : '?'}:1 (${bb ? hex(bb) : '?'})`);
    report(bg_ && contrast(bg_, card) >= 1.2 && lum(bg_) < lum(bb), `  an empty one is a visible step, dimmer than a filled one (${bg_ ? hex(bg_) : '?'})`);

    const risk = await page.evaluate(() => getComputedStyle(document.getElementById('riskBar')).backgroundImage);
    report(/rgb\(122, 150, 45\)/.test(risk) && /rgba\(0, 0, 0, 0\)/.test(risk), `the category-risk scale keeps its segment colours and shows the row through its gaps`);

    const medal = await page.evaluate(async () => {
      const img = document.getElementById('medalImg');
      const src = img.getAttribute('src');
      const im = new Image(); im.src = src; await new Promise(r => { im.onload = r; im.onerror = r; });
      const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
      const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
      return { corner: px(0, 0), inner: px(6, 6), gold: px(3, 4) };
    });
    report(medal.corner[3] === 0, `a raster medal loses its white plate (corner alpha ${medal.corner[3]})`);
    report(medal.inner[3] === 255 && medal.inner[0] > 240, `  but keeps the white inside its own artwork (${medal.inner.join(',')})`);
    report(medal.gold[3] === 255 && medal.gold[0] > 200 && medal.gold[2] < 80, `  and its gold (${medal.gold.join(',')})`);

    const chev = await page.evaluate(() => getComputedStyle(document.getElementById('chevImg')).filter);
    const k = +((/brightness\(([\d.]+)\)/.exec(chev) || [])[1] || 0);
    report(k > 1.2, `a dark blue chevron drawn for white is lifted along its hue (${chev})`);

    const or = await q('#orText');
    report(rgb(or.bg) && rgb(or.bg).a === 0, `a word between two controls sits on no plate (${or.bg})`);
    const ua = await q('#uaButton');
    const ub = rgb(ua.bg);
    report(ub && lum(ub) < 0.05, `a button the site never styled is not the browser's mid-grey box (${ua.bg})`);
  }

  console.log('\nthe fund screener: pickers, a pseudo-element chevron, the slider, the madlib arrows, a sorted header');
  {
    const card = rgb((await q('#scCard')).bg);
    const on = rgb((await q('#rateOn')).bg), off = rgb((await q('#rateOff')).bg);
    report(on && contrast(on, card) >= 3, `a picked Morningstar box is the data blue, ${on ? contrast(on, card).toFixed(2) : '?'}:1 on the card (${on ? hex(on) : '?'})`);
    report(off && hex(off) === '#403F3E', `  an empty one is the same visible step the fund page's scale uses (${off ? hex(off) : '?'})`);

    const after = await page.evaluate(() => getComputedStyle(document.getElementById('classOptions'), '::after').content);
    report(/data:image\/svg\+xml/.test(after) && !/image\/png/.test(after), `the select's chevron is redrawn, not left on its white field (${after.slice(0, 34)})`);

    const sl = await q('#riskSlider');
    report(rgb(sl.bg) && rgb(sl.bg).a === 0, `the risk slider is not painted as a text field (${sl.bg})`);
    const px = await pixels('#riskSlider', [[0.045, 0.5], [0.0955, 0.5]]);
    report(px[0] && Math.abs(px[0][0] - 122) < 10 && Math.abs(px[0][1] - 150) < 10, `  its track keeps the scale's first green (${px[0]})`);
    report(px[1] && Math.abs(px[1][0] - card.r) < 8 && Math.abs(px[1][1] - card.g) < 8, `  and the gap after it is the card, not a white tick (${px[1]})`);

    /* the madlib chevrons: a JPEG of grey drawings on solid white */
    const ml = await page.evaluate(() => { const e = document.getElementById('madlibOn'); return { filter: getComputedStyle(e).filter, style: e.getAttribute('style') || '' }; });
    const fm = /invert\(1\) contrast\(([\d.]+)\) brightness\(([\d.]+)\)/.exec(ml.filter);
    const plateOut = fm ? +fm[2] * (0.5 - 0.5 * +fm[1]) : NaN;
    const coreOut = fm ? +fm[2] * (0.5 + 0.5 * +fm[1]) : NaN;
    const cardLevel = (card.r + card.g + card.b) / 3 / 255;
    report(!!fm && Math.abs(plateOut - cardLevel) < 0.03, `a chevron on a white JPEG plate is inverted whole: the plate lands on the card (${ml.filter})`);
    report(!!fm && coreOut > 0.7, `  and the black arrow on ink (${fm ? Math.round(coreOut * 255) : '?'}/255)`);
    report(!/background-image/.test(ml.style), '  and the sprite is not swapped for a cut-out copy that keeps the black');
    const wrapOff = await q('#madlibWrapOff');
    report(rgb(wrapOff.bg) && rgb(wrapOff.bg).a === 0, `an unanswered (aria-disabled) field paints no plate (${wrapOff.bg})`);

    /* the criteria list's "+", a stand-in: a pale octagon and a blue plus in a 20px PNG */
    const plus = await page.evaluate(() => new Promise(resolve => {
      const img = document.getElementById('plusImg');
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement('canvas'); cv.width = 20; cv.height = 20;
        const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
        const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
        resolve({ body: px(5, 5), glyph: px(10, 10) });
      };
      im.onerror = () => resolve(null);
      im.src = img.currentSrc || img.src;
    }));
    const bodyC = plus && { r: plus.body[0], g: plus.body[1], b: plus.body[2] };
    const glyphC = plus && { r: plus.glyph[0], g: plus.glyph[1], b: plus.glyph[2] };
    report(plus && lum(bodyC) < 0.06, `a pale button drawn as a PNG gets a dark body (${plus ? hex(bodyC) : '?'})`);
    report(plus && glyphC.b > glyphC.r + 30 && contrast(glyphC, bodyC) >= 4.5, `  and keeps its blue glyph, lifted to read on it at ${plus ? contrast(glyphC, bodyC).toFixed(2) : '?'}:1 (${plus ? hex(glyphC) : '?'})`);

    const th = await page.evaluate(() => { const e = document.getElementById('sortedTh'); const cs = getComputedStyle(e); return { filter: cs.filter, bg: cs.backgroundColor, img: cs.backgroundImage, label: getComputedStyle(document.getElementById('sortedLabel')).color }; });
    report(th.filter === 'none', `a sorted header is not filtered as if it were an icon (${th.filter})`);
    const tb = rgb(th.bg), tl = rgb(th.label);
    report(tb && tl && contrast(tl, tb) >= 4.5, `  its label reads at ${tb && tl ? contrast(tl, tb).toFixed(2) : '?'}:1 on it`);
    report(/data:image\/svg\+xml/.test(th.img) && /D9D8D5/i.test(decodeURIComponent(th.img)), '  and its arrow is drawn in the header ink');
  }

  console.log('\nthe screener\'s results header and criteria list');
  {
    const card = rgb((await q('#showCard')).bg);
    const sf = await q('#showFunds');
    const sfBg = rgb(sf.bg), sfInk = rgb(sf.color);
    report(sfBg && sfBg.a === 0, `"(show funds)", a link that is off, sits on no box (${sf.bg})`);
    report(sfInk && card && contrast(sfInk, card) >= 4.5, `  its text reads at ${sfInk && card ? contrast(sfInk, card).toFixed(2) : '?'}:1 on the card`);
    report(sfInk && sat(sfInk) < 16, `  and is grey, not the live link's blue, so it still reads as off (${sfInk ? hex(sfInk) : '?'})`);

    /* the help button: wait for the edited picture to land */
    const helpSrc = fs.readFileSync(path.join(__dirname, 'fixture.html'), 'utf8').match(/id="helpBtn"[^>]*url\((data:image\/png;base64,[^)]+)\)/)[1];
    for (let t = 0; t < 30; t++) {
      const now = await page.evaluate(() => getComputedStyle(document.getElementById('helpBtn')).backgroundImage);
      if (now.indexOf(helpSrc) === -1) break;
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(200);
    const px = await pixels('#helpBtn', [[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98], [0.32, 0.02], [0.43, 0.2143], [0.143, 0.5]]);
    const near = (p, c) => p && c && Math.abs(p[0] - c.r) <= 6 && Math.abs(p[1] - c.g) <= 6 && Math.abs(p[2] - c.b) <= 6;
    report(px.length === 7 && px.slice(0, 4).every(p => near(p, card)),
      `a round help icon drawn on a white square loses the square: its corners are the card (${px.slice(0, 4).map(p => p.join(',')).join(' / ')})`);
    const fringe = px[4] && { r: px[4][0], g: px[4][1], b: px[4][2] };
    report(fringe && lum(fringe) < 0.2, `  its anti-aliased rim is un-blended, not a pale ring (${px[4] ? px[4].join(',') : '?'})`);
    report(px[5] && px[5].every(v => v >= 235), `  the white "?" inside the disc is kept (${px[5] ? px[5].join(',') : '?'})`);
    report(px[6] && px[6][2] > px[6][0] + 120, `  and the disc is still Fidelity's blue (${px[6] ? px[6].join(',') : '?'})`);

    /* an apex-kit popover's pointer */
    const pop = await page.evaluate(() => {
      const panel = getComputedStyle(document.getElementById('popPanel'));
      const a = getComputedStyle(document.getElementById('popArrow'), '::after');
      return { panelBg: panel.backgroundColor, panelBorder: panel.borderTopColor, bg: a.backgroundColor,
               top: a.borderTopColor, left: a.borderLeftColor, right: a.borderRightColor, bottom: a.borderBottomColor };
    });
    report(pop.bg === pop.panelBg, `a popover's pointer is filled with the panel's colour (${pop.bg} / ${pop.panelBg})`);
    report(pop.top === pop.panelBorder && pop.left === pop.panelBorder,
      `  its two drawn sides continue the panel's outline (${pop.top}, ${pop.left} / ${pop.panelBorder})`);
    report(rgb(pop.right).a === 0 && rgb(pop.bottom).a === 0, `  and the two sides it leaves open stay open (${pop.right}, ${pop.bottom})`);
  }

  console.log('\na picture keeps winning where it won in light mode');
  {
    const send = await page.evaluate(() => getComputedStyle(document.getElementById('va-submit')).backgroundImage);
    report(send && send !== 'none' && /url\(/.test(send), `the Assistant's send arrow survives the panel's button reset (${send.slice(0, 40)})`);
    const pic = await page.evaluate(() => getComputedStyle(document.getElementById('inlinePic')).backgroundImage);
    report(pic && pic !== 'none' && /url\(/.test(pic), `a picture set inline outranks a reset carried over from a stylesheet (${pic.slice(0, 40)})`);

    /* a url with a colour word in it (icon-x-gray-1x.svg) is copied as is */
    const named = await page.evaluate(() => {
      const t = [...document.querySelectorAll('style[data-fidelity-dark="emitted"]')].map(s => s.textContent).join('\n');
      const i = t.indexOf('.popin--close-button');
      if (i === -1) return null;
      const m = /url\("([^"]*)"\)/.exec(t.slice(i, t.indexOf('}', i)));
      return m ? m[1] : null;
    });
    report(named === origin + '/icon-x-gray-1x.svg', `a sprite named for its colour keeps its file name ("${named ? named.replace(origin, '') : 'no copy'}")`);
    for (let t = 0; t < 30; t++) {
      if (await page.evaluate(() => /^url\("data:/.test(getComputedStyle(document.getElementById('popinClose')).backgroundImage))) break;
      await page.waitForTimeout(100);
    }
    const xs = await pixels('#popinClose', [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [0.5, 0.06]]);
    const asC = p => ({ r: p[0], g: p[1], b: p[2] });
    const xCard = xs[3] && asC(xs[3]);
    report(xs.length === 4 && lum(xCard) < 0.05 && xs.slice(0, 3).every(p => contrast(asC(p), xCard) >= 3),
      `  and its X is drawn, at 3:1 or better on the dark card (${xs.map(p => p.join(',')).join(' / ')})`);
  }

  console.log('\nsmall inline icons are held to 3:1, against what they are drawn on');
  {
    const card = rgb((await q('#iconCard')).bg);
    const tri = rgb(await page.evaluate(() => getComputedStyle(document.getElementById('dayTri')).fill));
    report(tri && contrast(tri, card) >= 3 && tri.b > tri.g, `a purple day-change triangle is lifted along its hue to ${tri ? contrast(tri, card).toFixed(2) : '?'}:1 (${tri ? hex(tri) : '?'})`);
    const glyph = rgb(await page.evaluate(() => getComputedStyle(document.getElementById('discGlyph')).fill));
    report(glyph && hex(glyph) === '#4C4C4C', `a dark glyph on a yellow disc keeps its dark, judged against the yellow (${glyph ? hex(glyph) : '?'})`);
    const dis = rgb(await page.evaluate(() => getComputedStyle(document.getElementById('disabledTri')).fill));
    report(dis && hex(dis) === '#7C33AC', `an icon in a disabled control is left to recede (${dis ? hex(dis) : '?'})`);
  }

  console.log('\nChartIQ: the drawing is inverted, its key agrees with it');
  {
    const c = await page.evaluate(() => ({
      canvas: getComputedStyle(document.getElementById('ciqCanvas')).filter,
      jump: getComputedStyle(document.getElementById('ciqJump')).filter,
      swatch: getComputedStyle(document.getElementById('ciqSwatch')).backgroundColor,
      swFilter: getComputedStyle(document.getElementById('ciqSwatch')).filter,
      probe: getComputedStyle(document.getElementById('ciqProbe')).color
    }));
    report(/invert\(1\)/.test(c.canvas), `the chart canvas is inverted (${c.canvas})`);
    report(c.swatch === 'rgb(58, 87, 22)', `a key swatch keeps its own series colour, not the stylesheet's red (${c.swatch})`);
    report(/invert\(1\)/.test(c.swFilter), `  and goes through the same filter as the line it keys (${c.swFilter})`);
    report(c.probe === 'rgb(239, 239, 239)', `the grid probe keeps the light-mode value the drawing is inverted from (${c.probe})`);
    report(/invert\(1\)/.test(c.jump), `ChartIQ's own overlay (jump-to-today) goes with the drawing (${c.jump})`);
  }

  console.log('\n"divider" names a line, not a row');
  {
    const row = await q('#rowWithDivider');
    const line = await q('#lineDivider');
    report(rgb(row.bg) && rgb(row.bg).a === 0, `a row that owns a divider paints no plate (${row.bg})`);
    const lb = rgb(line.bg), card = rgb((await q('#card')).bg);
    report(lb && lb.a === 1 && lum(lb) < 0.1 && lb.r !== card.r, `  the line itself is the hairline fill (${line.bg})`);
    const rb = rgb(row.border);
    report(rb && lum(rb) < 0.1, `  and the row's own bottom border is the same hairline (${row.border})`);
  }

  console.log('\nthe chart key is readable');
  {
    const lab = await q('#legLabel');
    const card = rgb((await q('#card')).bg);
    const c = rgb(lab.color);
    report(contrast(c, card) >= 4.5, `legend label ${hex(c)} on the card = ${contrast(c, card).toFixed(2)}:1`);
    /* a series hidden from its key: words and strike in one grey */
    const hid = await page.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return { span: cs('legHidden').color, deco: cs('legHidden').textDecorationLine, text: cs('legHiddenText').color,
               key: cs('legHiddenKey').borderTopColor };
    });
    const ht = rgb(hid.text), hs = rgb(hid.span);
    report(hid.deco === 'line-through' && hex(ht) === hex(hs),
      `a hidden series' words are the colour of the line struck through them (${hex(ht)} / ${hex(hs)})`);
    report(contrast(ht, card) >= 4.5 && contrast(ht, card) < contrast(c, card) - 3,
      `  a step down from a shown label, and the strike still reads (${contrast(ht, card).toFixed(2)}:1 against ${contrast(c, card).toFixed(2)}:1)`);
    report(rgb(hid.key) && sat(rgb(hid.key)) > 40, `  and its key keeps the series colour, as in light mode (${hid.key})`);
  }

  /* --- content that arrives after load ------------------------------------- */
  /* Content without a stylesheet gets the inline and light passes only. */
  console.log('\nthe backstop reaches content that arrives after load');
  {
    await page.evaluate(() => {
      const host = document.querySelector('#card');
      const late = document.createElement('div');
      late.id = 'lateContent';
      // Fidelity's raw brand green, set inline
      late.innerHTML = '<span id="lateGain" style="color:#368727">+24.04%</span>';
      /* a sprite with it, as the Morningstar rating arrives on the Performance
         route: only the light pass reaches it */
      const strip = document.createElement('div');
      strip.id = 'lateSprite';
      strip.style.cssText = 'width:65px;height:12px;background-image:url("icon_print.svg")';
      late.appendChild(strip);
      host.appendChild(late);
    });
    await page.waitForTimeout(1700);
    const el = await q('#lateGain');
    const card = rgb((await q('#card')).bg);
    const c = rgb(el.color);
    report(contrast(c, card) >= 4.5,
      `a figure rendered after load is repaired to ${contrast(c, card).toFixed(2)}:1 (${hex(c)})`);
    report(sat(c) > 60, `and lands on the palette's gain green rather than drifting toward grey (${hex(c)})`);

    const sprite = await q('#lateSprite');
    report(sprite.bgImage.indexOf('data:image/svg') !== -1,
      'a sprite arriving with it is re-served as edited artwork, not left as shipped');
  }

  /* --- a skeleton inside a shadow root ------------------------------------- */
  /* The Performance page's <skeleton-loader>, mounted after load, with bars
     from a <style> inside its shadow root and from adoptedStyleSheets. */
  console.log('\nshadow roots: a component\'s own stylesheets are recolored inside it');
  {
    await page.evaluate(() => {
      const host = document.createElement('skeleton-loader');
      host.id = 'skelHost';
      const sr = host.attachShadow({ mode: 'open' });
      const st = document.createElement('style');
      st.setAttribute('scope', 'skeleton-loader');
      st.textContent = '.loader{display:block;width:437px;height:20px;margin:6px 0;background-image:linear-gradient(100deg,#fff0,#ffffff80 50%,#fff0 80%),linear-gradient(#eee 20px,transparent 0);background-repeat:no-repeat;background-size:50px 20px,100% 20px;animation:skshine 1s linear infinite}@keyframes skshine{to{background-position:100% 0,0 0}} .plain{display:block;width:188px;height:20px;background:#eee}';
      sr.appendChild(st);
      const adoptedSheet = new CSSStyleSheet();
      adoptedSheet.replaceSync('.adopted{display:block;width:312px;height:20px;background-color:#eeeeee}');
      sr.adoptedStyleSheets = [adoptedSheet];
      const wrap = document.createElement('div');
      wrap.innerHTML = '<div class="loader" id="bar"></div><div class="plain" id="plain"></div><div class="adopted" id="adoptedBar"></div>';
      sr.appendChild(wrap);
      document.querySelector('#card').appendChild(host);
    });
    await page.waitForTimeout(1500);
    const sk = await page.evaluate(() => {
      const sr = document.querySelector('#skelHost').shadowRoot;
      const read = id => { const cs = getComputedStyle(sr.querySelector('#' + id)); return { bg: cs.backgroundColor, img: cs.backgroundImage, anim: cs.animationName }; };
      return { bar: read('bar'), plain: read('plain'), adopted: read('adoptedBar') };
    });
    const card = rgb((await q('#card')).bg);
    report(lum(rgb(sk.plain.bg)) < 0.08,
      `a bar painted by a <style> inside the shadow root is dark (${hex(rgb(sk.plain.bg))})`);
    report(lum(rgb(sk.adopted.bg)) < 0.08,
      `a bar painted through adoptedStyleSheets is dark too (${hex(rgb(sk.adopted.bg))})`);
    const stops = (sk.bar.img.match(/rgba?\([^)]*\)/g) || []);
    const bright = stops.filter(c => { const p = rgb(c); return p && lum(p) > 0.5 && !/, 0\)$/.test(c) && !/, 0\.0[0-9]*\)$/.test(c) && !/, 0\.1[0-9]*\)$/.test(c); });
    report(sk.bar.img.indexOf('gradient') !== -1 && bright.length === 0,
      `the shine gradient keeps no bright stop (${stops.length} stops, ${bright.length} bright)`);
    report(sk.bar.anim !== 'none', `and the sweep still animates (${sk.bar.anim})`);
    const eee = stops.some(c => /238, 238, 238/.test(c));
    report(!eee, 'and the #eee bar layer under the shine is gone');
  }

  /* --- one constructed sheet, many instances ------------------------------- */
  /* Lit and Stencil share one CSSStyleSheet across every instance of a
     component, so each instance's shadow root needs its own copy of the
     recoloured rules, including an instance mounted later. */
  console.log('\nshadow roots: a constructed sheet shared by several instances is recoloured in each');
  {
    await page.evaluate(() => {
      const shared = new CSSStyleSheet();
      shared.replaceSync('.card{display:block;padding:8px;background-color:#ffffff;color:#1d252c}');
      window.__fdmShared = shared;
      for (const id of ['shA', 'shB', 'shC']) {
        const host = document.createElement('x-card');
        host.id = id;
        const sr = host.attachShadow({ mode: 'open' });
        sr.adoptedStyleSheets = [shared];
        sr.innerHTML = '<div class="card">Shared</div>';
        document.querySelector('#card').appendChild(host);
      }
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const host = document.createElement('x-card');
      host.id = 'shD';
      const sr = host.attachShadow({ mode: 'open' });
      sr.adoptedStyleSheets = [window.__fdmShared];
      sr.innerHTML = '<div class="card">Shared, later</div>';
      document.querySelector('#card').appendChild(host);
    });
    await page.waitForTimeout(1500);
    const sh = await page.evaluate(() => {
      const out = {};
      for (const id of ['shA', 'shB', 'shC', 'shD']) {
        const el = document.getElementById(id).shadowRoot.querySelector('.card');
        const cs = getComputedStyle(el);
        out[id] = { bg: cs.backgroundColor, color: cs.color };
      }
      return out;
    });
    for (const id of ['shA', 'shB', 'shC']) {
      report(lum(rgb(sh[id].bg)) < 0.08 && contrast(rgb(sh[id].color), rgb(sh[id].bg)) >= 4.5,
        `instance ${id} is dark with readable ink (${hex(rgb(sh[id].bg))}, ${hex(rgb(sh[id].color))})`);
    }
    report(lum(rgb(sh.shD.bg)) < 0.08 && contrast(rgb(sh.shD.color), rgb(sh.shD.bg)) >= 4.5,
      `  and so is one mounted after the sheet was first read (${hex(rgb(sh.shD.bg))}, ${hex(rgb(sh.shD.color))})`);
    await page.evaluate(() => { delete window.__fdmShared; });

    /* an inline style written later on a shadow root's top-level child */
    await page.evaluate(() => {
      const sr = document.getElementById('shA').shadowRoot;
      const top = sr.querySelector('.card');
      top.style.backgroundColor = '#ffffff';
      top.style.color = '#1d252c';
    });
    await page.waitForTimeout(400);
    const topInline = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('shA').shadowRoot.querySelector('.card'));
      return { bg: cs.backgroundColor, color: cs.color };
    });
    report(lum(rgb(topInline.bg)) < 0.08 && contrast(rgb(topInline.color), rgb(topInline.bg)) >= 4.5,
      `an inline style set later on a root's top-level child is mapped too (${hex(rgb(topInline.bg))}, ${hex(rgb(topInline.color))})`);
  }

  /* --- a glyph written straight into a data: URI --------------------------- */
  /* A rule's SVG picture, as text rather than base64, has its colours mapped
     as ink; a "#" in the result would start a URL fragment and lose the
     picture, so hex comes out as %23. A pseudo-element has no element pass,
     so this copy is all it gets. */
  console.log('\na data: SVG in a rule maps its colours as ink and stays a loadable picture');
  {
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.id = 'dataSvgStyle';
      st.textContent = '.dsv-chevron::before{content:"";display:inline-block;width:16px;height:16px;background-repeat:no-repeat;' +
        'background-image:url("data:image/svg+xml;charset=utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'><path d=\'M4 6l4 4 4-4\' fill=\'none\' stroke=\'black\' stroke-width=\'2\'/><circle cx=\'8\' cy=\'3\' r=\'1\' fill=\'%23333333\'/></svg>")}';
      document.head.appendChild(st);
      const el = document.createElement('span');
      el.className = 'dsv-chevron'; el.id = 'dsvChevron';
      document.querySelector('#card').appendChild(el);
    });
    await page.waitForTimeout(1500);
    const dsv = await page.evaluate(async () => {
      const bi = getComputedStyle(document.getElementById('dsvChevron'), '::before').backgroundImage;
      const m = /url\("?([^")]+)"?\)/.exec(bi);
      const url = m ? m[1] : '';
      const body = url.replace(/^data:[^,]*,/, '');
      let loads = false;
      try {
        loads = await new Promise(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = url; });
      } catch (e) { loads = false; }
      let text = body;
      try { text = decodeURIComponent(body); } catch (e) { /* raw */ }
      return { rawHash: body.indexOf('#') !== -1, encoded: /%23/i.test(body), loads, text, mapped: !/stroke='black'|%23333333|#333333/i.test(body) };
    });
    report(dsv.loads, `the emitted picture loads as an image (${dsv.loads})`);
    report(!dsv.rawHash && dsv.encoded, `  its hex colours are written as %23, never a bare # (raw # ${dsv.rawHash}, %23 ${dsv.encoded})`);
    report(dsv.mapped, `  and the black stroke and dark fill were mapped (${dsv.text.slice(0, 120)})`);
    const strokeHex = (/stroke='(#[0-9a-f]{6})'/i.exec(dsv.text) || [])[1];
    report(!!strokeHex && lum(parseHex(strokeHex)) > 0.5, `  to a light ink (${strokeHex})`);
    await page.evaluate(() => { document.getElementById('dataSvgStyle').remove(); document.getElementById('dsvChevron').remove(); });
  }

  /* --- a sheet limited by its media attribute, and an @import -------------- */
  console.log('\nstylesheets: a media attribute is kept, and an @import is read');
  {
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.id = 'narrowStyle';
      st.media = '(max-width: 300px)';
      st.textContent = '.only-narrow{background-color:#ffffff;color:#1d252c}';
      document.head.appendChild(st);
      const imp = document.createElement('style');
      imp.id = 'importStyle';
      imp.textContent = '@import url("imported.css");';
      document.head.appendChild(imp);
      const a = document.createElement('div'); a.className = 'only-narrow'; a.id = 'onlyNarrow'; a.textContent = 'Narrow only';
      const b = document.createElement('div'); b.className = 'imported-box'; b.id = 'importedBox'; b.textContent = 'From an import';
      document.querySelector('#card').append(a, b);
    });
    await page.waitForTimeout(2000);
    const mq = await page.evaluate(() => {
      const emitted = [...document.querySelectorAll('style[data-fidelity-dark="emitted"]')].map(s => s.textContent).join('\n');
      const nar = getComputedStyle(document.getElementById('onlyNarrow'));
      const imp = getComputedStyle(document.getElementById('importedBox'));
      const wrapped = /@media \(max-width: 300px\)\s*\{[^}]*only-narrow/.test(emitted);
      return { wrapped, narBg: nar.backgroundColor, impBg: imp.backgroundColor, impColor: imp.color, width: innerWidth };
    });
    report(mq.wrapped, 'a sheet with media="(max-width: 300px)" is copied inside that @media');
    report(mq.narBg === 'rgba(0, 0, 0, 0)', `  so at ${mq.width}px its rule does not paint (${mq.narBg})`);
    report(lum(rgb(mq.impBg)) < 0.08 && contrast(rgb(mq.impColor), rgb(mq.impBg)) >= 4.5,
      `a rule reached through @import is recoloured (${hex(rgb(mq.impBg))}, ${hex(rgb(mq.impColor))})`);
    await page.evaluate(() => { for (const id of ['narrowStyle', 'importStyle', 'onlyNarrow', 'importedBox']) document.getElementById(id).remove(); });

    /* A shorthand set with var() and a literal fallback (the planning app's
       page host: `background: var(--fds-layer-fds-layer-background, #f9f7f5)`)
       reads back through the CSSOM as empty longhands; the copy has to come
       from the shorthand, or the panel stays light with black text forced on
       it by the contrast pass. */
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.id = 'varShortStyle';
      st.textContent = '[_nghost-ng-ctest]{display:block;padding:24px;background:var(--fds-layer-fds-layer-background, #f9f7f5)} ' +
        '.vs-card{background:var(--undefined-card-token, #ffffff);border:1px solid var(--undefined-line-token, #d9d8d5);padding:8px;color:#141414}';
      document.head.appendChild(st);
      const host = document.createElement('goals-test-strategy');
      host.setAttribute('_nghost-ng-ctest', '');
      host.id = 'varHost';
      host.innerHTML = '<h2 id="varHead" style="color:#000000">Asset mix and allocation</h2><div class="vs-card" id="varCard">Current asset mix</div>';
      document.querySelector('#card').appendChild(host);
    });
    await page.waitForTimeout(2200);
    const vs = await page.evaluate(() => {
      const host = getComputedStyle(document.getElementById('varHost')), head = getComputedStyle(document.getElementById('varHead'));
      const card = getComputedStyle(document.getElementById('varCard'));
      return { host: host.backgroundColor, head: head.color, card: card.backgroundColor, cardBorder: card.borderTopColor, cardInk: card.color };
    });
    report(lum(rgb(vs.host)) < 0.08 && hex(rgb(vs.host)) === '#141414',
      `a host painted by a var() shorthand with a light fallback takes the page colour (${hex(rgb(vs.host))})`);
    report(contrast(rgb(vs.head), rgb(vs.host)) >= 4.5 && lum(rgb(vs.head)) > 0.5,
      `  so its heading is light ink on it, not black forced by the contrast pass (${hex(rgb(vs.head))})`);
    report(lum(rgb(vs.card)) < 0.08 && hex(rgb(vs.card)) === '#292928' && contrast(rgb(vs.cardInk), rgb(vs.card)) >= 4.5,
      `  and a card painted the same way is a card with readable ink (${hex(rgb(vs.card))}, ${hex(rgb(vs.cardInk))})`);
    report(contrast(rgb(vs.cardBorder), rgb(vs.card)) >= 1.2 && lum(rgb(vs.cardBorder)) < 0.5,
      `  under a border from a var() shorthand, a dark hairline (${hex(rgb(vs.cardBorder))})`);
    await page.evaluate(() => { document.getElementById('varShortStyle').remove(); document.getElementById('varHost').remove(); });

    /* A rule's `border-left: 8px solid` reads back with an implied
       border-left-color of currentcolor. Copied !important it would beat the
       colour the page sets inline (the Net worth page's category bars, one
       colour per account type): the implied value is not copied. */
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.id = 'catStyle';
      st.textContent = '.cat-card{border-left:8px solid;border-radius:9px;background:#ffffff;padding:12px}';
      document.head.appendChild(st);
      const a = document.createElement('div'); a.className = 'cat-card'; a.id = 'catOrange'; a.setAttribute('style', 'border-color: rgb(219, 148, 52)'); a.textContent = 'Loans';
      const b = document.createElement('div'); b.className = 'cat-card'; b.id = 'catPurple'; b.setAttribute('style', 'border-color: rgb(122, 32, 182)'); b.textContent = 'Credit cards';
      document.querySelector('#card').append(a, b);
    });
    await page.waitForTimeout(1500);
    const cat = await page.evaluate(() => {
      const r = id => { const cs = getComputedStyle(document.getElementById(id)); return { bl: cs.borderLeftColor, bg: cs.backgroundColor, color: cs.color }; };
      const emitted = [...document.querySelectorAll('style[data-fidelity-dark="emitted"]')].map(s => s.textContent).join('\n');
      const copy = (emitted.match(/\.cat-card\{[^}]*\}/) || [''])[0];
      return { orange: r('catOrange'), purple: r('catPurple'), copy };
    });
    const o = rgb(cat.orange.bl), pu = rgb(cat.purple.bl);
    report(o && o.r > 180 && o.g > 110 && o.g < 180 && o.b < 100 && pu && pu.b > 140 && pu.r > 90 && pu.g < 80,
      `category bars keep the colour the page gives them inline, orange and purple (${cat.orange.bl}, ${cat.purple.bl})`);
    report(!/border-left-color:\s*currentcolor/i.test(cat.copy) && lum(rgb(cat.orange.bg)) < 0.08,
      `  the rule's copy carries no implied currentcolor, and the card is still dark (${cat.copy.slice(0, 80)})`);
    await page.evaluate(() => { document.getElementById('catStyle').remove(); document.getElementById('catOrange').remove(); document.getElementById('catPurple').remove(); });

    /* A token named after a colour (`fill: var(--reference-color-blue-800)`,
       the positions page's pending-activity popover links) carries no literal
       colour: its copy is re-emitted like any var() rule, or the less specific
       `fill: var(--apex-kit-icon-color)` copy wins and the icon falls to the
       black it inherits. */
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.id = 'tokenNameStyle';
      st.textContent = ':root{--reference-color-blue-800:#1d3986} ' +
        '.pwe-test .ic-root{display:inline-block;width:16px;height:16px;fill:var(--apex-kit-icon-color)} ' +
        '.pwe-test a{color:#1d3986} ' +
        '.pwe-test .pa-popover .pa-links a svg{fill:var(--reference-color-blue-800);padding:0}';
      document.head.appendChild(st);
      const host = document.createElement('div'); host.className = 'pwe-test'; host.id = 'tokenHost';
      host.innerHTML = '<div class="pa-popover"><div class="pa-links"><a href="#">Balances<pwe-ic><svg id="tokenIcon" class="ic-root" viewBox="0 0 24 24"><path d="M20.6 2h-4.33a1 1 0 1 1 0-2h6.75a1 1 0 0 1 1 1v6.75a1 1 0 1 1-2 0V3.4L11.7 13.7a1 1 0 0 1-1.4-1.4z"/></svg></pwe-ic></a></div></div>';
      document.querySelector('#card').appendChild(host);
    });
    await page.waitForTimeout(1500);
    const tk = await page.evaluate(() => {
      const svg = document.getElementById('tokenIcon');
      const emitted = [...document.querySelectorAll('style[data-fidelity-dark="emitted"]')].map(s => s.textContent).join('\n');
      return { fill: getComputedStyle(svg).fill, link: getComputedStyle(svg.closest('a')).color, copied: /\.pa-links a svg\{fill:var\(--reference-color-blue-800\) !important\}/.test(emitted) };
    });
    report(tk.copied, 'a rule whose var() names a colour (--reference-color-blue-800) is still copied');
    report(sat(rgb(tk.fill)) > 40 && rgb(tk.fill).b > rgb(tk.fill).r && lum(rgb(tk.fill)) > 0.3,
      `  so the popover link icon is a blue that reads on dark, not black (${hex(rgb(tk.fill))})`);
    report(tk.fill === tk.link, `  the same blue as the link text (${hex(rgb(tk.link))})`);
    await page.evaluate(() => { document.getElementById('tokenNameStyle').remove(); document.getElementById('tokenHost').remove(); });

    /* A border switched off by a more specific rule (`border: 0`, the summary
       page's chart range control) stays off: the reset's width and style are
       copied, or the !important copy of `border: var(--x)` frames the control
       and divides its segments in the dark theme only. */
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.id = 'resetStyle';
      st.textContent = ':root{--ctl-border:1px solid #d9d8d5;--seg-border:1px solid #ffffff} ' +
        '.ho .seg-root{border:var(--ctl-border);border-radius:8px;padding:12px;background:#ffffff} ' +
        '.ho .seg-root .seg{border-left:var(--seg-border);padding:4px 8px;display:inline-block;color:#525150} ' +
        '.ho .card .seg-root.range{border:0px} .ho .card .seg-root.range .seg{border-left:0px}';
      document.head.appendChild(st);
      const host = document.createElement('div'); host.className = 'ho'; host.id = 'resetHost';
      host.innerHTML = '<div class="card"><div class="seg-root range" id="segRoot"><span class="seg" id="segA">1M</span><span class="seg" id="segB">YTD</span></div></div>';
      document.querySelector('#card').appendChild(host);
    });
    await page.waitForTimeout(1500);
    const rs = await page.evaluate(() => {
      const r = id => { const cs = getComputedStyle(document.getElementById(id)); return { w: cs.borderTopWidth, s: cs.borderTopStyle, lw: cs.borderLeftWidth, ls: cs.borderLeftStyle }; };
      return { root: r('segRoot'), seg: r('segB') };
    });
    report(rs.root.w === '0px' || rs.root.s === 'none', `a control whose border the page switched off stays unframed (${rs.root.w} ${rs.root.s})`);
    report(rs.seg.lw === '0px' || rs.seg.ls === 'none', `  and its segments keep no dividers (${rs.seg.lw} ${rs.seg.ls})`);
    await page.evaluate(() => { document.getElementById('resetStyle').remove(); document.getElementById('resetHost').remove(); });

    /* A sort arrow drawn as ::after { content: url(data:image/svg+xml,...) }
       (the homepage market movers) is ink: the active black half reads as
       the text colour and the grey half as a dimmer grey, as in light mode.
       An icon blacked out with filter: brightness(0) (the "Find an investor
       center" button) reads as text ink instead of black. */
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.id = 'contentArtStyle';
      st.textContent = '.mm-test .arrows{display:inline-block;width:10px;height:14px} ' +
        '.mm-test .arrows.up::after{display:inline-block;width:10px;height:14px;content:url("data:image/svg+xml,<svg width=\\"10\\" height=\\"14\\" viewBox=\\"0 0 24 24\\" xmlns=\\"http://www.w3.org/2000/svg\\"><path d=\\"M12 0L0 9L24 9Z\\" fill=\\"%23141414\\"/><path d=\\"M12 24L0 15L24 15Z\\" fill=\\"%23ABAAA8\\"/></svg>")} ' +
        '.btn-test .ico-test{filter:brightness(0) saturate(100%)} .btn-test .ico-keep{filter:brightness(0) saturate(100%) invert(27%) sepia(1%)}';
      document.head.appendChild(st);
      const host = document.createElement('div'); host.id = 'contentArtHost';
      host.innerHTML = '<div class="mm-test"><span class="arrows up" id="mmArrow"></span></div><div class="btn-test"><span class="ico-test" id="icoBlack">i</span><span class="ico-keep" id="icoKeep">k</span></div>';
      document.querySelector('#card').appendChild(host);
    });
    await page.waitForTimeout(1500);
    const ca = await page.evaluate(() => ({
      content: getComputedStyle(document.getElementById('mmArrow'), '::after').content,
      filter: getComputedStyle(document.getElementById('icoBlack')).filter,
      keep: getComputedStyle(document.getElementById('icoKeep')).filter
    }));
    report(/%23FFFFFF|#FFFFFF/i.test(ca.content) && !/141414/i.test(ca.content),
      `a sort arrow drawn as content: url(svg) has its black half as light ink (${(ca.content.match(/fill=\\?"[^"\\]*/g) || []).join(' ')})`);
    report(/invert\((?:96%|0\.96)\)/.test(ca.filter), `an icon blacked out with brightness(0) reads as text ink (${ca.filter.slice(0, 40)})`);
    report(/invert\((?:27%|0\.27)\)/.test(ca.keep), `  while a filter recipe for a particular colour is left alone (${ca.keep.slice(0, 40)})`);
    await page.evaluate(() => { document.getElementById('contentArtStyle').remove(); document.getElementById('contentArtHost').remove(); });

    /* The homepage link footer: a pale strip tiled on a #F0F0F0 band, which
       a rule arriving later switches off. The edited strip must come off
       with it (an !important copy outlived the page's own rule and drew a
       rectangle narrower than the band), and the band is the recessed
       surface, a step apart from the page as in light mode. */
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.id = 'seoStyleA';
      st.textContent = '.glpg-seo-footer{background:#f0f0f0 url("footer_strip.png") repeat-x;height:240px;width:600px;padding:12px;box-sizing:border-box}';
      document.head.appendChild(st);
      const host = document.createElement('app-footer'); host.id = 'seoHost';
      host.innerHTML = '<section id="seoBand"><div><div class="glpg-seo-footer" id="seoFoot"><a href="#">Mutual Funds</a> <span>Stay Connected</span></div></div></section>';
      document.querySelector('#card').appendChild(host);
    });
    await page.waitForTimeout(2200);
    const seo1 = await page.evaluate(() => (document.getElementById('seoFoot').style.getPropertyValue('background-image') || '').slice(0, 30));
    report(/data:image\/png/.test(seo1), `a pale strip tiled on the footer band is edited as a surface (${seo1 || 'none'})`);
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.id = 'seoStyleB';
      st.textContent = 'app-footer .glpg-seo-footer{background-image:none}';
      document.head.appendChild(st);
    });
    await page.waitForTimeout(2200);
    const seo2 = await page.evaluate(() => {
      const f = document.getElementById('seoFoot'), b = document.getElementById('seoBand');
      return { inline: f.style.getPropertyValue('background-image'), img: getComputedStyle(f).backgroundImage, bg: getComputedStyle(f).backgroundColor, band: getComputedStyle(b).backgroundColor };
    });
    report(!seo2.inline && seo2.img === 'none', `  and comes off when a later rule removes the strip, leaving no rectangle (${seo2.img.slice(0, 30)}${seo2.inline ? ', inline ' + seo2.inline.slice(0, 20) : ''})`);
    report(hex(rgb(seo2.bg)) === '#1C1B1B' && hex(rgb(seo2.band)) === '#1C1B1B',
      `  the link footer is the recessed surface, one band, a step off the page (${hex(rgb(seo2.bg))}, ${hex(rgb(seo2.band))})`);
    await page.evaluate(() => { for (const id of ['seoStyleA', 'seoStyleB', 'seoHost']) document.getElementById(id).remove(); });
  }

  /* --- a component that styles itself after it mounts ---------------------- */
  /* The transfer page's "To" card: a <tc-source> that mounts empty and gets
     its styles later. Also a component mounting inside one seen earlier. */
  console.log('\na component that writes its styles after it mounts is still recoloured');
  {
    await page.evaluate(() => {
      const card = document.querySelector('#card');
      const host = document.createElement('late-field');
      host.id = 'lateField';
      const sr = host.attachShadow({ mode: 'open' });
      card.appendChild(host);
      setTimeout(() => {
        const st = document.createElement('style');
        st.textContent = '.fld{background-color:#FFFFFF;color:#141414;border:1px solid #757473} .lab{color:#000000}';
        sr.appendChild(st);
        const w = document.createElement('div');
        w.innerHTML = '<label class="lab" id="lateLab">To</label><select class="fld" id="lateSel"><option>Select one</option></select>';
        sr.appendChild(w);
      }, 300);
      const outer = document.createElement('outer-card');
      outer.id = 'outerCard';
      const osr = outer.attachShadow({ mode: 'open' });
      const ost = document.createElement('style');
      ost.textContent = '.shell{display:block}';
      osr.appendChild(ost);
      const shell = document.createElement('div');
      shell.className = 'shell';
      osr.appendChild(shell);
      card.appendChild(outer);
      setTimeout(() => {
        const inner = document.createElement('inner-field');
        const isr = inner.attachShadow({ mode: 'open' });
        shell.appendChild(inner);
        setTimeout(() => {
          const st = document.createElement('style');
          st.textContent = '.fld{background-color:#FFFFFF;color:#141414}';
          isr.appendChild(st);
          const sel = document.createElement('select');
          sel.className = 'fld'; sel.id = 'innerSel';
          sel.innerHTML = '<option>$ 1,000.00</option>';
          isr.appendChild(sel);
        }, 300);
      }, 600);
    });
    await page.waitForTimeout(2400);
    const lf = await page.evaluate(() => {
      const sr = document.getElementById('lateField').shadowRoot;
      const sel = getComputedStyle(sr.getElementById('lateSel')), lab = getComputedStyle(sr.getElementById('lateLab'));
      const inner = document.getElementById('outerCard').shadowRoot.querySelector('inner-field').shadowRoot;
      const isel = getComputedStyle(inner.getElementById('innerSel'));
      return { bg: sel.backgroundColor, color: sel.color, lab: lab.color, ibg: isel.backgroundColor, icolor: isel.color };
    });
    report(lum(rgb(lf.bg)) < 0.08, `a select styled after its component mounted is dark (${lf.bg})`);
    report(lum(rgb(lf.lab)) > 0.4, `  and its label is light ink (${lf.lab})`);
    report(lum(rgb(lf.ibg)) < 0.08 && lum(rgb(lf.icolor)) > 0.4, `a component mounting inside one seen earlier is reached too (${lf.ibg}, ${lf.icolor})`);
  }

  /* Stand-ins for the transfer confirmation's artwork. */
  console.log('\nthe transfer pages\' pictures: a dark mark on a coloured shape stays dark');
  {
    const art = n => fs.readFileSync(path.join(__dirname, 'art', n), 'utf8');
    await page.evaluate(({ alerts, tick }) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = '<h3>Next steps</h3>';
      const pic = document.createElement('div');
      pic.id = 'nextAlerts';
      pic.setAttribute('style', 'width:72px;height:72px;background-repeat:no-repeat;background-size:contain;background-image: url("data:image/svg+xml,' + encodeURIComponent(alerts) + '");');
      wrap.appendChild(pic);
      const img = document.createElement('img');
      img.id = 'trackTick'; img.width = 58; img.height = 58; img.alt = '';
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(tick);
      wrap.appendChild(img);
      document.querySelector('#card').appendChild(wrap);
    }, { alerts: art('next_alerts.svg'), tick: art('submitted_icon.svg') });
    await page.waitForTimeout(1600);
    const pic = await q('#nextAlerts');
    const svg = decodeURIComponent(pic.bgImage || '');
    report(/stroke=["']#D9D8D5/i.test(svg), 'a 72px picture inlined as a data: URI is edited, its outlines lifted to ink');
    report((svg.match(/fill=["']#4C4C4C/gi) || []).length === 3, '  the dots inside its yellow bubble stay dark (3 of 3)');
    report(/fill=["']#FFCD00/i.test(svg), '  and the bubble keeps its yellow');
    const tick = await page.evaluate(async () => {
      const img = document.getElementById('trackTick');
      const im = new Image(); im.src = img.currentSrc || img.src; await im.decode();
      const cv = document.createElement('canvas'); cv.width = 58; cv.height = 58;
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0, 58, 58);
      return { mid: [...ctx.getImageData(28, 31, 1, 1).data], rewritten: (img.getAttribute('src') || '').indexOf('%3Cstyle') !== -1 || /<style/.test(decodeURIComponent(img.getAttribute('src') || '')) };
    });
    report(tick.mid[1] > tick.mid[0] && tick.mid[2] < 60, `the tracker's tick is a line, not a filled wedge - inside it is still the green disc (${tick.mid.slice(0, 3)})`);
  }

  /* --- stability ----------------------------------------------------------- */
  /* Angular re-runs the passes constantly; a pass over its own output must
     change nothing. */
  console.log('\nstability: mapping twice is the same as mapping once');
  {
    /* #lateGain is the one plain inline colour here, which the inline pass's
       idempotence guard covers */
    const WATCH = ['#swDomestic', '#swForeign', '#swBonds', '#pieDomestic', '#pieBonds',
                   '#colGain', '#colLoss', '#heat2', '#balanceLine', '#chip', '#chipText',
                   '#card', '#asof', '#lateGain'];
    const snap = async () => {
      const out = {};
      for (const sel of WATCH) {
        const v = await q(sel);
        out[sel] = [v.color, v.bg, v.fill, v.stroke].join('|');
      }
      return out;
    };
    const before = await snap();
    await page.evaluate(() => {
      const R = self.FidelityDarkRecolor;
      for (let i = 0; i < 6; i++) {
        document.querySelectorAll('[style]').forEach(el => {
          if (el.dataset) el.dataset.fdmInline = '0';
          R.processInline(el);
        });
        R.recolorChartMarks();
        R.enforceContrast();
      }
    });
    await page.waitForTimeout(250);
    const after = await snap();
    const drifted = WATCH.filter(sel => before[sel] !== after[sel]);
    for (const sel of drifted) console.log(`         ${sel}: ${before[sel]}  →  ${after[sel]}`);
    report(drifted.length === 0, `${WATCH.length} elements survive six more passes unchanged` +
      (drifted.length ? ` (${drifted.length} drifted)` : ''));
  }

  /* --- the feedback loop --------------------------------------------------- */
  /* Regression: the engine must not react to its own <style> writes. 200
     insertions in separate tasks must settle within budget and leave the page
     responsive. */
  console.log('\nthe engine does not feed on its own output');
  {
    /* A loop never settles; a costlier pass only settles later. A clean run
       takes 10 to 12 s on a two-core machine, so the budget sits just above. */
    const budgetMs = 15000;
    const stress = page.evaluate(async () => {
      const t0 = performance.now();
      for (let i = 0; i < 200; i++) {
        const s = document.createElement('style');
        s.textContent = `.stress-${i}{color:#333;background:#fff}`;
        document.head.appendChild(s);
        await new Promise(r => setTimeout(r, 0));   // a separate task each time
      }
      await new Promise(r => setTimeout(r, 400));
      return {
        ms: Math.round(performance.now() - t0),
        emittedMB: +([...document.querySelectorAll('style[data-fidelity-dark="emitted"]')].map(s => s.textContent).join('\n').length / 1048576).toFixed(2)
      };
    });
    const timeout = new Promise(res => setTimeout(() => res('TIMEOUT'), budgetMs));
    const r = await Promise.race([stress, timeout]);
    if (r === 'TIMEOUT') {
      report(false, `the renderer stopped answering under 200 stylesheet insertions (>${budgetMs}ms)`);
    } else {
      report(true, `200 stylesheet insertions settled in ${r.ms}ms, emitted sheet ${r.emittedMB}MB`);
      const card = await q('#card');
      report(card !== null && lum(rgb(card.bg)) < 0.06, 'the page is still responsive and still dark afterwards');
    }
  }

  /* --- layout cost --------------------------------------------------------- */
  /* Layout cost must scale with elements that carry an image, not with every
     element. getBoundingClientRect forces layout, so its calls are counted. */
  console.log('\nthe passes do not force layout on every element');
  {
    const r = await page.evaluate(() => {
      const R = self.FidelityDarkRecolor;
      /* A fresh subtree, as elements already handled are skipped: 400 plain
         elements and two that carry artwork. */
      const host = document.createElement('div');
      host.id = 'perfHost';
      let html = '';
      for (let i = 0; i < 400; i++) html += '<div class="plain-' + i + '"><span>row ' + i + '</span></div>';
      html += '<div class="has-art" style="width:20px;height:20px;background-image:url(\'icon_chevron.svg\')"></div>';
      html += '<img class="has-art2" src="icon_print.svg" width="20" height="20">';
      host.innerHTML = html;
      document.body.appendChild(host);

      const proto = Element.prototype;
      const real = proto.getBoundingClientRect;
      let calls = 0;
      proto.getBoundingClientRect = function () { calls++; return real.apply(this, arguments); };
      const total = host.querySelectorAll('*').length;
      try { R.recolorIconImages(host); } finally { proto.getBoundingClientRect = real; }
      host.remove();
      return { calls, total };
    });
    report(r.calls < r.total * 0.5,
      `the icon sweep asked ${r.calls} of ${r.total} elements for geometry ` +
      `(${(100 * r.calls / r.total).toFixed(0)}%; measuring every element is what froze the tab)`);
  }

  /* --- the fds- design system ---------------------------------------------- */
  /* Expectations are the dark counterparts of light-mode values measured on
     the live site. */
  console.log('\nthe fds- component layer');
  {
    const card = rgb((await q('#card')).bg);

    // radios
    const rOff = await q('#radioWrapOff');
    const rOffDot = await page.evaluate(() => getComputedStyle(document.querySelector('#radioWrapOff'), '::before').backgroundColor);
    report(lum(rgb(rOff.bg)) < 0.05,
      `an unchecked radio is a dark disc, not a pale one (${hex(rgb(rOff.bg))})`);
    report(contrast(rgb(rOff.border), rgb(rOff.bg)) >= 3,
      `and its ring reads against it at ${contrast(rgb(rOff.border), rgb(rOff.bg)).toFixed(2)}:1`);
    report(rgb(rOffDot).r === rgb(rOff.bg).r && rgb(rOffDot).g === rgb(rOff.bg).g,
      `its dot is the disc colour, so nothing shows through (${hex(rgb(rOffDot))})`);

    const rOn = await q('#radioWrapOn');
    const rOnDot = await page.evaluate(() => getComputedStyle(document.querySelector('#radioWrapOn'), '::before').backgroundColor);
    report(sat(rgb(rOn.bg)) > 40 && rgb(rOn.bg).g > rgb(rOn.bg).r,
      `a checked radio is filled green (${hex(rgb(rOn.bg))})`);
    const dotC = contrast(rgb(rOnDot), rgb(rOn.bg));
    report(dotC >= 4.4, `its dot reads on the fill at ${dotC.toFixed(2)}:1, as in light mode (4.51:1)`);
    report(contrast(rgb(rOn.bg), card) >= 3,
      `and the disc itself reads on the card at ${contrast(rgb(rOn.bg), card).toFixed(2)}:1`);

    // checkbox tick
    const cbWrap = await q('#cbWrapOn');
    const tick = await q('#cbTick');
    report(contrast(rgb(tick.color), rgb(cbWrap.bg)) >= 4.4,
      `a checked box's tick reads on its fill at ${contrast(rgb(tick.color), rgb(cbWrap.bg)).toFixed(2)}:1`);

    // the icon-only button, borderless in light mode
    const ask = await q('#askBtn');
    const askBorder = rgb(ask.border);
    report(askBorder.a === 0 || askBorder.a === undefined || ask.border === 'rgba(0, 0, 0, 0)',
      `an icon-only button has no ring drawn round it (${ask.border})`);
    report(ask.bg === 'rgba(0, 0, 0, 0)',
      `and no fill behind it (${ask.bg})`);
    const askStroke = await page.evaluate(() => getComputedStyle(document.querySelector('#askPath')).stroke);
    report(contrast(rgb(askStroke), card) >= 3,
      `but its glyph is visible, at ${contrast(rgb(askStroke), card).toFixed(2)}:1`);

    const pb = await q('#primaryBtn');
    const pl = await q('#primaryLabel');
    const pbC = contrast(rgb(pl.color), rgb(pb.bg));
    report(pbC >= 4.5,
      `a filled button's label reads at ${pbC.toFixed(2)}:1 on ${hex(rgb(pb.bg))} (light mode: 4.51:1)`);
    /* Fidelity's dark mode puts near-black ink (#141414) on a light fill */
    report(lum(rgb(pl.color)) < 0.05, `and the label is dark on the light fill, as Fidelity draws it (${hex(rgb(pl.color))})`);
    /* The apex-kit button's label reads --reference-color-neutral-0, which the
       token layer maps to the card colour; here it must be the fill ink. */
    const ap = await q('#apexPrimary'), apl = await q('#apexPrimaryLabel');
    report(ap.bg === pb.bg, `the apex-kit filled button carries the same fill (${hex(rgb(ap.bg))})`);
    report(apl.color === 'rgb(20, 20, 20)',
      `  and its label is the fill ink rather than the card colour (${hex(rgb(apl.color))} on ${hex(rgb(ap.bg))}, ${contrast(rgb(apl.color), rgb(ap.bg)).toFixed(2)}:1)`);

    // the text field's surface is on the root
    const ir = await q('#inputRoot');
    const ii = await q('#inputInner');
    report(lum(rgb(ir.bg)) < 0.05, `a text field's surface is dark (${hex(rgb(ir.bg))})`);
    report(ii.bg === 'rgba(0, 0, 0, 0)',
      `and the inner input adds no second surface inside it (${ii.bg})`);

    // the popover, and its color(srgb ...) shadow
    const pop = await q('#popover');
    report(lum(rgb(pop.bg)) < 0.09, `a popover is a dark floating layer (${hex(rgb(pop.bg))})`);
    const shadow = await page.evaluate(() => getComputedStyle(document.querySelector('#popover')).boxShadow);
    const shadowLum = (() => { const m = shadow.match(/rgba?\([^)]*\)|color\([^)]*\)/); return m ? lum(rgb(m[0])) : 1; })();
    report(shadowLum < 0.1,
      `and its shadow is dark, not the mid-grey halo FDS writes (${shadow.slice(0, 48)})`);
    const popBody = await q('#popBody');
    report(contrast(rgb(popBody.color), rgb(pop.bg)) >= 4.5,
      `a loss figure inside it reads at ${contrast(rgb(popBody.color), rgb(pop.bg)).toFixed(2)}:1`);

    // table
    const th = await q('#thCell'), td = await q('#tdCell'), tr = await q('#tblRow');
    report(lum(rgb(th.bg)) < 0.09 && lum(rgb(th.bg)) > lum(rgb(tr.bg)),
      `a column header is a step above the row it sits over (${hex(rgb(th.bg))} over ${hex(rgb(tr.bg))})`);
    report(contrast(rgb(td.border), rgb(tr.bg)) < 2.2,
      `and the cell rules are hairlines, not bright wires (${hex(rgb(td.border))})`);

    // spinners
    for (const [id, open] of [['#spinLeft', ['borderRightColor', 'borderBottomColor']],
                              ['#spinRight', ['borderBottomColor', 'borderLeftColor']]]) {
      const v = await page.evaluate(([sel, props]) => {
        const cs = getComputedStyle(document.querySelector(sel));
        return { open: props.map(p => cs[p]), lit: cs.borderTopColor, radius: cs.borderTopLeftRadius };
      }, [id, open]);
      report(v.open.every(c => /rgba\(0, 0, 0, 0\)|transparent/.test(c)),
        `${id} keeps the gap that makes it an arc rather than a closed ring (${v.open.join(', ')})`);
      report(contrast(rgb(v.lit), card) >= 3,
        `  and its lit edge reads at ${contrast(rgb(v.lit), card).toFixed(2)}:1`);
      /* the app draws every spinner in its green; the desktop's neutral grey
         variant follows it */
      report(v.lit === 'rgb(92, 191, 74)', `  and it is the app's green, as every spinner in the app is (${hex(rgb(v.lit))})`);
      report(v.radius === '50%' || parseFloat(v.radius) >= 10,
        `  and it is still round, not a square (${v.radius})`);
    }

    /* an unknown spinner, found by what it does: rotating, with an arc made of
       transparent borders */
    const mys = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('#mysterySpinner'));
      return { lit: cs.borderTopColor, gapR: cs.borderRightColor, gapB: cs.borderBottomColor,
               radius: cs.borderTopLeftRadius, anim: cs.animationName };
    });
    report(contrast(rgb(mys.lit), card) >= 3,
      `an unnamed spinner's arc is visible at ${contrast(rgb(mys.lit), card).toFixed(2)}:1 (${hex(rgb(mys.lit))})`);
    report(/rgba\(0, 0, 0, 0\)|transparent/.test(mys.gapR) && /rgba\(0, 0, 0, 0\)|transparent/.test(mys.gapB),
      `and its gap stays open, so the rotation is visible (${mys.gapR})`);
    report(mys.anim !== 'none', `and it is still animating (${mys.anim})`);
    const svgSpin = await page.evaluate(() => getComputedStyle(document.querySelector('#svgSpinner circle')).stroke);
    report(contrast(rgb(svgSpin), card) >= 3,
      `an SVG spinner's stroke is visible at ${contrast(rgb(svgSpin), card).toFixed(2)}:1 (${hex(rgb(svgSpin))})`);
    report(svgSpin === 'rgb(92, 191, 74)', `  and it is the app's green too (${hex(rgb(svgSpin))})`);

    /* The composite search control: three nested boxes, and light mode fills
       only the outer; an inner one is narrower and square (radius 0). */
    const cbx = await q('#cmpBox'), cr = await q('#cmpRoot'), cf = await q('#cmpField');
    const geom = await page.evaluate(() => {
      const w = s => Math.round(document.querySelector(s).getBoundingClientRect().width);
      return { boxW: w('#cmpBox'), rootW: w('#cmpRoot'), fieldW: w('#cmpField') };
    });
    report(geom.boxW > geom.rootW && geom.rootW > geom.fieldW,
      `three nested boxes, each narrower than the last (${geom.boxW} > ${geom.rootW} > ${geom.fieldW}px), so which one is filled shows`);
    report(lum(rgb(cbx.bg)) < 0.05 && cbx.bg !== 'rgba(0, 0, 0, 0)',
      `the filled box is the outer container, the one light mode fills (${hex(rgb(cbx.bg))})`);
    report(cr.bg === 'rgba(0, 0, 0, 0)' && cf.bg === 'rgba(0, 0, 0, 0)',
      `and nothing inside it paints a second, narrower box (root ${cr.bg}, field ${cf.bg})`);
    report(parseFloat(cbx.radius) >= 12,
      `the box keeps light mode's rounded corners (${cbx.radius})`);
    report(parseFloat(cr.radius) === 0 || cr.bg === 'rgba(0, 0, 0, 0)',
      `and the square inner box stays invisible rather than becoming the control (radius ${cr.radius})`);
    await page.focus('#cmpField');
    const ring = await page.evaluate(() => {
      const box = getComputedStyle(document.getElementById('cmpBox'));
      const field = getComputedStyle(document.getElementById('cmpField'));
      return { boxOutline: box.outlineStyle, boxBorder: box.borderTopColor, fieldOutline: field.outlineStyle,
               fieldShadow: field.boxShadow };
    });
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    report(ring.boxOutline === 'none' && ring.fieldOutline === 'none' && ring.fieldShadow === 'none',
      `a focused search box draws no second ring outside its border (box outline ${ring.boxOutline}, field outline ${ring.fieldOutline})`);
    report(lum(rgb(ring.boxBorder)) > 0.6, `  its border is the focus ring (${hex(rgb(ring.boxBorder))})`);

    /* The homepage CTAs: a legacy gradient that loses to a more specific
       `background-image: none` must still lose once re-emitted !important. */
    for (const [id, name] of [['#sclLogout', 'the primary CTA'], ['#sclOpen', 'the CTA beside it']]) {
      const v = await page.evaluate(sel => {
        const cs = getComputedStyle(document.querySelector(sel));
        return { img: cs.backgroundImage, bg: cs.backgroundColor, color: cs.color };
      }, id);
      report(v.img === 'none',
        `${name} has no resurrected legacy gradient (${v.img.slice(0, 44)})`);
      report(sat(rgb(v.bg)) > 40 && rgb(v.bg).g > rgb(v.bg).b,
        `  and keeps the brand green Fidelity actually gives it (${hex(rgb(v.bg))})`);
      report(contrast(rgb(v.color), rgb(v.bg)) >= 4.5,
        `  with its label at ${contrast(rgb(v.color), rgb(v.bg)).toFixed(2)}:1`);
    }

    /* `tooltip-content` names a bubble in one tooltip and a row in another */
    const tb = await q('#tipBubble'), trow = await q('#tipRow'), tsa = await q('#tipStandalone');
    report(lum(rgb(tb.bg)) < 0.06 && tb.bg !== 'rgba(0, 0, 0, 0)',
      `a tooltip bubble is a dark card (${hex(rgb(tb.bg))})`);
    report(trow.bg === 'rgba(0, 0, 0, 0)',
      `and a row inside it adds no plate of its own, as in light mode (${trow.bg})`);
    report(lum(rgb(tsa.bg)) < 0.06 && tsa.bg !== 'rgba(0, 0, 0, 0)',
      `while a tooltip that IS its content keeps its surface (${hex(rgb(tsa.bg))})`);
    const ttxt = await q('#tipTitle');
    report(contrast(rgb(ttxt.color), rgb(tb.bg)) >= 4.5,
      `  with its title readable at ${contrast(rgb(ttxt.color), rgb(tb.bg)).toFixed(2)}:1`);

    /* The account rail is a card: hovered on its blank part it keeps its
       surface. The waits outlast the nav's all-property transition. */
    const railBefore = await q('#acctRail');
    await page.hover('#acctBlank');
    await page.waitForTimeout(350);
    const railHover = await page.evaluate(() => { const n = document.querySelector('#acctRail'); return { bg: getComputedStyle(n).backgroundColor, hovered: n.matches(':hover') }; });
    report(railHover.hovered, 'the rail is really hovered, so this measures the hover state');
    report(railHover.bg === railBefore.bg && railHover.bg !== 'rgba(0, 0, 0, 0)',
      `  and its surface does not change (${railBefore.bg} -> ${railHover.bg})`);
    await page.hover('#acctRow');
    await page.waitForTimeout(350);
    const rowHover = await page.evaluate(() => ({ row: getComputedStyle(document.querySelector('#acctRow')).backgroundColor, rail: getComputedStyle(document.querySelector('#acctRail')).backgroundColor }));
    report(rowHover.row !== 'rgba(0, 0, 0, 0)' && rowHover.row !== rowHover.rail,
      `  while a hovered row still gets its own plate (${rowHover.row} on ${rowHover.rail})`);
    await page.mouse.move(0, 0);

    /* the lot table in a position's drawer, where `[class*="pvd-tab"]` also
       matches pvd-table */
    const lot = await page.evaluate(() => ({ gain: getComputedStyle(document.querySelector('#lotGain')).color, loss: getComputedStyle(document.querySelector('#lotLoss')).color, plain: getComputedStyle(document.querySelector('#lotPlain')).color }));
    report(lot.gain === 'rgb(92, 191, 74)', `a lot's gain reads in the gain green, not tab grey (${hex(rgb(lot.gain))})`);
    report(lot.loss === 'rgb(255, 104, 104)', `  its loss in the loss red (${hex(rgb(lot.loss))})`);
    report(lot.plain === 'rgb(255, 255, 255)', `  and a plain figure in primary ink (${hex(rgb(lot.plain))})`);

    /* AG Grid nests its focus ring as `&:focus-visible`; emitted bare it would
       match every focused control */
    const nest = await page.evaluate(() => {
      const css = [...document.querySelectorAll('style[data-fidelity-dark="emitted"]')].map(s => s.textContent).join('\n');
      return { bare: /(^|[}\s])&/.test(css.replace(/\{[^}]*\}/g, '{}')), composed: /:is\(\.nestHost\) \.nestChild/.test(css), inBg: getComputedStyle(document.querySelector('#nestIn')).backgroundColor, outBg: getComputedStyle(document.querySelector('#nestOut')).backgroundColor };
    });
    report(!nest.bare, 'no emitted selector starts with a bare & (a nested rule is composed under its parent)');
    report(nest.composed, '  the nested child rule is emitted as :is(.nestHost) .nestChild');
    report(nest.inBg === 'rgb(41, 41, 40)' && nest.outBg === 'rgba(0, 0, 0, 0)',
      `  so it paints the child inside its parent (${hex(rgb(nest.inBg))}) and not the same class outside it (${nest.outBg})`);

    /* The Documents page: a white border-left that spaces the side nav, a
       table root named --disable-column-dividers, and two greys of row line. */
    const dn = await q('#docNav'), dni = await page.evaluate(() => { const n = document.querySelector('#docNavItem'); const cs = getComputedStyle(n); return { bl: cs.borderLeftColor, w: cs.borderLeftWidth }; });
    report(dni.bl === dn.bg, `the side nav's white border-left stays invisible on the nav (${hex(rgb(dni.bl))} on ${hex(rgb(dn.bg))}, ${dni.w} wide)`);
    const dtr = await q('#docTableRoot');
    report(dtr.bg === 'rgba(0, 0, 0, 0)', `a table root named --disable-column-dividers is not a divider (${dtr.bg})`);
    const dLines = await page.evaluate(() => ({ data: getComputedStyle(document.querySelector('#docCellData')).borderTopColor, head: getComputedStyle(document.querySelector('#docCellHead')).borderTopColor }));
    report(dLines.data === dLines.head && dLines.data === 'rgb(64, 63, 62)',
      `  and its two greys of row line become one subtle line (${hex(rgb(dLines.data))} / ${hex(rgb(dLines.head))})`);
    const dCorners = await page.evaluate(() => ({ first: getComputedStyle(document.querySelector('#docLastFirst')).borderBottomLeftRadius, last: getComputedStyle(document.querySelector('#docLastLast')).borderBottomRightRadius }));
    report(dCorners.first === dCorners.last && dCorners.first === '12px',
      `  and its fourth corner is rounded like the other three (${dCorners.first} / ${dCorners.last})`);

    /* The Positions grid follows the app: a low container (#1C1B1B) under a
       black header row, account rows at the card colour, traded-today rows
       #262100, while the account rail beside it stays a card. */
    const gTile = await q('#gridTile'), gRoot = await q('#gridRoot'), gHead = await q('#gridHead');
    const gAcct = await q('#gridAcct'), gPos = await q('#gridPos'), gToday = await q('#gridToday'), gSpacer = await q('#gridSpacer');
    const RECESS = 'rgb(28, 27, 27)', CARD = 'rgb(41, 41, 40)', PAGE = 'rgb(20, 20, 20)';
    report(gTile.bg === RECESS, `the tile that holds a grid is the low surface (${hex(rgb(gTile.bg))})`);
    const gOv = await page.evaluate(() => getComputedStyle(document.querySelector('#gridTile')).overflow);
    report(gOv === 'visible', `  and clips nothing, so the kebab menu that opens up past its top edge is whole (${gOv})`);
    /* the kebab menu: the bubble and arrow its component draws */
    const kb = await page.evaluate(() => {
      const host = document.getElementById('kebabHost');
      const bub = host.shadowRoot.getElementById('kebabBubble');
      const arrow = host.shadowRoot.querySelector('.arrow');
      return { host: getComputedStyle(host).backgroundColor, content: getComputedStyle(document.getElementById('kebabContent')).backgroundColor,
               bubble: getComputedStyle(bub).backgroundColor, arrow: getComputedStyle(arrow).borderLeftColor,
               item: getComputedStyle(document.getElementById('kebabItem')).color,
               list: getComputedStyle(document.getElementById('kebabList')).backgroundColor,
               listShadow: getComputedStyle(document.getElementById('kebabList')).boxShadow };
    });
    report(kb.host === 'rgba(0, 0, 0, 0)' && kb.content === 'rgba(0, 0, 0, 0)' && kb.list === 'rgba(0, 0, 0, 0)',
      `  the kebab menu's host and its slotted list are see-through, as on white (${kb.host} / ${kb.content} / ${kb.list})`);
    report(kb.listShadow === 'none', `  and the list casts no shadow of its own inside the bubble, which banded its padding (${kb.listShadow})`);
    report(rgb(kb.bubble) && lum(rgb(kb.bubble)) < 0.05 && kb.arrow === kb.bubble,
      `  so the menu is one dark bubble, and its arrow is the bubble's colour (${hex(rgb(kb.bubble))} / ${rgb(kb.arrow) ? hex(rgb(kb.arrow)) : kb.arrow})`);
    report(rgb(kb.item) && contrast(rgb(kb.item), rgb(kb.bubble)) >= 4.5, `  and its items read on it (${rgb(kb.item) ? contrast(rgb(kb.item), rgb(kb.bubble)).toFixed(2) : '?'}:1)`);
    report(gRoot.bg === RECESS, `  and so is the grid shell (${hex(rgb(gRoot.bg))})`);
    report(gHead.bg === 'rgb(0, 0, 0)', `  under a black column-header row, as in the app (${hex(rgb(gHead.bg))})`);
    report(gPos.bg === 'rgba(0, 0, 0, 0)', `  a position row adds no plate of its own, so it sits on the recess (${gPos.bg})`);
    report(gAcct.bg === CARD, `  the account row is lifted to the card colour (${hex(rgb(gAcct.bg))})`);
    report(gToday.bg === 'rgb(38, 33, 0)', `  a position traded today takes the app's #262100 (${hex(rgb(gToday.bg))})`);
    report(gSpacer.bg === PAGE, `  and the spacer between accounts shows the page (${hex(rgb(gSpacer.bg))})`);
    const gLine = await page.evaluate(() => ({ row: getComputedStyle(document.querySelector('#gridPos')).borderBottomColor, cell: getComputedStyle(document.querySelector('#gridPosCell')).borderRightColor }));
    report(gLine.row === 'rgb(64, 63, 62)' && gLine.cell === gLine.row,
      `  row and cell lines are the subtle line (${hex(rgb(gLine.row))}), 1.64:1 on the recess as #ccc is on white`);
    const gInk = await q('#gridPosCell'), gGain = await q('#gridTodayGain'), gLoss = await q('#gridTodayLoss');
    report(contrast(rgb(gInk.color), rgb(RECESS)) >= 4.5, `  cell ink reads on the recess at ${contrast(rgb(gInk.color), rgb(RECESS)).toFixed(2)}:1`);
    report(contrast(rgb(gGain.color), rgb(gToday.bg)) >= 4.5 && contrast(rgb(gLoss.color), rgb(gToday.bg)) >= 4.5,
      `  gain and loss ink read on the marked row at ${contrast(rgb(gGain.color), rgb(gToday.bg)).toFixed(2)}:1 and ${contrast(rgb(gLoss.color), rgb(gToday.bg)).toFixed(2)}:1`);
    report(railBefore.bg === CARD, `  while the account rail beside it stays a card (${hex(rgb(railBefore.bg))})`);
    await page.hover('#gridPos2');
    await page.waitForTimeout(100);
    const gHover = await page.evaluate(() => { const n = document.querySelector('#gridPos2'); n.classList.add('ag-row-hover'); const bg = getComputedStyle(n).backgroundColor; n.classList.remove('ag-row-hover'); return bg; });
    report(gHover === CARD, `  a hovered row lifts to the card colour, Fidelity's own dark hover fill (${hex(rgb(gHover))})`);
    /* Light mode drops a traded-today row's yellow for the ordinary hover, so
       the wash only ever matches the legend's key; the same here. */
    const gTodayHover = await page.evaluate(() => { const n = document.querySelector('#gridToday'); n.classList.add('ag-row-hover'); const bg = getComputedStyle(n).backgroundColor; const cell = getComputedStyle(n.querySelector('.ag-cell')).backgroundColor; n.classList.remove('ag-row-hover'); return { bg, cell }; });
    report(gTodayHover.bg === CARD && gTodayHover.cell === 'rgba(0, 0, 0, 0)',
      `  and a hovered traded-today row takes that same hover, as in light mode, not a second yellow (${hex(rgb(gTodayHover.bg))})`);
    await page.mouse.move(0, 0);

    /* The signed-out masthead: a #368727 utility bar under a white wordmark, a
       hero Log In that is an unclassed <a> in a scl-button wrapper, and a
       level-2 lock glyph drawn into ::after. */
    const ob = await q('#outBar'), ol = await q('#outLogoPath');
    /* The bar's two pills follow the app: a CTA fill under dark ink for "Open
       an account", an outline under white for "Log in". */
    const bo = await q('#barOpen'), bol = await q('#barOpenLabel'), bl = await q('#barLogin'), bll = await q('#barLoginLabel');
    report(bo.bg === 'rgb(92, 191, 74)' && bol.color === 'rgb(20, 20, 20)',
      `"Open an account" on the signed-out bar is the CTA fill under dark ink (${hex(rgb(bol.color))} on ${hex(rgb(bo.bg))})`);
    report(bl.bg === 'rgba(0, 0, 0, 0)' && bll.color === 'rgb(255, 255, 255)' && /rgba\(255, 255, 255, 0\.64\)/.test(bl.border),
      `  and "Log in" beside it is an outline under white (${bll.color} on ${bl.bg}, border ${bl.border})`);
    await page.hover('#barOpen');
    await page.waitForTimeout(150);
    const boH = await page.evaluate(() => { const n = document.querySelector('#barOpen'); return { bg: getComputedStyle(n).backgroundColor, hovered: n.matches(':hover') }; });
    report(boH.hovered && boH.bg === 'rgb(127, 199, 115)', `  hovering the CTA lifts it to the app's lit green (${hex(rgb(boH.bg))})`);
    await page.mouse.move(0, 0);
    report(lum(rgb(ob.bg)) < 0.08, `the signed-out utility bar is a dark bar (${hex(rgb(ob.bg))})`);
    report(lum(rgb(ol.fill)) > 0.85, `  and its white wordmark stays white on it (${hex(rgb(ol.fill))})`);
    const hl = await q('#heroLogin'), ho = await q('#heroOpen'), hk = await q('#heroLink');
    report(contrast(rgb(hl.color), rgb(hl.bg)) >= 4.5 && lum(rgb(hl.color)) < 0.1,
      `the hero Log In label is dark on the light fill (${hex(rgb(hl.color))} on ${hex(rgb(hl.bg))}, ${contrast(rgb(hl.color), rgb(hl.bg)).toFixed(2)}:1)`);
    report(contrast(rgb(ho.color), rgb(ho.bg)) >= 4.5,
      `the outline button's label reads on it (${hex(rgb(ho.color))} on ${hex(rgb(ho.bg))}, ${contrast(rgb(ho.color), rgb(ho.bg)).toFixed(2)}:1)`);
    const lockAfter = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('#lockItem'), '::after'); return { bg: cs.backgroundColor, filter: cs.filter, img: cs.backgroundImage.indexOf('url(') !== -1 }; });
    report(lockAfter.bg === 'rgba(0, 0, 0, 0)', `a level-2 lock glyph gets no white square behind it (${lockAfter.bg})`);
    report(lockAfter.img && /invert/.test(lockAfter.filter), `  and the black glyph is inverted to read on the menu (${lockAfter.filter})`);
    const l1 = await page.evaluate(() => getComputedStyle(document.querySelector('#navL1 span'), '::after').backgroundColor);
    report(lum(rgb(l1)) > 0.85, `  while the level-1 indicator bar is still ink (${hex(rgb(l1))})`);

    /* `ghost` is a skeleton synonym, but `pi-disclaimer__ghostlink` is a link */
    const gl = await q('#ghostLink'), gbar = await q('#ghostBar');
    report(gl.color !== 'rgba(0, 0, 0, 0)' && contrast(rgb(gl.color), card) >= 4.5,
      `a link called ghostlink keeps readable text (${hex(rgb(gl.color))}, ${contrast(rgb(gl.color), card).toFixed(2)}:1)`);
    report(gl.bg === 'rgba(0, 0, 0, 0)', `  and gets no skeleton plate (${gl.bg})`);
    report(lum(rgb(gbar.bg)) < 0.08 && gbar.bgImage.indexOf('gradient') !== -1,
      `  while an empty ghost bar is still dimmed and shimmering (${hex(rgb(gbar.bg))})`);

    /* A section-sized #368727 band is a surface, not a button fill: it takes
       Fidelity's surface-fixed evergreen under white ink. */
    const gb = await q('#greenBand'), gbt = await q('#greenBandTitle'), gbp = await q('#greenBandText');
    report(hex(rgb(gb.bg)) === '#044014', `a brand-green section band goes evergreen (${hex(rgb(gb.bg))})`);
    report(lum(rgb(gbt.color)) > 0.9 && lum(rgb(gbp.color)) > 0.9,
      `  and keeps its white ink (${hex(rgb(gbt.color))}, ${hex(rgb(gbp.color))})`);
    report(contrast(rgb(gbp.color), rgb(gb.bg)) >= 4.5,
      `  at ${contrast(rgb(gbp.color), rgb(gb.bg)).toFixed(2)}:1`);

    /* A nav-item rule that underlines in currentColor (on a button, the label
       colour) reaches the homepage CTAs through their wrapper's class. */
    for (const [id, name] of [['#sclLogout', 'the green CTA'], ['#sclOpen', 'the CTA beside it']]) {
      await page.hover(id);
      const b = await page.evaluate(sel => {
        const cs = getComputedStyle(document.querySelector(sel));
        return { t: cs.borderTopColor, r: cs.borderRightColor, b: cs.borderBottomColor,
                 l: cs.borderLeftColor, color: cs.color, hovered: document.querySelector(sel).matches(':hover') };
      }, id);
      report(b.hovered, `${name} is really hovered, so this measures the hover state`);
      report(b.b === b.t && b.b === b.l && b.b === b.r,
        `  and its four borders still agree (bottom ${b.b}, top ${b.t})`);
      report(b.b !== b.color,
        `  so no underline in its own label colour appears (label ${b.color})`);
    }

    /* A real menu item in the same wrapper keeps the bottom border it came
       with, as a line the engine's colour map made visible on the dark card. */
    await page.hover('#postLoginItem');
    const mi = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('#postLoginItem'));
      return { bb: cs.borderBottomColor, color: cs.color, hovered: document.querySelector('#postLoginItem').matches(':hover') };
    });
    report(mi.hovered && mi.bb !== 'rgba(0, 0, 0, 0)' && contrast(rgb(mi.bb), card) >= 3,
      `a real menu item beside them keeps a visible bottom border (${hex(rgb(mi.bb))}, ${contrast(rgb(mi.bb), card).toFixed(2)}:1 on the card)`);
    await page.mouse.move(0, 0);

    /* The header's Profile menu: a hovered item shows the 1px indicator bar in
       ink and nothing else. Its 2px border is transparent in light mode (the
       focus ring colours it in) and must stay transparent on hover, not become
       a second line in the text colour. */
    const upRest = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('#utilProfile'));
      return { bb: cs.borderBottomColor, bw: cs.borderBottomWidth, color: cs.color };
    });
    await page.hover('#utilProfile');
    const up = await page.evaluate(() => {
      const a = document.querySelector('#utilProfile');
      const cs = getComputedStyle(a), bar = getComputedStyle(document.querySelector('#utilProfileLabel'), '::after');
      /* the menu's paint: the first ancestor with a background of its own */
      let el = a, menuBg = 'rgba(0, 0, 0, 0)';
      while (el && menuBg === 'rgba(0, 0, 0, 0)') { menuBg = getComputedStyle(el).backgroundColor; el = el.parentElement; }
      return { hovered: a.matches(':hover'), bb: cs.borderBottomColor, bt: cs.borderTopColor, bw: cs.borderBottomWidth, color: cs.color,
               deco: cs.textDecorationLine, bar: bar.backgroundColor, barH: bar.height, menuBg };
    });
    report(up.hovered, 'the Profile menu item is really hovered, so this measures the hover state');
    report(upRest.bb === 'rgba(0, 0, 0, 0)' && upRest.bw === '2px',
      `  at rest its 2px border is transparent, as the page has it (${upRest.bb})`);
    report(up.bb === 'rgba(0, 0, 0, 0)' && up.bt === 'rgba(0, 0, 0, 0)',
      `  and hovering leaves the border transparent instead of drawing a ${up.bw} line in the text colour (${up.bb})`);
    report(lum(rgb(up.menuBg)) < 0.1, `  the menu itself is a dark panel (${hex(rgb(up.menuBg))})`);
    report(up.barH === '1px' && lum(rgb(up.bar)) > 0.5 && contrast(rgb(up.bar), rgb(up.menuBg)) >= 4.5,
      `  while the 1px indicator bar under the label is ink (${hex(rgb(up.bar))} on ${hex(rgb(up.menuBg))})`);
    report(contrast(rgb(up.color), rgb(up.menuBg)) >= 4.5,
      `  and the label reads on the menu (${hex(rgb(up.color))} on ${hex(rgb(up.menuBg))}, ${contrast(rgb(up.color), rgb(up.menuBg)).toFixed(2)}:1)`);
    await page.mouse.move(0, 0);

    /* a brand button whose border is its fill green */
    const bb = await q('#brandBtn');
    report(hex(rgb(bb.bg)) === hex(rgb(bb.border)),
      `a filled brand button has no ring of its own (fill ${hex(rgb(bb.bg))}, border ${hex(rgb(bb.border))})`);
    report(contrast(rgb(bb.color), rgb(bb.bg)) >= 4.5,
      `  and its label reads at ${contrast(rgb(bb.color), rgb(bb.bg)).toFixed(2)}:1`);

    const shell = await q('#faShell'), field = await q('#faField'), faB = await q('#faBtn');
    report(lum(rgb(shell.bg)) < 0.05 && shell.bg !== 'rgba(0, 0, 0, 0)',
      `the assistant control's box is the container light mode fills (${hex(rgb(shell.bg))})`);
    report(field.bg === 'rgba(0, 0, 0, 0)',
      `and the field inside it adds no second surface (${field.bg})`);
    report(contrast(rgb(faB.border), card) >= 3,
      `the assistant button keeps its ring, readable at ${contrast(rgb(faB.border), card).toFixed(2)}:1 (${hex(rgb(faB.border))})`);

    /* The customer service page's assistant field: an fds- root around a pvd-
       input. The input is the surface; the root, transparent in light mode,
       must not become a square plate behind it. */
    const csRoot = await q('#csvaRoot'), csField = await q('#csvaField');
    report(csRoot.bg === 'rgba(0, 0, 0, 0)' && csRoot.border === 'rgba(0, 0, 0, 0)',
      `an fds- root around a pvd- input paints nothing, as in light mode (${csRoot.bg})`);
    report(csField.bg !== 'rgba(0, 0, 0, 0)' && lum(rgb(csField.bg)) < 0.08 && contrast(rgb(csField.border), rgb(csField.bg)) >= 3,
      `  while the rounded field inside it is the surface, with a readable edge (${hex(rgb(csField.bg))}, border ${hex(rgb(csField.border))})`);
    await page.focus('#csvaField');
    const csFocus = await page.evaluate(() => {
      const r = getComputedStyle(document.querySelector('#csvaRoot')), f = getComputedStyle(document.querySelector('#csvaField'));
      return { rootOutline: r.outlineStyle, rootBg: r.backgroundColor, fieldOutline: f.outlineStyle + ' ' + f.outlineWidth };
    });
    report(csFocus.rootOutline === 'none' && csFocus.rootBg === 'rgba(0, 0, 0, 0)' && /solid 2px/.test(csFocus.fieldOutline),
      `  and focus rings the field, not the root (field ${csFocus.fieldOutline}, root ${csFocus.rootOutline})`);
    await page.evaluate(() => document.querySelector('#csvaField').blur());

    /* Its send arrow is a background picture the page swaps by class once
       the field has text. The edited copy is written inline, so the swap has
       to be noticed (picturesChanged) or the arrow would never light up. */
    const arrowPic = () => page.evaluate(() => {
      const el = document.querySelector('#csvaArrow');
      const bi = getComputedStyle(el).backgroundImage;
      const m = /url\("?([^")]+)"?\)/.exec(bi);
      let svg = m ? m[1] : '';
      try { svg = /base64,/.test(svg) ? atob(svg.split('base64,')[1]) : decodeURIComponent(svg.replace(/^data:[^,]*,/, '')); } catch (e) {}
      return { inline: el.style.getPropertyValue('background-image') !== '', rest: svg.indexOf('restArrow') !== -1, active: svg.indexOf('activeArrow') !== -1,
               brandBlue: /#0E67A9/i.test(svg), cls: el.className };
    });
    const restPic = await arrowPic();
    report(restPic.inline && restPic.rest && !restPic.brandBlue,
      `the send arrow at rest is the edited pale picture (inline ${restPic.inline}, rest art ${restPic.rest}, brand blue left ${restPic.brandBlue})`);
    await page.evaluate(() => { document.querySelector('#csvaArrow').classList.add('active'); document.querySelector('#csvaSend').disabled = false; });
    await page.waitForTimeout(900);
    const activePic = await arrowPic();
    report(activePic.active && !activePic.rest,
      `  and once the field has text, the class swap shows the filled picture (active art ${activePic.active}, rest art ${activePic.rest})`);
    report(activePic.inline && !activePic.brandBlue,
      `  edited for the dark field in its turn (inline ${activePic.inline}, brand blue left ${activePic.brandBlue})`);
    await page.evaluate(() => { document.querySelector('#csvaArrow').classList.remove('active'); document.querySelector('#csvaSend').disabled = true; });
    await page.waitForTimeout(900);
    const backPic = await arrowPic();
    report(backPic.rest && !backPic.active && backPic.inline,
      `  and back to the pale one when it empties (rest art ${backPic.rest}, inline ${backPic.inline})`);
    /* an unrelated class change on an element with no picture costs nothing visible */
    await page.evaluate(() => { document.querySelector('#csvaField').classList.add('ng-dirty'); });
    await page.waitForTimeout(700);
    const stillPic = await arrowPic();
    report(stillPic.rest && stillPic.inline, `  while a class change beside it leaves the picture alone (rest art ${stillPic.rest})`);
    /* A picture the page itself set inline (the search icon above) must not
       be mistaken for a swap when an ancestor's class changes: the engine's
       copy is lifted to the page's own value for the read, not to nothing. */
    const inlineIcon = () => page.evaluate(() => {
      const el = document.getElementById('iconInline');
      const v = el.style.getPropertyValue('background-image');
      let svg = v;
      try { svg = decodeURIComponent(v); } catch (e) { /* raw */ }
      return { black: /#000000/i.test(svg), edited: /fill=['"]?#(?!000000)[0-9a-f]{6}/i.test(svg) || /:not\(\[fill\]\)|svg\{color:/.test(svg) };
    });
    const before = await inlineIcon();
    await page.evaluate(() => { document.body.classList.add('fdm-test-modal-open'); });
    await page.waitForTimeout(150);
    const during = await inlineIcon();
    await page.waitForTimeout(1200);
    const after = await inlineIcon();
    await page.evaluate(() => { document.body.classList.remove('fdm-test-modal-open'); });
    report(before.edited && !before.black, `a search icon the page set inline is served edited (edited ${before.edited})`);
    report(during.edited && !during.black, `  and stays edited through a class change on <body> (black art back ${during.black})`);
    report(after.edited && !after.black, `  with no flicker and no second edit needed later (edited ${after.edited})`);

    /* the nav's hover indicator, an ::after background: ink, not a surface */
    const nav = await page.evaluate(() => {
      const af = getComputedStyle(document.querySelector('#navLabel'), '::after');
      const label = getComputedStyle(document.querySelector('#navLabel'));
      return { bar: af.backgroundColor, h: af.height, text: label.color };
    });
    const header = rgb((await q('#card')).bg);
    report(contrast(rgb(nav.bar), header) >= 3,
      `the nav indicator reads against the header at ${contrast(rgb(nav.bar), header).toFixed(2)}:1 (${hex(rgb(nav.bar))})`);
    report(lum(rgb(nav.bar)) > lum(header),
      'and it is lighter than the surface, not a black bar cut into it');

    /* a pvd radio: its checked dot is a small empty div in the brand colour */
    const pvdOn = await q('#pvdWrapOn');
    const pvdOff = await q('#pvdWrapOff');
    const pvdDot = await page.evaluate(() =>
      getComputedStyle(document.querySelector('#pvdWrapOn'), '::before').backgroundColor);
    const fdsOn = await q('#radioWrapOn');
    report(hex(rgb(pvdOn.bg)) === hex(rgb(fdsOn.bg)),
      `both namespaces render a checked control identically (${hex(rgb(pvdOn.bg))} vs ${hex(rgb(fdsOn.bg))})`);
    report(contrast(rgb(pvdDot), rgb(pvdOn.bg)) >= 4.4,
      `  its dot reads on the fill at ${contrast(rgb(pvdDot), rgb(pvdOn.bg)).toFixed(2)}:1`);
    report(contrast(rgb(pvdOn.bg), card) >= 3,
      `  and the disc reads on the card at ${contrast(rgb(pvdOn.bg), card).toFixed(2)}:1`);
    report(lum(rgb(pvdOff.bg)) < 0.05 && rgb(pvdOff.bg).r === card.r,
      `an unchecked one is the card colour, as a white disc is on white (${hex(rgb(pvdOff.bg))})`);

    /* dimPlaceholders on two empty blocks that both count as light: only the
       grey one is a skeleton, not #4FB53E (a checked radio's fill) */
    const dim = await page.evaluate(() => {
      const R = self.FidelityDarkRecolor;
      const host = document.createElement('div');
      host.innerHTML =
        '<div id="dimGrey"  style="width:16px;height:16px;background-color:#E8E8E8"></div>' +
        '<div id="dimGreen" style="width:16px;height:16px;background-color:#4FB53E"></div>';
      document.body.appendChild(host);
      R.dimPlaceholders(host);
      const g = getComputedStyle(document.getElementById('dimGrey')).backgroundColor;
      const c = getComputedStyle(document.getElementById('dimGreen')).backgroundColor;
      host.remove();
      return { grey: g, green: c };
    });
    report(lum(rgb(dim.grey)) < 0.05,
      `a pale grey block of the same size IS dimmed (${hex(rgb(dim.grey))})`);
    report(sat(rgb(dim.green)) > 40,
      `but one carrying a hue is left alone - it is a control, not a skeleton (${hex(rgb(dim.green))})`);

    /* Fidelity's spinner, by its real class names (loading-indicator) */
    const orb = await page.evaluate(() => {
      const c = getComputedStyle(document.querySelector('#fdsSpinOrb'));
      const wrap = getComputedStyle(document.querySelector('#fdsSpin'));
      return { bg: c.backgroundColor, img: c.backgroundImage, lit: c.borderTopColor,
               gap: c.borderRightColor, radius: c.borderTopLeftRadius, anim: c.animationName,
               wrapBg: wrap.backgroundColor, wrapImg: wrap.backgroundImage };
    });
    report(orb.bg === 'rgba(0, 0, 0, 0)' && orb.img === 'none',
      `the spinner has no surface of its own (${orb.bg}, ${orb.img.slice(0, 26)})`);
    report(orb.wrapImg === 'none',
      `and no shimmer gradient was painted over it (${orb.wrapImg.slice(0, 30)})`);
    report(/rgba\(0, 0, 0, 0\)|transparent/.test(orb.gap),
      `its arc still has a gap, so the rotation reads (${orb.gap})`);
    report(contrast(rgb(orb.lit), card) >= 3,
      `and the arc is visible at ${contrast(rgb(orb.lit), card).toFixed(2)}:1 (${hex(rgb(orb.lit))})`);
    report(orb.anim !== 'none' && orb.radius === '50%',
      `still round and still turning (${orb.radius}, ${orb.anim})`);

    /* The one that IS a skeleton, distinguished only by its suffix. */
    const va = await q('#vaShimmer');
    report(lum(rgb(va.bg)) < 0.08,
      `the shimmer component beside it is still dimmed (${hex(rgb(va.bg))})`);

    // a class containing "skeleton" is dimmed by the theme CSS, no pass needed
    const nsk = await q('#namedSkeleton');
    report(lum(rgb(nsk.bg)) < 0.08, `a named skeleton is dark before any pass runs (${hex(rgb(nsk.bg))})`);
    report(!/#EDEDED|237, 237, 237|247, 247, 247/i.test(nsk.bgImage),
      'and its shimmer is not Fidelity\'s near-white gradient');

    // two legend swatch shapes the inline pass must treat as chart marks
    for (const id of ['#swItemColor', '#swSymbolBox']) {
      const v = await q(id);
      const c = rgb(v.bg);
      report(sat(c) > 25, `${id} still carries a series colour rather than being greyed out (${hex(c)})`);
      const isMark = await page.evaluate(sel => self.FidelityDarkRecolor.isChartMark(document.querySelector(sel)), id);
      report(isMark, `  and the inline pass is told to leave it alone`);
    }
  }

  /* --- one page, one colour ------------------------------------------------ */
  /* Fund research paints both the body and a full-width <main> white. From
     here on, open() loads each case on its own page, like the fixture. */
  const open = async file => {
    const p = await browser.newPage();
    await p.addInitScript(() => {
      window.chrome = {
        storage: { sync: { get: (d, cb) => cb && cb({}), set: (v, cb) => cb && cb() }, onChanged: { addListener(fn) { window.__fdmStorageChanged = fn; } } },
        runtime: { id: 'fdm-test', sendMessage(msg, cb) { cb && cb({ sheets: [] }); }, lastError: null }
      };
    });
    await p.goto(origin + '/' + file);
    for (const f of THEME) {
      const h = await p.addStyleTag({ content: read(f) });
      await h.evaluate(n => { n.dataset.fidelityDark = 'theme'; });
    }
    for (const f of SCRIPTS) await p.addScriptTag({ content: read(f) });
    await p.waitForTimeout(2200);
    return p;
  };

  console.log('\na page painted white twice is one page');
  {
    const bgOf = (p, id) => p.evaluate(i => getComputedStyle(document.getElementById(i)).backgroundColor, id);
    const pw = await open('page_white.html');
    const main = rgb(await bgOf(pw, 'pwMain'));
    const body = rgb(await pw.evaluate(() => getComputedStyle(document.body).backgroundColor));
    report(main && body && hex(main) === hex(body), `the full-width white <main> takes the page colour, as the body does (${main ? hex(main) : '?'} / ${body ? hex(body) : '?'})`);
    report(main && hex(main) === '#141414', `  and that colour is the app's page colour (${main ? hex(main) : '?'})`);
    const cardBg = rgb(await bgOf(pw, 'pwCard')), band = rgb(await bgOf(pw, 'pwBand'));
    report(cardBg && hex(cardBg) === '#292928', `a narrower white card on it is still a card (${cardBg ? hex(cardBg) : '?'})`);
    report(band && hex(band) !== '#141414', `a short grey band is still a band (${band ? hex(band) : '?'})`);
    /* a grid one shade from the panel it fills shows the panel, named or not */
    const panel = rgb(await bgOf(pw, 'pwPanel')), named = await bgOf(pw, 'pwNamedGrid'), grid = await bgOf(pw, 'pwGrid');
    const gridCard = rgb(await bgOf(pw, 'pwGridCard'));
    report(panel && hex(panel) === '#0E0E0E' && named === 'rgba(0, 0, 0, 0)',
      `the research tab panel is the sunken colour and its named card grid lets it show (${panel ? hex(panel) : '?'}, ${named})`);
    report(grid === 'rgba(0, 0, 0, 0)' && gridCard && hex(gridCard) === '#292928',
      `  so does a grid the theme does not name, a shade off the panel in light mode, while its cards stay cards (${grid}, ${gridCard ? hex(gridCard) : '?'})`);
    /* A route mounts a full-width white wrapper into <main> after <main> was
       already flattened to the page colour (an inline write). Light mode has
       both white, so the wrapper must show the page, not sit on it as a card:
       the light read has to see past the engine's own inline value. */
    await pw.evaluate(() => {
      const late = document.createElement('div');
      late.id = 'pwLate';
      late.className = 'late-dashboard';
      const st = document.createElement('style');
      st.textContent = '.late-dashboard{background-color:#ffffff;min-height:900px;padding:16px} .late-dashboard .strip{background-color:#ffffff;height:60px;box-shadow:#ffffff 3000px 0 0,#ffffff -3000px 0 0}';
      document.head.appendChild(st);
      late.innerHTML = '<div class="strip" id="pwStrip">Overview Chart Composition</div><div class="card" id="pwLateCard">A card</div>';
      document.getElementById('pwMain').appendChild(late);
    });
    await pw.waitForTimeout(2600);
    const late = await bgOf(pw, 'pwLate'), lateMain = rgb(await bgOf(pw, 'pwMain')), lateCard = rgb(await bgOf(pw, 'pwLateCard'));
    report(late === 'rgba(0, 0, 0, 0)' && lateMain && hex(lateMain) === '#141414',
      `a white wrapper mounted later into the flattened page shows the page through it (${late}, page ${lateMain ? hex(lateMain) : '?'})`);
    report(lateCard && hex(lateCard) === '#292928', `  while a card inside it is still a card (${lateCard ? hex(lateCard) : '?'})`);
    await pw.close();
    const pt = await open('page_tinted.html');
    const tm = rgb(await bgOf(pt, 'ptMain'));
    report(tm && hex(tm) === '#292928', `a white main on a tinted page is a card, not the page (${tm ? hex(tm) : '?'})`);
    await pt.close();
  }

  /* --- a copied picture resolves against <base href> ----------------------- */
  /* A re-emitted background-image url resolves against <base href> (the
     portfolio app's is "/"), not the page's own path. */
  console.log('\na copied picture resolves against the page\'s base url, as the page does');
  {
    const pb = await open('deep/path/page_base.html');
    const emitted = await pb.evaluate(() => {
      const t = [...document.querySelectorAll('style[data-fidelity-dark="emitted"]')].map(s => s.textContent).join('\n');
      const i = t.indexOf('expand-collapse-button-icon');
      if (i === -1) return null;
      const m = /url\("([^"]*)"\)/.exec(t.slice(i, t.indexOf('}', i)));
      return m ? m[1] : null;
    });
    report(emitted === origin + '/collapse_panel.svg', `the copied rule names the icon at the base url (${emitted ? emitted.replace(origin, '') : 'no copy'})`);
    /* and the icon shows: its dark drawing, edited to ink */
    for (let t = 0; t < 30; t++) {
      if (await pb.evaluate(() => /^url\("data:/.test(getComputedStyle(document.getElementById('pbIcon')).backgroundImage))) break;
      await pb.waitForTimeout(100);
    }
    const shot = await (await pb.$('#pbIcon')).screenshot();
    const lit = await pb.evaluate(async b64 => {
      const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
      const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let max = 0, min = 255;
      for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; max = Math.max(max, l); min = Math.min(min, l); }
      return { max, min };
    }, shot.toString('base64'));
    report(lit.max >= 170 && lit.min <= 60, `  and the collapse icon is drawn in ink on the dark rail (brightest ${Math.round(lit.max)}, darkest ${Math.round(lit.min)})`);
    await pb.close();
  }

  /* --- copy on a pale photograph ------------------------------------------- */
  /* The homepage hero's copy sits on the pale half of a banner: a scrim goes
     under the copy, and the banner's own lettering is left alone. */
  console.log('\ncopy on a pale photograph gets a scrim, and the picture keeps its own lettering');
  {
    const ph = await open('page_hero.html');
    for (let t = 0; t < 30; t++) {
      if (await ph.evaluate(() => document.getElementById('layout-region-content').hasAttribute('data-fdm-scrim'))) break;
      await ph.waitForTimeout(100);
    }
    await ph.waitForTimeout(600);
    const st = await ph.evaluate(() => {
      const row = document.getElementById('layout-region-content');
      const cs = getComputedStyle(row);
      const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      return { scrim: row.hasAttribute('data-fdm-scrim'), img: cs.backgroundImage, h1: getComputedStyle(document.getElementById('heroH1')).color,
               p: getComputedStyle(document.getElementById('heroP')).color, rowW: row.getBoundingClientRect().width,
               h1Box: r('heroH1'), tiled: getComputedStyle(document.getElementById('tiledH1')).color,
               tiledStyle: document.getElementById('tiledH1').getAttribute('style') || '' };
    });
    report(st.scrim && /^linear-gradient/.test(st.img) && /hero_banner\.png/.test(st.img),
      `the hero picture gets a scrim layered over it, and keeps the picture (${st.img.slice(0, 40)})`);
    const shot = await ph.screenshot();
    const imgH = st.rowW * 460 / 1500;
    const pts = [[st.h1Box.x + st.h1Box.w + 6, st.h1Box.y - 10], [st.rowW * 0.86, imgH * 0.47], [st.rowW * 0.05, imgH * 0.5]];
    const px = await ph.evaluate(async ({ b64, pts }) => {
      const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
      const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
      return pts.map(([x, y]) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3));
    }, { b64: shot.toString('base64'), pts });
    const C = p => ({ r: p[0], g: p[1], b: p[2] });
    report(px[0] && lum(C(px[0])) < 0.03, `  behind the copy the pale picture is dark now (${px[0] ? px[0].join(',') : '?'})`);
    report(px[2] && lum(C(px[2])) < 0.03, `  and so is the pale part out to the picture's edge (${px[2] ? px[2].join(',') : '?'})`);
    report(px[1] && px[1].every(v => v >= 240), `  the picture's own white lettering on its dark half is untouched (${px[1] ? px[1].join(',') : '?'})`);
    const h1 = rgb(st.h1), pp = rgb(st.p);
    report(h1 && px[0] && contrast(h1, C(px[0])) >= 4.5, `  the headline reads at ${h1 && px[0] ? contrast(h1, C(px[0])).toFixed(2) : '?'}:1 on the scrim (${h1 ? hex(h1) : '?'})`);
    report(pp && px[0] && contrast(pp, C(px[0])) >= 4.5, `  and so does the line under it (${pp ? hex(pp) : '?'})`);
    report(rgb(st.tiled) && hex(rgb(st.tiled)) === '#141414' && !/color/.test(st.tiledStyle),
      `copy on a picture the scrim does not take is left dark, not repainted white against the colour under the picture (${st.tiled})`);
    /* a resize lifts the scrim (it is laid in pixels) and must lay it again */
    const vp0 = ph.viewportSize();
    await ph.setViewportSize({ width: vp0.width - 180, height: vp0.height });
    let relaid = false;
    for (let t = 0; t < 40; t++) {
      await ph.waitForTimeout(100);
      relaid = await ph.evaluate(() => { const row = document.getElementById('layout-region-content'); return row.hasAttribute('data-fdm-scrim') && /gradient/.test(row.style.backgroundImage); });
      if (t > 4 && relaid) break;
    }
    const resized = await ph.evaluate(() => { const row = document.getElementById('layout-region-content'); return { attr: row.hasAttribute('data-fdm-scrim'), img: row.style.backgroundImage, w: row.getBoundingClientRect().width, size: row.style.backgroundSize }; });
    report(resized.attr && /gradient/.test(resized.img),
      `after a window resize the scrim is measured and laid again (${resized.attr ? 'scrim' : 'no scrim'}, row ${Math.round(resized.w)}px)`);
    await ph.setViewportSize(vp0);
    await ph.waitForTimeout(1200);

    /* the personalisation script can swap the banner after the scrim is laid,
       and the scrim, which names its picture inline, has to follow */
    await ph.evaluate(() => { const s = document.createElement('style'); s.textContent = '#layout-region-content { background-image: url("hero_banner_b.png"); }'; document.head.appendChild(s); });
    for (let t = 0; t < 40; t++) {
      if (await ph.evaluate(() => /hero_banner_b\.png/.test(document.getElementById('layout-region-content').style.backgroundImage))) break;
      await ph.waitForTimeout(100);
    }
    const sw = await ph.evaluate(() => { const row = document.getElementById('layout-region-content'); return { attr: row.hasAttribute('data-fdm-scrim'), img: row.style.backgroundImage }; });
    report(sw.attr && /gradient/.test(sw.img) && /hero_banner_b\.png/.test(sw.img) && !/hero_banner\.png/.test(sw.img),
      `  when the page swaps its banner after the scrim is laid, the scrim follows the new picture (${sw.img.slice(-34)})`);
    await ph.evaluate(() => window.__fdmStorageChanged && window.__fdmStorageChanged({ enabled: { newValue: false } }, 'sync'));
    await ph.waitForTimeout(800);
    const off = await ph.evaluate(() => { const row = document.getElementById('layout-region-content'); return { attr: row.hasAttribute('data-fdm-scrim'), style: row.getAttribute('style') || '', img: getComputedStyle(row).backgroundImage }; });
    report(!off.attr && !/background/.test(off.style) && !/gradient/.test(off.img), `  switched off, the scrim and its marker are gone (${off.style || 'no inline style'})`);
    await ph.close();
  }

  /* --- a pale texture tiled behind copy ------------------------------------ */
  /* Search & compare's right rail is a 4px repeat-x PNG (a grey hatch fading to
     white), the footer's link band a 1px strip: both are surfaces. */
  console.log('\na pale texture tiled behind copy is a surface, and is mapped as one');
  {
    const pr = await open('page_rail.html');
    for (let t = 0; t < 30; t++) {
      if (await pr.evaluate(() => /data:image\/png/.test(document.getElementById('rail').style.backgroundImage) &&
                                  /data:image\/png/.test(document.getElementById('footer').style.backgroundImage))) break;
      await pr.waitForTimeout(100);
    }
    await pr.waitForTimeout(300);
    const st = await pr.evaluate(() => {
      const g = id => document.getElementById(id);
      const box = id => { const b = g(id).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      return { rail: g('rail').style.backgroundImage.slice(0, 30), foot: g('footer').style.backgroundImage.slice(0, 30),
               inked: g('inked').getAttribute('style') || '', h3: getComputedStyle(g('railH3')).color,
               link: getComputedStyle(g('railLink')).color, footLink: getComputedStyle(g('footLink')).color,
               railBox: box('rail'), footBox: box('footer'),
               page: getComputedStyle(g('page-container')).backgroundColor, footBg: getComputedStyle(g('footer')).backgroundColor };
    });
    report(/data:image\/png/.test(st.rail), `the rail's tiled picture is redrawn as a surface (${st.rail})`);
    report(/data:image\/png/.test(st.foot), `  and so is the footer's strip (${st.foot})`);
    report(!/data:image/.test(st.inked), `a tile with ink in it is artwork, and left alone (${st.inked || 'untouched'})`);
    await pr.setViewportSize({ width: 1280, height: 1300 });
    await pr.waitForTimeout(200);
    const shot = await pr.screenshot();
    const R_ = st.railBox, F = st.footBox;
    const pts = [[R_.x + R_.w - 5, R_.y + 6], [R_.x + R_.w - 5, R_.y + 430], [F.x + 600, Math.floor(F.y)], [F.x + 600, F.y + 120]];
    const px = await pr.evaluate(async ({ b64, pts }) => {
      const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
      const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
      return pts.map(([x, y]) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3));
    }, { b64: shot.toString('base64'), pts });
    const C = p => ({ r: p[0], g: p[1], b: p[2] });
    const [top, bottom, rule, band] = px.map(C);
    const page = rgb(st.page), footBg = rgb(st.footBg);
    const near = (a, b, d) => a && b && Math.abs(a.r - b.r) <= d && Math.abs(a.g - b.g) <= d && Math.abs(a.b - b.b) <= d;
    report(near(bottom, page, 3), `the rail fades into the card as it faded into the white page (${px[1].join(',')} on ${hex(page)})`);
    report(lum(top) < 0.06 && lum(top) > lum(bottom), `  and its hatched top is a step lighter than that, as the hatch was a step darker (${px[0].join(',')})`);
    const h3 = rgb(st.h3), ln = rgb(st.link);
    report(h3 && contrast(h3, top) >= 4.5 && ln && contrast(ln, top) >= 4.5,
      `  "Questions?" and its link read on it (${h3 ? contrast(h3, top).toFixed(2) : '?'}:1, ${ln ? contrast(ln, top).toFixed(2) : '?'}:1)`);
    report(near(band, footBg, 3) && hex(footBg) === '#141414', `the footer band is the footer's own colour, the page's (${px[3].join(',')} on ${hex(footBg)})`);
    report(lum(rule) > lum(band) && rule.r - band.r >= 8, `  and its rule is a faint lighter line (${px[2].join(',')})`);

    /* footer links: a later `background: 0 0` takes the pipe off the last one */
    const fr = await pr.evaluate(() => {
      const g = id => getComputedStyle(document.getElementById(id)).backgroundImage;
      return { intl: g('footIntl'), careers: g('footCareers'), emitted: [...document.querySelectorAll('style[data-fidelity-dark="emitted"]')].map(s => s.textContent).join('\n') };
    });
    report(fr.intl === 'none' && /url\(/.test(fr.careers),
      `the last footer link sheds the pipe the others carry, as in light mode (${fr.intl.slice(0, 24)} / ${fr.careers.slice(0, 24)})`);
    report(!/(?:^|[\s,}])abbr\s*,[^{]*\{[^}]*background-image:\s*initial/.test(fr.emitted),
      `  while a reset of bare tags is not copied, so it cannot take a picture away (${/abbr\s*,[^{]*\{[^}]*\}/.exec(fr.emitted) ? 'copied' : 'left out'})`);
    const fl = rgb(st.footLink);
    report(fl && contrast(fl, band) >= 4.5, `  and its links read (${fl ? contrast(fl, band).toFixed(2) : '?'}:1)`);
    /* two GIFs drawn on white: the Share icon, a square rounded by a white
       pixel per corner, and the way-back arrow, a 1px blue outline with white
       inside and around it */
    for (let t = 0; t < 30; t++) {
      if (await pr.evaluate(() => /data:image\/png/.test(document.getElementById('shareLi').style.backgroundImage) &&
                                  /data:image\/png/.test(document.getElementById('returnLi').style.backgroundImage))) break;
      await pr.waitForTimeout(100);
    }
    const icons = await pr.evaluate(async () => {
      const px = async id => {
        const m = /url\("?([^")]+)"?\)/.exec(document.getElementById(id).style.backgroundImage || '');
        if (!m || !/^data:/.test(m[1])) return null;
        const im = new Image(); im.src = m[1]; await im.decode();
        const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        const at = (x, y) => { const i = (y * cv.width + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
        return { w: cv.width, at: (x, y) => at(x, y), raw: [...d] };
      };
      const s = await px('shareLi'), r = await px('returnLi');
      const pick = (o, pts) => o ? pts.map(([x, y]) => { const i = (y * o.w + x) * 4; return o.raw.slice(i, i + 4); }) : null;
      return { share: pick(s, [[0, 0], [11, 0], [0, 11], [11, 11], [5, 5], [1, 1]]),
               back: pick(r, [[0, 0], [5, 3], [5, 9], [5, 0], [13, 12]]),
               card: getComputedStyle(document.getElementById('page-container')).backgroundColor };
    });
    const sh = icons.share;
    report(sh && sh.slice(0, 4).every(p => p[3] === 0), `the Share icon's four white corner pixels are cut away (${sh ? sh.slice(0, 4).map(p => p[3]).join(',') : 'not redrawn'})`);
    report(sh && sh[4][3] === 255 && sh[4][0] > 240 && sh[5][2] > sh[5][0] + 100,
      `  while its white plus and its blue square are left as drawn (${sh ? sh[4].slice(0, 3).join(',') + ' / ' + sh[5].slice(0, 3).join(',') : '?'})`);
    const bk = icons.back, cardC = rgb(icons.card);
    report(bk && bk[0][3] === 0 && bk[1][3] === 0 && bk[2][3] === 0,
      `the way-back arrow loses the white around it AND inside its outline (${bk ? [bk[0], bk[1], bk[2]].map(p => p[3]).join(',') : 'not redrawn'})`);
    const line = bk && { r: bk[3][0], g: bk[3][1], b: bk[3][2] };
    report(line && bk[3][3] >= 230 && line.b > line.r + 40 && contrast(line, cardC) >= 4.5,
      `  and its blue line is lifted to read on the dark rail (${line ? hex(line) : '?'}, ${line ? contrast(line, cardC).toFixed(2) : '?'}:1)`);
    await pr.evaluate(() => window.__fdmStorageChanged && window.__fdmStorageChanged({ enabled: { newValue: false } }, 'sync'));
    await pr.waitForTimeout(800);
    const offImg = await pr.evaluate(() => document.getElementById('rail').getAttribute('style') || '');
    report(!/data:image/.test(offImg), `  switched off, the rail wears its own picture again (${offImg || 'no inline style'})`);
    await pr.close();
  }

  console.log('\na loading wheel does not sit in a grey square');
  {
    const sp = await open('page_spinner.html');
    await sp.waitForTimeout(600);
    const v = await sp.evaluate(() => {
      const bg = id => getComputedStyle(document.getElementById(id)).backgroundColor;
      return { box: bg('spinBox'), card: bg('spinCard'), overlay: getComputedStyle(document.querySelector('.loading-overlay')).backgroundColor };
    });
    const box = rgb(v.box), card = rgb(v.card), ov = rgb(v.overlay);
    report(box && box.a === 0, `the white box a wheel sits in, invisible in light mode, is invisible here too (${v.box})`);
    report(ov && lum(ov) < 0.05, `  on a dark loading screen (${v.overlay})`);
    report(card && card.a === 1, `a card with words under its wheel keeps its surface (${v.card})`);
    await sp.close();
  }

  /* --- the retirement projection ------------------------------------------- */
  /* Goal-card captions in `no_separator` and `separator` spans get no plate;
     the solid outcome bands stay apart, and every key matches the plot. */
  console.log('\nthe retirement projection: captions without plates, three blues apart, keys that match');
  {
    const pp = await open('page_projection.html');
    const bgs = await pp.evaluate(() => ['capSaved', 'capAge', 'capExp', 'ageSep', 'realLine']
      .map(id => getComputedStyle(document.getElementById(id)).backgroundColor));
    const plates = bgs.slice(0, 4).filter(v => { const c = rgb(v); return c && c.a > 0; });
    report(plates.length === 0, `a caption in a "no_separator" span, and the age in its "separator" span, sit on the card with no plate (${bgs.slice(0, 4).join(' / ')})`);
    report(rgb(bgs[4]) && hex(rgb(bgs[4])) === '#323232', `  an empty divider is still a drawn line (${bgs[4]})`);

    for (let t = 0; t < 40; t++) {
      if (await pp.evaluate(() => !!document.getElementById('areaAvg'))) break;
      await pp.waitForTimeout(100);
    }
    await pp.waitForTimeout(900);
    const ch = await pp.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return {
        fill: ['areaAvg', 'areaBelow', 'areaSig'].map(id => cs(id).fill),
        fo: ['areaAvg', 'areaBelow', 'areaSig'].map(id => cs(id).fillOpacity),
        wash: ['washFlat', 'washGrad'].map(id => cs(id).fillOpacity),
        keys: ['keyAvg', 'keyBelow', 'keySig'].map(id => cs(id).backgroundColor),
        point: cs('ptAvg').fill,
        rule: cs('graphAvg').stroke,
        year: cs('yearLine').stroke,
        yearKey: cs('keyYear').backgroundColor,
        card: getComputedStyle(document.getElementById('chartCard')).backgroundColor
      };
    });
    const F = ch.fill.map(rgb), card = rgb(ch.card);
    report(ch.fo.every(v => v === '1'), `the three outcome bands stay solid, as they are in light mode (fill-opacity ${ch.fo.join(', ')})`);
    report(ch.wash.every(v => Math.abs(parseFloat(v) - 0.22) < 0.001), `  while a translucent wash and a gradient wash are still held back (${ch.wash.join(', ')})`);
    report(lum(F[0]) < lum(F[1]) && lum(F[1]) < lum(F[2]),
      `the deepest blue on white is the lightest on the card, step by step (${F.map(hex).join(' < ')})`);
    const steps = [contrast(F[0], F[1]), contrast(F[1], F[2])];
    report(steps.every(s => s >= 1.4), `  and each band stands apart from the next as far as it did in light mode (${steps.map(s => s.toFixed(2)).join(', ')}:1; light mode 1.82, 1.63)`);
    const vsCard = F.map(f => contrast(f, card));
    report(vsCard.every(c => c >= 3), `  and every band reads on the card (${vsCard.map(c => c.toFixed(2)).join(', ')}:1)`);
    const K = ch.keys.map(rgb);
    report(K.every((k, i) => k && hex(k) === hex(F[i])), `the key list under the chart is the plot's own three colours (${K.map(k => k ? hex(k) : '?').join(' ')} vs ${F.map(hex).join(' ')})`);
    report(hex(rgb(ch.point)) === hex(F[0]), `  and so is a point marker on the Average band (${hex(rgb(ch.point))})`);
    report(hex(rgb(ch.rule)) === hex(card), `the white rules parting the bands are the card, as they are on white (${hex(rgb(ch.rule))})`);
    const yl = rgb(ch.year), yk = rgb(ch.yearKey);
    report(lum(yl) > 0.5 && yk && hex(yk) === hex(yl), `the Retirement Year key is the colour of the year line, not black (${yk ? hex(yk) : '?'} vs ${hex(yl)})`);

    /* Highcharts' outside tooltip is rebuilt at every pointer step, so its keys
       must be right in the first frame */
    const tip = await pp.evaluate(async () => {
      const row = (c, name, v) => '<div class="asset-project-container_content__item"><div class="asset-project-container_content__item__band">' +
        '<div class="asset-project-container_content__item__band__color" style="background-color: ' + c + ';"></div>' +
        '<span class="asset-project-container_content__item__band__name">' + name + '</span></div><span class="asset-project-container_content__item__value">' + v + '</span></div>';
      const build = n => '<div class="asset-project-container"><div class="asset-project-container_header"><span>20' + n + '</span></div><div class="asset-project-container_content">' +
        row('#3880F3', 'Average', '$1,500,000') + row('#2751C2', 'Below average', '$1,000,000') + row('#2A3965', 'Significantly below average', '$500,000') + '</div></div>';
      const box = document.createElement('div');
      box.className = 'highcharts-tooltip-container';
      box.innerHTML = '<svg class="highcharts-root" width="440" height="240" xmlns="http://www.w3.org/2000/svg"><g class="highcharts-label highcharts-tooltip"><path class="highcharts-label-box highcharts-tooltip-box" fill="#FFFFFF" stroke="#999999" d="M0 0h420v220h-420z"/></g></svg>' +
        '<div class="highcharts-label highcharts-tooltip" style="position:absolute;left:8px;top:8px"><span id="tipSpan" style="position:absolute;color:#333333;white-space:nowrap">' + build(50) + '</span></div>';
      document.body.appendChild(box);
      const frame = () => new Promise(r => requestAnimationFrame(() => r()));
      await frame();
      const dots = () => [...document.querySelectorAll('.asset-project-container_content__item__band__color')].map(d => getComputedStyle(d).backgroundColor);
      const first = dots();
      /* the pointer moves one year: the rows are rebuilt from scratch */
      document.getElementById('tipSpan').innerHTML = build(51);
      await frame();
      const second = dots();
      /* and a default Highcharts tooltip writes its key as a coloured glyph */
      const svg = document.querySelector('#projBox svg');
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'highcharts-label highcharts-tooltip');
      g.innerHTML = '<text x="20" y="30"><tspan id="tipGlyph" style="fill:#2751C2">●</tspan><tspan dx="4">Below average</tspan></text>';
      svg.appendChild(g);
      await frame();
      const glyph = getComputedStyle(document.getElementById('tipGlyph')).fill;
      return { first, second, glyph };
    });
    const T1 = tip.first.map(rgb), T2 = tip.second.map(rgb);
    report(T1.every((t, i) => t && hex(t) === hex(F[i])), `the tooltip's dots are the plot's colours in the frame they first paint (${T1.map(t => t ? hex(t) : '?').join(' ')})`);
    report(T2.every((t, i) => t && hex(t) === hex(F[i])), `  and again when the pointer moves and the rows are rebuilt (${T2.map(t => t ? hex(t) : '?').join(' ')})`);
    report(rgb(tip.glyph) && hex(rgb(tip.glyph)) === hex(F[1]), `a default tooltip's "●" key is its series' colour, not ink (${tip.glyph})`);

    const again = await pp.evaluate(() => {
      const R = self.FidelityDarkRecolor;
      for (let i = 0; i < 6; i++) {
        document.querySelectorAll('[style]').forEach(el => { if (el.dataset) el.dataset.fdmInline = '0'; R.processInline(el); });
        R.recolorChartMarks();
      }
      const cs = id => getComputedStyle(document.getElementById(id));
      return ['keyAvg', 'keyBelow', 'keySig'].map(id => cs(id).backgroundColor).concat([cs('areaAvg').fill, cs('keyYear').backgroundColor]);
    });
    report(again.join('|') === ch.keys.concat([ch.fill[0], ch.yearKey]).join('|'), `six more passes leave the keys and the plot exactly where they were`);

    await pp.evaluate(() => window.__fdmStorageChanged && window.__fdmStorageChanged({ enabled: { newValue: false } }, 'sync'));
    await pp.waitForTimeout(800);
    const off = await pp.evaluate(() => ['keyAvg', 'keyBelow', 'keySig', 'keyYear'].map(id => ({ s: document.getElementById(id).getAttribute('style') || '', bg: getComputedStyle(document.getElementById(id)).backgroundColor })));
    report(off.every(o => !o.s), `  switched off, no key keeps a colour of ours (${off.map(o => o.bg).join(' / ')})`);
    report(rgb(off[0].bg) && hex(rgb(off[0].bg)) === '#3880F3' && hex(rgb(off[3].bg)) === '#000000', `  and they are light mode's again`);
    await pp.close();
  }

  /* --- !important in light mode still wins --------------------------------- */
  /* Every emitted copy is !important, so a rule that lost only for lack of it
     could win: the Spending page's net cash flow is red because
     `.performance-loss` is !important and `.sub-heading` is not. */
  console.log('\nthe planning pages: an important loss colour still wins, and the page is one colour');
  {
    const pl = await open('page_planning.html');
    const v = await pl.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return { loss: cs('netLoss').color, gain: cs('netGain').color, plain: cs('plainHeading').color,
               main: cs('mainBody').backgroundColor, body: getComputedStyle(document.body).backgroundColor, tile: cs('tile').backgroundColor };
    });
    const loss = rgb(v.loss), gain = rgb(v.gain), plain = rgb(v.plain);
    report(hex(loss) === '#FF6868', `a loss figure whose red was !important is the loss red, not the heading's white (${hex(loss)})`);
    report(hex(gain) === '#5CBF4A', `  and a gain figure the gain green (${hex(gain)})`);
    report(hex(plain) === '#FFFFFF', `  while a heading without either class keeps its own ink (${hex(plain)})`);
    report(hex(rgb(v.main)) === hex(rgb(v.body)) && hex(rgb(v.body)) === '#141414',
      `a page body painted #f2f2f2 on a #f4f4f4 page, deep in the tree, is the page (${hex(rgb(v.main))} on ${hex(rgb(v.body))})`);
    report(hex(rgb(v.tile)) === '#292928', `  and the white tile on it is a card on the page, as it is in light mode (${hex(rgb(v.tile))})`);
    /* a component's token named for ink, used only as a fill */
    const badge = await pl.evaluate(() => {
      const sr = document.getElementById('badgeHost').shadowRoot;
      return { bg: getComputedStyle(sr.querySelector('.pwe-icon')).backgroundColor, ink: getComputedStyle(sr.querySelector('.icon-text')).color,
               row: getComputedStyle(document.getElementById('tile')).backgroundColor };
    });
    const bb = rgb(badge.bg), bi = rgb(badge.ink);
    report(bb && lum(bb) < 0.05, `a badge whose fill token is named "--icon-rest-color" is filled like a surface, not white (${badge.bg})`);
    report(bi && contrast(bi, bb) >= 4.5, `  and its "E" reads on it at ${bi && bb ? contrast(bi, bb).toFixed(2) : '?'}:1 (${badge.ink})`);
    /* a tab group's panel is content: only the strip is styled as tabs */
    const tabs = await pl.evaluate(() => {
      const c = id => getComputedStyle(document.getElementById(id)).color;
      return { link: c('panelLink'), text: c('panelText'), on: c('tabOn'), off: c('tabOff') };
    });
    report(hex(rgb(tabs.link)) === '#8CC1FD', `a link in a tab panel is a link, not tab-strip grey (${hex(rgb(tabs.link))})`);
    report(hex(rgb(tabs.text)) === '#FFFFFF', `  and the panel's text is ink (${hex(rgb(tabs.text))})`);
    report(hex(rgb(tabs.on)) === '#FFFFFF' && hex(rgb(tabs.off)) === '#D9D8D5',
      `the chosen tab's label is ink and the others the strip's grey (${hex(rgb(tabs.on))} / ${hex(rgb(tabs.off))})`);
    const ov = await pl.evaluate(() => getComputedStyle(document.getElementById('cornerTile')).overflow);
    report(ov === 'visible', `a tile with no grid in it clips nothing, so an icon in its corner keeps its ring and its focus ring (${ov})`);
    const tb = await pl.evaluate(() => ({ label: getComputedStyle(document.getElementById('textBtnLabel')).color, icon: getComputedStyle(document.getElementById('textBtnIcon')).color }));
    report(hex(rgb(tb.label)) === '#5CBF4A' && hex(rgb(tb.icon)) === '#5CBF4A',
      `a green text button is green in dark mode too, its arrow with it (${hex(rgb(tb.label))} / ${hex(rgb(tb.icon))})`);
    /* a popover's content wrapper is part of its bubble */
    const ap = await pl.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return { pop: cs('aboutPop').backgroundColor, popShadow: cs('aboutPop').boxShadow,
               content: cs('aboutContent').backgroundColor, contentShadow: cs('aboutContent').boxShadow };
    });
    report(ap.contentShadow === 'none' && ap.content === 'rgba(0, 0, 0, 0)' && ap.popShadow !== 'none',
      `an info popover's content casts no second shadow across its own text; the bubble keeps the only one (${ap.contentShadow} / ${ap.popShadow.slice(0, 24)})`);
    await pl.hover('#closeBtn');
    await pl.waitForTimeout(150);
    const cx = await pl.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id)).backgroundColor;
      return { area: cs('closeArea'), host: cs('closeHost') };
    });
    report(cx.area === 'rgba(0, 0, 0, 0)' && cx.host === 'rgba(0, 0, 0, 0)',
      `  and pointing at its X lights no grey bar down the bubble's side (${cx.area} / ${cx.host})`);
    await pl.mouse.move(0, 0);
    await pl.close();
  }

  /* --- an inline alert is not a banner ------------------------------------- */
  /* The Asset allocation card's pvd-inline-alert--success: a line of text and
     an icon drawn through a mask, so its background colour IS the icon. */
  console.log('\nan inline alert is an icon and a line of text, not a banner');
  {
    const pa = await open('page_alerts.html');
    const a = await pa.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return { alert: cs('inlineAlert').backgroundColor, icon: cs('inlineIcon').backgroundColor, mask: cs('inlineIcon').maskImage || cs('inlineIcon').webkitMaskImage,
               text: cs('inlineText').color, card: cs('allocCard').backgroundColor,
               banner: cs('bannerAlert').backgroundColor, bannerIcon: cs('bannerIcon').backgroundColor };
    });
    const icon = rgb(a.icon), card = rgb(a.card), text = rgb(a.text);
    report(a.alert === 'rgba(0, 0, 0, 0)', `the inline success alert has no fill of its own, as on white (${a.alert})`);
    report(icon && icon.a > 0 && /url\(/.test(a.mask || '') && icon.g > icon.r + 40 && contrast(icon, card) >= 3,
      `  its check-circle is drawn, in a green that reads on the card (${icon ? hex(icon) : a.icon}, ${icon && card ? contrast(icon, card).toFixed(2) : '?'}:1)`);
    report(text && contrast(text, card) >= 4.5, `  and its text is ordinary ink (${text ? hex(text) : '?'})`);
    const bi = rgb(a.bannerIcon), bb = rgb(a.banner);
    report(bb && hex(bb) !== hex(card) && bi && bi.a > 0 && contrast(bi, bb) >= 3,
      `a banner keeps its tint, and the icon in it keeps its colour (${bb ? hex(bb) : '?'} / ${bi ? hex(bi) : a.bannerIcon})`);
    await pa.close();
  }

  /* --- the classic Performance view ---------------------------------------- */
  /* Portfolio > Performance with "New experience" off: its legacy components
     must match the new page. */
  console.log('\nthe classic Performance view matches the new one');
  {
    const pc = await open('page_classic.html');
    await pc.waitForTimeout(600);
    const LINK = '#8CC1FD';   // surface-foreground-link
    const v = await pc.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      const svgOf = id => {
        const m = /url\("?(data:[^"]*)"?\)/.exec(cs(id).backgroundImage);
        if (!m) return '';
        const body = m[1].slice(m[1].indexOf(',') + 1);
        try { return decodeURIComponent(body); } catch (e) { return body; }
      };
      return {
        alert: cs('noticeAlert').backgroundColor, stripe: cs('noticeStripe').backgroundColor, alertBorder: cs('noticeAlert').borderTopColor,
        icon: cs('noticeIcon').backgroundColor, card: cs('ptcCard').backgroundColor,
        help: svgOf('helpMark'),
        pointer: svgOf('uxdPointer'), inner: cs('uxdInner').backgroundColor, innerBorder: cs('uxdInner').borderTopColor,
        content: cs('uxdContent').backgroundColor,
        chevron: svgOf('acctSelect'),
        endColor: cs('endBalance').borderRightColor, endWidth: cs('endBalance').borderRightWidth,
        sticky: cs('stickyCol').boxShadow, lifted: cs('liftedBox').boxShadow, ringed: cs('ringedBox').boxShadow,
        tabLabel: cs('tabLabel').borderTopColor, tabLink: cs('tabLink').borderTopColor, tabInk: cs('tabLink').color,
        nav: cs('navLink').color, plain: cs('plainLink').color
      };
    });
    const card = rgb(v.card), alert = rgb(v.alert), stripe = rgb(v.stripe), icon = rgb(v.icon);
    report(card && alert && hex(alert) === hex(card),
      `the apex-kit notice is a card, as it is white in light mode, not a navy banner (${alert ? hex(alert) : v.alert} on ${card ? hex(card) : '?'})`);
    report(stripe && alert && hex(stripe) !== hex(alert) && stripe.b > stripe.r + 60,
      `  its stripe keeps the status blue (${stripe ? hex(stripe) : v.stripe})`);
    const aBorder = rgb(v.alertBorder);
    report(aBorder && stripe && hex(aBorder) === hex(stripe),
      `  and its border is the same blue as the stripe, one token in light mode and one colour here (${aBorder ? hex(aBorder) : v.alertBorder})`);
    report(icon && stripe && icon.a > 0 && contrast(icon, stripe) >= 3,
      `  and the "i" knocked out of the stripe can be seen (${icon ? hex(icon) : v.icon} on ${stripe ? hex(stripe) : '?'}, ${icon && stripe ? contrast(icon, stripe).toFixed(2) : '?'}:1)`);

    const helpFills = (v.help.match(/fill=['"]([^'"]*)['"]/g) || []).map(s => s.slice(6, -1).toLowerCase());
    report(helpFills.includes('transparent') && !helpFills.includes('#d9d8d5'),
      `the "?" mark's cut-out disc stays transparent, no pale coin behind it (${helpFills.join(', ')})`);
    report(helpFills.filter(f => f === LINK.toLowerCase()).length === 2,
      `  and its ring and "?" are the link blue, as the new page's help marks are (${LINK})`);

    const ptrFill = (/<svg\b[^>]*\bfill=['"]([^'"]*)['"]/i.exec(v.pointer) || [])[1] || '';
    const ptrStroke = (/<svg\b[^>]*\bstroke=['"]([^'"]*)['"]/i.exec(v.pointer) || [])[1] || '';
    const inner = rgb(v.inner), innerBorder = rgb(v.innerBorder);
    report(inner && ptrFill.toLowerCase() === hex(inner).toLowerCase(),
      `the tooltip's pointer is the bubble's colour, not a white tip (${ptrFill || 'unchanged'} / bubble ${inner ? hex(inner) : '?'})`);
    report(innerBorder && ptrStroke.toLowerCase() === hex(innerBorder).toLowerCase(),
      `  outlined in the bubble's own rim (${ptrStroke || 'unchanged'} / rim ${innerBorder ? hex(innerBorder) : '?'})`);
    report(v.content === 'rgba(0, 0, 0, 0)', `  and the text in the bubble sits on the bubble, not on a slab of its own (${v.content})`);

    const chev = /fill:[^};]*/.exec(v.chevron);
    report(/fill:#D9D8D5/i.test(v.chevron), `the account <select>'s chevron is inked, like the narrower selects below it (${chev ? chev[0] : 'black'})`);

    const end = rgb(v.endColor);
    report(end && end.a === 0 && v.endWidth === '14px',
      `the 14px gutter beside Ending Balance stays clear, not a white bar (${v.endColor} ${v.endWidth})`);
    const tl = rgb(v.tabLabel), tk = rgb(v.tabLink);
    report(tl && tk && tl.a === 0 && tk.a === 0, `the Scroll-to tabs keep their transparent borders (${v.tabLabel} / ${v.tabLink})`);
    report(/rgb\(64, 63, 62\)/.test(v.sticky),
      `the frozen column's divider is a quiet rule in the border grey, not a black bar (${v.sticky})`);
    report(/^rgba\(0, 0, 0,/.test(v.lifted), `  while a soft shadow under a floating card is still a shadow (${v.lifted})`);
    report(/rgb\(217, 216, 213\)/.test(v.ringed), `  and a hard black ring drawn as a shadow is a light line, as a black border is (${v.ringed})`);

    for (const [k, label] of [['tabInk', 'a Scroll-to tab (#356F95)'], ['nav', 'a nav link (#0E67A9)'], ['plain', 'a body link (#346E94)']]) {
      const c = rgb(v[k]);
      report(c && hex(c).toLowerCase() === LINK.toLowerCase(), `${label} is the link colour the new page uses (${c ? hex(c) : v[k]})`);
    }

    /* The Month header's sort arrow, an <img> of a black data: SVG, is rebuilt
       or re-pointed on every click, with no text that would invite a pass. */
    const arrowFill = () => pc.evaluate(() => {
      const src = document.getElementById('sortIcon').getAttribute('src') || '';
      let svg = '';
      try { svg = /base64,/.test(src) ? atob(src.split('base64,')[1]) : decodeURIComponent(src.slice(src.indexOf(',') + 1)); } catch (e) { svg = ''; }
      const m = /fill:(#[0-9a-f]{6})/i.exec(svg);
      return m ? m[1] : 'black';
    });
    const a0 = await arrowFill();
    /* well after the passes the page gets while it loads, as a click is */
    await pc.waitForTimeout(2500);
    await pc.evaluate(() => window.rebuildSortIcon());
    await pc.waitForTimeout(1200);
    const a1 = await arrowFill();
    await pc.evaluate(() => window.repointSortIcon());
    await pc.waitForTimeout(1200);
    const a2 = await arrowFill();
    report(/^#D9D8D5$/i.test(a0), `the Month header's sort arrow is inked, not black (${a0})`);
    report(/^#D9D8D5$/i.test(a1), `  and so is the new arrow the page builds when the sort flips (${a1})`);
    report(/^#D9D8D5$/i.test(a2), `  and the same arrow pointed at the other direction (${a2})`);
    /* A table rendered hidden and shown by a class flip: no node or style
       changes, so only a watch on the arrow's size sees it appear. */
    const hiddenFill = () => pc.evaluate(() => {
      const src = document.getElementById('hiddenSortIcon').getAttribute('src') || '';
      let svg = '';
      try { svg = /base64,/.test(src) ? atob(src.split('base64,')[1]) : decodeURIComponent(src.slice(src.indexOf(',') + 1)); } catch (e) { svg = ''; }
      const m = /fill:(#[0-9a-f]{6})/i.exec(svg);
      return m ? m[1] : 'black';
    });
    const h0 = await hiddenFill();
    await pc.evaluate(() => window.showDetails());
    await pc.waitForTimeout(800);
    const h1 = await hiddenFill();
    report(h0 === 'black' && /^#D9D8D5$/i.test(h1),
      `an arrow in a table that opens hidden is inked when "Show details" shows it (${h0} -> ${h1})`);
    await pc.close();
  }

  /* --- the Feedback survey ------------------------------------------------- */
  /* The Feedback dialog's body, a Qualtrics survey in a cross-origin frame,
     reads as one dark card like the dialog. */
  console.log('\nthe Feedback survey is one dark card, like the white one it was');
  {
    const ps = await open('page_survey.html');
    await ps.waitForTimeout(900);
    const CARD = '#292928', RAISED = '#403F3E', BTN = '#5CBF4A', LINK = '#8CC1FD', BAND = '#044014';
    const v = await ps.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return {
        html: getComputedStyle(document.documentElement).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
        bar: getComputedStyle(document.documentElement).scrollbarWidth,
        tile: cs('tileA').backgroundColor, tileInk: cs('tileA').color,
        chosen: cs('tileChosen').backgroundColor, chosenInk: cs('tileChosen').color,
        next: cs('NextButton').backgroundColor, nextInk: cs('NextButton').color,
        field: cs('surveyText').backgroundColor, fieldEdge: cs('surveyText').borderTopColor,
        link: cs('legalLink').color, close: cs('closeX').filter,
        closeLoaded: document.getElementById('closeX').naturalWidth,
        closeOrigin: new URL(document.getElementById('closeX').src).origin !== location.origin
      };
    });
    const body = rgb(v.body), html = rgb(v.html), tile = rgb(v.tile), chosen = rgb(v.chosen), next = rgb(v.next);
    report(body && html && hex(body) === CARD && hex(html) === CARD,
      `the survey's page is the card, the colour of the dialog round it, so no frame shows (${body ? hex(body) : v.body})`);
    report(tile && hex(tile) === RAISED,
      `an answer tile is the raised surface, not a shade darker than the page (${tile ? hex(tile) : v.tile})`);
    report(tile && body && contrast(tile, body) >= 1.3,
      `  and stands off the page at ${tile && body ? contrast(tile, body).toFixed(2) : '?'}:1 (light mode: 1.14:1)`);
    report(tile && contrast(rgb(v.tileInk), tile) >= 4.5,
      `  with its label reading at ${tile ? contrast(rgb(v.tileInk), tile).toFixed(2) : '?'}:1`);
    await ps.hover('#tileA');
    await ps.waitForTimeout(150);
    const hov = rgb(await ps.evaluate(() => getComputedStyle(document.getElementById('tileA')).backgroundColor));
    report(hov && tile && lum(hov) > lum(tile),
      `hovering a tile lifts it a step lighter, as it goes a step darker on white (${hov ? hex(hov) : '?'})`);
    await ps.mouse.move(1, 1);
    report(chosen && hex(chosen) === BTN && contrast(rgb(v.chosenInk), chosen) >= 4.5,
      `a chosen answer is the button green with dark ink, as every filled control is (${chosen ? hex(chosen) : v.chosen}, ${chosen ? contrast(rgb(v.chosenInk), chosen).toFixed(2) : '?'}:1)`);
    report(next && hex(next) === BTN && contrast(rgb(v.nextInk), next) >= 4.5,
      `Submit is the theme's primary button, not a dim olive (${next ? hex(next) : v.next}, label ${next ? contrast(rgb(v.nextInk), next).toFixed(2) : '?'}:1)`);
    report(lum(rgb(v.field)) < 0.06 && contrast(rgb(v.fieldEdge), body) >= 3,
      `the comment box is dark with an edge you can find (${hex(rgb(v.field))}, edge ${contrast(rgb(v.fieldEdge), body).toFixed(2)}:1)`);
    report(hex(rgb(v.link)) === LINK, `its links are the link colour (${hex(rgb(v.link))})`);
    report(v.close === 'invert(1)' && v.closeLoaded > 0 && v.closeOrigin,
      `the dialog's black close X, a picture from another origin, is drawn white (${v.close}, ${v.closeLoaded}px, cross-origin ${v.closeOrigin})`);
    report(v.bar === 'thin', `and the frame scrolls on the theme's thin bar, not the browser's wide one (${v.bar})`);

    /* the banner: a picture of white lettering on a flat green */
    let band = null;
    for (let i = 0; i < 12 && !(band && band.data); i++) {
      await ps.waitForTimeout(250);
      band = await ps.evaluate(async () => {
        const img = document.getElementById('surveyBand');
        const src = img.getAttribute('src');
        if (!/^data:image\/png/.test(src)) return { data: false, src };
        const im = new Image();
        im.src = src;
        await im.decode();
        const cv = document.createElement('canvas');
        cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        const ctx = cv.getContext('2d');
        ctx.drawImage(im, 0, 0);
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let hi = 0, distinct = new Set();
        for (let k = 0; k < d.length; k += 4) { hi = Math.max(hi, Math.min(d[k], d[k + 1], d[k + 2])); distinct.add(d[k] + ',' + d[k + 1] + ',' + d[k + 2]); }
        return { data: true, corner: [d[0], d[1], d[2]], hi, n: distinct.size,
                 notBand: document.getElementById('notBand').getAttribute('src') };
      });
    }
    const corner = band && band.corner ? { r: band.corner[0], g: band.corner[1], b: band.corner[2] } : null;
    report(band && band.data && corner && hex(corner) === BAND,
      `the banner's green becomes Fidelity's fixed brand surface (${corner ? hex(corner) : band && band.src})`);
    report(band && band.hi >= 250,
      `  and its lettering stays white (${band ? band.hi : '?'}), anti-aliased as before (${band ? band.n : '?'} tones)`);
    report(band && band.notBand === 'survey_band_third_ink.png',
      `a band with a third ink in it is a picture and is left alone (${band ? band.notBand : '?'})`);

    await ps.evaluate(() => window.__fdmStorageChanged && window.__fdmStorageChanged({ enabled: { newValue: false } }, 'sync'));
    await ps.waitForTimeout(700);
    const off = await ps.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      tile: getComputedStyle(document.getElementById('tileA')).backgroundColor,
      next: getComputedStyle(document.getElementById('NextButton')).backgroundColor,
      band: document.getElementById('surveyBand').getAttribute('src'),
      close: getComputedStyle(document.getElementById('closeX')).filter
    }));
    report(hex(rgb(off.body)) === '#FFFFFF' && /0\.06\)$/.test(off.tile) && hex(rgb(off.next)) === '#6F9824' &&
      off.band === 'survey_band.png' && off.close === 'none',
      `switched off, the survey is Qualtrics' own again (page ${hex(rgb(off.body))}, tile ${off.tile}, Submit ${hex(rgb(off.next))}, banner ${off.band}, X ${off.close})`);
    await ps.close();
  }

  /* --- off means off ------------------------------------------------------- */
  /* Every tab follows chrome.storage.onChanged; while the theme is off the
     worker registers gate-off.js to set the gate before the first paint. */
  console.log('\noff means off: a page opened off, and a tab switched off from elsewhere');
  {
    const openWith = async (file, { stored, gate, theme = true }) => {
      const p = await browser.newPage();
      await p.addInitScript(({ stored, gate }) => {
        window.chrome = {
          storage: {
            sync: { get: (d, cb) => setTimeout(() => cb && cb(stored), 150), set: (v, cb) => cb && cb() },
            onChanged: { addListener(fn) { window.__fdmStorageChanged = fn; } }
          },
          runtime: { id: 'fdm-test', sendMessage(msg, cb) { cb && cb({ sheets: [] }); }, lastError: null }
        };
        /* gate-off.js runs at document_start, when the <html> element already
           exists; an init script can run before it does */
        if (gate) {
          const put = () => document.documentElement && document.documentElement.classList.add('fdm-off');
          if (document.documentElement) put();
          else new MutationObserver((m, o) => { if (document.documentElement) { put(); o.disconnect(); } }).observe(document, { childList: true });
        }
      }, { stored, gate });
      await p.goto(origin + '/' + file);
      if (theme) {
        for (const f of THEME) {
          const h = await p.addStyleTag({ content: read(f) });
          await h.evaluate(n => { n.dataset.fidelityDark = 'theme'; });
        }
        for (const f of SCRIPTS) await p.addScriptTag({ content: read(f) });
      }
      return p;
    };

    const pristine = await openWith('fixture.html', { stored: {}, theme: false });
    await pristine.waitForTimeout(1200);
    const clean = await snapAll(pristine, 'index');
    await pristine.close();

    /* opened off with the gate already down, as gate-off.js leaves it */
    const g = await openWith('fixture.html', { stored: { enabled: false }, gate: true });
    const early = await g.evaluate(() => ({ off: document.documentElement.classList.contains('fdm-off'),
      body: getComputedStyle(document.body).backgroundColor }));
    report(early.off && rgb(early.body) && lum(rgb(early.body)) > 0.8,
      `a page opened with the theme off is light before storage has even answered (${early.body})`);
    await g.waitForTimeout(2200);
    const gs = await snapAll(g, 'index');
    const gd = diffSnaps(clean, gs);
    if (gd.length) for (const x of gd.slice(0, 6)) console.log('      ' + x.slice(0, 200));
    const gw = await g.evaluate(() => ({ inline: document.querySelectorAll('[data-fdm-inline]').length,
      emitted: [...document.querySelectorAll('style[data-fidelity-dark="emitted"]')].filter(s => !s.disabled && s.textContent.length > 10).length }));
    report(gd.length === 0 && gw.inline === 0 && gw.emitted === 0,
      `  and stays exactly the page Fidelity drew: ${gd.length} elements differ, ${gw.inline} written to, ${gw.emitted} live sheets emitted`);
    await g.close();

    /* opened off without the gate script: the stored setting alone */
    const n = await openWith('fixture.html', { stored: { enabled: false }, gate: false });
    await n.waitForTimeout(2200);
    const ns = await snapAll(n, 'index');
    const nd = diffSnaps(clean, ns);
    if (nd.length) for (const x of nd.slice(0, 6)) console.log('      ' + x.slice(0, 200));
    report(nd.length === 0, `without the gate script, the stored setting still hands back the whole page (${nd.length} elements differ)`);
    await n.close();

    /* on, then switched off from another tab: only the storage event arrives */
    const t = await openWith('fixture.html', { stored: {}, gate: false });
    await t.waitForTimeout(2200);
    const themedBody = await t.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await t.evaluate(() => window.__fdmStorageChanged && window.__fdmStorageChanged({ enabled: { oldValue: true, newValue: false } }, 'sync'));
    await t.waitForTimeout(900);
    const ts = await snapAll(t, 'index');
    const td = diffSnaps(clean, ts);
    if (td.length) for (const x of td.slice(0, 6)) console.log('      ' + x.slice(0, 200));
    report(rgb(themedBody) && lum(rgb(themedBody)) < 0.05 && td.length === 0,
      `a tab switched off from another tab hands its page back too (${td.length} elements differ)`);
    /* and back on again, the same way */
    await t.evaluate(() => window.__fdmStorageChanged && window.__fdmStorageChanged({ enabled: { oldValue: false, newValue: true } }, 'sync'));
    await t.waitForTimeout(2200);
    const backOn = await t.evaluate(() => getComputedStyle(document.body).backgroundColor);
    report(rgb(backOn) && lum(rgb(backOn)) < 0.05, `  and switched back on from elsewhere, it is dark again (${backOn})`);
    await t.close();
  }

  /* --- a print, and the ACE chart ------------------------------------------- */
  /* A print lifts the theme while the page is still on screen media, so a
     chart that redraws at once reads light colours. */
  console.log('\na print lifts the gate, and the ACE chart redraws in its own colours');
  {
    const drawnBefore = await page.evaluate(() => document.getElementById('aceContainer').stx.drawn);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const printing = await page.evaluate(() => ({
      gate: document.documentElement.classList.contains('fdm-off'),
      themed: document.getElementById('aceBox').classList.contains('fidchart-theme-dark'),
      grid: getComputedStyle(document.getElementById('aceGrid')).color,
      drawn: document.getElementById('aceContainer').stx.drawn
    }));
    report(printing.gate && !printing.themed, 'while printing the gate class is on and the chart has lost its theme class');
    report(printing.grid === 'rgb(239, 239, 239)' && printing.drawn > drawnBefore,
      `  and the chart drew again, from its light-mode probes (${printing.grid}, ${printing.drawn - drawnBefore} drawing)`);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.waitForTimeout(2200);
    const back = await page.evaluate(() => ({
      gate: document.documentElement.classList.contains('fdm-off'),
      themed: document.getElementById('aceBox').classList.contains('fidchart-theme-dark'),
      grid: getComputedStyle(document.getElementById('aceGrid')).color,
      drawn: document.getElementById('aceContainer').stx.drawn
    }));
    report(!back.gate && back.themed && hex(rgb(back.grid)) === '#323232' && back.drawn > printing.drawn,
      `after it the theme is back and the chart drew again in the palette (${back.grid}, ${back.drawn - printing.drawn} drawings)`);
  }

  /* --- switching off gives the page back ----------------------------------- */
  /* The gate class stops the CSS; whatever the passes wrote onto elements must
     be put back, and the passes must stop. */
  console.log('\nswitching the theme off hands the page back');
  {
    const themed = await snap(BASELINE_SEL);
    // first, prove the theme changed something
    const changed = BASELINE_SEL.filter(sel => baseline[sel] && themed[sel] &&
      JSON.stringify(baseline[sel]) !== JSON.stringify(themed[sel]));
    report(changed.length >= 8,
      `the theme changed ${changed.length} of the ${BASELINE_SEL.length} sampled elements while on`);

    const wroteInline = await page.evaluate(() => document.querySelectorAll('[data-fdm-inline]').length);
    report(wroteInline > 0, `the passes wrote to ${wroteInline} elements while on`);

    /* ChartIQ's ThemeHelper copies the container's computed background (a
       dark grey under the theme) onto it inline when the chart is built. */
    await page.evaluate(() => { document.getElementById('ciqContainer').style.backgroundColor = 'rgb(64, 63, 62)'; });

    // now switch off, the way the popup does
    await page.evaluate(() => window.__fdmStorageChanged && window.__fdmStorageChanged({ enabled: { newValue: false } }, 'sync'));
    await page.waitForTimeout(1000);

    const ciqOff = rgb(await page.evaluate(() => getComputedStyle(document.getElementById('ciqContainer')).backgroundColor));
    report(ciqOff && lum(ciqOff) > 0.8, `a ChartIQ container goes back to its own white, not the dark grey the library copied from the theme (${ciqOff ? hex(ciqOff) : '?'})`);
    const aceOff = await page.evaluate(() => ({
      themed: document.getElementById('aceBox').classList.contains('fidchart-theme-dark'),
      token: getComputedStyle(document.getElementById('aceBox')).getPropertyValue('--fidchart-grid-color').trim(),
      grid: getComputedStyle(document.getElementById('aceGrid')).color,
      drawn: document.getElementById('aceContainer').stx.drawn
    }));
    report(!aceOff.themed && aceOff.token === '' && aceOff.grid === 'rgb(239, 239, 239)' && aceOff.drawn >= 2,
      `the ACE chart loses its theme class and tokens, and draws again in its own colours (${aceOff.grid}, ${aceOff.drawn} drawings)`);

    report(await page.evaluate(() => document.documentElement.classList.contains('fdm-off')),
      'the gate class is set');

    /* sheets adopted into a shadow root are out of the gate's reach and are
       withdrawn by hand */
    const skOff = await page.evaluate(() => {
      const sr = document.querySelector('#skelHost').shadowRoot;
      return { plain: getComputedStyle(sr.querySelector('#plain')).backgroundColor,
               adopted: getComputedStyle(sr.querySelector('#adoptedBar')).backgroundColor,
               ours: sr.adoptedStyleSheets.filter(s => s.__fdm).length };
    });
    report(skOff.plain === 'rgb(238, 238, 238)' && skOff.adopted === 'rgb(238, 238, 238)',
      `a shadow root's own styles are back once the theme is off (${skOff.plain}, ${skOff.adopted})`);
    report(skOff.ours === 0, `  and none of the engine's sheets are left adopted in it (${skOff.ours})`);

    const after = await snap(BASELINE_SEL);
    const residue = BASELINE_SEL.filter(sel => baseline[sel] && after[sel] &&
      JSON.stringify(baseline[sel]) !== JSON.stringify(after[sel]));
    if (residue.length) {
      for (const sel of residue.slice(0, 6)) {
        const diffs = Object.keys(baseline[sel])
          .filter(k => baseline[sel][k] !== after[sel][k])
          .map(k => `${k}: ${baseline[sel][k]} -> ${after[sel][k]}`);
        console.log(`      ${sel}  ${diffs.join('; ')}`);
      }
    }
    report(residue.length === 0,
      residue.length ? `${residue.length} elements did not come back: ${residue.join(', ')}`
                     : 'every sampled element is exactly what it was before the theme existed');

    /* Every palette colour as an rgb() triplet, less the ones the page uses itself. */
    const mine = (() => {
      global.self = global;
      require(path.join(ROOT, 'src', 'palette.js'));
      const vals = [];
      const walk = o => { for (const v of Object.values(o)) { if (typeof v === 'string') vals.push(v); else if (v && typeof v === 'object') walk(v); } };
      walk(global.FidelityDarkPalette.PALETTE);
      return [...new Set(vals.map(h => { const n = parseInt(h.slice(1), 16); return (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255); }))]
        .filter(t => !ownInline.includes(t));
    })();
    const stranded = await page.evaluate(MINE => {
      const out = [];
      for (const el of document.querySelectorAll('[style]')) {
        const v = el.getAttribute('style') || '';
        if (MINE.some(m => v.indexOf('(' + m + ')') !== -1 || v.indexOf('(' + m + ',') !== -1)) {
          out.push(el.tagName.toLowerCase() + '.' +
            String(el.className && (el.className.baseVal ?? el.className) || '').split(/\s+/)[0] +
            ' {' + v.slice(0, 70) + '}');
        }
      }
      return out;
    }, mine);
    if (stranded.length) for (const x of stranded.slice(0, 6)) console.log('      ' + x);
    report(stranded.length === 0,
      stranded.length ? `${stranded.length} elements still carry theme colours in a style attribute`
                      : 'no element carries a theme colour in its style attribute');

    const tags = await page.evaluate(() => document.querySelectorAll('[data-fdm-inline]').length);
    report(tags === 0, tags ? `${tags} elements still carry the bookkeeping attribute` : 'the bookkeeping attribute is gone');

    /* Every element present before the theme, except the few this file
       itself moves or restyles (TEST_TOUCHED). */
    const TEST_TOUCHED = ['#rasterLogo', '#ciqContainer', '#ticketFooter'];
    const fullOff = await snapAll(page, 'tag-kept');
    const leftovers = diffSnaps(fullBase, fullOff).filter(d => !TEST_TOUCHED.some(t => d.split(' ')[0].endsWith(t)));
    if (leftovers.length) for (const x of leftovers.slice(0, 10)) console.log('      ' + x.slice(0, 220));
    report(leftovers.length === 0, leftovers.length
      ? `${leftovers.length} elements anywhere on the page are not what they were before the theme`
      : `every element on the page (${Object.keys(fullBase).length}) is what it was before the theme`);

    /* While off, the passes stay quiet: neither the observer (new content, a
       new sheet) nor the chart hover hook may write. */
    await page.evaluate(() => {
      const pt = document.querySelector('#pieDomestic');
      if (pt) pt.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      const d = document.createElement('div');
      d.setAttribute('style', 'background-color:#ffffff;color:#141414');
      d.textContent = 'arrived after the theme was switched off';
      (document.querySelector('#card') || document.body).appendChild(d);
      const st = document.createElement('style');
      st.textContent = '.after-off{color:#333;background:#fff}';
      document.head.appendChild(st);
    });
    await page.waitForTimeout(900);
    const late = await page.evaluate(() => {
      const d = [...document.querySelectorAll('div')].find(x => x.textContent === 'arrived after the theme was switched off');
      return { inline: d ? d.getAttribute('style') : null, tagged: document.querySelectorAll('[data-fdm-inline]').length };
    });
    report(late.inline === 'background-color:#ffffff;color:#141414',
      `content added while off is left alone (${late.inline})`);
    report(late.tagged === 0, `the passes wrote to nothing while off (${late.tagged} tagged)`);

    await page.evaluate(() => window.__fdmStorageChanged && window.__fdmStorageChanged({ enabled: { newValue: true } }, 'sync'));
    await page.waitForTimeout(1200);
    const back = await q('#card');
    report(back !== null && lum(rgb(back.bg)) < 0.06,
      `switching it back on re-themes the page (card ${back && back.bg})`);
  }

  /* Profile and Transfer pages: pvd-modal draws a white box in a 2px black
     frame in its shadow root, pvd-loading-spinner draws its arc in
     currentColor borders, and the transfer tracker's done step is a green
     ring holding a picture of a green disc with a white tick. */
  console.log('\nloading dialog, wheel and transfer tracker');
  {
    const pf = await open('page_profile.html');
    await pf.waitForTimeout(800);
    const v = await pf.evaluate(async () => {
      const box = getComputedStyle(document.getElementById('dlg').shadowRoot.querySelector('.layer-modal-container'));
      const sr = document.getElementById('wheel').shadowRoot;
      const img = document.getElementById('tick');
      const im = new Image(); im.src = img.currentSrc || img.src; await im.decode();
      const cv = document.createElement('canvas'); cv.width = 60; cv.height = 60;
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0, 60, 60);
      const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
      return {
        frameBg: box.backgroundColor, frame: box.borderTopColor,
        layer: getComputedStyle(sr.querySelector('.loading-spinner-layer')).color,
        arc: getComputedStyle(sr.querySelector('.loading-spinner-mask-after')).borderTopColor,
        ring: getComputedStyle(img.parentElement).backgroundColor,
        filter: getComputedStyle(img).filter,
        disc: px(10, 30), tick: px(34, 30),
        after: getComputedStyle(document.getElementById('afterOutline')).backgroundColor
      };
    });
    const frame = rgb(v.frame), frameBg = rgb(v.frameBg);
    report(frame && hex(frame) === '#403F3E', `the dialog's black frame becomes the subtle line, not a white one (${v.frame})`);
    report(frameBg && lum(frameBg) < 0.06, `  around a dark dialog (${v.frameBg})`);
    report(v.arc === v.layer && lum(rgb(v.arc)) > 0.3, `the wheel's arc keeps its own green, so it is visible (${v.arc}, layer ${v.layer})`);
    report(v.filter === 'none', `the tracker's check picture is edited, not brightened by a filter (${v.filter})`);
    const ring = rgb(v.ring), disc = { r: v.disc[0], g: v.disc[1], b: v.disc[2] }, tick = { r: v.tick[0], g: v.tick[1], b: v.tick[2] };
    report(ring && hex(disc) === hex(ring), `  its disc is the colour of the ring it fills (${hex(disc)} / ${ring ? hex(ring) : '?'})`);
    report(contrast(tick, disc) >= 4.5, `  and the tick reads on it (${hex(tick)} on ${hex(disc)}, ${contrast(tick, disc).toFixed(1)}:1)`);
    report(lum(rgb(v.after)) < 0.06, `an inline outline colour does not stop the inline pass (${v.after})`);

    /* The page-loading box: a card, not a bare frame round the wheel. */
    const pb = await pf.evaluate(() => {
      const box = getComputedStyle(document.getElementById('pageBox'));
      const arc = getComputedStyle(document.getElementById('pageArc'));
      const page = getComputedStyle(document.body);
      return { bg: box.backgroundColor, frame: box.borderTopColor, frameW: box.borderTopWidth, shadow: box.boxShadow,
               arc: arc.borderTopColor, arcRight: arc.borderRightColor, page: page.backgroundColor };
    });
    report(pb.bg !== 'rgba(0, 0, 0, 0)' && hex(rgb(pb.bg)) === '#292928',
      `the page-loading box keeps a surface, the card (${pb.bg})`);
    report(pb.frameW === '2px' && hex(rgb(pb.frame)) === '#403F3E',
      `  with its 2px frame as the dialog's subtle line, not a white rectangle (${pb.frame})`);
    report(contrast(rgb(pb.bg), rgb(pb.page)) >= 1.3 || pb.shadow !== 'none',
      `  and it still stands off the page (${hex(rgb(pb.bg))} on ${hex(rgb(pb.page))}, shadow ${pb.shadow !== 'none'})`);
    report(lum(rgb(pb.arc)) > 0.3 && sat(rgb(pb.arc)) > 60 && pb.arcRight === 'rgba(0, 0, 0, 0)',
      `  while the wheel inside it keeps a green arc with its open side (${pb.arc}, right ${pb.arcRight})`);

    /* Printing hands the inline colours back and nothing re-themes them until
       the print is over; coming back adds no second copy of the emitted rules. */
    const sheetLen = () => pf.evaluate(() => [...document.querySelectorAll('style[data-fidelity-dark="emitted"]')].map(s => s.textContent).join('\n').length);
    const before = await sheetLen();
    await pf.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await pf.waitForTimeout(900);
    const printed = await pf.evaluate(() => getComputedStyle(document.getElementById('afterOutline')).backgroundColor);
    report(hex(rgb(printed)) === '#FFFFFF', `while printing, inline colours are the page's own (${printed})`);
    await pf.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await pf.waitForTimeout(1500);
    const back = await pf.evaluate(() => getComputedStyle(document.getElementById('afterOutline')).backgroundColor);
    const after = await sheetLen();
    report(lum(rgb(back)) < 0.06, `after printing they are themed again (${back})`);
    report(after === before, `  without a second copy of the emitted rules (${before} -> ${after} characters)`);
    await pf.close();
  }

  /* The quote summary: a white header and tab strip over a #f2f2f2 panel of white
     cards; the Top holdings ring is a CSS disc in the filled colour
     with clipped halves in the track colour, both set inline; the Fund profile
     module is styled by a sheet from another origin (localhost, not the page's
     127.0.0.1), which only the worker can read. Node stands in for the worker. */
  console.log('\nquote page: layout, holdings ring and research module');
  {
    const p = await browser.newPage();
    const asks = {};
    await p.exposeFunction('__fdmFetchCss', async urls => {
      for (const u of urls) { const k = u.split('/').pop(); asks[k] = (asks[k] || 0) + 1; }
      const out = [];
      /* a worker round trip is not instant; the late sheet makes that visible */
      if (urls.some(u => /quote_late\.css/.test(u))) await new Promise(r => setTimeout(r, 400));
      /* slower than the hold, so the module shows light for a while first */
      if (urls.some(u => /quote_late2/.test(u))) await new Promise(r => setTimeout(r, 2400));
      for (const url of urls) {
        /* the server listens on 127.0.0.1 only; localhost may resolve to ::1 first */
        const text = await new Promise(res => http.get(url.replace('//localhost:', '//127.0.0.1:'), r => {
          let b = ''; r.on('data', d => { b += d; }); r.on('end', () => res(r.statusCode === 200 ? b : ''));
        }).on('error', () => res('')));
        if (text) out.push({ url, text });
      }
      return out;
    });
    /* the worker's image fetch: the bytes as a data: URL */
    const imageAsks = {};
    await p.exposeFunction('__fdmFetchImage', async url => {
      const name = url.split('/').pop();
      imageAsks[name] = (imageAsks[name] || 0) + 1;
      const file = path.join(__dirname, 'art', name);
      if (!fs.existsSync(file)) return null;
      return 'data:image/gif;base64,' + fs.readFileSync(file).toString('base64');
    });
    await p.addInitScript(() => {
      window.chrome = {
        storage: { sync: { get: (d, cb) => cb && cb({}), set: (v, cb) => cb && cb() }, onChanged: { addListener() {} } },
        runtime: {
          id: 'fdm-test',
          sendMessage(msg, cb) {
            if (msg && msg.type === 'fdm:fetchCss') { window.__fdmFetchCss(msg.urls).then(sheets => cb && cb({ sheets })); return; }
            if (msg && msg.type === 'fdm:fetchImage') { window.__fdmFetchImage(msg.url).then(data => cb && cb({ data })); return; }
            cb && cb({ text: null });
          },
          lastError: null
        }
      };
    });
    await p.goto(origin + '/page_quote.html');
    await p.waitForFunction(() => [...document.styleSheets].some(s => /quote_module/.test(s.href || '')));
    for (const f of THEME) {
      const h = await p.addStyleTag({ content: read(f) });
      await h.evaluate(n => { n.dataset.fidelityDark = 'theme'; });
    }
    for (const f of SCRIPTS) await p.addScriptTag({ content: read(f) });
    await p.waitForTimeout(2500);
    const v = await p.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return {
        ring: cs('ring').backgroundColor, one: cs('sliceOne').backgroundColor, two: cs('sliceTwo').backgroundColor,
        center: cs('ringCenter').backgroundColor, card: cs('holdings').backgroundColor, pct: cs('pct').color,
        mod: cs('module').backgroundColor, modInk: cs('module').color, link: cs('moduleLink').color,
        icon: cs('moduleIcon').backgroundImage, iconBg: cs('moduleIcon').backgroundColor,
        main: cs('main').backgroundColor, tabs: cs('tabs').backgroundColor, tabsShadow: cs('tabs').boxShadow, cursor: cs('rangeCursor').backgroundColor,
        panel: cs('panel').backgroundColor,
        star: cs('starIcon').color, starWrap: getComputedStyle(document.getElementById('starIcon').parentElement).color,
        plainIcon: cs('plainIcon').color, search: cs('searchIcon').color,
        searchWrap: getComputedStyle(document.getElementById('searchIcon').parentElement).color
      };
    });
    const card = rgb(v.card), ring = rgb(v.ring), track = rgb(v.one);
    report(v.tabs === v.main && lum(rgb(v.main)) < 0.01, `the tab strip is the header's colour, one band as in light mode (${v.tabs} / ${v.main})`);
    report(!/255, 255, 255/.test(v.tabsShadow), `  and the white shadows that widen it are dark too (${v.tabsShadow.slice(0, 40)})`);
    report(hex(rgb(v.panel)) === '#0E0E0E' && v.panel !== v.main, `the #f2f2f2 panel sits a step below the band (${v.panel})`);
    report(hex(card) === '#292928' && contrast(card, rgb(v.panel)) > 1.2, `  and the cards on it keep the card colour, apart from the panel (${v.card})`);
    report(lum(rgb(v.cursor)) > 0.5, `the day range's price marker is light on the dark line (${v.cursor})`);
    report(hex(ring) === '#8CC1FD', `the ring's filled arc is the link blue (${v.ring})`);
    report(v.one === v.two && hex(track) === '#403F3E', `its track is the subtle line, not a light band (${v.one}, ${v.two})`);
    report(contrast(ring, track) >= 3, `  and the arc stands apart from the track (${contrast(ring, track).toFixed(1)}:1)`);
    report(v.center === v.card && lum(card) < 0.06, `the ring's hole is the card behind it (${v.center} / ${v.card})`);
    report(lum(rgb(v.mod)) < 0.06 && contrast(rgb(v.modInk), rgb(v.mod)) >= 7,
      `a module styled from another origin is themed (${v.mod}, ink ${v.modInk})`);
    report(contrast(rgb(v.link), rgb(v.mod)) >= 4.5, `  and its links read (${v.link})`);
    report(/^url\("http:\/\/localhost:\d+\/sort_ascending\.svg"\)$/.test(v.icon),
      `  a relative url in that sheet resolves against the sheet, not the page (${v.icon})`);
    /* Icons take secondary ink, but not over a colour the page gives their
       wrapper on purpose. */
    const star = rgb(v.star);
    report(v.star === v.starWrap && star.r > star.g && star.g > star.b && sat(star) > 80,
      `a rating star keeps the orange its wrapper sets (${hex(star)}, wrapper ${hex(rgb(v.starWrap))})`);
    report(v.search === v.searchWrap && sat(rgb(v.search)) > 80, `  and so does the green search icon (${hex(rgb(v.search))})`);
    report(hex(rgb(v.plainIcon)) === '#D9D8D5', `  while an icon in an uncoloured wrapper keeps secondary ink (${hex(rgb(v.plainIcon))})`);

    /* The provider's GIF glyph: a host without CORS headers, so its pixels
       came through the worker; a blue mark whose edge is baked against white. */
    const glyph = await p.evaluate(async () => {
      const img = document.getElementById('holdingsGlyph');
      const src = img.getAttribute('src') || '';
      if (!/^data:image\/png/.test(src)) return { src: src.slice(0, 40) };
      const im = new Image(); im.src = src; await im.decode();
      const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const c = cv.getContext('2d'); c.drawImage(im, 0, 0);
      const d = c.getImageData(0, 0, cv.width, cv.height).data;
      let pale = 0, soft = 0, white = 0, blue = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3], mn = Math.min(d[i], d[i + 1], d[i + 2]);
        if (!a) continue;
        if (a < 255) soft++;
        else if (mn > 240) white++;
        else if (mn > 150) pale++;
        else if (d[i + 2] > d[i] + 60) blue++;
      }
      return { src: src.slice(0, 22), pale, soft, white, blue, filter: getComputedStyle(img).filter };
    });
    report(/^data:image\/png;base64/.test(glyph.src), `the provider's GIF glyph was read through the worker and edited (${glyph.src})`);
    report(glyph.pale === 0 && glyph.soft >= 20 && glyph.blue >= 60 && glyph.white >= 8,
      `  its white fringe is un-blended into soft blue edges, its blue and its white lines kept (${glyph.pale} pale, ${glyph.soft} soft, ${glyph.blue} blue, ${glyph.white} white)`);
    report(/^brightness\(/.test(glyph.filter), `  and the mark, too dark for the card, is brightened as well (${glyph.filter})`);
    report((imageAsks['holdings_glyph.gif'] || 0) === 1, `  the worker was asked for it once (${imageAsks['holdings_glyph.gif'] || 0})`);

    /* The provider's wordmark beside it is someone else's brand: never edited
       or filtered, and sat on a small white chip where its red reads. */
    const mark = await p.evaluate(() => {
      const img = document.getElementById('providerMark');
      const cs = getComputedStyle(img);
      return { src: img.getAttribute('src') || '', filter: cs.filter, bg: cs.backgroundColor, outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, radius: cs.borderRadius };
    });
    report(/\/provider_mark\.gif$/.test(mark.src) && mark.filter === 'none', `the provider's wordmark is left as served, unfiltered (${mark.src.split('/').pop()}, ${mark.filter})`);
    report(mark.bg === 'rgb(255, 255, 255)' && /^3px solid rgb\(255, 255, 255\)$/.test(mark.outline),
      `  on a white chip (${mark.bg}, outline ${mark.outline})`);
    report((imageAsks['provider_mark.gif'] || 0) === 0, `  and the worker was never asked for it (${imageAsks['provider_mark.gif'] || 0})`);

    /* A two-tone drawing: dark grey lines with an orange base. The lines are
       lifted to ink in the pixels and the orange is kept; a filter could only
       have done one or the other. */
    for (let t = 0; t < 30; t++) {
      if (await p.evaluate(() => /^data:image\/png/.test(document.getElementById('twoTone').getAttribute('src') || ''))) break;
      await p.waitForTimeout(100);
    }
    const two = await p.evaluate(async () => {
      const img = document.getElementById('twoTone');
      const src = img.getAttribute('src') || '';
      if (!/^data:image\/png/.test(src)) return { src: src.slice(0, 30) };
      const im = new Image(); im.src = src; await im.decode();
      const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const c = cv.getContext('2d'); c.drawImage(im, 0, 0);
      const d = c.getImageData(0, 0, cv.width, cv.height).data;
      let darkNeutral = 0, lightNeutral = 0, orange = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 8) continue;
        const r = d[i], g = d[i + 1], b = d[i + 2], chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const l = r * 0.299 + g * 0.587 + b * 0.114;
        if (chroma <= 40 && l < 128) darkNeutral++;
        else if (chroma <= 40) lightNeutral++;
        else if (r > 200 && g > 120 && g < 200 && b < 90) orange++;
      }
      return { src: src.slice(0, 22), darkNeutral, lightNeutral, orange, filter: getComputedStyle(img).filter };
    });
    report(/^data:image\/png;base64/.test(two.src), `a two-tone drawing is edited in its pixels (${two.src})`);
    report(two.darkNeutral === 0 && two.lightNeutral >= 60, `  its dark grey lines are ink now (${two.darkNeutral} dark, ${two.lightNeutral} light)`);
    report(two.orange >= 100 && two.filter === 'none', `  while its orange base is untouched and no filter is laid over it (${two.orange} orange, filter ${two.filter})`);

    /* The ring as the quote app renders it on a route change: inserted after
       the first pass, so the observer's same-task placeholder pass sees its
       empty halves first. They are the ring's, not skeletons. */
    const spa = await p.evaluate(async () => {
      const host = document.createElement('div');
      host.className = 'donut-chart';
      host.innerHTML = '<donut><div class="donut-chart chart" id="ring2" style="background: rgb(29, 57, 134);">' +
        '<div class="slice one" id="ring2a" style="transform: rotate(125.4deg); background: rgb(230, 230, 230); clip: rect(0px, 30px, 15px, 0px);"></div>' +
        '<div class="slice two" id="ring2b" style="transform: rotate(0deg); background: rgb(230, 230, 230); clip: rect(0px, 15px, 30px, 0px);"></div>' +
        '<div class="chart-center" id="ring2c"></div></div></donut>';
      document.getElementById('holdings').appendChild(host);
      await new Promise(r => setTimeout(r, 1200));
      const cs = id => getComputedStyle(document.getElementById(id));
      return { a: cs('ring2a').backgroundColor, b: cs('ring2b').backgroundColor, hole: cs('ring2c').backgroundColor,
               card: cs('holdings').backgroundColor, edge: cs('ring2').boxShadow };
    });
    report(hex(rgb(spa.a)) === '#403F3E' && spa.a === spa.b, `a ring inserted on a route change still gets its track (${spa.a}, ${spa.b})`);
    report(spa.hole === spa.card, `  and its hole is the card, not a placeholder grey (${spa.hole} / ${spa.card})`);
    report(/inset/.test(spa.edge) && /64, 63, 62/.test(spa.edge), `  and the arc's anti-aliased rim is covered by the track colour (${spa.edge})`);

    /* A cross-origin sheet that arrives later is held out of the cascade until
       its dark copy is in, so it never paints light in between. */
    const late = await p.evaluate(() => new Promise(resolve => {
      const el = document.getElementById('late');
      const seen = new Set();
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = location.protocol + '//localhost:' + location.port + '/quote_late.css';
      document.head.appendChild(l);
      const t0 = performance.now();
      (function frame() {
        seen.add(getComputedStyle(el).backgroundColor);
        if (performance.now() - t0 < 1500) requestAnimationFrame(frame);
        else resolve({ seen: [...seen], end: getComputedStyle(el).backgroundColor });
      })();
    }));
    report(!late.seen.some(c => lum(rgb(c)) > 0.5), `a late cross-origin sheet never paints light (${late.seen.join(' / ')})`);
    report(lum(rgb(late.end)) < 0.06, `  and lands dark (${late.end})`);

    /* A sheet slower than the hold: the module paints light for a while, the
       contrast pass judges its ink against white, and that verdict has to be
       taken again once the dark copy lands. */
    const slow = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = location.protocol + '//localhost:' + location.port + '/quote_late2.css';
      document.head.appendChild(l);
      await wait(1300);                  // the hold has let it go; the dark copy is still on its way
      const box = document.createElement('div');
      box.className = 'MOD2';
      box.innerHTML = '<span class="timestamp" id="stamp2">As of Aug-31-2026</span>';
      document.getElementById('panel').appendChild(box);
      await wait(800);
      const early = getComputedStyle(document.getElementById('stamp2')).color;
      await wait(1600);
      return { early, stamp: getComputedStyle(document.getElementById('stamp2')).color, bg: getComputedStyle(box).backgroundColor };
    });
    report(lum(rgb(slow.bg)) < 0.06 && contrast(rgb(slow.stamp), rgb(slow.bg)) >= 4.5,
      `ink judged while a module was light is judged again once it is dark (${slow.early} -> ${slow.stamp} on ${slow.bg})`);
    report(Object.keys(asks).length === 3 && Object.values(asks).every(n => n === 1),
      `  and each cross-origin sheet is asked of the worker once, held or not (${JSON.stringify(asks)})`);
    await p.close();
  }


  /* The Summary page's movers list: the hover highlight is each row's rounded
     ::before; the list container's class also contains "am-columns--row". The
     apex-kit tooltip paints bubble and pointer from its own variables. */
  console.log('\nmovers list hover and tooltip pointer');
  {
    const pm = await open('page_movers.html');
    await pm.hover('#row2');
    await pm.waitForTimeout(150);
    const v = await pm.evaluate(() => {
      const cs = (id, pseudo) => getComputedStyle(document.getElementById(id), pseudo || null);
      return {
        card: cs('moversCard').backgroundColor, rows: cs('rows').backgroundColor,
        row1: cs('row1').backgroundColor, row2: cs('row2').backgroundColor,
        band: cs('row2', '::before').backgroundColor, other: cs('row1', '::before').backgroundColor,
        tip: cs('tip').backgroundColor, tipLine: cs('tip').borderTopColor,
        arrow: cs('tipArrow', '::after').backgroundColor, arrowLine: cs('tipArrow', '::after').borderTopColor
      };
    });
    report(v.rows === 'rgba(0, 0, 0, 0)' && v.row1 === 'rgba(0, 0, 0, 0)', `hovering a row does not light the whole list (${v.rows}, ${v.row1})`);
    report(hex(rgb(v.band)) === '#2F2F2F' && v.band !== v.card, `  only the hovered row's band lights, a step off the card (${v.band} on ${v.card})`);
    report(v.other === 'rgba(0, 0, 0, 0)', `  and the other rows' bands stay clear (${v.other})`);
    report(v.arrow === v.tip, `the tooltip's pointer is its bubble's colour (${v.arrow} / ${v.tip})`);
    report(v.arrowLine === v.tipLine, `  with the same outline (${v.arrowLine} / ${v.tipLine})`);

    /* Pointers drawn by the stylesheet, not by variables: every tooltip and
       popover pointer is mapped with its bubble (floatingLayer in recolor.js). */
    const t = await pm.evaluate(() => {
      const cs = (id, pseudo) => getComputedStyle(document.getElementById(id), pseudo || null);
      const a = cs('qqArrow', '::after'), b = cs('qqTip'), s = cs('simpleTip'), sa = cs('simpleTip', '::after');
      return { bubble: b.backgroundColor, line: b.borderTopColor, fill: a.backgroundColor,
               sides: [a.borderTopColor, a.borderRightColor, a.borderBottomColor, a.borderLeftColor],
               simple: s.backgroundColor, simpleLine: s.borderTopColor, tri: sa.borderTopColor, triSide: sa.borderLeftColor };
    });
    report(t.fill === t.bubble, `a quick-quote tooltip's pointer is its bubble's colour (${t.fill} / ${t.bubble})`);
    report(t.sides[1] === t.line && t.sides[2] === t.line && t.sides[0] === t.bubble && t.sides[3] === t.bubble,
      `  outlined where the bubble is and edged in the bubble's colour elsewhere (${t.sides.join(' / ')})`);
    report(t.tri === t.simple && t.triSide === 'rgba(0, 0, 0, 0)',
      `a border-triangle pointer on a bubble's ::after is the bubble's colour (${t.tri} / ${t.simple}), its other sides clear`);

    /* The pvd3 tooltip outlines bubble and pointer with one variable, but the
       bubble's outline is also set by name in 03-components.css. */
    const q = await pm.evaluate(() => {
      const b = getComputedStyle(document.getElementById('pvdTip')), a = getComputedStyle(document.getElementById('pvdArrow'), '::after');
      return { bubble: b.backgroundColor, line: b.borderTopColor, fill: a.backgroundColor,
               sides: [a.borderTopColor, a.borderRightColor, a.borderBottomColor, a.borderLeftColor] };
    });
    report(q.fill === q.bubble && q.sides[2] === q.line && q.sides[3] === q.line && q.sides[0] === 'rgba(0, 0, 0, 0)',
      `a pvd3 tooltip's pointer has its bubble's fill and outline (${q.fill} / ${q.bubble}; ${q.sides.join(' / ')} against ${q.line})`);
    const r = await pm.evaluate(() => [getComputedStyle(document.getElementById('rangeArrow')).backgroundColor, getComputedStyle(document.getElementById('rangeTip')).backgroundColor]);
    report(r[0] === r[1], `  and keeps it inside a popover-named container (${r[0]} / ${r[1]})`);
    await pm.close();
  }

  /* The account rail: All accounts, a group and an account each take the same
     selected plate and outline, as light mode gives them one tint. */
  console.log('\naccount rail selection');
  {
    const pa = await open('page_accounts.html');
    const v = await pa.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return { all: cs('allAccts').backgroundColor, group: cs('groupLink').backgroundColor, acct: cs('acctSel').backgroundColor,
               plain: cs('acctPlain').backgroundColor, allLine: cs('allAccts').borderTopColor, acctLine: cs('acctSel').borderTopColor };
    });
    report(v.all === v.acct && v.acct === v.group, `every selected item has the same plate (${v.all} / ${v.group} / ${v.acct})`);
    report(v.all !== v.plain && lum(rgb(v.all)) < 0.06, `  a step off an unselected one (${v.plain})`);
    report(v.allLine === v.acctLine && lum(rgb(v.allLine)) > 0.3, `  with the same outline on All accounts and an account (${v.allLine} / ${v.acctLine})`);
    await pa.close();
  }

  /* Reading what light mode paints lifts the theme by its gate class alone.
     Disabling the emitted sheets instead made the browser rebuild its author
     style and fetch every @font-face again, and research2relay serves font
     files that are not fonts: each read logged their failure again, under
     the extension's name. */
  console.log('\nreading light mode leaves the page\'s stylesheets and fonts alone');
  {
    const pfnt = await open('page_fonts.html');
    const notes = [];
    pfnt.on('console', m => { if (/Failed to decode downloaded font|OTS parsing error/.test(m.text())) notes.push(m.text()); });
    const fetchedAtLoad = served.get('broken.woff2') || 0;
    report(fetchedAtLoad >= 1, `the page itself fetched the broken font (${fetchedAtLoad} time${fetchedAtLoad === 1 ? '' : 's'})`);
    const reads = await pfnt.evaluate(() => {
      const R = self.FidelityDarkRecolor;
      const sheets = [...document.styleSheets].map(s => s.disabled);
      const out = [];
      for (let i = 0; i < 12; i++) out.push(R.readLight([document.getElementById('w1'), document.body], 'background-color')[0]);
      const after = [...document.styleSheets].map(s => s.disabled);
      return { light: out[0], same: out.every(v => v === out[0]), untouched: sheets.join() === after.join(), dark: getComputedStyle(document.getElementById('w1')).backgroundColor };
    });
    await pfnt.waitForTimeout(600);
    report(reads.light === 'rgb(255, 255, 255)' && reads.same && lum(rgb(reads.dark)) < 0.06,
      `a light-mode read answers the page's own white and leaves the dark surface in place (${reads.light}, then ${reads.dark})`);
    report(reads.untouched, 'no stylesheet was disabled or enabled to do it');
    const refetched = (served.get('broken.woff2') || 0) - fetchedAtLoad;
    report(refetched === 0 && notes.length === 0,
      `twelve reads fetched the broken font ${refetched} more times and logged ${notes.length} decode failures`);
    /* for the record: what one round of disabling the sheets costs */
    await pfnt.evaluate(() => {
      const sheets = [...document.querySelectorAll('style[data-fidelity-dark]')];
      sheets.forEach(st => { st.disabled = true; });
      getComputedStyle(document.body).backgroundColor;
      sheets.forEach(st => { st.disabled = false; });
      getComputedStyle(document.body).backgroundColor;
    });
    await pfnt.waitForTimeout(600);
    console.log(`        (one round of disabling the sheets instead: ${(served.get('broken.woff2') || 0) - fetchedAtLoad - refetched} fetches, ${notes.length} decode failures logged)`);
    await pfnt.close();
  }

  /* The research "view all" route: Chart.js canvases and the HTML keys beside
     them, bars and a pointer drawn as inline-coloured boxes, striped tables,
     always-scrolling cards and a chart delivered as a PNG. */
  console.log('\nresearch view-all: canvas charts, box marks, stripes, a chart picture');
  {
    const pr = await open('page_research.html');
    await pr.mouse.move(1, 1);
    await pr.waitForTimeout(400);
    const px = (id, x, y) => pr.evaluate(([i, x, y]) => [...document.getElementById(i).getContext('2d').getImageData(x, y, 1, 1).data], [id, x, y]);
    const hexOf = p => '#' + p.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    const cat = c => pr.evaluate(c => self.FidelityDarkRecolor.mapCategorical(c).toUpperCase(), c);
    const NAVY = await cat('#053161'), ORANGE = await cat('#F5A528');

    const n1 = await px('donut', 144, 46), o1 = await px('donut', 100, 152), sep = await px('donut', 162, 90);
    report(hexOf(n1) === NAVY, `a Chart.js slice drawn before the theme found it is redrawn as a chart mark (${hexOf(n1)}, wants ${NAVY})`);
    report(hexOf(o1) === ORANGE, `  and so is the other slice (${hexOf(o1)}, wants ${ORANGE})`);
    report(hexOf(sep) === '#292928', `  and the white rule between them is the card (${hexOf(sep)})`);
    const keys = await pr.evaluate(() => ['tileTop', 'tileOther'].map(id => getComputedStyle(document.getElementById(id)).backgroundColor));
    report(hex(rgb(keys[0])) === NAVY && hex(rgb(keys[1])) === ORANGE, `its HTML key matches the slices (${keys.map(k => hex(rgb(k))).join(', ')})`);
    report(hexOf(await px('plainCanvas', 20, 20)) === '#053161', `a canvas that is not a chart draws as it always did`);
    const line = await px('growth', 200, 120), grid = await px('growth', 500, 20), label = await px('growth', 12, 48), mark = await px('growth', 320, 140);
    report(hexOf(line) === '#FFFFFF', `a black series line is drawn light (${hexOf(line)})`);
    report(hexOf(grid) === '#FFFFFF' && grid[3] > 0 && grid[3] < 60, `  a faint black gridline is a faint light one (${hexOf(grid)} at alpha ${grid[3]})`);
    report(hexOf(label) === '#B3B3B3', `  a grey label is ink (${hexOf(label)})`);
    report(hexOf(mark) === await cat('#0F57C2'), `  and a coloured mark is a chart mark (${hexOf(mark)})`);
    await pr.evaluate(() => { window.makeLateChart('late', false); window.makeLateChart('lateAnim', true); });
    await pr.waitForTimeout(500);
    report(hexOf(await px('late', 144, 46)) === NAVY, `a chart built later, as on a route change, is found and mapped`);
    const lateRenders = await pr.evaluate(() => [document.getElementById('late').renders, document.getElementById('lateAnim').renders]);
    report(hexOf(await px('lateAnim', 144, 46)) === NAVY && lateRenders[1] === 1,
      `  one found before its first frame is mapped as it draws, with no extra redraw (${lateRenders.join(' / ')} renders)`);

    const m = await pr.evaluate(() => {
      const bg = id => getComputedStyle(document.getElementById(id)).backgroundColor;
      return { navy: bg('fillNavy'), orange: bg('fillOrange'), diamond: bg('diamond'), iconNavy: bg('iconNavy'), iconGreen: bg('iconGreen'), dot: bg('statusDot'),
               axis: bg('axis'), plate: bg('greyPlate'), track: getComputedStyle(document.getElementById('fillNavy').parentElement).backgroundColor };
    });
    report(hex(rgb(m.track)) === '#403F3E', `the track a bar fills shows how much is left, as light mode's grey does (${hex(rgb(m.track))})`);
    const shown = await pr.evaluate(async () => {
      document.getElementById('geoPanel').style.display = 'block';
      await new Promise(r => setTimeout(r, 300));
      const f = document.getElementById('fillHidden');
      return [getComputedStyle(f).backgroundColor, getComputedStyle(f.parentElement).backgroundColor];
    });
    report(hex(rgb(shown[0])) === await cat('#083260') && hex(rgb(shown[1])) === '#403F3E',
      `  and so do bars behind a tab, shown after the page has loaded (${shown.map(c => hex(rgb(c))).join(', ')})`);
    report(hex(rgb(m.axis)) === '#757473' && hex(rgb(m.plate)) === '#403F3E',
      `a 2px grey box is a line and maps as one, a taller one stays a surface (${hex(rgb(m.axis))}, ${hex(rgb(m.plate))})`);
    report(hex(rgb(m.navy)) === await cat('#083260') && hex(rgb(m.orange)) === await cat('#DE5E29'),
      `exposure bars keep their colours, as chart marks, over the grey their class paints (${hex(rgb(m.navy))}, ${hex(rgb(m.orange))})`);
    report(hex(rgb(m.diamond)) === '#FFFFFF', `the black percentile pointer is drawn light (${hex(rgb(m.diamond))})`);
    report(hex(rgb(m.iconNavy)) === await cat('#043464') && hex(rgb(m.iconGreen)) === await cat('#458915'),
      `ownership key icons are chart marks, like the donut they key (${hex(rgb(m.iconNavy))}, ${hex(rgb(m.iconGreen))})`);
    report(hex(rgb(m.dot)) === '#403F3E', `  while a small grey box outside any chart keeps the surface map (${hex(rgb(m.dot))})`);

    const s = await pr.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return { r1: cs('row1').backgroundColor, r2: cs('row2').backgroundColor, r3: cs('row3').backgroundColor,
               odd: cs('holderOdd').backgroundColor, even: cs('holderEven').backgroundColor,
               active: cs('thActive').borderBottomColor, plain: cs('thPlain').borderBottomColor, red: cs('namedRed').color,
               sw: cs('scrollCard').scrollbarWidth, sc: cs('scrollCard').scrollbarColor };
    });
    report(hex(rgb(s.r1)) === '#323232' && hex(rgb(s.r3)) === '#323232' && s.r2 === 'rgba(0, 0, 0, 0)',
      `a striped table keeps its stripes, a step off the card (${hex(rgb(s.r1))}, ${s.r2})`);
    report(hex(rgb(s.odd)) === '#2F2F2F' && s.even === 'rgba(0, 0, 0, 0)', `  and a paler stripe stays a smaller step (${hex(rgb(s.odd))})`);
    report(hex(rgb(s.active)) === '#5CBF4A' && rgb(s.plain).a === 0, `the sorted column keeps its green underline (${s.active}, ${s.plain})`);
    report(hex(rgb(s.red)) === '#FF6868', `a colour given by name is mapped (${s.red})`);
    report(s.sw === 'auto' && s.sc === 'auto', `a card that always scrolls keeps the browser's own scrollbars (${s.sw}, ${s.sc})`);
    {
      /* The corner where a box's two scrollbars meet: Windows paints it white,
         Linux grey. Headless Chromium hides scrollbars, so this one browser
         shows them, over 00-base.css alone. */
      const b2 = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
      const p2 = await b2.newPage({ viewport: { width: 400, height: 300 } });
      await p2.setContent('<!doctype html><style>' + read('src/theme/00-base.css') + ' body{margin:0} #c{background:#292928;width:300px;height:150px;overflow:scroll;margin:20px}</style><div id="c">x</div>');
      const g = await p2.evaluate(() => { const e = document.getElementById('c'); return e.offsetWidth - e.clientWidth; });
      const buf = await p2.screenshot();
      const c = await p2.evaluate(async ({ b64, x, y }) => {
        const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
        const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
        return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
      }, { b64: buf.toString('base64'), x: 20 + 300 - 3, y: 20 + 150 - 3 });
      await b2.close();
      report(g > 0 && hex({ r: c[0], g: c[1], b: c[2] }) === '#292928', `  and the corner where its two scrollbars meet shows the box, not a white square (${hex({ r: c[0], g: c[1], b: c[2] })})`);
    }
    const tip = await pr.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      const t = cs('tipText'), m = cs('tipModal');
      return { bg: t.backgroundColor, top: t.borderTopColor, bottom: t.borderBottomColor, right: m.borderRightColor, filter: cs('tipArrow').filter };
    });
    report(hex(rgb(tip.bg)) === '#403F3E' && [tip.top, tip.bottom, tip.right].every(c => hex(rgb(c)) === '#757473'),
      `the Distributions tooltip is a tooltip, one outline all round (${hex(rgb(tip.bg))}; ${[tip.top, tip.bottom, tip.right].map(c => hex(rgb(c))).join(', ')})`);
    {
      await pr.evaluate(() => document.getElementById('tipModal').scrollIntoView({ block: 'center' }));
      const pts = await pr.evaluate(() => { const r = document.getElementById('tipArrow').getBoundingClientRect(); return [[r.x + 18, r.y + 45], [r.x + 24.5, r.y + 100]]; });
      const shot = await pr.screenshot();
      const c = await pr.evaluate(async ({ b64, pts }) => {
        const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
        const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
        return pts.map(([x, y]) => [...ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data].slice(0, 3));
      }, { b64: shot.toString('base64'), pts });
      const near = (p, h, d) => { const w = rgb(h.replace(/^#(..)(..)(..)$/, (m, a, b, c) => 'rgb(' + parseInt(a, 16) + ',' + parseInt(b, 16) + ',' + parseInt(c, 16) + ')')); return Math.abs(p[0] - w.r) <= d && Math.abs(p[1] - w.g) <= d && Math.abs(p[2] - w.b) <= d; };
      report(near(c[0], '#403F3E', 4) && near(c[1], '#757473', 4),
        `  and its drawn pointer and left edge take the bubble and the outline (${c.map(p => hex({ r: p[0], g: p[1], b: p[2] })).join(', ')})`);
    }
    const sm = await pr.evaluate(() => ['curDot', 'curIcon', 'cellHist', 'histIcon'].map(id => getComputedStyle(document.getElementById(id)).backgroundColor));
    report(sm[0] === sm[1] && sm[2] === sm[3] && contrast(rgb(sm[0]), rgb(sm[2])) >= 3,
      `the style map's current dot stands out on its cell, and each key matches what it keys (${sm.map(c => hex(rgb(c))).join(', ')}, ${contrast(rgb(sm[0]), rgb(sm[2])).toFixed(1)}:1)`);
    const lk = await pr.evaluate(() => ['keyGreen', 'keyRed', 'avgMarker'].map(id => getComputedStyle(document.getElementById(id)).backgroundColor));
    report(hex(rgb(lk[0])) === await cat('#427931') && hex(rgb(lk[1])) === await cat('#E76109'),
      `a chart key in a <legend>, coloured by its class, is a chart mark (${hex(rgb(lk[0]))}, ${hex(rgb(lk[1]))})`);
    const avgWant = await pr.evaluate(() => self.FidelityDarkRecolor.mapColor('#013b61', 'border', null).toUpperCase());
    report(hex(rgb(lk[2])) === avgWant, `a 1px navy average marker is drawn as a visible line (${hex(rgb(lk[2]))})`);

    const pic = await pr.evaluate(async () => {
      const img = document.getElementById('distImg');
      await img.decode().catch(() => {});
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const c = cv.getContext('2d');
      c.drawImage(img, 0, 0);
      const at = (x, y) => [...c.getImageData(x, y, 1, 1).data];
      return { paper: at(5, 5), bar: at(60, 40), rule: at(5, 70), label: at(210, 85) };
    });
    report(pic.paper[3] === 0, `a chart picture's white paper becomes see-through (alpha ${pic.paper[3]})`);
    report(hexOf(pic.bar) === await cat('#51823C') && pic.bar[3] === 255, `  its bars are chart marks (${hexOf(pic.bar)})`);
    report(hexOf(pic.label) === '#D9D8D5' && pic.label[3] === 255, `  its black labels are light ink (${hexOf(pic.label)})`);
    report(pic.rule[3] > 0 && pic.rule[3] < 80, `  and its pale rule stays faint (alpha ${pic.rule[3]})`);

    await pr.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const printed = [await px('donut', 144, 46), await px('growth', 200, 120), await px('growth', 12, 48)];
    report(hexOf(printed[0]) === '#053161' && hexOf(printed[1]) === '#000000' && hexOf(printed[2]) === '#666666',
      `a print gets each chart's own colours back at once (${printed.map(hexOf).join(', ')})`);
    await pr.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await pr.waitForTimeout(600);
    report(hexOf(await px('donut', 144, 46)) === NAVY, `  and the screen gets the dark ones after it`);

    await pr.evaluate(() => window.__fdmStorageChanged({ enabled: { newValue: false } }, 'sync'));
    await pr.waitForTimeout(600);
    const off = [await px('donut', 144, 46), await px('growth', 200, 120)];
    const offKey = await pr.evaluate(() => getComputedStyle(document.getElementById('tileTop')).backgroundColor);
    report(hexOf(off[0]) === '#053161' && hexOf(off[1]) === '#000000' && hex(rgb(offKey)) === '#053161',
      `switching the theme off redraws the charts and their key in their own colours (${off.map(hexOf).join(', ')}, ${hex(rgb(offKey))})`);
    await pr.evaluate(() => window.__fdmStorageChanged({ enabled: { newValue: true } }, 'sync'));
    await pr.waitForTimeout(900);
    report(hexOf(await px('donut', 144, 46)) === NAVY, `  and switching it on maps them again`);

    /* An update leaves the old script running without its extension, the
       theme CSS withdrawn. It hands the page back at the next change. */
    await pr.evaluate(() => { window.chrome.runtime.id = undefined; document.body.appendChild(document.createElement('div')); });
    await pr.waitForTimeout(700);
    const orphan = await pr.evaluate(() => ({
      off: document.documentElement.classList.contains('fdm-off'),
      emitted: document.querySelectorAll('style[data-fidelity-dark="emitted"]').length,
      tile: getComputedStyle(document.getElementById('tileTop')).backgroundColor,
      row: getComputedStyle(document.getElementById('row1')).backgroundColor
    }));
    const orphanSlice = hexOf(await px('donut', 144, 46));
    report(orphan.off && orphan.emitted === 0 && hex(rgb(orphan.tile)) === '#053161' && hex(rgb(orphan.row)) === '#F2F2F2' && orphanSlice === '#053161',
      `a script orphaned by an update hands the whole page back, charts too (${orphan.emitted} sheets, ${hex(rgb(orphan.tile))}, ${hex(rgb(orphan.row))}, ${orphanSlice})`);
    await pr.close();
  }
  await browser.close();
  server.close();
  console.log(`\n${checks - fails}/${checks} rendered assertions pass` + (fails ? `  (${fails} FAILED)` : ''));
  process.exit(fails ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
