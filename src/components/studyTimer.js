import { state, setStudyActive, setStudyStart, setStudyBase } from '../shared/config.js';
import { fmtSec } from '../shared/utils.js';
import { upsertPresence, getStudySecs } from './identity.js';

export function initStudyTimer() {
  const studyBtn = document.getElementById('d-study-btn');
  if (!studyBtn) return;
  
  studyBtn.addEventListener('click', toggleStudy);

  setInterval(() => {
    const s = getStudySecs();
    const el = document.getElementById('d-time');
    if (el) el.textContent = fmtSec(s);
  }, 1000);
}

function toggleStudy() {
  if (state.studyActive) {
    const currentSecs = getStudySecs();
    setStudyBase(currentSecs);
    localStorage.setItem('blokbar_secs', currentSecs);
    setStudyActive(false); 
    setStudyStart(null);
    
    document.getElementById('d-study-btn').textContent = '▶ Start';
    document.getElementById('d-study-btn').className = 'btn-action btn-go';
    document.getElementById('d-dot').className = 'dot';
    document.getElementById('d-state').textContent = 'Gestopt';
  } else {
    setStudyStart(Date.now());
    setStudyActive(true);
    
    document.getElementById('d-study-btn').textContent = '⏹ Stop';
    document.getElementById('d-study-btn').className = 'btn-action btn-stop';
    document.getElementById('d-dot').className = 'dot on';
    document.getElementById('d-state').textContent = 'Aan het studeren';
  }
  upsertPresence();
}