// main.js
import { db, state, setPlayIdx, setIsMuted } from './config.js';
import { dbGet, sub } from './db.js';
import { route } from './router.js';
import { notify } from './utils.js';

import { initIdentity, loadUsers, upsertPresence } from './components/identity.js';
import { initStudyTimer } from './components/studyTimer.js';
import { initGlobalTimers, loadTimers } from './components/timers.js';
import { initPlaylist, loadPlaylist, syncMute, applyMute, setVideo } from './components/playlist.js';
import { initSpinWheel, loadActs, doSpin } from './components/spinWheel.js';

// Screen-view elements functions
function tickClock() {
  const now = new Date();
  const cl = document.getElementById('s-clock');
  const dt = document.getElementById('s-date');
  if (cl) cl.textContent = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  if (dt) dt.textContent = now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long'});
}

async function fetchQuote() {
  try {
    const r = await fetch('https://dummyjson.com/quotes/random');
    const d = await r.json(); // returns a single object: { quote: "...", author: "..." }
    
    const q = document.getElementById('s-quote');
    const a = document.getElementById('s-quote-by');
    if (q) q.textContent = `"${d.quote}"`;
    if (a) a.textContent = `— ${d.author}`;
  } catch(e) {
    console.error(e);
  }
}

export function initScherm() {
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

  if (db) {
    sub('blokbar_state', async () => {
      const data = await dbGet('blokbar_state');
      const spin = data.find(s => s.key === 'spinning');
      if (spin && spin.value === '1') { await loadActs(); doSpin(); }
      
      const muteRow = data.find(s => s.key === 'muted');
      if (muteRow) { setIsMuted(muteRow.value === '1'); applyMute(); }
      
      const idxRow = data.find(s => s.key === 'play_idx');
      if (idxRow) { setPlayIdx(parseInt(idxRow.value) % Math.max(1, state.playlist.length)); setVideo(); }
    });

    sub('blokbar_users', (payload) => {
      if (payload.eventType === 'INSERT' && payload.new.id !== state.myId) {
        notify(`👋 ${payload.new.name} is erbij gekomen!`, 'join');
      } else if (payload.eventType === 'DELETE' && payload.old?.name) {
        notify(`👋 ${payload.old.name} heeft Blokbar verlaten`, 'leave');
      }
    });

    sub('blokbar_timers', (payload) => {
      if (payload.eventType === 'INSERT') notify(`⏰ Timer ingesteld: "${payload.new.label}" door ${payload.new.owner_name}`, 'timer');
    });

    sub('blokbar_playlist', (payload) => {
      if (payload.eventType === 'INSERT') notify(`🎵 "${payload.new.title}" toegevoegd door ${payload.new.added_by}`, 'music');
    });
  }
}

export function initDash() {
  if (state.myName) {
    document.getElementById('d-welcome').textContent = `Hoi, ${state.myName}! 👋`;
    upsertPresence();
  }
  loadUsers();
  loadTimers();
  loadPlaylist();
  loadActs();
  syncMute();
}

// Global Boostrap Initialization
window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', () => {
  initIdentity();
  initStudyTimer();
  initGlobalTimers();
  initPlaylist();
  initSpinWheel();
  route();
});