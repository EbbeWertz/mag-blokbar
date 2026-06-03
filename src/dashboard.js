import { state, db } from './shared/config.js';
import { dbGet, sub } from './shared/db.js';
import { syncMute, initPlaylist, loadPlaylist, renderPlaylist } from './components/playlist.js';
import { initIdentity, upsertPresence, loadUsers } from './components/identity.js';
import { initStudyTimer } from './components/studyTimer.js';
import { initGlobalTimers, loadTimers } from './components/timers.js';
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

  // REALTIME TIMESTAMPS OVERZETTEN NAAR DASHBOARD WIDGET
  if (db) {
    sub("blokbar_state", async () => {
      const data = await dbGet("blokbar_state");
      
      const idxRow = data.find(s => s.key === "play_idx");
      const curRow = data.find(s => s.key === "yt_current_time");
      const durRow = data.find(s => s.key === "yt_total_duration");
      
      if (idxRow) {
        state.playIdx = parseInt(idxRow.value) % Math.max(1, state.playlist.length);
      }

      // Ontvang de live afspeeltijden van scherm.js via de DB en ververs de UI counter
      if (curRow || durRow) {
        const cur = curRow ? parseFloat(curRow.value) : 0;
        const dur = durRow ? parseFloat(durRow.value) : 0;
        renderPlaylist(cur, dur);
      } else {
        renderPlaylist();
      }
    });

    sub("blokbar_playlist", async () => {
      await loadPlaylist();
    });
  }
});