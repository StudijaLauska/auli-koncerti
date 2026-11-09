# Auļu koncerti

Neliela mājaslapa grupas koncertu plānošanai. Katrs dalībnieks izvēlas savu vārdu un pie katra pasākuma atzīmē **Tieku / Netieku** un var atstāt komentāru. Pēc noklusējuma lapai nav paroles: katrs, kam ir saite, var to atvērt un labot. Ja vajag paroli, Netlify pievieno `BAND_PASSWORD`.

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

## E-pasta atgādinājumi

Katru pirmdienu ap 9:00–10:00 (Rīgas laiks) `netlify/functions/reminders.mjs` nosūta katram dalībniekam, kam iestatījumos ir e-pasts, vienu e-pastu ar visiem gaidāmajiem pasākumiem, kuriem viņš vēl nav atbildējis (ne Tieku/Netieku, ne komentārs). Ja viss atzīmēts, e-pasts netiek sūtīts. E-pastā ir personīga saite `/?me=<id>`, kas atver lapu viņa vārdā.

Sūtīšana: ir divi varianti, der viens no tiem (ja iestatīti abi, izmanto Gmail).

**A. No Gmail adreses** (piem. aullietnotranss@gmail.com)
1. Šim Google kontam ieslēdz 2-Step Verification un izveido **App password**: https://myaccount.google.com/apppasswords
2. Netlify → Environment variables: `GMAIL_USER` = `aullietnotranss@gmail.com`, `GMAIL_APP_PASSWORD` = 16 burtu parole (atzīmē "Contains secret values").

**B. Caur Resend no sava domēna** (piem. info@auli.lv)
1. [resend.com](https://resend.com) → Domains → pievieno domēnu un DNS ierakstus; API Keys → izveido atslēgu.
2. Netlify → Environment variables: `RESEND_API_KEY` = atslēga, `REMINDER_FROM` = `Auļi <info@auli.lv>`.

Testēšanai pievieno arī `REMINDER_ONLY` = `tavs@epasts.lv` (vairākus atdala ar komatu): kamēr tas ir iestatīts, atgādinājumi iet tikai uz šīm adresēm. Kad viss strādā, izdzēs `REMINDER_ONLY` un pievieno `REMINDER_ALL` = `1` (bez viena no šiem diviem nekas netiek sūtīts).
Pēc mainīgo maiņas: Deploys → Trigger deploy. Lai nepagaidītu līdz pirmdienai: Logs → Functions → `reminders` → **Run now**.
Lapā → Iestatījumi ievadi dalībnieku e-pastus.

Bez šiem mainīgajiem funkcija neko nesūta.
