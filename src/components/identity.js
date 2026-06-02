import { state, setMyName, SUPA_URL } from '../shared/config.js';
import { dbUpsert, dbGet } from '../shared/db.js';
import { fmtSec, fmtMin, notify } from '../shared/utils.js';

export function initIdentity(isDashboard = true) {
  if (isDashboard) {
    const btnOk = document.getElementById('btn-name-ok');
    const inpName = document.getElementById('inp-name');
    const idModal = document.getElementById('id-modal');
    
    if (!state.myName && idModal) idModal.classList.remove('gone');
    
    if (btnOk) btnOk.addEventListener('click', submitName);
    if (inpName) inpName.addEventListener('keydown', e => e.key === 'Enter' && submitName());
    
    // Heartbeat reporting to keep presence alive while active
    setInterval(upsertPresence, 20000);
    
    window.addEventListener('beforeunload', () => {
      if (state.myName) {
        const finalSession = getSessionSecs();
        const finalTotal = getTotalSecs();
        localStorage.setItem('blokbar_secs', finalTotal);
        
        navigator.sendBeacon && navigator.sendBeacon(
          `${SUPA_URL}/rest/v1/blokbar_users?id=eq.${state.myId}`,
          JSON.stringify({ 
            study_status: 'not online', 
            session_seconds: finalSession,
            total_seconds: finalTotal,
            last_seen: new Date().toISOString() 
          })
        );
      }
    });
  }
  
  setInterval(loadUsers, 5000); // Higher frequency for reactive live leaderboard flows
}

export function getSessionSecs() {
  const extra = state.studyActive ? Math.floor((Date.now() - state.studyStart) / 1000) : 0;
  return state.sessionBase + extra;
}

export function getTotalSecs() {
  const extra = state.studyActive ? Math.floor((Date.now() - state.studyStart) / 1000) : 0;
  return state.totalBase + extra;
}

export async function upsertPresence() {
  if (!state.myName) return;
  
  let currentStatus = 'pauzing online';
  if (state.studyActive) {
    currentStatus = 'active online';
  }

  await dbUpsert('blokbar_users', {
    id: state.myId, 
    name: state.myName,
    study_status: currentStatus,
    session_seconds: getSessionSecs(),
    total_seconds: getTotalSecs(),
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
    const lastSeenTime = new Date(u.last_seen).getTime();
    // Mark as completely offline if no heartbeat signal for more than 45 seconds
    if (now - lastSeenTime > 45000 || u.study_status === 'not online') {
      u.study_status = 'not online';
    }
    state.allUsers[u.id] = u;
  });
  
  // Sort leaderboard strictly by all-time cumulative performance
  const sortedByTotal = Object.values(state.allUsers).sort((a,b) => b.total_seconds - a.total_seconds);
  
  sortedByTotal.forEach((u, i) => {
    if (state.prevRanks[u.id] !== undefined && state.prevRanks[u.id] > i && i < 3) {
      notify(`🏅 ${u.name} klimt naar plek ${i+1}!`, 'rank');
    }
    state.prevRanks[u.id] = i;
  });
  
  renderOnline(Object.values(state.allUsers));
  renderLb(sortedByTotal);
}

function renderLb(sorted) {
  const top3Container = document.getElementById('lb-top3');
  const restGridContainer = document.getElementById('lb-rest-grid');
  if (!top3Container) return;
  
  const top = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  
  // 1. Render Top 3 podium boxes left-aligned
  top3Container.innerHTML = top.length ? top.map((u, i) => {
    const isOnline = u.study_status !== 'not online';
    const offlineClass = !isOnline ? 'is-offline' : '';
    const statusIcon = u.study_status === 'active online' ? '▶' : '⏸';
    const borderStyle = u.id === state.myId ? 'style="border-color:rgba(81,111,245,0.4)"' : '';
    
    return `
      <div class="lb-card ${offlineClass}" data-r="${i+1}" ${borderStyle}>
        <div class="lb-name">${u.name}</div>
        <div class="lb-meta">Totaal: ${fmtMin(u.total_seconds)}</div>
        ${isOnline ? `<div class="lb-session-meta">${statusIcon} Sessie: ${fmtMin(u.session_seconds)}</div>` : ''}
      </div>`;
  }).join('') : '<div class="empty-msg">Niemand studeert nog...</div>';
    
  // 2. Render all other users in a bottom flexible display grid
  if (restGridContainer) {
    restGridContainer.innerHTML = rest.length ? rest.map((u, i) => {
      const rank = i + 4;
      const isOnline = u.study_status !== 'not online';
      const offlineClass = !isOnline ? 'is-offline' : '';
      const statusIcon = u.study_status === 'active online' ? '▶' : '⏸';
      
      return `
        <div class="lb-row-strip ${offlineClass}">
          <span class="lb-strip-rank">#${rank}</span>
          <span class="lb-strip-name">${u.name}</span>
          <div class="lb-strip-times">
            <span class="total">Totaal: ${fmtSec(u.total_seconds)}</span>
            ${isOnline ? `<span class="session">${statusIcon} ${fmtSec(u.session_seconds)}</span>` : ''}
          </div>
        </div>`;
    }).join('') : '';
  }
}

function renderOnline(allUsers) {
  const el = document.getElementById('d-online');
  if (!el) return;
  
  // Filter list strictly to show only online people (Active or Paused)
  const onlineUsers = allUsers.filter(u => u.study_status !== 'not online');
  
  if (!onlineUsers.length) { 
    el.innerHTML = '<div class="empty-msg">Niemand online</div>'; 
    return; 
  }
  
  el.innerHTML = onlineUsers.map(u => {
    const isMe = u.id === state.myId;
    const dotClass = u.study_status === 'active online' ? 'on' : '';
    const statusLabel = u.study_status === 'active online' ? 'studerend' : 'pauze';
    
    return `
      <div class="online-item">
        <div class="dot ${dotClass}" style="margin:0; flex-shrink:0;"></div>
        <div class="online-name${isMe ? ' me' : ''}">${u.name}${isMe ? ' (jij)' : ''} <span style="font-size:0.55rem; opacity:0.5;">[${statusLabel}]</span></div>
        <div class="online-hrs">${fmtSec(u.session_seconds)}</div>
      </div>`;
  }).join('');
}