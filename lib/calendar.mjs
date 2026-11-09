// "Add to calendar" for one event: an .ics file (Apple/iOS, Outlook) and a Google Calendar link.
// Times are Riga local time. Without a recognisable time (e.g. "19:00") the event is all-day.

const TZ = 'Europe/Riga';
const DEFAULT_HOURS = 3;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (iso) => iso.replaceAll('-', '');
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// "19:00", "19.00", "19:00–22:00" → [{h,m}, {h,m}?]
function parseTimes(s) {
  return [...String(s || '').matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].slice(0, 2).map((x) => ({ h: +x[1], m: +x[2] }));
}

// Local Riga start/end as 'YYYYMMDDTHHMMSS', or all-day 'YYYYMMDD' (end exclusive).
export function eventRange(ev) {
  if (!ev?.date) return null;
  const lastDay = ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date;
  const [st, en] = parseTimes(ev.time);
  if (!st) return { allDay: true, start: ymd(ev.date), end: ymd(addDays(lastDay, 1)) };
  let endDay = lastDay;
  let end = en;
  if (!end) {
    const mins = st.h * 60 + st.m + DEFAULT_HOURS * 60;
    end = { h: Math.floor(mins / 60) % 24, m: mins % 60 };
    if (mins >= 24 * 60 && endDay === ev.date) endDay = addDays(endDay, 1);
  } else if (endDay === ev.date && end.h * 60 + end.m <= st.h * 60 + st.m) {
    endDay = addDays(endDay, 1); // e.g. 22:00–02:00
  }
  return {
    allDay: false,
    start: `${ymd(ev.date)}T${pad(st.h)}${pad(st.m)}00`,
    end: `${ymd(endDay)}T${pad(end.h)}${pad(end.m)}00`,
  };
}

const STATUS = { confirmed: 'Apstiprināts', planning: 'Organizējas', cancelled: 'Atcelts' };

function description(ev, siteUrl) {
  return [
    ev.status && STATUS[ev.status] && 'Statuss: ' + STATUS[ev.status],
    ev.time && 'Laiks: ' + ev.time,
    ev.contact && 'Kontakti: ' + ev.contact,
    ev.notes,
    siteUrl && 'Auļu koncerti: ' + siteUrl,
  ].filter(Boolean).join('\n');
}

export function googleUrl(ev, siteUrl = '') {
  const r = eventRange(ev);
  if (!r) return null;
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.title || 'Auļi', dates: `${r.start}/${r.end}`, details: description(ev, siteUrl) });
  if (ev.place) p.set('location', ev.place);
  if (!r.allDay) p.set('ctz', TZ);
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// RFC 5545: lines at most 75 octets, continuation lines start with a space.
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 75) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

const RIGA_VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Riga',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0300', 'TZNAME:EEST', 'DTSTART:19700329T030000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0200', 'TZNAME:EET', 'DTSTART:19701025T040000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

export function icsFor(ev, siteUrl = '', now = new Date()) {
  const r = eventRange(ev);
  if (!r) return null;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Auli//Koncerti//LV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...(r.allDay ? [] : RIGA_VTIMEZONE),
    'BEGIN:VEVENT',
    `UID:${ev.id}@auli-koncerti`,
    `DTSTAMP:${stamp}`,
    r.allDay ? `DTSTART;VALUE=DATE:${r.start}` : `DTSTART;TZID=${TZ}:${r.start}`,
    r.allDay ? `DTEND;VALUE=DATE:${r.end}` : `DTEND;TZID=${TZ}:${r.end}`,
    `SUMMARY:${icsText(ev.title || 'Auļi')}`,
    ev.place && `LOCATION:${icsText(ev.place)}`,
    `DESCRIPTION:${icsText(description(ev, siteUrl))}`,
    siteUrl && `URL:${siteUrl}`,
    ev.status === 'cancelled' ? 'STATUS:CANCELLED' : ev.status === 'planning' ? 'STATUS:TENTATIVE' : 'STATUS:CONFIRMED',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function icsFileName(ev) {
  const base = String(ev.title || 'pasakums').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${base || 'pasakums'}.ics`;
}
