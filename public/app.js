'use strict';

const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

const state = {
  token: LS.get('auli.token'),
  needLogin: false,
  me: LS.get('auli.me'),
  data: null,
  filter: LS.get('auli.filter') === 'past' ? 'past' : 'upcoming',
  mode: LS.get('auli.mode') || 'list',
  open: new Set(),
  noteOpen: new Set(),
};

const ANS = {
  yes: { label: 'Tieku', sym: '✓' },
  no: { label: 'Netieku', sym: '✗' },
  maybe: { label: 'Vēl nezinu', sym: '?' },
  '': { label: 'Nav atbildējis', sym: '·' },
};
const STATUS = { confirmed: 'Apstiprināts', planning: 'Organizējas', cancelled: 'Atcelts' };
const MONTHS = ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'];
const MON = ['janv', 'febr', 'marts', 'apr', 'maijs', 'jūn', 'jūl', 'aug', 'sept', 'okt', 'nov', 'dec'];
const DAYS = ['svētdiena', 'pirmdiena', 'otrdiena', 'trešdiena', 'ceturtdiena', 'piektdiena', 'sestdiena'];

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const parseDate = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

function linkify(text) {
  return esc(text)
    .replace(/([\w.+-]+@[\w-]+\.[\w.-]+)/g, '<a href="mailto:$1">$1</a>')
    .replace(/(\+?\d[\d ]{6,}\d)/g, (m) => `<a href="tel:${m.replace(/\s/g, '')}">${m}</a>`);
}

function fmtLong(ev) {
  const d = parseDate(ev.date);
  if (!d) return 'Datums vēl nav zināms';
  let s = `${cap(DAYS[d.getDay()])}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const e = parseDate(ev.endDate);
  if (e) s += ` – ${DAYS[e.getDay()]}, ${e.getDate()}. ${MONTHS[e.getMonth()]}${e.getFullYear() !== d.getFullYear() ? ' ' + e.getFullYear() : ''}`;
  return s;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch('/api/' + path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(state.token ? { authorization: 'Bearer ' + state.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== 'login') {
    state.token = null;
    LS.set('auli.token', null);
    state.needLogin = true;
    render();
    throw new Error('Lūdzu ielogojies vēlreiz');
  }
  if (!res.ok) throw new Error(data.error || 'Kļūda (' + res.status + ')');
  return data;
}

function logout() {
  state.token = null;
  state.data = null;
  state.me = null;
  LS.set('auli.token', null);
  LS.set('auli.me', null);
  render();
}

async function load(quiet) {
  try {
    const fresh = await api('data');
    if (quiet && JSON.stringify(fresh) === JSON.stringify(state.data)) return;
    state.data = fresh;
    if (state.me && !state.data.members.some((m) => m.id === state.me)) { state.me = null; LS.set('auli.me', null); }
    render();
  } catch (e) {
    if (!quiet) toast(e.message);
  }
}

/* ---------- derived ---------- */
function answerOf(memberId, eventId) {
  return state.data.answers[memberId]?.[eventId] || { a: '' };
}
function tally(ev) {
  const t = { yes: 0, no: 0, maybe: 0, '': 0, notes: 0 };
  for (const m of state.data.members) {
    const ans = answerOf(m.id, ev.id);
    t[ans.a || '']++;
    if (ans.note) t.notes++;
  }
  return t;
}
function visibleEvents() {
  const today = todayStr();
  const evs = state.data.events.filter((e) => {
    const last = e.endDate || e.date;
    if (state.filter === 'upcoming') return !last || last >= today;
    return last && last < today;
  });
  if (state.filter === 'past') evs.reverse();
  return evs;
}

/* ---------- screens ---------- */
function render() {
  const app = $('#app');
  if (state.needLogin) return renderLogin(app);
  if (!state.data) { app.innerHTML = '<p class="loading">Ielādē…</p>'; load(); return; }
  if (!state.me) return renderPick(app);
  renderMain(app);
}

function renderLogin(app) {
  app.innerHTML = `
    <div class="center"><form class="panel" id="login">
      <img class="logo" src="icon.svg" alt="">
      <h1>Auļu koncerti</h1>
      <p>Ievadi grupas paroli.</p>
      <label class="f">Parole<input type="password" name="password" autocomplete="current-password" required autofocus></label>
      <button class="btn primary" style="width:100%;justify-content:center">Ieiet</button>
      <p class="err" id="err"></p>
    </form></div>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const { token } = await api('login', { method: 'POST', body: { password: e.target.password.value } });
      state.token = token;
      state.needLogin = false;
      LS.set('auli.token', token);
      render();
    } catch (err) {
      $('#err').textContent = err.message;
      btn.disabled = false;
    }
  };
}

function renderPick(app) {
  const members = state.data.members;
  app.innerHTML = `
    <div class="center"><div class="panel">
      <h1>Kas tu esi?</h1>
      <p>Izvēlies savu vārdu. Šajā ierīcē tas tiks atcerēts.</p>
      <div class="pick">${byRole(members).map(([role, ms]) => `${role ? `<div class="pick-role">${esc(role)}</div>` : ''}<div class="pick-grid">${ms.map((m) => `<button data-id="${esc(m.id)}">${avatar(m, 'big')}<span>${esc(m.name)}</span></button>`).join('')}</div>`).join('')}</div>
      ${members.length ? '' : '<p>Dalībnieku saraksts vēl ir tukšs. Pievieno dalībniekus iestatījumos.</p><button class="btn primary" id="settings">Iestatījumi</button>'}
    </div></div>`;
  app.querySelectorAll('.pick button').forEach((b) => (b.onclick = () => { state.me = b.dataset.id; LS.set('auli.me', state.me); render(); }));
  $('#settings')?.addEventListener('click', openSettings);
}

// Members grouped by role, roles in the order they first appear in the list.
function byRole(members) {
  const groups = new Map();
  for (const m of members) {
    const r = m.role || '';
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(m);
  }
  return [...groups];
}
// Member initials in a circle.
// Three members are "E. K.", so clashing initials get a second surname letter (EKā, EKu, EKr).
function initials(m) {
  const parts = (n) => n.trim().split(/\s+/);
  const base = (n) => parts(n).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const mine = base(m.name);
  const clash = state.data?.members.some((o) => o.id !== m.id && base(o.name) === mine);
  const p = parts(m.name);
  return clash && p[1] ? mine + (p[1][1] || '') : mine;
}
function avatar(m, cls = '') {
  return `<span class="av ${cls}" title="${esc(m.name)}">${esc(initials(m))}</span>`;
}
// Everyone's initials on the card: green if coming, faded if not, outlined if no answer yet.
function faces(ev) {
  const order = { yes: 0, '': 1, maybe: 1, no: 2 };
  const list = state.data.members
    .map((m) => ({ m, ans: answerOf(m.id, ev.id) }))
    .sort((a, b) => order[a.ans.a || ''] - order[b.ans.a || '']);
  return `<div class="faces">${list.map(({ m, ans }) => avatar(m, `f-${ans.a === 'yes' || ans.a === 'no' ? ans.a : 'none'}${ans.note ? ' has-note' : ''}${m.id === state.me ? ' me' : ''}`)).join('')}</div>`;
}
const plural = (n, one, many) => (n % 10 === 1 && n % 100 !== 11 ? one : many);

const ICON = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

function renderMain(app) {
  const me = state.data.members.find((m) => m.id === state.me);
  const evs = visibleEvents();
  const pending = state.data.events.filter((e) => (e.endDate || e.date || '9999') >= todayStr() && e.status !== 'cancelled' && !['yes', 'no'].includes(answerOf(state.me, e.id).a)).length;

  app.innerHTML = `
    <header class="top"><div class="wrap ${state.mode === 'table' ? 'wide' : ''}">
      <div class="brand"><img src="icon.svg" alt=""><span>Auļu koncerti</span></div>
      <button class="who" id="who" title="Mainīt">${avatar(me, 'sm')}<span>${esc(me.name)}</span></button>
      <button class="icon-btn" id="settings" aria-label="Iestatījumi">${ICON.gear}</button>
    </div></header>
    <main class="wrap ${state.mode === 'table' ? 'wide' : ''}">
      <div class="toolbar">
        <div class="seg" id="filter">
          ${[['upcoming', 'Gaidāmie'], ['past', 'Pagājušie']].map(([k, l]) => `<button data-k="${k}" aria-pressed="${state.filter === k}">${l}</button>`).join('')}
        </div>
        <div class="seg" id="mode">
          ${[['list', 'Saraksts'], ['table', 'Tabula']].map(([k, l]) => `<button data-k="${k}" aria-pressed="${state.mode === k}">${l}</button>`).join('')}
        </div>
        <span class="spacer"></span>
        <button class="btn primary" id="add">${ICON.plus}<span>Jauns pasākums</span></button>
      </div>
      ${pending ? `<div class="notice"><b>${pending}</b> ${pending === 1 ? 'gaidāmajam pasākumam' : 'gaidāmajiem pasākumiem'} vēl neesi atzīmējies.</div>` : ''}
      <div id="content"></div>
    </main>`;

  $('#who').onclick = () => { state.me = null; LS.set('auli.me', null); render(); };
  $('#settings').onclick = openSettings;
  $('#add').onclick = () => openEditor();
  $('#filter').onclick = (e) => { const k = e.target.dataset.k; if (k) { state.filter = k; LS.set('auli.filter', k); render(); } };
  $('#mode').onclick = (e) => { const k = e.target.dataset.k; if (k) { state.mode = k; LS.set('auli.mode', k); render(); } };

  const content = $('#content');
  if (!evs.length) { content.innerHTML = '<p class="empty">Šeit vēl nav neviena pasākuma.</p>'; return; }
  if (state.mode === 'table') return renderTable(content, evs);

  let html = '';
  let lastMonth = '';
  for (const ev of evs) {
    const d = parseDate(ev.date);
    const mk = d ? `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}` : 'Bez datuma';
    if (mk !== lastMonth) { html += `<div class="month">${mk}</div>`; lastMonth = mk; }
    html += cardHtml(ev);
  }
  content.innerHTML = html;
  bindCards(content);
}

function cardHtml(ev) {
  const d = parseDate(ev.date);
  const e = parseDate(ev.endDate);
  const t = tally(ev);
  const mine = answerOf(state.me, ev.id);
  const open = state.open.has(ev.id);
  const n = state.data.members.length;
  const datebox = d
    ? `<div class="d">${d.getDate()}${e && e.getMonth() === d.getMonth() ? '–' + e.getDate() : ''}</div><div class="m">${MON[d.getMonth()]}${e && e.getMonth() !== d.getMonth() ? '–' + MON[e.getMonth()] : ''}</div><div class="y">${d.getFullYear()}</div>`
    : '<div class="d">?</div>';
  const meta = [ev.time, ev.place].filter(Boolean).map(esc).join(' · ');

  return `
  <article class="card ${ev.status}" data-id="${esc(ev.id)}">
    <div class="card-main" data-act="toggle" role="button" tabindex="0" aria-expanded="${open}">
      <div class="datebox">${datebox}</div>
      <div>
        <h3 class="title">${esc(ev.title)}</h3>
        ${meta ? `<div class="meta">${meta}</div>` : ''}
        <div class="chips">
          <span class="chip ${ev.status}">${STATUS[ev.status]}</span>
          <span class="tally" title="Tiek / netiek / nezina">
            <span class="y">✓ ${t.yes}</span>${t.no ? `<span class="n">✗ ${t.no}</span>` : ''}
            <span>no ${n}</span>
          </span>
          ${t.notes ? `<span class="q">${t.notes} ${plural(t.notes, 'komentārs', 'komentāri')}</span>` : ''}
          ${t[''] + t.maybe && ev.status !== 'cancelled' ? `<span class="missing">${t[''] + t.maybe} nav atbildējuši</span>` : ''}
        </div>
      </div>
      ${faces(ev)}
    </div>
    <div class="mine" role="group" aria-label="Mana atbilde">
      ${['yes', 'no'].map((a) => `<button class="${a}" data-act="answer" data-a="${a}" aria-pressed="${mine.a === a}">${ANS[a].label}</button>`).join('')}
      <button class="note" data-act="note-toggle" aria-pressed="${!!mine.note}" aria-expanded="${open || state.noteOpen.has(ev.id)}">Komentārs</button>
    </div>
    ${open || state.noteOpen.has(ev.id) ? noteHtml(mine) : ''}
    ${open ? detailsHtml(ev) : ''}
  </article>`;
}

function noteHtml(mine) {
  return `
    <div class="note-input">
      <input type="text" placeholder="Nekas personisks lūzeri, bet šajā dienā citur nopelnīšu vairāk..." value="${esc(mine.note || '')}" maxlength="300" data-note aria-label="Mans komentārs">
      <button class="btn" data-act="note">Saglabāt</button>
    </div>`;
}

function detailsHtml(ev) {
  const rows = [
    ['Kad', esc(fmtLong(ev)) + (ev.time ? ', ' + esc(ev.time) : '')],
    ev.place && ['Kur', esc(ev.place)],
    ev.contact && ['Kontakti', linkify(ev.contact)],
    ev.fee && ['Honorārs', esc(ev.fee)],
    ev.notes && ['Piezīmes', linkify(ev.notes)],
  ].filter(Boolean);
  const order = { yes: 0, maybe: 1, '': 1, no: 2 };
  const people = state.data.members
    .map((m) => ({ m, ans: answerOf(m.id, ev.id) }))
    .sort((a, b) => order[a.ans.a || ''] - order[b.ans.a || '']);
  return `
    <div class="details">
      <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <ul class="people">
        ${people.map(({ m, ans }) => `<li><span class="pav">${avatar(m, `f-${ans.a === 'yes' || ans.a === 'no' ? ans.a : 'none'}`)}<span class="dot ${ans.a || 'none'}">${ANS[ans.a || ''].sym}</span></span><span>${esc(m.name)}${ans.note ? ` <span class="note">– ${esc(ans.note)}</span>` : ''}</span></li>`).join('')}
      </ul>
      <div class="row-actions">
        <button class="btn" data-act="edit">Labot pasākumu</button>
      </div>
    </div>`;
}

function bindCards(root) {
  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    const ev = state.data.events.find((x) => x.id === card.dataset.id);
    const act = btn.dataset.act;
    if (act === 'toggle') {
      state.open.has(ev.id) ? state.open.delete(ev.id) : state.open.add(ev.id);
      rerenderCard(card, ev);
    } else if (act === 'answer') {
      const cur = answerOf(state.me, ev.id);
      const a = cur.a === btn.dataset.a ? '' : btn.dataset.a; // tap again to clear
      const saving = saveAnswer(ev, a, cur.note || ''); // updates local state immediately
      rerenderCard(card, ev);
      await saving;
      const fresh = root.querySelector(`.card[data-id="${CSS.escape(ev.id)}"]`);
      if (fresh) rerenderCard(fresh, ev);
    } else if (act === 'note-toggle') {
      state.noteOpen.has(ev.id) ? state.noteOpen.delete(ev.id) : state.noteOpen.add(ev.id);
      rerenderCard(card, ev);
      root.querySelector(`.card[data-id="${CSS.escape(ev.id)}"] [data-note]`)?.focus();
    } else if (act === 'note') {
      const note = card.querySelector('[data-note]').value.trim();
      const cur = answerOf(state.me, ev.id).a || '';
      await saveAnswer(ev, cur === 'maybe' ? '' : cur, note);
      state.noteOpen.delete(ev.id);
      rerenderCard(card, ev);
      toast(note ? 'Komentārs saglabāts' : 'Komentārs izdzēsts');
    } else if (act === 'edit') {
      openEditor(ev);
    }
  };
  root.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-note]')) { e.preventDefault(); e.target.closest('.card').querySelector('[data-act=note]').click(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.act === 'toggle') { e.preventDefault(); e.target.click(); }
  };
}

function rerenderCard(card, ev) {
  const tmp = document.createElement('div');
  tmp.innerHTML = cardHtml(ev);
  card.replaceWith(tmp.firstElementChild);
  // refresh the "not answered" notice without losing scroll position
  const pending = state.data.events.filter((x) => (x.endDate || x.date || '9999') >= todayStr() && x.status !== 'cancelled' && !['yes', 'no'].includes(answerOf(state.me, x.id).a)).length;
  const n = $('.notice');
  if (!pending && n) n.remove();
  else if (n) n.innerHTML = `<b>${pending}</b> ${pending === 1 ? 'gaidāmajam pasākumam' : 'gaidāmajiem pasākumiem'} vēl neesi atzīmējies.`;
}

async function saveAnswer(ev, a, note) {
  const answers = state.data.answers;
  const prev = answers[state.me]?.[ev.id];
  answers[state.me] = answers[state.me] || {};
  if (!a && !note) delete answers[state.me][ev.id];
  else answers[state.me][ev.id] = { a, note };
  try {
    await api('answer', { method: 'PUT', body: { memberId: state.me, eventId: ev.id, answer: a, note } });
  } catch (err) {
    if (prev) answers[state.me][ev.id] = prev; else delete answers[state.me][ev.id];
    toast('Neizdevās saglabāt: ' + err.message);
  }
}

function renderTable(root, evs) {
  const groups = byRole(state.data.members);
  const ms = groups.flatMap(([, g]) => g);
  const n = ms.length;
  const totals = Object.fromEntries(ms.map((m) => [m.id, 0]));
  const notes = [];
  // first column of each role group gets a thicker left border
  const firstOfGroup = new Set(groups.map(([, g]) => g[0].id));
  const rows = evs.map((ev) => {
    const d = parseDate(ev.date);
    const t = tally(ev);
    const cells = ms.map((m) => {
      const ans = answerOf(m.id, ev.id);
      const a = ans.a === 'maybe' ? '' : ans.a || '';
      if (a === 'yes') totals[m.id]++;
      let extra = '';
      if (ans.note) { notes.push(`${m.name}: ${ans.note}`); extra = ` data-n="${notes.length - 1}" tabindex="0"`; }
      const title = `${m.name}: ${ANS[a].label}${ans.note ? ' – ' + ans.note : ''}`;
      return `<td class="cell ${a || 'none'}${ans.note ? ' has-note' : ''}${firstOfGroup.has(m.id) ? ' g' : ''}" title="${esc(title)}"${extra}>${ANS[a].sym}</td>`;
    }).join('');
    const comments = ms.map((m) => ({ m, note: answerOf(m.id, ev.id).note })).filter((x) => x.note);
    const short = (name) => { const p = name.split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };
    return `<tr><td class="ev"><div>${esc(ev.title)}</div><div class="sub">${d ? `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` : 'bez datuma'} · ${STATUS[ev.status]}</div>${comments.map(({ m, note }) => `<div class="cmt"><b>${esc(short(m.name))}:</b> ${esc(note)}</div>`).join('')}</td><td class="contact">${ev.contact ? linkify(ev.contact) : '<span class="sub">–</span>'}</td>${cells}<td class="g"><b>${t.yes}</b>/${n}</td></tr>`;
  }).join('');
  root.innerHTML = `
    <div class="table-scroll"><table class="grid">
      <thead>
        <tr class="roles"><th></th><th></th>${groups.map(([role, g]) => `<th colspan="${g.length}" class="g">${esc(role || 'Bez lomas')}</th>`).join('')}<th class="g"></th></tr>
        <tr><th>Pasākums</th><th class="contact">Kontakti</th>${ms.map((m) => `<th class="${firstOfGroup.has(m.id) ? 'g' : ''}"><span>${esc(m.name)}</span></th>`).join('')}<th class="g">Tiek</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td><b>Tieku kopā</b></td><td></td>${ms.map((m) => `<td class="${firstOfGroup.has(m.id) ? 'g' : ''}"><b>${totals[m.id]}</b></td>`).join('')}<td class="g"></td></tr></tfoot>
    </table></div>
`;
  const show = (e) => { const c = e.target.closest('[data-n]'); if (c) toast(notes[c.dataset.n]); };
  root.onclick = show;
  root.onkeydown = (e) => { if (e.key === 'Enter') show(e); };
}

/* ---------- dialogs ---------- */
function dialog(html) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = html;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.showModal();
  return dlg;
}

function openEditor(ev) {
  const e = ev || { status: 'planning' };
  const dlg = dialog(`
    <form method="dialog">
      <h2>${ev ? 'Labot pasākumu' : 'Jauns pasākums'}</h2>
      <label class="f">Nosaukums *<input type="text" name="title" required value="${esc(e.title)}" placeholder="piem. Ražas svētki"></label>
      <div class="two">
        <label class="f">Datums<input type="date" name="date" value="${esc(e.date)}"></label>
        <label class="f">Beigu datums (ja vairākas dienas)<input type="date" name="endDate" value="${esc(e.endDate)}"></label>
      </div>
      <div class="two">
        <label class="f">Laiks<input type="text" name="time" value="${esc(e.time)}" placeholder="piem. 19:00"></label>
        <label class="f">Statuss<select name="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <label class="f">Vieta<input type="text" name="place" value="${esc(e.place)}" placeholder="piem. Dzintaru koncertzāle"></label>
      <label class="f">Kontakti<textarea name="contact" rows="2">${esc(e.contact)}</textarea></label>
      <label class="f">Honorārs<input type="text" name="fee" value="${esc(e.fee)}"></label>
      <label class="f">Piezīmes (mēģinājumi, ceļš, u.c.)<textarea name="notes" rows="3">${esc(e.notes)}</textarea></label>
      <div class="dlg-actions">
        ${ev ? '<button type="button" class="btn danger left" data-del>Dzēst</button>' : ''}
        <button type="button" class="btn" data-cancel>Atcelt</button>
        <button class="btn primary">Saglabāt</button>
      </div>
    </form>`);
  const form = $('form', dlg);
  $('[data-cancel]', dlg).onclick = () => dlg.close();
  $('[data-del]', dlg)?.addEventListener('click', async () => {
    if (!confirm(`Dzēst "${e.title}"? To nevarēs atsaukt.`)) return;
    try {
      await api('events/' + encodeURIComponent(e.id), { method: 'DELETE' });
      state.data.events = state.data.events.filter((x) => x.id !== e.id);
      dlg.close();
      render();
      toast('Pasākums izdzēsts');
    } catch (err) { toast(err.message); }
  });
  form.onsubmit = async (evt) => {
    evt.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    if (ev) body.id = ev.id;
    const btn = form.querySelector('.primary');
    btn.disabled = true;
    try {
      const { event } = await api('events', { method: 'POST', body: { event: body } });
      const i = state.data.events.findIndex((x) => x.id === event.id);
      if (i >= 0) state.data.events[i] = event; else state.data.events.push(event);
      state.data.events.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
      state.open.add(event.id);
      dlg.close();
      render();
      toast('Saglabāts');
    } catch (err) { toast(err.message); btn.disabled = false; }
  };
}

function openSettings() {
  const members = state.data.members.map((m) => ({ ...m }));
  const dlg = dialog(`
    <div class="body">
      <h2>Iestatījumi</h2>
      <h3 style="margin:0 0 8px;font-size:1rem">Dalībnieki</h3>
      <p class="meta" style="margin:0 0 10px">Tabulā dalībnieki tiek grupēti pēc lomas tādā secībā kā šeit.</p>
      <div id="mlist"></div>
      <datalist id="roles">${[...new Set(state.data.members.map((m) => m.role).filter(Boolean))].map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
      <div class="dlg-actions" style="justify-content:flex-start">
        <button type="button" class="btn" id="madd">+ Pievienot</button>
        <button type="button" class="btn primary" id="msave">Saglabāt sarakstu</button>
      </div>
      <hr>
      <h3 style="margin:0 0 8px;font-size:1rem">Dati</h3>
      <p class="meta" style="margin:0 0 10px">Rezerves kopija ir JSON fails ar visiem pasākumiem un atbildēm. Importējot fails aizvieto visus esošos datus.</p>
      <div class="dlg-actions" style="justify-content:flex-start">
        <button type="button" class="btn" id="export">Lejupielādēt kopiju</button>
        <label class="btn" style="cursor:pointer">Importēt no faila<input type="file" accept="application/json,.json" id="import" hidden></label>
      </div>
      <hr>
      <div class="dlg-actions">
        ${state.token ? '<button type="button" class="btn danger left" id="logout">Iziet</button>' : ''}
        <button type="button" class="btn" id="close">Aizvērt</button>
      </div>
    </div>`);
  const drawMembers = () => {
    $('#mlist', dlg).innerHTML = members.map((m, i) => `
      <div class="member-row"><input type="text" value="${esc(m.name)}" data-i="${i}" data-f="name" aria-label="Vārds" placeholder="Vārds Uzvārds">
      <input type="text" class="role" value="${esc(m.role)}" data-i="${i}" data-f="role" aria-label="Loma" placeholder="Loma" list="roles">
      <button type="button" class="btn danger" data-rm="${i}" aria-label="Noņemt">✕</button></div>`).join('') || '<p class="meta">Vēl nav neviena dalībnieka.</p>';
  };
  drawMembers();
  $('#mlist', dlg).oninput = (e) => { const { i, f } = e.target.dataset; if (i) members[i][f] = e.target.value; };
  $('#mlist', dlg).onclick = (e) => {
    const i = e.target.dataset.rm;
    if (i == null) return;
    if (members[i].id && state.data.members.some((m) => m.id === members[i].id) && !confirm(`Noņemt ${members[i].name}? Viņa atbildes vairs netiks rādītas.`)) return;
    members.splice(i, 1);
    drawMembers();
  };
  $('#madd', dlg).onclick = () => { members.push({ name: '', role: '' }); drawMembers(); dlg.querySelectorAll('#mlist input')[members.length - 1]?.focus(); };
  $('#msave', dlg).onclick = async () => {
    try {
      const res = await api('members', { method: 'PUT', body: { members: members.filter((m) => m.name.trim()) } });
      state.data.members = res.members;
      toast('Saraksts saglabāts');
      dlg.close();
      render();
    } catch (err) { toast(err.message); }
  };
  $('#export', dlg).onclick = () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `auli-koncerti-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#import', dlg).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm(`Importēt ${data.events?.length ?? 0} pasākumus un ${data.members?.length ?? 0} dalībniekus? Visi pašreizējie dati tiks aizvietoti.`)) return;
      await api('import', { method: 'POST', body: data });
      dlg.close();
      state.data = null;
      render();
      toast('Dati importēti');
    } catch (err) { toast('Imports neizdevās: ' + err.message); }
  };
  $('#logout', dlg)?.addEventListener('click', () => { dlg.close(); logout(); });
  $('#close', dlg).onclick = () => dlg.close();
}

/* ---------- keep fresh ---------- */
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.data && !document.querySelector('dialog')) load(true); });
setInterval(() => { if (!document.hidden && state.data && !document.querySelector('dialog') && !document.activeElement?.matches('input,textarea')) load(true); }, 60000);

render();
