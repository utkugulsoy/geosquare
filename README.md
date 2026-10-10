# GeoSquare site

| Path | What it is |
|---|---|
| `index.html` | Support page — App Store Connect's Support URL |
| `privacy.html` | Privacy policy — App Store Connect's Privacy Policy URL |
| `play/` | The daily grid, playable in a browser |

The two App Store pages share the root `style.css`, which is the app's own
palette lifted out of the original single-file policy page. `play/` is
self-contained and shares nothing with them.

## play/

A build, not a source tree. It is generated in the app repo under `web/`
and copied here whole; edit it there, never here. Its own README and build
scripts (`build_puzzles.py`, `build_strings.py`, `check_fresh.py`,
`freeze_grids.swift`) stay in the app repo because they read the app's
Swift sources.

What it serves: one 3x3 grid a day, the same for everyone, frozen through
2030-12-31 and resolved entirely in the browser. No account, no backend,
no tracking, nothing stored but the day's own progress in `localStorage`.
It links back to `../` and `../privacy.html`, so those two files moving
would break its footer.

## Published

A **public** repo on purpose: GitHub Pages only serves private repos on paid
plans, and nothing here needs the app's source next to it. Pages is set to
"Deploy from a branch", `main`, folder `/`; a push redeploys within a minute
or two.

- https://utkugulsoy.github.io/geosquare/
- https://utkugulsoy.github.io/geosquare/privacy.html
- https://utkugulsoy.github.io/geosquare/play/

## Two things to keep in sync

- Contact is `utku@gulsoy.net` first, with
  `https://github.com/utkugulsoy/geosquare/issues` as the public alternative,
  so **Issues must stay enabled** on that repo. If the repo is ever renamed or
  moved to an organisation, grep for `utkugulsoy/geosquare` and fix both pages.
  The domain is only ever an address here — no page on it is linked, and
  nothing about the site depends on it resolving.
- The pages describe how the app actually behaves — four lives, one compass a
  day, the 10:00 reminder and the 20:00 streak warning, no sync between
  devices. Change the app, change these.
