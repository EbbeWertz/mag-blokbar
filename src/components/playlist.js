import { state, setPlaylist, setPlayIdx, setIsMuted } from '../shared/config.js';
import { dbGet, dbUpsert, dbDel } from '../shared/db.js';
import { notify } from '../shared/utils.js';

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
  setPlayIdx(idxRow ? (parseInt(idxRow.value) % Math.max(1, state.playlist.length)) : 0);
  
  renderPlaylist();
  setVideo();
}

async function addPlaylist() {
  const url = document.getElementById('p-url').value.trim();
  if (!url) return;
  const title = document.getElementById('p-title').value.trim() || url.replace(/^https?:\/\//, '').split('/')[0].replace('www.', '');
  
  await dbUpsert('blokbar_playlist', { id: crypto.randomUUID(), url, title, added_by: state.myName, sort_order: Date.now() });
  document.getElementById('p-url').value = '';
  document.getElementById('p-title').value = '';
  notify(`🎵 ${state.myName} heeft "${title}" toegevoegd`, 'music');
  loadPlaylist();
}

async function skipPlaylist() {
  const newIdx = (state.playIdx + 1) % Math.max(1, state.playlist.length);
  await dbUpsert('blokbar_state', { key: 'play_idx', value: String(newIdx) });
  notify(`⏭ ${state.myName} heeft overgeslagen naar het volgende`, 'music');
}

function renderPlaylist() {
  const el = document.getElementById('d-playlist');
  if (!el) return;
  if (!state.playlist.length) { el.innerHTML = '<div class="empty-msg">Geen video\'s. Voeg een URL toe hieronder.</div>'; return; }
  
  el.innerHTML = state.playlist.map((item, i) => `
    <div class="item-row${i === state.playIdx ? ' playing' : ''}">
      ${i === state.playIdx ? '<div class="playing-pip"></div>' : ''}
      <div class="item-label">${item.title || item.url}</div>
      <div class="item-meta">${item.added_by || ''}</div>
      <button class="btn-sm del" onclick="delPlaylist('${item.id}')">✕</button>
    </div>`).join('');
}

export function setVideo() {
  if (!state.playlist.length) return;
  const item = state.playlist[state.playIdx % state.playlist.length];
  const vid = document.getElementById('bg-video');
  const ifr = document.getElementById('bg-iframe');
  const layer = document.getElementById('bg-layer');
  if (!vid || !ifr) return; // Fail-safes cleanly on Dashboard page

  const ytMatch = item.url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    const id = ytMatch[1];
    const muteParam = state.isMuted ? 1 : 0;
    const src = `https://www.youtube.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&mute=${muteParam}&controls=0&disablekb=1&modestbranding=1&iv_load_policy=3`;
    if (ifr.src !== src) {
      ifr.src = src;
      ifr.style.display = 'block';
      vid.style.display = 'none';
      vid.src = '';
    }
    if (layer) layer.classList.add('ready');
    return;
  }

  if (item.url.includes('archive.org')) {
    let src = item.url;
    if (!src.includes('/embed/')) src = src.replace('/details/', '/embed/');
    ifr.src = src; ifr.style.display = 'block'; vid.style.display = 'none'; vid.src = '';
    if (layer) layer.classList.add('ready');
    return;
  }

  ifr.style.display = 'none'; ifr.src = '';
  vid.style.display = 'block';
  if (vid.src !== item.url) {
    vid.src = item.url;
    vid.muted = true;
    vid.play().catch(() => {});
  }
  if (layer) layer.classList.add('ready');
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
}

export async function syncMute() {
  const data = await dbGet('blokbar_state');
  const row = data.find(s => s.key === 'muted');
  setIsMuted(row ? row.value === '1' : false);
  applyMute();
}