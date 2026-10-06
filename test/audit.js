/* Fidelity Dark Mode - test/audit.js. Runs the mapping engine in Node over the
 * colours Fidelity's stylesheets use and checks the results: backgrounds, ink
 * contrast, border grades, chart and SVG rewrites, and that the CSS variables
 * match palette.js. Run with `node test/audit.js`; it exits 1 on a failure.
 */
'use strict';
const path = require('path');
const fs = require('fs');
global.self = global;
require(path.join(__dirname, '..', 'src', 'palette.js'));
require(path.join(__dirname, '..', 'src', 'recolor.js'));

const R = self.FidelityDarkRecolor;
const P = self.FidelityDarkPalette.PALETTE;

const chan = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = hex => { const c = R.parseColor(hex); return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b); };
const crOn = (hex, on) => R.contrast(R.parseColor(hex), R.parseColor(on));
const chromatic = hex => { const c = R.parseColor(hex);
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 26; };

const ACCENTS = new Set([
  P.green, P.greenHov, P.greenAct, P.gain, P.loss, P.crit, P.warn, P.info, P.link,
  /* filled controls are light fills by design */
  P.btn, P.btnHov, P.btnAct,
  /* Fidelity's status container backgrounds: a tinted box has to read as a
     box, so some sit just above the dark-surface line */
  P.successBg, P.lossBg, P.infoBg, P.warnBg, '#044014', '#1d3986', '#a11313', '#9d3b0f',
  P.chart.domestic, P.chart.foreign, P.chart.bonds, P.chart.fixed, P.chart.other, P.chart.unknown
].map(s => s.toLowerCase()));

/* colour literals Fidelity's stylesheets use often, by the role they play */
const CASES = {
  bg: ['#ffffff', '#f9f7f5', '#f5f3f0', '#e6e4e1', '#d9d8d5', '#f2f2f2', '#eeeeee', '#000000',
       '#368727', '#1e6f1d', '#c31212', '#ffcd00', '#013b61', '#1dade2', '#9d66c1',
       '#edfaeb', '#d4f3cf', '#fff1f1', '#ffe0e0', '#daebff', '#f5faff', '#fff8ed'],
  fg: ['#000000', '#141414', '#292928', '#403f3e', '#525150', '#757473', '#abaaa8', '#666666',
       '#333333', '#ffffff', '#368727', '#1e6f1d', '#0d6f3f', '#044014', '#568200',
       '#b41212', '#c31212', '#dc1616', '#1d3986', '#2751c2', '#8cc1fd', '#356f95',
       '#1dade2', '#ffcd00', '#cc4700', '#5c0198', '#65c754', '#6ad539'],
  border: ['#e6e4e1', '#cccccc', '#bbbbbb', '#dddddd', '#d8d8d8', '#999999', '#7f7f7f',
           '#141414', '#000000', '#ffffff', '#f5f3f0', '#366eb7', '#368727', '#c31212']
};

let fails = 0, checks = 0;
const report = (ok, line) => { checks++; if (!ok) fails++; console.log((ok ? '  ok   ' : '  FAIL ') + line); };

console.log('\nbackgrounds: dark surface, or a deliberate accent');
for (const c of CASES.bg) {
  const m = R.mapColor(c, 'bg', null), L = lum(m);
  const ok = L < 0.06 || ACCENTS.has(m.toLowerCase());
  report(ok, `${c} -> ${m}  luminance ${L.toFixed(3)}${ACCENTS.has(m.toLowerCase()) ? '  (accent)' : ''}`);
}

console.log('\nforegrounds: WCAG AA on the card surface (>= 4.5:1)');
for (const c of CASES.fg) {
  const m = R.mapColor(c, 'fg', null), cr = crOn(m, P.surf1);
  report(cr >= 4.5, `${c} -> ${m}  ${cr.toFixed(2)}:1`);
}

/* Six grades, by what a border maps to: accent, control (borderCtl, 3:1 under
   WCAG 1.4.11), divider (borderStr), outline (text2: a black line stays the
   strongest), invisible (white) and hairline, which stays recessive. */
console.log('\nborders: hairlines recessive (1.2 to 2.5:1), dividers and outlines >= 2.5:1, controls >= 3:1, accents vivid');
for (const c of CASES.border) {
  const m = R.mapColor(c, 'border', null), cr = crOn(m, P.surf1);
  const low = m.toLowerCase();
  const grade = chromatic(m) ? 'accent'
    : low === P.borderCtl.toLowerCase() ? 'control'
    : low === P.borderStr.toLowerCase() ? 'divider'
    : low === P.text2.toLowerCase() ? 'outline'
    /* invisible on white, so invisible on the card (the Documents side nav
       spaces its items with a 1.5rem white border) */
    : c === '#ffffff' ? 'invisible' : 'hairline';
  const ok = grade === 'accent' ? cr >= 3
    : grade === 'control' ? cr >= 3
    : grade === 'divider' || grade === 'outline' ? cr >= 2.5
    : grade === 'invisible' ? cr <= 1.05
    : (cr >= 1.2 && cr <= 2.5);
  report(ok, `${c} -> ${m}  ${cr.toFixed(2)}:1  ${grade}`);
}

/* A pair may end up more separated than in light mode (pale plates behind
   cells) only up to a cap: 1.10:1 for a card and a tint in it, 1.30:1 for the
   rest, as Fidelity's dark page sits under its card at 1.27:1 (light 1.07). */
console.log('\nsurface band: near-whites stay imperceptibly apart (<= 1.10:1); page-under-card follows Fidelity (<= 1.30:1)');
{
  const pairs = [['#ffffff', '#f9f7f5', 1.30], ['#ffffff', '#f5f3f0', 1.10], ['#f9f7f5', '#f5f3f0', 1.30], ['#ffffff', '#e6e4e1', 1.30]];
  for (const [a, b, cap] of pairs) {
    const prod = crOn(a, b);
    const dark = crOn(R.mapColor(a, 'bg', null), R.mapColor(b, 'bg', null));
    const ok = dark <= Math.max(prod, cap) + 0.005;
    report(ok, `${a} vs ${b}: production ${prod.toFixed(3)}:1, dark ${dark.toFixed(3)}:1 (cap ${cap})`);
  }
}

/* receding is invisible on white but reads as a hole on a dark card */
console.log('\nsurface band: an in-card tint never becomes a hole');
{
  const cardLum = lum(P.surf1);
  for (const c of ['#f5f3f0', '#f5f5f5', '#f2f2f2', '#eeeeee', '#ededed', '#e6e4e1', '#d9d8d5']) {
    const m = R.mapColor(c, 'bg', null);
    const ok = lum(m) >= cardLum - 0.0005;
    report(ok, `${c} -> ${m}  ${lum(m) >= cardLum ? 'at or above' : 'BELOW'} the card`);
  }
}

console.log('\nsemantics: a gain and a loss never collapse into the same hue');
{
  const g = R.mapColor('#0d6f3f', 'fg', null), l = R.mapColor('#b41212', 'fg', null);
  const brand = R.mapColor('#368727', 'fg', null);
  report(g !== l, `gain ${g} distinct from loss ${l}`);
  /* the app's CTA and gain figures share one green; the gain fill is deeper */
  report(g.toLowerCase() === P.gain.toLowerCase() && brand.toLowerCase() === P.btn.toLowerCase(),
    `gain ${g} is the app's gain green; brand green as text ${brand} is the app's CTA green`);
  report(P.gainFill.toLowerCase() !== P.gain.toLowerCase() && lum(P.gainFill) < lum(P.gain),
    `the large-area gain fill ${P.gainFill} is a deeper step than the figure ${P.gain}`);
}

console.log('\ngrid: figures read on the low container and on the traded-today wash');
{
  for (const [name, ink] of [['gain', P.gain], ['loss', P.loss], ['text', P.text], ['text-2', P.text2], ['text-3', P.text3], ['link', P.link]]) {
    for (const [sname, surf] of [['recess', P.recess], ['row mark', P.rowMark], ['grid header', P.gridHead]]) {
      const cr = crOn(ink, surf);
      report(cr >= 4.5, `${name} ${ink} on ${sname} ${surf}: ${cr.toFixed(2)}:1`);
    }
  }
  report(lum(P.rowMark) < lum(P.surf1) && lum(P.rowMark) >= lum(P.canvas) - 0.001,
    `the row mark ${P.rowMark} sits between the page and the card (a tint, not a plate)`);
  report(crOn(P.border, P.recess) >= 1.5 && crOn(P.border, P.recess) <= 2.5,
    `row lines ${P.border} on the recess: ${crOn(P.border, P.recess).toFixed(2)}:1 (light mode's #ccc on white is 1.61:1)`);
}

console.log('\nshadows: deepened, never lightened');
for (const c of ['rgba(0, 0, 0, 0.15)', 'rgba(0,0,0,.1)', 'rgba(84, 84, 84, 0.5)']) {
  const m = R.mapColor(c, 'shadow', null);
  report(/^rgba\(0, 0, 0,/.test(m), `${c} -> ${m}`);
}

/* A token name is a path, and its rightmost role word says what the value is
   for: --color-surface-foreground is ink, not a surface. */
console.log('\ntokens: the rightmost role word governs');
for (const [name, want] of [
  ['--color-surface-foreground', 'fg-token'],
  ['--pvd-color-text-on-surface', 'fg-token'],
  ['--fds-card-text-color', 'fg-token'],
  ['--icon-fill-color', 'fg-token'],
  ['--fds-card-background-color', 'bg-token'],
  ['--ag-header-background-color', 'bg-token'],
  ['--color-surface-background-bright', 'bg-token'],
  ['--color-surface-line', 'border'],
  ['--card-box-shadow-color', 'shadow'],
  ['--brand-primary', 'token'],
  /* In a token name a `fill` is a surface (the Trade ticket paints its fields
     from --form-field-fill-*), unless it is a fill of ink. */
  ['--form-field-fill-default', 'bg-token'],
  ['--form-field-fill-filled', 'bg-token'],
  ['--component-color-alert-critical-fill', 'bg-token'],
  ['--button-fill-hover', 'bg-token'],
  ['--fa-icon-fill', 'fg-token'],
  ['--color-text-fill', 'fg-token'],
  ['--glyph-fill', 'fg-token']
]) {
  const got = R.tokenRole(name);
  report(got === want, `${name} -> ${got}`);
}

/* A filled control is a light fill with dark ink (accent-primary-foreground
   goes #ffffff -> #141414), so the fill ink has to read on every fill, and the
   fill has to stand off the card. */
console.log('\nbrand green: a fill carries the palette\'s fill ink');
{
  const ink = R.parseColor(P.btnInk);
  const card = R.parseColor(P.surf1);
  for (const src of ['#368727', '#1e6f1d', '#044014']) {
    const fill = R.mapColor(src, 'bg', null);
    const onFill = R.contrast(ink, R.parseColor(fill));
    report(onFill >= 4.5,
      `${src} as a fill -> ${fill}, ${P.btnInk} label reads at ${onFill.toFixed(2)}:1 (light mode: 4.51:1)`);
    const edge = R.contrast(R.parseColor(fill), card);
    report(edge >= 3, `  and the fill itself reads on the card at ${edge.toFixed(2)}:1`);
  }
  for (const src of ['#368727', '#1e6f1d']) {
    const txt = R.mapColor(src, 'fg', null);
    const onCard = R.contrast(R.parseColor(txt), card);
    report(onCard >= 4.5, `${src} as text -> ${txt}, reads on the card at ${onCard.toFixed(2)}:1`);
  }
  report(R.contrast(ink, R.parseColor(P.btnHov)) >= 4.5,
    `the hover fill (${P.btnHov}) keeps the same ink readable at ${R.contrast(ink, R.parseColor(P.btnHov)).toFixed(2)}:1`);
}

console.log('\nthe Feedback survey: its greens and its link are the theme\'s');
{
  const WANT = [['#6f9824', 'bg', P.btn, 'Submit and a chosen answer'], ['#60831f', 'bg', P.btnHov, 'Submit, hovered'],
                ['#425a15', 'bg', P.btnAct, 'Submit, pressed'], ['#8dc12e', 'bg', P.btnHov, 'a focused answer'],
                ['#6f9824', 'border', P.btn, 'a focused field'], ['#4b86ee', 'fg', P.link, 'a link']];
  for (const [src, role, exp, what] of WANT) {
    const got = R.mapColor(src, role, null);
    report(String(got).toLowerCase() === exp.toLowerCase(), `${what}: ${src} as ${role} -> ${got} (${exp})`);
  }
  const fill = R.mapColor('#6f9824', 'bg', null);
  const label = R.mapColor('#ffffff', 'fg', { rgb: R.parseColor(fill) });
  const cr = crOn(label, fill);
  report(cr >= 4.5, `and Submit's white label becomes ${label} on ${fill}, ${cr.toFixed(2)}:1`);
}

/* color-scheme: dark makes the browser take the SECOND branch of every
   light-dark(). Mapping both and letting it choose darkens the value twice. */
console.log('\nlight-dark(): collapsed to the light branch before mapping');
for (const [input, want] of [
  ['light-dark(#1D252C, #FFFFFF)', '#1D252C'],
  ['1px solid light-dark(rgba(0,0,0,.2), #fff)', '1px solid rgba(0,0,0,.2)'],
  ['#ABCDEF', '#ABCDEF']
]) {
  const got = R.collapseLightDark(input);
  report(got.replace(/\s+/g, '') === want.replace(/\s+/g, ''), `${input} -> ${got}`);
}
{
  /* the card's ink token, collapsed, has to map as ink rather than a surface */
  const ink = R.mapColor(R.collapseLightDark('light-dark(#1D252C, #FFFFFF)'), 'fg', null);
  report(crOn(ink, P.surf1) >= 4.5, `card ink lands as readable ink: ${ink} at ${crOn(ink, P.surf1).toFixed(2)}:1 on the card`);
}

/* A colour word in a custom property's NAME is not a colour: rewriting
   var(--color-white) makes an invalid reference, and the browser drops the
   whole declaration. */
console.log('\ncustom properties: a color word in a NAME is left alone');
for (const [input, want] of [
  ['var(--color-white)', null],
  ['var(--color-black)', null],
  ['var(--brand-navy)', null],
  ['1px solid var(--color-silver)', null],
  ['var(--color-gray-100, #ffffff)', 'var(--color-gray-100, ' + P.surf1 + ')'],
  ['var(--x, white)', 'var(--x, ' + P.text + ')']
]) {
  const role = /solid/.test(input) ? 'border' : /white\)$/.test(input) ? 'fg' : 'token';
  const got = R.rewriteValue(input, role, null);
  const ok = want === null ? got === null : got === want;
  report(ok, `${input} -> ${got === null ? '(left alone)' : got}`);
}
report(!/var\(--[a-z-]*#/.test(R.rewriteValue('var(--color-white)', 'bg', null) || ''),
  'no rewrite can ever produce var(--something-#hex)');

/* A chart mark is a datum: its hue is the payload, and only lightness and
   chroma may move. Every mark clears 3:1 (WCAG 1.4.11) on surf1, surf2 and
   the page. */
console.log('\nchart marks: categorical hues stay separable and legible');
{
  const SURFACES = [P.surf1, P.surf2, P.canvas];
  const CATS = ['#143960', '#1DADE2', '#568200', '#FFCD00', '#D24823', '#9D66C1'];
  const mapped = CATS.map(c => R.mapCategorical(c));
  for (let i = 0; i < CATS.length; i++) {
    const worst = Math.min(...SURFACES.map(s => crOn(mapped[i], s)));
    report(worst >= 3, `${CATS[i]} -> ${mapped[i]}  worst surface ${worst.toFixed(2)}:1`);
  }
  const uniq = new Set(mapped.map(m => m.toLowerCase()));
  report(uniq.size === CATS.length, `six categories stay six colors (${uniq.size} distinct)`);
  report(R.mapCategorical('#368727') === P.gainFill, `gain columns take the gain fill (${R.mapCategorical('#368727')})`);
  report(R.mapCategorical('#dc1616') === P.lossFill, `loss columns take the loss fill (${R.mapCategorical('#dc1616')})`);
}

console.log('\nimportance: what Fidelity marked !important is copied one id stronger');
{
  const B = R.boostSelector;
  report(B('.performance-loss') === ':is(.performance-loss):not(#\\9)', `a class selector gains one id (${B('.performance-loss')})`);
  report(B('.x::before') === ':is(.x):not(#\\9)::before' && B('.x:after') === ':is(.x):not(#\\9):after',
    'a pseudo-element stays outside the :is(), in either syntax');
  report(B('.a .b, .c > .d') === ':is(.a .b):not(#\\9), :is(.c > .d):not(#\\9)', 'each selector in a list is boosted on its own');
  report(B(':host(.x) .y') === null && B('::slotted(span)') === null, 'a shadow-root selector is left alone');
}

console.log('\ngate: every emitted copy is shut off by the fdm-off class, at no cost in specificity');
{
  const G = R.gateSelector;
  const W = ':where(html:not(.fdm-off))';
  report(G('.a .b') === W + ' .a .b', `a selector is prefixed with the zero-specificity gate (${G('.a .b')})`);
  report(G('.a .b, .c > .d') === W + ' .a .b, ' + W + ' .c > .d', 'each selector in a list on its own');
  report(G('html') === 'html:where(:not(.fdm-off))' && G(':root') === ':root:where(:not(.fdm-off))',
    `the root carries the test itself, having no ancestor for the prefix (${G('html')}, ${G(':root')})`);
  report(G('html.no-js .nav') === 'html:where(:not(.fdm-off)).no-js .nav' && G(':root[dir="rtl"] > body') === ':root:where(:not(.fdm-off))[dir="rtl"] > body',
    `so does a root named higher up a selector (${G('html.no-js .nav')})`);
  report(G('body') === W + ' body' && G('.x:not(html) .y') === W + ' .x:not(html) .y' && G(':is(html, body) .z') === W + ' :is(html, body) .z',
    'a root inside :not() or :is() is not the compound the test goes on');
  report(G('.x::before') === W + ' .x::before' && G(':is(.a .b):not(#\\9)') === W + ' :is(.a .b):not(#\\9)',
    'pseudo-elements and boosted copies take the prefix like any other');
  report(G('.htmlish .rooted') === W + ' .htmlish .rooted', 'a class merely spelt like the root is not the root');
}

/* Icon filters: a chain of CSS filter functions that turns a black glyph into
   one colour, worked through here as the browser does (sRGB, each step
   clamped), has to land on the ink it is named for. */
console.log('\nicon filters: each --fdm-f-* chain lands on the ink it is named for');
{
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const mul = (m, c) => [0, 1, 2].map(i => clamp01(m[i * 3] * c[0] + m[i * 3 + 1] * c[1] + m[i * 3 + 2] * c[2]));
  const FN = {
    brightness: (c, a) => c.map(v => clamp01(v * a)),
    contrast: (c, a) => c.map(v => clamp01((v - 0.5) * a + 0.5)),
    invert: (c, a) => c.map(v => clamp01(a + v * (1 - 2 * a))),
    sepia: (c, a) => mul([0.393 + 0.607 * (1 - a), 0.769 - 0.769 * (1 - a), 0.189 - 0.189 * (1 - a),
                         0.349 - 0.349 * (1 - a), 0.686 + 0.314 * (1 - a), 0.168 - 0.168 * (1 - a),
                         0.272 - 0.272 * (1 - a), 0.534 - 0.534 * (1 - a), 0.131 + 0.869 * (1 - a)], c),
    saturate: (c, s) => mul([0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
                            0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
                            0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s], c),
    'hue-rotate': (c, deg) => {
      const r = deg * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
      return mul([0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
                  0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283,
                  0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072], c);
    }
  };
  const run = chain => {
    let c = [0, 0, 0];
    for (const [, fn, num, unit] of chain.matchAll(/([a-z-]+)\(\s*([-\d.]+)(%|deg)?\s*\)/g)) {
      const v = unit === '%' ? parseFloat(num) / 100 : parseFloat(num);
      if (FN[fn]) c = FN[fn](c, v);
    }
    return c.map(v => Math.round(v * 255));
  };
  const base = fs.readFileSync(path.join(__dirname, '..', 'src', 'theme', '00-base.css'), 'utf8');
  const want = { 'text-2': P.text2, 'text-3': P.text3, gain: P.gain, loss: P.loss };
  let n = 0;
  for (const [, name, chain] of base.matchAll(/--fdm-f-([a-z0-9-]+):\s*([^;]+);/g)) {
    n++;
    const target = R.parseColor(want[name] || '');
    const got = run(chain);
    const off = target ? Math.max(Math.abs(got[0] - target.r), Math.abs(got[1] - target.g), Math.abs(got[2] - target.b)) : 999;
    report(!!target && off <= 8 && /^brightness\(0\) saturate\(100%\)/.test(chain),
      `--fdm-f-${name} starts from black and lands within ${off} of ${want[name] || '?'} (#${got.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()})`);
  }
  report(n === 4, `${n} chains, one per ink the ACE chart's icons take`);
}

/* Blues told apart only by lightness (the retirement projection's three
   outcomes) map as one family: spacing kept, order flipped, as a scale's is. */
console.log('\nchart marks: series that differ only in lightness stay apart');
{
  const FAM = ['#3880f3', '#2751c2', '#2a3965'];
  const plain = FAM.map(c => R.mapCategorical(c));
  report(R.registerFamilies(FAM) === true, 'three blues on one chart are registered as one family');
  const out = FAM.map(c => R.mapCategorical(c));
  report(lum(out[0]) < lum(out[1]) && lum(out[1]) < lum(out[2]), `the deepest on white is the lightest on the card (${out.join(' < ')})`);
  const steps = [crOn(out[0], out[1]), crOn(out[1], out[2])];
  const plainSteps = [crOn(plain[0], plain[1]), crOn(plain[1], plain[2])];
  report(Math.min(...steps) >= 1.4, `neighbours stand apart (${steps.map(s => s.toFixed(2)).join(', ')}:1, where one at a time gave ${plainSteps.map(s => s.toFixed(2)).join(', ')}:1)`);
  report(out.every(o => crOn(o, P.surf1) >= 3), `every member reads on the card (${out.map(o => crOn(o, P.surf1).toFixed(2)).join(', ')}:1)`);
  report(R.registerFamilies(FAM) === false, 'asking again changes nothing');

  const mixed = ['#7b1fa2', '#00897b', '#f57c00'];
  const alone = mixed.map(c => R.mapCategorical(c));
  report(R.registerFamilies(mixed) === false && mixed.map(c => R.mapCategorical(c)).join() === alone.join(),
    'three hues are three categories: no family, and nothing moves');
  report(R.registerFamilies(['#368727', '#1e6f1d']) === false && R.mapCategorical('#1e6f1d') === P.gainFill,
    'colours tuned by hand are never re-stepped');
  const wrap = ['#880e4f', '#e91e63'];
  report(R.registerFamilies(wrap) === true && lum(R.mapCategorical('#880e4f')) > lum(R.mapCategorical('#e91e63')),
    `a family can straddle red's 0 degrees (${wrap.map(c => R.mapCategorical(c)).join(', ')})`);
}

/* Fidelity's ramp runs white to deep blue; on the dark field it runs the other
   way and has to stay ordered. */
console.log('\nchart marks: a sequential axis stays a scale');
{
  const RAMP = ['#FFFFFF', '#E8EEFC', '#D2DEF9', '#A7C0F5', '#7A9DF0', '#4A6FD0', '#113DA1', '#0A2570'];
  const out = RAMP.map(c => R.mapSequential(c));
  let mono = true;
  for (let i = 1; i < out.length; i++) if (lum(out[i]) < lum(out[i - 1]) - 1e-9) mono = false;
  report(mono, `${RAMP.length} stops stay ordered by luminance`);
  report(out[0] === P.surf1, `the empty end disappears into the card (${out[0]})`);
  const worstLabel = Math.min(...out.map(c => crOn(P.text, c)));
  report(worstLabel >= 4.5, `printed cell values clear AA on every step (worst ${worstLabel.toFixed(2)}:1)`);
}

/* Pseudo-element artwork is unreachable from JavaScript, so the sort arrows are
   re-drawn as literals in 03-components.css. Nothing keeps those literals in
   step with the palette except this. */
console.log('\nsort arrows: the inlined artwork tracks the palette');
{
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'theme', '03-components.css'), 'utf8');
  const block = sel => {
    const i = css.indexOf(sel);
    return i === -1 ? '' : css.slice(i, css.indexOf('}', i));
  };
  const enc = hex => '%23' + hex.replace('#', '');
  for (const [sel, want, label] of [
    ['.ag-icon-asc::before', P.text2, 'ascending'],
    ['.ag-icon-desc::before', P.text2, 'descending'],
    ['.ag-icon-none::before', P.textDis, 'unsorted']
  ]) {
    const b = block(sel);
    report(b.toUpperCase().includes(enc(want).toUpperCase()), `${label} arrow drawn in ${want}`);
  }
}

/* see the navy note in palette.js (EXACT.bg) */
console.log('\nnavy plates: white ink stays readable on the dark-mode answer');
for (const c of ['#024a7a', '#013b61', '#1d3986', '#132454']) {
  const m = R.mapColor(c, 'bg', null), cr = crOn('#FFFFFF', m);
  report(cr >= 4.5, `${c} -> ${m}  white reads at ${cr.toFixed(2)}:1`);
}

/* An ideogram (a pale disc under a deep-green line drawing) swaps its two
   colours in dark mode, as Fidelity's media-ideogram tokens say. */
console.log('\nideograms: the disc and the drawing swap, as Fidelity\'s tokens say');
{
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><circle cx="36" cy="36" r="36" fill="#D4F3CF"/><path d="M20 30h32v20H20z" fill="none" stroke="#044014" stroke-width="2"/></svg>';
  const out = R.rewriteSvgText(svg, P.text2) || '';
  report(/fill="#044014"/i.test(out), 'the pale disc becomes the deep green (#044014)');
  report(/stroke="#d4f3cf"/i.test(out), 'and the deep-green drawing becomes the pale green (#d4f3cf)');
  report(!/#757473/i.test(out), 'and nothing in it was greyed by the pale-tint heuristic');
}

/* SVG's initial fill is black, so shapes with no fill attribute need a default
   ink, not just edits to the attributes present. */
console.log('\nicons: a shape that says nothing still gets an answer');
{
  const bare = '<svg viewBox="0 0 24 24"><path d="M12 17.5l10-10H2l10 10z"/></svg>';
  const out = R.rewriteSvgText(bare, P.text2) || '';
  report(out.includes(':not([fill])') && out.includes(P.text2), 'an unfilled path is given the ink color');

  /* fill="none" on the root is inherited, so its bare shapes draw nothing */
  const rootNone = '<svg viewBox="0 0 24 24" fill="none"><path d="M1 1h2v2H1z"/></svg>';
  report(!(R.rewriteSvgText(rootNone, P.text2) || '').includes(':not([fill])'), 'fill="none" on the root is respected: its bare shapes stay unfilled');

  /* currentColor inside an image is the image root's colour: black. */
  const cur = '<svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2"/></svg>';
  report((R.rewriteSvgText(cur, P.text2) || '').includes('svg{color:' + P.text2 + '}'), 'a currentColor stroke resolves to ink, not to black');

  const plate = '<svg viewBox="0 0 100 20"><rect fill="white" width="100" height="20"/><path fill="#DBB000" d="M0 0h9v9H0z"/><path fill="#FFE166" d="M20 0h9v9H20z"/></svg>';
  const st = R.rewriteSvgText(plate, P.text2) || '';
  report(st.includes('<rect fill="none"'), 'a white plate drawn for a white page is removed');
  report(st.includes('#DBB000'), 'the filled star keeps its gold');
  report(st.includes(P.borderStr), 'the paler "empty" star is dimmed, not brightened');
}

console.log('\nwhite that is the artwork stays white; only a white BACKDROP is removed');
{
  /* the prospect header's Customer Support icon: a white path on a green bar */
  const glyph = '<svg width="40" height="40" viewBox="-8 -8 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.9 9.6a3 3 0 1 1 6 0" fill="white"/></svg>';
  const g = R.rewriteSvgText(glyph, P.text2) || glyph;
  report(/<path[^>]*fill="white"/.test(g), 'a white-only glyph keeps its white (the support icon)');

  /* The chat bubble: a green bubble, and white dots drawn ON it. */
  const bubble = '<svg viewBox="0 0 48 48"><path fill="#368727" d="M4 4h40v32H14l-10 8z"/><circle fill="#FFFFFF" cx="16" cy="20" r="3"/><circle fill="#FFFFFF" cx="24" cy="20" r="3"/><circle fill="#FFFFFF" cx="32" cy="20" r="3"/></svg>';
  const b = R.rewriteSvgText(bubble, P.text2) || bubble;
  report((b.match(/<circle[^>]*fill="#FFFFFF"/g) || []).length === 3, 'white dots drawn on a green bubble stay white (all three)');

  /* A white backdrop drawn FIRST, under a dark glyph that never says its
     colour, is still a plate. */
  const backdrop = '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="#fff"/><path d="M4 4h16v16H4z"/></svg>';
  const d = R.rewriteSvgText(backdrop, P.text2) || '';
  report(d.includes('<rect width="24" height="24" fill="none"'), 'a white backdrop under an unpainted (black) glyph is still removed');

  /* white inside a luminance mask means "show" */
  const masked = '<svg viewBox="0 0 24 24"><mask id="m" style="mask-type:luminance"><rect width="24" height="24" fill="white"/></mask><g mask="url(#m)"><path fill="#1D3986" d="M2 2h20v20H2z"/></g></svg>';
  const mk = R.rewriteSvgText(masked, P.text2) || masked;
  report(/<mask[^>]*>\s*<rect[^>]*fill="white"/.test(mk), 'a mask\'s white is geometry and is left alone');

  /* White set on the root or a group is a default for what sits inside it. */
  const rooted = '<svg viewBox="0 0 24 24" fill="white"><path d="M2 2h4v4H2z"/><path fill="#368727" d="M8 8h4v4H8z"/></svg>';
  const r2 = R.rewriteSvgText(rooted, P.text2) || rooted;
  report(/<svg[^>]*fill="white"/.test(r2), 'a white default on the root is not treated as a plate');
}

/* A white that is mostly there is a surface; a faint one is a highlight. */
console.log('\ntranslucent white - a panel stays a panel, a highlight stays a highlight');
{
  const panel = R.parseColor(R.mapColor('rgba(255, 255, 255, 0.9)', 'bg'));
  const card = R.parseColor(P.surf1);
  report(panel && Math.abs(panel.a - 0.9) < 0.01 && panel.r === card.r && panel.g === card.g, `a 90% white panel is the card colour at 90% (${R.mapColor('rgba(255, 255, 255, 0.9)', 'bg')})`);
  const inner = R.parseColor(R.mapColor('rgba(255, 255, 255, 0.5)', 'bg'));
  report(inner && inner.r === card.r && Math.abs(inner.a - 0.5) < 0.01, `  a 50% white layer on it is the same card colour, so it stays invisible (${R.mapColor('rgba(255, 255, 255, 0.5)', 'bg')})`);
  const hi = R.parseColor(R.mapColor('rgba(255, 255, 255, 0.2)', 'bg'));
  report(hi && hi.r === 255 && hi.a < 0.1, `  while a faint white highlight stays a gentle light veil (${R.mapColor('rgba(255, 255, 255, 0.2)', 'bg')})`);
}

/* Stand-ins for the transfer confirmation's artwork (test/art): marks drawn on coloured shapes. */
console.log('\ntransfer artwork - a mark keeps the contrast it had with what it sits on');
{
  const art = n => fs.readFileSync(path.join(__dirname, 'art', n), 'utf8');
  const defaultRule = out => (out.match(/<style>[^<]*<\/style>/) || [''])[0];

  /* the tracker's check: a white polyline inside <g fill="none"> */
  const tick = R.rewriteSvgText(art('submitted_icon.svg'), P.text2) || art('submitted_icon.svg');
  const rule = defaultRule(tick);
  report(!rule || rule.includes(':not([fill] *)'), 'the default fill never reaches a shape under a group that set fill="none"');
  report(/<polyline[^>]*stroke="#FFFFFF"/.test(tick), 'the tick stays a white stroke on the green disc');
  report(/fill="#568200"/i.test(tick), 'and the disc keeps its green (#568200)');

  /* Money sent: a black piggy outline beside gold coins with white rims. */
  const pig = R.rewriteSvgText(art('received_icon.svg'), P.text2) || '';
  report((pig.match(/fill="#FFCD00"/gi) || []).length === 5, 'the coins keep Fidelity yellow, not a dimmed grey (5 of 5)');
  /* the white rims are gaps between stacked coins: they take the card's colour */
  report((pig.match(new RegExp('stroke="' + P.surf1 + '"', 'gi')) || []).length === 5, `and their rims are the gaps between them, in the colour they sit on (5 of 5)`);
  report((pig.match(/stroke="#D9D8D5"/gi) || []).length === 3, 'the piggy outline is lifted to ink (3 of 3)');

  /* Sign up for alerts: dark dots IN a yellow bubble, a phone beside it. */
  const alerts = R.rewriteSvgText(art('next_alerts.svg'), P.text2) || '';
  report((alerts.match(/fill="#4C4C4C"/gi) || []).length === 3, 'the dots inside the yellow bubble stay dark (3 of 3)');
  report(/fill="#FFCD00"[^>]*stroke="#D9D8D5"/i.test(alerts), 'the bubble keeps its yellow and its outline is lifted');
  report((alerts.match(/stroke="#D9D8D5"/gi) || []).length === 6, 'every outline stroke is lifted to ink (6 of 6)');

  /* Transfer additional money: a dark "$" ON a green coin. */
  const coin = R.rewriteSvgText(art('next_transfer.svg'), P.text2) || '';
  report(/id="dollar" stroke="#000000"/.test(coin), 'the dollar sign on the coin stays dark');
  report(/id="dollar-bottom" stroke="#000000"/.test(coin) && /id="dollar-top" stroke="#000000"/.test(coin), 'and so do its two serifs');
  report(/id="window" stroke="#D9D8D5"/.test(coin), 'the browser window outline is lifted to ink');
  report((coin.match(/id="window-dot-[123]" fill="#D9D8D5"/g) || []).length === 3, 'and so are the window\'s three dots, which sit on the page');
  report(/fill="#95C740"/.test(coin), 'the coin keeps its green');

  /* Manage scheduled transfers: a yellow pencil with dark lines on it. */
  const pencil = R.rewriteSvgText(art('next_manage.svg'), P.text2) || '';
  report(/id="pencil-band" stroke="#000000"/.test(pencil) && /id="pencil-tip" stroke="#000000"/.test(pencil), 'the lines drawn on the pencil stay dark');
  report(/id="window" stroke="#D9D8D5"/.test(pencil) && /id="window-bar" stroke="#D9D8D5"/.test(pencil), 'the window around it is lifted to ink');

  /* The reverse case: a white glyph on a black disc. The disc lifts to ink,
     so the glyph has to drop to the dark it is drawn against. */
  const info = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#000"/><rect x="11" y="10" width="2" height="8" fill="#fff"/></svg>';
  const io = R.rewriteSvgText(info, P.text2) || '';
  report(/<circle[^>]*fill="#D9D8D5"/.test(io) && new RegExp('<rect[^>]*fill="' + P.canvas + '"', 'i').test(io), 'a white glyph on a black disc becomes a dark glyph on a light one');
}

/* A thin dark keyline round a coloured shape (the quote page's extended-hours
   moon) takes the shape's colour; lifted to ink it would draw a light halo. */
console.log('\nkeylines round coloured shapes');
{
  const moon = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 21 21' fill='none'><path fill='purple' stroke='#000' stroke-width='.5' d='M10 1C5 3 2 8 4 13c2 5 8 6 13 4-8 0-12-10-7-16'/></svg>";
  const out = R.rewriteSvgText(moon, P.text2, P.canvas) || '';
  const fill = (/<path[^>]*\sfill='([^']+)'/.exec(out) || [])[1] || '';
  const stroke = (/<path[^>]*\sstroke='([^']+)'/.exec(out) || [])[1] || '';
  report(fill && fill.toLowerCase() === stroke.toLowerCase() && fill.toLowerCase() !== 'purple',
    `the moon's keyline takes its lifted fill (${stroke} on ${fill})`);
  const line = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'><circle cx='12' cy='12' r='9' fill='#d9d8d5' stroke='#000' stroke-width='.5'/></svg>";
  const lo = R.rewriteSvgText(line, P.text2, P.canvas) || '';
  report(new RegExp("stroke='" + P.text2 + "'", 'i').test(lo), `  while an outline round a grey shape is still ink`);
}

console.log('\ncolours given by name are mapped like any other');
{
  const v = R.rewriteValue('2px solid green', 'border', null) || '';
  report(new RegExp(P.green, 'i').test(v), `a keyword green underline takes the app's green (${v})`);
  report(R.rewriteValue('var(--tan-light, red)', 'fg', null) === 'var(--tan-light, ' + P.loss + ')',
    `  a name inside a fallback is mapped, the property name is not`);
  report(R.rewriteValue('tan(45deg)', 'token', null) === null, `  and tan() is a function, not a colour`);
  const b64 = 'url("data:image/png;base64,iVBORw0KGgo/red+AAAA")';
  report(R.rewriteValue(b64 + ', white', 'bg', null) === b64 + ', ' + P.surf1,
    `  a base64 picture that happens to spell "red" is left whole`);
}

console.log('\ncanvas charts: marks, ink and plates');
{
  const fill = R.canvasColor('#053161', 'fill');
  report(fill.toLowerCase() === R.mapCategorical('#053161').toLowerCase(), `a series fill is a chart mark, as its HTML key is (${fill})`);
  const label = R.canvasColor('#666666', 'text');
  report(label.toLowerCase() === R.mapColor('#666666', 'fg', null).toLowerCase(), `a label is ink (${label})`);
  const grid = R.canvasColor('rgba(0, 0, 0, 0.1)', 'stroke');
  report(grid === 'rgba(255, 255, 255, 0.1)', `a faint black gridline is a faint light one (${grid})`);
  const plate = R.parseColor(R.canvasColor('rgba(0, 0, 0, 0.8)', 'fill'));
  report(plate && Math.max(plate.r, plate.g, plate.b) < 40 && Math.abs(plate.a - 0.8) < 0.01,
    `a tooltip's see-through black plate stays a dark plate (${R.canvasColor('rgba(0, 0, 0, 0.8)', 'fill')})`);
  report(R.canvasColor('#ffffff', 'text').toLowerCase() === P.text.toLowerCase(), `  and its white text stays white`);
  report(R.canvasColor('transparent', 'fill') === null, `nothing is asked of a clear colour`);
}

/* The stylesheets and the popup repeat the palette as CSS variables. A colour
   changed in palette.js and not in the CSS, or the other way round, fails here. */
console.log('\nthe CSS variables match palette.js');
{
  const ROOT = path.join(__dirname, '..');
  const camel = s => s.replace(/-([a-z0-9])/g, (_, c) => (/\d/.test(c) ? c : c.toUpperCase()));
  const paletteValue = name => {
    if (name.startsWith('c-')) return P.chart[name === 'c-short' ? 'shortTerm' : name.slice(2)];
    return P[camel(name)];
  };
  const defs = new Map();
  const sources = [
    ...fs.readdirSync(path.join(ROOT, 'src', 'theme')).map(f => path.join('src', 'theme', f)),
    'src/content.js', 'popup/popup.css'
  ];
  let compared = 0, mismatched = [];
  for (const file of sources) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const prefix = file.startsWith('popup') ? '--' : '--fdm-';
    const re = new RegExp(prefix.replace(/-/g, '\\-') + '([a-z][a-z0-9-]*)\\s*:\\s*(#[0-9a-f]{6})\\b', 'gi');
    for (const [, name, value] of text.matchAll(re)) {
      if (file.startsWith('popup') && name.startsWith('fdm-')) continue;
      const want = paletteValue(name);
      if (!want) continue;
      compared++;
      defs.set(name, value);
      if (want.toLowerCase() !== value.toLowerCase()) mismatched.push(`${file}: --${prefix === '--' ? '' : 'fdm-'}${name} is ${value}, palette.js says ${want}`);
    }
    /* and a fallback written beside a variable has to be the variable's own value */
    for (const [, name, value] of text.matchAll(/var\(--fdm-([a-z0-9-]+),\s*(#[0-9a-f]{6})\)/gi)) {
      const want = paletteValue(name);
      if (!want) continue;
      compared++;
      if (want.toLowerCase() !== value.toLowerCase()) mismatched.push(`${file}: var(--fdm-${name}, ${value}) falls back to something other than ${want}`);
    }
  }
  report(compared > 50 && mismatched.length === 0,
    `${compared} CSS colour values agree with palette.js` + (mismatched.length ? ': ' + mismatched.join('; ') : ''));
}

/* The worker fetches only from the hosts the manifest grants. Its host check
   is copied in recolor.js (which has no access to the worker's), and the two
   have to agree with each other and with host_permissions. */
console.log('\nhosts: the two copies of isFidelityUrl agree with each other and with the manifest');
{
  const ROOT = path.join(__dirname, '..');
  const regexIn = file => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const m = /function isFidelityUrl[\s\S]*?\/(\(\^\|[^\n]*?)\/\.test\(x\.hostname\)/.exec(src);
    return m ? new RegExp(m[1]) : null;
  };
  const worker = regexIn('src/background.js'), engine = regexIn('src/recolor.js');
  report(!!worker && !!engine && worker.source === engine.source,
    `background.js and recolor.js test the same hosts (${worker && worker.source})`);
  /* a manifest pattern https://*.host/* admits host and its subdomains */
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const granted = manifest.host_permissions.map(p => /^https:\/\/(\*\.)?([^/]+)\/\*$/.exec(p)).filter(Boolean);
  const fetchable = h => !!worker && worker.test(h);
  const allowedByManifest = h => granted.some(([, star, host]) => h === host || (star && h.endsWith('.' + host)));
  const SAMPLE = ['fidelity.com', 'www.fidelity.com', 'digital.fidelity.com', 'fundresearch.fidelity.com',
    'fidelityrewards.com', 'login.fidelityrewards.com', 'fidelity.wallst.com', 'research2relay.fidelity.wallst.com',
    'fmrpi.az1.qualtrics.com', 'notfidelity.com', 'fidelity.com.evil.example', 'wallst.com', 'evilfidelity.wallst.com.example',
    'xfidelity.com', 'fidelityrewards.com.example'];
  const outside = SAMPLE.filter(h => fetchable(h) && !allowedByManifest(h));
  report(outside.length === 0, `every host the worker will fetch from is one the manifest grants` + (outside.length ? ` (not: ${outside.join(', ')})` : ''));
  const expected = { 'fidelity.com': true, 'www.fidelity.com': true, 'digital.fidelity.com': true, 'fundresearch.fidelity.com': true,
    'fidelityrewards.com': true, 'login.fidelityrewards.com': true, 'fidelity.wallst.com': true, 'research2relay.fidelity.wallst.com': true,
    'fmrpi.az1.qualtrics.com': false, 'notfidelity.com': false, 'fidelity.com.evil.example': false, 'wallst.com': false,
    'evilfidelity.wallst.com.example': false, 'xfidelity.com': false, 'fidelityrewards.com.example': false };
  const wrong = Object.entries(expected).filter(([h, want]) => fetchable(h) !== want).map(([h]) => h);
  report(wrong.length === 0, `the check admits Fidelity's hosts and their research provider, and nothing that merely contains the name` + (wrong.length ? ` (wrong: ${wrong.join(', ')})` : ''));
  /* the survey host is a content-script match, not a fetch source */
  report(!fetchable('fmrpi.az1.qualtrics.com'), `the Feedback survey host is themed but never fetched from`);
}

/* The worker itself, run against a stand-in chrome and fetch: who may ask,
   what it will fetch, what it hands back, and the off gate. */
console.log('\nthe worker: answers its own content scripts, fetches Fidelity hosts only, and keeps to its caps');
async function workerChecks() {
  const ROOT = path.join(__dirname, '..');
  const listeners = [];
  const log = [];
  const registered = [];
  let unregisters = 0;
  let onStorage = null;
  const stubChrome = {
    runtime: { id: 'fdm-test', onMessage: { addListener: fn => listeners.push(fn) } },
    storage: {
      onChanged: { addListener: fn => { onStorage = fn; } },
      sync: { get: (d, cb) => cb({ enabled: true }) }
    },
    scripting: {
      getRegisteredContentScripts: async () => registered.slice(),
      unregisterContentScripts: async () => { unregisters++; registered.length = 0; },
      registerContentScripts: async list => {
        if (registered.some(r => list.some(l => l.id === r.id))) throw new Error('Duplicate script ID');
        registered.push(...list);
      }
    }
  };
  /* a fake network: `landed` is where a request ended up after redirects */
  const responses = new Map();
  const headers = h => ({ get: k => (h[k.toLowerCase()] === undefined ? null : h[k.toLowerCase()]) });
  const stubFetch = async (url, opts) => {
    log.push({ url, opts });
    const r = responses.get(url);
    if (!r) throw new Error('no route');
    return {
      ok: r.status === undefined || r.status < 400, url: r.landed || url,
      headers: headers(r.headers || {}),
      text: async () => r.body || '',
      arrayBuffer: async () => Uint8Array.from(Buffer.from(r.body || '', 'binary')).buffer
    };
  };
  const script = fs.readFileSync(path.join(ROOT, 'src', 'background.js'), 'utf8');
  new Function('chrome', 'fetch', 'self', script)(stubChrome, stubFetch, global);
  const ask = (msg, sender) => new Promise(resolve => {
    let async = false;
    for (const fn of listeners) {
      const r = fn(msg, sender, resolve);
      if (r === true) async = true;
    }
    if (!async) resolve('(no answer)');
  });
  const settle = () => new Promise(r => setTimeout(r, 20));
  const me = { id: 'fdm-test', tab: { id: 1 } };

  responses.set('https://digital.fidelity.com/a.css', { headers: { 'content-type': 'text/css' }, body: 'a{color:#141414}' });
  responses.set('https://digital.fidelity.com/plain', { headers: { 'content-type': 'text/css' }, body: 'b{color:#000}' });
  responses.set('https://digital.fidelity.com/leaves.css', { headers: { 'content-type': 'text/css' }, body: 'c{}', landed: 'https://cdn.example.net/leaves.css' });
  responses.set('https://digital.fidelity.com/not.css', { headers: { 'content-type': 'text/html' }, body: '<html>' });
  responses.set('https://digital.fidelity.com/big.css', { headers: { 'content-type': 'text/css' }, body: 'x'.repeat(3000001) });
  responses.set('https://evil.example/a.css', { headers: { 'content-type': 'text/css' }, body: 'z{}' });

  const other = await ask({ type: 'fdm:fetchCss', urls: ['https://digital.fidelity.com/a.css'] }, { id: 'someone-else', tab: { id: 1 } });
  report(other === '(no answer)' && log.length === 0, 'a message from another extension is not answered and fetches nothing');
  const popup = await ask({ type: 'fdm:fetchCss', urls: ['https://digital.fidelity.com/a.css'] }, { id: 'fdm-test' });
  report(popup === '(no answer)' && log.length === 0, '  nor is one from outside a tab');

  const css = await ask({ type: 'fdm:fetchCss', urls: [
    'https://digital.fidelity.com/a.css', 'https://digital.fidelity.com/plain', 'https://digital.fidelity.com/leaves.css',
    'https://digital.fidelity.com/not.css', 'https://digital.fidelity.com/big.css', 'https://evil.example/a.css',
    'http://digital.fidelity.com/a.css', 42
  ] }, me);
  const got = css.sheets.map(s => s.url.split('/').pop()).sort();
  report(got.join(',') === 'a.css,plain', `stylesheets come back from Fidelity hosts over https, as text/css or .css (${got.join(', ')})`);
  report(!log.some(l => /evil\.example|^http:/.test(l.url)), '  an off-host or plain-http address is never requested');
  report(!css.sheets.some(s => /leaves/.test(s.url)), '  a response that redirected off Fidelity is dropped');
  report(!css.sheets.some(s => /not\.css/.test(s.url)), '  so is an html answer to a .css request');
  report(!css.sheets.some(s => s.text.length > 3000000), '  and one over the size cap');
  report(log.length > 0 && log.every(l => l.opts && l.opts.credentials === 'omit'), 'every request is made without cookies');

  responses.set('https://research2relay.fidelity.wallst.com/i.svg', { headers: { 'content-type': 'image/svg+xml' }, body: '<svg/>' });
  responses.set('https://digital.fidelity.com/i.gif', { headers: { 'content-type': 'image/gif' }, body: 'GIF89a' });
  responses.set('https://digital.fidelity.com/i.exe', { headers: { 'content-type': 'application/octet-stream' }, body: 'MZ' });
  responses.set('https://digital.fidelity.com/moved.gif', { headers: { 'content-type': 'image/gif' }, body: 'GIF89a', landed: 'https://cdn.example.net/moved.gif' });
  const svg = await ask({ type: 'fdm:fetchSvg', url: 'https://research2relay.fidelity.wallst.com/i.svg' }, me);
  report(svg.text === '<svg/>', `an SVG from the research provider's host is fetched (${svg.text})`);
  const gif = await ask({ type: 'fdm:fetchImage', url: 'https://digital.fidelity.com/i.gif' }, me);
  report(typeof gif.data === 'string' && gif.data.startsWith('data:image/gif;base64,'), `a GIF comes back as a data: URL (${String(gif.data).slice(0, 30)})`);
  const exe = await ask({ type: 'fdm:fetchImage', url: 'https://digital.fidelity.com/i.exe' }, me);
  report(exe.data === null, `  anything that is not an image is refused (${exe.data})`);
  const moved = await ask({ type: 'fdm:fetchImage', url: 'https://digital.fidelity.com/moved.gif' }, me);
  report(moved.data === null, '  and so is a picture that redirected off Fidelity');
  const far = await ask({ type: 'fdm:fetchImage', url: 'https://evil.example/i.gif' }, me);
  report(far.data === null && !log.some(l => /evil\.example/.test(l.url)), '  an off-host picture is neither fetched nor returned');

  /* the off gate: registered while the theme is off, once, however many
     changes arrive together */
  await settle();
  report(registered.length === 0, 'with the theme on at startup, no off gate is registered');
  report(typeof onStorage === 'function', '  and the worker listens for the setting');
  onStorage({ enabled: { newValue: false } }, 'sync');
  onStorage({ enabled: { newValue: false } }, 'sync');
  onStorage({ enabled: { newValue: true } }, 'sync');
  onStorage({ enabled: { newValue: false } }, 'sync');
  await settle();
  report(registered.length === 1 && registered[0].id === 'fdm-off-gate' && registered[0].js[0] === 'src/gate-off.js',
    `switching off registers the gate once, through a burst of changes (${registered.length} registration)`);
  const unregBefore = unregisters;
  onStorage({ enabled: { newValue: false } }, 'sync');
  await settle();
  report(registered.length === 1 && unregisters === unregBefore,
    `  a repeat of the same setting leaves the registration alone, with no gap (${unregisters - unregBefore} re-registrations)`);
  onStorage({ enabled: { newValue: true } }, 'sync');
  await settle();
  report(registered.length === 0, '  and switching back on removes it');
  onStorage({ enabled: { newValue: false } }, 'local');
  await settle();
  report(registered.length === 0, '  while a change in another storage area is ignored');
}

workerChecks().catch(e => report(false, `the worker checks threw: ${e && e.message}`)).then(() => {
  console.log(`\n${checks - fails}/${checks} assertions pass` + (fails ? `  (${fails} FAILED)` : ''));
  process.exit(fails ? 1 : 0);
});
