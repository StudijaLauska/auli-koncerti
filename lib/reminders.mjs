// Builds one weekly e-mail per member: upcoming events they have not answered, plus events whose
// status changed in the past 7 days. A member who answered everything gets only the status changes;
// with neither, no e-mail.

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
    const ans = mine[e.id];
    // Answered = Tieku/Netieku, or at least a comment.
    return !(ans?.a === 'yes' || ans?.a === 'no' || ans?.note?.trim());
  });
}

const STATUS = { confirmed: 'Apstiprināts', planning: 'Organizējas', cancelled: 'Atcelts' };

// Upcoming events whose status changed in the last 7 days (and didn't end up back where it started).
export function statusChanges(data, now = new Date(), today = todayStr(now)) {
  const since = new Date(now.getTime() - 7 * 864e5).toISOString();
  return data.events.filter((e) => {
    const last = e.endDate || e.date;
    if (last && last < today) return false;
    return e.statusChangedAt && e.statusChangedAt >= since && e.statusFrom && e.statusFrom !== e.status;
  });
}

const statusLine = (e) => `${STATUS[e.statusFrom] || e.statusFrom} → ${STATUS[e.status] || e.status}`;
const evLine = (e) => `${e.kind === 'rehearsal' ? 'Mēģinājums: ' : ''}${e.title} – ${fmtDate(e.date)}${e.time ? ', ' + e.time : ''}${e.place ? ', ' + e.place : ''}`;

// Latvian vocative of a first name: Kaspars → Kaspar, Gatis → Gati, Mārtiņš → Mārtiņ, Jānis → Jāni.
// Feminine names (-a, -e) and anything else stay as they are.
export function vocative(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  if (/[^aeiouāēīū]s$/i.test(first) || /is$/i.test(first) || /us$/i.test(first)) return first.slice(0, -1);
  if (/š$/i.test(first)) return first.slice(0, -1);
  return first;
}

const greeting = (name) => (/[ae]$/i.test(String(name || '').trim().split(/\s+/)[0]) ? 'Sveika' : 'Sveiks') + ', ' + vocative(name) + '!';

export function reminderText(member, events, link, changes = []) {
  const parts = [greeting(member.name)];
  if (events.length) parts.push(`Auļu koncertu lapā vēl neesi atzīmējies ${events.length === 1 ? 'šim pasākumam' : 'šiem pasākumiem'}:\n\n${events.map((e) => '• ' + evLine(e)).join('\n')}`);
  if (changes.length) parts.push(`Šonedēļ mainījies statuss:\n\n${changes.map((e) => `• ${statusLine(e)}: ${evLine(e)}`).join('\n')}`);
  parts.push(`${events.length ? 'Atzīmējies' : 'Apskati'} šeit: ${link}`);
  return parts.join('\n\n');
}

export function reminderSubject(r) {
  const n = r.events.length;
  if (n) return `Auļi: atzīmējies ${n} ${n === 1 ? 'pasākumam' : 'pasākumiem'}`;
  const c = r.changes.length;
  return `Auļi: ${c === 1 ? 'mainījies pasākuma statuss' : 'mainījušies pasākumu statusi'}`;
}

export function buildReminders(data, siteUrl, now = new Date()) {
  const today = todayStr(now);
  const changes = statusChanges(data, now, today);
  const out = [];
  for (const m of data.members) {
    const events = unanswered(data, m.id, today);
    if (!events.length && !changes.length) continue;
    const link = `${siteUrl.replace(/\/$/, '')}/?me=${encodeURIComponent(m.id)}`;
    out.push({ member: m, events, changes, link, text: reminderText(m, events, link, changes) });
  }
  return out;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const chip = (label, fg, bg) => `<span style="display:inline-block;font-size:12px;font-weight:600;color:${fg};background:${bg};border:1px solid ${fg};border-radius:999px;padding:0 7px;margin-right:6px">${label}</span>`;
const kindChip = (e) => (e.kind === 'rehearsal' ? chip('Mēģinājums', '#2f68c4', '#e1ebfa') : chip('Koncerts', '#2f7d4f', '#dff1e5'));

const statusColor = { confirmed: ['#2f7d4f', '#dff1e5'], planning: ['#9a6a00', '#fbefcf'], cancelled: ['#b3261e', '#fbe1df'] };
const statusChip = (st) => chip(esc(STATUS[st] || st), ...(statusColor[st] || ['#6f655c', '#eee']));
const evHtml = (e) => `<b>${esc(e.title)}</b> – ${esc(fmtDate(e.date))}${e.time ? ', ' + esc(e.time) : ''}${e.place ? ', ' + esc(e.place) : ''}`;

export function reminderHtml(r) {
  const changes = r.changes || [];
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1f1a17;max-width:520px">
  <p>${esc(greeting(r.member.name))}</p>
  ${r.events.length ? `<p>Auļu koncertu lapā vēl neesi atzīmējies ${r.events.length === 1 ? 'šim pasākumam' : 'šiem pasākumiem'}:</p>
  <ul style="padding-left:20px">${r.events.map((e) => `<li style="margin-bottom:6px">${kindChip(e)}${evHtml(e)}</li>`).join('')}</ul>` : ''}
  ${changes.length ? `<p>Šonedēļ mainījies statuss:</p>
  <ul style="padding-left:20px">${changes.map((e) => `<li style="margin-bottom:6px">${statusChip(e.statusFrom)}→ ${statusChip(e.status)}${evHtml(e)}</li>`).join('')}</ul>` : ''}
  <p><a href="${esc(r.link)}" style="display:inline-block;background:#b5651d;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">${r.events.length ? 'Atzīmēties' : 'Atvērt lapu'}</a></p>
  <p style="color:#6f655c;font-size:13px">Šis e-pasts tiek sūtīts reizi nedēļā, ja kādam pasākumam nav tavas atbildes vai nedēļas laikā mainījies kāda pasākuma statuss.</p>
</div>`;
}
