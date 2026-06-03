import { state, setStudyActive, setStudyStart, setSessionBase, setTotalBase } from '../shared/config.js';
import { fmtSec } from '../shared/utils.js';
import { upsertPresence, getSessionSecs, getTotalSecs } from './identity.js';

export function initStudyTimer() {
  const studyBtn = document.getElementById('d-study-btn');
  if (!studyBtn) return;
  
  studyBtn.addEventListener('click', toggleStudy);

  // Live active display loop
  setInterval(() => {
    const el_sesh = document.getElementById('d-time-session');
    const el_tot = document.getElementById('d-time-total');
    if (el_sesh) {
      // Display current session time as the primary visual block count
      el_sesh.textContent = fmtSec(getSessionSecs());
    }
    if (el_tot) {
      // Display current session time as the primary visual block count
      el_tot.textContent = fmtSec(getTotalSecs());
    }
  }, 1000);
}

function toggleStudy() {
  if (state.studyActive) {
    // Collect accrued runtime variables
    const completedSession = getSessionSecs();
    const completedTotal = getTotalSecs();
    
    setSessionBase(completedSession);
    setTotalBase(completedTotal);
    localStorage.setItem('blokbar_secs', completedTotal);
    
    setStudyActive(false); 
    setStudyStart(null);
    
    document.getElementById('d-study-btn').textContent = '▶ Start';
    document.getElementById('d-study-btn').className = 'btn-action btn-go';
    document.getElementById('d-dot').className = 'dot';
    document.getElementById('d-state').textContent = 'Gepauzeerd';
  } else {
    // Instantiate structural tracking epoch anchor
    setStudyStart(Date.now());
    setStudyActive(true);
    
    document.getElementById('d-study-btn').textContent = '⏸ Pauze';
    document.getElementById('d-study-btn').className = 'btn-action btn-stop';
    document.getElementById('d-dot').className = 'dot on';
    document.getElementById('d-state').textContent = 'Aan het studeren';
  }
  upsertPresence();
}