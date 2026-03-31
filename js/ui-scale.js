const UI_SCALE_DEFAULT = 1;
const UI_SCALE_MIN = 0.6;
const UI_SCALE_MAX = 1.4;
const UI_SCALE_STEP = 0.05;
let currentUiScale = UI_SCALE_DEFAULT;
let uiScaleResizeBound = false;

function clampUiScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return UI_SCALE_DEFAULT;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, n));
}

function updateUiScaleLabel() {
  const label = document.getElementById('uiScaleValue');
  if (!label) return;
  label.textContent = `${Math.round(currentUiScale * 100)}%`;
}

function applyUiScaleTransform() {
  const root = document.getElementById('uiScaleRoot');
  if (!root) return;

  const scale = clampUiScale(currentUiScale);
  const offsetX = (window.innerWidth * (1 - scale)) / 2;
  const offsetY = (window.innerHeight * (1 - scale)) / 2;

  root.style.setProperty('--ui-scale', scale.toFixed(3));
  root.style.transformOrigin = 'top left';
  root.style.transform = `translate(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px) scale(${scale.toFixed(3)})`;
}

async function persistUiScale() {
  if (typeof getStored !== 'function' || typeof setStored !== 'function' || !window.STORAGE_KEYS?.uiPrefs) return;
  const prefs = await getStored(STORAGE_KEYS.uiPrefs);
  const base = (!prefs || Array.isArray(prefs)) ? {} : prefs;
  base.scale = currentUiScale;
  await setStored(STORAGE_KEYS.uiPrefs, base);
}

function applyUiScale(scale, persist = true) {
  currentUiScale = clampUiScale(scale);
  applyUiScaleTransform();
  updateUiScaleLabel();
  if (persist) persistUiScale();
}

function zoomInUi() {
  applyUiScale(currentUiScale + UI_SCALE_STEP);
  if (typeof showToast === 'function') showToast(`Zoom: ${Math.round(currentUiScale * 100)}%`);
}

function zoomOutUi() {
  applyUiScale(currentUiScale - UI_SCALE_STEP);
  if (typeof showToast === 'function') showToast(`Zoom: ${Math.round(currentUiScale * 100)}%`);
}

function resetUiScale() {
  applyUiScale(UI_SCALE_DEFAULT);
  if (typeof showToast === 'function') showToast('Zoom: 100%');
}

async function initUiScale() {
  if (typeof getStored !== 'function' || !window.STORAGE_KEYS?.uiPrefs) {
    applyUiScale(UI_SCALE_DEFAULT, false);
    return;
  }

  const prefs = await getStored(STORAGE_KEYS.uiPrefs);
  const savedScale = (!prefs || Array.isArray(prefs)) ? UI_SCALE_DEFAULT : prefs.scale;
  applyUiScale(savedScale, false);

  if (!uiScaleResizeBound) {
    window.addEventListener('resize', () => {
      applyUiScale(currentUiScale, false);
    });
    uiScaleResizeBound = true;
  }
}
