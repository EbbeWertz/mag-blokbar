import { state, setTimers } from '../shared/config.js';
import { dbGet, dbUpsert, dbDel } from '../shared/db.js';
import { notify, fmtSec } from '../shared/utils.js';

export function initGlobalTimers() {
  const addBtn = document.getElementById('d-timer-add');
  if (addBtn) addBtn.addEventListener('click', addTimer);

  window.delTimer = async (id) => { 
    await dbDel('blokbar_timers', id); 
    loadTimers(); 
  };

  setInterval(() => {
    document.querySelectorAll('.timer-left[data-ends]').forEach(el => {
      const rem = Math.max(0, Math.round((new Date(el.dataset.ends).getTime() - Date.now()) / 1000));
      el.textContent = fmtSec(rem);
      el.className = 'timer-left' + (rem < 60 ? ' urgent' : '');
    });
  }, 1000);
  
  setInterval(loadTimers, 30000);
}

export async function loadTimers() {
  const data = await dbGet('blokbar_timers');
  const now = Date.now();
  
  const expired = data.filter(t => new Date(t.ends_at).getTime() < now);
  for (const t of expired) {
    notify(`✅ Timer klaar: "${t.label}" (${t.owner_name})`, 'timer');
    await dbDel('blokbar_timers', t.id);
  }
  
  setTimers(data.filter(t => new Date(t.ends_at).getTime() >= now));
  renderTimers();
}

async function addTimer() {
  const lbl = document.getElementById('t-label').value.trim() || 'Timer';
  const mins = parseInt(document.getElementById('t-min').value) || 0;
  const t = { 
    id: crypto.randomUUID(), 
    label: lbl, 
    ends_at: new Date(Date.now() + mins * 60000).toISOString(), 
    owner_id: state.myId, 
    owner_name: state.myName 
  };
  
  document.getElementById('t-label').value = '';
  await dbUpsert('blokbar_timers', t);
  notify(`⏰ ${state.myName} heeft een timer ingesteld: "${lbl}" (${mins} min)`, 'timer');
  loadTimers();
}

function renderTimers() {
  const el = document.getElementById('d-timers');
  if (!el) return;

  // VERANDERING: Filter de timers zodat alleen timers van de huidige gebruiker (myId) worden getoond
  const myTimers = state.timers.filter(t => t.owner_id === state.myId);
  
  if (!myTimers.length) { 
    el.innerHTML = '<div class="empty-msg">Geen actieve timers van jou.</div>'; 
    return; 
  }
  
  // Renders nu op basis van de gefilterde 'myTimers' array
  el.innerHTML = myTimers.map(t => {
    const rem = Math.max(0, Math.round((new Date(t.ends_at).getTime() - Date.now()) / 1000));
    const urg = rem < 60;
    return `<div class="item-row">
      <div class="item-label">${t.label}</div>
      <div class="item-meta">${t.owner_name}</div>
      <div class="timer-left ${urg ? 'urgent' : ''}" data-ends="${t.ends_at}">${fmtSec(rem)}</div>
      <button class="btn-sm del" onclick="delTimer('${t.id}')">✕</button>
    </div>`;
  }).join('');
}