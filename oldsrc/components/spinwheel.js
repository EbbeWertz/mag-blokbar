// components/spinWheel.js
import { state, setActivities } from '../config.js';
import { dbGet, dbUpsert, dbDel } from '../db.js';

export function initSpinWheel() {
  const actAddBtn = document.getElementById('d-act-add');
  const actInp = document.getElementById('a-inp');
  const spinBtn = document.getElementById('d-spin');
  const closeBtn = document.getElementById('spin-close');

  if (actAddBtn) actAddBtn.addEventListener('click', addAct);
  if (actInp) actInp.addEventListener('keydown', e => e.key === 'Enter' && addAct());
  if (spinBtn) spinBtn.addEventListener('click', launchSpin);
  if (closeBtn) closeBtn.addEventListener('click', async () => {
    document.getElementById('spin-overlay').classList.remove('on');
    await dbUpsert('blokbar_state', { key: 'spinning', value: '0' });
  });

  window.delAct = async (id) => { 
    await dbDel('blokbar_activities', id); 
    loadActs(); 
  };
}

export async function loadActs() {
  const data = await dbGet('blokbar_activities');
  setActivities(data);
  renderActs();
}

async function addAct() {
  const v = document.getElementById('a-inp').value.trim();
  if (!v) return;
  await dbUpsert('blokbar_activities', { id: crypto.randomUUID(), label: v, created_by: state.myName });
  document.getElementById('a-inp').value = '';
  loadActs();
}

function renderActs() {
  const el = document.getElementById('d-acts');
  if (!el) return;
  if (!state.activities.length) { el.innerHTML = '<div class="empty-msg">Voeg activiteiten toe!</div>'; return; }
  el.innerHTML = state.activities.map(a => `
    <div class="item-row">
      <div class="item-label">${a.label}</div>
      <button class="btn-sm del" onclick="delAct('${a.id}')">✕</button>
    </div>`).join('');
}

async function launchSpin() {
  if (!state.activities.length) return alert('Voeg eerst activiteiten toe!');
  await dbUpsert('blokbar_state', { key: 'spinning', value: '1' });
  doSpin();
}

export function doSpin() {
  if (!state.activities.length) return;
  document.getElementById('spin-overlay').classList.add('on');
  document.getElementById('spin-result').textContent = '';
  const canvas = document.getElementById('spin-canvas');
  const ctx = canvas.getContext('2d');
  const labels = state.activities.map(a => a.label);
  const n = labels.length;
  const cols = ['#516ff5', '#e1272a', '#4cba7d', '#d4a017', '#b5a890', '#6b5b4e', '#c47a3a', '#2a3f8f'];
  const arc = (Math.PI * 2) / n;
  const spin = Math.PI * 2 * 6 + Math.random() * Math.PI * 2;
  const t0 = performance.now();
  const dur = 4200;

  function draw(a) {
    const W = canvas.width, cx = W / 2, cy = W / 2, r = cx - 10;
    ctx.clearRect(0, 0, W, W);
    labels.forEach((lbl, i) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a + i * arc, a + (i + 1) * arc);
      ctx.fillStyle = cols[i % cols.length];
      ctx.fill();
      ctx.strokeStyle = '#0f0a07'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a + i * arc + arc / 2);
      ctx.fillStyle = '#f4eed9';
      ctx.font = 'bold 12px Space Mono';
      ctx.textAlign = 'right';
      ctx.fillText(lbl.length > 18 ? lbl.slice(0, 16) + '…' : lbl, r - 12, 5);
      ctx.restore();
    });
    ctx.beginPath();
    ctx.moveTo(W - 4, cy); ctx.lineTo(W - 22, cy - 11); ctx.lineTo(W - 22, cy + 11);
    ctx.fillStyle = '#f4eed9'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#0f0a07'; ctx.fill();
  }

  function frame(now) {
    const p = Math.min(1, (now - t0) / dur);
    const ease = 1 - Math.pow(1 - p, 4);
    const angle = ease * spin;
    draw(angle);
    if (p < 1) { requestAnimationFrame(frame); return; }
    
    const finalNorm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const winner = Math.floor(((Math.PI * 2 - finalNorm) % (Math.PI * 2)) / arc) % n;
    document.getElementById('spin-result').textContent = '🎯 ' + labels[winner];
  }
  requestAnimationFrame(frame);
}