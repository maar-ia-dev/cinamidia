const UI_SCALE_DEFAULT = 1;
const UI_SCALE_MIN = 0.8;
const UI_SCALE_MAX = 1.2;
const UI_SCALE_STEP = 0.02;
let currentUiScale = UI_SCALE_DEFAULT;

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

async function persistUiScale() {
  if (typeof getStored !== 'function' || typeof setStored !== 'function' || !window.STORAGE_KEYS?.uiPrefs) return;
  const prefs = await getStored(STORAGE_KEYS.uiPrefs);
  const base = (!prefs || Array.isArray(prefs)) ? {} : prefs;
  base.scale = currentUiScale;
  await setStored(STORAGE_KEYS.uiPrefs, base);
}

function applyUiScale(scale, persist = true) {
  currentUiScale = clampUiScale(scale);
  const root = document.getElementById('uiScaleRoot');
  if (root) {
    root.style.setProperty('--ui-scale', currentUiScale.toFixed(3));
  }
  updateUiScaleLabel();
  if (persist) persistUiScale();
}

function zoomInUi() {
  applyUiScale(currentUiScale + UI_SCALE_STEP);
}

function zoomOutUi() {
  applyUiScale(currentUiScale - UI_SCALE_STEP);
}

function resetUiScale() {
  applyUiScale(UI_SCALE_DEFAULT);
}

async function initUiScale() {
  if (typeof getStored !== 'function' || !window.STORAGE_KEYS?.uiPrefs) {
    applyUiScale(UI_SCALE_DEFAULT, false);
    return;
  }

  const prefs = await getStored(STORAGE_KEYS.uiPrefs);
  const savedScale = (!prefs || Array.isArray(prefs)) ? UI_SCALE_DEFAULT : prefs.scale;
  applyUiScale(savedScale, false);
}
