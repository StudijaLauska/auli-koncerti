// Every Monday morning (Riga time) e-mail each member a list of upcoming events they haven't answered.
// Needs env vars RESEND_API_KEY and REMINDER_FROM (e.g. "Auļi <info@auli.lv>", a domain verified in Resend).
// Optional REMINDER_ONLY: comma-separated e-mails; while set, only those members get reminders (for testing).
import { getStore } from '@netlify/blobs';
import { loadAll } from '../../lib/api.mjs';
import { buildReminders, reminderHtml } from '../../lib/reminders.mjs';

export default async () => {
  const key = Netlify.env.get('RESEND_API_KEY');
  const from = Netlify.env.get('REMINDER_FROM');
  if (!key || !from) {
    console.log('Atgādinājumi izslēgti: nav RESEND_API_KEY vai REMINDER_FROM');
    return;
  }
  const siteUrl = Netlify.env.get('URL') || process.env.URL;
  const data = await loadAll(getStore({ name: 'auli', consistency: 'strong' }));
  const only = (Netlify.env.get('REMINDER_ONLY') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const reminders = buildReminders(data, siteUrl)
    .filter((r) => r.member.email)
    .filter((r) => !only.length || only.includes(r.member.email.toLowerCase()));
  if (only.length) console.log('Testa režīms (REMINDER_ONLY): sūta tikai', only.join(', '));
  for (const r of reminders) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: r.member.email,
        subject: `Auļi: atzīmējies ${r.events.length} ${r.events.length === 1 ? 'pasākumam' : 'pasākumiem'}`,
        text: r.text,
        html: reminderHtml(r),
      }),
    });
    console.log(r.member.name, res.status, res.ok ? '' : await res.text());
  }
};

// 07:00 UTC = 09:00/10:00 in Riga.
export const config = { schedule: '0 7 * * 1' };
