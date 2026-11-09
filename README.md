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

Ieslēgšana:
1. Izveido bezmaksas kontu [resend.com](https://resend.com) un pievieno savu domēnu (Domains → Add domain, DNS ieraksti). Bez sava domēna Resend ļauj sūtīt tikai uz paša konta e-pastu.
2. Resend → API Keys → izveido atslēgu.
3. Netlify → Environment variables: `RESEND_API_KEY` = atslēga, `REMINDER_FROM` = `Auļi <info@auli.lv>`.
   Testēšanai pievieno arī `REMINDER_ONLY` = `tavs@epasts.lv` (vairākus atdala ar komatu): kamēr tas ir iestatīts, atgādinājumi iet tikai uz šīm adresēm. Kad viss strādā, izdzēs `REMINDER_ONLY`, un tie ies visiem.
   Lai nepagaidītu līdz pirmdienai: Netlify → Logs & metrics → Functions → `reminders` → **Run now**.
4. Lapā → Iestatījumi ievadi dalībnieku e-pastus.

Bez šiem mainīgajiem funkcija neko nesūta.
