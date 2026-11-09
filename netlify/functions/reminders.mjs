// Every Monday morning (Riga time) e-mail each member a list of upcoming events they haven't answered.
// Sending, whichever is configured (Gmail wins if both are):
//   Gmail:  GMAIL_USER (e.g. aullietnotranss@gmail.com) + GMAIL_APP_PASSWORD (Google "App password", needs 2-step verification)
//   Resend: RESEND_API_KEY + REMINDER_FROM (e.g. "Auļi <info@auli.lv>", a domain verified in Resend)
// Optional REMINDER_ONLY: comma-separated e-mails; while set, only those members get reminders (for testing).
import { getStore } from '@netlify/blobs';
import nodemailer from 'nodemailer';
import { loadAll } from '../../lib/api.mjs';
import { buildReminders, reminderHtml } from '../../lib/reminders.mjs';

function makeSender(env) {
  const gmailUser = env('GMAIL_USER');
  const gmailPass = env('GMAIL_APP_PASSWORD');
  if (gmailUser && gmailPass) {
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailPass.replace(/\s+/g, '') } });
    const from = { name: 'Auļi', address: gmailUser };
    return async (msg) => {
      try { await transport.sendMail({ from, ...msg }); return 'ok'; } catch (err) { return 'KĻŪDA ' + err.message; }
    };
  }
  const key = env('RESEND_API_KEY');
  const from = env('REMINDER_FROM');
  if (key && from) {
    return async (msg) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, ...msg }),
      });
      return res.ok ? 'ok' : 'KĻŪDA ' + res.status + ' ' + (await res.text());
    };
  }
  return null;
}

export default async () => {
  const env = (k) => Netlify.env.get(k);
  const send = makeSender(env);
  if (!send) {
    console.log('Atgādinājumi izslēgti: nav ne GMAIL_USER + GMAIL_APP_PASSWORD, ne RESEND_API_KEY + REMINDER_FROM');
    return;
  }
  const siteUrl = env('URL') || process.env.URL;
  const data = await loadAll(getStore({ name: 'auli', consistency: 'strong' }));
  const only = (env('REMINDER_ONLY') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const reminders = buildReminders(data, siteUrl)
    .filter((r) => r.member.email)
    .filter((r) => !only.length || only.includes(r.member.email.toLowerCase()));
  if (only.length) console.log('Testa režīms (REMINDER_ONLY): sūta tikai', only.join(', '));
  if (!reminders.length) console.log('Nevienam nav neatzīmētu pasākumu, nekas netiek sūtīts');
  for (const r of reminders) {
    const n = r.events.length;
    const status = await send({
      to: r.member.email,
      subject: `Auļi: atzīmējies ${n} ${n === 1 ? 'pasākumam' : 'pasākumiem'}`,
      text: r.text,
      html: reminderHtml(r),
    });
    console.log(r.member.name, r.member.email, n, status);
  }
};

// 07:00 UTC = 09:00/10:00 in Riga.
export const config = { schedule: '0 7 * * 1' };
