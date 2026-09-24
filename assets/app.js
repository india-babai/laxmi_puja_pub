/* Lakshmi Puja Accounts — static single-page app.
 * Data lives as one JSON file per year (years/<year>.json) in a PRIVATE GitHub repo,
 * read and written through the GitHub Contents API with a fine-grained token.
 * A "demo" mode keeps everything in this browser's localStorage instead. */
'use strict';

const FIRST_PUJA_YEAR = 1976; // 2025 was the 50th year
const CATEGORIES = {
  collection: ['Voluntary contribution', 'Family share', 'Joutho Fund', 'Other'],
  expense: ['Puja Essentials', 'Food & Feast', 'Decoration & Setup', 'Services', 'Miscellaneous'],
};
const MODES = ['Cash', 'PhonePe', 'GPay', 'Bank', 'Adjustment'];
const THIS_YEAR = new Date().getFullYear();

/* ---------------- utilities ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const money = n => (n < 0 ? '−' : '') + '₹' + inr.format(Math.abs(n));
const signed = (n, type) => (type === 'collection' ? '+' : '−') + '₹' + inr.format(Math.abs(n));
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const todayISO = () => new Date().toLocaleDateString('en-CA');
const fmtDate = (d, year) => d ? new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) }) : '';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sum = (arr, f = x => x.amount) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

function b64enc(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64dec(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

let toastTimer;
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, isErr ? 5000 : 2400);
}

const blankYear = y => ({ year: y, entries: [], notes: [], updatedAt: new Date().toISOString() });

/* ---------------- storage back-ends ---------------- */
class GitHubStore {
  constructor(c) {
    this.c = c;
    this.base = `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/years`;
    this.ref = c.branch ? `?ref=${encodeURIComponent(c.branch)}` : '';
  }
  async req(path, opts = {}) {
    let r;
    try {
      r = await fetch(this.base + path, {
        cache: 'no-store', ...opts,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.c.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      const e = new Error('Could not reach GitHub — check your internet connection.'); e.status = 0; throw e;
    }
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).message || ''; } catch { /* no body */ }
      const e = new Error(
        r.status === 401 ? 'GitHub rejected the token (invalid or expired).' :
        r.status === 403 ? 'Token lacks permission — it needs “Contents: Read and write” on the data repo.' :
        r.status === 404 ? 'Not found — check owner / repo name, and that the token can access that repo.' :
        `GitHub error ${r.status}: ${msg}`);
      e.status = r.status; throw e;
    }
    return r.json();
  }
  async listYears() {
    try {
      const items = await this.req(this.ref);
      return items.map(i => i.name).filter(n => /^\d{4}\.json$/.test(n)).map(n => +n.slice(0, 4));
    } catch (e) { if (e.status === 404) return []; throw e; }
  }
  async load(y) {
    const j = await this.req(`/${y}.json${this.ref}`);
    return { data: JSON.parse(b64dec(j.content)), sha: j.sha };
  }
  async save(y, data, sha, message) {
    const body = { message, content: b64enc(JSON.stringify(data, null, 1) + '\n') };
    if (sha) body.sha = sha;
    if (this.c.branch) body.branch = this.c.branch;
    const j = await this.req(`/${y}.json`, { method: 'PUT', body: JSON.stringify(body) });
    return j.content.sha;
  }
}

class DemoStore {
  async listYears() {
    let ys = LS.get('lp-demo-years');
    if (!ys) {
      ys = [];
      // When served locally next to the puja-data folder, seed the demo with real history.
      for (const y of [2021, 2023, 2025, 2026]) {
        try {
          const r = await fetch(`puja-data/years/${y}.json`, { cache: 'no-store' });
          if (r.ok) { LS.set('lp-demo-' + y, await r.json()); ys.push(y); }
        } catch { /* not available */ }
      }
      if (!ys.includes(THIS_YEAR)) { LS.set('lp-demo-' + THIS_YEAR, blankYear(THIS_YEAR)); ys.push(THIS_YEAR); }
      LS.set('lp-demo-years', ys);
    }
    return ys;
  }
  async load(y) {
    const d = LS.get('lp-demo-' + y);
    if (!d) { const e = new Error('Not found'); e.status = 404; throw e; }
    return { data: d, sha: 'demo' };
  }
  async save(y, data) {
    LS.set('lp-demo-' + y, data);
    const ys = LS.get('lp-demo-years', []);
    if (!ys.includes(y)) { ys.push(y); LS.set('lp-demo-years', ys); }
    return 'demo';
  }
}

/* ---------------- state ---------------- */
const S = {
  cfg: LS.get('lp-config', null),
  store: null,
  years: [],
  data: {},     // year -> { data, sha }
  year: null,
  ready: false,
  error: '',
};
const cacheKey = () => S.cfg ? `lp-cache-${S.cfg.mode}-${S.cfg.owner || ''}/${S.cfg.repo || ''}` : '';
const yd = (y = S.year) => (S.data[y] && S.data[y].data) || blankYear(y);
const latestYear = () => S.years.length ? Math.max(...S.years) : THIS_YEAR;

function setYear(y) { S.year = +y; LS.set('lp-year', S.year); }

async function boot() {
  if (!S.cfg) { S.ready = true; return render(); }
  S.store = S.cfg.mode === 'demo' ? new DemoStore() : new GitHubStore(S.cfg);
  // Show the last known copy immediately, then refresh from the source.
  const cached = LS.get(cacheKey(), null);
  if (cached && cached.years) {
    S.years = cached.years; S.data = cached.data;
    pickYear(); S.ready = true; render();
  }
  await refreshAll();
}

function pickYear() {
  const saved = LS.get('lp-year', null);
  S.year = S.years.includes(saved) ? saved : latestYear();
}

async function refreshAll() {
  try {
    S.error = '';
    const ys = (await S.store.listYears()).sort((a, b) => a - b);
    const loaded = await Promise.all(ys.map(y => S.store.load(y).then(r => [y, r])));
    S.years = ys;
    S.data = Object.fromEntries(loaded);
    if (!S.years.length) S.years = [];
    LS.set(cacheKey(), { years: S.years, data: S.data });
  } catch (e) {
    S.error = e.message;
  }
  if (!S.years.includes(S.year)) pickYear();
  S.ready = true;
  render();
}

/* Apply a change to a year file and save it. On a conflict (the file changed on
 * another device), reload the latest copy and re-apply the change once. */
async function mutate(year, change, message) {
  let rec = S.data[year];
  if (!rec) {
    try { rec = await S.store.load(year); } catch (e) { if (e.status !== 404) throw e; rec = { data: blankYear(year), sha: null }; }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = JSON.parse(JSON.stringify(rec.data));
    change(draft);
    draft.updatedAt = new Date().toISOString();
    try {
      const sha = await S.store.save(year, draft, rec.sha, message);
      S.data[year] = { data: draft, sha };
      if (!S.years.includes(year)) S.years = [...S.years, year].sort((a, b) => a - b);
      LS.set(cacheKey(), { years: S.years, data: S.data });
      return;
    } catch (e) {
      if (attempt === 0 && (e.status === 409 || e.status === 422)) { rec = await S.store.load(year); continue; }
      throw e;
    }
  }
}

/* ---------------- derived data ---------------- */
function totals(d) {
  const c = sum(d.entries.filter(e => e.type === 'collection'));
  const x = sum(d.entries.filter(e => e.type === 'expense'));
  return { c, x, b: c - x };
}
function byKey(entries, key) {
  const m = new Map();
  for (const e of entries) { const k = e[key] || '—'; m.set(k, (m.get(k) || 0) + e.amount); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function sortEntries(list) {
  return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}
function allEntries() {
  return S.years.flatMap(y => yd(y).entries.map(e => ({ ...e, _year: y })));
}
/* Most recent previous-year record for a name (used for "last time" hints). */
function lastTime(type, name) {
  const n = norm(name);
  if (!n) return null;
  for (const y of [...S.years].sort((a, b) => b - a)) {
    if (y >= S.year) continue;
    const hits = yd(y).entries.filter(e => e.type === type && norm(e.name) === n);
    if (hits.length) return { year: y, parts: byKey(hits, 'category') };
  }
  return null;
}
function suggestions(type) {
  const m = new Map();
  for (const e of allEntries()) if (e.type === type && e.name) m.set(norm(e.name), e.name);
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}
function handlers() {
  const m = new Map();
  for (const e of allEntries()) if (e.handledBy) m.set(norm(e.handledBy), e.handledBy);
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}
function yearLabel(y) {
  const n = y - FIRST_PUJA_YEAR + 1;
  return n > 0 ? `${ordinal(n)} year` : '';
}

/* ---------------- router ---------------- */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  return { path: path || 'home', params: new URLSearchParams(q || '') };
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

function render() {
  const app = $('#app');
  const { path, params } = route();
  // New entries always go into the latest (current) year.
  if (path === 'add' && !params.get('id') && S.years.length && S.year !== latestYear()) setYear(latestYear());
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === path));
  $('#brandSub').textContent = S.year ? `Lakshmi Puja ${S.year}${yearLabel(S.year) ? ' · ' + yearLabel(S.year) : ''}` : 'Lakshmi Puja Accounts';

  if (!S.ready) { app.innerHTML = '<div class="loading"><span class="diya"></span>Loading…</div>'; return; }
  if (!S.cfg || path === 'settings') { app.innerHTML = viewSettings(); return bindSettings(); }

  const views = { home: viewHome, ledger: viewLedger, add: viewAdd, report: viewReport, history: viewHistory };
  const v = views[path] || viewHome;
  app.innerHTML = (S.error ? `<div class="banner err no-print" style="margin-bottom:16px">⚠ ${esc(S.error)} <a href="#/settings">Check settings</a> · <a href="javascript:void 0" data-act="retry">Retry</a></div>` : '')
    + (S.cfg.mode === 'demo' ? '<div class="banner no-print" style="margin-bottom:16px">Demo mode — entries are saved only in this browser. <a href="#/settings">Connect GitHub</a> to sync across devices.</div>' : '')
    + v(params);
  bind(path, params);
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act="retry"]');
  if (t) { e.preventDefault(); S.ready = false; render(); refreshAll(); }
});

/* ---------------- shared bits ---------------- */
function yearChips(extraClass = '') {
  if (S.years.length < 2) return '';
  return `<div class="years ${extraClass}" role="group" aria-label="Year">${[...S.years].sort((a, b) => b - a).map(y =>
    `<button class="chip" data-year="${y}" aria-pressed="${y === S.year}">${y}</button>`).join('')}</div>`;
}
function bindYearChips(root = document) {
  $$('[data-year]', root).forEach(b => b.addEventListener('click', () => { setYear(b.dataset.year); render(); }));
}
function entryRow(e) {
  const inn = e.type === 'collection';
  const meta = [e.category, e.mode, e.handledBy && (inn ? 'to ' : 'by ') + e.handledBy, fmtDate(e.date)].filter(Boolean).join(' · ');
  return `<li><a class="entry" href="#/add?id=${encodeURIComponent(e.id)}">
    <span class="entry-ico ${inn ? 'in' : 'out'}" aria-hidden="true">${inn ? '↓' : '↑'}</span>
    <span class="entry-main"><span class="entry-name">${esc(e.name)}</span><span class="entry-meta">${esc(meta)}</span></span>
    <span class="entry-amt num ${inn ? 'in' : 'out'}">${signed(e.amount, e.type)}</span></a></li>`;
}
const feet = '<div class="feet" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
function bars(rows, total, cls = '') {
  if (!rows.length) return '<p class="muted small">Nothing yet.</p>';
  const max = Math.max(...rows.map(r => r[1]), 1);
  return `<div class="bars">${rows.map(([k, v]) => `<div class="bar-row"><span>${esc(k)}</span><span class="num">${money(v)} <span class="muted small">${total ? Math.round(v / total * 100) + '%' : ''}</span></span>
    <div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.max(2, v / max * 100)}%"></div></div></div>`).join('')}</div>`;
}

/* ---------------- Home ---------------- */
function viewHome() {
  const d = yd(), t = totals(d);
  const col = d.entries.filter(e => e.type === 'collection');
  const exp = d.entries.filter(e => e.type === 'expense');
  const recent = sortEntries(d.entries).slice(0, 6);

  // Contributors from the previous year who have not given yet this year.
  let pendingHtml = '';
  const prevYear = [...S.years].filter(y => y < S.year).pop();
  if (prevYear && S.year === latestYear()) {
    const key = e => norm(e.name) + '|' + e.category;
    const have = new Set(col.map(key));
    const prev = new Map();
    for (const e of yd(prevYear).entries) {
      if (e.type !== 'collection' || e.category === 'Joutho Fund' || have.has(key(e))) continue;
      const p = prev.get(key(e)) || { name: e.name, category: e.category, amount: 0 };
      p.amount += e.amount; prev.set(key(e), p);
    }
    const list = [...prev.values()].sort((a, b) => b.amount - a.amount);
    if (list.length) {
      pendingHtml = `<section class="card"><div class="card-head"><h3>Yet to receive</h3><span class="muted small">gave in ${prevYear} · tap to log</span></div>
        <div class="pending">${list.map(p => `<a href="#/add?type=collection&name=${encodeURIComponent(p.name)}&cat=${encodeURIComponent(p.category)}" title="${esc(p.category)}">${esc(p.name)}${p.category === 'Family share' ? ' ✦' : ''} <span>${money(p.amount)}</span></a>`).join('')}</div>
        <p class="muted small" style="margin:10px 0 0">✦ = family share</p></section>`;
    }
  }

  // Who is holding / owed money (only meaningful when "handled by" is recorded).
  let handHtml = '';
  const hs = new Map();
  for (const e of d.entries) {
    if (!e.handledBy) continue;
    const k = e.handledBy.trim();
    const h = hs.get(k) || { rec: 0, paid: 0 };
    e.type === 'collection' ? h.rec += e.amount : h.paid += e.amount;
    hs.set(k, h);
  }
  if (hs.size && d.entries.some(e => e.type === 'collection' && e.handledBy)) {
    const rows = [...hs.entries()].sort((a, b) => (b[1].rec + b[1].paid) - (a[1].rec + a[1].paid));
    handHtml = `<section class="card"><div class="card-head"><h3>Money with people</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Person</th><th class="r">Received</th><th class="r">Paid out</th><th class="r">Holding</th></tr></thead><tbody>
      ${rows.map(([n, h]) => { const net = h.rec - h.paid; return `<tr><td>${esc(n)}</td><td class="r num">${h.rec ? money(h.rec) : '—'}</td><td class="r num">${h.paid ? money(h.paid) : '—'}</td><td class="r num ${net < 0 ? 'out' : 'in'}">${money(net)}</td></tr>`; }).join('')}
      </tbody></table></div><p class="muted small" style="margin:8px 0 0">Holding = collections received minus expenses paid. A negative figure means the puja owes that person.</p></section>`;
  }

  const notes = (d.notes || []).filter(Boolean);
  return `<div class="stack">
    ${yearChips()}
    <section class="hero">
      <div class="hero-title">${S.year} · ${t.b >= 0 ? 'Balance in hand' : 'Shortfall'}</div>
      <div class="hero-balance num ${t.b < 0 ? 'out' : ''}">${money(t.b)}</div>
      <span class="hero-tag ${t.b < 0 ? 'out' : 'in'}">${d.entries.length} entries${d.updatedAt ? ' · updated ' + fmtDate(d.updatedAt.slice(0, 10), true) : ''}</span>
      <div class="hero-split">
        <div><span class="lbl">Collected</span><span class="val num in">${money(t.c)}</span></div>
        <div><span class="lbl">Spent</span><span class="val num out">${money(t.x)}</span></div>
      </div>
    </section>
    <div class="quick">
      <a class="btn btn-lg btn-in" href="#/add?type=collection">＋ Collection</a>
      <a class="btn btn-lg btn-out" href="#/add?type=expense">＋ Expense</a>
    </div>
    ${pendingHtml}
    <div class="grid grid-2">
      <section class="card"><div class="card-head"><h3>Spent by category</h3></div>${bars(byKey(exp, 'category'), t.x, 'out')}</section>
      <section class="card"><div class="card-head"><h3>Collected by type</h3></div>${bars(byKey(col, 'category'), t.c)}</section>
    </div>
    <section class="card"><div class="card-head"><h3>Recent entries</h3><a href="#/ledger">See all →</a></div>
      ${recent.length ? `<ul class="list">${recent.map(entryRow).join('')}</ul>` : `<div class="empty">${feet}No entries for ${S.year} yet.<br>Tap <b>＋</b> to log the first collection or expense.</div>`}
    </section>
    ${handHtml}
    ${notes.length ? `<section class="card"><div class="card-head"><h3>Notes</h3><a href="#/settings">Edit</a></div><ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
  </div>`;
}

/* ---------------- Add / edit ---------------- */
function viewAdd(p) {
  const id = p.get('id');
  const existing = id ? yd().entries.find(e => e.id === id) : null;
  if (id && !existing) return `<div class="card empty">That entry was not found in ${S.year}. <a href="#/ledger">Back to ledger</a></div>`;
  const e = existing || {
    type: p.get('type') === 'expense' ? 'expense' : 'collection',
    name: p.get('name') || '', amount: '', date: todayISO(), category: '', mode: LS.get('lp-last-mode', 'Cash'),
    handledBy: LS.get('lp-last-handler', ''), remarks: '',
  };
  if (!existing && e.name) {
    const lt = lastTime(e.type, e.name);
    const part = lt && (lt.parts.find(([c]) => c === p.get('cat')) || lt.parts[0]);
    if (part) { e.category = part[0]; e.amount = part[1]; }
  }
  const cats = t => [...new Set([...CATEGORIES[t], ...allEntries().filter(x => x.type === t).map(x => x.category).filter(Boolean)])];
  const chipset = (name, list, val) => list.map((c, i) =>
    `<input type="radio" name="${name}" id="${name}${i}" value="${esc(c)}" ${c === val ? 'checked' : ''}><label for="${name}${i}">${esc(c)}</label>`).join('');

  return `<form class="form card" id="entryForm" autocomplete="off" novalidate>
    <div class="page-head"><h2>${existing ? 'Edit entry' : 'New entry'}</h2><span class="year-pill" title="Saved into this year's accounts">${S.year}</span></div>
    <div class="seg" role="radiogroup" aria-label="Entry type">
      <input type="radio" name="type" id="tIn" value="collection" ${e.type === 'collection' ? 'checked' : ''}><label for="tIn" class="in-l">↓ Collection</label>
      <input type="radio" name="type" id="tOut" value="expense" ${e.type === 'expense' ? 'checked' : ''}><label for="tOut" class="out-l">↑ Expense</label>
    </div>
    <div class="field">
      <label for="fAmt">Amount</label>
      <div class="amount-box"><span>₹</span><input id="fAmt" name="amount" type="text" inputmode="decimal" placeholder="0" value="${esc(e.amount)}" required></div>
    </div>
    <div class="field">
      <label for="fName" id="nameLbl">${e.type === 'collection' ? 'Received from' : 'Item / purpose'}</label>
      <input class="input" id="fName" name="name" list="nameList" value="${esc(e.name)}" required placeholder="${e.type === 'collection' ? 'e.g. Raju' : 'e.g. Mishti (Sweets)'}">
      <datalist id="nameList"></datalist>
      <div class="last-time" id="lastTime"></div>
    </div>
    <div class="field"><span class="label">Category</span>
      <div class="chips" id="catChips" data-in="${esc(JSON.stringify(cats('collection')))}" data-out="${esc(JSON.stringify(cats('expense')))}">${chipset('category', cats(e.type), e.category || CATEGORIES[e.type][0])}</div>
    </div>
    <div class="row-2">
      <div class="field"><label for="fDate">Date</label><input class="input" type="date" id="fDate" name="date" value="${esc(e.date || '')}"></div>
      <div class="field"><label for="fBy" id="byLbl">${e.type === 'collection' ? 'Received by' : 'Paid by'}</label>
        <input class="input" id="fBy" name="handledBy" list="byList" value="${esc(e.handledBy)}" placeholder="Who">
        <datalist id="byList">${handlers().map(h => `<option value="${esc(h)}">`).join('')}</datalist></div>
    </div>
    <div class="field"><span class="label">Payment mode</span><div class="chips">${chipset('mode', [...new Set([...MODES, e.mode].filter(Boolean))], e.mode)}</div></div>
    <div class="field"><label for="fRem">Remarks <span class="muted small">(optional)</span></label>
      <textarea class="input" id="fRem" name="remarks" rows="2" placeholder="Bill no., who it was paid to, etc.">${esc(e.remarks)}</textarea></div>
    <button class="btn btn-primary btn-lg btn-block" type="submit" id="saveBtn">${existing ? 'Save changes' : 'Save entry'}</button>
    ${existing ? `<div class="btn-row"><a class="btn" href="#/ledger" style="flex:1">Cancel</a><button type="button" class="btn btn-danger" id="delBtn" style="flex:1">Delete</button></div>` : ''}
  </form>`;
}

function bindAdd(p) {
  const f = $('#entryForm');
  if (!f) return;
  const id = p.get('id');
  const type = () => f.type.value;
  const chips = $('#catChips');
  const fillNames = () => { $('#nameList').innerHTML = suggestions(type()).map(n => `<option value="${esc(n)}">`).join(''); };
  const showLast = () => {
    const lt = lastTime(type(), f.name.value);
    const box = $('#lastTime');
    if (!lt) { box.innerHTML = ''; return; }
    box.innerHTML = `In ${lt.year}: ` + lt.parts.map(([c, v], i) =>
      `<b>${money(v)}</b> ${esc(c)} <button type="button" data-use="${i}">use</button>`).join(' · ');
    $$('[data-use]', box).forEach(b => b.onclick = () => { const [c, v] = lt.parts[+b.dataset.use]; f.amount.value = v; setCat(c); });
    if (!id && !f.dataset.catTouched) setCat(lt.parts[0][0]);
  };
  const setCat = c => { const r = $$('input[name=category]', f).find(x => x.value === c); if (r) r.checked = true; };
  const rebuildCats = () => {
    const list = JSON.parse(type() === 'collection' ? chips.dataset.in : chips.dataset.out);
    chips.innerHTML = list.map((c, i) => `<input type="radio" name="category" id="category${i}" value="${esc(c)}" ${i === 0 ? 'checked' : ''}><label for="category${i}">${esc(c)}</label>`).join('');
  };
  $$('input[name=type]', f).forEach(r => r.addEventListener('change', () => {
    const inn = type() === 'collection';
    $('#nameLbl').textContent = inn ? 'Received from' : 'Item / purpose';
    $('#byLbl').textContent = inn ? 'Received by' : 'Paid by';
    f.name.placeholder = inn ? 'e.g. Raju' : 'e.g. Mishti (Sweets)';
    rebuildCats(); fillNames(); showLast();
  }));
  chips.addEventListener('change', () => { f.dataset.catTouched = '1'; });
  f.name.addEventListener('input', showLast);
  if (p.get('cat')) f.dataset.catTouched = '1';
  fillNames(); showLast();
  if (!id) setTimeout(() => f.amount.focus(), 50);

  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const amount = Number(String(f.amount.value).replace(/[,₹\s]/g, ''));
    const name = f.name.value.trim();
    if (!amount || !isFinite(amount)) { toast('Enter an amount', true); f.amount.focus(); return; }
    if (!name) { toast(type() === 'collection' ? 'Who gave it?' : 'What was it for?', true); f.name.focus(); return; }
    const entry = {
      id: id || `${S.year}-${uid()}`, type: type(), date: f.date.value || null,
      category: $('input[name=category]:checked', f)?.value || '', name, amount,
      mode: $('input[name=mode]:checked', f)?.value || '', handledBy: f.handledBy.value.trim(), remarks: f.remarks.value.trim(),
    };
    const btn = $('#saveBtn'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await mutate(S.year, d => {
        const i = d.entries.findIndex(x => x.id === entry.id);
        if (i >= 0) d.entries[i] = { ...d.entries[i], ...entry, editedAt: new Date().toISOString() };
        else d.entries.push({ ...entry, createdAt: new Date().toISOString() });
      }, `${id ? 'Edit' : 'Add'} ${entry.type}: ${entry.name} ₹${entry.amount}`);
      LS.set('lp-last-mode', entry.mode); LS.set('lp-last-handler', entry.handledBy);
      toast(`${id ? 'Updated' : 'Saved'} · ${signed(entry.amount, entry.type)} ${entry.name}`);
      if (id) { location.hash = '#/ledger'; }
      else {
        // Fresh form for the next entry, same type (drops any prefilled name from the URL).
        const next = '#/add?type=' + entry.type;
        if (location.hash !== next) location.hash = next; else render();
      }
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false; btn.textContent = id ? 'Save changes' : 'Save entry';
    }
  });

  const del = $('#delBtn');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Delete this entry? This cannot be undone from the app.')) return;
    del.disabled = true;
    try {
      await mutate(S.year, d => { d.entries = d.entries.filter(x => x.id !== id); }, `Delete entry ${id}`);
      toast('Entry deleted');
      location.hash = '#/ledger';
    } catch (e) { toast(e.message, true); del.disabled = false; }
  });
}

/* ---------------- Ledger ---------------- */
const ledgerState = { type: 'all', q: '', cat: '' };
function viewLedger() {
  const d = yd();
  const cats = [...new Set(d.entries.map(e => e.category).filter(Boolean))].sort();
  return `<div class="stack">
    <div class="page-head"><h1>Ledger ${S.year}</h1><a class="btn btn-primary" href="#/add">＋ Add</a></div>
    ${yearChips()}
    <div class="card">
      <div class="filters" style="margin-bottom:12px">
        <div class="chips" role="group" aria-label="Show">
          ${['all', 'collection', 'expense'].map(t => `<button class="chip ${ledgerState.type === t ? 'on' : ''}" data-ltype="${t}">${{ all: 'All', collection: 'Collections', expense: 'Expenses' }[t]}</button>`).join('')}
        </div>
        <select class="input" id="lCat" style="width:auto"><option value="">All categories</option>${cats.map(c => `<option ${c === ledgerState.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <input class="input grow" id="lQ" type="search" placeholder="Search name, remarks…" value="${esc(ledgerState.q)}">
      </div>
      <div id="lBody"></div>
    </div>
  </div>`;
}
function renderLedgerBody() {
  const q = norm(ledgerState.q);
  const list = sortEntries(yd().entries.filter(e =>
    (ledgerState.type === 'all' || e.type === ledgerState.type) &&
    (!ledgerState.cat || e.category === ledgerState.cat) &&
    (!q || norm([e.name, e.remarks, e.handledBy, e.mode, e.category].join(' ')).includes(q))));
  const c = sum(list.filter(e => e.type === 'collection')), x = sum(list.filter(e => e.type === 'expense'));
  $('#lBody').innerHTML = `<p class="muted small" style="margin:0 0 6px">${list.length} entries · <span class="in">+${money(c)}</span> · <span class="out">−${money(x)}</span></p>`
    + (list.length ? `<ul class="list">${list.map(entryRow).join('')}</ul>` : `<div class="empty">${feet}Nothing matches.</div>`);
}
function bindLedger() {
  $$('[data-ltype]').forEach(b => b.addEventListener('click', () => {
    ledgerState.type = b.dataset.ltype;
    $$('[data-ltype]').forEach(x => x.classList.toggle('on', x === b));
    renderLedgerBody();
  }));
  $('#lCat').addEventListener('change', e => { ledgerState.cat = e.target.value; renderLedgerBody(); });
  $('#lQ').addEventListener('input', e => { ledgerState.q = e.target.value; renderLedgerBody(); });
  renderLedgerBody();
}

/* ---------------- Report ---------------- */
function groupTable(entries, type) {
  const groups = byKey(entries, 'category');
  if (!groups.length) return '<p class="muted">None recorded.</p>';
  const inn = type === 'collection';
  const head = inn
    ? '<tr><th>Name</th><th>Date</th><th>Mode</th><th>Remarks</th><th class="r">Amount</th></tr>'
    : '<tr><th>Item</th><th>Date</th><th>Paid by</th><th>Remarks</th><th class="r">Amount</th></tr>';
  const body = groups.map(([cat, tot]) => {
    const rows = entries.filter(e => (e.category || '—') === cat).sort((a, b) => b.amount - a.amount);
    return `<tr class="grp"><td colspan="5">${esc(cat)}</td></tr>`
      + rows.map(e => `<tr><td>${esc(e.name)}</td><td class="num">${fmtDate(e.date) || '—'}</td><td>${esc(inn ? e.mode : e.handledBy) || '—'}</td><td class="small">${esc(e.remarks)}</td><td class="r num">${money(e.amount)}</td></tr>`).join('')
      + `<tr class="sub"><td colspan="4">Subtotal · ${esc(cat)}</td><td class="r num">${money(tot)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}
    <tr class="pos"><td colspan="4">Total ${inn ? 'collected' : 'spent'}</td><td class="r num ${inn ? 'in' : 'out'}">${money(sum(entries))}</td></tr></tbody></table></div>`;
}
function viewReport() {
  const d = yd(), t = totals(d);
  const col = d.entries.filter(e => e.type === 'collection');
  const exp = d.entries.filter(e => e.type === 'expense');
  const notes = (d.notes || []).filter(Boolean);
  return `<div class="stack">
    <div class="page-head no-print"><h1>Report</h1>
      <div class="toolbar">
        <button class="btn btn-primary" id="rPrint">Print / Save PDF</button>
        <button class="btn" id="rXlsx">Excel</button>
        <button class="btn" id="rCsv">CSV</button>
      </div></div>
    <div class="no-print">${yearChips()}</div>
    <article class="report">
      <header class="report-head">
        <div class="lotus-line"><i></i></div>
        <div class="bn" lang="bn">শ্রী শ্রী লক্ষ্মী পূজা</div>
        <h1>Lakshmi Puja ${S.year} — Statement of Accounts</h1>
        <div class="muted small">${yearLabel(S.year) ? yearLabel(S.year) + ' · ' : ''}Prepared ${fmtDate(todayISO(), true)}</div>
      </header>
      <div class="summary-grid">
        <div><span class="lbl">Collected</span><span class="val num in">${money(t.c)}</span></div>
        <div><span class="lbl">Spent</span><span class="val num out">${money(t.x)}</span></div>
        <div><span class="lbl">${t.b >= 0 ? 'Surplus' : 'Shortfall'}</span><span class="val num ${t.b < 0 ? 'out' : 'in'}">${money(t.b)}</span></div>
      </div>
      <h2>Collections</h2>${groupTable(col, 'collection')}
      <h2>Expenditure</h2>${groupTable(exp, 'expense')}
      <h2>Summary</h2>
      <div class="table-wrap"><table><tbody>
        ${byKey(col, 'category').map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r num">${money(v)}</td></tr>`).join('')}
        <tr class="sub"><td>Total collected</td><td class="r num">${money(t.c)}</td></tr>
        ${byKey(exp, 'category').map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r num">${money(v)}</td></tr>`).join('')}
        <tr class="sub"><td>Total spent</td><td class="r num">${money(t.x)}</td></tr>
        <tr class="pos"><td>${t.b >= 0 ? 'Surplus (balance in hand)' : 'Shortfall'}</td><td class="r num ${t.b < 0 ? 'out' : 'in'}">${money(t.b)}</td></tr>
      </tbody></table></div>
      ${notes.length ? `<h2>Notes</h2><ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <p class="report-foot">শুভ কোজাগরী লক্ষ্মী পূজা · ${d.entries.length} entries</p>
    </article>
  </div>`;
}
function rowsForExport(d) {
  return sortEntries(d.entries).reverse().map(e => ({
    Type: e.type === 'collection' ? 'Collection' : 'Expense', Date: e.date || '', Category: e.category || '',
    'Name / Item': e.name, Amount: e.amount, Mode: e.mode || '', 'Handled by': e.handledBy || '', Remarks: e.remarks || '',
  }));
}
function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCsv() {
  const rows = rowsForExport(yd());
  const cols = ['Type', 'Date', 'Category', 'Name / Item', 'Amount', 'Mode', 'Handled by', 'Remarks'];
  const q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => q(r[c] ?? '')).join(','))].join('\r\n');
  download(`Lakshmi-Puja-${S.year}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}
let xlsxLoading;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  return xlsxLoading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = res; s.onerror = () => { xlsxLoading = null; rej(new Error('Could not load the Excel library — are you online?')); };
    document.head.appendChild(s);
  });
}
async function exportXlsx() {
  try { await loadXlsx(); } catch (e) { return toast(e.message, true); }
  const d = yd(), t = totals(d), X = window.XLSX;
  const wb = X.utils.book_new();
  const col = d.entries.filter(e => e.type === 'collection'), exp = d.entries.filter(e => e.type === 'expense');
  const summary = [
    [`Lakshmi Puja ${S.year} — Statement of Accounts`], [],
    ['Collections by type', 'Amount'], ...byKey(col, 'category'), ['Total collected', t.c], [],
    ['Expenses by category', 'Amount'], ...byKey(exp, 'category'), ['Total spent', t.x], [],
    [t.b >= 0 ? 'Surplus' : 'Shortfall', t.b], [],
    ...(d.notes || []).filter(Boolean).map(n => ['Note', n]),
  ];
  const ws0 = X.utils.aoa_to_sheet(summary); ws0['!cols'] = [{ wch: 34 }, { wch: 16 }];
  X.utils.book_append_sheet(wb, ws0, 'Summary');
  const sheet = (list, who) => {
    const rows = list.slice().sort((a, b) => (a.category || '').localeCompare(b.category || '') || b.amount - a.amount)
      .map(e => ({ Category: e.category || '', [who === 'Received by' ? 'Name' : 'Item']: e.name, Amount: e.amount, Date: e.date || '', Mode: e.mode || '', [who]: e.handledBy || '', Remarks: e.remarks || '' }));
    const ws = X.utils.json_to_sheet(rows);
    X.utils.sheet_add_aoa(ws, [['Total', '', sum(list)]], { origin: -1 });
    ws['!cols'] = [{ wch: 22 }, { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 50 }];
    return ws;
  };
  X.utils.book_append_sheet(wb, sheet(col, 'Received by'), 'Collections');
  X.utils.book_append_sheet(wb, sheet(exp, 'Paid by'), 'Expenses');
  X.writeFile(wb, `Lakshmi-Puja-${S.year}.xlsx`);
}
function bindReport() {
  $('#rPrint').onclick = () => window.print();
  $('#rCsv').onclick = exportCsv;
  $('#rXlsx').onclick = exportXlsx;
}

/* ---------------- History ---------------- */
const histState = { q: '' };
function viewHistory() {
  const ys = [...S.years].sort((a, b) => a - b);
  if (!ys.length) return `<div class="card empty">${feet}No years yet.</div>`;
  const tt = ys.map(y => ({ y, ...totals(yd(y)), n: new Set(yd(y).entries.filter(e => e.type === 'collection').map(e => norm(e.name))).size }));
  const cats = [...new Set(ys.flatMap(y => yd(y).entries.filter(e => e.type === 'expense').map(e => e.category)))];
  return `<div class="stack">
    <div class="page-head"><h1>Past years</h1><button class="btn" id="hBackup" title="Download every year's data as JSON">Backup all (JSON)</button></div>
    <section class="card"><div class="card-head"><h3>Collected vs spent</h3></div>
      <div class="chart">${histChart(tt)}</div>
      <div class="legend"><span><i style="background:var(--gold)"></i>Collected</span><span><i style="background:var(--red)"></i>Spent</span></div>
    </section>
    <section class="card"><div class="table-wrap"><table>
      <thead><tr><th>Year</th><th class="r">Collected</th><th class="r">Spent</th><th class="r">Balance</th><th class="r">Givers</th><th></th></tr></thead>
      <tbody>${tt.slice().reverse().map(r => `<tr><td><b>${r.y}</b> <span class="muted small">${yearLabel(r.y)}</span></td><td class="r num">${money(r.c)}</td><td class="r num">${money(r.x)}</td><td class="r num ${r.b < 0 ? 'out' : 'in'}">${money(r.b)}</td><td class="r num">${r.n}</td>
        <td class="r"><a href="#/report" data-open="${r.y}">Report</a></td></tr>`).join('')}</tbody></table></div></section>
    <section class="card"><div class="card-head"><h3>Expenses by category, year on year</h3></div><div class="table-wrap"><table>
      <thead><tr><th>Category</th>${ys.map(y => `<th class="r">${y}</th>`).join('')}</tr></thead>
      <tbody>${cats.map(c => `<tr><td>${esc(c)}</td>${ys.map(y => { const v = sum(yd(y).entries.filter(e => e.type === 'expense' && e.category === c)); return `<td class="r num">${v ? money(v) : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody>
    </table></div></section>
    <section class="card"><div class="card-head"><h3>Contributions by person</h3></div>
      <input class="input" id="hQ" type="search" placeholder="Search a name…" value="${esc(histState.q)}" style="margin-bottom:10px">
      <div id="hPeople"></div></section>
  </div>`;
}
function histChart(tt) {
  const W = 640, H = 240, pad = { l: 56, r: 10, t: 16, b: 28 };
  const max = Math.max(...tt.map(r => Math.max(r.c, r.x)), 1);
  const nice = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / nice) * nice;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, gw = iw / tt.length, bw = Math.min(34, gw / 3);
  const y = v => pad.t + ih - v / top * ih;
  const ticks = [0, .25, .5, .75, 1].map(f => f * top);
  const short = v => v >= 1e5 ? (v / 1e5).toFixed(v % 1e5 ? 1 : 0) + 'L' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : v;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Collected versus spent per year">
    ${ticks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="var(--muted)">₹${short(v)}</text>`).join('')}
    ${tt.map((r, i) => { const cx = pad.l + gw * i + gw / 2; return `
      <rect x="${cx - bw - 2}" y="${y(r.c)}" width="${bw}" height="${ih + pad.t - y(r.c)}" rx="4" fill="var(--gold)"><title>${r.y} collected ${money(r.c)}</title></rect>
      <rect x="${cx + 2}" y="${y(r.x)}" width="${bw}" height="${ih + pad.t - y(r.x)}" rx="4" fill="var(--red)"><title>${r.y} spent ${money(r.x)}</title></rect>
      <text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="13" fill="var(--ink)">${r.y}</text>`; }).join('')}
  </svg>`;
}
function renderPeople() {
  const ys = [...S.years].sort((a, b) => a - b);
  const m = new Map();
  for (const y of ys) for (const e of yd(y).entries) {
    if (e.type !== 'collection' || e.category === 'Joutho Fund') continue;
    const k = norm(e.name);
    const r = m.get(k) || { name: e.name, by: {} };
    r.by[y] = (r.by[y] || 0) + e.amount; m.set(k, r);
  }
  const q = norm(histState.q);
  const rows = [...m.values()].filter(r => !q || norm(r.name).includes(q))
    .sort((a, b) => sum(Object.values(b.by), v => v) - sum(Object.values(a.by), v => v));
  $('#hPeople').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Name</th>${ys.map(y => `<th class="r">${y}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td>${ys.map(y => `<td class="r num">${r.by[y] ? money(r.by[y]) : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${ys.length + 1}" class="muted">No match.</td></tr>`}</tbody></table></div>`;
}
function bindHistory() {
  if (!$('#hPeople')) return;
  renderPeople();
  $('#hQ').addEventListener('input', e => { histState.q = e.target.value; renderPeople(); });
  $$('[data-open]').forEach(a => a.addEventListener('click', () => setYear(a.dataset.open)));
  $('#hBackup').onclick = () => {
    const all = Object.fromEntries(S.years.map(y => [y, yd(y)]));
    download(`lakshmi-puja-backup-${todayISO()}.json`, new Blob([JSON.stringify(all, null, 1)], { type: 'application/json' }));
  };
}

/* ---------------- Settings ---------------- */
function viewSettings() {
  const c = S.cfg || {};
  const first = !S.cfg;
  const d = S.cfg ? yd() : null;
  return `<div class="stack ${first ? 'welcome' : ''}">
    ${first ? `<div class="welcome-hero">${feet}<h1>Welcome</h1><p class="muted">Keep this year's puja collections and expenses in one place — from your phone or laptop.</p></div>` : '<div class="page-head"><h1>Settings</h1></div>'}
    <form class="card form" id="cfgForm" autocomplete="off">
      <div class="card-head" style="margin:0"><h3>Connect your private data repo</h3>${c.mode === 'github' ? '<span class="year-pill">Connected</span>' : ''}</div>
      <div class="row-2">
        <div class="field"><label for="cOwner">GitHub username</label><input class="input" id="cOwner" name="owner" value="${esc(c.owner || '')}" placeholder="your-username" autocapitalize="off" spellcheck="false"></div>
        <div class="field"><label for="cRepo">Data repo</label><input class="input" id="cRepo" name="repo" value="${esc(c.repo || 'laxmi_puja_private')}" autocapitalize="off" spellcheck="false"></div>
      </div>
      <div class="field"><label for="cToken">Access token</label>
        <input class="input" id="cToken" name="token" type="password" value="${esc(c.token || '')}" placeholder="github_pat_…" autocapitalize="off" spellcheck="false">
        <div class="hint">Stored only in this browser. Use a fine-grained token limited to the data repo with <b>Contents: Read and write</b>.</div></div>
      <details><summary>How do I get a token?</summary><ol class="steps small">
        <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → Settings → Fine-grained tokens → Generate new token</a>.</li>
        <li>Repository access: <b>Only select repositories</b> → pick your private data repo.</li>
        <li>Permissions → Repository → <b>Contents: Read and write</b>. Nothing else.</li>
        <li>Generate, copy it, and paste it above. Do this once on each device.</li></ol></details>
      <div class="field"><label for="cBranch">Branch <span class="muted small">(leave blank for the default)</span></label><input class="input" id="cBranch" name="branch" value="${esc(c.branch || '')}" placeholder="main" autocapitalize="off"></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit" id="cSave">Test &amp; save</button>
      ${first || c.mode !== 'demo' ? '<button class="btn btn-block" type="button" id="cDemo">Try demo mode (saves only in this browser)</button>' : ''}
    </form>
    ${S.cfg ? `
    <section class="card form">
      <div class="card-head" style="margin:0"><h3>Years</h3></div>
      <div class="field"><span class="label">Working year</span>${yearChips() || `<span class="year-pill">${S.year}</span>`}</div>
      <div class="row-2" style="align-items:end">
        <div class="field"><label for="nYear">Start a new year</label><input class="input" id="nYear" type="number" inputmode="numeric" value="${Math.max(latestYear() + (S.years.includes(THIS_YEAR) ? 1 : 0), THIS_YEAR)}"></div>
        <button class="btn" type="button" id="nYearBtn">Create year</button>
      </div>
    </section>
    <section class="card form">
      <div class="card-head" style="margin:0"><h3>Notes for ${S.year}</h3></div>
      <div class="field"><label for="nNotes" class="muted small" style="font-weight:400">One note per line — settlements, who owes whom, reminders. Shown on the home page and in the report.</label>
        <textarea class="input" id="nNotes" rows="5">${esc((d.notes || []).join('\n'))}</textarea></div>
      <button class="btn btn-gold" type="button" id="nSave">Save notes</button>
    </section>
    <section class="card"><div class="btn-row">
      <button class="btn" type="button" data-act="retry">Reload data</button>
      <button class="btn btn-danger" type="button" id="cForget">Disconnect this device</button></div></section>` : ''}
  </div>`;
}
function bindSettings() {
  bindYearChips();
  const f = $('#cfgForm');
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const cfg = { mode: 'github', owner: f.owner.value.trim(), repo: f.repo.value.trim(), token: f.token.value.trim(), branch: f.branch.value.trim() };
    if (!cfg.owner || !cfg.repo || !cfg.token) return toast('Fill in username, repo and token', true);
    const btn = $('#cSave'); btn.disabled = true; btn.textContent = 'Checking…';
    try {
      const store = new GitHubStore(cfg);
      const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!r.ok) throw new Error(r.status === 401 ? 'Token is invalid or expired.' : 'Cannot see that repo — check the name and the token’s repository access.');
      const info = await r.json();
      if (info.permissions && !info.permissions.push) throw new Error('Token can read but not write — set Contents: Read and write.');
      const ys = await store.listYears();
      Object.assign(S, { cfg, store, years: [], data: {}, error: '' }); LS.set('lp-config', cfg);
      if (!ys.length) await mutate(THIS_YEAR, () => { }, `Start ${THIS_YEAR}`);
      toast(info.private === false ? 'Connected — warning: this repo is PUBLIC' : 'Connected ✓', info.private === false);
      S.ready = false; render(); await refreshAll();
      location.hash = '#/';
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false; btn.textContent = 'Test & save';
    }
  });
  const demo = $('#cDemo');
  if (demo) demo.onclick = async () => {
    S.cfg = { mode: 'demo' }; LS.set('lp-config', S.cfg); S.store = new DemoStore();
    S.ready = false; render(); await refreshAll(); location.hash = '#/';
  };
  const ny = $('#nYearBtn');
  if (ny) ny.onclick = async () => {
    const y = +$('#nYear').value;
    if (!(y >= 2000 && y <= 2100)) return toast('Enter a valid year', true);
    if (S.years.includes(y)) { setYear(y); render(); return toast(`${y} already exists — switched to it`); }
    ny.disabled = true;
    try { await mutate(y, () => { }, `Start ${y}`); setYear(y); toast(`${y} created`); render(); }
    catch (e) { toast(e.message, true); ny.disabled = false; }
  };
  const ns = $('#nSave');
  if (ns) ns.onclick = async () => {
    const notes = $('#nNotes').value.split('\n').map(s => s.trim()).filter(Boolean);
    ns.disabled = true;
    try { await mutate(S.year, d => { d.notes = notes; }, `Update notes ${S.year}`); toast('Notes saved'); }
    catch (e) { toast(e.message, true); }
    ns.disabled = false;
  };
  const fg = $('#cForget');
  if (fg) fg.onclick = () => {
    if (!confirm('Remove the saved token and cached data from this device? (Your data on GitHub is not touched.)')) return;
    LS.del(cacheKey()); LS.del('lp-config'); LS.del('lp-year');
    if (S.cfg.mode === 'demo') { for (const y of S.years) LS.del('lp-demo-' + y); LS.del('lp-demo-years'); }
    Object.assign(S, { cfg: null, store: null, years: [], data: {}, year: null, error: '' });
    location.hash = '#/settings'; render();
  };
}

/* ---------------- bind per view ---------------- */
function bind(path, params) {
  bindYearChips();
  if (path === 'add') bindAdd(params);
  else if (path === 'ledger') bindLedger();
  else if (path === 'report') bindReport();
  else if (path === 'history') bindHistory();
}

boot();
