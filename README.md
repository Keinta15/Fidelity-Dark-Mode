# Fidelity Dark Mode

Fidelity Dark Mode is an unofficial browser extension that adds a dark theme
to fidelity.com. The palette is modeled on the dark mode in Fidelity's mobile
app, so the website looks consistent with the app when the app is in dark
mode.

**[Install it from the Chrome Web Store](https://chromewebstore.google.com/detail/fidelity-dark-mode/bldgiageknkcfafafdmgifbdegngjdfd)**

This is an independent project and is not affiliated with Fidelity
Investments. See the [disclaimer](#disclaimer) for details.

## Features

- Covers the signed-in site, research and screener pages, the public site and
  the Fidelity Rewards card site.
- Recolors charts, icons, tooltips and menus, not just page backgrounds.
- Checks text against WCAG AA contrast and corrects colors that fall short.
- Keeps pages from flashing white while they load.
- Turns off instantly from the toolbar, with no page reload.
- Collects no data and includes no analytics or tracking.

## Chrome installation

Install Fidelity Dark Mode from the
[Chrome Web Store](https://chromewebstore.google.com/detail/fidelity-dark-mode/bldgiageknkcfafafdmgifbdegngjdfd),
then open or refresh any Fidelity page. Updates install automatically.

Chrome 111 or later is required. Other Chromium-based browsers that can
install from the Chrome Web Store, such as Edge and Brave, may also work but
are not tested.

### Firefox

Firefox 142 or later is required. To run the latest code from this repository:

1. Download or clone this repository, install Node.js 18 or later, and run
   `npm ci` followed by `npm run build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...** and select
   `dist/firefox/manifest.json`.
4. Open or refresh any Fidelity page.

Temporary add-ons are removed when Firefox closes. For a persistent
installation, package the contents of `dist/firefox` as a ZIP and submit it
through Mozilla Add-ons.

### From source in Chrome

To load the Chrome version directly, download or clone this repository, open
`chrome://extensions`, turn on **Developer mode**, and select **Load unpacked**
with the repository folder. If the store version is also installed, turn it
off while the unpacked copy is on, so the two do not both theme the page.

## Usage

The theme is enabled as soon as the extension is installed. Click the toolbar
icon to turn it on or off. The change applies to every open Fidelity tab right
away, and the setting is saved to your browser profile.

## Privacy

Fidelity Dark Mode does not collect, store or transmit any personal or account
information. All processing happens locally in your browser: the extension
reads the colors and layout of each page in order to recolor it, and nothing
it reads is saved or sent anywhere. It changes how pages look and does nothing
else: it does not place trades, move money, change account settings or fill
in forms.

See [PRIVACY.md](PRIVACY.md) for details, including what each browser
permission is used for.

## How it works

Fidelity's site defines design tokens (CSS variables), but most of its colors
are written directly into its stylesheets, and new stylesheets load as you move
between pages. The theme is built in layers to handle that:

- **Design tokens.** `src/theme/01-tokens.css` points Fidelity's own tokens at
  the dark palette.
- **Stylesheet rewriting.** `src/recolor.js` reads each Fidelity stylesheet as
  it loads, maps every color in it and re-applies the mapped declarations under
  the original selectors. Because it reuses Fidelity's selectors, the theme
  keeps working when the page markup changes.
- **Charts.** Highcharts sets chart colors as SVG attributes, which
  `src/theme/05-charts.css` overrides with CSS. Some research charts are drawn
  on a canvas with Chart.js instead, out of reach of CSS. For those,
  `src/canvas.js` runs inside the page and swaps the colors each chart draws
  with, using the same color tables as everything else. The quote pages' price
  chart is themed through Fidelity's own `--fidchart-*` design tokens, which
  its canvas reads too; the extension applies Fidelity's dark theme for it and
  restates the main tokens in this palette. Other canvases on the page are
  left alone.
- **Shadow DOM.** Components with their own shadow root receive a matching
  stylesheet.
- **Images and icons.** SVG icons are edited directly, dark-on-transparent
  images are inverted and photos are left unchanged.
- **Contrast.** A final pass measures the text and background colors as they
  were actually rendered and corrects any pair below WCAG AA.
- **Loading.** Surfaces stay dark until the first pass completes, and
  stylesheets from other domains are held back until the extension's service
  worker has fetched and rewritten them.

The remaining files in `src/theme` cover components that cannot be handled
automatically.

## Palette

The colors come from Fidelity's own dark-mode tokens and from the dark mode in
the mobile app. `src/palette.js` is the single source of truth, and
[`docs/palette.html`](docs/palette.html) shows every light color next to its
dark counterpart (open it in a browser).

| Role | Color |
|---|---|
| Page background | `#141414` |
| Card | `#292928` |
| Hovered row, header | `#2F2F2F` |
| Menu, popover | `#323232` |
| Selected item, subtle line | `#403F3E` |
| Text (primary, secondary, tertiary) | `#FFFFFF`, `#D9D8D5`, `#ABAAA8` |
| Button | `#5CBF4A` with `#141414` text |
| Gain, loss | `#5CBF4A`, `#FF6868` |
| Link | `#8CC1FD` |

## Development

There is no build step for Chrome: it loads the files in `src/` directly. For
Firefox, `npm run build:firefox` creates a loadable extension in
`dist/firefox/` and the ZIP-format add-on package at
`dist/fidelity-dark-mode-firefox.xpi`, using the Firefox-specific manifest.
After making a change, reload the extension in the browser, then refresh the
Fidelity tab.

### Firefox source-code submission

The Firefox build uses a custom Node.js packaging script, so submit the
matching source code with every version sent to Mozilla Add-ons. Include this
README, `package.json`, `package-lock.json`, `manifest.firefox.json`,
`scripts/build-firefox.js`, `LICENSE`, and the `src/`, `popup/`, and `icons/`
directories in the source archive. Do not include `node_modules/` or the
generated `dist/` directory.

The build requires Windows, macOS, or Linux supported by Node.js 18 or later,
with npm 9 or later. Install Node.js from [nodejs.org](https://nodejs.org/);
npm is included with Node.js. The packaging dependency `archiver` 8.0.0 and
its dependencies are installed at the versions recorded in
`package-lock.json` by `npm ci`; no global build tools are required. Once
dependencies are installed, packaging runs locally without a browser or
network service. The development tests additionally use Playwright and its
Chromium browser, but these are not used to build the add-on.

To create a source archive from a committed checkout, run
`git archive --format=zip --output=fidelity-dark-mode-source.zip HEAD`.
Alternatively, the source ZIP downloaded from the repository contains the
same tracked files.

To reproduce the submitted add-on from the source archive:

1. Extract the archive and open a terminal in the extracted project directory.
2. Run `npm ci` to install the exact locked dependencies.
3. Run `npm run build:firefox`.
4. The generated add-on is `dist/fidelity-dark-mode-firefox.xpi`. Its
   uncompressed payload is also available in `dist/firefox/`, with
   `manifest.json` at the root.

The script copies the extension source files unchanged, selects
`manifest.firefox.json` as the packaged manifest, and creates an XPI archive.
It does not transpile, concatenate, minify, or generate extension source code.

The test suites require Node 18 or later:

```
npm install
npx playwright install chromium
npm test
```

- `test/audit.js` checks the color mappings on their own: contrast, palette
  values and token rules.
- `test/render.js` loads the extension's files into Chromium over the fixture
  pages in `test/` and checks the colors that were actually painted.

The fixtures are synthetic pages that reproduce the structures behind past
bugs. They require no Fidelity login and contain no account data.

`npm run package` builds `fidelity-dark-mode.zip` from the latest commit,
containing only the files the extension needs.

### Project layout

```
manifest.json
src/
  palette.js        palette and light-to-dark color tables
  recolor.js        recolor engine
  content.js        runs the recolor passes and watches for new content
  canvas.js         recolors Chart.js canvas charts from inside the page
  background.js     fetches stylesheets from other domains for the engine
  gate-off.js       keeps pages light from their first paint while the theme is off
  theme/            theme CSS, 00-base.css through 06-fds.css
popup/              toolbar popup with the on/off switch
icons/              extension icons
test/               audit.js, render.js and their fixture pages
docs/palette.html   palette reference, light next to dark
```

## Known limitations

- Pages print with Fidelity's standard light styles, so statements and other
  documents print as usual.
- A few stylesheets are served from other domains and are fetched separately,
  so those parts of a page can take a moment longer to turn dark.
- Fidelity updates its site often, and new pages or components may appear
  unthemed until they are added. Please report anything that looks light or
  hard to read.
- The extension only changes colors, never content. If a figure ever looks
  wrong, turn the theme off to compare.

## Contributing

Bug reports and pull requests are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening one, and never include
account numbers, balances, names or other personal information in an issue
or screenshot.

## Disclaimer

Fidelity Dark Mode is an independent project and is not affiliated with,
endorsed by or sponsored by Fidelity Investments or FMR LLC. Fidelity,
Fidelity Investments and the Fidelity logo are trademarks of FMR LLC and are
used here only to identify the website this extension works with.

The extension changes only how pages appear in your browser. It does not
provide financial advice and is provided as is, without warranty of any kind.
See the [license](LICENSE) for details.

## License

Released under the [MIT License](LICENSE).
