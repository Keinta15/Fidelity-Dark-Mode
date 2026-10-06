# Privacy

Fidelity Dark Mode is a theme. It changes the colors of Fidelity's web pages
in your browser and does nothing else.

It does not collect any data. There is no analytics, no tracking, no sign-in
and no server behind it. Nothing about you, your accounts or the pages you
visit is recorded or sent anywhere.

The only thing it stores is your on/off setting, in Chrome's extension
storage, so it follows your Chrome profile.

To recolor a page it reads the page's styles and colors in memory while the
page is open, the same way a browser theme or a custom stylesheet would. It
does not read, save or transmit page content. Some of Fidelity's stylesheets
and icons come from Fidelity's other domains, and the extension fetches those
files directly so they can be recolored too; those requests go only to the
Fidelity hosts listed below, carry no cookies, and nothing fetched is ever run
as code.

## Permissions

| Permission | Why it's needed |
|---|---|
| `storage` | Saves the on/off switch. |
| `scripting` | While dark mode is off, keeps pages light from their first paint. |
| `*.fidelity.com`, `*.fidelityrewards.com` | The pages the theme applies to. |
| `*.fidelity.wallst.com` | Fidelity's research pages load stylesheets and icons from here. |
| `fmrpi.az1.qualtrics.com` | Fidelity's Feedback tab opens a survey from this host. |

## Questions

Open an issue at
<https://github.com/bradleyw95/Fidelity-Dark-Mode/issues>, and please leave
any personal or account details out of it.
