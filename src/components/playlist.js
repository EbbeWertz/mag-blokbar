import { state, setPlaylist, setPlayIdx, setIsMuted } from '../shared/config.js';
import { dbGet, dbUpsert, dbDel } from '../shared/db.js';
import { notify } from '../shared/utils.js';

let playerInstance = null;
let broadcastInterval = null;
let currentVideoId = null;

export function initPlaylist() {
  const addBtn = document.getElementById('d-playlist-add');
  const skipBtn = document.getElementById('d-skip');
  const muteBtn = document.getElementById('d-mute');

  if (addBtn) addBtn.addEventListener('click', addPlaylist);
  if (skipBtn) skipBtn.addEventListener('click', skipPlaylist);
  if (muteBtn) muteBtn.addEventListener('click', toggleMute);

  window.delPlaylist = async (id) => { 
    await dbDel('blokbar_playlist', id); 
    loadPlaylist(); 
  };
}

export async function loadPlaylist() {
  const [items, dbState] = await Promise.all([dbGet('blokbar_playlist'), dbGet('blokbar_state')]);
  items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  setPlaylist(items);
  
  const idxRow = dbState.find(s => s.key === 'play_idx');
  let dbIdx = idxRow ? parseInt(idxRow.value) : 0;
  
  // Corrigeer de index als er video's zijn verwijderd en de opgeslagen index buiten de lijst valt
  if (items.length > 0 && dbIdx >= items.length) {
    dbIdx = 0; // Reset naar het begin in plaats van de laatste te pakken
    await dbUpsert('blokbar_state', { key: 'play_idx', value: String(dbIdx) });
  } else if (items.length === 0) {
    dbIdx = 0;
  }
  setPlayIdx(dbIdx);  
  
  // Haal live timestamps op voor weergave
  const curRow = dbState.find(s => s.key === 'yt_current_time');
  const durRow = dbState.find(s => s.key === 'yt_total_duration');
  const curTime = curRow ? parseFloat(curRow.value) : 0;
  const totalDur = durRow ? parseFloat(durRow.value) : 0;

  renderPlaylist(curTime, totalDur);
  setVideo();
}

async function addPlaylist() {
  let url = document.getElementById('p-url').value.trim();
  if (!url) return;

  // Schoon de URL op: verwijder alle extra query parameters zoals ?si= of &feature=
  // Dit zorgt voor schonere data in je database
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      const videoId = urlObj.hostname.includes('youtu.be') 
        ? urlObj.pathname.substring(1) 
        : urlObj.searchParams.get('v');
        
      if (videoId) {
        // Herschrijf de link intern naar een schone standaardformaat
        url = `https://www.youtube.com/watch?v=${videoId}`;
      }
    }
  } catch (e) {
    console.error("Ongeldige URL meegegeven");
  }

  const title = document.getElementById('p-title').value.trim() || url.replace(/^https?:\/\//, '').split('/')[0].replace('www.', '');
  
  await dbUpsert('blokbar_playlist', { id: crypto.randomUUID(), url, title, added_by: state.myName, sort_order: Date.now() });
  document.getElementById('p-url').value = '';
  document.getElementById('p-title').value = '';
  notify(`🎵 ${state.myName} heeft "${title}" toegevoegd`, 'music');
  loadPlaylist();
}

// CRUCIALE FIX: Sla de video niet meer over door hem te verwijderen, 
// maar verhoog de play_idx tabelwaarde (en herhaal bij het einde)
export async function skipPlaylist() {
  if (!state.playlist.length) return;

  // Reset de live tijsteller in de database voor de volgende video
  await Promise.all([
    dbUpsert('blokbar_state', { key: 'yt_current_time', value: '0' }),
    dbUpsert('blokbar_state', { key: 'yt_total_duration', value: '0' })
  ]);

  // Bereken de volgende index (keert terug naar 0 als het einde is bereikt)
  const nextIdx = (state.playIdx + 1) % state.playlist.length;
  
  // Sla de nieuwe index op in de centrale database status tabel
  await dbUpsert('blokbar_state', { key: 'play_idx', value: String(nextIdx) });
  
  // Herlaad de playlist lokaal om de wijziging direct door te voeren
  await loadPlaylist();
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds === undefined || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function renderPlaylist(currentTime = 0, totalDuration = 0) {
  const el = document.getElementById('d-playlist');
  if (!el) return;
  if (!state.playlist.length) { 
    el.innerHTML = '<div class="empty-msg">Geen video\'s. Voeg een URL toe hieronder.</div>'; 
    return; 
  }
  
  el.innerHTML = state.playlist.map((item, i) => {
    const isPlaying = i === state.playIdx;
    let durationLabel = '';
    
    if (isPlaying && totalDuration > 0) {
      durationLabel = ` <span class="playtime-counter" style="font-size:0.75rem; opacity:0.7; font-family:monospace; margin-left:6px;">(${formatTime(currentTime)} / ${formatTime(totalDuration)})</span>`;
    }

    return `
    <div class="item-row${isPlaying ? ' playing' : ''}">
      ${isPlaying ? '<div class="playing-pip"></div>' : ''}
      <div class="item-label">${item.title || item.url}${durationLabel}</div>
      <div class="item-meta">${item.added_by || ''}</div>
      <button class="btn-sm del" onclick="window.delPlaylist('${item.id}')">✕</button>
    </div>`;
  }).join('');
}

export function setVideo() {
  const ifr = document.getElementById('bg-iframe');
  const layer = document.getElementById('bg-layer');
  
  if (!state.playlist.length) {
    if (broadcastInterval) { clearInterval(broadcastInterval); broadcastInterval = null; }
    if (ifr) { ifr.style.display = 'none'; }
    if (playerInstance && typeof playerInstance.stopVideo === 'function') { playerInstance.stopVideo(); }
    if (layer) layer.classList.remove('ready');
    currentVideoId = null;
    return;
  }

  const item = state.playlist[state.playIdx % state.playlist.length];
  if (!ifr) return; 

  const ytMatch = item.url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    const id = ytMatch[1];
    ifr.style.display = 'block';

    if (!playerInstance) {
      currentVideoId = id;
      playerInstance = new YT.Player('bg-iframe', {
        // AUTOREWRITE: Forceert het gebruik van het lichtere, advertentie-arme domein
        host: 'https://www.youtube-nocookie.com', 
        videoId: id,
        playerVars: {
          'autoplay': 1,
          'mute': state.isMuted ? 1 : 0,
          'controls': 0,
          'disablekb': 1,
          'modestbranding': 1,
          'iv_load_policy': 3, // Schakelt pop-ups en annotaties uit (scheelt CPU-kracht)
          'rel': 0,            // Aanbevolen video's aan het einde komen alleen van hetzelfde kanaal
          'loop': 0, 
          'playlist': id
        },
        events: {
          'onReady': (event) => {
            // Forceert de kwaliteit naar 480p ('large') om haperingen te voorkomen
            if (typeof event.target.setPlaybackQuality === 'function') {
              event.target.setPlaybackQuality('large');
            }
            event.target.playVideo();
            if (layer) layer.classList.add('ready');
            startStateBroadcaster();
          },
          'onStateChange': async (event) => {
            if (event.data === YT.PlayerState.ENDED) {
              await skipPlaylist();
            }
          }
        }
      });
    } else if (currentVideoId !== id) {
      currentVideoId = id;
      if (typeof playerInstance.loadVideoById === 'function') {
        playerInstance.loadVideoById({
          videoId: id,
          startSeconds: 0,
          suggestedQuality: 'large' // Garandeert 480p bij het wisselen van video's
        });
        if (layer) layer.classList.add('ready');
        startStateBroadcaster();
      }
    }
  } else {
    ifr.style.display = 'none';
    if (playerInstance && typeof playerInstance.stopVideo === 'function') playerInstance.stopVideo();
    if (layer) layer.classList.remove('ready');
    currentVideoId = null;
  }
}

function startStateBroadcaster() {
  if (broadcastInterval) clearInterval(broadcastInterval);
  
  broadcastInterval = setInterval(async () => {
    if (playerInstance && typeof playerInstance.getCurrentTime === 'function') {
      try {
        const current = playerInstance.getCurrentTime();
        const duration = playerInstance.getDuration();
        if (duration > 0) {
          // Zend live voortgang naar de database
          await Promise.all([
            dbUpsert('blokbar_state', { key: 'yt_current_time', value: String(current) }),
            dbUpsert('blokbar_state', { key: 'yt_total_duration', value: String(duration) })
          ]);
        }
      } catch (err) {
        console.debug("Broadcaster paused");
      }
    }
  }, 1000);
}

async function toggleMute() {
  const targetMute = !state.isMuted;
  setIsMuted(targetMute);
  await dbUpsert('blokbar_state', { key: 'muted', value: targetMute ? '1' : '0' });
  applyMute();
}

export function applyMute() {
  const btn = document.getElementById('d-mute');
  if (btn) {
    btn.textContent = state.isMuted ? '🔇 Gedempt' : '🔊 Geluid';
    btn.className = 'btn-link btn-mute' + (state.isMuted ? ' muted' : '');
  }
  const banner = document.getElementById('mute-banner');
  if (banner) banner.classList.toggle('on', state.isMuted);

  if (playerInstance && typeof playerInstance.mute === 'function') {
    if (state.isMuted) playerInstance.mute();
    else playerInstance.unMute();
  }
}

export async function syncMute() {
  const data = await dbGet('blokbar_state');
  const row = data.find(s => s.key === 'muted');
  setIsMuted(row ? row.value === '1' : false);
  applyMute();
}