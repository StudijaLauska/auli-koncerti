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

## Push paziņojumi

Lapa var sūtīt paziņojumus uz telefonu vai datoru, kad:
- pievienots jauns pasākums;
- pasākuma statuss mainās no **Organizējas** uz **Apstiprināts** vai **Atcelts**.

Paziņojumu nesaņem ierīce, no kuras izmaiņa veikta. Katrs ieslēdz paziņojumus pats: lapā parādās poga **Ieslēgt paziņojumus** (tā ir arī Iestatījumos, kur var arī nosūtīt testa paziņojumu vai izslēgt).
- **iPhone/iPad** (iOS 16.4+): tikai no sākuma ekrāna. Safari → Kopīgot → Pievienot sākuma ekrānam, tad atver lapu no sākuma ekrāna un ieslēdz paziņojumus. Safari cilnē lapa rāda šo norādi pogas vietā.
- **Android, dators**: strādā tieši pārlūkā (Chrome, Edge, Firefox, Safari).

Iestatīšana (vienreiz, bez maksas, papildu servisi nav vajadzīgi):
1. Uzģenerē atslēgu pāri: `npx web-push generate-vapid-keys`
2. Netlify → Site configuration → Environment variables: `VAPID_PUBLIC_KEY` = Public Key, `VAPID_PRIVATE_KEY` = Private Key (atzīmē "Contains secret values"). Neobligāti `VAPID_SUBJECT` = `mailto:kontakta@epasts.lv`.
3. Deploys → Trigger deploy.

Bez šiem mainīgajiem paziņojumu poga netiek rādīta un nekas netiek sūtīts. Abonementi glabājas Netlify Blobs (`push/…`), tie neparādās datu kopijā un imports tos neizdzēš. Ja atslēgas nomaina, visiem paziņojumi jāieslēdz no jauna.
