// ─── CLIENT-SIDE STORAGE (IndexedDB) ──────────────────────────────────────────
const STORAGE_KEYS = { sources: 'cinamidia_sources', channels: 'cinamidia_channels' };

async function getStored(key) {
  try {
    let data = await idbKeyval.get(key);
    if (!data) {
      const legacy = localStorage.getItem(key);
      if (legacy) {
        data = JSON.parse(legacy);
        await idbKeyval.set(key, data);
        console.log(`[Storage] Migrated ${key} to IndexedDB`);
      } else {
        data = [];
      }
    }
    return data || [];
  } catch (e) { return []; }
}

async function setStored(key, data) {
  try { await idbKeyval.set(key, data); } catch (e) { console.error('Storage error', e); }
}
