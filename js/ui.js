// ─── UI UTILS ────────────────────────────────────────────────────────────────
function showToast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function h(s) { 
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); 
}

function js(s) { 
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); 
}

function updateClock() {
  const now = new Date();
  const el = document.getElementById('clock');
  if (el) el.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function customConfirm(msg, cb) {
  const modal = document.getElementById('confirmModal');
  const yesBtn = document.getElementById('confirmYes');
  const noBtn = document.getElementById('confirmNo');
  const msgEl = document.getElementById('confirmMsg');
  if (msgEl) msgEl.textContent = msg;
  
  modal.style.display = 'flex';
  noBtn.focus();

  const onYes = () => { cleanup(); cb(true); };
  const onNo = () => { cleanup(); cb(false); };
  
  const cleanup = () => {
    modal.style.display = 'none';
    yesBtn.removeEventListener('click', onYes);
    noBtn.removeEventListener('click', onNo);
    setTimeout(() => {
       const first = document.querySelector('#adminPanel button, #adminPanel .admin-tab.active');
       if (first) first.focus();
    }, 50);
  };

  yesBtn.addEventListener('click', onYes);
  noBtn.addEventListener('click', onNo);
}

function showVolumeHUD(volValue, muted) {
  const volHud = document.getElementById('volumeHud');
  const volFill = document.getElementById('volBarFill');
  const volText = document.getElementById('volText');
  const volIcon = document.getElementById('volIcon');

  if (!volHud) return;
  
  let pct = Math.round(volValue * 100);
  if (muted) pct = 0;

  volFill.style.width = pct + '%';
  volText.textContent = pct + '%';
  
  if (muted || pct === 0) volIcon.textContent = '🔇';
  else if (pct < 50) volIcon.textContent = '🔉';
  else volIcon.textContent = '🔊';

  volHud.classList.add('show');
  clearTimeout(window.volTimeout);
  window.volTimeout = setTimeout(() => {
    volHud.classList.remove('show');
  }, 2500);
}
