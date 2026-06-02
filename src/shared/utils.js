export function fmtSec(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function fmtHrs(s) { 
  return (s / 3600).toFixed(1) + 'u'; 
}

// Renamed to notify per instructions
export function notify(msg, type = '') {
  const wrap = document.getElementById('notifs');
  if (!wrap) return; // Safely bypasses if overlay is absent (like dashboard context)
  const el = document.createElement('div');
  el.className = `notif ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.classList.add('out'), 4500);
  setTimeout(() => el.remove(), 5200);
}