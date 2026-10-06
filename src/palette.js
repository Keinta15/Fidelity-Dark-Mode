/* Fidelity Dark Mode - palette.js: the palette and the light-to-dark tables
 * recolor.js uses. Values are Fidelity's own dark tokens (the dark half of the
 * light-dark() pairs in its stylesheets) or measured from its mobile app's dark
 * mode. The theme CSS repeats them as --fdm-* variables (00-base.css,
 * 06-fds.css), popup.css and content.js repeat some, and test/audit.js fails
 * if they drift. */
(function (root) {
  'use strict';

  const PALETTE = {
    /* Token names below are Fidelity's; "the app's" means measured from it. */

    /* --- surfaces --------------------------------------------------------- */
    sunken:   '#0E0E0E',  // wells, inset panels (below anything Fidelity names)
    canvas:   '#141414',  // surface-background
    recess:   '#1C1B1B',  // surface-container-background-low: data grids
    gridHead: '#000000',  // the app's grid header row (measured, not a token)
    surf1:    '#292928',  // surface-container-background: cards, panels
    surf2:    '#2F2F2F',  // surface-container-background-high: headers, hovered rows
    surf3:    '#323232',  // surface-container-background-highest: popovers, menus
    surf4:    '#403F3E',  // brand-charcoal / surface-line-subtle: selected states, bubbles

    /* --- ink -------------------------------------------------------------- */
    text:     '#FFFFFF',  // surface-foreground
    text2:    '#D9D8D5',  // surface-foreground-subtle
    text3:    '#ABAAA8',  // the #757473 secondary, lifted as Fidelity lifts it
    textDis:  '#757473',  // status-inactive-foreground
    textInv:  '#141414',  // accent-primary-foreground: ink on a bright fill

    /* --- lines ------------------------------------------------------------ */
    hair:     '#323232',  // a line that is barely there
    border:   '#403F3E',  // surface-line-subtle: default separation
    borderStr:'#757473',  // a divider meant to be seen
    borderCtl:'#ABAAA8',  // surface-line: control outlines, 6.3:1 on the card

    /* --- brand / actions -------------------------------------------------- */
    /* Greens are the app's: the phone saves Display P3 #76BD5A, which is sRGB
       #5CBF4A (lit state #7FC773). A filled control has dark ink, #141414. */
    green:    '#5CBF4A',  // the app's green: CTA fill, gain figure, success
    greenHov: '#7FC773',  // the app's lit green
    greenAct: '#48AC36',  // data-mono-green-5
    greenTxt: '#5CBF4A',  // green as text or icon
    btn:      '#5CBF4A',  // the app's primary button fill
    btnHov:   '#7FC773',  // the app's lit green, one step lighter
    btnAct:   '#8AD97C',  // accent-primary-background: pressed goes lighter still
    btnInk:   '#141414',  // accent-primary-foreground

    /* --- finance semantics ------------------------------------------------ */
    gain:     '#5CBF4A',  // the app's gain green (see above)
    /* The app's loss red, #F93E3E, reads 4.7:1 on its #1C1B1B grid but 4.0:1
       on the #292928 card, so a loss takes the web token (5.2:1 on the card). */
    loss:     '#FF6868',  // data-performance-loss
    gainBg:   '#0F5319',  // status-success-container-background-dim
    lossBg:   '#861616',  // status-error-container-background
    /* row emphasis (dividend paid, traded today): the app's answer to the
       #fffae5 wash; every ink on it clears AA (test/audit.js) */
    rowMark:  '#262100',

    /* --- links ------------------------------------------------------------ */
    link:     '#8CC1FD',  // surface-foreground-link
    linkHov:  '#B8D9FF',  // surface-foreground-link-interaction
    visited:  '#D4B3FB',  // data-categorical-3

    /* --- status ----------------------------------------------------------- */
    info:     '#60A5FA',  infoBg:    '#132454',  // status-info-background / -container-background
    warn:     '#FFC371',  warnBg:    '#7F330F',  // status-warning-background / -container-background
    crit:     '#FF6868',  critBg:    '#861616',  // status-error-background / -container-background
    success:  '#5CBF4A',  successBg: '#0F5319',

    focus:    '#FFFFFF',  // outline-color: #141414 -> #ffffff

    /* --- categorical chart marks ------------------------------------------ */
    /* data-asset-* dark values, verbatim: every series clears 3:1 on the card
       (#292928), and they differ by hue rather than lightness */
    chart: {
      domestic: '#3880F3',  // data-asset-domestic-stock
      foreign:  '#A3E2FF',  // data-asset-foreign-stock
      bonds:    '#8AD97C',  // data-asset-bonds
      fixed:    '#E2D698',  // data-asset-short-term
      other:    '#FFC371',  // data-asset-other
      unknown:  '#D4B3FB',  // data-asset-unknown
      shortTerm:'#E2D698'
    },
    /* Large filled areas (columns, bars, wedges) take the deeper step of the
       ramps, data-mono-green-5 and data-mono-red-5, so they do not glare. */
    gainFill: '#48AC36',
    lossFill: '#FA3939',

    chartTxt: {
      domestic: '#8CC1FD',  // data-mono-blue-3: the readable step of the blue ramp
      foreign:  '#A3E2FF',
      other:    '#FFC371',
      unknown:  '#D4B3FB'
    }
  };

  /* --- exact-match tables ------------------------------------------------- */

  /* Literal colours Fidelity ships, mapped by hand per role; mapColor() in
     recolor.js falls back to its formula for anything not listed. */
  const P = PALETTE;
  const EXACT = {
    /* Backgrounds take the dark value of Fidelity's token pair (the commonest,
       where a light value serves several). Not an inversion: the card stays
       above the page. */
    bg: {
      /* Near-whites that look alike on white collapse onto the card instead of
         inventing plates, the page tints take the page, and greys that show on
         white step up to surf2 or surf4. */
      '#ffffff': P.surf1,   '#fefefe': P.surf1,   '#fcfcfc': P.surf1,
      '#f9f7f5': P.canvas,  '#f8f8f8': P.canvas,  '#fafafa': P.canvas,
      '#f0f0f0': P.canvas,  '#f1f1f1': P.canvas,  '#efefef': P.canvas,
      '#f5f3f0': P.surf1,   '#f5f5f5': P.surf1,   '#f2f2f2': P.surf1,
      '#eeeeee': P.surf1,   '#ededed': P.surf1,
      '#e6e4e1': P.surf2,   '#e8e8e8': P.surf2,   '#e2e2e2': P.surf2,
      '#d9d8d5': P.surf4,   '#d8d8d8': P.surf4,
      /* marks, not panels (an empty Morningstar rating box): same as #d8d8d8 */
      '#cdcdcd': P.surf4,   '#cccccc': P.surf4,
      /* dark plates (tooltips, the footer) stay dark: black sinks below the
         card, the dark greys step up to surf4 */
      '#000000': P.sunken,  '#141414': P.surf4,   '#1f1f1f': P.surf4,
      '#333333': P.surf4,   '#525150': '#525150', '#292928': P.surf4,

      /* the traded-today row wash (.posweb-row-intraday) */
      '#fffae5': P.rowMark,   '#fffbe6': P.rowMark,

      /* pale status tints become Fidelity's dark container backgrounds */
      '#edfaeb': '#044014',   '#d4f3cf': P.successBg, '#c7edc0': P.successBg,
      '#f5faff': P.infoBg,    '#daebff': '#1D3986',
      '#fff1f1': P.critBg,    '#ffe0e0': '#A11313',
      '#fff8ed': P.warnBg,    '#fff0d4': '#9D3B0F',   '#fff0b3': '#9D3B0F',

      /* solid accent fills (buttons, badges, alert bars): a light fill with
         dark ink, see `btn` */
      '#368727': P.btn,       '#317b23': P.btnHov,   '#2b6b1e': P.btnAct,
      '#1e6f1d': P.green,     '#0f5319': P.green,
      /* the legacy research pages' button gradient, flattened to the CTA green
         (the contrast guard then darkens the white label) */
      '#3f8700': P.btn,       '#7aac4e': P.btn,
      /* the Feedback survey (Qualtrics, fmrpi): Submit and a chosen answer */
      '#6f9824': P.btn,       '#60831f': P.btnHov,   '#425a15': P.btnAct,
      '#8dc12e': P.btnHov,
      /* a selected filter chip's fill. Fidelity's tag token would make it
         #0f5319, 1.6:1 on the card, so it takes the green, with dark ink. */
      '#044014': P.green,
      '#568200': P.chart.bonds, '#446800': P.chart.bonds,
      '#65c754': '#65C754',   '#6ad539': '#6AD539',  '#99d78e': P.chart.bonds,
      '#0d6f3f': P.green,
      '#c31212': P.crit,      '#b41212': P.crit,     '#dc1616': P.crit,
      '#a11313': '#A11313',
      /* A navy background is a plate under white ink (Cash Management's
         selected account tile): #1D3986 keeps white at 10.6:1, where the
         chart blue would give 3.8:1. Charts: CHART_EXACT. */
      '#1d3986': '#1D3986',   '#2751c2': P.info,     '#132454': '#1D3986',
      '#013b61': '#1D3986',   '#024a7a': '#1D3986',  '#1373b4': P.info,
      '#356f95': P.info,      '#1dade2': P.chart.foreign, '#8cc1fd': '#1D3986',
      '#ffcd00': P.warn,      '#f0b429': P.warn,     '#cc4700': P.warn,
      '#9d3b0f': '#9D3B0F',   '#7f330f': '#7F330F',
      '#5c0198': '#9747F6',   '#9d66c1': P.chart.unknown, '#757a02': P.chart.fixed,
      '#757473': P.text3,     '#403f3e': P.surf4,    '#abaaa8': P.textDis,
      '#666666': '#525150',
      /* the CSS keywords green, red and blue */
      '#008000': P.btn,       '#ff0000': P.crit,     '#0000ff': P.info
    },

    /* Ink and accents used as text or icon fill. */
    fg: {
      '#ffffff': P.text,    '#fefefe': P.text,    '#f9f7f5': P.text,
      '#f5f3f0': P.text,    '#e6e4e1': P.text2,   '#d9d8d5': P.text2,
      '#000000': P.text,    '#121212': P.text,    '#141414': P.text,
      '#1f1f1f': P.text,    '#212121': P.text,    '#292928': P.text,
      '#333333': P.text,    '#3c3c3c': P.text2,   '#403f3e': P.text3,
      '#444444': P.text2,   '#525150': P.text2,   '#555555': P.text2,
      '#666666': '#B3B3B3', '#757473': P.text3,   '#767676': P.text3,
      '#888888': P.text3,   '#929292': P.text3,   '#999999': P.text3,
      '#7f7f7f': P.text3,   '#abaaa8': P.textDis,
      '#bbbbbb': P.textDis, '#cccccc': P.text3,

      /* accents, as Fidelity lifts them */
      '#368727': P.btn,      '#317b23': P.btn,      '#2b6b1e': P.btn,
      '#1e6f1d': P.gain,     '#0f5319': P.gain,     '#044014': P.btn,
      '#568200': P.chart.bonds, '#446800': P.chart.bonds,
      '#0d6f3f': P.gain,     '#65c754': '#65C754',  '#6ad539': '#6AD539',
      '#b41212': P.loss,     '#c31212': P.crit,     '#dc1616': P.crit,
      '#a11313': P.crit,
      '#1d3986': P.link,     '#2751c2': P.info,     '#366eb7': P.link,
      /* the positions grid's icon blue (the "E" and "D" earnings and dividend
         badges); the info blue reads 5.7:1 on the card */
      '#3266e0': P.info,
      '#000080': P.link,     '#0000ff': P.link,     '#00008b': P.link,
      '#132454': P.linkHov,  '#0c2b73': P.link,     '#8cc1fd': P.linkHov,
      '#013b61': P.link,     '#024a7a': P.info,     '#1373b4': P.info,
      '#1dade2': P.chart.foreign,
      /* the classic Performance view's four link blues (links, tabs, nav and
         "?" marks, a bare `a`) all take the link token */
      '#346e94': P.link,     '#356f95': P.link,     '#0e67a9': P.link,
      '#0f57c2': P.link,
      /* and the Feedback survey's, under its Legal Disclaimer */
      '#4b86ee': P.link,
      '#ffcd00': P.warn,     '#f0b429': P.warn,
      '#cc4700': P.warn,     '#9d3b0f': P.warn,     '#7f330f': '#FF9F37',
      '#5c0198': P.visited,  '#9d66c1': P.chartTxt.unknown,
      '#757a02': P.chart.fixed,
      '#008000': P.gain,     '#ff0000': P.loss
    },

    /* Lines, decorative by default; control outlines are set in the theme CSS
       (--fdm-border-ctl). */
    border: {
      /* white is not a line: invisible on white, it stays invisible on the
         card (recolor.js short-circuits it before the visibility floor) */
      '#ffffff': P.surf1,   '#f5f3f0': P.hair,    '#f2f2f2': P.hair,
      '#e6e4e1': P.border,  '#e2e2e2': P.border,  '#dddddd': P.border,
      '#d8d8d8': P.border,  '#cccccc': P.border,  '#c9c9c9': P.border,
      '#bbbbbb': P.borderStr, '#b3b3b3': P.borderStr,
      '#999999': P.borderStr, '#7f7f7f': P.borderCtl, '#757473': P.borderCtl,
      /* a black outline is Fidelity's strong line (outline-color goes
         #141414 -> #ffffff); the subtle ink keeps it from glaring */
      '#000000': P.text2,   '#141414': P.text2,   '#333333': P.borderStr,
      /* the fill green: it matches a filled button and reads on its own on an
         outline one (6.2:1 on the card) */
      '#368727': P.btn,     '#1e6f1d': P.btn,
      '#c31212': P.crit,    '#b41212': P.loss,
      '#1d3986': P.link,    '#366eb7': P.link,    '#024a7a': P.info,
      /* the apex-kit alert's border and left stripe share one token (#356F95
         on the classic pages), so both take the info blue */
      '#2751c2': P.info,    '#356f95': P.info,
      '#1373b4': P.info,    '#ffcd00': P.warn,    '#68b631': P.btn,
      /* the Feedback survey's focus line and chosen "Other" field */
      '#6f9824': P.btn,
      /* the research tables' sorted-column underline is the keyword green */
      '#008000': P.green,   '#ff0000': P.crit,    '#0000ff': P.link
    },

    /* Hue-carrying values whose meaning does not shift with role. */
    any: {
      '#9d66c1': P.chart.unknown
    }
  };


  /* --- chart marks -------------------------------------------------------- */

  /* Series colours skip the UI map, which trades hue for readable ink; a mark
     has to keep its category. Others go to mapCategorical() in recolor.js. */
  const CHART_EXACT = {
    /* asset allocation, answered with the data-asset-* dark values */
    '#143960': P.chart.domestic,  '#013b61': P.chart.domestic,
    '#1d3986': P.chart.domestic,  '#024a7a': P.chart.domestic,
    '#1dade2': P.chart.foreign,   '#1373b4': P.info,
    '#568200': P.chart.bonds,     '#446800': P.chart.bonds,
    '#ffcd00': P.chart.shortTerm, '#f0b429': P.chart.shortTerm,
    '#d24823': P.chart.other,     '#cc4700': P.chart.other,
    '#9d66c1': P.chart.unknown,   '#5c0198': P.chart.unknown,
    '#757a02': P.chart.fixed,     '#9b980b': P.chart.fixed,

    /* gain and loss columns: the deeper step of the two ramps */
    '#368727': P.gainFill,  '#317b23': P.gainFill,  '#2b6b1e': P.gainFill,
    '#1e6f1d': P.gainFill,  '#0f5319': P.gainFill,  '#0d6f3f': P.gainFill,
    '#65c754': '#65C754',   '#6ad539': '#6AD539',
    '#dc1616': P.lossFill,  '#c31212': P.lossFill,  '#b41212': P.lossFill,
    '#a11313': P.lossFill,

    /* neutral series and lines: black is a line (the balance spline), so it
       takes ink; white is the unfilled part of something (a bar's track, a
       scale's empty end), so it takes the card */
    '#000000': P.text,      '#333333': P.text2,     '#666666': P.text3,
    '#ffffff': P.surf1,     '#fefefe': P.surf1,     '#f5f5f5': P.surf1,
    '#f2f2f2': P.surf1,     '#e6e6e6': P.surf2
  };

  root.FidelityDarkPalette = { PALETTE, EXACT, CHART_EXACT };
})(typeof self !== 'undefined' ? self : this);
