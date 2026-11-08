# Auļu koncerti

Neliela mājaslapa grupas koncertu plānošanai. Katrs dalībnieks izvēlas savu vārdu un pie katra pasākuma atzīmē **Tieku / Netieku / Vēl nezinu**. Lapu aizsargā viena kopīga grupas parole.

- `public/` – lapa (HTML/CSS/JS, bez build soļa)
- `netlify/functions/api.mjs` – API, dati glabājas Netlify Blobs
- `lib/api.mjs` – API loģika

## Palaišana Netlify

1. Netlify: **Add new site → Import an existing project → GitHub** un izvēlies šo repozitoriju. Build iestatījumi tiek nolasīti no `netlify.toml`, neko nevajag mainīt.
2. **Site configuration → Environment variables** pievieno:
   - `BAND_PASSWORD` – grupas parole (mainot to, visi tiek izlogoti)
   - `SESSION_SECRET` – jebkura gara nejauša virkne
3. Pēc mainīgo pievienošanas **Deploys → Trigger deploy**.
4. Atver lapu, ielogojies, **Iestatījumi → Importēt no faila** un izvēlies sākuma datu JSON failu.

## Lokāli

```
npm install
BAND_PASSWORD=test npm run dev   # http://localhost:8888
```
