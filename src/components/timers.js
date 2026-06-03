import { state, setTimers } from '../shared/config.js';
import { dbGet, dbUpsert, dbDel } from '../shared/db.js';
import { notify, fmtSec } from '../shared/utils.js';

// Lokale instellingen per gebruiker
let autoplay = true;
let expireMode = 'delete'; // 'delete' of 'repeat'

export function initGlobalTimers() {
  const addBtn = document.getElementById('d-timer-add');
  if (addBtn) addBtn.addEventListener('click', addTimer);

  // Event listeners voor de configuratie-knoppen op het dashboard
  setupConfigListeners();

  // Window functies voor de interactieve elementen binnen de rijen
  window.delTimer = async (id) => { 
    await dbDel('blokbar_timers', id); 
    await loadTimers(); 
  };

  window.togglePlayTimer = async (id) => {
    const timer = state.timers.find(t => t.id === id);
    if (!timer) return;

    if (timer.is_playing) {
      // Pauzeren: Bereken resterende seconden op basis van de huidige tijdstempel
      const remMs = new Date(timer.ends_at).getTime() - Date.now();
      const remSecs = Math.max(0, Math.round(remMs / 1000));
      timer.is_playing = false;
      timer.remaining_seconds = remSecs;
      await dbUpsert('blokbar_timers', timer);
    } else {
      // Starten: Pauzeer eerst alle andere actieve timers van deze specifieke gebruiker (max 1 actief)
      for (const t of state.timers.filter(t => t.owner_id === state.myId)) {
        if (t.is_playing) {
          const remMs = new Date(t.ends_at).getTime() - Date.now();
          t.remaining_seconds = Math.max(0, Math.round(remMs / 1000));
          t.is_playing = false;
          await dbUpsert('blokbar_timers', t);
        }
      }
      // Activeer de geselecteerde timer met een nieuwe eindtijd
      timer.is_playing = true;
      timer.ends_at = new Date(Date.now() + (timer.remaining_seconds * 1000)).toISOString();
      await dbUpsert('blokbar_timers', timer);
    }
    await loadTimers();
  };

  // De Centrale Timer Engine (tikt elke seconde)
  setInterval(async () => {
    let stateChanged = false;
    const now = Date.now();

    // Filter de applicatiestate op timers van de huidige gebruiker
    const myTimers = state.timers.filter(t => t.owner_id === state.myId);

    for (let i = 0; i < myTimers.length; i++) {
      const t = myTimers[i];
      const el = document.getElementById(`timer-left-${t.id}`);

      if (t.is_playing) {
        const rem = Math.max(0, Math.round((new Date(t.ends_at).getTime() - now) / 1000));
        if (el) {
          el.textContent = fmtSec(rem);
          if (!el.classList.contains('urgent') && rem < 60) {
            el.className = 'timer-left urgent';
          }
        }

        // WANNEER EEN TIMER IS AFGELOPEN
        if (rem <= 0) {
          notify(`✅ Timer klaar: "${t.label}"`, 'timer');
          stateChanged = true;

          if (expireMode === 'delete') {
            await dbDel('blokbar_timers', t.id);
            
            // Autoplay: Activeer direct de eerstvolgende timer uit jouw lijst
            if (autoplay && myTimers[i + 1]) {
              const nextT = myTimers[i + 1];
              nextT.is_playing = true;
              nextT.ends_at = new Date(Date.now() + (nextT.remaining_seconds * 1000)).toISOString();
              await dbUpsert('blokbar_timers', nextT);
            }
          } else if (expireMode === 'repeat') {
            // Repeat: Reset de huidige timer naar zijn initiële waarde en zet hem op idle
            t.is_playing = false;
            t.remaining_seconds = t.initial_duration_seconds || 900;
            await dbUpsert('blokbar_timers', t);

            // Autoplay: Bereken de volgende index (en ga terug naar 0 bij het einde van de lijst)
            if (autoplay && myTimers.length > 0) {
              const nextIndex = (i + 1) % myTimers.length;
              const nextT = myTimers[nextIndex];
              nextT.is_playing = true;
              nextT.ends_at = new Date(Date.now() + (nextT.remaining_seconds * 1000)).toISOString();
              await dbUpsert('blokbar_timers', nextT);
            }
          }
          break; // Breek de lus om async database-overlap te vermijden
        }
      } else {
        // Inactieve timer in de wachtrij: toon statische resterende tijd
        if (el) {
          el.textContent = fmtSec(t.remaining_seconds);
          if (!el.classList.contains('idle')) {
            el.className = 'timer-left idle';
          }
        }
      }
    }

    if (stateChanged) {
      await loadTimers();
    }
  }, 1000);
  
  setInterval(loadTimers, 30000);
}

function setupConfigListeners() {
  const autoBtn = document.getElementById('btn-toggle-autoplay');
  const modeBtn = document.getElementById('btn-toggle-expire');

  if (autoBtn) {
    autoBtn.addEventListener('click', () => {
      autoplay = !autoplay;
      autoBtn.textContent = `Autoplay: ${autoplay ? 'AAN' : 'UIT'}`;
      // Gekoppeld aan de gestylde klassen in dashboard.css
      autoBtn.className = autoplay ? 'btn-sm toggle-btn active' : 'btn-sm toggle-btn off';
    });
  }

  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      expireMode = expireMode === 'delete' ? 'repeat' : 'delete';
      if (expireMode === 'delete') {
        modeBtn.textContent = 'Bij afloop: Verwijderen';
        modeBtn.className = 'btn-sm toggle-btn';
      } else {
        modeBtn.textContent = 'Bij afloop: Herhalen & Volgende';
        modeBtn.className = 'btn-sm toggle-btn active';
      }
    });
  }
}

export async function loadTimers() {
  const data = await dbGet('blokbar_timers');
  // Sorteer op de unieke aanmaakstempel (sort_order) om de wachtrij per user consistent te houden
  data.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  setTimers(data);
  renderTimers();
}

async function addTimer() {
  const lbl = document.getElementById('t-label').value.trim() || 'Timer';
  const mins = parseInt(document.getElementById('t-min').value) || 15;
  const secs = mins * 60;
  
  const myTimers = state.timers.filter(t => t.owner_id === state.myId);
  const anyActive = myTimers.some(t => t.is_playing);
  
  // Start de timer direct als autoplay aanstaat én er geen andere timer actief is
  const shouldPlayImmediately = autoplay && !anyActive;

  // FIX: Bereken een logische ends_at timestamp, ook als hij nog niet speelt, 
  // zodat scherm.js hem niet aanziet voor een verlopen actieve timer.
  const endsAtTimestamp = shouldPlayImmediately 
    ? new Date(Date.now() + secs * 1000).toISOString() 
    : new Date(Date.now() + secs * 1000).toISOString(); // Of houd de toekomstige relatieve tijd aan

  const t = { 
    id: crypto.randomUUID(), 
    label: lbl, 
    ends_at: endsAtTimestamp, 
    remaining_seconds: secs,
    initial_duration_seconds: secs,
    is_playing: shouldPlayImmediately,
    owner_id: state.myId, 
    owner_name: state.myName,
    sort_order: Date.now()
  };
  
  document.getElementById('t-label').value = '';
  await dbUpsert('blokbar_timers', t);
  notify(`⏰ ${state.myName} heeft een timer toegevoegd: "${lbl}" (${mins} min)`, 'timer');
  await loadTimers();
}

function renderTimers() {
  const el = document.getElementById('d-timers');
  if (!el) return;

  const myTimers = state.timers.filter(t => t.owner_id === state.myId);
  
  if (!myTimers.length) { 
    el.innerHTML = '<div class="empty-msg">Geen actieve of wachtende timers van jou.</div>'; 
    return; 
  }
  
  el.innerHTML = myTimers.map(t => {
    return `<div class="item-row ${t.is_playing ? 'is-playing' : 'is-idle'}">
      <div class="item-label">
        ${t.is_playing ? '▶️ ' : '⏸ '}${t.label}
      </div>
      <div class="item-meta">${t.is_playing ? 'Actief' : 'In wachtrij'}</div>
      <div class="timer-left" id="timer-left-${t.id}">--:--</div>
      <div class="timer-actions">
        <button class="btn-sm" onclick="togglePlayTimer('${t.id}')">
          ${t.is_playing ? 'Pauze' : 'Start'}
        </button>
        <button class="btn-sm del" onclick="delTimer('${t.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}