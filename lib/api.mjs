// Core API logic, independent of Netlify so it can run locally with a fake store.
// store must implement: get(key, {type:'json'}), setJSON(key, value), delete(key), list({prefix}) -> {blobs:[{key}]}

const enc = new TextEncoder();
const TOKEN_DAYS = 180;
const ANSWERS = new Set(['yes', 'no', 'maybe', '']);
const STATUSES = new Set(['confirmed', 'planning', 'cancelled']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return Buffer.from(sig).toString('base64url');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function secretFrom(env) {
  // Changing BAND_PASSWORD logs everyone out, which is what we want.
  return (env.SESSION_SECRET || '') + '|' + env.BAND_PASSWORD;
}

async function makeToken(env) {
  const exp = Date.now() + TOKEN_DAYS * 864e5;
  return `${exp}.${await hmac(secretFrom(env), 'v1:' + exp)}`;
}

async function checkToken(env, header) {
  const token = (header || '').replace(/^Bearer\s+/i, '');
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(secretFrom(env), 'v1:' + exp));
}

const id = () => crypto.randomUUID().slice(0, 8);
const str = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function cleanEvent(e, existing = {}) {
  const out = {
    ...existing,
    id: existing.id || str(e.id, 40) || id(),
    title: str(e.title, 200),
    date: isDate(e.date) ? e.date : '',
    endDate: isDate(e.endDate) ? e.endDate : '',
    time: str(e.time, 100),
    place: str(e.place, 200),
    status: STATUSES.has(e.status) ? e.status : 'planning',
    contact: str(e.contact, 1000),
    fee: str(e.fee, 200),
    notes: str(e.notes, 4000),
    createdAt: existing.createdAt || e.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (out.endDate && out.endDate < out.date) out.endDate = '';
  return out;
}

function cleanMembers(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = [];
  for (const m of list) {
    const name = str(m?.name, 80);
    if (!name) continue;
    const mid = str(m?.id, 40) || id();
    if (seen.has(mid)) continue;
    seen.add(mid);
    out.push({ id: mid, name, role: str(m?.role, 40) });
  }
  return out;
}

async function loadAll(store) {
  const [members, eventKeys, answerKeys] = await Promise.all([
    store.get('members', { type: 'json' }),
    store.list({ prefix: 'event/' }),
    store.list({ prefix: 'answers/' }),
  ]);
  const events = (await Promise.all(eventKeys.blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean);
  const answers = {};
  await Promise.all(
    answerKeys.blobs.map(async (b) => {
      answers[b.key.slice('answers/'.length)] = (await store.get(b.key, { type: 'json' })) || {};
    }),
  );
  events.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  return { members: members || [], events, answers };
}

export async function handle(req, store, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = req.method;
  const body = method === 'GET' || method === 'DELETE' ? null : await req.json().catch(() => ({}));

  // Without BAND_PASSWORD the site is open: anyone with the link can view and edit.
  if (path === 'login' && method === 'POST') {
    if (!env.BAND_PASSWORD) return json({ token: '' });
    if (!safeEqual(str(body?.password, 200), env.BAND_PASSWORD)) {
      await new Promise((r) => setTimeout(r, 600));
      return json({ error: 'Nepareiza parole' }, 401);
    }
    return json({ token: await makeToken(env) });
  }

  if (env.BAND_PASSWORD && !(await checkToken(env, req.headers.get('authorization')))) return json({ error: 'Nepieciešams ielogoties' }, 401);

  if (path === 'data' && method === 'GET') return json(await loadAll(store));

  if (path === 'answer' && method === 'PUT') {
    const memberId = str(body?.memberId, 40);
    const eventId = str(body?.eventId, 40);
    const answer = body?.answer ?? '';
    if (!memberId || !eventId || !ANSWERS.has(answer)) return json({ error: 'Nederīgi dati' }, 400);
    const members = (await store.get('members', { type: 'json' })) || [];
    if (!members.some((m) => m.id === memberId)) return json({ error: 'Nezināms dalībnieks' }, 400);
    // Each member has their own blob, so two people answering at once never overwrite each other.
    const key = `answers/${memberId}`;
    const mine = (await store.get(key, { type: 'json' })) || {};
    if (answer === '' && !str(body?.note)) delete mine[eventId];
    else mine[eventId] = { a: answer, note: str(body?.note, 300), at: new Date().toISOString() };
    await store.setJSON(key, mine);
    return json({ ok: true, answer: mine[eventId] || null });
  }

  if (path === 'events' && method === 'POST') {
    const e = body?.event || {};
    if (!str(e.title)) return json({ error: 'Pasākumam vajag nosaukumu' }, 400);
    const existing = e.id ? await store.get(`event/${str(e.id, 40)}`, { type: 'json' }) : null;
    const ev = cleanEvent(e, existing || {});
    await store.setJSON(`event/${ev.id}`, ev);
    return json({ event: ev });
  }

  if (path.startsWith('events/') && method === 'DELETE') {
    const eid = str(path.slice('events/'.length), 40);
    await store.delete(`event/${eid}`);
    return json({ ok: true });
  }

  if (path === 'members' && method === 'PUT') {
    const members = cleanMembers(body?.members);
    if (!members) return json({ error: 'Nederīgs saraksts' }, 400);
    await store.setJSON('members', members);
    return json({ members });
  }

  if (path === 'import' && method === 'POST') {
    // Replaces everything with an exported/seed file.
    const members = cleanMembers(body?.members);
    if (!members || !Array.isArray(body?.events)) return json({ error: 'Failā jābūt "members" un "events"' }, 400);
    const old = await loadAll(store);
    await Promise.all([
      ...old.events.map((e) => store.delete(`event/${e.id}`)),
      ...Object.keys(old.answers).map((m) => store.delete(`answers/${m}`)),
    ]);
    await store.setJSON('members', members);
    const events = body.events.filter((e) => str(e?.title)).map((e) => cleanEvent(e, { id: str(e.id, 40), createdAt: e.createdAt }));
    await Promise.all(events.map((e) => store.setJSON(`event/${e.id}`, e)));
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    await Promise.all(
      members.filter((m) => answers[m.id]).map((m) => store.setJSON(`answers/${m.id}`, answers[m.id])),
    );
    return json({ ok: true, members: members.length, events: events.length });
  }

  return json({ error: 'Nav atrasts' }, 404);
}
