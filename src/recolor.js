/* =============================================================================
 * Fidelity Dark Mode - recolor.js: the recolor engine that content.js drives.
 * It walks Fidelity's CSSOM, maps each colour through palette.js and re-emits
 * the declaration under Fidelity's own selector, so new markup is still matched.
 * It also rewrites inline styles, icons and chart marks, and repairs contrast.
 * =========================================================================== */
(function (root) {
  'use strict';

  const { PALETTE: P, EXACT, CHART_EXACT } = root.FidelityDarkPalette;

  /* --- color maths ------------------------------------------------------- */

  /* Every CSS named colour. COLOR_RE is built from this list so the two
     cannot drift: a name missing there leaves its declaration unmapped (the
     research tables' `border-bottom: 2px solid green` sort marker). */
  const NAMED = {
    aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff',
    aquamarine: '#7fffd4', azure: '#f0ffff', beige: '#f5f5dc',
    bisque: '#ffe4c4', black: '#000000', blanchedalmond: '#ffebcd',
    blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
    burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00',
    chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed',
    cornsilk: '#fff8dc', crimson: '#dc143c', cyan: '#00ffff',
    darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
    darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9',
    darkkhaki: '#bdb76b', darkmagenta: '#8b008b', darkolivegreen: '#556b2f',
    darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000',
    darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
    darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f',
    darkturquoise: '#00ced1', darkviolet: '#9400d3', deeppink: '#ff1493',
    deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
    dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0',
    forestgreen: '#228b22', fuchsia: '#ff00ff', gainsboro: '#dcdcdc',
    ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520',
    gray: '#808080', green: '#008000', greenyellow: '#adff2f',
    grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4',
    indianred: '#cd5c5c', indigo: '#4b0082', ivory: '#fffff0',
    khaki: '#f0e68c', lavender: '#e6e6fa', lavenderblush: '#fff0f5',
    lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
    lightcoral: '#f08080', lightcyan: '#e0ffff',
    lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
    lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1',
    lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa',
    lightslategray: '#778899', lightslategrey: '#778899',
    lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00',
    limegreen: '#32cd32', linen: '#faf0e6', magenta: '#ff00ff',
    maroon: '#800000', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd',
    mediumorchid: '#ba55d3', mediumpurple: '#9370db',
    mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee',
    mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc',
    mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa',
    mistyrose: '#ffe4e1', moccasin: '#ffe4b5', navajowhite: '#ffdead',
    navy: '#000080', oldlace: '#fdf5e6', olive: '#808000',
    olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500',
    orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98',
    paleturquoise: '#afeeee', palevioletred: '#db7093', papayawhip: '#ffefd5',
    peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd',
    powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399',
    red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1',
    saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460',
    seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d',
    silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd',
    slategray: '#708090', slategrey: '#708090', snow: '#fffafa',
    springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c',
    teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347',
    turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3',
    white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00',
    yellowgreen: '#9acd32'
  };

  function parseColor(str) {
    if (!str) return null;
    const s = str.trim().toLowerCase();
    if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    const named = NAMED[s];
    const hexSrc = named || s;
    let m = /^#([0-9a-f]{3,8})$/.exec(hexSrc);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
      if (h.length !== 6 && h.length !== 8) return null;
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
      };
    }
    m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) {
      const parts = m[1].split(/[,\s/]+/).filter(Boolean);
      if (parts.length < 3) return null;
      const num = (v, max) => v.endsWith('%')
        ? (parseFloat(v) / 100) * max
        : parseFloat(v);
      return {
        r: Math.round(num(parts[0], 255)),
        g: Math.round(num(parts[1], 255)),
        b: Math.round(num(parts[2], 255)),
        a: parts[3] === undefined ? 1 : num(parts[3], 1)
      };
    }
    m = /^hsla?\(([^)]+)\)$/.exec(s);
    if (m) {
      const parts = m[1].split(/[,\s/]+/).filter(Boolean);
      if (parts.length < 3) return null;
      const rgb = hslToRgb(
        ((parseFloat(parts[0]) % 360) + 360) % 360 / 360,
        parseFloat(parts[1]) / 100,
        parseFloat(parts[2]) / 100
      );
      return {
        r: rgb[0], g: rgb[1], b: rgb[2],
        a: parts[3] === undefined ? 1
          : (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]))
      };
    }

    /* CSS Color 4 forms, e.g. Fidelity's popover shadow
       color(srgb .46 .45 .45 / .89). A colour the parser does not understand
       is skipped silently, which looks like "no rule matches". */
    m = /^color\(\s*(srgb-linear|srgb|display-p3|a98-rgb|prophoto-rgb|rec2020)\s+([^)]+)\)$/.exec(s);
    if (m) {
      const space = m[1];
      const parts = m[2].split(/[\s/]+/).filter(Boolean);
      if (parts.length < 3) return null;
      const chan = v => (v === 'none' ? 0 : v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v));
      let r = chan(parts[0]), g = chan(parts[1]), b = chan(parts[2]);
      const alpha = parts[3] === undefined ? 1 : chan(parts[3]);
      if (space === 'srgb-linear') { r = linearToSrgb(r); g = linearToSrgb(g); b = linearToSrgb(b); }
      else if (space !== 'srgb') {
        /* Wide gamuts go through linear light and XYZ: reading display-p3
           numbers as sRGB visibly shifts saturated colours. */
          const lin = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
        const M = RGB_TO_XYZ[space];
        if (M) {
          const X = M[0][0]*lin[0] + M[0][1]*lin[1] + M[0][2]*lin[2];
          const Y = M[1][0]*lin[0] + M[1][1]*lin[1] + M[1][2]*lin[2];
          const Z = M[2][0]*lin[0] + M[2][1]*lin[1] + M[2][2]*lin[2];
          const rgb = xyzToSrgb(X, Y, Z);
          r = rgb[0]; g = rgb[1]; b = rgb[2];
        }
      }
      return { r: byte(r), g: byte(g), b: byte(b), a: clamp(alpha, 0, 1) };
    }

    m = /^(oklch|oklab|lch|lab|hwb)\(\s*([^)]+)\)$/.exec(s);
    if (m) {
      const fn = m[1];
      const parts = m[2].split(/[\s,/]+/).filter(Boolean);
      if (parts.length < 3) return null;
      const alpha = parts[3] === undefined ? 1
        : (parts[3] === 'none' ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]));
      const n = (v, pctOf) => {
        if (v === 'none') return 0;
        const f = parseFloat(v);
        if (isNaN(f)) return 0;
        return v.endsWith('%') && pctOf !== undefined ? (f / 100) * pctOf : f;
      };
      const ang = v => {
        const f = parseFloat(v) || 0;
        if (/grad$/.test(v)) return f * 0.9;
        if (/rad$/.test(v)) return f * 180 / Math.PI;
        if (/turn$/.test(v)) return f * 360;
        return f;
      };
      let rgb;
      if (fn === 'hwb') {
        const h = ((ang(parts[0]) % 360) + 360) % 360 / 360;
        const w = n(parts[1], 1) > 1 ? n(parts[1], 1) / 100 : n(parts[1], 1);
        const bl = n(parts[2], 1) > 1 ? n(parts[2], 1) / 100 : n(parts[2], 1);
        const base = hslToRgb(h, 1, 0.5);
        const W = clamp(w, 0, 1), B = clamp(bl, 0, 1);
        const sum = W + B;
        const wN = sum > 1 ? W / sum : W, bN = sum > 1 ? B / sum : B;
        rgb = base.map(c => Math.round((c / 255) * (1 - wN - bN) * 255 + wN * 255));
      } else if (fn === 'oklch' || fn === 'oklab') {
        const L = n(parts[0], 1) > 1 ? n(parts[0], 1) / 100 : n(parts[0], 1);
        let raw;
        if (fn === 'oklch') {
          raw = oklchToRgbRaw(L, n(parts[1], 0.4), ((ang(parts[2]) % 360) + 360) % 360 * Math.PI / 180);
        } else {
          const a = n(parts[1], 0.4), b2 = n(parts[2], 0.4);
          raw = oklchToRgbRaw(L, Math.sqrt(a*a + b2*b2), Math.atan2(b2, a));
        }
        rgb = raw.map(byteLinear);
      } else {
        /* CIE Lab / LCH, D50 as CSS specifies. */
        const L = n(parts[0], 100);
        let A, B2;
        if (fn === 'lch') {
          const C = n(parts[1], 150), h = ((ang(parts[2]) % 360) + 360) % 360 * Math.PI / 180;
          A = C * Math.cos(h); B2 = C * Math.sin(h);
        } else { A = n(parts[1], 125); B2 = n(parts[2], 125); }
        rgb = labToSrgb(L, A, B2);
      }
      return { r: clamp(rgb[0], 0, 255), g: clamp(rgb[1], 0, 255), b: clamp(rgb[2], 0, 255), a: clamp(alpha, 0, 1) };
    }

    return null;
  }

  const byte = v => Math.round(clamp(v, 0, 1) * 255);
  const byteLinear = v => Math.round(clamp(linearToSrgb(clamp(v, 0, 1)), 0, 1) * 255);

  /* Linear-light RGB to XYZ, for the wide-gamut color() spaces. */
  const RGB_TO_XYZ = {
    'display-p3': [[0.4865709, 0.2656677, 0.1982173],
                   [0.2289746, 0.6917385, 0.0792869],
                   [0.0000000, 0.0451134, 1.0439444]],
    'a98-rgb':    [[0.5766690, 0.1855582, 0.1882286],
                   [0.2973450, 0.6273636, 0.0752915],
                   [0.0270313, 0.0706889, 0.9913375]],
    'rec2020':    [[0.6369580, 0.1446169, 0.1688810],
                   [0.2627002, 0.6779981, 0.0593017],
                   [0.0000000, 0.0280727, 1.0609851]],
    'prophoto-rgb': [[0.7977604, 0.1351807, 0.0313534],
                     [0.2880711, 0.7118408, 0.0000881],
                     [0.0000000, 0.0000000, 0.8251046]]
  };

  function xyzToSrgb(X, Y, Z) {
    const r =  3.2404542*X - 1.5371385*Y - 0.4985314*Z;
    const g = -0.9692660*X + 1.8760108*Y + 0.0415560*Z;
    const b =  0.0556434*X - 0.2040259*Y + 1.0572252*Z;
    return [clamp(linearToSrgb(clamp(r,0,1)),0,1), clamp(linearToSrgb(clamp(g,0,1)),0,1), clamp(linearToSrgb(clamp(b,0,1)),0,1)];
  }

  /* CIE Lab (D50) to sRGB bytes, via XYZ and the Bradford adaptation CSS uses. */
  function labToSrgb(L, a, b) {
    const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
    const k = 24389 / 27, e = 216 / 24389;
    const f3 = t => (t * t * t > e ? t * t * t : (116 * t - 16) / k);
    const Xn = 0.9642956, Yn = 1.0, Zn = 0.8251046;    // D50
    const X = f3(fx) * Xn;
    const Y = (L > 8 ? Math.pow(fy, 3) : L / k) * Yn;
    const Z = f3(fz) * Zn;
    /* D50 -> D65 */
    const X2 =  0.9554734*X - 0.0230985*Y + 0.0632593*Z;
    const Y2 = -0.0283697*X + 1.0099954*Y + 0.0210247*Z;
    const Z2 =  0.0123140*X - 0.0205076*Y + 1.3303659*Z;
    return xyzToSrgb(X2, Y2, Z2).map(v => Math.round(v * 255));
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const hue = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue(p, q, h + 1 / 3) * 255),
      Math.round(hue(p, q, h) * 255),
      Math.round(hue(p, q, h - 1 / 3) * 255)
    ];
  }

  const toHex = (r, g, b) =>
    '#' + [r, g, b].map(v =>
      Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
    ).join('');

  const chan = c => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  function relLum(c) {
    return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  }
  function contrast(a, b) {
    const la = relLum(a), lb = relLum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const hsl = (h, s, l) => { const c = hslToRgb(h, s, l); return toHex(c[0], c[1], c[2]); };
  const fmt = (hex, a) => {
    if (a >= 0.999) return hex;
    const c = parseColor(hex);
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.round(a * 1000) / 1000})`;
  };

  /* --- the map ------------------------------------------------------------ */

  const cache = new Map();

  /**
   * @param {string} raw   color literal as authored
   * @param {'bg'|'fg'|'border'|'shadow'|'frame'|'ring'|'token'|'bg-token'|'fg-token'} role
   * @param {object|null} bgRef  mapped background of the same rule, if any
   */
  function mapColor(raw, role, bgRef) {
    const key = raw + '|' + role + '|' + (bgRef ? bgRef.hex : '');
    if (cache.has(key)) return cache.get(key);
    const out = compute(raw, role, bgRef);
    cache.set(key, out);
    return out;
  }

  function compute(raw, role, bgRef) {
    const c = parseColor(raw);
    if (!c) return raw;
    if (c.a === 0) return raw;

    const a = c.a;
    const hex = toHex(c.r, c.g, c.b);
    const [h, s, l] = rgbToHsl(c.r, c.g, c.b);

    /* A modal or dialog box's own border (isFrameSelector). Providence frames
       its dialog in 2px black, which as a border would map to light ink; the
       app's dialogs have no frame, so a dark frame takes the subtle line. */
    if (role === 'frame') {
      if (a >= 0.98 && s <= 0.12 && l <= 0.35) return P.border;
      return compute(raw, 'border', bgRef);
    }

    /* A progress ring drawn in CSS (see processInline): a light grey track
       takes surf4 so it shows on a card, and the arc is mapped as ink. */
    if (role === 'ring') {
      if (a >= 0.98 && s <= 0.12 && l >= 0.7) return P.surf4;
      return compute(raw, 'fg', null);
    }

    /* Token roles arrive as 'fg-token'/'bg-token', so the branches below test
       `base`, or a token never matches. `guarded` tests the raw role: step 3. */
    const guarded = role === 'fg' || role === 'border';
    const base = role === 'bg-token' ? 'bg' : role === 'fg-token' ? 'fg' : role;

    /* A shadow stays black, only deeper: a lightened grey haloes every card. */
    if (role === 'shadow') {
      return fmt('#000000', clamp(a * 1.7, 0.18, 0.75));
    }

    /* translucent layers keep their alpha but swap which side they come from */
    if (a < 0.98) {
      if (base === 'fg') return fmt(P.text, a);
      if (s < 0.12 && l > 0.82) {
        if (base === 'border') return fmt('#FFFFFF', clamp(a * 0.5, 0.06, 0.4));
        /* From .45 alpha up, white is a surface (the income chart's tooltip is
           rgba(255,255,255,.9) with a .5 table inside): the card colour at the
           same alpha, so white on white stays invisible. */
        if (a >= 0.45) return fmt(P.surf1, a);
        // a white veil over light content -> a light veil over dark content,
        // much gentler or it washes the page out
        return fmt('#FFFFFF', clamp(a * 0.16, 0.02, 0.14));
      }
      if (s < 0.12 && l < 0.25) {
        /* Translucent black: as a border it is a hairline, so it flips to
           translucent white; otherwise it is a scrim and stays black. */
        return base === 'border'
          ? fmt('#FFFFFF', clamp(a * 1.1, 0.06, 0.45))
          : fmt('#000000', clamp(a * 1.25, 0.05, 0.85));
      }
      const solid = compute(hex, role, bgRef);
      return fmt(solid.startsWith('#') ? solid : hex, a);
    }

    /* An opaque white border is spacing, not a line (the Documents side nav
       keeps a 1.5rem white border-left on each item). It takes the card
       colour and skips the visibility floor, which would make it a grey slab. */
    if (base === 'border' && s <= 0.10 && l >= 0.97) return P.surf1;

    /* 1. designed intent, scoped to how the color is being used */
    const table = EXACT[base] || null;
    let mapped = (table && table[hex]) || EXACT.any[hex];

    /* A token whose name gives no role: a light EXACT.bg value is a surface,
       a dark EXACT.fg value is ink, anything else has its lightness inverted. */
    if (!mapped && role === 'token') {
      mapped = EXACT.bg[hex] && l > 0.8 ? EXACT.bg[hex]
        : EXACT.fg[hex] && l < 0.35 ? EXACT.fg[hex]
        : hsl(h, s <= 0.1 ? 0 : clamp(s * 0.85, 0.1, 0.7), clamp(1 - l, 0.08, 0.92));
    }

    /* 2. safety net */
    if (!mapped) {
      if (s <= 0.10) {
        /* achromatic */
        if (base === 'bg') {
          mapped = l >= 0.95 ? P.surf1
            : l >= 0.85 ? P.surf2
            : l >= 0.70 ? P.surf3
            : l >= 0.45 ? P.surf4
            : l >= 0.22 ? P.surf3
            : P.canvas;
        } else if (base === 'border') {
          mapped = l >= 0.90 ? P.hair
            : l >= 0.75 ? P.border
            : l >= 0.55 ? P.borderStr
            : P.borderCtl;
        } else {
          mapped = l <= 0.25 ? P.text
            : l <= 0.45 ? P.text2
            : l <= 0.68 ? P.text3
            : l <= 0.86 ? P.textDis
            : P.text;
        }
      } else {
        /* chromatic */
        if (l >= 0.88) {
          /* a pale status tint -> the same hue as a deep tint */
          mapped = base === 'fg'
            ? hsl(h, clamp(s * 0.85, 0.25, 0.7), 0.72)
            : hsl(h, clamp(s * 0.55, 0.12, 0.45), 0.115);
        } else if (base === 'bg') {
          mapped = hsl(h, clamp(s * 0.8, 0.1, 0.6), clamp(l * 0.7, 0.16, 0.4));
        } else if (base === 'border') {
          mapped = hsl(h, clamp(s * 0.8, 0.1, 0.7), clamp(Math.max(l, 0.42), 0.34, 0.55));
        } else {
          /* foreground: lift a dark brand color into the legible band */
          const lift = l < 0.55 ? 0.62 + (0.55 - l) * 0.28 : clamp(l, 0.6, 0.8);
          mapped = hsl(h, clamp(s * 0.88, 0.2, 0.78), clamp(lift, 0.55, 0.84));
        }
      }
    }

    /* 3. contrast guard, only for roles 'fg' (4.5:1) and 'border' (a 1.25:1
       visibility floor), against the rule's mapped background or the card.
       A 3:1 floor on every hairline would cage the page; control outlines are
       set in 03-components.css. */
    if (guarded) {
      const against = bgRef && bgRef.rgb ? bgRef.rgb : parseColor(P.surf1);
      const need = role === 'fg' ? 4.5 : 1.25;
      let m = parseColor(mapped);
      if (m && contrast(m, against) < need) {
        const [mh, ms] = rgbToHsl(m.r, m.g, m.b);
        let best = mapped, bestRatio = contrast(m, against);
        // the background may itself be light (a bright accent button); try both
        // directions and keep whichever actually reads
        for (const dir of [1, -1]) {
          for (let step = 1; step <= 24; step++) {
            const nl = clamp(rgbToHsl(m.r, m.g, m.b)[2] + dir * step * 0.025, 0.04, 0.97);
            const cand = hsl(mh, ms * (dir > 0 ? 0.96 : 1), nl);
            const cr = contrast(parseColor(cand), against);
            if (cr > bestRatio) { bestRatio = cr; best = cand; }
            if (cr >= need) break;
          }
          if (bestRatio >= need) break;
        }
        mapped = bestRatio >= need
          ? best
          : (relLum(against) > 0.28 ? P.textInv : P.text);
      }
    }

    return mapped;
  }

  /* --- declaration walking ------------------------------------------------- */

  /* Keep in step with parseColor(): a form missing here makes a declaration
     look colourless, and it is skipped. Names come from NAMED, longest first,
     except `tan`, which is also a maths function. */
  const COLOR_RE = new RegExp(
    'rgba?\\([^)]*\\)|hsla?\\([^)]*\\)|color\\(\\s*(?:srgb-linear|srgb|display-p3|a98-rgb|prophoto-rgb|rec2020)[^)]*\\)|' +
    '(?:oklch|oklab|lch|lab|hwb)\\([^)]*\\)|#[0-9a-fA-F]{3,8}\\b|\\b(?:' +
    Object.keys(NAMED).filter(n => n !== 'tan').sort((a, b) => b.length - a.length).join('|') + ')\\b', 'g');

  const ROLE_WORDS = [
    ['fg',     /(?:^|-)(?:foreground|text|ink|label|icon|link|placeholder|caption|heading|title|glyph|fg)(?:-|$)/g],
    ['border', /(?:^|-)(?:border|outline|stroke|divider|rule|separator|hairline|hair|line|edge)(?:-|$)/g],
    ['bg',     /(?:^|-)(?:background|surface|layer|canvas|tint|shade|backdrop|bg)(?:-|$)/g]
  ];

  /**
   * A custom property's role, read off its name: 'shadow', 'border',
   * 'fg-token', 'bg-token', or 'token' when no role word appears. compute()
   * contrast-guards plain 'border' but not the token roles.
   */
  function tokenRole(prop) {
    if (/shadow/.test(prop)) return 'shadow';
    /* The rightmost role word governs: --color-surface-foreground, which
       Fidelity's card text resolves to, is ink, not a surface. A trailing
       -on-<thing> names the backdrop, not the value's job, and is dropped. */
    let p = String(prop).toLowerCase();
    p = p.replace(/-on-[a-z0-9]+(?:-[a-z0-9]+)*$/, '');

    /* 'fill' in a token name is a surface (--form-field-fill-default, the
       Trade ticket's field background) unless it follows an ink word, as in
       --fa-icon-fill. The CSS property fill is ink: that is roleOf's job. */
    p = p.replace(/(^|-)(foreground|text|ink|label|icon|glyph|link|caption|heading|title)-fill(?=-|$)/g, '$1$2');
    p = p.replace(/(^|-)fill(?=-|$)/g, '$1background');

    let best = null, bestAt = -1;
    for (const [role, re] of ROLE_WORDS) {
      re.lastIndex = 0;
      let m, at = -1;
      while ((m = re.exec(p)) !== null) {
        at = m.index;
        re.lastIndex = m.index + 1;   // allow overlapping '-' delimiters
      }
      if (at > bestAt) { bestAt = at; best = role; }
    }
    if (!best) return 'token';
    return best === 'border' ? 'border' : best + '-token';
  }

  /* Values that only cancel something, and the properties where an !important
     copy of the rule they cancelled could otherwise win (see emitOne). */
  const NEUTRAL = /^(none|transparent|initial|unset|revert|inherit|0|currentcolor)$/i;
  const CANCELLABLE = /^(background|background-image|background-color|border|border-[a-z]+|border-[a-z]+-color|box-shadow|outline|outline-color|text-decoration|text-decoration-color|fill|stroke|color)$/i;
  /* isClear(): one colour with zero alpha, e.g. rgba(0, 0, 0, 0). */
  const LONE_COLOR = /^(?:transparent|#[0-9a-f]{4}|#[0-9a-f]{8}|(?:rgba?|hsla?|color)\([^()]*\))$/i;
  function isClear(value) {
    const v = String(value).trim();
    if (!LONE_COLOR.test(v)) return false;
    const c = parseColor(v);
    return !!c && c.a === 0;
  }

  function roleOf(prop) {
    if (/^--/.test(prop)) return 'var';
    if (/shadow/.test(prop)) return 'shadow';
    if (/^background|^-webkit-background|backdrop/.test(prop)) return 'bg';
    if (/border|outline|column-rule|caret/.test(prop)) return 'border';
    if (/color$|^color|fill|stroke|text-decoration/.test(prop)) return 'fg';
    return null;
  }

  /* light-dark(a, b): the theme sets color-scheme: dark (00-base.css), so the
     browser would take b, Fidelity's own dark value, and mapping it darkens it
     twice. collapseLightDark() keeps only a, the light input the map expects. */
  function splitTopLevel(str) {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) { out.push(str.slice(start, i)); start = i + 1; }
    }
    out.push(str.slice(start));
    return out;
  }

  function collapseLightDark(value) {
    if (value.indexOf('light-dark(') === -1) return value;
    let out = '', i = 0;
    while (i < value.length) {
      const at = value.indexOf('light-dark(', i);
      if (at === -1) { out += value.slice(i); break; }
      out += value.slice(i, at);
      let depth = 0, j = at + 'light-dark('.length - 1;
      for (; j < value.length; j++) {
        if (value[j] === '(') depth++;
        else if (value[j] === ')') { depth--; if (depth === 0) break; }
      }
      if (j >= value.length) { out += value.slice(at); break; }
      const inner = value.slice(at + 'light-dark('.length, j);
      const parts = splitTopLevel(inner);
      out += (parts[0] || '').trim() || inner;
      i = j + 1;
    }
    return out;
  }

  /* Custom property names are masked before mapping and restored after:
     COLOR_RE matches named colours, so var(--color-white) would become an
     invalid var(--color-#...) and the declaration would be dropped. A fallback
     in var(--x, #fff) sits outside the name and is still mapped. */
  const CUSTOM_PROP_NAME = /--[A-Za-z0-9_-]+/g;
  const MASK = '\u0001';
  /* the value with its custom property names blanked, for tests of whether
     it holds a literal colour at all: var(--reference-color-blue-800) names
     a colour but carries none, and read as one it was neither mapped nor
     re-emitted, so the positions popover's link icons fell to black */
  const withoutVarNames = value => value.replace(CUSTOM_PROP_NAME, '--');

  /* Every url() is masked the same way: the marketing site names sprites by
     colour (grey-pipe-sm.gif), and "grey" would be mapped inside the path.
     An SVG written straight into a data: URI (not base64) is the one picture
     whose colours can be read here, and for a ::before or ::after (which no
     element pass reaches) mapDataSvg maps them as ink once the rest of the
     value is done; a base64 one has no colour to map, and megabytes of it
     could spell one by chance ("/red+"). */
  const URL_TOKEN = /url\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*?)\s*\)/gi;
  const URL_MASK = '\u0002';
  const withoutUrls = value => value.replace(URL_TOKEN, 'url()');

  /* A url() token holding an SVG as text. Its colours are glyph ink, whatever
     property carries the picture, so they map as foreground; a "#" written
     into a URL starts a fragment and cuts the picture off, so hex colours go
     in and come out as %23. Returns the token unchanged when nothing maps. */
  const DATA_SVG_HEAD = /^url\(\s*["']?data:image\/svg\+xml((?:;[^;,"')]*)*),/i;
  function mapDataSvg(token, bgRef) {
    const m = DATA_SVG_HEAD.exec(token);
    if (!m || /;base64/i.test(m[1])) return token;
    const head = m[0];
    const body = token.slice(head.length).replace(/%23/gi, '#');
    const mapped = body.replace(COLOR_RE, lit => mapColor(lit, 'fg', bgRef));
    if (mapped === body) return token;
    return head + mapped.replace(/#/g, '%23');
  }
  /* whether a value carries such a picture with a colour in it */
  function hasDataSvgColour(value) {
    if (value.indexOf('data:image/svg') === -1) return false;
    let found = false;
    value.replace(URL_TOKEN, token => {
      if (found) return token;
      const m = DATA_SVG_HEAD.exec(token);
      if (!m || /;base64/i.test(m[1])) return token;
      COLOR_RE.lastIndex = 0;
      found = COLOR_RE.test(token.slice(m[0].length).replace(/%23/gi, '#'));
      COLOR_RE.lastIndex = 0;
      return token;
    });
    return found;
  }

  /* A box-shadow layer with a hard edge is a line and maps as a border: no
     blur, or at most 3px of blur inside a negative spread at least as large
     (the old Performance page's frozen-column rule `4px 0 2px -2px #ccc`, a
     ring drawn as `0 0 0 2px`). Anything else, or a var()/calc() length, is a
     shadow. */
  function shadowLayerRole(layer) {
    if (/var\(|calc\(|\u0001|\u0002/.test(layer)) return 'shadow';
    const geo = layer.replace(COLOR_RE, ' ').replace(/\binset\b/gi, ' ').trim();
    const lens = geo.split(/\s+/).filter(Boolean);
    if (lens.length < 2 || lens.length > 4) return 'shadow';
    const px = [];
    for (const t of lens) {
      const m = /^([-+]?(?:\d+\.?\d*|\.\d+))(px|r?em)?$/i.exec(t);
      if (!m) return 'shadow';
      px.push(parseFloat(m[1]) * (m[2] && /em/i.test(m[2]) ? 16 : 1));
    }
    const blur = px.length > 2 ? px[2] : 0;
    const spread = px.length > 3 ? px[3] : 0;
    if (blur === 0) return 'border';
    if (spread < 0 && blur <= -spread && blur <= 3) return 'border';
    return 'shadow';
  }

  /* pseudoArt: the rule draws a ::before or ::after, which no element pass
     ever reaches, so an SVG written into its data: URI is mapped here; for an
     element the picture is left to recolorIconImages, which edits the
     original artwork with its roles intact. */
  function rewriteValue(value, role, bgRef, pseudoArt) {
    const flat = collapseLightDark(value);
    let touched = flat !== value;

    const urls = [];
    const unaddressed = flat.replace(URL_TOKEN, m => {
      urls.push(m);
      return URL_MASK + (urls.length - 1) + URL_MASK;
    });

    const names = [];
    const masked = unaddressed.replace(CUSTOM_PROP_NAME, m => {
      names.push(m);
      return MASK + (names.length - 1) + MASK;
    });

    const mapLayer = (text, r) => text.replace(COLOR_RE, lit => {
      const m = mapColor(lit, r, bgRef);
      if (m !== lit) touched = true;
      return m;
    });
    const mapped = role === 'shadow'
      ? splitTopLevel(masked).map(layer => mapLayer(layer, shadowLayerRole(layer))).join(',')
      : mapLayer(masked, role);

    let next = names.length
      ? mapped.replace(new RegExp(MASK + '(\\d+)' + MASK, 'g'), (_, i) => names[+i])
      : mapped;
    if (urls.length) {
      next = next.replace(new RegExp(URL_MASK + '(\\d+)' + URL_MASK, 'g'), (_, i) => {
        const token = urls[+i];
        if (!pseudoArt) return token;
        const art = mapDataSvg(token, bgRef);
        if (art !== token) touched = true;
        return art;
      });
    }

    return touched ? next : null;
  }

  /** Extract the mapped background of a rule so foregrounds can be judged against it. */
  function ruleBackground(style) {
    const bg = style.getPropertyValue('background-color') || style.getPropertyValue('background');
    if (!bg) return null;
    const lit = (withoutVarNames(withoutUrls(bg)).match(COLOR_RE) || [])[0];
    if (!lit) return null;
    const src = parseColor(lit);
    if (!src || src.a < 0.5) return null;
    const mappedHex = compute(toHex(src.r, src.g, src.b), 'bg', null);
    const rgb = parseColor(mappedHex);
    return rgb ? { hex: mappedHex, rgb } : null;
  }

  /* A nested rule's selectorText is relative ("&:focus-visible", "> .row").
     Emitted bare, AG Grid's nested "&:focus-visible" ring would land on every
     focused control, so the parent is composed back in with :is(), which
     keeps a selector list on either side intact. */
  function splitTop(sel) {
    const parts = []; let depth = 0, cur = '';
    for (const ch of sel) {
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }
  function composeSelector(sel, parent) {
    if (!parent) return sel;
    const p = ':is(' + parent + ')';
    return splitTop(sel).map(s => s.indexOf('&') !== -1 ? s.replace(/&/g, p) : p + ' ' + s).join(', ');
  }

  /* ChartIQ's rules are not copied. It reads its drawing colours once from
     hidden probe elements (.stx_grid, .stx_xaxis): in the ACE chart they
     resolve the --fidchart-* tokens 05-charts.css sets, and elsewhere its
     canvas is inverted, so either way the probes keep their own values. A
     cq-swatch key's series colour is inline, and an !important copy of the
     default `cq-swatch { red }` rule would paint over it. Fidelity's own dark
     theme for the chart (.fidchart-theme-dark, see themeAce) is dark already. */
  const CHARTIQ_OWN = /\.stx_|cq-swatch|\.fidchart-theme-dark/i;

  /* the address of a sheet fetched by the worker, while processText() reads it */
  let textBase = null;

  /* Relative url()s are made absolute, since the copy lives in another sheet:
     a linked sheet's against its href, a <style>'s against its node's baseURI
     (not location.href: the portfolio app sets <base href="/">), a fetched
     sheet's against textBase. With no base the value is refused (null). */
  function absoluteUrls(value, rule) {
    const sheet = rule && rule.parentStyleSheet;
    const base = sheet && sheet.href ? sheet.href
      : (sheet && sheet.ownerNode && sheet.ownerNode.baseURI) || textBase;
    let ok = true;
    const out = value.replace(/url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*?))\s*\)/gi, (m, a, b, c) => {
      const raw = a !== undefined ? a : b !== undefined ? b : c;
      /* already absolute, or the picture itself: carried over exactly as
         the browser serialised it */
      if (/^(?:data:|https?:|blob:|\/\/)/i.test(raw)) return m;
      if (!base) { ok = false; return m; }
      try { return 'url("' + new URL(raw, base).href + '")'; } catch (e) { ok = false; return m; }
    });
    return ok ? out : null;
  }

  /* varUse: token name -> the roles (roleOf) the sheet being read paints it
     with, since a name can mislead: the positions grid's earnings badge sets
     :host { --icon-rest-color: #FFFFFF } and paints it as a background (see
     emitOne). A surface token used as text is a knockout and keeps its role. */
  let varUse = null;
  const VAR_NAME = /var\(\s*(--[\w-]+)/g;

  function scanVarUse(rules, map) {
    for (const r of rules) {
      const st = r.style;
      if (st && st.length) {
        for (let i = 0; i < st.length; i++) {
          const prop = st[i];
          if (prop.startsWith('--')) continue;
          const v = st.getPropertyValue(prop);
          if (!v || v.indexOf('var(') === -1) continue;
          const role = roleOf(prop);
          if (!role || role === 'var' || role === 'shadow') continue;
          VAR_NAME.lastIndex = 0;
          let m;
          while ((m = VAR_NAME.exec(v)) !== null) {
            let set = map.get(m[1]);
            if (!set) { set = new Set(); map.set(m[1], set); }
            set.add(role);
          }
        }
      }
      let kids = null;
      try { kids = r.cssRules; } catch (e) { kids = null; }
      if (kids && kids.length) scanVarUse(kids, map);
    }
    return map;
  }

  const PSEUDO_ELEMENT = /::|:(?:before|after|first-line|first-letter)\b/i;

  /* A `background` shorthand naming neither colour nor picture is a reset
     (the footer's `.seo-footer--last-item { background: 0 0 }` removes the
     grey pipe), so emitOne keeps its unwritten `background-image: initial`.
     Only if every selector in the list has a class, id or attribute: a copy
     of a bare-tag reset could only erase pictures that won in light mode. */
  function clearsPicture(rule, style) {
    if (!rule || !rule.selectorText) return false;
    if (!/(?:^|[;{\s])background\s*:/.test(style.cssText)) return false;
    const color = style.getPropertyValue('background-color').trim();
    if (color && !/^initial$/i.test(color)) return false;
    return splitTop(rule.selectorText).every(s => /[.#[]/.test(s.replace(/::?[\w-]+(\([^)]*\))?/g, '')));
  }

  /* Whether a longhand appears in the rule's own text, as opposed to being
     the read-back expansion of a shorthand (border-left: 8px solid gives a
     border-left-color of currentcolor the author never wrote). */
  function impliedLonghandWritten(prop, style) {
    return new RegExp('(?:^|[;{\\s])' + prop.replace(/-/g, '\\-') + '\\s*:').test(style.cssText);
  }

  /* True for a border or outline width of 0 or style of none that the author
     wrote, through the longhand itself or any shorthand that sets it
     (border-top-style: border, border-top, border-style). */
  const RESET_LONGHAND = /^(border(?:-(?:top|right|bottom|left))?|outline)-(width|style)$/;
  function resetWritten(prop, value, style) {
    const m = RESET_LONGHAND.exec(prop);
    if (!m) return false;
    const v = value.trim();
    /* an edge the page itself marked !important is copied whatever its value,
       so that (boosted, see boostSelector) it still beats the reset copies */
    const reset = m[2] === 'width' ? /^0(?:px)?$/.test(v) : v === 'none';
    if (!reset && style.getPropertyPriority(prop) !== 'important') return false;
    const family = [m[1] + '-' + m[2], m[1]];
    if (m[1] !== 'outline' && m[1] !== 'border') family.push('border', 'border-' + m[2]);
    const text = style.cssText;
    return family.some(p => new RegExp('(?:^|[;{\\s])' + p.replace(/-/g, '\\-') + '\\s*:').test(text));
  }

  /* A selector the boost mangles (a "::" inside an attribute value, an escaped
     colon) can leave a bracket open and swallow every rule emitted after it. */
  function selectorOk(sel) {
    if (typeof CSS === 'undefined' || !CSS.supports) return true;
    try { return splitTop(sel).every(s => CSS.supports('selector(' + s + ')')); } catch (e) { return false; }
  }

  /* Every emitted copy is !important, which erases Fidelity's own "an
     !important rule beats a normal one" ordering. Declarations that were
     already !important are emitted again with one more id, :is(sel):not(#\9),
     so they still win (the Spending page's .performance-loss red over a later
     .sub-heading). :not(#\9) matches every element. A pseudo-element stays
     outside the :is(); :host, ::slotted, ::part and :scope are not boosted. */
  function boostSelector(sel) {
    if (/:host|::slotted|::part|:scope/i.test(sel)) return null;
    const parts = splitTop(sel);
    if (!parts.length) return null;
    return parts.map(s => {
      const m = PSEUDO_ELEMENT.exec(s);
      const base = m ? s.slice(0, m.index).trim() : s;
      const tail = m ? s.slice(m.index) : '';
      return (base ? ':is(' + base + ')' : '') + ':not(#\\9)' + tail;
    }).join(', ');
  }

  /* The gate. Every emitted copy is shut off by the fdm-off class, as the
     theme's own files are, so lifting the theme (readLight, a print, the
     switch) is one class toggle and never re-indexes the page's stylesheets:
     disabling a sheet makes the browser rebuild its author style and fetch
     every @font-face afresh, which on a page whose fonts fail to decode
     logged the failure again on every read. :where() adds no specificity, so
     the copies still rank exactly as Fidelity's rules do. A selector naming
     the root (html, :root) at the top level carries the test on that
     compound, since <html> has no ancestor for the prefix to match. Set for
     the document's sheets only; a shadow root's copies are withdrawn by hand. */
  const GATE = ':where(html:not(.fdm-off))';
  const GATE_SELF = ':where(:not(.fdm-off))';
  let gateCopies = false;

  function gateSelector(list) {
    return splitTop(list).map(sel => {
      let out = '', depth = 0, atStart = true, rooted = false;
      for (let i = 0; i < sel.length; i++) {
        const ch = sel[i];
        if (atStart && depth === 0) {
          const m = /^(?:html|:root)(?![\w-])/i.exec(sel.slice(i));
          if (m) { out += m[0] + GATE_SELF; i += m[0].length - 1; rooted = true; atStart = false; continue; }
        }
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        /* a combinator at the top level starts a new compound */
        atStart = depth === 0 && /[\s>+~]/.test(ch);
        out += ch;
      }
      return rooted ? out : GATE + ' ' + sel;
    }).join(', ');
  }

  /* The box of a modal or dialog, as opposed to a control inside one. */
  const FRAME_SUBJECT = /modal|dialog/i;
  const NOT_A_FRAME = /button|btn|close|input|select|textarea|icon|link|label/i;
  function isFrameSelector(sel) {
    if (!sel || !FRAME_SUBJECT.test(sel)) return false;
    return splitTop(sel).some(part => {
      const subject = part.trim().split(/\s*[>+~]\s*|\s+/).pop() || '';
      return FRAME_SUBJECT.test(subject) && !NOT_A_FRAME.test(subject);
    });
  }

  /* A tooltip's or popover's bubble, and its pointer (an arrow, caret or nub,
     or a ::before/::after on the bubble), are one floating layer: both take
     the same fill and outline whatever the map would make of each, so a
     pointer always joins its bubble. Tooltips are surf4 and popovers surf3,
     as 03-components.css and 06-fds.css paint the bubbles they name. */
  const FLOAT_CONTEXT = /tooltip|popover|flyout/i;
  const POINTER_PART = /arrow|caret|pointer|nub|beak/i;
  const NOT_A_BUBBLE = /trigger|icon|anchor|target|btn|button|link|wrapper|root|slot|reset|text|label|title|head|close/i;
  function floatingLayer(sel) {
    if (!sel || !FLOAT_CONTEXT.test(sel)) return null;
    for (const part of splitTop(sel)) {
      if (!FLOAT_CONTEXT.test(part)) continue;
      const subject = part.trim().split(/\s*[>+~]\s*|\s+/).pop() || '';
      const fill = /tooltip/i.test(part) ? P.surf4 : P.surf3;
      if (POINTER_PART.test(subject) && !/dropdown-arrow|icon/i.test(subject)) return fill;
      const own = subject.replace(/::?(?:before|after)\b/gi, '');
      if (FLOAT_CONTEXT.test(own) && !NOT_A_BUBBLE.test(own)) return fill;
    }
    return null;
  }
  /* An opaque fill takes the layer's fill. An outline takes the bubble's line,
     except a white or `canvas` side, which only hides an edge against the
     bubble and takes the fill. Transparent stays transparent. */
  function floatingValue(value, role, fill) {
    /* a fill through a variable still takes the layer's; an outline through
       one is left to the tokens, since it may expand to transparent sides */
    if (/var\(/i.test(value)) return role === 'bg' ? fill : null;
    let hit = false;
    const pick = tok => {
      if (/^canvas$/i.test(tok)) { hit = true; return fill; }
      const c = parseColor(tok);
      if (!c) return tok;
      hit = true;
      if (c.a < 0.05) return tok;
      if (role === 'bg') return fill;
      return relLum(c) > 0.8 ? fill : P.borderStr;
    };
    COLOR_RE.lastIndex = 0;
    let out = value.replace(COLOR_RE, m => pick(m));
    COLOR_RE.lastIndex = 0;
    out = out.replace(/\bcanvas\b/gi, m => pick(m));
    return hit ? out : null;
  }

  /* A pointer drawn as a picture (an SVG whose white is a hole) takes its
     bubble's colour as that hole. */
  function pointerHole(el) {
    const cls = n => String((n && n.className && (n.className.baseVal ?? n.className)) || '');
    if (!POINTER_PART.test(cls(el))) return undefined;
    let n = el;
    for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
      const c = cls(n);
      if (FLOAT_CONTEXT.test(c)) return /tooltip/i.test(c) ? P.surf4 : P.surf3;
    }
    return undefined;
  }

  /* Alternate rows. Every near-white maps onto the card, which would erase a
     table's striping, so a stripe (a rule that picks every other row) whose
     grey lands on the card or the page takes a surface one step up instead:
     surf3 for #f2f2f2, about the step light mode takes from white. */
  const STRIPE_SEL = /:nth-(?:child|of-type)\(\s*(?:odd|even|2n(?:\s*[+-]\s*\d+)?)\s*\)|\.(?:odd|even)\b|zebra|striped/i;
  function stripeValue(src, mapped) {
    const out = parseColor(mapped), c = parseColor(src);
    if (!out || !c || c.a < 0.5) return null;
    const hex = toHex(out.r, out.g, out.b).toLowerCase();
    if (hex !== P.surf1.toLowerCase() && hex !== P.canvas.toLowerCase()) return null;
    const L = rgbToOklch(c.r, c.g, c.b)[0];
    if (L > 0.995 || L < 0.85) return null;          // white is the base row, not a stripe
    return L > 0.975 ? P.surf2 : P.surf3;
  }

  /* A fill on a box its rule makes 3px thin or less is a line (the percentile
     scale's 2px axis, the ratings card's 1px average marker), and maps as
     one: a surface that thin would vanish into the card. */
  const pxOf = v => (/^\d*\.?\d+px$/.test(v = String(v || '').trim()) ? parseFloat(v) : Infinity);
  function thinRule(style) {
    const t = Math.min(pxOf(style.getPropertyValue('height')), pxOf(style.getPropertyValue('width')));
    return t > 0 && t <= 3;
  }

  /* the shorthands a var() value can hide behind (see the loop in rewriteRule) */
  const VAR_SHORTHANDS = ['background', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'outline', 'text-decoration', 'column-rule'];

  function rewriteRule(rule, parentSel) {
    const style = rule.style;
    if (!style || !style.length) return null;
    if (rule.selectorText && CHARTIQ_OWN.test(rule.selectorText)) return null;
    const bgRef = ruleBackground(style);
    const frame = isFrameSelector(rule.selectorText);
    const floating = floatingLayer(rule.selectorText);
    const stripe = !!rule.selectorText && STRIPE_SEL.test(rule.selectorText);
    const thin = thinRule(style);
    const pseudoArt = !!rule.selectorText && /::?(?:before|after)\b/i.test(rule.selectorText);
    const decls = [];
    /* The emitted copies of declarations Fidelity marked !important. */
    const imp = [];
    const emitOne = prop => {
      /* A text shadow is light-mode decoration (a dark glow under white button
         labels) and smudges the dark ink filled buttons get here, so a rule
         that sets one sets none instead, at its own specificity. */
      if (prop === 'text-shadow') {
        if (style.getPropertyValue(prop).trim() !== 'none') decls.push('text-shadow:none !important');
        return;
      }
      /* A ::before or ::after drawn as `content: url(data:image/svg+xml,...)`
         (the homepage market movers' sort arrows, black and grey) is glyph
         ink like any other data-SVG picture, and is mapped the same way. */
      if (prop === 'content') {
        const v = style.getPropertyValue(prop);
        if (!pseudoArt || !v || !hasDataSvgColour(v)) return;
        const next = rewriteValue(v, 'fg', bgRef, true);
        if (next !== null) decls.push('content:' + next + ' !important');
        return;
      }
      /* A page paints an icon black with `filter: brightness(0)`; on the dark
         theme that reads as the text colour instead (the homepage's "Find an
         investor center" button icon). A longer recipe that goes on to mix a
         particular colour is left alone. */
      if (prop === 'filter') {
        const v = style.getPropertyValue(prop).trim();
        if (/^brightness\(0(?:%|\.0+)?\)(?:\s+saturate\((?:100%|1|0%?)\))?$/i.test(v)) decls.push('filter:var(--fdm-f-text-2) !important');
        return;
      }
      const role = roleOf(prop);
      if (!role) return;
      const value = style.getPropertyValue(prop);
      if (!value) return;
      if (floating && (role === 'bg' || role === 'border') && !/image|shadow/.test(prop)) {
        const next = floatingValue(value, role, floating);
        if (next !== null) { decls.push(prop + ':' + next + ' !important'); return; }
      }
      const bare = withoutUrls(value);
      /* A var() value with no literal colour needs no mapping (the tokens are
         mapped where they are defined) but is re-emitted, or a more specific
         var() rule would lose to the !important copy of a less specific one. */
      if (value.indexOf('var(') !== -1 && !COLOR_RE.test(withoutVarNames(bare))) {
        COLOR_RE.lastIndex = 0;
        if (/^--/.test(prop)) return;
        const carried = /url\(/i.test(value) ? absoluteUrls(value, rule) : value;
        if (carried) decls.push(prop + ':' + carried + ' !important');
        return;
      }
      COLOR_RE.lastIndex = 0;
      if (!COLOR_RE.test(bare) && !(pseudoArt && hasDataSvgColour(value))) {
        COLOR_RE.lastIndex = 0;
        /* A background picture is re-emitted too: once resets like
           `#va-container.va button { background-image: none }` are copied
           !important, the more specific #va-submit send arrow must be as well.
           A url that cannot be made absolute drops the declaration. */
        if (prop === 'background-image' && /url\(/i.test(value) && !/gradient\(/i.test(value)) {
          const abs = absoluteUrls(value, rule);
          if (abs) decls.push('background-image:' + abs + ' !important');
          return;
        }
        /* Skip "initial" values the author never wrote: a shorthand reads back
           as longhands set to initial, and re-emitting those as !important
           would erase real values. clearsPicture() is the exception. */
        if (/^initial$/i.test(value.trim()) &&
            !new RegExp('(?:^|[;{\\s])' + prop.replace(/[-]/g, '\\-') + '\\s*:').test(style.cssText) &&
            !(prop === 'background-image' && clearsPicture(rule, style))) {
          return;
        }
        /* A cancelling value (background-image: none) has no colour but is
           re-emitted verbatim, or the !important copy of the rule it overruled
           would win. Not an implied currentcolor, though: `border-left: 8px
           solid` reads back as border-left-color: currentcolor, which the
           author never wrote, and copied !important it would beat a colour the
           page sets inline (the Net worth page's category bars, orange and
           purple by script, all turned white). */
        if (!/^--/.test(prop) && NEUTRAL.test(value.trim()) && CANCELLABLE.test(prop)) {
          if (/^currentcolor$/i.test(value.trim()) && !impliedLonghandWritten(prop, style)) return;
          decls.push(prop + ':' + value + ' !important');
          return;
        }
        /* A border or outline the author switched off (`border: 0`, `border-left:
           0`, `outline: none`) is kept off: its width and style longhands are
           copied, or the !important copy of a less specific `border: var(--x)`
           puts the edge back (the summary page's chart range control, framed and
           divided in the dark theme only). Longhands a shorthand merely implied
           are left alone. */
        if (resetWritten(prop, value, style)) decls.push(prop + ':' + value.trim() + ' !important');
        return;
      }
      COLOR_RE.lastIndex = 0;
      // --fdm-* are the theme's own tokens, already dark.
      if (role === 'var' && prop.startsWith('--fdm-')) return;
      /* A custom property has no element or backdrop, so its role comes from
         its name (tokenRole). The '-token' roles and 'token' skip compute()'s
         contrast guard; a border token comes back as plain 'border' and gets
         the visibility floor against the card. */
      let effRole = role === 'var' ? tokenRole(prop) : role;
      if (effRole === 'border' && frame) effRole = 'frame';
      if (thin && prop === 'background-color') {
        const c = parseColor(value.trim());
        if (c && c.a > 0.5) effRole = 'border';
      }
      /* An ink or unreadable token that the sheet paints as a background
         (varUse) becomes 'bg-token' when that is its only use, or when it has
         other uses too and its value is near-white (the earnings badge and its
         knocked-out letter on hover). Otherwise it keeps its role. */
      if (role === 'var' && varUse && (effRole === 'fg-token' || effRole === 'token')) {
        const u = varUse.get(prop);
        if (u && u.has('bg')) {
          if (u.size === 1) effRole = 'bg-token';
          else {
            const c = parseColor(value.trim());
            if (c && c.a > 0.5 && relLum(c) > 0.7) effRole = 'bg-token';
          }
        }
      }
      let next = rewriteValue(value, effRole, effRole === 'fg' ? bgRef : null, pseudoArt);
      if (next === null) {
        /* Nothing was mapped. A fully transparent colour is how the CSSOM
           reads back "transparent" from a shorthand, and it cancels like the
           NEUTRAL values above, so it is re-emitted verbatim (the old
           Performance page's 14px transparent border gutter). */
        if (!/^--/.test(prop) && CANCELLABLE.test(prop) && isClear(value)) {
          decls.push(prop + ':' + value.trim() + ' !important');
        }
        return;
      }
      if (stripe && prop === 'background-color') next = stripeValue(value, next) || next;
      /* a gradient over a picture keeps its url(): absolute, or dropped */
      if (/url\(/i.test(next)) {
        next = absoluteUrls(next, rule);
        if (!next) return;
      }
      /* Every copy is !important: Fidelity's Stencil components inject their
         <style> after the emitted sheet as they hydrate, so source order
         cannot decide. Selectors are copied verbatim and in order, so
         specificity among the copies matches Fidelity's. */
      decls.push(prop + ':' + next + ' !important');
    };
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      const before = decls.length;
      emitOne(prop);
      if (decls.length > before && style.getPropertyPriority(prop) === 'important') imp.push(...decls.slice(before));
    }
    /* A shorthand written with var() (the planning app's
       `background: var(--fds-layer-fds-layer-background, #f9f7f5)`) reads back
       as longhands with no value at all; only the shorthand itself holds the
       text, so it is read and copied as one. A shorthand without var() is
       already covered by its longhands above and serialises nothing here. */
    for (const sh of VAR_SHORTHANDS) {
      const v = style.getPropertyValue(sh);
      if (!v || v.indexOf('var(') === -1) continue;
      const before = decls.length;
      emitOne(sh);
      if (decls.length > before && style.getPropertyPriority(sh) === 'important') imp.push(...decls.slice(before));
    }
    if (!decls.length) return null;
    let sel = composeSelector(rule.selectorText, parentSel);
    if (gateCopies) sel = gateSelector(sel);
    let text = sel + '{' + decls.join(';') + '}';
    /* Fidelity's !important declarations again, one id stronger (see
       boostSelector). The plain copy stays for selectors the boost cannot
       handle. */
    if (imp.length) {
      const strong = boostSelector(sel);
      if (strong && selectorOk(strong)) text += '\n' + strong + '{' + imp.join(';') + '}';
    }
    return text;
  }

  let seenSheets = new WeakSet();

  /* The prelude of an @media, @supports or @container rule, read from its own
     cssText. Rebuilt from conditionText it loses the at-rule's kind, and an
     @supports turned into @media never matches. */
  function prelude(rule) {
    const t = rule.cssText || '';
    const i = t.indexOf('{');
    if (i < 1) return null;
    const head = t.slice(0, i).trim();
    return /^@(media|supports|container)\b/.test(head) ? head : null;
  }

  /* The media a sheet or @import is limited to, as an @media prelude to wrap
     its copies in, or null when it applies everywhere on screen. */
  function mediaPrelude(mediaText) {
    const mt = String(mediaText || '').trim();
    if (!mt || /^(all|screen)$/i.test(mt)) return null;
    return '@media ' + mt;
  }

  function harvest(rules, conditionStack, out, parentSel) {
    for (const rule of rules) {
      const isStyle = !!(rule.selectorText && rule.style);
      if (isStyle) {
        const text = rewriteRule(rule, parentSel);
        if (text) out.push(wrap(text, conditionStack));
      }
      /* An @import's sheet is not listed in document.styleSheets, so it is
         read here, under the import's own media. One still loading is kept
         for a later pass (readImports); a cross-origin one is left for the
         worker like any other cross-origin sheet. */
      if (rule.href !== undefined && rule.styleSheet !== undefined && !rule.cssRules) {
        if (!readImport(rule, conditionStack, out, parentSel)) {
          if (rule.styleSheet) {
            try { if (rule.styleSheet.href) pendingRemote.add(rule.styleSheet.href); } catch (e) { /* ignore */ }
          } else {
            pendingImports.add({ rule, stack: conditionStack, parentSel, gate: gateCopies, root: harvestRoot });
          }
        }
        continue;
      }
      if (rule.cssRules && rule.cssRules.length) {
        const t = (rule.cssText || '').slice(0, 7);
        // @scope changes which elements a selector can reach; re-emitting its
        // contents unscoped would over-apply, so it is left alone entirely.
        // @starting-style holds the first frame of a transition, not a style;
        // copied as plain rules its declarations would stick.
        if (t.indexOf('@scope') === 0 || t.indexOf('@starti') === 0) continue;
        const head = prelude(rule);
        // A style rule's nested children are relative to it (CSS nesting);
        // a conditional group inside one passes the parent through unchanged.
        const childParent = isStyle ? composeSelector(rule.selectorText, parentSel) : parentSel;
        // A @layer wrapper is dropped, not recreated: a new layer would land
        // elsewhere in layer order. The unlayered !important copies beat any
        // normal declaration, but a layered !important one still beats them.
        harvest(rule.cssRules, head ? conditionStack.concat(head) : conditionStack, out, childParent);
      }
    }
  }

  /* Harvest an @import's sheet, if it can be read now. Returns false when it
     is still loading (styleSheet null) or cross-origin (cssRules throws). */
  function readImport(rule, conditionStack, out, parentSel) {
    let imported = null;
    try { imported = rule.styleSheet ? rule.styleSheet.cssRules : null; } catch (e) { imported = null; }
    if (!imported) return false;
    const head = mediaPrelude(rule.media && rule.media.mediaText);
    try { harvest(imported, head ? conditionStack.concat(head) : conditionStack, out, parentSel); } catch (e) { /* keep going */ }
    return true;
  }

  /* @imports found before their sheets had loaded; each pass reads the ones
     that have since. An import whose own sheet has left the document is
     dropped. */
  const pendingImports = new Set();
  let harvestRoot = null;            // the document or shadow root being read
  function readImports(out, root_) {
    for (const p of pendingImports) {
      if (p.root !== root_) continue;
      const owner = p.rule.parentStyleSheet;
      const node = owner && owner.ownerNode;
      if (!owner || (node && !node.isConnected)) { pendingImports.delete(p); continue; }
      if (!p.rule.styleSheet) continue;
      pendingImports.delete(p);
      const before = gateCopies;
      gateCopies = p.gate;
      varUse = scanVarUse(owner.cssRules || [], new Map());
      try {
        if (!readImport(p.rule, p.stack, out, p.parentSel) && p.rule.styleSheet.href) pendingRemote.add(p.rule.styleSheet.href);
      } catch (e) { /* keep going */ }
      varUse = null;
      gateCopies = before;
    }
  }

  function wrap(text, stack) {
    let s = text;
    for (let i = stack.length - 1; i >= 0; i--) s = stack[i] + '{' + s + '}';
    return s;
  }

  /**
   * Recolor each sheet of a document or shadow root that is not read yet.
   * @returns {string} the CSS to append, or '' when nothing new was found
   */
  function processSheets(doc) {
    const out = [];
    harvestRoot = doc;
    try { readImports(out, doc); } catch (e) { /* keep going */ }
    for (const sheet of doc.styleSheets) {
      if (seenSheets.has(sheet)) continue;
      const node = sheet.ownerNode;
      if (node && node.dataset && node.dataset.fidelityDark !== undefined) { seenSheets.add(sheet); continue; }
      /* not on screen: a switched-off sheet (looked at again later) or a print sheet */
      if (sheet.disabled) continue;
      if (/^\s*print\s*$/i.test((sheet.media && sheet.media.mediaText) || '')) { seenSheets.add(sheet); continue; }
      let rules;
      try { rules = sheet.cssRules; } catch (e) { rules = null; }
      if (!rules) {
        // cross-origin: remember it so the service worker can fetch the text
        if (sheet.href) pendingRemote.add(sheet.href);
        seenSheets.add(sheet);
        continue;
      }
      seenSheets.add(sheet);
      sheetsGrew = true;
      varUse = scanVarUse(rules, new Map());
      gateCopies = doc === document;
      /* a sheet limited by its media attribute keeps that limit */
      const head = mediaPrelude(sheet.media && sheet.media.mediaText);
      try { harvest(rules, head ? [head] : [], out); } catch (e) { /* keep going */ }
      varUse = null;
      gateCopies = false;
    }
    harvestRoot = null;
    return out.join('\n');
  }

  const pendingRemote = new Set();
  /* set whenever a stylesheet of the page's is read; recheckScrims() spends it */
  let sheetsGrew = false;

  /* Constructed sheets (adoptedStyleSheets: Lit and Fidelity's Providence
     components), which styleSheets does not list. The theme's own carry
     __fdm (set in content.js) and are skipped. One constructed sheet is shared
     by every instance of a component, and each instance's shadow root needs
     its own copy of the recoloured rules: the text is harvested once per
     sheet and handed to each root once. */
  let adoptedText = new WeakMap();     // CSSStyleSheet -> recoloured css
  let adoptedInto = new WeakMap();     // ShadowRoot -> WeakSet of sheets copied there
  function processAdopted(root_) {
    const out = [];
    let list;
    try { list = root_.adoptedStyleSheets || []; } catch (e) { return ''; }
    let done = adoptedInto.get(root_);
    if (!done) { done = new WeakSet(); adoptedInto.set(root_, done); }
    harvestRoot = root_;
    for (const sheet of list) {
      if (!sheet || sheet.__fdm || done.has(sheet)) continue;
      done.add(sheet);
      let css = adoptedText.get(sheet);
      if (css === undefined) {
        css = '';
        let rules = null;
        try { rules = sheet.cssRules; } catch (e) { rules = null; }
        if (rules) {
          const part = [];
          varUse = scanVarUse(rules, new Map());
          try { harvest(rules, [], part); } catch (e) { /* keep going */ }
          varUse = null;
          css = part.join('\n');
        }
        adoptedText.set(sheet, css);
      }
      if (css) out.push(css);
    }
    harvestRoot = null;
    return out.join('\n');
  }

  /** Parse and recolor a cross-origin sheet's text (fetched by the worker). */
  function processText(cssText, baseUrl) {
    const out = [];
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      sheetsGrew = true;
      varUse = scanVarUse(sheet.cssRules, new Map());
      textBase = baseUrl || null;
      gateCopies = true;
      harvest(sheet.cssRules, [], out);
    } catch (e) { return ''; }
    finally { varUse = null; textBase = null; gateCopies = false; }
    return out.join('\n');
  }

  /* --- inline writes ----------------------------------------------------- */
  /* The ledger: original inline values and attributes, so revert() can put
     them back when the theme is switched off or the page printed (inline
     writes cannot be scoped to @media screen; see content.js). */
  let inlineOriginals = new WeakMap();
  let attrOriginals = new WeakMap();
  /* A Set, not a WeakSet, because revert() has to enumerate it. Every
     writeStyle()/writeAttr() adds its element (inline colours, chart marks,
     icons, scrims, placeholders), and only revert() empties it. */
  let inlineTouched = new Set();
  /* On a single-page app elements come and go. Once the set is large, the
     ones no longer in a document are dropped. */
  let pruneAt = 4000;
  function touch(el) {
    inlineTouched.add(el);
    if (inlineTouched.size < pruneAt) return;
    for (const e of inlineTouched) if (!e.isConnected) inlineTouched.delete(e);
    pruneAt = inlineTouched.size + 4000;
  }
  /* Bumped by revert(). Async work (icon and image rewrites, scrims) notes the
     epoch it started in and writes nothing if it has changed since. */
  let epoch = 0;

  /* All inline writes go through writeStyle/writeAttr, which record the
     original for revert(). border-color expands to its four sides so each
     property has one ledger entry. */
  const BORDER_SIDES = ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];

  /** Set an inline declaration, remembering what was there. */
  function writeStyle(el, prop, value, priority) {
    if (!el || !el.style) return;
    if (prop === 'border-color') {
      for (const side of BORDER_SIDES) writeStyle(el, side, value, priority);
      return;
    }
    let saved = inlineOriginals.get(el);
    if (!saved) { saved = {}; inlineOriginals.set(el, saved); }
    const current = el.style.getPropertyValue(prop);
    /* If the page has rewritten the property since the last write here, its
       new value is the one to hand back on revert. */
    if (!(prop in saved) || ('written' in saved[prop] && current !== saved[prop].written)) {
      saved[prop] = { value: current, priority: el.style.getPropertyPriority(prop) };
    }
    touch(el);
    try { el.style.setProperty(prop, value, priority === undefined ? '' : priority); }
    catch (e) { return; }
    /* Record the read-back form: '#6FD25C' reads back as 'rgb(111, 210, 92)',
       so comparing the requested string never matches and the pass would
       re-map its own output. */
    saved[prop].written = el.style.getPropertyValue(prop) || value;
  }

  /** Set a presentation attribute or src, remembering what was there. */
  function writeAttr(el, attr, value) {
    if (!el || !el.setAttribute) return;
    let saved = attrOriginals.get(el);
    if (!saved) { saved = {}; attrOriginals.set(el, saved); }
    if (!(attr in saved)) saved[attr] = el.getAttribute(attr);
    touch(el);
    try { el.setAttribute(attr, value); } catch (e) { /* ignore */ }
  }

  /** Undo a writeStyle(): put the original back (or remove the property). */
  function clearStyle(el, prop) {
    if (!el || !el.style) return;
    if (prop === 'border-color') { for (const side of BORDER_SIDES) clearStyle(el, side); return; }
    const saved = inlineOriginals.get(el);
    try {
      if (saved && prop in saved && saved[prop].value) {
        el.style.setProperty(prop, saved[prop].value, saved[prop].priority);
      } else {
        el.style.removeProperty(prop);
      }
    } catch (e) { /* ignore */ }
    if (saved && prop in saved) delete saved[prop].written;
  }

  /* --- chart marks ------------------------------------------------------- */
  /* Chart keys and marks belong to recolorChartMarks(); the inline pass leaves
     their paint alone. MARK_SELECTOR is built from SWATCH_SELECTOR so the two
     cannot drift. */
  const SWATCH_SELECTOR = [
    '.legend-symbol',
    '[class*="legend"] [class*="symbol"]',
    '[class*="legend"] [class*="swatch"]',
    '[class*="legend-item"] [class*="color"]',
    '[class*="chart-legend"] [class*="color"]',
    '[class*="legend-symbol"]',
    /* Highcharts' HTML legend dot: a classless div with an inline background
       (the Performance chart's gain and loss key) */
    '.highcharts-legend-item [style*="background"]'
  ].join(',');

  /* A ChartIQ key (cq-swatch, the ACE chart's .ace-color) is painted inline
     in the series colour its canvas draws with, and keeps it. */
  const MARK_SELECTOR = '.highcharts-root,.highcharts-container,cq-swatch,.ace-chart .ace-color,' + SWATCH_SELECTOR;

  /* Keys known only by shape: tooltip rows and key lists mark a series with a
     small box (a dot, a square, the retirement analysis's 12x2 bar for a line)
     whose class says only "color", "shape" or "dot". These selectors only
     nominate; isKeyShape() decides by size and content. */
  const KEY_SELECTOR = [
    '.highcharts-tooltip-container [class*="color"]',
    '.highcharts-tooltip-container [style*="color"]',
    '.highcharts-tooltip [class*="color"]',
    '.highcharts-tooltip [style*="color"]',
    '.highcharts-tooltip tspan[style*="fill"]',
    '[class*="chart-legend"] [class*="shape"]',
    '[class*="legend"] [class*="marker"]',
    '[class*="legend"] [class*="dot"]',
    /* the summary's Asset allocation key: a 12px span.legend-item-block */
    '[class*="legend"] [class*="block"]',
    /* the Distributions chart's 10px span.box, in a legend.chartLegend */
    '[class*="legend" i] [class*="box" i]:not([class*="check" i])'
  ].join(',');
  const KEY_GLYPH = /^[\u25A0-\u25FF\u2022\u2B24\u2B1B\u2014\u2015\u2500\u2501]$/;

  function isKeyShape(el) {
    if (!el || el.childElementCount) return false;
    const t = (el.textContent || '').trim();
    if (t && !KEY_GLYPH.test(t)) return false;
    let w = 0, h = 0;
    try { const b = el.getBoundingClientRect(); w = b.width; h = b.height; } catch (e) { return false; }
    /* A tooltip row can be built before it is shown; the declared size is
       still there to read. */
    if (!w || !h) {
      const cs = getComputedStyle(el);
      w = parseFloat(cs.width) || 0; h = parseFloat(cs.height) || 0;
    }
    return w > 0 && h > 0 && w <= 24 && h <= 24;
  }

  function isKey(el) {
    try {
      if (!el.matches || !el.matches(KEY_SELECTOR)) return false;
      return isKeyShape(el);
    } catch (e) { return false; }
  }

  function isChartMark(el) {
    if (!el || !el.closest) return false;
    try { return !!el.closest(MARK_SELECTOR) || isKey(el); } catch (e) { return false; }
  }

  /** A tiny, round, dark, achromatic shape inside a control: a drawn dot. */
  function isInkDot(el, value) {
    const c = parseColor(value);
    if (!c || c.a < 0.9) return false;
    if (relLum(c) > 0.35) return false;
    const [, sat] = rgbToHsl(c.r, c.g, c.b);
    if (sat > 0.25) return false;
    const cs = getComputedStyle(el);
    let box;
    try { box = el.getBoundingClientRect(); } catch (e) { return false; }
    let w = box.width, h = box.height;
    /* No layout box yet (the chat panel builds its dots while closed): use
       the declared size. */
    if (!w || !h) { w = parseFloat(cs.width) || 0; h = parseFloat(cs.height) || 0; }
    if (!w || !h || w > 12 || h > 12) return false;
    const radius = cs.borderTopLeftRadius;
    const r = parseFloat(radius) || 0;
    const round = /%/.test(radius) ? r >= 40 : r >= Math.min(w, h) / 2 - 0.5;
    if (!round) return false;
    try { return !!el.closest('button, a, [role="button"], [class*="button"], [class*="btn"], [class*="icon"]'); }
    catch (e) { return false; }
  }

  /* An empty box filled inline is a mark: a legend tile, a bar, the percentile
     pointer. Nothing sits on it that has to stay legible, so it keeps its hue
     the way chart marks do (mapCategorical, as the canvas charts it keys are
     drawn), where the surface map would sink a navy key into the card. A
     colour that small is a mark anywhere; a grey, or a box as long as a bar,
     only where a chart or key names it. A box 3px thin or less is a rule and
     maps as a line, except a coloured one in a chart. */
  const MARK_CONTEXT = '[class*="legend" i], [class*="chart" i], [class*="graph" i], [class*="meter" i], [class*="gauge" i], [class*="indicator" i], [class*="progress" i], [class*="swatch" i]';
  let boxMarks = new WeakSet();
  function boxMark(el, value) {
    const c = parseColor(value);
    if (!c || c.a === 0) return null;
    if (el.childElementCount || (el.textContent || '').trim()) return null;
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml' || /^(?:IMG|CANVAS|VIDEO|INPUT|BUTTON|SELECT|TEXTAREA|IFRAME)$/.test(el.tagName)) return null;
    let w = 0, h = 0;
    try { const b = el.getBoundingClientRect(); w = b.width; h = b.height; } catch (e) { return null; }
    const cs = getComputedStyle(el);
    /* Not laid out (a panel not yet shown, like Geographic Exposure behind
       its tab): only a size given in px is known. */
    if (!w || !h) { w = pxOf(cs.width); h = pxOf(cs.height); }
    const sized = w > 0 && h > 0 && w < Infinity && h < Infinity;
    if (sized && Math.min(w, h) > 32) return null;
    /* a picture makes it an icon; under the boot veil only an inline one shows */
    const veiled = document.documentElement.classList.contains('fdm-boot');
    if ((veiled ? el.style.backgroundImage || 'none' : cs.backgroundImage) !== 'none') return null;
    const grey = rgbToOklch(c.r, c.g, c.b)[1] < 0.03;
    let named = false;
    try { named = !!el.closest(MARK_CONTEXT); } catch (e) { named = false; }
    /* a rule: a grey this thin anywhere, or a colour outside a chart (inside
       one, a 2px box is a line series' key) */
    const rule = sized && Math.min(w, h) <= 3 && (grey || !named);
    if (!rule && !named && (grey || !sized || w > 24 || h > 24)) return null;
    const hex = toHex(c.r, c.g, c.b);
    const out = parseColor(rule ? mapColor(hex, 'border', null) : mapCategorical(hex));
    if (!out) return null;
    const v = c.a >= 0.995 ? toHex(out.r, out.g, out.b) : 'rgba(' + out.r + ', ' + out.g + ', ' + out.b + ', ' + +c.a.toFixed(3) + ')';
    return { value: v, line: rule };
  }

  /* The track a bar fills (the exposure bars' #eee) maps onto the card like
     any near-white and vanishes, which loses how much of the scale is left.
     A box the fill sits in, its height and at least its width, painted the
     colour behind it, takes the holdings ring's track colour. */
  let tracks = new WeakSet();
  let tracksLater = [];
  function showTrack(fill) {
    const t = fill.parentElement;
    if (!t || tracks.has(t)) return;
    /* under the boot veil every surface reads clear: recolorChartMarks()
       comes back for it once the veil is up */
    if (document.documentElement.classList.contains('fdm-boot')) { tracksLater.push(fill); return; }
    tracks.add(t);
    let fb, tb;
    try { fb = fill.getBoundingClientRect(); tb = t.getBoundingClientRect(); } catch (e) { return; }
    const tcs = getComputedStyle(t);
    if (tb.width && tb.height) {
      if (tb.width + 0.5 < fb.width || tb.height > 32 || Math.abs(tb.height - fb.height) > 4) return;
    } else if (!(pxOf(tcs.height) <= 32)) return;      // not shown yet: its declared height
    const own = parseColor(tcs.backgroundColor);
    if (!own || own.a < 0.5 || !t.parentElement) return;
    const under = effectiveBg(t.parentElement);
    if (Math.abs(own.r - under.r) + Math.abs(own.g - under.g) + Math.abs(own.b - under.b) > 6) return;
    writeStyle(t, 'background-color', P.surf4, 'important');
  }

  /** Recolor an element's inline style attribute in place. */
  function processInline(el) {
    const style = el.style;
    if (!style || !style.length) return;
    const mark = isChartMark(el);
    /* the quote pages' progress ring, drawn in CSS: see 'ring' in compute() */
    const ring = !mark && !!(el.closest && el.closest('donut, .donut-chart'));
    for (let i = style.length - 1; i >= 0; i--) {
      const prop = style[i];
      const role = roleOf(prop);
      if (!role || role === 'var') continue;
      /* In a chart mark only the paint is off limits (border colours too:
         paintKey() draws a swatch's border in its series colour). A data
         label's `color` still has to be legible, and the chart mapper does not
         set one. */
      if (mark && /^(?:fill|stroke|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left))?-color|border)$/.test(prop)) continue;
      /* ...and a key drawn as a glyph is painted with `color`: the "●" at the
         head of a tooltip row is the series colour, not ink to be made legible. */
      if (mark && prop === 'color' && KEY_GLYPH.test((el.textContent || '').trim())) continue;
      const value = style.getPropertyValue(prop);
      /* An inline picture beat every stylesheet in light mode; it is made
         !important now that copied resets (button { background-image: none })
         are, or they would erase an avatar or icon the page set by hand. */
      if (prop === 'background-image' && value && /url\(/i.test(value) && !/gradient\(/i.test(value)) {
        if (!style.getPropertyPriority(prop)) writeStyle(el, prop, value, 'important');
        continue;
      }
      COLOR_RE.lastIndex = 0;
      if (!value || !COLOR_RE.test(withoutVarNames(withoutUrls(value)))) { COLOR_RE.lastIndex = 0; continue; }
      COLOR_RE.lastIndex = 0;
      /* Skip a value this engine wrote: the observer re-runs this pass when a
         style attribute changes, and the map is not idempotent. `written` is
         the read-back form (see writeStyle). */
      let saved = inlineOriginals.get(el);
      if (saved && saved[prop] && saved[prop].written === value) continue;

      /* !important, as chart keys are: a mark's own fill beat the class rule
         under it in light mode (the exposure bars' `background-color: gray`),
         and that rule's copy is !important now. */
      if (!ring && prop === 'background-color') {
        const m = boxMark(el, value);
        if (m) {
          boxMarks.add(el);
          /* a rule is no mark, and 02-structure.css still draws named dividers */
          writeStyle(el, prop, m.value, m.line ? style.getPropertyPriority(prop) : 'important');
          if (!m.line) showTrack(el);
          continue;
        }
      }

      /* A small dark dot inside a control is ink drawn with background-color
         (the chat panel's menu button is four 6px dots), so it maps as 'fg'. */
      let asRole = (role === 'bg' || role === 'border') && isInkDot(el, value) ? 'fg' : role;
      if (ring && role === 'bg') asRole = 'ring';
      let next = rewriteValue(value, asRole, null);
      if (next === null) continue;

      /* A section-sized fill mapped to the button green would be a lime slab,
         so it takes Fidelity's surface-fixed-background (#044014 in both
         modes) instead. Bands set by stylesheets are handled in 06-fds.css. */
      if (role === 'bg' && /^background(-color)?$/.test(prop)) {
        const low = String(next).toLowerCase();
        if (low === P.btn.toLowerCase() || low === P.btnHov.toLowerCase() || low === P.btnAct.toLowerCase()) {
          const box = el.getBoundingClientRect();
          if (box.width >= 600 && box.height >= 100) next = '#044014';
        }
      }

      /* Near-white ink on the element's own coloured fill. Fidelity's dark
         mode puts dark ink on light fills (accent-primary-foreground goes
         #ffffff -> #141414), which a stylesheet rule cannot see. Of white,
         P.textInv and the mapped value, the one that contrasts best with the
         fill is written; the mapped value wins a tie. */
      if (role === 'fg' && /^color$/.test(prop)) {
        const src = parseColor(value);
        if (src && src.a > 0.9 && relLum(src) > 0.85) {
          const own = parseColor(getComputedStyle(el).backgroundColor);
          if (own && own.a > 0.85) {
            const [, ownSat] = rgbToHsl(own.r, own.g, own.b);
            if (ownSat > 0.25) {
              const cands = ['#FFFFFF', P.textInv, next];
              let best = next, bestC = contrast(parseColor(next), own);
              for (const c of cands) { const cc = contrast(parseColor(c), own); if (cc > bestC + 0.01) { best = c; bestC = cc; } }
              next = best;
            }
          }
        }
      }
      writeStyle(el, prop, next, style.getPropertyPriority(prop));
    }
  }

  /** Put every rewritten inline value back. */
  function restoreInline() {
    for (const el of inlineTouched) {
      const saved = inlineOriginals.get(el);
      if (saved) {
        for (const prop in saved) {
          /* only where the written value is still in place: anything the page
             wrote since is its own */
          if ('written' in saved[prop] && el.style.getPropertyValue(prop) !== saved[prop].written) continue;
          if (saved[prop].value) el.style.setProperty(prop, saved[prop].value, saved[prop].priority);
          else el.style.removeProperty(prop);
        }
      }
      const attrs = attrOriginals.get(el);
      if (attrs) {
        for (const a in attrs) {
          if (attrs[a] === null) el.removeAttribute(a);
          else el.setAttribute(a, attrs[a]);
        }
      }
    }
  }

  /* Forget every verdict, so the next pass measures the page afresh. */
  function resetGuards(keepSheets) {
    enforced = new WeakSet();
    enforcedProp = new WeakMap();
    pointSource = new WeakMap();
    swatchSource = new WeakMap();
    keyLineSource = new WeakMap();
    familyMap = new Map();
    familyGen++;
    iconFixed = new WeakMap();
    iconHue = new WeakSet();
    placeheld = new WeakSet();
    boxMarks = new WeakSet();
    tracks = new WeakSet();
    tracksLater = [];
    chartTracks = new WeakSet();
    imagedEls = new WeakSet();
    writtenSrc = new WeakMap();
    pictureSource = new WeakMap();
    backgroundPictures = new Set();
    if (!keepSheets) { seenSheets = new WeakSet(); adoptedText = new WeakMap(); adoptedInto = new WeakMap(); }
    symbolsDone = new WeakSet();
    pageChecked = new WeakSet();
    scrimChecked = new WeakMap();
    scrimmed.clear();
    textured = new WeakMap();
    texturedEls.clear();
    textureRejected = new WeakSet();
    solidRejected = new WeakSet();
    spinPlated = new WeakSet();
    filtered = new WeakMap();
  }

  /* --- revert ------------------------------------------------------------ */
  /* Hand the page back: restore every inline write, drop data-fdm-inline and
     forget all state, so turning the theme on again is an ordinary first pass.
     keepSheets (printing) keeps the record of sheets already read, because
     their emitted rules stay in place. */
  function revert(keepSheets) {
    epoch++;
    stopSizeWatch();
    restoreInline();
    for (const el of inlineTouched) {
      try {
        if (el.getAttribute && el.getAttribute('style') === '') el.removeAttribute('style');
      } catch (e) { /* ignore */ }
    }
    /* Swept over the whole document: content.js tags every element the
       inline pass looks at, written to or not. */
    try {
      for (const el of document.querySelectorAll('[data-fdm-inline]')) el.removeAttribute('data-fdm-inline');
    } catch (e) { /* ignore */ }
    /* ChartIQ's ThemeHelper copies .chartContainer's computed background
       inline when the chart is built. Built under the theme it is dark and
       would outlive the theme, so a dark inline background there is removed. */
    try {
      for (const el of document.querySelectorAll('.chartContainer')) {
        const c = parseColor(el.style.getPropertyValue('background-color'));
        if (c && c.a > 0.5 && relLum(c) < 0.2) el.style.removeProperty('background-color');
      }
    } catch (e) { /* ignore */ }
    for (const el of aceThemed) { try { el.classList.remove(ACE_THEME); } catch (e) { /* ignore */ } }
    /* and any container the set let go of that came back */
    try {
      for (const el of document.querySelectorAll('.' + ACE_THEME)) el.classList.remove(ACE_THEME);
    } catch (e) { /* ignore */ }
    aceThemed = new Set();
    inlineOriginals = new WeakMap();
    attrOriginals = new WeakMap();
    inlineTouched = new Set();
    pruneAt = 4000;
    resetGuards(keepSheets);
  }

  /* --- contrast backstop ------------------------------------------------- */
  /* Static CSS cannot know what text finally sits on (hover states, which rule
     won, an ancestor's fill). enforceContrast() reads the computed colours,
     composites translucent backdrops, and repaints only text under 4.5:1 (3:1
     when large). */

  let enforced = new WeakSet();
  let enforcedProp = new WeakMap();

  function composite(fg, bg) {
    return {
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1
    };
  }

  /* The backdrop colour: translucent backgrounds up the tree, composited over
     the canvas. With `info`, info.picture is also set to the first element on
     the way (up to the first opaque colour) with a url() background of at
     least 300x100: a picture paints over its own element's colour. */
  /* While enforceContrast runs it sets bgMemo: every element visited keeps
     its backdrop (and the nearest picture over it), so the next text node's
     climb stops at the first remembered ancestor. The pass writes only ink
     after reading, so a remembered backdrop holds for the length of the pass.
     Only climbs that look for pictures (info given) use it, so an answer
     remembered without a picture check is never handed to one. */
  let bgMemo = null;
  function effectiveBg(el, info) {
    const memo = info ? bgMemo : null;
    const layers = [];
    const visited = [];
    let cur = el;
    let known = null;
    while (cur && cur.nodeType === 1) {
      known = memo && memo.get(cur);
      if (known) {
        if (!info.picture && known.picture) info.picture = known.picture;
        break;
      }
      const cs = getComputedStyle(cur);
      let picture = null;
      /* a memoised climb checks every element, since each one's entry must
         say whether it is a picture itself */
      if (info && (memo || !info.picture)) {
        const bi = cs.backgroundImage;
        if (bi && bi !== 'none' && bi.indexOf('url(') !== -1 && cur.nodeName !== 'svg' && !cur.ownerSVGElement) {
          const r = cur.getBoundingClientRect();
          if (r.width >= 300 && r.height >= 100) { picture = cur; if (!info.picture) info.picture = cur; }
        }
      }
      const c = parseColor(cs.backgroundColor);
      const paints = !!(c && c.a > 0.004);
      if (memo) visited.push({ el: cur, c: paints ? c : null, picture });
      if (paints) { layers.push(c); if (c.a >= 0.999) break; }
      // SVG children paint no background: climb on into the HTML behind them
      cur = cur.parentElement || (cur.ownerSVGElement && cur.ownerSVGElement.parentElement);
    }
    let acc = known ? known.acc : parseColor(P.canvas);
    if (memo) {
      /* remember each visited element's own backdrop, top down */
      let pic = known ? known.picture : null;
      for (let i = visited.length - 1; i >= 0; i--) {
        const v = visited[i];
        if (v.c) acc = composite(v.c, acc);
        if (v.picture) pic = v.picture;
        memo.set(v.el, { acc, picture: pic });
      }
      return acc;
    }
    for (let i = layers.length - 1; i >= 0; i--) acc = composite(layers[i], acc);
    return acc;
  }

  /* Coloured ink that fails contrast takes the palette accent nearest its hue
     when there is one: liftToContrast() keeps the hue but washes out the
     saturation. */
  function accents() {
    return [P.gain, P.loss, P.link, P.warn, P.info, P.visited, P.greenTxt,
            P.chartTxt.domestic, P.chartTxt.foreign, P.chartTxt.other];
  }

  function snapToAccent(ink, against, need) {
    const [h] = rgbToHsl(ink.r, ink.g, ink.b);
    let best = null, bestDist = Infinity;
    for (const a of accents()) {
      const c = parseColor(a);
      if (!c || contrast(c, against) < need) continue;
      const [ah] = rgbToHsl(c.r, c.g, c.b);
      let d = Math.abs(ah - h); if (d > 0.5) d = 1 - d;
      if (d < bestDist) { bestDist = d; best = a; }
    }
    // a near hue only (0.09 is about 32 degrees); otherwise the caller lifts
    return bestDist <= 0.09 ? best : null;
  }

  /** Step a colour's lightness, hue kept, until it clears `need` (else null). */
  function liftToContrast(c, against, need) {
    const [h, sat, l0] = rgbToHsl(c.r, c.g, c.b);
    let best = null, bestCr = contrast(c, against);
    for (let step = 1; step <= 30; step++) {
      for (const dir of [1, -1]) {
        const cand = hsl(h, sat, clamp(l0 + dir * step * 0.03, 0.05, 0.97));
        const cr = contrast(parseColor(cand), against);
        if (cr > bestCr) { bestCr = cr; best = cand; }
        if (cr >= need) return cand;
      }
    }
    return null;
  }

  /* --- icon contrast ----------------------------------------------------- */
  /* WCAG asks 3:1 of meaningful graphics. A coloured shape in a small inline
     SVG (32px or less) that falls short, like the account rail's 6px #7C33AC
     change triangle (2:1 on the card), is lifted along its hue. Disabled
     controls, charts, logos, brand marks and avatars are skipped. */
  let iconFixed = new WeakMap();   // shape -> { prop, attr when fixed }

  /* 03-components.css gives icons secondary ink, which would also grey an
     icon whose wrapper the page colours on purpose (the quote page's orange
     rating stars, its green search icon). Such an icon follows its wrapper
     again, except where the theme makes icons ink whatever their context. */
  const ICON_INK = 'button svg, [class*="icon-only"] svg, [class*="-icon"] svg';
  const ICON_INK_FIXED = 'header, [class*="card-header"], .nav-utility-container, .card-tooltip-icons, [class*="expand-collapse"], [class*="button--tertiary"]';
  let iconHue = new WeakSet();
  function keepIconHue(svg) {
    const parent = svg.parentElement;
    if (!parent || iconHue.has(svg)) return;
    try { if (!svg.matches(ICON_INK) || svg.closest(ICON_INK_FIXED)) return; } catch (e) { return; }
    const c = parseColor(getComputedStyle(parent).color);
    if (!c || c.a < 0.5 || rgbToOklch(c.r, c.g, c.b)[1] < 0.06) return;
    iconHue.add(svg);
    writeStyle(svg, 'color', 'inherit', 'important');
  }

  function enforceIconContrast(scope) {
    const root_ = scope || document;
    let svgs;
    try { svgs = root_.querySelectorAll('svg'); } catch (e) { return 0; }
    let n = 0;
    for (const svg of svgs) {
      keepIconHue(svg);
      const box = svg.getBoundingClientRect();
      if (!box.width || box.width > 32 || box.height > 32) continue;
      if (isChartMark(svg)) continue;
      try {
        if (svg.closest(':disabled, [aria-disabled="true"], [class*="logo"], [class*="brand"], [class*="avatar"]')) continue;
      } catch (e) { continue; }
      const shapes = [...svg.querySelectorAll('path, circle, rect, ellipse, polygon, polyline, line')]
        .filter(sh => !sh.closest('defs, symbol, mask, clipPath, pattern, marker'));
      if (!shapes.length) continue;
      const page = (() => { try { return effectiveBg(svg.parentElement || svg); } catch (e) { return parseColor(P.surf1); } })();
      const filled = [];   // earlier shapes, with what they paint
      for (const sh of shapes) {
        const cs = getComputedStyle(sh);
        const r = sh.getBoundingClientRect();
        const fill = cs.fill !== 'none' ? parseColor(cs.fill) : null;
        const fillOpacity = Number(cs.fillOpacity) * Number(cs.opacity);
        /* What lies under this shape: the nearest earlier filled shape that
           holds it, else the page. */
        let under = page;
        for (let i = filled.length - 1; i >= 0; i--) {
          const f = filled[i];
          if (r.left >= f.r.left - 0.5 && r.top >= f.r.top - 0.5 && r.right <= f.r.right + 0.5 && r.bottom <= f.r.bottom + 0.5) { under = f.c; break; }
        }
        /* A fixed shape keeps its fix while its paint attribute is unchanged;
           if the page repaints it (the day's up/down indicator), the fix comes
           off and it is measured again. */
        let fresh = true;
        const seen = iconFixed.get(sh);
        if (seen) {
          if (sh.getAttribute(seen.prop) === seen.attr) fresh = false;
          else { clearStyle(sh, seen.prop); iconFixed.delete(sh); }
        }
        for (const prop of (fresh ? ['fill', 'stroke'] : [])) {
          const v = getComputedStyle(sh)[prop];
          if (!v || v === 'none' || v.indexOf('url(') !== -1) continue;
          const c = parseColor(v);
          if (!c || c.a < 0.5) continue;
          if (prop === 'stroke' && (parseFloat(cs.strokeWidth) || 0) <= 0) continue;
          const [, sat] = rgbToHsl(c.r, c.g, c.b);
          if (sat < 0.25) continue;                     // greys are the map's job
          if (contrast(c, under) >= 3) continue;
          const lifted = liftToContrast(c, under, 3);
          if (!lifted) continue;
          iconFixed.set(sh, { prop, attr: sh.getAttribute(prop) });
          writeStyle(sh, prop, lifted, 'important');
          n++;
          break;
        }
        if (fill && fill.a > 0.5 && fillOpacity > 0.5 && r.width > 0) {
          const now = parseColor(getComputedStyle(sh).fill) || fill;
          filled.push({ r, c: now });
        }
      }
    }
    return n;
  }

  function enforceContrast(scope) {
    const host = scope || document.body;
    if (!host) return 0;
    /* backdrops are remembered for the length of this pass (see effectiveBg) */
    bgMemo = new Map();
    try {
      return enforceContrastIn(host);
    } finally {
      bgMemo = null;
    }
  }

  function enforceContrastIn(host) {
    let fixed = 0;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      if (!text || text.trim().length < 2) continue;
      const el = node.parentElement;
      if (!el) continue;

      /* A repaired element is re-judged: its fix comes off and the pair is
         measured again, since a verdict reached before a route's stylesheet
         arrived would otherwise stick. */
      if (enforced.has(el)) {
        const prev = enforcedProp.get(el);
        if (prev) clearStyle(el, prev);
        enforced.delete(el);
      }

      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (Number(cs.opacity) < 0.15) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) continue;

      /* Disabled controls are exempt from WCAG contrast and must keep looking
         disabled (the screener's unavailable Compare Funds button). */
      try {
        if (el.closest(':disabled, [aria-disabled="true"], button.disabled, .disabled-btn, [class~="disabled"]:is(button, a, [role="button"], [class*="button"], [class*="btn"])')) continue;
      } catch (e) { /* older engines: no :is() */ }

      /* SVG text is painted by fill, not color. Highcharts text is left to
         05-charts.css; other SVG text has its fill repaired here. */
      const inSvg = el.ownerSVGElement != null;
      if (inSvg && el.closest('.highcharts-root')) continue;
      const paintProp = inSvg ? 'fill' : 'color';
      const fg = parseColor(inSvg ? cs.fill : cs.color);
      if (!fg || fg.a === 0) continue;
      /* Text over a background picture (the homepage hero) is skipped, since
         the colour under the picture says nothing; once the scrim pass has
         darkened it (data-fdm-scrim), the text is judged against the canvas. */
      const info = {};
      let bg = effectiveBg(el, info);
      if (info.picture) {
        if (!info.picture.hasAttribute('data-fdm-scrim')) continue;
        bg = parseColor(P.canvas);
      }
      const ink = fg.a < 0.999 ? composite(fg, bg) : fg;

      const px = parseFloat(cs.fontSize) || 16;
      const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      const need = large ? 3 : 4.5;

      /* Only repaired elements are remembered. Passing ones are measured again
         on every pass, since a later route bundle can change the pair. */
      if (contrast(ink, bg) >= need) continue;
      enforced.add(el);
      enforcedProp.set(el, paintProp);

      /* Keep the hue when it is carrying information; otherwise take whichever
         end of the ramp reads against this backdrop. */
      const [, sat] = rgbToHsl(ink.r, ink.g, ink.b);
      let next = sat > 0.22 ? (snapToAccent(ink, bg, need) || liftToContrast(ink, bg, need)) : null;
      if (!next) {
        /* the palette's ink if it reads, else whichever of light and dark ink reads better */
        const light = contrast(parseColor(P.text), bg);
        next = light >= need || light >= contrast(parseColor(P.textInv), bg) ? P.text : P.textInv;
      }
      writeStyle(el, paintProp, next, 'important');
      fixed++;
      if (fixed > 600) break;   // a runaway page is not worth stalling for
    }
    return fixed;
  }

  /* --- icons delivered as images ----------------------------------------- */
  /* Much of Fidelity's chrome (sidebar collapse, print, download, masthead
     icons) is a background-image or <img> drawn black for a white page, which
     no colour map reaches. Each picture is measured on a small canvas
     (classifyImage) and gets a filter or an edited copy. */

  /* Picture work is cached by URL (and the surface it was done for). On a
     long session those caches would grow with every symbol and route seen,
     and a chart picture's entry is a full-size PNG, so each keeps the most
     recent entries only, oldest out first. */
  function remember(map, key, value, max) {
    if (map.size >= max) {
      for (const k of map.keys()) {
        if (map.size < max) break;
        map.delete(k);
      }
    }
    map.set(key, value);
  }

  const imageVerdicts = new Map();   // url|surface|ink -> Promise<filter|null>
  const svgRewrites = new Map();     // url|ink|surface -> Promise<dataUri|''|null>
  let imagedEls = new WeakSet();
  /* img -> the src this engine wrote, to tell its writes from the page's */
  let writtenSrc = new WeakMap();
  /* element -> the page's background picture its edit or filter was made for,
     and the set of those elements (a Set, so a class flip on an ancestor can
     find the pictures under it; pruned of detached elements as it is read) */
  let pictureSource = new WeakMap();
  let backgroundPictures = new Set();

  /* Called by content.js's observer when an <img>'s src changes. If the page
     made the change (the classic Performance view swaps its sort arrow's src
     on every click), the old picture's verdict is dropped so the next pass
     edits the new one. Returns whether the change was the page's. */
  function pictureChanged(el) {
    if (!el || el.tagName !== 'IMG') return false;
    const src = el.getAttribute('src') || '';
    if (writtenSrc.get(el) === src) return false;
    writtenSrc.delete(el);
    if (!imagedEls.has(el)) return true;
    imagedEls.delete(el);
    if (filtered.has(el)) { filtered.delete(el); clearStyle(el, 'filter'); }
    /* The page's new src is now the original, so revert() must not undo it;
       the next writeAttr() records it. */
    const saved = attrOriginals.get(el);
    if (saved && 'src' in saved) delete saved.src;
    return true;
  }

  /* Called by content.js's observer when class attributes change. A
     background picture can be swapped by a class (the customer service page's
     send arrow is a pale circle until the field has text, when `.active`
     brings a filled one), and the edited copy written inline would otherwise
     outlive the state it was made for. Each picture under a changed element
     is read with this engine's own copy lifted, in one batch, and one that is
     no longer the picture it was edited for is forgotten and cleared, so the
     light pass that follows edits the new one. Returns those elements.
     Pictures the page never swaps cost one lookup per class change. */
  function picturesChanged(targets) {
    const cands = new Set();
    for (const t of targets) {
      if (!t || t.nodeType !== 1) continue;
      /* The root element's class is this engine's own switch (readLight
         flips fdm-off on it several times a pass); a page's icon is never
         swapped by a class on <html>. */
      if (t === document.documentElement) continue;
      if (imagedEls.has(t) && pictureSource.has(t)) cands.add(t);
      if (!t.firstElementChild) continue;
      /* pictures that have left the page are shed first, so a long session
         cannot fill the set with them */
      if (backgroundPictures.size > 600) {
        for (const el of backgroundPictures) if (!el.isConnected) backgroundPictures.delete(el);
        if (backgroundPictures.size > 600) continue;
      }
      for (const el of backgroundPictures) {
        if (!el.isConnected) { backgroundPictures.delete(el); continue; }
        if (el !== t && t.contains(el)) cands.add(el);
      }
    }
    if (!cands.size) return [];
    /* Lift every copy first, then read, then put them back: one style
       recalculation for the batch rather than one per picture. A copy is
       lifted to what the page had written inline before it (recorded by
       writeStyle), not to nothing, or a picture the page itself set inline
       would read as gone. */
    const lifted = new Map();        // el -> [value, priority] of this engine's copy
    for (const el of cands) {
      const saved = inlineOriginals.get(el);
      const rec = saved && saved['background-image'];
      if (!rec || !('written' in rec)) continue;
      const cur = el.style.getPropertyValue('background-image');
      if (cur !== rec.written) continue;              // the page's own since; left alone
      lifted.set(el, [cur, el.style.getPropertyPriority('background-image')]);
      try {
        if (rec.value) el.style.setProperty('background-image', rec.value, rec.priority || '');
        else el.style.removeProperty('background-image');
      } catch (e) { /* ignore */ }
    }
    const changed = [];
    for (const el of cands) {
      let now = '';
      try { now = getComputedStyle(el).backgroundImage || ''; } catch (e) { continue; }
      const url = now.indexOf('url(') === -1 ? null : urlOf(URL_RE.exec(now));
      if (url === pictureSource.get(el)) continue;
      changed.push(el);
    }
    for (const [el, [cur, pri]] of lifted) {
      try { el.style.setProperty('background-image', cur, pri); } catch (e) { /* ignore */ }
    }
    for (const el of changed) {
      imagedEls.delete(el);
      pictureSource.delete(el);
      backgroundPictures.delete(el);
      if (filtered.has(el)) { filtered.delete(el); clearStyle(el, 'filter'); }
      if (lifted.has(el)) clearStyle(el, 'background-image');
    }
    return changed;
  }

  /* A picture with no box yet (in a hidden panel: the classic Performance
     view renders its balance table hidden and shows it by flipping a class,
     which the observer does not see) is watched with a ResizeObserver and
     edited once it has a size. */
  let sizeWatch = null;
  let waitingForSize = new WeakSet();
  function watchForSize(el) {
    if (waitingForSize.has(el) || typeof ResizeObserver === 'undefined') return;
    if (!sizeWatch) {
      sizeWatch = new ResizeObserver(entries => {
        const shown = [];
        for (const en of entries) {
          const t = en.target;
          const r = t.getBoundingClientRect();
          if (!t.isConnected) { sizeWatch.unobserve(t); waitingForSize.delete(t); continue; }
          if (r.width && r.height) { sizeWatch.unobserve(t); waitingForSize.delete(t); shown.push(t); }
        }
        for (const t of shown) {
          try { recolorIconImages(t.parentElement || t); } catch (e) { /* non-fatal */ }
        }
      });
    }
    waitingForSize.add(el);
    try { sizeWatch.observe(el); } catch (e) { waitingForSize.delete(el); }
  }
  function stopSizeWatch() {
    if (sizeWatch) { try { sizeWatch.disconnect(); } catch (e) { /* ignore */ } }
    sizeWatch = null;
    waitingForSize = new WeakSet();
  }

  /* --- SVG icon sources -------------------------------------------------- */
  /* An SVG that can be read (same-origin, or a data: URI) is edited as text by
     rewriteSvgText() rather than filtered: on Morningstar's star strip a filter
     turns the white plate black and drags the gold to brown. The edit drops
     white plates, keeps brand colours that read and lifts near-black to ink. */

  function isNearWhiteHex(hex) {
    const c = parseColor(hex);
    if (!c) return false;
    return c.r > 226 && c.g > 226 && c.b > 226;
  }
  function isNearBlackHex(hex) {
    const c = parseColor(hex);
    if (!c) return false;
    const [, sat, l] = rgbToHsl(c.r, c.g, c.b);
    return sat < 0.18 && l < 0.34;
  }

  /* Elements rewriteSvgText() gives ink when no fill is set on or above them:
     SVG's initial fill is black, and Fidelity's sort arrows set none. */
  const SHAPES = 'path|circle|ellipse|rect|polygon|polyline|line|g|use';

  /* Fidelity's media-ideogram token pairs, light value -> dark value. */
  const IDEOGRAM = {
    '#d4f3cf': '#044014', '#044014': '#d4f3cf',   // green disc / green drawing
    '#edfaeb': '#044014',
    '#daebff': '#132454', '#132454': '#daebff',   // blue
    '#1d3986': '#8cc1fd',
    '#fff0d4': '#7f330f', '#7f330f': '#ffc371',   // warm
    '#ffe0e0': '#861616', '#861616': '#ff9f9f'    // red
  };

  /* svgLayers(): where the last non-white shape is drawn (lastOther), and the
     ranges of non-paint containers such as mask and clipPath, where white
     means "show". White is a plate only under something painted later (white
     drawn last is artwork, like the prospect header's Customer Support icon);
     rewriteSvgText() uses lastOther for that test when a shape has no box. */
  const SVG_TAG = /<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const SHAPE_NAMES = /^(?:path|circle|ellipse|rect|polygon|polyline|line|text)$/i;
  const LEAF_NAMES = /^(?:path|circle|ellipse|rect|polygon|polyline|line|stop|use|image)$/i;
  const NONPAINT_NAMES = /^(?:mask|clippath|pattern|marker|lineargradient|radialgradient|filter)$/i;

  function ownPaint(attrs, name) {
    const a = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(["\'])([^"\']*)\\1', 'i').exec(attrs);
    if (a) return a[2];
    const s = /(?:^|\s)style\s*=\s*(["'])([^"']*)\1/i.exec(attrs);
    if (s) {
      const d = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)', 'i').exec(s[2]);
      if (d) return d[1].trim();
    }
    return null;
  }

  function paintClass(v) {
    if (v === null || v === undefined) return null;
    const t = String(v).trim().toLowerCase();
    if (!t || t === 'inherit') return null;
    if (t === 'none' || t === 'transparent') return 'none';
    if (t.indexOf('url(') === 0 || t === 'currentcolor' || t.indexOf('__fdm-') === 0) return 'other';
    const c = parseColor(t);
    if (!c) return 'other';
    if (c.a <= 0.05) return 'none';
    return isNearWhiteHex(t) ? 'white' : 'other';
  }

  function svgLayers(text) {
    const stack = [];
    const nonPaint = [];
    let lastOther = -1;
    let m;
    SVG_TAG.lastIndex = 0;
    while ((m = SVG_TAG.exec(text))) {
      const name = m[2].toLowerCase();
      if (m[1] === '/') {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].name !== name) continue;
          if (stack[i].nonPaint) nonPaint.push([stack[i].at, m.index + m[0].length]);
          stack.length = i;
          break;
        }
        continue;
      }
      const attrs = m[3] || '';
      const own = { fill: paintClass(ownPaint(attrs, 'fill')), stroke: paintClass(ownPaint(attrs, 'stroke')) };
      const inside = stack.some(s => s.nonPaint) || NONPAINT_NAMES.test(name);
      if (SHAPE_NAMES.test(name) && !inside) {
        let f = own.fill, s = own.stroke;
        for (let i = stack.length - 1; i >= 0 && (!f || !s); i--) {
          if (!f && stack[i].fill) f = stack[i].fill;
          if (!s && stack[i].stroke) s = stack[i].stroke;
        }
        if (!f) f = 'other';                // SVG's initial fill is black
        if (f === 'other' || s === 'other') lastOther = m.index;
      }
      if (m[4] !== '/' && !LEAF_NAMES.test(name)) {
        stack.push({ name, fill: own.fill, stroke: own.stroke, nonPaint: NONPAINT_NAMES.test(name), at: m.index });
      }
    }
    return { lastOther, nonPaint };
  }

  /* --- what a mark sits on ------------------------------------------------ */
  /* Shapes get boxes in the picture's coordinates (transforms followed), so
     a mark is judged against the filled shape it lies in, not the page (the
     dark "$" on the transfer page's green coin), and white is a plate only
     when something non-white is painted over it, not merely after it. */
  const IDENT = [1, 0, 0, 1, 0, 0];
  const mulM = (A, B) => [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]
  ];
  const SVG_NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

  function attrOf(attrs, name) {
    const a = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(["\'])([^"\']*)\\1').exec(attrs);
    return a ? a[2] : null;
  }

  function parseTransform(str) {
    let M = IDENT;
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
    let m, any = false;
    while ((m = re.exec(str))) {
      any = true;
      const n = (m[2].match(SVG_NUM) || []).map(Number);
      let T;
      switch (m[1].toLowerCase()) {
        case 'matrix': if (n.length < 6) return null; T = n.slice(0, 6); break;
        case 'translate': T = [1, 0, 0, 1, n[0] || 0, n[1] || 0]; break;
        case 'scale': T = [n.length ? n[0] : 1, 0, 0, n.length > 1 ? n[1] : (n.length ? n[0] : 1), 0, 0]; break;
        case 'rotate': {
          const r = (n[0] || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
          const cx = n[1] || 0, cy = n[2] || 0;
          T = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
          break;
        }
        case 'skewx': T = [1, 0, Math.tan((n[0] || 0) * Math.PI / 180), 1, 0, 0]; break;
        case 'skewy': T = [1, Math.tan((n[0] || 0) * Math.PI / 180), 0, 1, 0, 0]; break;
        default: return null;
      }
      M = mulM(M, T);
    }
    return any || !str.trim() ? M : null;
  }

  const grow = (b, x, y) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  const EMPTY_BOX = [Infinity, Infinity, -Infinity, -Infinity];

  /* Bezier control points and an arc's whole ellipse are counted, so the box
     can come out too large but never too small. */
  function pathBox(d) {
    const toks = [];
    const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
    let t;
    while ((t = re.exec(d))) toks.push(t[1] ? t[1] : Number(t[2]));
    const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
    let b = EMPTY_BOX, x = 0, y = 0, sx = 0, sy = 0, cmd = null, i = 0;
    while (i < toks.length) {
      if (typeof toks[i] === 'string') cmd = toks[i++];
      else if (!cmd) return null;
      const C = cmd.toUpperCase();
      const rel = cmd !== C;
      if (C === 'Z') { x = sx; y = sy; cmd = null; continue; }
      const n = ARGS[C];
      if (!n) return null;
      const a = toks.slice(i, i + n);
      if (a.length < n || a.some(v => typeof v !== 'number')) return null;
      i += n;
      const X = v => (rel ? x + v : v), Y = v => (rel ? y + v : v);
      if (C === 'M' || C === 'L' || C === 'T') {
        x = X(a[0]); y = Y(a[1]); b = grow(b, x, y);
        if (C === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
      } else if (C === 'H') { x = X(a[0]); b = grow(b, x, y); }
      else if (C === 'V') { y = Y(a[0]); b = grow(b, x, y); }
      else if (C === 'C') {
        b = grow(grow(b, X(a[0]), Y(a[1])), X(a[2]), Y(a[3]));
        x = X(a[4]); y = Y(a[5]); b = grow(b, x, y);
      } else if (C === 'S' || C === 'Q') {
        b = grow(b, X(a[0]), Y(a[1]));
        x = X(a[2]); y = Y(a[3]); b = grow(b, x, y);
      } else if (C === 'A') {
        const x2 = X(a[5]), y2 = Y(a[6]);
        let rx = Math.abs(a[0]), ry = Math.abs(a[1]);
        const phi = a[2] * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
        b = grow(grow(b, x, y), x2, y2);
        if (rx && ry) {
          const dx = (x - x2) / 2, dy = (y - y2) / 2;
          const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
          const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
          if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
          const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
          const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
          const co = (a[3] !== a[4] ? 1 : -1) * Math.sqrt(Math.max(0, den ? num / den : 0));
          const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
          const cx = cp * cxp - sp * cyp + (x + x2) / 2, cy = sp * cxp + cp * cyp + (y + y2) / 2;
          const hx = Math.sqrt(rx * rx * cp * cp + ry * ry * sp * sp);
          const hy = Math.sqrt(rx * rx * sp * sp + ry * ry * cp * cp);
          b = grow(grow(b, cx - hx, cy - hy), cx + hx, cy + hy);
        }
        x = x2; y = y2;
      }
    }
    return b[0] <= b[2] ? b : null;
  }

  function shapeBox(name, attrs) {
    const n = k => { const v = attrOf(attrs, k); if (v === null || /%/.test(v)) return v === null ? 0 : NaN; return parseFloat(v); };
    const ok = (...v) => v.every(Number.isFinite);
    switch (name) {
      case 'rect': { const x = n('x'), y = n('y'), w = n('width'), h = n('height'); return ok(x, y, w, h) && w > 0 && h > 0 ? [x, y, x + w, y + h] : null; }
      case 'circle': { const cx = n('cx'), cy = n('cy'), r = n('r'); return ok(cx, cy, r) && r > 0 ? [cx - r, cy - r, cx + r, cy + r] : null; }
      case 'ellipse': { const cx = n('cx'), cy = n('cy'), rx = n('rx'), ry = n('ry'); return ok(cx, cy, rx, ry) && rx > 0 && ry > 0 ? [cx - rx, cy - ry, cx + rx, cy + ry] : null; }
      case 'line': { const x1 = n('x1'), y1 = n('y1'), x2 = n('x2'), y2 = n('y2'); return ok(x1, y1, x2, y2) ? [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)] : null; }
      case 'polyline': case 'polygon': {
        const p = (attrOf(attrs, 'points') || '').match(SVG_NUM);
        if (!p || p.length < 4) return null;
        let b = EMPTY_BOX;
        for (let i = 0; i + 1 < p.length; i += 2) b = grow(b, +p[i], +p[i + 1]);
        return b;
      }
      case 'path': return pathBox(attrOf(attrs, 'd') || '');
    }
    return null;
  }

  function xformBox(b, M) {
    let o = EMPTY_BOX;
    for (const [x, y] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]) {
      o = grow(o, M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]);
    }
    return o;
  }

  /* Painted shapes in drawing order, each with its resolved fill (SVG's
     initial black if none) and its box in root coordinates, or null when a
     transform or size cannot be read. */
  function svgShapes(text) {
    const list = [];
    const byAt = new Map();
    const stack = [];
    let bare = 0;
    let m;
    SVG_TAG.lastIndex = 0;
    while ((m = SVG_TAG.exec(text))) {
      const name = m[2].toLowerCase();
      if (m[1] === '/') {
        for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].name === name) { stack.length = i; break; } }
        continue;
      }
      const attrs = m[3] || '';
      const top = stack.length ? stack[stack.length - 1] : null;
      let M = top ? top.M : IDENT;
      if (M && name === 'svg' && top) M = null;          // a nested viewport is not followed
      const tf = attrOf(attrs, 'transform');
      if (M && tf !== null) { const T = parseTransform(tf); M = T ? mulM(M, T) : null; }
      const hidden = !!(top && top.hidden) || /^(?:defs|symbol|mask|clippath|pattern|marker|lineargradient|radialgradient|filter)$/.test(name);
      const ownFill = ownPaint(attrs, 'fill'), ownStroke = ownPaint(attrs, 'stroke');
      /* no fill up its tree, outside masks and clip paths, rendered or not:
         the shapes rewriteSvgText's default fill is for */
      if (SHAPE_NAMES.test(name) && ownFill === null && !stack.some(t => t.fill !== null || /^(?:mask|clippath)$/.test(t.name))) bare++;
      if (SHAPE_NAMES.test(name) && !hidden) {
        let fill = ownFill, stroke = ownStroke;
        for (let i = stack.length - 1; i >= 0 && (fill === null || stroke === null); i--) {
          if (fill === null) fill = stack[i].fill;
          if (stroke === null) stroke = stack[i].stroke;
        }
        const local = M ? shapeBox(name, attrs) : null;
        const rec = {
          at: m.index, idx: list.length, name,
          fill: fill === null ? '#000000' : fill,
          paints: paintClass(fill === null ? '#000000' : fill) === 'other' || paintClass(stroke) === 'other',
          box: local ? xformBox(local, M) : null
        };
        list.push(rec);
        byAt.set(m.index, rec);
      }
      if (m[4] !== '/' && !LEAF_NAMES.test(name)) stack.push({ name, M, fill: ownFill, stroke: ownStroke, hidden });
    }
    return { list, byAt, bare };
  }

  function rewriteSvgText(text, ink, surface, hole) {
    if (!text || text.length > 120000 || text.indexOf('<svg') === -1) return null;
    /* SVGs the theme draws itself (06-fds.css marks them data-fdm) are
       already dark; the pale-grey rule below would dim their ink. */
    if (/<svg\b[^>]*\sdata-fdm=/.test(text)) return null;
    let changed = false;
    const INK = ink || P.text2;
    const SURF = parseColor(P.surf1);
    /* the colour the picture sits on, where the caller knows it */
    const UNDER_HEX = surface || P.surf1;
    /* A colour that maps, as a surface, to exactly what the picture sits on
       was one surface with it in light mode (the transfer tracker's check
       disc is the green of its ring), so it takes that colour. */
    const mergesWithSurface = v => {
      if (!surface) return false;
      const m = String(mapColor(v, 'bg') || '').toLowerCase();
      return m === String(UNDER_HEX).toLowerCase() && m !== String(v).toLowerCase();
    };

    /* A white fill with a stroke is drawn, not a plate. Over something it is
       a knob (the Trade panel's Help-mode toggle) and takes ink; over nothing
       it is a hole, page with a line round it (`.uxd-tooltip-pointer`, an
       empty radio), and takes HOLE_HEX with an EXACT.border outline. */
    const geo0 = svgShapes(text);
    const boxesMeet = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    const drawnOver = (rec, g) => {
      for (let j = rec.idx - 1; j >= 0; j--) {
        const o = g.list[j];
        if (paintClass(o.fill) === 'none' && !o.paints) continue;
        if (!o.box || !rec.box || boxesMeet(o.box, rec.box)) return true;
      }
      return false;
    };
    /* The same hole with its paint set once on the root: the tooltip pointer
       puts fill='white' stroke='#999' on <svg> itself. */
    const rootOpen = (text.match(/<svg\b(?:[^>"']|"[^"]*"|'[^']*')*>/i) || [])[0] || '';
    const rootAttrs = rootOpen.slice(4, -1);
    const rootFill = ownPaint(rootAttrs, 'fill');
    const rootStroke = ownPaint(rootAttrs, 'stroke');
    const rootHole = !!rootFill && isNearWhiteHex(rootFill.trim().toLowerCase()) &&
      paintClass(rootStroke) === 'other' && geo0.list.length > 0 &&
      geo0.list.every(r => ownPaint(text.slice(r.at, text.indexOf('>', r.at)), 'fill') === null && !drawnOver(r, geo0));
    let holeArt = rootHole;
    text = text.replace(/<(path|circle|rect|ellipse|polygon)\b[^>]*>/gi, (tag, _name, offset) => {
      const fill = (tag.match(/\bfill\s*=\s*["']([^"']*)["']/i) || [])[1];
      const stroke = (tag.match(/\bstroke\s*=\s*["']([^"']*)["']/i) || [])[1];
      if (fill && stroke && stroke.trim().toLowerCase() !== 'none' && isNearWhiteHex(fill.trim().toLowerCase())) {
        const rec0 = geo0.byAt.get(offset);
        const hole = !!rec0 && paintClass(stroke) === 'other' && !drawnOver(rec0, geo0);
        if (hole) holeArt = true;
        return tag.replace(/\bfill\s*=\s*(["'])[^"']*\1/i, hole ? 'fill="__fdm-hole__"' : 'fill="__fdm-knob__"');
      }
      return tag;
    });
    /* A hole takes what white takes as a surface, not what lies under it:
       the tooltip pointer must match its bubble, not the page below. */
    const HOLE_HEX = hole || EXACT.bg['#ffffff'] || P.surf1;
    const holeLine = v => {
      const c = parseColor(v);
      if (!c || c.a < 0.98) return null;
      return EXACT.border[toHex(c.r, c.g, c.b).toLowerCase()] || null;
    };

    /* Any value, named colours included (Morningstar's plate is fill="white"),
       in either quote: a data: URI inside CSS url("...") single-quotes them. */
    const ATTR = /(fill|stroke)\s*=\s*(["'])([^"']*)\2/g;
    const layers = svgLayers(text);
    const geo = svgShapes(text);
    const inNonPaint = at => layers.nonPaint.some(r => at >= r[0] && at < r[1]);

    const tints = [];
    text.replace(ATTR, (m, prop, quote, val) => {
      const c = parseColor(val.trim());
      if (c && c.a > 0.5) {
        const [L, C, H] = rgbToOklch(c.r, c.g, c.b);
        if (C > 0.04) tints.push({ L, H });
      }
      return m;
    });
    const hueNear = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d) < 0.45; };

    /* A pale tint means "empty" on white (Morningstar's #FFE166 unfilled
       stars beside #DBB000) and would outshine the filled ones here, so it is
       dimmed when the file also holds a deeper shade of its hue; alone, it may
       be Fidelity's #FFCD00 accent. A pale grey is always dimmed. */
    const chromaticFor = (v) => {
      const c = parseColor(v);
      if (!c || c.a <= 0.5) return null;
      /* A link or info blue under 4.5:1 on the card takes the ink the text
         tables give it, so an icon matches the links beside it (the classic
         Performance page's #0E67A9 "?" marks). */
      const ui = EXACT.fg[toHex(c.r, c.g, c.b)];
      if (ui && (ui === P.link || ui === P.linkHov || ui === P.info) && contrast(c, SURF) < 4.5) return ui;
      const [L, C, H] = rgbToOklch(c.r, c.g, c.b);
      if (L > 0.85 && (C <= 0.04 || tints.some(t => t.L < L - 0.06 && hueNear(t.H, H)))) return P.borderStr;
      /* Any other colour is kept as drawn, so a brand colour stays
         recognizable, unless it is under 3:1 on the card. */
      if (contrast(c, SURF) < 3) return liftToContrast(c, SURF, 3) || null;
      return null;
    };

    /* A white shape is a plate when something non-white is painted over it;
       without a box, when anything non-white is drawn after it. */
    const isPlate = (rec) => {
      if (!rec || !rec.box) return rec ? rec.at < layers.lastOther : false;
      for (let j = rec.idx + 1; j < geo.list.length; j++) {
        const o = geo.list[j];
        if (o.paints && (!o.box || boxesMeet(rec.box, o.box))) return true;
      }
      return false;
    };
    /* The colour a shape's fill becomes, or null when it paints nothing. */
    const finalFill = (rec) => {
      const v = String(rec.fill).trim().toLowerCase();
      if (paintClass(v) === 'none' || v.indexOf('url(') === 0) return null;
      if (v === 'currentcolor') return parseColor(INK);
      if (IDEOGRAM[v]) return parseColor(IDEOGRAM[v]);
      if (v === '__fdm-knob__') return parseColor(P.text);
      if (v === '__fdm-hole__') return parseColor(HOLE_HEX);
      if (rootHole && isNearWhiteHex(v)) return parseColor(HOLE_HEX);
      if (isNearWhiteHex(v)) return isPlate(rec) ? null : parseColor(v);
      if (isNearBlackHex(v)) return parseColor(INK);
      const c = parseColor(v);
      if (!c || c.a <= 0.5) return null;
      if (mergesWithSurface(v)) return parseColor(UNDER_HEX);
      const next = chromaticFor(v);
      return next ? parseColor(next) : c;
    };
    const TOL = 0.5;
    const within = (a, b) => a[0] >= b[0] - TOL && a[1] >= b[1] - TOL && a[2] <= b[2] + TOL && a[3] <= b[3] + TOL;
    /* The final fill of the nearest earlier filled shape whose box holds this
       one. Outlines and plates are skipped, and so is black under a dark mark:
       that is a ring drawn as a filled shape, with the mark in its hole. */
    const under = (rec, darkMark) => {
      if (!rec || !rec.box) return null;
      for (let i = rec.idx - 1; i >= 0; i--) {
        const c = geo.list[i];
        if (!c.box || !within(rec.box, c.box)) continue;
        const v = String(c.fill).trim().toLowerCase();
        if (paintClass(v) === 'none') continue;
        if (darkMark && isNearBlackHex(v)) continue;
        const F = finalFill(c);
        if (F) return F;
      }
      return null;
    };

    /* A keyline: a stroke no wider than 1 unit (and 5% of the drawing) on a
       shape whose own fill is a colour, not a grey. */
    const vb = /viewBox\s*=\s*["']\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)/i.exec(rootOpen);
    const VB = vb ? Math.max(+vb[1], +vb[2]) || 24 : 24;
    const isKeyline = (rec, tagStart) => {
      if (!rec) return false;
      const f = parseColor(String(rec.fill).trim());
      if (!f || f.a < 0.5 || rgbToOklch(f.r, f.g, f.b)[1] <= 0.04) return false;
      const sw = parseFloat(ownPaint(text.slice(tagStart, text.indexOf('>', tagStart)), 'stroke-width') || '1');
      return sw > 0 && sw <= 1 && sw / VB <= 0.05;
    };

    const rootAt = text.search(/<svg\b/i);
    let out = text.replace(ATTR, (m, prop, quote, val, offset) => {
      const v = val.trim().toLowerCase();
      if (v === 'none' || v === 'currentcolor' || v.indexOf('url(') === 0) return m;
      /* 'transparent' parses as black with no alpha and would be lifted to
         ink as a dark mark (the classic Performance page's "?" sits on a
         transparent disc). */
      if (paintClass(v) === 'none') return m;
      /* A mask's or a clip path's paint is geometry, not colour. */
      if (inNonPaint(offset)) return m;
      const q = (val_) => prop + '=' + quote + val_ + quote;
      const tagStart = text.lastIndexOf('<', offset);
      const rec = geo.byAt.get(tagStart) || null;

      if (v === '__fdm-hole__') { changed = true; return q(HOLE_HEX); }
      if (rootHole && tagStart === rootAt) {
        if (prop === 'fill') { changed = true; return q(HOLE_HEX); }
        const line = holeLine(v);
        if (line) { changed = true; return q(line); }
      }
      if (prop === 'stroke' && holeArt && /__fdm-hole__/.test(text.slice(tagStart, text.indexOf('>', tagStart)))) {
        const line = holeLine(v);
        if (line) { changed = true; return q(line); }
      }

      /* Ideogram colours take Fidelity's own media-ideogram dark tokens (disc
         and drawing swap, #d4f3cf -> #044014) before any heuristic below. */
      if (IDEOGRAM[v]) { changed = true; return q(IDEOGRAM[v]); }
      if (v === '__fdm-knob__') { changed = true; return q(P.text); }

      /* White. A plate (a white shape with paint over it) goes. White that is
         the artwork stays, unless what it sits on has turned light; then it
         becomes the canvas colour. */
      if (isNearWhiteHex(v)) {
        if (!rec) {
          /* a group or the root (white there is only a default for children),
             or a shape in <defs> or a <symbol>, which has no box: a plate if
             anything non-white is drawn after it */
          const tagName = ((/^<([a-zA-Z][\w:.-]*)/.exec(text.slice(tagStart, tagStart + 40)) || [])[1] || '').toLowerCase();
          if (prop !== 'fill' || !SHAPE_NAMES.test(tagName) || tagStart >= layers.lastOther) return m;
          changed = true;
          return q('none');
        }
        if (prop === 'fill' && isPlate(rec)) { changed = true; return q('none'); }
        /* A white outline on a filled shape stands for the page (the gaps
           between the retirement gauge's segments), so it takes the colour
           the picture sits on. */
        if (prop === 'stroke') {
          const own = String(rec.fill).trim().toLowerCase();
          if (paintClass(own) !== 'none' && own.indexOf('url(') !== 0 && !isNearWhiteHex(own)) {
            changed = true;
            return q(UNDER_HEX);
          }
        }
        const F = under(rec, false);
        if (F && contrast(parseColor(v), F) < 3) { changed = true; return q(P.canvas); }
        return m;
      }

      /* A thin dark outline round a coloured shape is a keyline that keeps it
         off white (the extended-hours moon and sun). Here it takes the shape's
         own colour; as ink it would draw a light halo round it. */
      if (prop === 'stroke' && isNearBlackHex(v) && isKeyline(rec, tagStart)) {
        const F = finalFill(rec);
        if (F) { changed = true; return q(toHex(F.r, F.g, F.b)); }
      }

      /* A dark mark is lifted to ink, unless it still reads (3:1) on the
         shape it is drawn on. */
      if (isNearBlackHex(v)) {
        const F = under(rec, true);
        if (F && contrast(parseColor(v), F) >= 3) return m;
        changed = true;
        return q(INK);
      }

      if (mergesWithSurface(v)) { changed = true; return q(UNDER_HEX); }
      const next = chromaticFor(v);
      if (next) { changed = true; return q(next); }
      return m;
    });

    /* SVG's initial fill is black, so shapes with no fill on themselves or
       any ancestor (a fill="none" group counts: the tracker's check is a
       polyline in one) get ink from a :where() rule, which any style the file
       brings outranks. currentColor resolves against the image's black root. */
    const rootTag = out.match(/<svg\b[^>]*>/i);
    if (rootTag) {
      const tag = rootTag[0];
      const rootFill = (tag.match(/\bfill\s*=\s*["']([^"']*)["']/i) || [])[1];
      const rules = [];
      if (/currentcolor/i.test(out)) rules.push('svg{color:' + INK + '}');
      if (!rootFill && geo.bare) {
        rules.push(':where(' + SHAPES.split('|').join(',') + ',text)' +
          ':where(:not([fill]):not([style*="fill"]):not([fill] *):not([style*="fill"] *):not(mask *):not(clipPath *))' +
          '{fill:' + INK + '}');
      }
      if (rules.length) {
        out = out.replace(tag, tag + '<style>' + rules.join('') + '</style>');
        changed = true;
      }
    }
    return changed ? out : null;
  }

  const DATA_SVG = /^data:image\/svg\+xml(;[^,]*)?,/i;
  /* Where a black logo lands: white, as the app draws its wordmark. */
  const LOGO_INK = 1;
  /* Research data providers whose wordmarks the quote pages show as pictures.
     Keep in step with the chip rule in 06-fds.css. */
  const PROVIDER_MARK = /morningstar|lipper|zacks|argus|refinitiv|factset|cfra|ned davis|trefis|jefferies|barchart|recognia|trading central|wall street horizon|starmine|value ?line|first ?call/i;

  function rewriteSvgDataUri(uri, ink, surface, hole) {
    const m = DATA_SVG.exec(uri);
    if (!m) return null;
    const meta = m[1] || '';
    const body = uri.slice(m[0].length);
    let text;
    try {
      text = /base64/i.test(meta) ? atob(body) : decodeURIComponent(body);
    } catch (e) {
      try { text = unescape(body); } catch (e2) { return null; }
    }
    const out = rewriteSvgText(text, ink, surface, hole);
    return out ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out) : null;
  }

  /* The service worker (background.js) can fetch what the page cannot: an SVG
     on assets.fidelity.com without CORS headers, like the planning ideograms. */
  function fetchViaWorker(url) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type: 'fdm:fetchSvg', url }, res => {
          void chrome.runtime.lastError;
          resolve(res && res.text ? res.text : null);
        });
      } catch (e) { resolve(null); }
    });
  }

  /** An https URL on a Fidelity host or the quote pages' research provider
      (fidelity.wallst.com and its subdomains). Keep in step with isFidelityUrl
      in background.js; test/audit.js checks the two agree. */
  function isFidelityUrl(u) {
    try {
      const x = new URL(u, location.href);
      return x.protocol === 'https:' && /(^|\.)fidelity(rewards)?\.com$|(^|\.)fidelity\.wallst\.com$/.test(x.hostname);
    } catch (e) { return false; }
  }

  /* Every raster the engine reads is drawn on a canvas, which the browser
     allows only for a picture loaded with CORS. A host that sends no CORS
     headers (the research provider's GIF icons) fails that load, so the
     worker is asked for the bytes (it fetches Fidelity's hosts only, see
     background.js) and the picture is loaded again from a data: URL of its
     own. One ask per address; the image's own onload and onerror are kept. */
  const workerImages = new Map();     // url -> Promise<dataUrl|null>
  function fetchImageViaWorker(url) {
    if (workerImages.has(url)) return workerImages.get(url);
    const p = new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type: 'fdm:fetchImage', url }, res => {
          void chrome.runtime.lastError;
          resolve(res && res.data ? res.data : null);
        });
      } catch (e) { resolve(null); }
    });
    remember(workerImages, url, p, 120);
    return p;
  }
  function loadRaster(img, url) {
    img.crossOrigin = 'anonymous';
    if (!/^https?:/i.test(url) || typeof chrome === 'undefined' || !chrome.runtime) { img.src = url; return; }
    const onerror = img.onerror;
    img.onerror = () => {
      img.onerror = onerror;
      fetchImageViaWorker(url).then(data => {
        if (data) img.src = data;
        else if (onerror) onerror();
      });
    };
    img.src = url;
  }

  function rewriteSvgSprite(url, ink, surface, hole) {
    const key = url + '|' + (ink || '') + '|' + (surface || '') + '|' + (hole || '');
    if (svgRewrites.has(key)) return svgRewrites.get(key);
    const p = fetch(url, { credentials: 'omit' })
      .then(r => (r.ok ? r.text() : null))
      .catch(() => null)
      .then(text => text || (isFidelityUrl(url) ? fetchViaWorker(url) : null))
      .then(text => {
        if (!text || text.length > 120000 || text.indexOf('<svg') === -1) return null;
        const out = rewriteSvgText(text, ink, surface, hole);
        /* '' = read and unchanged: a verdict, so the caller does not fall
           back to the raster filter */
        return out ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out) : '';
      })
      .catch(() => null);
    remember(svgRewrites, key, p, 400);
    return p;
  }

  /* The surface behind an image as a mean sRGB level 0..1 (CSS contrast()
     and brightness() act on channels, not luminance), rounded to 1/50 to keep
     the verdict cache small. */
  function surfaceLevel(el) {
    let bg = null;
    try { bg = effectiveBg(el); } catch (e) { bg = null; }
    if (!bg) bg = parseColor(P.surf1);
    return Math.round(((bg.r + bg.g + bg.b) / 3 / 255) * 50) / 50;
  }

  /* --- a raster with a white plate baked in ------------------------------- */
  /* A filter cannot drop a white plate without wrecking the colours (the
     Fund Picks medal on fund research), so a readable raster is edited: the
     near-white region connected to its edge becomes transparent, and white
     inside the artwork stays. */
  const unplated = new Map();        // url|surface -> Promise<dataUri|null>
  /* url -> { w, h } of an unplated picture with no see-through pixel, so
     whatever the element painted under it never showed */
  const solidPlates = new Map();

  function unplateRaster(url, surface) {
    const key = url + '|' + (surface === undefined ? '' : surface);
    if (unplated.has(key)) return unplated.get(key);
    const p = new Promise(resolve => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h || w > 160 || h > 160) return resolve(null);
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, w, h);
          const d = id.data;
          let solid = true;
          for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { solid = false; break; }
          /* How white a pixel is: its darkest channel, if it is opaque and
             near-neutral; 0 for anything coloured or see-through. */
          const whiteness = k => {
            const i = k * 4;
            if (d[i + 3] < 200) return 0;
            const mn = Math.min(d[i], d[i + 1], d[i + 2]);
            const mx = Math.max(d[i], d[i + 1], d[i + 2]);
            return mx - mn > 24 ? 0 : mn;
          };
          let border = 0, white = 0;
          const tally = k => { border++; if (whiteness(k) > 235) white++; };
          for (let x = 0; x < w; x++) { tally(x); if (h > 1) tally((h - 1) * w + x); }
          for (let y = 1; y < h - 1; y++) { tally(y * w); if (w > 1) tally(y * w + w - 1); }
          /* A plate is 60% or more of the border, or all four corners: the
             screener's 14px "?" disc touches every edge, and the Share icon is
             a blue square rounded by one white pixel per corner. */
          const cornerWhite = k => whiteness(k) > 235;
          const corners = cornerWhite(0) && cornerWhite(w - 1) &&
            cornerWhite((h - 1) * w) && cornerWhite(h * w - 1);
          if (!border || (!corners && white / border < 0.6)) return resolve(null);

          const seen = new Uint8Array(w * h);
          const stack = [];
          const push = (x, y) => {
            if (x < 0 || y < 0 || x >= w || y >= h) return;
            const k = y * w + x;
            if (seen[k] || whiteness(k) <= 200) return;
            seen[k] = 1; stack.push(k);
          };
          for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
          for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
          while (stack.length) {
            const k = stack.pop();
            const x = k % w, y = (k - x) / w;
            push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
          }
          /* Line art (85% of inked pixels touch white) has page enclosed in
             its outlines too, out of the flood's reach (the "Calculators &
             Tools Overview" arrow), so all its white goes. Solid shapes keep
             their knockouts (the Share icon's white plus). */
          const pale = k => whiteness(k) > 200;
          let inked = 0, inkEdge = 0;
          for (let k = 0; k < w * h; k++) {
            if (d[k * 4 + 3] < 200 || seen[k] || pale(k)) continue;
            inked++;
            const x = k % w, y = (k - x) / w;
            if ((x > 0 && pale(k - 1)) || (x < w - 1 && pale(k + 1)) ||
                (y > 0 && pale(k - w)) || (y < h - 1 && pale(k + w))) inkEdge++;
          }
          const lineArt = inked >= 6 && inkEdge / inked >= 0.85;
          if (lineArt) for (let k = 0; k < w * h; k++) if (!seen[k] && pale(k)) seen[k] = 1;
          let cleared = 0;
          for (let k = 0; k < w * h; k++) {
            if (!seen[k]) continue;
            const v = whiteness(k);
            /* pure white goes entirely; paler pixels at the edge keep part of
               their alpha, so the edge is not a hard cut */
            const alpha = v >= 245 ? 0 : Math.round(255 * (245 - v) / 45);
            d[k * 4 + 3] = Math.min(d[k * 4 + 3], alpha);
            cleared++;
          }
          if (!cleared) return resolve(null);
          /* The artwork's edge was anti-aliased against the white, so each
             pixel touching the cleared plate is un-blended from white: the
             white share becomes transparency and the colour left is restored
             to full strength. */
          const nearPlate = k => {
            const x = k % w, y = (k - x) / w;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h && seen[ny * w + nx]) return true;
              }
            }
            return false;
          };
          for (let k = 0; k < w * h; k++) {
            if (seen[k] || !nearPlate(k)) continue;
            const i = k * 4;
            const a = Math.max(255 - d[i], 255 - d[i + 1], 255 - d[i + 2]) / 255;
            if (a >= 1) continue;
            if (a <= 0) { d[i + 3] = 0; continue; }
            for (let c = 0; c < 3; c++) d[i + c] = Math.round(clamp(255 - (255 - d[i + c]) / a, 0, 255));
            d[i + 3] = Math.round(d[i + 3] * a);
          }
          /* Line art drawn dark for white (the arrow's #0055CC) is lifted
             along its hue to 4.5:1 on the surface; solid shapes keep their
             colour. */
          if (lineArt && surface !== undefined) {
            const sv = Math.round(surface * 255);
            const sc = { r: sv, g: sv, b: sv, a: 1 };
            const lifts = new Map();
            for (let k = 0; k < w * h; k++) {
              const i = k * 4;
              if (!d[i + 3]) continue;
              const ck = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
              let c = lifts.get(ck);
              if (c === undefined) {
                const src = { r: d[i], g: d[i + 1], b: d[i + 2], a: 1 };
                const hexd = contrast(src, sc) >= 4.5 ? null : liftToContrast(src, sc, 4.5);
                c = hexd ? parseColor(hexd) : null;
                lifts.set(ck, c);
              }
              if (c) { d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b; }
            }
          }
          ctx.putImageData(id, 0, 0);
          if (solid) remember(solidPlates, url, { w, h }, 300);
          resolve(cv.toDataURL('image/png'));
        } catch (e) {
          resolve(null);                         // tainted: leave it be
        }
      };
      loadRaster(img, url);
    });
    remember(unplated, key, p, 300);
    return p;
  }

  /* A grey drawing on an opaque white plate, read at full size: the
     classifier's 24px thumbnail averages a 1px chevron into the plate.
     Returns how far the dark core sits from white (0..1), or null. */
  function platedGrey(img) {
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h || w > 200 || h > 200) return null;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, w, h).data;
      const plateAt = k => {
        const i = k * 4;
        if (d[i + 3] < 200) return false;
        const mn = Math.min(d[i], d[i + 1], d[i + 2]), mx = Math.max(d[i], d[i + 1], d[i + 2]);
        return mn > 235 && mx - mn <= 24;
      };
      let border = 0, white = 0;
      const tally = k => { border++; if (plateAt(k)) white++; };
      for (let x = 0; x < w; x++) { tally(x); if (h > 1) tally((h - 1) * w + x); }
      for (let y = 1; y < h - 1; y++) { tally(y * w); if (w > 1) tally(y * w + w - 1); }
      if (!border || white / border < 0.6) return null;
      let drawn = 0, chromatic = 0, coreN = 0, coreSum = 0;
      for (let k = 0; k < w * h; k++) {
        const i = k * 4;
        if (d[i + 3] < 24 || plateAt(k)) continue;
        drawn++;
        if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 28) chromatic++;
        const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        if (l < 110) { coreN++; coreSum += l; }
      }
      if (!drawn || chromatic / drawn > 0.03) return null;
      if (coreN < Math.max(3, w * h * 0.004)) return null;
      return clamp((255 - coreSum / coreN) / 255, 0.3, 1);
    } catch (e) {
      return null;                                 // tainted: cannot be read
    }
  }

  /* --- a pale button with a coloured glyph on it -------------------------- */
  /* The screener's criteria list opens each group with a 20px PNG, a pale
     grey disc with a blue "+" (a filter would turn the blue orange). Its
     greys are inverted to land just above the surface, rim lighter than
     fill, and the glyph keeps its hue, lifted to 4.5:1 on the new body. */
  const remapped = new Map();

  function remapRaster(url, surface) {
    const key = url + '|' + surface;
    if (remapped.has(key)) return remapped.get(key);
    const p = new Promise(resolve => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h || w > 64 || h > 64) return resolve(null);
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, w, h);
          const d = id.data;
          let opaque = 0, neutral = 0, neutralSum = 0, colour = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            opaque++;
            const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
            if (mx - mn <= 24) { neutral++; neutralSum += (d[i] + d[i + 1] + d[i + 2]) / 3; }
            else if (mx - mn > 40) colour++;
          }
          if (opaque < w * h * 0.3) return resolve(null);              // a glyph, not a body
          if (neutral < opaque * 0.5 || neutralSum / neutral < 190) return resolve(null);
          if (colour < opaque * 0.03) return resolve(null);            // nothing coloured on it
          const body = clamp(surface + 0.04, 0.08, 0.4);
          /* the glyph is held to the fill as it will come out, not to `body` */
          const fillLevel = clamp(body + (1 - neutralSum / neutral / 255) * 0.78, 0, 1);
          const bodyC = { r: fillLevel * 255, g: fillLevel * 255, b: fillLevel * 255, a: 1 };
          const lifts = new Map();
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) continue;
            const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
            if (mx - mn <= 24) {
              const v = (d[i] + d[i + 1] + d[i + 2]) / 3 / 255;
              const out = Math.round(clamp(body + (1 - v) * 0.78, 0, 1) * 255);
              d[i] = d[i + 1] = d[i + 2] = out;
            } else {
              const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
              let c = lifts.get(k);
              if (!c) {
                const src = { r: d[i], g: d[i + 1], b: d[i + 2], a: 1 };
                const hexd = contrast(src, bodyC) >= 4.5 ? null : liftToContrast(src, bodyC, 4.5);
                c = hexd ? parseColor(hexd) : src;
                lifts.set(k, c);
              }
              d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b;
            }
          }
          ctx.putImageData(id, 0, 0);
          resolve(cv.toDataURL('image/png'));
        } catch (e) {
          resolve(null);                         // tainted: leave it be
        }
      };
      loadRaster(img, url);
    });
    remember(remapped, key, p, 300);
    return p;
  }

  /* --- a GIF's white fringe ----------------------------------------------- */
  /* A GIF has no partial alpha, so an icon drawn for white has its edge
     baked against white (the Alerts Center's 15px search magnifier shows a
     ring of pale specks; the research pages' holdings glyph a white rim
     round its lens). A grey glyph is un-blended from white into its own grey
     whole, which is then mapped as ink. A coloured one keeps its colours:
     only the pixels along the clear edge are un-blended, each from white
     into the nearest of the glyph's own colours, with the mix as its alpha. */
  const dematted = new Map();

  /* A two-tone drawing (see classifyImage): every opaque pixel that is dark
     and neutral becomes ink, keeping its own alpha, so the line art reads on
     a dark card; coloured pixels, and the anti-aliased blends between the two,
     keep their colour. */
  const inkLifted = new Map();         // url -> Promise<dataUri|null>
  function inkLiftRaster(url) {
    if (inkLifted.has(url)) return inkLifted.get(url);
    const p = new Promise(resolve => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h || w * h > 160000) return resolve(null);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const im = ctx.getImageData(0, 0, w, h), d = im.data;
          const ink = parseColor(P.text2);
          const dim = parseColor(P.text3);
          let lifted = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 8) continue;
            const r = d[i], g = d[i + 1], b = d[i + 2];
            if (Math.max(r, g, b) - Math.min(r, g, b) > 40) continue;
            const l = r * 0.299 + g * 0.587 + b * 0.114;
            if (l >= 128) continue;
            /* near-black goes to ink; a mid grey (a softer line) to the dimmer ink */
            const t = l / 128;
            d[i] = Math.round(ink.r + (dim.r - ink.r) * t);
            d[i + 1] = Math.round(ink.g + (dim.g - ink.g) * t);
            d[i + 2] = Math.round(ink.b + (dim.b - ink.b) * t);
            lifted++;
          }
          if (!lifted) return resolve(null);
          ctx.putImageData(im, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) { resolve(null); }
      };
      loadRaster(img, url);
    });
    remember(inkLifted, url, p, 300);
    return p;
  }

  function dematteRaster(url, colouredOnly) {
    const key = url + (colouredOnly ? '|c' : '');
    if (dematted.has(key)) return dematted.get(key);
    const p = new Promise(resolve => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h || w > 64 || h > 64) return resolve(null);
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, w, h);             // throws if tainted
          const d = id.data;
          const levels = [];
          let clear = 0, coloured = false;
          for (let i = 0; i < d.length; i += 4) {
            const a = d[i + 3];
            if (a === 0) { clear++; continue; }
            if (a < 255) return resolve(null);                   // real alpha: nothing baked in
            const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
            if (mx - mn > 24) coloured = true;
            levels.push((d[i] + d[i + 1] + d[i + 2]) / 3);
          }
          if (!clear || levels.length < 6) return resolve(null);
          if (colouredOnly && !coloured) return resolve(null);  // a grey glyph is the filter's
          const clearAt = (x, y) => x < 0 || y < 0 || x >= w || y >= h || d[(y * w + x) * 4 + 3] === 0;
          const touchesClear = k => {
            const x = k % w, y = (x === 0 ? k : k - x) / w;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && clearAt(x + dx, y + dy)) return true;
            return false;
          };

          if (coloured) {
            /* A pixel as a mix of white and an ink: the ink and the mix, or
               null for a solid pixel. White is a mix of nothing (alpha 0). */
            const unmix = (r, g, b, inks) => {
              if (r > 236 && g > 236 && b > 236) return { c: null, t: 0 };
              let best = null, bestErr = 41 * 41, bestT = 0;
              for (const c of inks) {
                const vx = 255 - c.r, vy = 255 - c.g, vz = 255 - c.b, vv = vx * vx + vy * vy + vz * vz;
                if (!vv) continue;
                const t = clamp(((255 - r) * vx + (255 - g) * vy + (255 - b) * vz) / vv, 0, 1);
                const ex = 255 - t * vx - r, ey = 255 - t * vy - g, ez = 255 - t * vz - b;
                const err = ex * ex + ey * ey + ez * ez;
                if (err < bestErr) { bestErr = err; best = c; bestT = t; }
              }
              return best && bestT <= 0.97 ? { c: best, t: bestT } : null;
            };
            /* The glyph's own colours, darkest first; a colour that is itself
               a mix of white and a darker one is a fringe shade, not an ink. */
            const tally = new Map();
            for (let k = 0; k < w * h; k++) {
              const i = k * 4;
              if (!d[i + 3] || (d[i] > 236 && d[i + 1] > 236 && d[i + 2] > 236)) continue;
              const q = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
              const t = tally.get(q) || { r: 0, g: 0, b: 0, n: 0 };
              t.r += d[i]; t.g += d[i + 1]; t.b += d[i + 2]; t.n++;
              tally.set(q, t);
            }
            const shades = [...tally.values()].filter(t => t.n >= 2).map(t => ({ r: t.r / t.n, g: t.g / t.n, b: t.b / t.n }))
              .sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
            const inks = [];
            for (const c of shades) if (!inks.length || !unmix(c.r, c.g, c.b, inks)) inks.push(c);
            const mix = new Array(w * h).fill(null);
            for (let k = 0; k < w * h; k++) {
              const i = k * 4;
              if (d[i + 3]) mix[k] = unmix(d[i], d[i + 1], d[i + 2], inks);
            }
            /* The fringe: such pixels against the clear part, then the ring
               inside that, where the mix is stronger (a soft edge is paler
               outside). No further, so a pale fill is not eaten from its edge,
               and a white line inside the glyph is never reached. */
            const fringe = new Uint8Array(w * h);
            let found = 0;
            for (let k = 0; k < w * h; k++) if (mix[k] && touchesClear(k)) { fringe[k] = 1; found++; }
            const second = [];
            for (let k = 0; k < w * h; k++) {
              if (fringe[k] || !mix[k] || !mix[k].c) continue;
              const x = k % w, y = (k - x) / w;
              let behind = false;
              for (let dy = -1; dy <= 1 && !behind; dy++) for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx, yy = y + dy;
                if (!(dx || dy) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                const n = yy * w + xx;
                if (fringe[n] && mix[n].t < mix[k].t - 0.05) { behind = true; break; }
              }
              if (behind) second.push(k);
            }
            for (const k of second) { fringe[k] = 1; found++; }
            if (found < 3) return resolve(null);
            for (let k = 0; k < w * h; k++) {
              if (!fringe[k]) continue;
              const i = k * 4, m = mix[k];
              if (!m.c) { d[i + 3] = 0; continue; }
              d[i] = Math.round(m.c.r); d[i + 1] = Math.round(m.c.g); d[i + 2] = Math.round(m.c.b);
              d[i + 3] = Math.round(m.t * 255);
            }
            ctx.putImageData(id, 0, 0);
            return resolve(cv.toDataURL('image/png'));
          }

          /* the glyph's own grey: its darker pixels, not the single darkest */
          const sorted = levels.slice().sort((a, b) => a - b);
          const ink = sorted[Math.floor(sorted.length * 0.15)];
          if (ink > 200) return resolve(null);                   // a pale glyph has no pale fringe
          /* a fringe is a pale pixel against the clear part */
          let fringe = 0;
          for (let k = 0; k < w * h; k++) {
            const i = k * 4;
            if (d[i + 3] && touchesClear(k) && (d[i] + d[i + 1] + d[i + 2]) / 3 > ink + 40) fringe++;
          }
          if (fringe < 3) return resolve(null);
          const out = parseColor(mapColor(toHex(ink, ink, ink), 'fg')) || { r: ink, g: ink, b: ink };
          for (let k = 0; k < w * h; k++) {
            const i = k * 4;
            if (!d[i + 3]) continue;
            const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
            const a = v <= ink ? 1 : clamp((255 - v) / Math.max(1, 255 - ink), 0, 1);
            d[i] = out.r; d[i + 1] = out.g; d[i + 2] = out.b;
            d[i + 3] = Math.round(a * 255);
          }
          ctx.putImageData(id, 0, 0);
          resolve(cv.toDataURL('image/png'));
        } catch (e) {
          resolve(null);                                       // tainted: leave it be
        }
      };
      loadRaster(img, url);
    });
    remember(dematted, key, p, 300);
    return p;
  }

  function classifyImage(url, surface, inkLevel) {
    /* One verdict per artwork per surface: a knockout aimed at the wrong
       surface shows as a hole a shade off its page (the footer wordmark sits
       on the card, toolbar glyphs on the canvas). */
    if (surface === undefined) surface = 0.075;
    const key = url + '|' + surface + '|' + (inkLevel || '');
    if (imageVerdicts.has(key)) return imageVerdicts.get(key);
    const p = new Promise(resolve => {
      const img = new Image();
      const done = v => resolve(v);
      img.onerror = () => done(null);
      img.onload = () => {
        try {
          const n = 24;
          const canvas = document.createElement('canvas');
          canvas.width = n; canvas.height = n;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, n, n);
          const d = ctx.getImageData(0, 0, n, n).data;
          let opaque = 0, chromatic = 0, dark = 0, darkNeutral = 0, nearWhite = 0, sum = 0;
          let cR = 0, cG = 0, cB = 0, cN = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 24) continue;          // transparent: not part of the glyph
            opaque++;
            const r = d[i], g = d[i + 1], b = d[i + 2];
            const chroma = Math.max(r, g, b) - Math.min(r, g, b);
            if (chroma > 28) { chromatic++; cR += r; cG += g; cB += b; cN++; }
            if (r > 226 && g > 226 && b > 226) nearWhite++;
            const l = r * 0.299 + g * 0.587 + b * 0.114;
            sum += l;
            if (l < 110) { dark++; if (chroma <= 28) darkNeutral++; }
          }
          if (!opaque) return done(null);

          /* A coloured raster on a white plate is refused, and refilter()
             edits the plate out instead. Four white corners count as a plate
             even when a disc leaves too little white overall. */
          const whiteAt = i => d[i + 3] >= 200 && d[i] > 226 && d[i + 1] > 226 && d[i + 2] > 226;
          let rim = 0, rimWhite = 0;
          for (let t = 0; t < n; t++) {
            for (const k of [t, (n - 1) * n + t, t * n, t * n + n - 1]) { rim++; if (whiteAt(k * 4)) rimWhite++; }
          }
          const whiteCorners = whiteAt(0) && whiteAt((n - 1) * 4) &&
            whiteAt((n * (n - 1)) * 4) && whiteAt((n * n - 1) * 4) && rimWhite / rim >= 0.3;
          if ((nearWhite / opaque > 0.25 || whiteCorners) && chromatic / opaque > 0.08) return done(null);

          /* A two-tone drawing, dark grey line art with a coloured accent (the
             Net worth page's loan, home and "other" pictures: black outlines
             with an orange base), loses its lines on a dark card. Its neutral
             dark pixels are lifted to ink and its colour kept (inkLiftRaster);
             no filter could do one without the other. */
          if (chromatic / opaque > 0.12 && darkNeutral / opaque >= 0.3 && nearWhite / opaque < 0.25) return done('inklift');

          /* A coloured mark is never inverted. One too dark for this surface
             (the screener's blue chevrons) is brightened until its mean colour
             reaches 3.6:1, a margin over 3:1. */
          if (chromatic / opaque > 0.12) {
            if (!cN) return done(null);
            const mc = { r: cR / cN, g: cG / cN, b: cB / cN };
            const sv = Math.round(surface * 255);
            const sc = { r: sv, g: sv, b: sv, a: 1 };
            if (contrast(mc, sc) >= 3) return done(null);
            let k = 1;
            for (; k < 3; k += 0.05) {
              const t = { r: Math.min(255, mc.r * k), g: Math.min(255, mc.g * k), b: Math.min(255, mc.b * k) };
              if (contrast(t, sc) >= 3.6) break;
            }
            return done('brightness(' + Math.min(k, 3).toFixed(2) + ')');
          }
          /* Under 60% dark: a mark drawn for a dark field, left alone, unless
             it is a grey drawing on a white plate (platedGrey: the screener's
             dropdown chevrons), inverted with the two-endpoint maths below. */
          if (dark / opaque < 0.6) {
            const core = platedGrey(img);
            if (!core) return done(null);
            const inkCore = 214 / 255;
            const a = clamp((inkCore - surface) / core, 0.3, 1.6);
            const k = 2 * surface + a;
            return done('invert(1) contrast(' + (a / k).toFixed(3) + ') brightness(' + k.toFixed(3) + ')');
          }
          const mean = sum / opaque;

          /* Two endpoints. After invert(1) the glyph sits at vG and a white
             knockout (the Fidelity mark's pyramid) at 0, which brightness()
             alone, a multiply, leaves black. contrast(c) brightness(k) maps v
             to (kc)v + k(0.5 - 0.5c), so glyph -> ink and knockout -> surface
             solve to a = (ink - surface) / vG, k = 2 * surface + a, c = a / k. */
          /* where a black glyph goes: an icon's grey, or a logo's white */
          const ink = inkLevel || 172 / 255;
          const vG = clamp((255 - mean) / 255, 0.3, 1);
          const a = clamp((ink - surface) / vG, 0.3, 1.6);
          const k = 2 * surface + a;
          const c = a / k;
          done('invert(1) contrast(' + c.toFixed(3) + ') brightness(' + k.toFixed(3) + ')');
        } catch (e) {
          done(null);                              // tainted canvas: leave it be
        }
      };
      loadRaster(img, url);
    });
    remember(imageVerdicts, key, p, 1500);
    return p;
  }

  /* A quoted url() runs to the quote that opened it: a data: SVG inside
     url("...") is full of single quotes and parentheses, and computed styles
     escape any double quote inside it as \". */
  const URL_RE = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*?))\s*\)/;
  const urlOf = m => {
    if (!m) return null;
    if (m[3] !== undefined) return m[3];
    return (m[1] !== undefined ? m[1] : m[2]).replace(/\\(["'\\])/g, '$1');
  };

  /* el -> { url, surface, inkLevel } of a filter this pass wrote. The surface
     can change after the first pass (the footer stays transparent until its
     own stylesheet arrives), so each pass re-measures it and re-aims. */
  let filtered = new WeakMap();

  /* A filter recolours everything an element paints, its label included, so
     an element that shows text is never filtered (the screener's sorted
     column header wears its arrow as a background). Screen-reader text
     clipped to a pixel or two does not count. */
  function showsText(el) {
    if (el.tagName === 'IMG') return false;
    let walker;
    try { walker = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */); } catch (e) { return false; }
    let n;
    while ((n = walker.nextNode())) {
      if (!/\S/.test(n.nodeValue)) continue;
      const p = n.parentElement;
      if (!p) continue;
      const r = p.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) return true;
    }
    return false;
  }

  /* Whether a background picture paints every pixel of its element's box. */
  function coversBox(el, size) {
    const cs = getComputedStyle(el);
    const bs = cs.backgroundSize.trim();
    if (bs === 'cover' || bs === '100% 100%') return true;
    if (!/^auto( auto)?$/.test(bs)) return false;
    if (cs.backgroundRepeat.trim() === 'repeat') return true;
    if (!/^0(%|px)? 0(%|px)?$/.test(cs.backgroundPosition.trim())) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && size.w >= r.width - 0.5 && size.h >= r.height - 0.5;
  }

  /* --- copy laid over a pale photograph ----------------------------------- */
  /* Hero copy on a pale photo (the homepage banner) gets a dark gradient
     under it, built column by column from a small canvas copy of the
     picture; the picture itself is not edited, and one the page cannot read
     (no CORS) is left alone. data-fdm-scrim makes 06-fds.css's dark
     hero-copy rules stand down. */
  /* el -> the picture url it was measured on, not just a yes: the homepage's
     personalisation script can swap the banner after the first pass */
  let scrimChecked = new WeakMap();
  const scrimmed = new Set();
  const SCRIM_PROPS = ['background-image', 'background-size', 'background-position', 'background-repeat'];

  function pictureUrlOf(el) {
    return urlOf(URL_RE.exec(getComputedStyle(el).backgroundImage || ''));
  }
  const SCRIM_PALE = 0.45;           // a backdrop this light needs a scrim
  const SCRIM_TARGET = 0.16;         // where the scrim brings the pale part to

  /* Where a single-layer background picture is drawn in its element, for
     the size and position forms a hero uses. */
  function pictureRect(el, cs, nat) {
    const r = el.getBoundingClientRect();
    const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
    const W = r.width - bl - (parseFloat(cs.borderRightWidth) || 0);
    const H = r.height - bt - (parseFloat(cs.borderBottomWidth) || 0);
    if (W <= 0 || H <= 0 || !nat.w || !nat.h) return null;
    const size = cs.backgroundSize.split(',')[0].trim();
    let w, h;
    if (size === 'cover' || size === 'contain') {
      const s = size === 'cover' ? Math.max(W / nat.w, H / nat.h) : Math.min(W / nat.w, H / nat.h);
      w = nat.w * s; h = nat.h * s;
    } else {
      const parts = size.split(/\s+/);
      const len = (v, ref) => (!v || v === 'auto') ? null : /%$/.test(v) ? parseFloat(v) / 100 * ref : parseFloat(v);
      w = len(parts[0], W); h = len(parts[1], H);
      if (w == null && h == null) { w = nat.w; h = nat.h; }
      else if (w == null) w = h * nat.w / nat.h;
      else if (h == null) h = w * nat.h / nat.w;
    }
    const pos = cs.backgroundPosition.split(',')[0].trim().split(/\s+/);
    const off = (v, free) => v === undefined ? free / 2 : /%$/.test(v) ? parseFloat(v) / 100 * free : (parseFloat(v) || 0);
    const x = off(pos[0], W - w), y = off(pos[1], H - h);
    return { x, y, w, h, left: r.left + bl + x, top: r.top + bt + y };
  }

  function maybeScrim(el, url) {
    if (scrimChecked.get(el) === url) return;
    scrimChecked.set(el, url);
    const cs = getComputedStyle(el);
    if (cs.backgroundImage.split('url(').length !== 2) return;          // exactly one picture
    if (!/^no-repeat/.test(cs.backgroundRepeat.trim())) return;
    const ep = epoch;
    const img = new Image();
    img.onload = () => {
      try {
        if (ep !== epoch || !el.isConnected || !el.matches(':not([data-fdm-scrim])')) return;
        /* the picture changed while this one loaded: the next pass measures
           the new one */
        if (pictureUrlOf(el) !== url) { scrimChecked.delete(el); return; }
        const pic = pictureRect(el, getComputedStyle(el), { w: img.naturalWidth, h: img.naturalHeight });
        if (!pic || pic.w < 300 || pic.h < 100) return;
        const cw = 120, ch = Math.max(1, Math.round(cw * img.naturalHeight / img.naturalWidth));
        const cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, cw, ch);
        const d = ctx.getImageData(0, 0, cw, ch).data;          // throws if tainted
        const level = (x, y) => { const i = (y * cw + x) * 4; return d[i + 3] < 128 ? null : (d[i] + d[i + 1] + d[i + 2]) / 765; };
        const median = list => { const s = list.filter(v => v != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

        /* scrim only if some copy on this picture sits on a pale part of it */
        let pale = 0;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n, seen = 0;
        while ((n = walker.nextNode()) && seen < 300) {
          if (!n.nodeValue || n.nodeValue.trim().length < 2) continue;
          const t = n.parentElement;
          if (!t) continue;
          seen++;
          const tr = t.getBoundingClientRect();
          if (tr.width < 4 || tr.height < 4) continue;
          const info = {};
          effectiveBg(t, info);
          if (info.picture !== el) continue;                   // on a surface of its own
          const ix0 = Math.max(0, Math.floor((tr.left - pic.left) / pic.w * cw));
          const ix1 = Math.min(cw - 1, Math.ceil((tr.right - pic.left) / pic.w * cw));
          const iy0 = Math.max(0, Math.floor((tr.top - pic.top) / pic.h * ch));
          const iy1 = Math.min(ch - 1, Math.ceil((tr.bottom - pic.top) / pic.h * ch));
          if (ix1 < ix0 || iy1 < iy0) continue;                // not over the picture
          const under = [];
          for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) under.push(level(x, y));
          const m = median(under);
          if (m == null || m < SCRIM_PALE) continue;
          pale++;
        }
        if (!pale) return;

        /* Across the whole picture, each column is darkened just enough to
           bring its median level down to SCRIM_TARGET; darker columns are
           left alone. The median, so white lettering on a dark column does
           not count as pale. */
        const S = parseColor(P.canvas), s = (S.r + S.g + S.b) / 765;
        const alphas = [];
        for (let x = 0; x < cw; x++) {
          const c = []; for (let y = 0; y < ch; y++) c.push(level(x, y));
          const m = median(c);
          alphas.push(m == null || m <= SCRIM_TARGET ? 0 : clamp((m - SCRIM_TARGET) / Math.max(0.01, m - s), 0, 0.94));
        }
        /* a light smoothing, so the stripes of a lined picture do not turn
           into stripes of scrim */
        const smooth = alphas.map((a, i) => {
          let t = 0, n = 0;
          for (let k = -2; k <= 2; k++) { const v = alphas[i + k]; if (v !== undefined) { t += v; n++; } }
          return t / n;
        });
        if (Math.max(...smooth) < 0.05) return;
        const ink = a => 'rgba(' + S.r + ', ' + S.g + ', ' + S.b + ', ' + a.toFixed(3) + ')';
        const stops = [];
        let last = -1;
        smooth.forEach((a, i) => {
          if (i > 0 && i < cw - 1 && Math.abs(a - last) < 0.02) return;   // a flat run needs no stop
          stops.push(ink(a) + ' ' + ((i + 0.5) / cw * 100).toFixed(2) + '%');
          last = a;
        });
        const now = getComputedStyle(el);
        writeStyle(el, 'background-image', 'linear-gradient(to right, ' + stops.join(', ') + '), ' + now.backgroundImage, 'important');
        writeStyle(el, 'background-size', Math.ceil(pic.w) + 'px ' + (Math.ceil(pic.h) + 1) + 'px, ' + now.backgroundSize, 'important');
        writeStyle(el, 'background-position', pic.x.toFixed(1) + 'px ' + pic.y.toFixed(1) + 'px, ' + now.backgroundPosition, 'important');
        writeStyle(el, 'background-repeat', 'no-repeat, ' + now.backgroundRepeat, 'important');
        writeAttr(el, 'data-fdm-scrim', '1');
        scrimmed.add(el);
      } catch (e) { /* tainted or detached: leave the picture as it is */ }
    };
    loadRaster(img, url);
  }

  /* The scrim is laid in pixels, and a hero sized "100% auto" changes size
     with the window. On a resize each one is lifted and measured again. */
  let scrimResize = 0;
  function liftScrim(el) {
    for (const prop of SCRIM_PROPS) clearStyle(el, prop);
    const saved = attrOriginals.get(el);
    if (saved && 'data-fdm-scrim' in saved) {
      if (saved['data-fdm-scrim'] === null) el.removeAttribute('data-fdm-scrim');
      delete saved['data-fdm-scrim'];
    }
    scrimChecked.delete(el);
    scrimmed.delete(el);
  }
  function rescrim() {
    const lifted = [...scrimmed];
    for (const el of lifted) liftScrim(el);
    /* and measured again now: the lift is only a style change, which no pass
       of content.js's would follow with a picture pass */
    for (const el of lifted) {
      if (!el.isConnected) continue;
      try { recolorIconImages(el.parentElement || el); } catch (e) { /* non-fatal */ }
    }
  }

  /* A scrim names its picture inline and !important, hiding any picture the
     page swaps in later. So the picture is re-read with the scrim lifted for
     one synchronous read (which never paints), and a scrim whose picture has
     changed comes off to be measured again. */
  function recheckScrims() {
    /* Only after a new stylesheet: lifting and re-laying an inline style on
       every pass would feed the observer its own writes. */
    if (!sheetsGrew) return;
    sheetsGrew = false;
    recheckTextures();
    for (const el of [...scrimmed]) {
      if (!el.isConnected) { scrimmed.delete(el); continue; }
      const was = scrimChecked.get(el);
      const vals = SCRIM_PROPS.map(p => el.style.getPropertyValue(p));
      SCRIM_PROPS.forEach(p => clearStyle(el, p));
      let now = null;
      try { now = pictureUrlOf(el); } catch (e) { now = was; }
      if (now === was) SCRIM_PROPS.forEach((p, i) => { if (vals[i]) writeStyle(el, p, vals[i], 'important'); });
      else liftScrim(el);
    }
  }
  try {
    window.addEventListener('resize', () => {
      if (!scrimmed.size) return;
      clearTimeout(scrimResize);
      scrimResize = setTimeout(rescrim, 250);
    });
  } catch (e) { /* no window */ }

  /* --- a pale texture tiled behind copy ----------------------------------- */
  /* A small tiled picture painting a www panel (the search & compare rail's
     4x463 hatch, the footer's 1x233 strip) is a surface, so its pixels are
     mapped as one: its lightest level lands on the surface the element shows
     and darker shades come out lighter by a damped step (TEXTURE_STEP). */
  const textures = new Map();          // url|anchor -> Promise<dataUri|null>
  let textured = new WeakMap();            // el -> { url, anchor }
  const texturedEls = new Set();           // the elements carrying an edited texture
  let textureRejected = new WeakSet();
  const TEXTURE_STEP = 0.6;

  function anchorOf(el) {
    const s = effectiveBg(el);
    return toHex(s.r, s.g, s.b);
  }

  function textureRaster(url, anchor) {
    const key = url + '|' + anchor;
    if (textures.has(key)) return textures.get(key);
    const p = new Promise(resolve => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h || w * h > 1e6) return resolve(null);
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, w, h);             // throws if tainted
          const d = id.data;
          const lum = new Map();
          const lumAt = i => {
            const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
            let y = lum.get(k);
            if (y === undefined) { y = relLum({ r: d[i], g: d[i + 1], b: d[i + 2] }); lum.set(k, y); }
            return y;
          };
          let paper = 0, tinted = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 250) return resolve(null);           // see-through: an overlay, not a surface
            const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
            if (mx - mn > 24 && ++tinted > d.length / 400) return resolve(null);   // coloured: artwork
            const y = lumAt(i);
            if (y < 0.3) return resolve(null);                  // ink in it: artwork
            if (y > paper) paper = y;
          }
          if (paper < 0.6) return resolve(null);               // not pale: a band of its own
          const A = parseColor(anchor);
          const ya = relLum(A);
          const ga = linearToSrgb(ya) * 255;
          const out = new Map();
          for (let i = 0; i < d.length; i += 4) {
            const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
            let c = out.get(k);
            if (!c) {
              const r = (paper + 0.05) / (lumAt(i) + 0.05);
              const yo = (ya + 0.05) * (1 + (r - 1) * TEXTURE_STEP) - 0.05;
              const lift = linearToSrgb(clamp(yo, 0, 1)) * 255 - ga;
              c = [A.r + lift, A.g + lift, A.b + lift].map(v => Math.round(clamp(v, 0, 255)));
              out.set(k, c);
            }
            d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
          }
          ctx.putImageData(id, 0, 0);
          resolve(cv.toDataURL('image/png'));
        } catch (e) {
          resolve(null);                                     // tainted: leave it be
        }
      };
      loadRaster(img, url);
    });
    remember(textures, key, p, 60);
    return p;
  }

  /* Aimed at the surface the element shows now; recolorIconImages re-aims it
     when that moves (the first pass can run before the panel's colour is). */
  function retexture(el, url, anchor) {
    const ep = epoch;
    textured.set(el, { url, anchor });
    textureRaster(url, anchor).then(dataUri => {
      if (ep !== epoch || !el.isConnected) return;
      const t = textured.get(el);
      if (!t || t.anchor !== anchor) return;                  // aimed again since
      if (!dataUri) {
        /* not a pale texture after all: the ordinary image pass may have it */
        textured.delete(el);
        textureRejected.add(el);
        imagedEls.delete(el);
        return;
      }
      /* The page may have dropped the picture while it loaded (the homepage
         footer's strip, switched off by a rule that lands after the first
         pass); an !important copy written now would bring it back. */
      if (!texturedEls.has(el)) {
        let now = null;
        try { now = pictureUrlOf(el); } catch (e) { now = null; }
        if (now !== url) { dropTexture(el); return; }
      }
      try { writeStyle(el, 'background-image', 'url("' + dataUri + '")', 'important'); } catch (e) { /* ignore */ }
      texturedEls.add(el);
    });
  }

  /* Forget a texture and hand the element back to the picture passes. */
  function dropTexture(el) {
    if (texturedEls.has(el)) clearStyle(el, 'background-image');
    textured.delete(el);
    texturedEls.delete(el);
    imagedEls.delete(el);
  }

  /* After a new stylesheet, each edited texture is read again with the copy
     lifted (one synchronous read, never painted): one whose picture the page
     has since changed or removed comes off. */
  function recheckTextures() {
    for (const el of [...texturedEls]) {
      if (!el.isConnected) { texturedEls.delete(el); continue; }
      const t = textured.get(el);
      if (!t) { texturedEls.delete(el); continue; }
      const v = el.style.getPropertyValue('background-image');
      const pr = el.style.getPropertyPriority('background-image');
      clearStyle(el, 'background-image');
      let now = null;
      try { now = pictureUrlOf(el); } catch (e) { now = t.url; }
      if (now === t.url) { if (v) writeStyle(el, 'background-image', v, pr || 'important'); }
      else { textured.delete(el); texturedEls.delete(el); imagedEls.delete(el); }
    }
  }

  /* --- a picture that is one flat colour ---------------------------------- */
  /* A panel can be painted by a picture of a single colour (the logout page's
     401(k) banner is a 960x300 PNG of plain #F7F4E4). It takes that colour's
     dark counterpart, drawn at the picture's own size so it covers exactly
     what the picture did. A panel that lands on the colour already around it
     steps up a surface, as the cream stood off the white page in light mode. */
  const solidPictures = new Map();     // url -> Promise<hex|null>
  let solidRejected = new WeakSet();

  function solidColourOf(url) {
    if (solidPictures.has(url)) return solidPictures.get(url);
    const p = new Promise(resolve => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h || w * h > 4e6) return resolve(null);
          /* read at most 200x200: a flat picture stays flat when scaled */
          const cw = Math.min(w, 200), ch = Math.min(h, 200);
          const cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, cw, ch);
          const d = ctx.getImageData(0, 0, cw, ch).data;          // throws if tainted
          const r = d[0], g = d[1], b = d[2];
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 250) return resolve(null);           // see-through: not a panel
            if (Math.abs(d[i] - r) > 2 || Math.abs(d[i + 1] - g) > 2 || Math.abs(d[i + 2] - b) > 2) return resolve(null);
          }
          resolve({ hex: toHex(r, g, b), w, h });
        } catch (e) {
          resolve(null);
        }
      };
      loadRaster(img, url);
    });
    remember(solidPictures, url, p, 120);
    return p;
  }

  function solidRaster(hex, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, w, h);
    return cv.toDataURL('image/png');
  }

  function resolidify(el, url) {
    const ep = epoch;
    imagedEls.add(el);
    pictureSource.set(el, url);
    backgroundPictures.add(el);
    solidColourOf(url).then(found => {
      if (ep !== epoch || !el.isConnected) return;
      if (!found) {
        /* not flat after all: the other picture passes may have it */
        solidRejected.add(el);
        imagedEls.delete(el);
        return;
      }
      let now = null;
      try { now = pictureUrlOf(el); } catch (e) { now = null; }
      if (now !== url) { imagedEls.delete(el); return; }
      const light = parseColor(found.hex);
      /* only pale panels: a dark flat picture is a band of its own */
      if (!light || relLum(light) < 0.6) { solidRejected.add(el); imagedEls.delete(el); return; }
      let next = mapColor(found.hex, 'bg', null);
      const around = el.parentElement ? effectiveBg(el.parentElement) : parseColor(P.canvas);
      const mapped = parseColor(next);
      if (mapped && around && contrast(mapped, around) < 1.04) {
        next = relLum(around) < relLum(parseColor(P.surf1)) - 0.001 ? P.surf1 : P.surf2;
      }
      try { writeStyle(el, 'background-image', 'url("' + solidRaster(next, found.w, found.h) + '")', 'important'); } catch (e) { /* ignore */ }
    });
  }

  /* `rasterOnly`: a small picture set into a larger element, so only a pixel
     edit applies, never a filter (which would recolour the whole element). */
  function refilter(el, url, surface, apply, inkLevel, rasterOnly) {
    const ep = epoch;
    classifyImage(url, surface, inkLevel).then(filter => {
      if (!el.isConnected || ep !== epoch) return;
      /* a two-tone drawing: its lines are lifted in the pixels, not filtered */
      if (filter === 'inklift') {
        if (!apply || /\.svg(\?|$)/i.test(url) || DATA_SVG.test(url)) return;
        inkLiftRaster(url).then(dataUri => { if (dataUri && el.isConnected && ep === epoch) apply(dataUri); });
        return;
      }
      if (filter) {
        if (!rasterOnly && !showsText(el)) {
          writeStyle(el, 'filter', filter, 'important');
          filtered.set(el, { url, surface, inkLevel });
          /* a coloured GIF brightened for the card still carries its white
             fringe, which the filter would only brighten with it */
          if (apply && /^brightness\(/.test(filter) && !/\.svg(\?|$)/i.test(url) && !DATA_SVG.test(url)) {
            dematteRaster(url, true).then(clean => { if (clean && el.isConnected && ep === epoch) apply(clean); });
          }
          return;
        }
        /* No filter on an element with text or a rasterOnly picture. A dark
           glyph is left alone; a coloured mark can still have its pixels
           edited (the toolbar's Share icon, in an item saying "Share"). */
        if (!/^brightness\(/.test(filter)) return;
      }
      /* not filtered: a white plate can still be taken out of the pixels */
      if (!apply || /\.svg(\?|$)/i.test(url) || DATA_SVG.test(url)) return;
      unplateRaster(url, surface).then(dataUri => {
        if (!el.isConnected || ep !== epoch) return;
        if (dataUri) {
          apply(dataUri);
          /* Where the plate is cut away the page must show, not a colour the
             element painted under a picture that hid it (the browser's button
             grey under the screener's help button). So when the picture was
             solid and covers the box, the box's background goes too. */
          const solid = solidPlates.get(url);
          if (solid && el.tagName !== 'IMG' && coversBox(el, solid)) {
            try { writeStyle(el, 'background-color', 'transparent', 'important'); } catch (e) { /* ignore */ }
          }
          return;
        }
        /* not a plate: try a pale button body (remapRaster), then a grey GIF
           fringe (dematteRaster) */
        remapRaster(url, surface).then(next => {
          if (!el.isConnected || ep !== epoch) return;
          if (next) { apply(next); return; }
          dematteRaster(url).then(clean => { if (clean && el.isConnected && ep === epoch) apply(clean); });
        });
      });
    });
  }

  /* --- a brand band delivered as a picture -------------------------------- */
  /* The Feedback survey's 533x60 banner is an image: the wordmark in white on
     brand green (#448800). If a picture is only such a green, white and their
     blends, each pixel is re-mixed with the green swapped for #044014
     (surface-fixed-background), as processInline does for a CSS green band. */
  const rebanded = new Map();        // url -> Promise<dataUri|null>
  const BAND_SURFACE = '#044014';

  function rebandRaster(url) {
    if (rebanded.has(url)) return rebanded.get(url);
    const p = new Promise(resolve => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h || w < 200 || h > 200 || w < h * 4 || w * h > 400000) return resolve(null);
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, w, h);             // throws if tainted
          const d = id.data, n = w * h;
          /* the field: the commonest colour, which a band is most of */
          const counts = new Map();
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 250) return resolve(null);            // see-through: not a band
            const k = (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3);
            counts.set(k, (counts.get(k) || 0) + 1);
          }
          let best = -1, most = 0;
          for (const [k, c] of counts) if (c > most) { best = k; most = c; }
          if (most < n * 0.4) return resolve(null);
          let sr = 0, sg = 0, sb = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3)) !== best) continue;
            sr += d[i]; sg += d[i + 1]; sb += d[i + 2];
          }
          const F = { r: sr / most, g: sg / most, b: sb / most };
          /* and it has to be a brand green, saturated and mid-dark */
          const [fh, fs, fl] = rgbToHsl(F.r, F.g, F.b);
          if (fh < 0.2 || fh > 0.42 || fs < 0.45 || fl < 0.12 || fl > 0.55) return resolve(null);
          /* Every pixel on the line from the field to white, give or take the
             noise of a compressed file; anything else is a third ink. */
          const vx = 255 - F.r, vy = 255 - F.g, vz = 255 - F.b, vv = vx * vx + vy * vy + vz * vz;
          const T = parseColor(BAND_SURFACE);
          let off = 0;
          for (let i = 0; i < d.length; i += 4) {
            const dx = d[i] - F.r, dy = d[i + 1] - F.g, dz = d[i + 2] - F.b;
            const t = clamp((dx * vx + dy * vy + dz * vz) / vv, 0, 1);
            const ex = dx - t * vx, ey = dy - t * vy, ez = dz - t * vz;
            if (ex * ex + ey * ey + ez * ez > 900 && ++off > n * 0.01) return resolve(null);
            d[i] = Math.round(T.r + t * (255 - T.r));
            d[i + 1] = Math.round(T.g + t * (255 - T.g));
            d[i + 2] = Math.round(T.b + t * (255 - T.b));
          }
          ctx.putImageData(id, 0, 0);
          resolve(cv.toDataURL('image/png'));
        } catch (e) {
          resolve(null);                                       // tainted: leave it be
        }
      };
      loadRaster(img, url);
    });
    remember(rebanded, url, p, 30);
    return p;
  }

  /* --- a chart delivered as a picture -------------------------------------- */
  /* The Distributions chart is a PNG of bars, rules and labels on white. Each
     pixel is read as one ink mixed with white and becomes that ink, mapped,
     with the mix as its alpha, so the chart sits on whatever is behind it. A
     main colour (0.2% of the picture or more) is mapped as a chart mark; a
     grey is black's share, which lands on the light ink. A pixel on no such
     line (where two inks meet) keeps its own colour, mapped. */
  const chartPictures = new Map();        // url -> Promise<dataUri|null>
  const CHART_PICTURE = '[class*="chart" i], [class*="graph" i]:not([class*="paragraph" i])';

  function chartRaster(url) {
    if (chartPictures.has(url)) return chartPictures.get(url);
    const p = new Promise(resolve => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h || w * h > 2e6) return resolve(null);
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, w, h);             // throws if tainted
          const d = id.data, n = w * h;
          let paper = 0;
          const tally = new Map();
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 250) return resolve(null);            // see-through: not on paper
            const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
            if (mn > 244) paper++;
            else if (mx - mn > 30) {
              const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
              tally.set(k, (tally.get(k) || 0) + 1);
            }
          }
          if (paper < n * 0.5) return resolve(null);             // a picture, not a chart on paper
          const inks = [];
          for (const [k, count] of tally) if (count >= n * 0.002) inks.push({ r: k >> 16, g: (k >> 8) & 255, b: k & 255 });
          const ink = parseColor(P.text2);
          const marks = new Map();
          const markOf = c => {
            const hx = toHex(c.r, c.g, c.b);
            if (!marks.has(hx)) marks.set(hx, parseColor(mapCategorical(hx)) || c);
            return marks.get(hx);
          };
          const pixelOf = (r, g, b) => {
            let best = null, bestErr = 100, bestT = 0;
            for (const c of inks) {
              const vx = 255 - c.r, vy = 255 - c.g, vz = 255 - c.b, vv = vx * vx + vy * vy + vz * vz;
              const t = clamp(((255 - r) * vx + (255 - g) * vy + (255 - b) * vz) / vv, 0, 1);
              const ex = 255 - t * vx - r, ey = 255 - t * vy - g, ez = 255 - t * vz - b;
              const err = ex * ex + ey * ey + ez * ez;
              if (err < bestErr) { bestErr = err; best = c; bestT = t; }
            }
            if (best) { const m = markOf(best); return [m.r, m.g, m.b, Math.round(bestT * 255)]; }
            if (Math.max(r, g, b) - Math.min(r, g, b) <= 30) return [ink.r, ink.g, ink.b, Math.round((1 - (r + g + b) / 765) * 255)];
            const m = markOf({ r, g, b });
            return [m.r, m.g, m.b, 255];
          };
          const done = new Map();
          for (let i = 0; i < d.length; i += 4) {
            const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
            let o = done.get(k);
            if (!o) { o = pixelOf(d[i], d[i + 1], d[i + 2]); done.set(k, o); }
            d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = o[3];
          }
          ctx.putImageData(id, 0, 0);
          resolve(cv.toDataURL('image/png'));
        } catch (e) {
          resolve(null);                                       // tainted: leave it be
        }
      };
      loadRaster(img, url);
    });
    remember(chartPictures, url, p, 40);
    return p;
  }

  function recolorIconImages(scope) {
    const root_ = scope || document;
    const ep = epoch;
    const els = root_.querySelectorAll('*');
    let looked = 0;
    for (const el of els) {
      if (imagedEls.has(el)) {
        const f = filtered.get(el);
        if (f) {
          const s = surfaceLevel(el);
          if (Math.abs(s - f.surface) >= 0.02) refilter(el, f.url, s, null, f.inkLevel);
        }
        const t = textured.get(el);
        if (t) {
          const a = anchorOf(el);
          if (a !== t.anchor) retexture(el, t.url, a);
        }
        continue;
      }
      const tag = el.tagName.toLowerCase();
      if (tag === 'svg' || el.ownerSVGElement) continue;

      /* Look for an image before measuring: getBoundingClientRect forces
         layout, this also runs on the 500ms pass, and almost no element has
         an image. */
      let url = null;
      if (tag === 'img') {
        url = el.currentSrc || el.src;
      } else {
        const bg = getComputedStyle(el).backgroundImage;
        if (!bg || bg === 'none' || bg.indexOf('url(') === -1) continue;
        if (bg.indexOf('gradient') !== -1) continue;
        url = urlOf(URL_RE.exec(bg));
      }
      if (!url) continue;

      /* A pale texture tiled across a panel is a surface (textureRaster).
         Icon-sized boxes stay with the icon pass: `repeat` is the default, so
         an icon that never set no-repeat tiles too, once. */
      if (tag !== 'img' && !textureRejected.has(el) && !/\.svg(\?|$)/i.test(url) && !DATA_SVG.test(url)) {
        const tcs = getComputedStyle(el);
        const rep = tcs.backgroundRepeat.split(',')[0].trim();
        if (tcs.backgroundImage.split('url(').length === 2 && !/^no-repeat( no-repeat)?$/.test(rep)) {
          const tb = el.getBoundingClientRect();
          if ((tb.width > 64 || tb.height > 64) && tb.width >= 16 && tb.height >= 16 &&
              !(el.matches(':hover') && (tb.width < 240 || tb.height < 60))) {
            imagedEls.add(el);
            retexture(el, url, anchorOf(el));
            continue;
          }
        }
      }

      const box = el.getBoundingClientRect();
      /* A panel-sized background that may be one flat colour (resolidify).
         One that is not comes back on a later pass, for the steps below. */
      if (tag !== 'img' && !solidRejected.has(el) && !/\.svg(\?|$)/i.test(url) && !DATA_SVG.test(url) &&
          box.width >= 120 && box.height >= 40 && getComputedStyle(el).backgroundImage.split('url(').length === 2) {
        if (++looked > 120) break;
        resolidify(el, url);
        continue;
      }
      /* A photograph behind copy may need a scrim. Tested before :hover,
         since the pointer is nearly always somewhere over a page-sized hero. */
      if (tag !== 'img' && box.width >= 600 && box.height >= 160) { maybeScrim(el, url); continue; }
      /* A hovered element is skipped and not remembered: its background may
         be a :hover-only affordance (the positions grid's column-header drag
         glyph), and an inline rewrite would outlive the hover and tile. */
      if (tag !== 'img' && el.matches(':hover')) continue;

      /* icon-sized, or sprite-shaped like a 65x12 star strip */
      if (box.width < 6 || box.height < 6) {
        /* No box at all is not small, it is not shown yet: see watchForSize. */
        if (!box.width || !box.height) watchForSize(el);
        continue;
      }
      const iconish = box.width <= 64 && box.height <= 64;
      const spriteish = box.height <= 40 && box.width <= 220;
      const isSvgFile = /\.svg(\?|$)/i.test(url);
      /* SVG (a file or a data: URI) is edited rather than filtered, so it may
         be larger than an icon: up to 320px covers the 72px planning
         ideograms and "Next steps" art and the 200px retirement-score gauge.
         Rasters stay behind the icon gate. */
      const illustrationish = (isSvgFile || DATA_SVG.test(url)) && box.width <= 320 && box.height <= 320;
      /* A small raster set once, at its own size, into a larger element (the
         14px arrow in the 172x56 "Calculators & Tools Overview" item) gets a
         pixel edit only, never a filter, which would recolour the whole item. */
      let positioned = false;
      if (!iconish && !spriteish && !illustrationish && tag !== 'img' && !isSvgFile && !DATA_SVG.test(url)) {
        const pcs = getComputedStyle(el);
        positioned = /^no-repeat( no-repeat)?$/.test(pcs.backgroundRepeat.split(',')[0].trim()) &&
          /^auto( auto)?$/.test(pcs.backgroundSize.split(',')[0].trim()) &&
          pcs.backgroundImage.split('url(').length === 2;
      }
      /* Likewise an SVG set once into a larger element (the chevron of the
         classic Performance page's wide "Choose an account" select): it is
         only ever edited, so the box size does not matter. */
      let positionedSvg = false;
      if (!iconish && !spriteish && !illustrationish && tag !== 'img' && (isSvgFile || DATA_SVG.test(url))) {
        const pcs = getComputedStyle(el);
        positionedSvg = /^no-repeat( no-repeat)?$/.test(pcs.backgroundRepeat.split(',')[0].trim()) &&
          pcs.backgroundImage.split('url(').length === 2;
      }
      /* a chart drawn as a picture; chartRaster decides */
      if (tag === 'img' && !isSvgFile && !DATA_SVG.test(url) && box.width >= 120 && box.height >= 60 &&
          !el.closest('picture') && el.closest(CHART_PICTURE)) {
        if (++looked > 120) break;
        imagedEls.add(el);
        chartRaster(url).then(dataUri => {
          if (!dataUri || ep !== epoch || !el.isConnected) return;
          try {
            if (el.getAttribute('srcset')) writeAttr(el, 'srcset', dataUri);
            writtenSrc.set(el, dataUri);
            writeAttr(el, 'src', dataUri);
          } catch (e) { /* ignore */ }
        });
        continue;
      }
      /* a wide, short <img> may be a brand band; rebandRaster decides */
      if (tag === 'img' && !iconish && !spriteish && !isSvgFile && !DATA_SVG.test(url) &&
          box.width >= 240 && box.height <= 160 && box.width >= box.height * 4) {
        if (++looked > 120) break;
        imagedEls.add(el);
        rebandRaster(url).then(dataUri => {
          if (!dataUri || ep !== epoch || !el.isConnected) return;
          try { writtenSrc.set(el, dataUri); writeAttr(el, 'src', dataUri); } catch (e) { /* ignore */ }
        });
        continue;
      }
      if (!iconish && !spriteish && !illustrationish && !positioned && !positionedSvg) continue;
      if (el.closest('[class*="brand"], [class*="avatar"]')) continue;
      /* A data provider's wordmark (Morningstar under the StyleMap, a 59x14
         GIF of red letters on white) is someone else's brand: it is never
         edited, and 06-fds.css sits it on a small white chip instead, where
         its own colours read as they do in light mode. */
      if (tag === 'img' && PROVIDER_MARK.test(el.getAttribute('alt') || '')) { imagedEls.add(el); continue; }
      /* A logo is let through as an <img> (the footer's black
         Fidelity-footer-logo.png) or an SVG background, and an SVG logo is
         filtered, never edited: a black logo turns white (LOGO_INK) with its
         knockouts on the surface, a coloured one is left alone. */
      const logo = !!el.closest('[class*="logo"]');
      if (logo && tag !== 'img' && !isSvgFile && !DATA_SVG.test(url)) continue;
      /* a logo is only ever measured and filtered, and a filter on a box this
         size would take the whole control with it */
      if (logo && positionedSvg) continue;
      const inkLevel = logo ? LOGO_INK : undefined;

      /* At most 120 new images per pass. The ceiling is checked before the
         element is remembered, so the next pass picks up what this one left. */
      if (++looked > 120) break;
      imagedEls.add(el);
      /* a background picture is remembered with its source, for picturesChanged */
      if (tag !== 'img') { pictureSource.set(el, url); backgroundPictures.add(el); }

      const apply = dataUri => {
        if (ep !== epoch) return;
        try {
          if (tag === 'img') { writtenSrc.set(el, dataUri); writeAttr(el, 'src', dataUri); }
          else writeStyle(el, 'background-image', 'url("' + dataUri + '")', 'important');
        } catch (e) { /* ignore */ }
      };

      /* the surface it sits on, for outlines drawn in the page's colour */
      const sb = effectiveBg(el);
      const underHex = toHex(sb.r, sb.g, sb.b);
      const hole = pointerHole(el);
      if (DATA_SVG.test(url) && !logo) {
        const next = rewriteSvgDataUri(url, P.text2, underHex, hole);
        if (next) apply(next);
        continue;
      }

      /* An SVG file from this origin or a Fidelity host is edited (the worker
         fetches what the page cannot); everything else is measured and filtered. */
      let editable = false;
      try { const u = new URL(url, location.href); editable = isSvgFile && (u.origin === location.origin || isFidelityUrl(u.href)); } catch (e) {}
      const surface = surfaceLevel(el);
      if (editable && !logo) {
        rewriteSvgSprite(url, P.text2, underHex, hole).then(dataUri => {
          if (ep !== epoch) return;
          if (dataUri) { apply(dataUri); return; }
          if (dataUri === null && !positionedSvg) refilter(el, url, surface);
        });
        continue;
      }
      if (positionedSvg) continue;

      refilter(el, url, surface, apply, inkLevel, positioned);
    }
  }

  /* --- chart marks -------------------------------------------------------- */
  /* 05-charts.css maps the series colours Fidelity names; a color axis (the
     style-box heatmap) interpolates fills no table holds. So recolorChartMarks
     maps Highcharts marks at runtime, mapSequential for a color axis and
     mapCategorical for the rest, written inline over the attribute. */


  /* --- OKLab -------------------------------------------------------------- */
  /* Chart colours are re-stepped in OKLCH: HSL lightness is not perceptual,
     so a ramp that shifts hue would lose its order. */

  const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const linearToSrgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  function rgbToOklch(r, g, b) {
    const R_ = srgbToLinear(r / 255), G_ = srgbToLinear(g / 255), B_ = srgbToLinear(b / 255);
    const l = Math.cbrt(0.4122214708 * R_ + 0.5363325363 * G_ + 0.0514459929 * B_);
    const m = Math.cbrt(0.2119034982 * R_ + 0.6806995451 * G_ + 0.1073969566 * B_);
    const s_ = Math.cbrt(0.0883024619 * R_ + 0.2817188376 * G_ + 0.6299787005 * B_);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s_;
    const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s_;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s_;
    return [L, Math.hypot(a, bb), Math.atan2(bb, a)];
  }

  function oklchToRgbRaw(L, C, h) {
    const a = C * Math.cos(h), b = C * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }

  /* Out of gamut, chroma is reduced by bisection until the colour fits;
     clamping each channel instead would shift the hue. */
  function gamutFit(L, C, h) {
    const fits = c => oklchToRgbRaw(L, c, h).every(v => v >= -0.001 && v <= 1.001);
    if (fits(C)) return oklchToHex(L, C, h);
    let lo = 0, hi = C;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    return oklchToHex(L, lo, h);
  }

  function oklchToHex(L, C, h) {
    const [r, g, b] = oklchToRgbRaw(L, C, h).map(byteLinear);
    return toHex(r, g, b);
  }

  let pointSource = new WeakMap();
  let swatchSource = new WeakMap();
  let keyLineSource = new WeakMap();

  /**
   * Re-step one stop of a sequential color axis: its OKLab lightness gives its
   * position (white = low), re-emitted in reverse for a dark field, the low end
   * just above the card and the high end lightest. Hue is kept.
   */
  function mapSequential(raw) {
    const c = parseColor(raw);
    if (!c || c.a === 0) return null;
    const [Lsrc, Csrc, hsrc] = rgbToOklch(c.r, c.g, c.b);

    // the empty end of a scale should read as "nothing here", not as a slab
    if (Csrc < 0.035 && Lsrc > 0.97) return P.surf1;

    const t = clamp((1 - Lsrc) / 0.88, 0, 1);

    /* Lightness runs from just above the card (its own L, not a constant) to
       about mid, so one light label ink reads on every heatmap cell; chroma
       climbs with the step instead. */
    const cardL = rgbToOklch(parseColor(P.surf1).r, parseColor(P.surf1).g, parseColor(P.surf1).b)[0];
    const outL = cardL + 0.03 + t * 0.30;            // just above the card -> mid
    const outC = clamp((0.02 + Csrc * 0.95) * (0.30 + 0.70 * t), 0.010, 0.17);
    return gamutFit(outL, outC, hsrc);
  }

  /* --- series that differ only in lightness ------------------------------- */
  /* Series of one hue told apart only by lightness (the retirement
     projection's three blues) are re-stepped as one family: spacing roughly
     kept, order reversed for a dark field. Worked out per chart and
     remembered by colour, so the plot, key and tooltip agree. */
  let familyMap = new Map();       // light hex -> dark hex, for members of a family
  let familyGen = 0;               // bumped whenever an answer changes
  const FAMILY_GAP = 25 * Math.PI / 180;    // a hue step this wide starts a new family
  const FAMILY_FLOOR = 0.58;                // where the quietest member sits, as the band's floor
  const FAMILY_SOURCE = [
    '.highcharts-area[fill]',
    '.highcharts-graph[stroke]',
    /* Hovered and selected points are drawn brighter; as members they would
       shift the family's answers whenever the pointer crossed a column. */
    '.highcharts-point[fill]:not(.highcharts-point-hover):not(.highcharts-point-select)',
    '.highcharts-legend-item rect[fill]',
    '.highcharts-legend-item path[fill]'
  ].join(',');

  function registerFamilies(hexes) {
    const items = [];
    for (const hex of hexes) {
      if (CHART_EXACT[hex]) continue;        // tuned by hand already
      const c = parseColor(hex);
      if (!c) continue;
      const [L, C, h] = rgbToOklch(c.r, c.g, c.b);
      if (C < 0.03) continue;                // a grey is no family's member
      items.push({ hex, L, C, h: h < 0 ? h + 2 * Math.PI : h });
    }
    if (items.length < 2) return false;
    items.sort((a, b) => a.h - b.h);
    const groups = [];
    let cur = [items[0]];
    for (let i = 1; i < items.length; i++) {
      if (items[i].h - items[i - 1].h > FAMILY_GAP) { groups.push(cur); cur = []; }
      cur.push(items[i]);
    }
    groups.push(cur);
    /* The hue circle closes: a red at 355 degrees and one at 5 are neighbours. */
    if (groups.length > 1 && items[0].h + 2 * Math.PI - items[items.length - 1].h <= FAMILY_GAP) {
      groups[0] = groups.pop().concat(groups[0]);
    }
    let changed = false;
    for (const g of groups) {
      if (g.length < 2 || g.every(m => familyMap.has(m.hex))) continue;
      let hi = -1, lo = 2;
      for (const m of g) { hi = Math.max(hi, m.L); lo = Math.min(lo, m.L); }
      if (hi - lo < 0.04) continue;          // one colour twice, near enough: not a scale
      /* As far apart as they were, near enough, and never so close that two
         neighbours blur nor so far that the top of the scale glares. */
      const span = clamp((hi - lo) * 0.9, 0.12, 0.24);
      for (const m of g) {
        const t = (hi - m.L) / (hi - lo);    // 0 = the palest on white, 1 = the deepest
        const out = gamutFit(FAMILY_FLOOR + t * span, clamp(Math.max(m.C, 0.12) * 1.15, 0.10, 0.20), m.h);
        if (familyMap.get(m.hex) !== out) { familyMap.set(m.hex, out); changed = true; }
      }
    }
    if (changed) familyGen++;
    return changed;
  }

  function chartFamilies(svgRoot) {
    let nodes;
    try { nodes = svgRoot.querySelectorAll(FAMILY_SOURCE); } catch (e) { return false; }
    const hexes = new Set();
    for (const el of nodes) {
      if (isSequentialMark(el)) continue;
      for (const attr of ['fill', 'stroke']) {
        const v = el.getAttribute(attr);
        if (!v || v === 'none' || v.indexOf('url(') === 0) continue;
        const c = parseColor(v);
        if (c && c.a > 0) hexes.add(toHex(c.r, c.g, c.b));
      }
    }
    return registerFamilies(hexes);
  }

  /* A bar-sized Highcharts chart (the composition pages' sector bars, 100 by
     18) draws the unfilled rest of its bar as the chart background, a light
     grey. 05-charts.css makes chart backgrounds transparent, to sit on the
     card, so this one is given the track surface instead, as a bar drawn in
     HTML gets from showTrack. */
  let chartTracks = new WeakSet();
  function showChartTrack(svg) {
    if (chartTracks.has(svg)) return;
    let bg = null;
    try { bg = svg.querySelector('rect.highcharts-background'); } catch (e) { return; }
    if (!bg) return;
    const c = parseColor(bg.getAttribute('fill') || '');
    if (!c || c.a < 0.9) return;
    const [, sat, light] = rgbToHsl(c.r, c.g, c.b);
    if (sat > 0.1 || light > 0.97 || light < 0.6) return;    // white, or a colour: no track
    let h = 0;
    try { h = svg.getBoundingClientRect().height; } catch (e) { return; }
    if (!h) h = parseFloat(svg.getAttribute('height')) || 0;
    if (!h || h > 32) return;
    chartTracks.add(svg);
    writeStyle(bg, 'fill', P.surf4, 'important');
  }

  function chartRootsOf(scope) {
    const out = new Set();
    try {
      if (scope.closest) { const r = scope.closest('svg.highcharts-root'); if (r) out.add(r); }
      for (const r of scope.querySelectorAll('svg.highcharts-root')) out.add(r);
    } catch (e) { /* ignore */ }
    return out;
  }

  /* --- categorical marks -------------------------------------------------- */
  /* A category keeps its hue exactly; only lightness and chroma move, into a
     band that reads on the card. Never mapSequential for categories: it would
     invent an order (the navy "Domestic Stock" would come out brightest). */
  function mapCategorical(raw) {
    const c = parseColor(raw);
    if (!c || c.a === 0) return null;
    const hex = toHex(c.r, c.g, c.b);
    const named = CHART_EXACT[hex];
    if (named) return named;
    const kin = familyMap.get(hex);
    if (kin) return kin;

    const [L, C, h] = rgbToOklch(c.r, c.g, c.b);
    /* Achromatic (a grey series, a rule, an axis): inverted onto the ink
       ladder, so a dark stroke like the black balance line stays the most
       emphatic. Named neutrals are in CHART_EXACT. */
    if (C < 0.03) return L < 0.45 ? P.text : (L > 0.80 ? P.hair : P.text2);

    const outL = clamp(0.62 + (L - 0.5) * 0.30, 0.58, 0.80);
    const outC = clamp(Math.max(C, 0.12) * 1.15, 0.10, 0.20);
    return gamutFit(outL, outC, h);
  }

  /* A colour a Chart.js canvas draws with (canvas.js asks through content.js).
     Shapes and lines are marks, as Highcharts' are, so a chart and the HTML
     key beside it agree; text is ink; a see-through dark fill is a tooltip's
     plate and stays one. The source's alpha is kept. Null: leave it. */
  function canvasColor(raw, role) {
    const c = parseColor(raw);
    if (!c || c.a === 0) return null;
    const hex = toHex(c.r, c.g, c.b);
    let out;
    if (role === 'text') out = mapColor(hex, 'fg', null);
    else if (role === 'fill' && c.a < 0.95 && relLum(c) < 0.2 && rgbToOklch(c.r, c.g, c.b)[1] < 0.03) out = mapColor(hex, 'bg', null);
    else out = mapCategorical(hex);
    const o = parseColor(out);
    if (!o) return null;
    return c.a >= 0.995 ? toHex(o.r, o.g, o.b) : 'rgba(' + o.r + ', ' + o.g + ', ' + o.b + ', ' + +c.a.toFixed(3) + ')';
  }

  /* Marks painted from a color axis (heatmap, treemap, tilemap) are a ramp;
     everything else Highcharts paints is a category. */
  function isSequentialMark(el) {
    if (!el.closest) return false;
    try {
      return !!el.closest(
        '.highcharts-heatmap-series, .highcharts-treemap-series, ' +
        '.highcharts-coloraxis, .highcharts-colorAxis, .highcharts-tilemap-series'
      );
    } catch (e) { return false; }
  }

  const POINT_SELECTOR = [
    '.highcharts-point[fill]',
    '.highcharts-area[fill]',
    '.highcharts-graph[stroke]',
    '.highcharts-legend-item rect[fill]',
    '.highcharts-legend-item path[fill]',
    '.highcharts-heatmap-series rect[fill]',
    '.highcharts-treemap-series rect[fill]',
    '.highcharts-colorAxis rect[fill]',
    '.highcharts-coloraxis rect[fill]'
  ].join(',');

  /* --- placeholders, found by shape --------------------------------------- */
  /* Skeleton loaders have no consistent class (the Performance page's are
     bare divs), so a placeholder is found by shape: a light grey box with no
     text, picture or control in it, outside charts and logos. It becomes
     surf2, with a surf2/surf3 shimmer if it had a gradient. */
  let placeheld = new WeakSet();
  const SHIMMER = P.surf2 + ' 0%, ' + P.surf3 + ' 50%, ' + P.surf2 + ' 100%';

  function dimPlaceholders(scope) {
    let nodes;
    try {
      nodes = [...(scope || document).querySelectorAll('div,span,li,p,section,td,th')];
      /* the scope itself too: the observer hands over the inserted node, and
         an empty box arriving on its own is that node */
      if (scope && scope.nodeType === 1 && scope.matches('div,span,li,p,section,td,th')) nodes.unshift(scope);
    } catch (e) { return 0; }
    let n = 0;
    const hasContent = el => !!(el.textContent && el.textContent.trim()) ||
      !!(el.querySelector && el.querySelector('img,svg,canvas,video,input,button'));
    const giveBack = el => { placeheld.delete(el); clearStyle(el, 'background-color'); clearStyle(el, 'background-image'); };
    /* content arriving inside a dimmed box reaches this pass with the new
       node as its scope, so the box itself is found among the ancestors */
    if (scope && scope.nodeType === 1) {
      for (let a = scope.parentElement; a; a = a.parentElement) {
        if (placeheld.has(a) && hasContent(a)) giveBack(a);
      }
    }
    for (const el of nodes) {
      if (placeheld.has(el)) {
        /* A box dimmed while it was an empty skeleton is given back once it
           fills (the Net worth page's summary band loads empty, then holds
           the figures), or the placeholder grey would stay under real
           content. */
        if (hasContent(el)) giveBack(el);
        continue;
      }
      if (hasContent(el)) continue;   // it has content: not a placeholder
      /* the quote pages' holdings ring and range markers are empty boxes too */
      try { if (el.closest('.highcharts-root, [class*="logo"], [class*="brand"], donut, .donut-chart, app-price-range-indicator')) continue; } catch (e) { continue; }
      /* A legend swatch has a placeholder's shape, but recolorChartMarks owns
         it: dimmed, it would feed the chart mapper a grey. A box mark (the
         percentile pointer, black made white) is not one either. */
      if (isChartMark(el) || boxMarks.has(el)) continue;
      /* A form control's indicator is a small empty box too, and a checked
         one's brand green (#4FB53E) counts as light. */
      try { if (el.closest('label,[class*="radio" i],[class*="checkbox" i],[class*="switch" i],[class*="toggle" i],[class*="segment" i]')) continue; } catch (e) { continue; }

      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const img = cs.backgroundImage || 'none';
      if (img.indexOf('url(') !== -1) continue;               // artwork, not a placeholder
      const gradient = img.indexOf('gradient') !== -1;
      const bg = parseColor(cs.backgroundColor);
      /* A placeholder is grey (#E8E8E8 and neighbours); anything with real
         chroma is a control, badge or mark whose colour matters. */
      const chroma = bg ? rgbToHsl(bg.r, bg.g, bg.b)[1] : 0;
      if (chroma > 0.18) continue;
      const lightSolid = bg && bg.a > 0.4 && relLum(bg) > 0.3;
      const lightGrad = gradient && LIGHT_STOP.test(img);
      if (!lightSolid && !lightGrad) continue;

      const box = el.getBoundingClientRect();
      if (box.width < 8 || box.height < 4) continue;
      /* A small round dot is ink, not a skeleton (the Assistant's menu glyph
         is four 6px circles that processInline turns light). */
      if (box.width <= 12 && box.height <= 12) {
        const radius = cs.borderTopLeftRadius;
        const r = parseFloat(radius) || 0;
        if (/%/.test(radius) ? r >= 40 : r >= Math.min(box.width, box.height) / 2 - 0.5) continue;
      }

      placeheld.add(el);
      try {
        writeStyle(el, 'background-color', P.surf2, 'important');
        if (gradient) {
          writeStyle(el, 'background-image', 'linear-gradient(90deg, ' + SHIMMER + ')', 'important');
        }
        n++;
      } catch (e) { /* ignore */ }
    }
    return n;
  }

  /* A gradient counts as light if any stop in it is. */
  const LIGHT_STOP = /#(?:[c-f][0-9a-f]){3}\b|#[c-f][0-9a-f]{5}\b|\bwhite\b|rgba?\(\s*(?:1[9-9][0-9]|2[0-5][0-9])\s*,\s*(?:1[9-9][0-9]|2[0-5][0-9])\s*,\s*(?:1[9-9][0-9]|2[0-5][0-9])/i;

  /* --- spinners, found by what they do ------------------------------------ */
  /* Every route names its spinners differently, so they are found by
     mechanism: in a loading host (SPIN_SELECTOR), an element that spins
     (SPIN_ANIM, or a "spin" class). The selector stays narrow so the scan is
     cheap enough for the 500ms pass. */
  /* not "load", which also matches download, upload and preload and spends
     the budget before the real spinners are reached */
  const SPIN_SELECTOR =
    '[class*="spin" i],[class*="loading" i],[class*="loader" i],[class*="progress" i],' +
    '[role="progressbar"],[aria-busy="true"]';
  const SPIN_ANIM = /spin|rotat|chase|circular|dash|turn/i;
  let spinPlated = new WeakSet();

  function fixSpinners(scope) {
    const root_ = scope || document;
    let nodes;
    try { nodes = root_.querySelectorAll(SPIN_SELECTOR); } catch (e) { return 0; }
    /* budgeted by elements examined, not by a count of hosts */
    let n = 0, budget = 600;
    for (const host of nodes) {
      if (budget <= 0) break;
      /* the host and its parts: the arc is usually a descendant */
      let parts;
      try { parts = [host, ...host.querySelectorAll('*')].slice(0, 12); } catch (e) { continue; }
      for (const el of parts) {
        if (--budget <= 0) break;
        const cs = getComputedStyle(el);
        const spins = SPIN_ANIM.test(cs.animationName || '') || SPIN_ANIM.test(cs.transitionProperty || '');
        const isSvg = el.ownerSVGElement || el.tagName.toLowerCase() === 'circle';

        if (isSvg) {
          const stroke = parseColor(cs.stroke);
          if (stroke && stroke.a > 0.15 && contrast(stroke, parseColor(P.surf1)) < 3) {
            writeStyle(el, 'stroke', P.text2, 'important'); n++;
          }
          continue;
        }
        if (!spins && !/spin/i.test(String(el.className && (el.className.baseVal ?? el.className) || ''))) continue;

        /* A ring spinner's arc is the border sides that are not transparent;
           each side is lifted on its own, since colouring all four would make
           a static circle. */
        const sides = ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'].map(side => {
          const w = parseFloat(cs.getPropertyValue(side.replace('-color', '-width'))) || 0;
          return { side, w, c: w > 0 ? parseColor(cs.getPropertyValue(side)) : null };
        });
        /* A still element framed on all four sides in one colour is a box a
           spinner sits in (the Profile landing's page-loading card, named
           pvd4-spinner-root), not an arc: its frame is the theme's business. */
        if (!spins) {
          const drawn = sides.filter(s => s.c && s.c.a >= 0.12);
          if (drawn.length === 4 && drawn.every(s => s.c.r === drawn[0].c.r && s.c.g === drawn[0].c.g && s.c.b === drawn[0].c.b)) continue;
        }
        for (const { w, c, side } of sides) {
          if (w <= 0 || !c) continue;
          if (c.a < 0.12) continue;                 // the gap: leave it alone
          if (contrast(c, parseColor(P.surf1)) >= 3) continue;   // already visible
          writeStyle(el, side, P.text2, 'important'); n++;
        }
      }
    }

    /* The box a spinner sits in: a wheel is often centred in a small white box
       on a white page (the sign-in code step). The first painted box around a
       spinning wheel, if it holds no words and is not the page, is made
       transparent when light mode painted it the colour behind it. */
    const vw = self.innerWidth, vh = self.innerHeight;
    const near = (a, b) => a && b && Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) <= 9;
    /* not while the boot veil is up: it flattens every surface, so a box
       read now has no colour, and a verdict reached on it would be final */
    if (document.documentElement.classList.contains('fdm-boot')) return n;
    for (const host of nodes) {
      if (spinPlated.has(host)) continue;
      const hb = host.getBoundingClientRect();
      if (hb.width < 8 || hb.height < 8) continue;          // not on screen yet: seen again when it is
      spinPlated.add(host);
      let spinning = false;
      try {
        for (const el of [host, ...host.querySelectorAll('*')].slice(0, 12)) {
          if (SPIN_ANIM.test(getComputedStyle(el).animationName || '')) { spinning = true; break; }
        }
      } catch (e) { /* ignore */ }
      if (!spinning) continue;
      for (let a = host, depth = 0; a && depth < 5; a = a.parentElement, depth++) {
        if (a === document.body || a === document.documentElement) break;
        const r = a.getBoundingClientRect();
        if (r.width >= vw * 0.7 && r.height >= vh * 0.7) break;    // the page, not a plate
        if (showsText(a)) break;                                   // words make it a card
        const bg = parseColor(getComputedStyle(a).backgroundColor);
        if (!bg || bg.a < 0.5) continue;
        const chain = [];
        for (let e = a; e; e = e.parentElement) chain.push(e);
        const light = readLight(chain).map(parseColor);
        const under = light.slice(1).find(c => c && c.a >= 0.99) || { r: 255, g: 255, b: 255, a: 1 };
        if (light[0] && light[0].a >= 0.5 && near(light[0], under)) {
          writeStyle(a, 'background-color', 'transparent', 'important');
          n++;
        }
        break;                                                     // the first painted box decides
      }
    }
    return n;
  }

  /* --- sprite symbols ----------------------------------------------------- */
  /* Chrome paints a <use> clone from the referenced element's attributes, so
     a theme rule matching the sprite (`svg [stroke="#1d3986"]`) misses the
     icon drawn (the "i" beside Balance on the Performance page). Each fill and
     stroke attribute is rewritten to what the theme computes for it. */
  let symbolsDone = new WeakSet();
  const PAINT_SKIP = /^(?:none|currentcolor|inherit|transparent|url\()/i;

  function recolorSymbolTree(target) {
    let n = 0;
    let shapes;
    try { shapes = target.querySelectorAll('[fill], [stroke]'); } catch (e) { return 0; }
    for (const el of shapes) {
      let cs = null;
      for (const attr of ['fill', 'stroke']) {
        const raw = el.getAttribute(attr);
        if (!raw || PAINT_SKIP.test(raw.trim())) continue;
        const src = parseColor(raw);
        if (!src) continue;
        if (!cs) cs = getComputedStyle(el);
        const want = parseColor(cs.getPropertyValue(attr));
        if (!want) continue;
        if (want.r === src.r && want.g === src.g && want.b === src.b && Math.abs(want.a - src.a) < 0.01) continue;
        const out = want.a >= 0.995
          ? toHex(want.r, want.g, want.b)
          : 'rgba(' + want.r + ', ' + want.g + ', ' + want.b + ', ' + want.a + ')';
        writeAttr(el, attr, out); n++;
      }
    }
    return n;
  }

  function recolorSymbols(scope) {
    const root_ = scope || document;
    const targets = [];
    try {
      if (root_.matches && root_.matches('symbol')) targets.push(root_);
      for (const s of root_.querySelectorAll('symbol')) targets.push(s);
    } catch (e) { return 0; }
    /* a <use> may point at a non-symbol (a <g> in <defs>), cloned the same way */
    let uses;
    try { uses = root_.querySelectorAll('use'); } catch (e) { uses = []; }
    for (const u of uses) {
      const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
      if (href.charAt(0) !== '#') continue;
      let t = null;
      try {
        const doc = u.getRootNode();
        t = doc && doc.getElementById ? doc.getElementById(href.slice(1)) : null;
      } catch (e) { t = null; }
      if (t) targets.push(t);
    }
    let n = 0;
    for (const t of targets) {
      if (symbolsDone.has(t)) continue;
      symbolsDone.add(t);
      n += recolorSymbolTree(t);
    }
    return n;
  }

  function keyPaint(el) {
    if (el.namespaceURI === 'http://www.w3.org/2000/svg') return 'fill';
    const t = (el.textContent || '').trim();
    return t && KEY_GLYPH.test(t) ? 'color' : 'background-color';
  }

  /* An inline value as a lowercase hex, or null: the page writes `#143960`
     and the browser reads back `rgb(20, 57, 96)`, so raw strings never match. */
  function inlineHex(el, prop) {
    const v = el.style ? el.style.getPropertyValue(prop) : '';
    if (!v) return null;
    const c = parseColor(v);
    return c && c.a > 0 ? toHex(c.r, c.g, c.b) : null;
  }

  function paintKey(el, prop, src, cls, inlineNow) {
    const mapped = mapCategorical(src);
    const out = mapped ? mapped.toLowerCase() : null;
    const write = !!out && out !== src;
    swatchSource.set(el, { prop, src, out: write ? out : null, inline: inlineNow, gen: familyGen, cls });
    if (!write) return false;
    writeStyle(el, prop, mapped, 'important');
    /* the border too, so a 10px swatch reads as one solid colour */
    if (prop === 'background-color') writeStyle(el, 'border-color', mapped, 'important');
    return true;
  }

  let chartWide = false;

  function recolorChartMarks(scope) {
    const root_ = scope || document;
    let n = 0;
    if (tracksLater.length) {
      const fills = tracksLater;
      tracksLater = [];
      for (const f of fills) if (f.isConnected) showTrack(f);
    }

    /* Families first, so every answer below is settled. A family change
       alters answers that keys elsewhere already hold (a key list outside the
       chart, an early tooltip), so the whole page is then redone, once. */
    let grew = false;
    for (const svg of chartRootsOf(root_)) { if (chartFamilies(svg)) grew = true; showChartTrack(svg); }
    if (grew && root_ !== document && !chartWide) {
      chartWide = true;
      try { return recolorChartMarks(document); } finally { chartWide = false; }
    }

    let nodes;
    try { nodes = root_.querySelectorAll(POINT_SELECTOR); } catch (e) { nodes = []; }
    for (const el of nodes) {
      const seq = isSequentialMark(el);
      /* The source value per attribute, stamped with familyGen: a mark is
         mapped again only when Highcharts repaints it (hover, redraw) or a
         family's answers change. */
      let seen = pointSource.get(el);
      if (!seen) { seen = {}; pointSource.set(el, seen); }
      for (const attr of ['fill', 'stroke']) {
        const src = el.getAttribute(attr);
        if (!src || src === 'none' || src.indexOf('url(') === 0) continue;
        const stamp = src + '|' + familyGen;
        if (seen[attr] === stamp) continue;          // already mapped from this value
        const mapped = seq ? mapSequential(src) : mapCategorical(src);
        seen[attr] = stamp;
        if (!mapped || mapped.toLowerCase() === src.toLowerCase()) continue;
        writeStyle(el, attr, mapped, 'important'); n++;
      }
    }

    /* Keys go through mapCategorical, never the UI map, from their light-mode
       colour: one with no inline colour (the retirement projection's key list,
       painted from a stylesheet the engine rewrote) is read with readLight(). */
    const keyEls = new Set();
    try { for (const el of root_.querySelectorAll(SWATCH_SELECTOR)) keyEls.add(el); } catch (e) { /* ignore */ }
    try { for (const el of root_.querySelectorAll(KEY_SELECTOR)) if (isKey(el)) keyEls.add(el); } catch (e) { /* ignore */ }
    const unread = [];
    for (const el of keyEls) {
      /* An SVG legend symbol is a point, and the point pass owns it; only a
         tooltip's glyph is a key in SVG that nothing else reaches. */
      if (el.namespaceURI === 'http://www.w3.org/2000/svg' && !isKey(el)) continue;
      const prop = keyPaint(el);
      const cls = el.getAttribute('class') || '';
      const prev = swatchSource.get(el);
      let cur = inlineHex(el, prop);
      if (prev && prev.prop === prop) {
        const intact = prev.out ? cur === prev.out : cur === prev.inline;
        if (intact && prev.cls === cls) {
          if (prev.gen === familyGen || !prev.src) continue;
          if (paintKey(el, prop, prev.src, cls, prev.inline)) n++;
          continue;
        }
        /* Same element, new class: whatever it is keying now may be another
           colour. Ours comes off and light mode is asked again. */
        if (intact && prev.out) { clearStyle(el, prop); cur = inlineHex(el, prop); }
      }
      if (cur) { if (paintKey(el, prop, cur, cls, cur)) n++; }
      else unread.push(el);
    }
    if (unread.length) {
      const props = unread.map(keyPaint);
      const light = readLight(unread, props);
      unread.forEach((el, i) => {
        const c = parseColor(light[i]);
        const cls = el.getAttribute('class') || '';
        if (!c || c.a === 0) { swatchSource.set(el, { prop: props[i], src: null, out: null, inline: null, gen: familyGen, cls }); return; }
        if (paintKey(el, props[i], toHex(c.r, c.g, c.b), cls, null)) n++;
      });
    }

    /* A key drawn as a short line (the Performance page's balance chart: a
       16px div whose inline border-top is the series' colour). processInline
       leaves it to this pass; it takes the colour its line takes. */
    let keys;
    try { keys = root_.querySelectorAll('.highcharts-legend-item [style*="border-top"], .highcharts-legend-item [style*="border-bottom"]'); } catch (e) { keys = []; }
    for (const el of keys) {
      let seen = keyLineSource.get(el);
      if (!seen) { seen = {}; keyLineSource.set(el, seen); }
      for (const side of ['top', 'bottom']) {
        const prop = 'border-' + side + '-color';
        const norm = inlineHex(el, prop);
        if (!norm) continue;
        const prev = seen[side];
        /* Ours, still on it, and still the current answer: nothing to do. The
           page putting its own colour back is not ours, and is mapped again. */
        let src = norm;
        if (prev && norm === prev.out) {
          if (prev.gen === familyGen) continue;
          src = prev.src;
        }
        const mapped = mapCategorical(src);
        if (!mapped) continue;
        const out = mapped.toLowerCase();
        seen[side] = { src, out, gen: familyGen };
        if (out === norm) continue;
        writeStyle(el, prop, mapped, 'important');
        n++;
      }
    }
    return n;
  }

  /* --- the page is one colour --------------------------------------------- */
  let pageChecked = new WeakSet();
  const PAGE_WRAPPERS = 'body > *, body > * > *, body > * > * > *, body > * > * > * > *, main, [role="main"]';

  /* What light mode paints: the theme is lifted for one synchronous read,
     which never paints. The fdm-off class shuts off the theme's files and
     every emitted copy alike (gateSelector), so the read costs one style
     recalculation and leaves the page's stylesheets as they are. `props` is
     one property for every element or one per element; the default is
     background-color. */
  function readLight(els, props) {
    const html = document.documentElement;
    const wasOff = html.classList.contains('fdm-off');
    html.classList.add('fdm-off');
    /* An inline value this engine wrote (flattenPage's own canvas on a page
       wrapper, say) is not light mode either: it is put back to what the
       page had for the read, and restored after. */
    const lifted = [];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const p = Array.isArray(props) ? props[i] : (props || 'background-color');
      const saved = inlineOriginals.get(el);
      const rec = saved && saved[p];
      if (!rec || !('written' in rec) || !el.style || el.style.getPropertyValue(p) !== rec.written) continue;
      lifted.push([el, p, rec.written, el.style.getPropertyPriority(p)]);
      try {
        if (rec.value) el.style.setProperty(p, rec.value, rec.priority || '');
        else el.style.removeProperty(p);
      } catch (e) { /* ignore */ }
    }
    let out;
    try {
      out = els.map((el, i) => {
        const p = Array.isArray(props) ? props[i] : (props || 'background-color');
        return getComputedStyle(el).getPropertyValue(p);
      });
    }
    finally {
      for (const [el, p, value, priority] of lifted) {
        try { el.style.setProperty(p, value, priority); } catch (e) { /* ignore */ }
      }
      if (!wasOff) html.classList.remove('fdm-off');
    }
    return out;
  }

  /* --- the ACE chart's own dark theme ------------------------------------- */
  /* Fidelity's chart (the fidchart component around ChartIQ) is themed through
     --fidchart-* custom properties and ships a dark theme of its own, the
     class fidchart-theme-dark, which its canvas follows too: ChartIQ reads its
     drawing colours from hidden .stx_* probes that resolve the same tokens.
     Each chart container gets the class, for the long tail of tokens (dialogs,
     date picker, series palettes); 05-charts.css restates the main ones in the
     palette, so the chart agrees with the page around it. canvas.js redraws
     the chart when content.js says the class changed. */
  const ACE = '.ace-chart.ace-container';
  const ACE_THEME = 'fidchart-theme-dark';
  let aceThemed = new Set();

  function themeAce(scope) {
    const root_ = scope || document;
    let boxes;
    try {
      const up = root_.closest ? root_.closest(ACE) : null;
      boxes = up ? [up] : [...root_.querySelectorAll(ACE)];
    } catch (e) { return 0; }
    let n = 0;
    for (const el of boxes) {
      if (el.classList.contains(ACE_THEME)) continue;
      el.classList.add(ACE_THEME);
      /* containers that have left the page are let go, so moving from quote
         to quote does not keep every chart's tree alive */
      for (const old of aceThemed) if (!old.isConnected) aceThemed.delete(old);
      aceThemed.add(el);
      n++;
    }
    return n;
  }

  /* The page is one colour. Research pages paint white on the body and on a
     full-width <main> (Compare Funds); white maps to the card, the body to the
     canvas. So a card-coloured, in-flow wrapper spanning the page that light
     mode painted the page's own colour takes the canvas colour. The same for
     a wrapper spanning a painted panel in a colour one step from the panel's
     (the research tabs' #f4f4f4 card grid on the #f2f2f2 tab panel): light
     mode could not tell the two apart, so the wrapper goes see-through and
     shows the panel, instead of becoming one card-coloured field with the
     cards lost in it. */
  function flattenPage() {
    const body = document.body;
    if (!body) return 0;
    const vw = document.documentElement.clientWidth || self.innerWidth;
    const minH = Math.min(400, self.innerHeight * 0.5);
    const card = parseColor(P.surf1);
    const near = (a, b) => a && b && Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) <= 6;
    const width = el => { try { return el.getBoundingClientRect().width; } catch (e) { return 0; } };
    /* Wrappers that fill their parent are followed down from the body at any
       depth, not just PAGE_WRAPPERS' four levels: the planning app's page is
       a deep `section.main-body-container`, #f2f2f2 on a #f4f4f4 body, and a
       tab panel's padding leaves its grid a little short of the page. */
    const wide = [];
    const follow = (el, w, depth) => {
      for (const ch of el.children) {
        const cw = width(ch);
        if (cw < w * 0.9) continue;
        wide.push(ch);
        if (depth < 14) follow(ch, cw, depth + 1);
      }
    };
    follow(body, vw, 0);
    /* the nearest ancestor painted opaque: the backdrop the wrapper sits on */
    const backdropOf = el => {
      for (let a = el.parentElement; a && a !== body && a !== document.documentElement; a = a.parentElement) {
        const c = parseColor(getComputedStyle(a).backgroundColor);
        if (c && c.a >= 0.99) return a;
      }
      return null;
    };
    const cands = [], backdrops = [];
    for (const el of new Set([...document.querySelectorAll(PAGE_WRAPPERS), ...wide])) {
      if (pageChecked.has(el)) continue;
      const cs = getComputedStyle(el);
      const bg = parseColor(cs.backgroundColor);
      if (!bg || bg.a < 0.99 || !near(bg, card)) continue;
      if (cs.position === 'fixed' || cs.position === 'absolute' || cs.position === 'sticky') continue;
      const r = el.getBoundingClientRect();
      if (r.height < minH) continue;
      const under = backdropOf(el);
      if (r.width < (under ? width(under) : vw) * (under ? 0.9 : 0.97)) continue;
      if (el.style.getPropertyValue('background-color')) continue;   // someone wrote it inline
      cands.push(el); backdrops.push(under);
    }
    if (!cands.length) return 0;
    const light = readLight([body, document.documentElement, ...cands, ...backdrops.map(b => b || body)]).map(parseColor);
    const page = [light[0], light[1]].find(c => c && c.a >= 0.99) || { r: 255, g: 255, b: 255, a: 1 };
    let n = 0;
    cands.forEach((el, i) => {
      pageChecked.add(el);
      const c = light[i + 2];
      if (!c || c.a < 0.99) return;
      const underLight = backdrops[i] ? light[i + 2 + cands.length] : null;
      if (backdrops[i] && underLight && underLight.a >= 0.99) {
        if (!near(c, underLight)) return;
        writeStyle(el, 'background-color', 'transparent', 'important');
      } else {
        if (!near(c, page)) return;
        writeStyle(el, 'background-color', P.canvas, 'important');
      }
      n++;
    });
    return n;
  }

  root.FidelityDarkRecolor = {
    processSheets, processAdopted, processText, processInline, mapColor, enforceContrast,
    recolorIconImages, recolorChartMarks, recolorSymbols, dimPlaceholders, fixSpinners, flattenPage, enforceIconContrast, revert, themeAce, recheckScrims, pictureChanged, picturesChanged,
    writeStyle, pendingRemote, contrast, parseColor, isChartMark, canvasColor,
    /* the tests only: these, and mapColor and contrast above */
    tokenRole, collapseLightDark, rewriteValue, mapCategorical, mapSequential,
    rewriteSvgText, registerFamilies, boostSelector, gateSelector, readLight
  };
})(typeof self !== 'undefined' ? self : this);
