# Contributing

Thanks for helping out. A few things first.

## Keep your information out of it

Fidelity pages are full of personal and financial details. Before you post a
screenshot, some HTML or a console log, remove or blur:

- names, addresses, phone numbers and email addresses
- account numbers and card digits
- balances, positions, orders and transaction history

A description of the spot is usually enough ("Positions page, the menu on a
row"). Leave the query string off any Fidelity URL you paste, since it can
contain account numbers.

## Reporting a problem

Say which page it was (the path is enough, for example
`/ftgw/digital/portfolio/positions`), what looks wrong, and what the same spot
looks like with the theme switched off. Your Chrome version helps too.

## Making changes

There's no build step: the files in `src/` are what Chrome loads. After an
edit, reload the extension in `chrome://extensions` and refresh the Fidelity
tab.

Run the tests before opening a pull request:

```
npm install
npx playwright install chromium
npm test
```

If you fix something visual, add a check to `test/render.js` that fails
without your change. Fixtures in `test/` have to be made up: small pages that
copy the structure that broke. Please don't commit HTML, CSS or images copied
from Fidelity's site, and never anything from a signed-in page.

The code is plain JavaScript and CSS. Keep comments short and about why, not
what.
