import { state } from './shared/config.js';
import { syncMute } from './components/playlist.js';
import { initIdentity, upsertPresence, loadUsers } from './components/identity.js';
import { initStudyTimer } from './components/studyTimer.js';
import { initGlobalTimers, loadTimers } from './components/timers.js';
import { initPlaylist, loadPlaylist } from './components/playlist.js';
import { initSpinWheel, loadActs } from './components/spinWheel.js';

window.addEventListener('DOMContentLoaded', () => {
  // Identity Init
  initIdentity(true);
  if (state.myName) {
    const welcomeEl = document.getElementById('d-welcome');
    if (welcomeEl) welcomeEl.textContent = `Hoi, ${state.myName}! 👋`;
    upsertPresence();
  }

  // Functional System Inits
  initStudyTimer();
  initGlobalTimers();
  initPlaylist();
  initSpinWheel();

  // Load Initial Dataset
  loadUsers();
  loadTimers();
  loadPlaylist();
  loadActs();
  syncMute();
});