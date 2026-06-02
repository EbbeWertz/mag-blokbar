// components/identity.js
import { state, setMyName, SUPA_URL } from '../config.js';
import { dbUpsert, dbGet } from '../db.js';
import { fmtHrs, notify } from '../utils.js';

export function initIdentity() {
  const btnOk = document.getElementById('btn-name-ok');
  const inpName = document.getElementById('inp-name');
  
  if (btnOk) btnOk.addEventListener('click', submitName);
  if (inpName) inpName.addEventListener('keydown', e => e.key === 'Enter' && submitName());
  
  // Heartbeats
  setInterval(upsertPresence, 20000);
  setInterval(loadUsers, 15000);
  
  window.addEventListener('beforeunload', () => {
    const finalSecs = getStudySecs();
    localStorage.setItem('blokbar_secs', finalSecs);
    if (state.myName) {
      navigator.sendBeacon && navigator.sendBeacon(
        `${SUPA_URL}/rest/v1/blokbar_users?id=eq.${state.myId}`,
        JSON.stringify({ studying: false, study_seconds: finalSecs, last_seen: new Date().toISOString() })
      );
    }
  });
}

export function getStudySecs() {
  const extra = state.studyActive ? Math.floor((Date.now() - state.studyStart) / 1000) : 0;
  return state.studyBase + extra;
}

export async function upsertPresence() {
  if (!state.myName) return;
  await dbUpsert('blokbar_users', {
    id: state.myId, 
    name: state.myName,
    studying: state.studyActive,
    study_seconds: getStudySecs(),
    last_seen: new Date().toISOString()
  });
}

function submitName() {
  const v = document.getElementById('inp-name').value.trim();
  if (!v) return;
  setMyName(v);
  localStorage.setItem('blokbar_name', v);
  document.getElementById('id-modal').classList.add('gone');
  document.getElementById('d-welcome').textContent = `Hoi, ${v}! 👋`;
  upsertPresence();
}

export async function loadUsers() {
  const data = await dbGet('blokbar_users');
  const now = Date.now();
  state.allUsers = {};
  
  data.forEach(u => {
    if (now - new Date(u.last_seen).getTime() < 90000) state.allUsers[u.id] = u;
  });
  
  const sorted = Object.values(state.allUsers).sort((a,b) => b.study_seconds - a.study_seconds);
  
  sorted.forEach((u, i) => {
    if (state.prevRanks[u.id] !== undefined && state.prevRanks[u.id] > i && i < 3) {
      notify(`🏅 ${u.name} klimt naar plek ${i+1}!`, 'rank');
    }
    state.prevRanks[u.id] = i;
  });
  
  renderOnline(sorted);
  renderLb(sorted);
}

function renderLb(sorted) {
  const top = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  const topEl = document.getElementById('lb-top');
  const restEl = document.getElementById('lb-rest');
  if (!topEl) return;
  
  topEl.innerHTML = top.length ? top.map((u, i) => `
    <div class="lb-card" data-r="${i+1}" ${u.id === state.myId ? 'style="border-color:rgba(81,111,245,0.4)"' : ''}>
      <div class="lb-name">${u.name}</div>
      <div class="lb-meta">${fmtHrs(u.study_seconds)} ${u.studying ? '· ▶' : '· ⏸'}</div>
    </div>`).join('') : '<div class="empty-msg">Niemand studeert nog...</div>';
    
  if (restEl) restEl.innerHTML = rest.map(u => `<div class="lb-chip">${u.name} · ${fmtHrs(u.study_seconds)}</div>`).join('');
}

function renderOnline(sorted) {
  const el = document.getElementById('d-online');
  if (!el) return;
  if (!sorted.length) { el.innerHTML = '<div class="empty-msg">Niemand online</div>'; return; }
  el.innerHTML = sorted.map(u => `
    <div class="online-item">
      <div class="dot ${u.studying ? 'on' : ''}" style="margin:0;flex-shrink:0;"></div>
      <div class="online-name${u.id === state.myId ? ' me' : ''}">${u.name}${u.id === state.myId ? ' (jij)' : ''}</div>
      <div class="online-hrs">${fmtHrs(u.study_seconds)}</div>
    </div>`).join('');
}