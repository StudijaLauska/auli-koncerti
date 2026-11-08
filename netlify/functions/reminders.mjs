// Every Monday morning (Riga time) e-mail each member a list of upcoming events they haven't answered.
// Needs env vars RESEND_API_KEY and REMINDER_FROM (e.g. "Auļi <koncerti@yourdomain.lv>", a domain verified in Resend).
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
  const reminders = buildReminders(data, siteUrl).filter((r) => r.member.email);
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
