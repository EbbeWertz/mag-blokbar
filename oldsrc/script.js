// ============================================================
// CONFIG — VERANDER DIT MET JOUW SUPABASE GEGEVENS
// ============================================================
const SUPA_URL = 'https://fpyhywgluieifxeianpp.supabase.co';
const SUPA_KEY = 'sb_publishable_CkawR7F0S7KgkmxwtrH3bA_CLNLy5gE';

// ============================================================
// SUPABASE INIT
// ============================================================
let db = null;
try {
  if (!SUPA_URL.includes('YOUR_PROJECT')) {
    db = supabase.createClient(SUPA_URL, SUPA_KEY);
  }
} catch(e) {}

// ============================================================
// LOCAL STATE
// ============================================================
let myId = localStorage.getItem('blokbar_uid') || (() => {
  const id = crypto.randomUUID();
  localStorage.setItem('blokbar_uid', id);
  return id;
})();
let myName = localStorage.getItem('blokbar_name') || null;

let studyActive = false;
let studyStart = null;
let studyBase = parseInt(localStorage.getItem('blokbar_secs') || '0');
let isMuted = false;
let playlist = [];
let playIdx = 0;
let timers = [];
let activities = [];
let allUsers = {};
let prevRanks = {};

// ============================================================
// ROUTER
// ============================================================
const pDash = document.getElementById('page-dashboard');
const pScherm = document.getElementById('page-scherm');

function route() {
  const hash = location.hash;
  const isScherm = hash === '#scherm' || hash === '#/scherm';
  pDash.classList.toggle('active', !isScherm);
  pScherm.classList.toggle('active', isScherm);
  document.getElementById('id-modal').classList.toggle('gone', isScherm || !!myName);
  if (isScherm) { initScherm(); }
  else { initDash(); }
}
window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);

// ============================================================
// IDENTITY
// ============================================================
document.getElementById('btn-name-ok').addEventListener('click', submitName);
document.getElementById('inp-name').addEventListener('keydown', e => e.key === 'Enter' && submitName());
function submitName() {
  const v = document.getElementById('inp-name').value.trim();
  if (!v) return;
  myName = v;
  localStorage.setItem('blokbar_name', v);
  document.getElementById('id-modal').classList.add('gone');
  document.getElementById('d-welcome').textContent = `Hoi, ${myName}! 👋`;
  upsertPresence();
}

// ============================================================
// DB HELPERS
// ============================================================
async function dbGet(t) {
  if (!db) return [];
  const { data, error } = await db.from(t).select('*');
  return data || [];
}
async function dbUpsert(t, row) {
  if (!db) return;
  await db.from(t).upsert(row);
}
async function dbDel(t, id) {
  if (!db) return;
  await db.from(t).delete().eq('id', id);
}
function sub(table, fn) {
  if (!db) return;
  db.channel('rt_' + table)
    .on('postgres_changes', { event: '*', schema: 'public', table }, fn)
    .subscribe();
}

// ============================================================
// PRESENCE
// ============================================================
async function upsertPresence() {
  if (!myName || !db) return;
  await dbUpsert('blokbar_users', {
    id: myId, name: myName,
    studying: studyActive,
    study_seconds: getStudySecs(),
    last_seen: new Date().toISOString()
  });
}
function getStudySecs() {
  const extra = studyActive ? Math.floor((Date.now() - studyStart) / 1000) : 0;
  return studyBase + extra;
}
async function loadUsers() {
  const data = await dbGet('blokbar_users');
  const now = Date.now();
  allUsers = {};
  data.forEach(u => {
    if (now - new Date(u.last_seen).getTime() < 90000) allUsers[u.id] = u;
  });
  const sorted = Object.values(allUsers).sort((a,b) => b.study_seconds - a.study_seconds);
  // rank change notifications
  sorted.forEach((u, i) => {
    if (prevRanks[u.id] !== undefined && prevRanks[u.id] > i && i < 3) {
      notif(`🏅 ${u.name} klimt naar plek ${i+1}!`, 'rank');
    }
    prevRanks[u.id] = i;
  });
  renderOnline(sorted);
  renderLb(sorted);
}
sub('blokbar_users', () => loadUsers());
setInterval(upsertPresence, 20000);
setInterval(loadUsers, 15000);
window.addEventListener('beforeunload', () => {
  studyBase = getStudySecs();
  localStorage.setItem('blokbar_secs', studyBase);
  if (db && myName) {
    // best-effort sync
    navigator.sendBeacon && navigator.sendBeacon(
      `${SUPA_URL}/rest/v1/blokbar_users?id=eq.${myId}`,
      JSON.stringify({ studying: false, study_seconds: studyBase, last_seen: new Date().toISOString() })
    );
  }
});

// ============================================================
// STUDY TIMER
// ============================================================
document.getElementById('d-study-btn').addEventListener('click', toggleStudy);
function toggleStudy() {
  if (studyActive) {
    studyBase = getStudySecs();
    localStorage.setItem('blokbar_secs', studyBase);
    studyActive = false; studyStart = null;
    document.getElementById('d-study-btn').textContent = '▶ Start';
    document.getElementById('d-study-btn').className = 'btn-action btn-go';
    document.getElementById('d-dot').className = 'dot';
    document.getElementById('d-state').textContent = 'Gestopt';
  } else {
    studyStart = Date.now();
    studyActive = true;
    document.getElementById('d-study-btn').textContent = '⏹ Stop';
    document.getElementById('d-study-btn').className = 'btn-action btn-stop';
    document.getElementById('d-dot').className = 'dot on';
    document.getElementById('d-state').textContent = 'Aan het studeren';
  }
  upsertPresence();
}
setInterval(() => {
  const s = getStudySecs();
  document.getElementById('d-time').textContent = fmtSec(s);
}, 1000);

// ============================================================
// TIMERS
// ============================================================
document.getElementById('d-timer-add').addEventListener('click', addTimer);
async function addTimer() {
  const lbl = document.getElementById('t-label').value.trim() || 'Timer';
  const mins = parseInt(document.getElementById('t-min').value);
  const t = { id: crypto.randomUUID(), label: lbl, ends_at: new Date(Date.now() + mins*60000).toISOString(), owner_id: myId, owner_name: myName };
  document.getElementById('t-label').value = '';
  await dbUpsert('blokbar_timers', t);
  notif(`⏰ ${myName} heeft een timer ingesteld: "${lbl}" (${mins} min)`, 'timer');
  loadTimers();
}
window.delTimer = async (id) => { await dbDel('blokbar_timers', id); loadTimers(); };
async function loadTimers() {
  const data = await dbGet('blokbar_timers');
  const now = Date.now();
  // remove expired
  const expired = data.filter(t => new Date(t.ends_at).getTime() < now);
  for (const t of expired) {
    notif(`✅ Timer klaar: "${t.label}" (${t.owner_name})`, 'timer');
    await dbDel('blokbar_timers', t.id);
  }
  timers = data.filter(t => new Date(t.ends_at).getTime() >= now);
  renderTimers();
}
function renderTimers() {
  const el = document.getElementById('d-timers');
  if (!timers.length) { el.innerHTML = '<div class="empty-msg">Geen actieve timers.</div>'; return; }
  el.innerHTML = timers.map(t => {
    const rem = Math.max(0, Math.round((new Date(t.ends_at).getTime() - Date.now()) / 1000));
    const urg = rem < 60;
    return `<div class="item-row">
      <div class="item-label">${t.label}</div>
      <div class="item-meta">${t.owner_name}</div>
      <div class="timer-left ${urg?'urgent':''}" data-ends="${t.ends_at}">${fmtSec(rem)}</div>
      ${t.owner_id===myId ? `<button class="btn-sm del" onclick="delTimer('${t.id}')">✕</button>` : ''}
    </div>`;
  }).join('');
}
setInterval(() => {
  document.querySelectorAll('.timer-left[data-ends]').forEach(el => {
    const rem = Math.max(0, Math.round((new Date(el.dataset.ends).getTime() - Date.now()) / 1000));
    el.textContent = fmtSec(rem);
    el.className = 'timer-left' + (rem < 60 ? ' urgent' : '');
  });
}, 1000);
setInterval(loadTimers, 30000);
sub('blokbar_timers', () => loadTimers());

// ============================================================
// PLAYLIST
// ============================================================
document.getElementById('d-playlist-add').addEventListener('click', addPlaylist);
document.getElementById('d-skip').addEventListener('click', skipPlaylist);
async function addPlaylist() {
  const url = document.getElementById('p-url').value.trim();
  if (!url) return;
  const title = document.getElementById('p-title').value.trim() || url.replace(/^https?:\/\//, '').split('/')[0].replace('www.','');
  await dbUpsert('blokbar_playlist', { id: crypto.randomUUID(), url, title, added_by: myName, sort_order: Date.now() });
  document.getElementById('p-url').value = '';
  document.getElementById('p-title').value = '';
  notif(`🎵 ${myName} heeft "${title}" toegevoegd`, 'music');
  loadPlaylist();
}
async function skipPlaylist() {
  const newIdx = (playIdx + 1) % Math.max(1, playlist.length);
  await dbUpsert('blokbar_state', { key: 'play_idx', value: String(newIdx) });
  notif(`⏭ ${myName} heeft overgeslagen naar het volgende`, 'music');
}
window.delPlaylist = async (id) => { await dbDel('blokbar_playlist', id); loadPlaylist(); };
async function loadPlaylist() {
  const [items, state] = await Promise.all([dbGet('blokbar_playlist'), dbGet('blokbar_state')]);
  items.sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
  playlist = items;
  const idxRow = state.find(s => s.key === 'play_idx');
  playIdx = idxRow ? (parseInt(idxRow.value) % Math.max(1, playlist.length)) : 0;
  renderPlaylist();
  setVideo();
}
function renderPlaylist() {
  const el = document.getElementById('d-playlist');
  if (!playlist.length) { el.innerHTML = '<div class="empty-msg">Geen video\'s. Voeg een URL toe hieronder.</div>'; return; }
  el.innerHTML = playlist.map((item, i) => `
    <div class="item-row${i===playIdx?' playing':''}">
      ${i===playIdx ? '<div class="playing-pip"></div>' : ''}
      <div class="item-label">${item.title||item.url}</div>
      <div class="item-meta">${item.added_by||''}</div>
      <button class="btn-sm del" onclick="delPlaylist('${item.id}')">✕</button>
    </div>`).join('');
}
function setVideo() {
  if (!playlist.length) return;
  const item = playlist[playIdx % playlist.length];
  const vid = document.getElementById('bg-video');
  const ifr = document.getElementById('bg-iframe');
  const layer = document.getElementById('bg-layer');

  // YouTube?
  const ytMatch = item.url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    const id = ytMatch[1];
    const muteParam = isMuted ? 1 : 0;
    const src = `https://www.youtube.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&mute=${muteParam}&controls=0&disablekb=1&modestbranding=1&iv_load_policy=3`;
    if (ifr.src !== src) {
      ifr.src = src;
      ifr.style.display = 'block';
      vid.style.display = 'none';
      vid.src = '';
    }
    layer.classList.add('ready');
    return;
  }
  // Internet Archive
  if (item.url.includes('archive.org')) {
    let src = item.url;
    if (!src.includes('/embed/')) src = src.replace('/details/', '/embed/');
    ifr.src = src; ifr.style.display = 'block'; vid.style.display = 'none'; vid.src = '';
    layer.classList.add('ready');
    return;
  }
  // Plain video
  ifr.style.display = 'none'; ifr.src = '';
  vid.style.display = 'block';
  if (vid.src !== item.url) {
    vid.src = item.url;
    vid.muted = true; // always muted via element (iframe needs mute param)
    vid.play().catch(()=>{});
  }
  layer.classList.add('ready');
}
sub('blokbar_playlist', () => loadPlaylist());
sub('blokbar_state', () => loadPlaylist());

// ============================================================
// MUTE
// ============================================================
document.getElementById('d-mute').addEventListener('click', async () => {
  isMuted = !isMuted;
  await dbUpsert('blokbar_state', { key: 'muted', value: isMuted ? '1' : '0' });
  applyMute();
});
function applyMute() {
  const btn = document.getElementById('d-mute');
  btn.textContent = isMuted ? '🔇 Gedempt' : '🔊 Geluid';
  btn.className = 'btn-link btn-mute' + (isMuted ? ' muted' : '');
  document.getElementById('mute-banner').classList.toggle('on', isMuted);
}
async function syncMute() {
  const data = await dbGet('blokbar_state');
  const row = data.find(s => s.key === 'muted');
  isMuted = row ? row.value === '1' : false;
  applyMute();
}

// ============================================================
// ACTIVITIES
// ============================================================
document.getElementById('d-act-add').addEventListener('click', addAct);
document.getElementById('a-inp').addEventListener('keydown', e => e.key === 'Enter' && addAct());
async function addAct() {
  const v = document.getElementById('a-inp').value.trim();
  if (!v) return;
  await dbUpsert('blokbar_activities', { id: crypto.randomUUID(), label: v, created_by: myName });
  document.getElementById('a-inp').value = '';
  loadActs();
}
window.delAct = async (id) => { await dbDel('blokbar_activities', id); loadActs(); };
async function loadActs() {
  const data = await dbGet('blokbar_activities');
  activities = data;
  renderActs();
}
function renderActs() {
  const el = document.getElementById('d-acts');
  if (!activities.length) { el.innerHTML = '<div class="empty-msg">Voeg activiteiten toe!</div>'; return; }
  el.innerHTML = activities.map(a => `
    <div class="item-row">
      <div class="item-label">${a.label}</div>
      <button class="btn-sm del" onclick="delAct('${a.id}')">✕</button>
    </div>`).join('');
}
sub('blokbar_activities', () => loadActs());

// ============================================================
// SPIN WHEEL
// ============================================================
document.getElementById('d-spin').addEventListener('click', launchSpin);
document.getElementById('spin-close').addEventListener('click', async () => {
  document.getElementById('spin-overlay').classList.remove('on');
  await dbUpsert('blokbar_state', { key: 'spinning', value: '0' });
});
async function launchSpin() {
  if (!activities.length) return alert('Voeg eerst activiteiten toe!');
  await dbUpsert('blokbar_state', { key: 'spinning', value: '1' });
  doSpin();
}
function doSpin() {
  if (!activities.length) return;
  document.getElementById('spin-overlay').classList.add('on');
  document.getElementById('spin-result').textContent = '';
  const canvas = document.getElementById('spin-canvas');
  const ctx = canvas.getContext('2d');
  const labels = activities.map(a => a.label);
  const n = labels.length;
  const cols = ['#516ff5','#e1272a','#4cba7d','#d4a017','#b5a890','#6b5b4e','#c47a3a','#2a3f8f'];
  const arc = (Math.PI * 2) / n;
  const spin = Math.PI*2*6 + Math.random()*Math.PI*2;
  const t0 = performance.now();
  const dur = 4200;

  function draw(a) {
    const W = canvas.width, cx = W/2, cy = W/2, r = cx - 10;
    ctx.clearRect(0,0,W,W);
    labels.forEach((lbl,i) => {
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r, a+i*arc, a+(i+1)*arc);
      ctx.fillStyle = cols[i%cols.length];
      ctx.fill();
      ctx.strokeStyle = '#0f0a07'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save();
      ctx.translate(cx,cy);
      ctx.rotate(a + i*arc + arc/2);
      ctx.fillStyle = '#f4eed9';
      ctx.font = 'bold 12px Space Mono';
      ctx.textAlign = 'right';
      ctx.fillText(lbl.length>18?lbl.slice(0,16)+'…':lbl, r-12, 5);
      ctx.restore();
    });
    // Arrow
    ctx.beginPath();
    ctx.moveTo(W-4, cy); ctx.lineTo(W-22, cy-11); ctx.lineTo(W-22, cy+11);
    ctx.fillStyle = '#f4eed9'; ctx.fill();
    // Center
    ctx.beginPath(); ctx.arc(cx,cy,14,0,Math.PI*2);
    ctx.fillStyle = '#0f0a07'; ctx.fill();
  }

  function frame(now) {
    const p = Math.min(1, (now-t0)/dur);
    const ease = 1 - Math.pow(1-p, 4);
    const angle = ease * spin;
    draw(angle);
    if (p < 1) { requestAnimationFrame(frame); return; }
    // winner
    const finalNorm = ((angle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    const winner = Math.floor(((Math.PI*2 - finalNorm) % (Math.PI*2)) / arc) % n;
    document.getElementById('spin-result').textContent = '🎯 ' + labels[winner];
  }
  requestAnimationFrame(frame);
}

// ============================================================
// LEADERBOARD + ONLINE
// ============================================================
function renderLb(sorted) {
  const top = sorted.slice(0,3);
  const rest = sorted.slice(3);
  const topEl = document.getElementById('lb-top');
  const restEl = document.getElementById('lb-rest');
  if (!topEl) return;
  topEl.innerHTML = top.length ? top.map((u,i) => `
    <div class="lb-card" data-r="${i+1}" ${u.id===myId?'style="border-color:rgba(81,111,245,0.4)"':''}>
      <div class="lb-name">${u.name}</div>
      <div class="lb-meta">${fmtHrs(u.study_seconds)} ${u.studying?'· ▶':'· ⏸'}</div>
    </div>`).join('') : '<div class="empty-msg">Niemand studeert nog...</div>';
  restEl.innerHTML = rest.map(u => `<div class="lb-chip">${u.name} · ${fmtHrs(u.study_seconds)}</div>`).join('');
}
function renderOnline(sorted) {
  const el = document.getElementById('d-online');
  if (!el) return;
  if (!sorted.length) { el.innerHTML = '<div class="empty-msg">Niemand online</div>'; return; }
  el.innerHTML = sorted.map(u => `
    <div class="online-item">
      <div class="dot ${u.studying?'on':''}" style="margin:0;flex-shrink:0;"></div>
      <div class="online-name${u.id===myId?' me':''}">${u.name}${u.id===myId?' (jij)':''}</div>
      <div class="online-hrs">${fmtHrs(u.study_seconds)}</div>
    </div>`).join('');
}

// ============================================================
// CLOCK + QUOTE
// ============================================================
function tickClock() {
  const now = new Date();
  const cl = document.getElementById('s-clock');
  const dt = document.getElementById('s-date');
  if (cl) cl.textContent = now.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  if (dt) dt.textContent = now.toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
async function fetchQuote() {
  try {
    const r = await fetch('https://zenquotes.io/api/random');
    const [d] = await r.json();
    const q = document.getElementById('s-quote');
    const a = document.getElementById('s-quote-by');
    if (q) q.textContent = `"${d.q}"`;
    if (a) a.textContent = `— ${d.a}`;
  } catch {}
}

// ============================================================
// NOTIFICATIONS
// ============================================================
function notif(msg, type='') {
  const wrap = document.getElementById('notifs');
  const el = document.createElement('div');
  el.className = `notif ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.classList.add('out'), 4500);
  setTimeout(() => el.remove(), 5200);
}

// ============================================================
// MODE INIT
// ============================================================
function initScherm() {
  tickClock();
  setInterval(tickClock, 1000);
  fetchQuote();
  setInterval(fetchQuote, 60000);
  loadUsers();
  loadPlaylist();
  syncMute();
  loadActs();
  setInterval(loadUsers, 12000);
  setInterval(syncMute, 15000);

  // listen for spin
  if (db) {
    db.channel('state_spin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blokbar_state' }, async () => {
        const data = await dbGet('blokbar_state');
        const spin = data.find(s => s.key === 'spinning');
        if (spin && spin.value === '1') { await loadActs(); doSpin(); }
        const muteRow = data.find(s => s.key === 'muted');
        if (muteRow) { isMuted = muteRow.value === '1'; applyMute(); }
        const idxRow = data.find(s => s.key === 'play_idx');
        if (idxRow) { playIdx = parseInt(idxRow.value) % Math.max(1, playlist.length); setVideo(); }
      }).subscribe();

    // listen for user join/leave for notifs
    db.channel('user_notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'blokbar_users' }, (payload) => {
        if (payload.new.id !== myId) notif(`👋 ${payload.new.name} is erbij gekomen!`, 'join');
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'blokbar_users' }, (payload) => {
        if (payload.old?.name) notif(`👋 ${payload.old.name} heeft Blokbar verlaten`, 'leave');
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'blokbar_timers' }, (p) => {
        notif(`⏰ Timer ingesteld: "${p.new.label}" door ${p.new.owner_name}`, 'timer');
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'blokbar_playlist' }, (p) => {
        notif(`🎵 "${p.new.title}" toegevoegd door ${p.new.added_by}`, 'music');
      })
      .subscribe();
  }
}

function initDash() {
  if (myName) {
    document.getElementById('d-welcome').textContent = `Hoi, ${myName}! 👋`;
    upsertPresence();
  }
  loadUsers();
  loadTimers();
  loadPlaylist();
  loadActs();
  syncMute();
}

// ============================================================
// UTILS
// ============================================================
function fmtSec(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function fmtHrs(s) { return (s/3600).toFixed(1) + 'u'; }