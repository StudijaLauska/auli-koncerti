// Builds one weekly reminder per member listing every upcoming event they have not answered.
// Shared by the scheduled e-mail function and (as plain text) by the page's WhatsApp buttons.

const MONTHS = ['janvārī', 'februārī', 'martā', 'aprīlī', 'maijā', 'jūnijā', 'jūlijā', 'augustā', 'septembrī', 'oktobrī', 'novembrī', 'decembrī'];

export function todayStr(now = new Date()) {
  // Latvian calendar day, so a Monday-morning run sees the right "today".
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Riga' }).format(now);
}

export function fmtDate(iso) {
  if (!iso) return 'datums vēl nav zināms';
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}. gada ${d}. ${MONTHS[m - 1]}`;
}

export function unanswered(data, memberId, today) {
  const mine = data.answers[memberId] || {};
  return data.events.filter((e) => {
    const last = e.endDate || e.date;
    if (e.status === 'cancelled' || (last && last < today)) return false;
    const a = mine[e.id]?.a;
    return a !== 'yes' && a !== 'no';
  });
}

export function reminderText(member, events, link) {
  const first = member.name.split(/\s+/)[0];
  const lines = events.map((e) => `• ${e.title} – ${fmtDate(e.date)}${e.place ? ', ' + e.place : ''}`);
  return `Sveiks, ${first}! Auļu koncertu lapā vēl neesi atzīmējies ${events.length === 1 ? 'šim pasākumam' : 'šiem pasākumiem'}:\n\n${lines.join('\n')}\n\nAtzīmējies šeit: ${link}`;
}

export function buildReminders(data, siteUrl, now = new Date()) {
  const today = todayStr(now);
  const out = [];
  for (const m of data.members) {
    const events = unanswered(data, m.id, today);
    if (!events.length) continue;
    const link = `${siteUrl.replace(/\/$/, '')}/?me=${encodeURIComponent(m.id)}`;
    out.push({ member: m, events, link, text: reminderText(m, events, link) });
  }
  return out;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function reminderHtml(r) {
  const first = r.member.name.split(/\s+/)[0];
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1f1a17;max-width:520px">
  <p>Sveiks, ${esc(first)}!</p>
  <p>Auļu koncertu lapā vēl neesi atzīmējies ${r.events.length === 1 ? 'šim pasākumam' : 'šiem pasākumiem'}:</p>
  <ul style="padding-left:20px">${r.events.map((e) => `<li><b>${esc(e.title)}</b> – ${esc(fmtDate(e.date))}${e.place ? ', ' + esc(e.place) : ''}</li>`).join('')}</ul>
  <p><a href="${esc(r.link)}" style="display:inline-block;background:#b5651d;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">Atzīmēties</a></p>
  <p style="color:#6f655c;font-size:13px">Šis atgādinājums tiek sūtīts reizi nedēļā, kamēr kādam pasākumam nav atbildes.</p>
</div>`;
}
