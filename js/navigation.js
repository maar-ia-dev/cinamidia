// ─── NAVIGATION (D-Pad / Keyboard) ───────────────────────────────────────────
const NAV = { zone: 'grid', catIdx: 0, rowIdx: 0, colIdx: 0 };

function setupNavigation() {
  document.addEventListener('keydown', handleKey);
  // Mouse click fallback
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) {
      const id = parseInt(card.dataset.id);
      if (id) openPlayer(id);
    }
  });
}

function handleKey(e) {
  console.log(`[Key] ${e.key} (code: ${e.keyCode})`);
  const playerOpen = document.getElementById('playerOverlay').classList.contains('open');
  const adminOpen = document.getElementById('adminPanel').classList.contains('open');

  // ─ CONFIRM MODAL ─
  const confOpen = document.getElementById('confirmModal').style.display === 'flex';
  if (confOpen) {
    const confFocusables = [...document.querySelectorAll('#confirmModal button')];
    let cIdx = confFocusables.indexOf(document.activeElement);
    if (cIdx === -1) cIdx = 0;
    switch (e.key) {
       case 'ArrowLeft': case 'ArrowRight':
         e.preventDefault();
         confFocusables[cIdx === 0 ? 1 : 0].focus();
         break;
       case 'Enter': case 'OK': case ' ': case '6':
         console.log('[Confirm] OK Clicked on:', document.activeElement.id);
         document.activeElement.click(); // Garante o clique no botão focado
         return;
       case 'Escape': case 'Backspace': case 'GoBack':
         e.preventDefault(); document.getElementById('confirmNo').click();
         break;
    }
    return;
  }

  // ─ ADMIN PANEL open ─
  if (adminOpen) {
    if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
      e.preventDefault(); toggleAdmin(); return;
    }

    const focusables = [...document.querySelectorAll('#adminPanel button, #adminPanel input, #adminPanel select')]
      .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0 && !el.disabled);
      
    if (!focusables.length) return;

    let idx = focusables.indexOf(document.activeElement);
    if (idx === -1) idx = 0;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = (idx + 1) % focusables.length;
      focusables[nextIdx].focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (idx - 1 + focusables.length) % focusables.length;
      focusables[prevIdx].focus();
    } else if (e.key === 'Enter' || e.key === 'OK' || e.key === ' ' || e.key === '6') {
      console.log('[Admin] Action Clicked on:', document.activeElement.id);
      // document.activeElement.click(); // Alguns botões já têm onclick, cuidado para não duplicar
      return; 
    }
    return;
  }

  // ─ PLAYER open ─
  if (playerOpen) {
    switch (e.key) {
      case 'Escape': case 'Backspace': case 'GoBack':
        e.preventDefault(); closePlayer(); break;
      case 'ArrowLeft':
        e.preventDefault(); changeChannel(-1); break;
      case 'ArrowRight':
        e.preventDefault(); changeChannel(1); break;
      case 'Enter': case 'OK':
        e.preventDefault(); showHud(); break;
      case 'ArrowUp': case '+': case '=': case 'VolumeUp': {
        e.preventDefault();
        const video = document.getElementById('videoEl');
        video.volume = Math.min(1, video.volume + 0.1);
        video.muted = false;
        showToast(`🔊 Volume: ${Math.round(video.volume * 100)}%`);
        showHud();
        break;
      }
      case 'ArrowDown': case '-': case '_': case 'VolumeDown': {
        e.preventDefault();
        const video = document.getElementById('videoEl');
        video.volume = Math.max(0, video.volume - 0.1);
        video.showToast(`🔉 Volume: ${Math.round(video.volume * 100)}%`);
        showHud();
        break;
      }
      case 'm': case 'M': case 'AudioVolumeMute': {
        e.preventDefault();
        const video = document.getElementById('videoEl');
        video.muted = !video.muted;
        showToast(video.muted ? '🔇 Áudio Mudo' : '🔊 Áudio Ativado');
        break;
      }
    }
    return;
  }

  // ─ MAIN GRID navigation ─
  if (!gridRows.length) {
    if (e.key === 'm' || e.key === 'M' || e.key === 'ContextMenu') { e.preventDefault(); toggleAdmin(); }
    return;
  }

  e.preventDefault();

  if (NAV.zone === 'categories') {
    const chips = [...document.querySelectorAll('.cat-item')];
    switch (e.key) {
      case 'ArrowUp': NAV.catIdx = Math.max(0, NAV.catIdx - 1); break;
      case 'ArrowDown': NAV.catIdx = Math.min(chips.length - 1, NAV.catIdx + 1); break;
      case 'ArrowRight':
        NAV.zone = 'grid'; NAV.rowIdx = 0; NAV.colIdx = 0;
        updateFocus(); return;
      case 'ArrowLeft': return;
      case 'Enter': case 'OK':
        chips[NAV.catIdx]?.click(); return;
      case 'm': case 'M': case 'ContextMenu':
        toggleAdmin(); return;
      default: return;
    }
    updateCatFocus(chips);
    return;
  }

  // zone === 'grid'
  switch (e.key) {
    case 'ArrowRight':
      NAV.colIdx = Math.min(NAV.colIdx + 1, (gridRows[NAV.rowIdx]?.channels.length || 1) - 1);
      if (window.rowRenderCounts[NAV.rowIdx] && (NAV.colIdx + 6 >= window.rowRenderCounts[NAV.rowIdx])) {
        loadMoreCards(NAV.rowIdx);
      }
      break;
    case 'ArrowLeft':
      if (NAV.colIdx > 0) {
        NAV.colIdx--;
      } else {
        NAV.zone = 'categories';
        updateCatFocus([...document.querySelectorAll('.cat-item')]);
        clearFocus();
        return;
      }
      break;
    case 'ArrowDown':
      if (NAV.rowIdx < gridRows.length - 1) {
        NAV.rowIdx++;
        NAV.colIdx = Math.min(NAV.colIdx, gridRows[NAV.rowIdx].channels.length - 1);
      }
      break;
    case 'ArrowUp':
      if (NAV.rowIdx > 0) {
        NAV.rowIdx--;
        NAV.colIdx = Math.min(NAV.colIdx, gridRows[NAV.rowIdx].channels.length - 1);
      }
      break;
    case 'Enter': case 'OK':
      const ch = gridRows[NAV.rowIdx]?.channels[NAV.colIdx];
      if (ch) openPlayer(ch.id);
      return;
    case 'Escape': case 'GoBack': case 'Backspace':
      if (activeCategory) { selectCategory(null); return; }
      break;
    case 'm': case 'M': case 'ContextMenu':
      toggleAdmin(); return;
    default: return;
  }
  updateFocus();
}

function clearFocus() {
  document.querySelectorAll('.card.focused').forEach(c => c.classList.remove('focused'));
}

function updateFocus() {
  clearFocus();
  document.querySelectorAll('.cat-item.focused').forEach(c => c.classList.remove('focused'));
  const card = document.querySelector(`.card[data-row="${NAV.rowIdx}"][data-col="${NAV.colIdx}"]`);
  if (card) {
    card.classList.add('focused');
    card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    const row = card.closest('.row');
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function updateCatFocus(chips) {
  if (!chips) chips = [...document.querySelectorAll('.cat-item')];
  chips.forEach(c => c.classList.remove('focused'));
  if (chips[NAV.catIdx]) {
    chips[NAV.catIdx].classList.add('focused');
    chips[NAV.catIdx].scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'smooth' });
  }
}
