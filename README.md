# Auļu koncerti

Neliela mājaslapa grupas koncertu plānošanai. Katrs dalībnieks izvēlas savu vārdu un pie katra pasākuma atzīmē **Tieku / Netieku / Vēl nezinu**. Pēc noklusējuma lapai nav paroles: katrs, kam ir saite, var to atvērt un labot. Ja vajag paroli, Netlify pievieno `BAND_PASSWORD`.

- `public/` – lapa (HTML/CSS/JS, bez build soļa)
- `netlify/functions/api.mjs` – API, dati glabājas Netlify Blobs
- `lib/api.mjs` – API loģika

## Palaišana Netlify

1. Netlify: **Add new site → Import an existing project → GitHub** un izvēlies šo repozitoriju. Build iestatījumi tiek nolasīti no `netlify.toml`, neko nevajag mainīt.
2. Atver lapu, **Iestatījumi → Importēt no faila** un izvēlies sākuma datu JSON failu.
3. (Neobligāti) Paroles ieslēgšana: **Site configuration → Environment variables** pievieno `BAND_PASSWORD` (grupas parole) un `SESSION_SECRET` (jebkura gara nejauša virkne), tad **Deploys → Trigger deploy**.

## Lokāli

```
npm install
npm run dev   # http://localhost:8888 (ar paroli: BAND_PASSWORD=test npm run dev)
```
