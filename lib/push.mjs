// Web Push: store browser subscriptions in the blob store and notify everyone when events change.
// Needs env VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (generate once: npx web-push generate-vapid-keys)
// and optionally VAPID_SUBJECT (mailto: or https: contact for push services). Without the keys push is off.
import webpush from 'web-push';

const MONTHS = ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'];
const DAYS = ['svētdiena', 'pirmdiena', 'otrdiena', 'trešdiena', 'ceturtdiena', 'piektdiena', 'sestdiena'];
const KIND = { concert: 'koncerts', rehearsal: 'mēģinājums' };

export const pushEnabled = (env) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

export async function subKey(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return 'push/' + Buffer.from(h).toString('base64url').slice(0, 32);
}

export function cleanSubscription(s) {
  const endpoint = typeof s?.endpoint === 'string' ? s.endpoint : '';
  const p256dh = s?.keys?.p256dh;
  const auth = s?.keys?.auth;
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  if (p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, keys: { p256dh, auth } };
}

function whenText(ev) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date || '')) return 'Datums vēl nav zināms';
  const [y, m, d] = ev.date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  let s = `${DAYS[dt.getUTCDay()].replace(/^./, (c) => c.toUpperCase())}, ${d}. ${MONTHS[m - 1]}`;
  if (ev.time) s += `, ${ev.time}`;
  return s;
}

// What changed in a save, as a notification payload; null when nothing worth notifying about.
// Notifies on: a new event, status "organizējas" → "apstiprināts", and any status → "atcelts".
export function eventNotification(before, after) {
  const kind = KIND[after.kind] || KIND.concert;
  const line = [whenText(after), after.place].filter(Boolean).join(' · ');
  if (!before) {
    return { title: `Jauns ${kind}: ${after.title}`, body: line + '\nAtzīmē, vai tiec!', tag: 'ev-' + after.id, url: '/' };
  }
  if (before.status === 'planning' && after.status === 'confirmed') {
    return { title: `Apstiprināts: ${after.title}`, body: line, tag: 'ev-' + after.id, url: '/' };
  }
  if (before.status !== 'cancelled' && after.status === 'cancelled') {
    return { title: `Atcelts: ${after.title}`, body: line, tag: 'ev-' + after.id, url: '/' };
  }
  return null;
}

async function sendOne(sub, payload, env) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), {
      vapidDetails: { subject: env.VAPID_SUBJECT || 'mailto:aullietnotranss@gmail.com', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
      TTL: 3 * 24 * 3600,
      urgency: 'normal',
      timeout: 8000,
    });
    return 'ok';
  } catch (err) {
    // 404/410: the browser dropped the subscription (app removed, permission revoked).
    if (err.statusCode === 404 || err.statusCode === 410) return 'gone';
    return 'error ' + (err.statusCode || err.message);
  }
}

// Sends to every stored subscription except the device that made the change.
export async function notifyAll(store, env, payload, exceptEndpoint) {
  if (!pushEnabled(env) || !payload) return { sent: 0 };
  const keys = (await store.list({ prefix: 'push/' })).blobs.map((b) => b.key);
  const subs = (await Promise.all(keys.map(async (k) => ({ k, s: await store.get(k, { type: 'json' }) })))).filter((x) => x.s && x.s.endpoint !== exceptEndpoint);
  let sent = 0;
  await Promise.all(
    subs.map(async ({ k, s }) => {
      const r = await sendOne(s, payload, env);
      if (r === 'ok') sent++;
      else if (r === 'gone') await store.delete(k);
      else console.log('Push neizdevās', s.memberName || s.memberId || '', r);
    }),
  );
  return { sent, total: subs.length };
}

export async function notifyOne(sub, env, payload) {
  return sendOne(sub, payload, env);
}
