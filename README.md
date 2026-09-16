# GeoSquare support site

Two static pages App Store Connect requires a URL for:

| File | App Store Connect field |
|---|---|
| `index.html` | Support URL |
| `privacy.html` | Privacy Policy URL |

They share `style.css`, which is the app's own palette lifted out of the
original single-file policy page.

## Publishing

These files are meant to live in their own **public** repository, not in the
app repo — GitHub Pages only serves private repos on paid plans, and nothing
here needs the app's source next to it.

1. Create a public repo named `geosquare`.
2. Copy the three files into its root and push to `main`.
3. Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/`.
4. Wait for the first deploy, then check:
   - https://utkugulsoy.github.io/geosquare/
   - https://utkugulsoy.github.io/geosquare/privacy.html

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
