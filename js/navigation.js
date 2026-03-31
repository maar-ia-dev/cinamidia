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

function getSidebarItems() {
  return [...document.querySelectorAll('.v2-shortcut, .cat-item')];
}

function getActiveSidebarIndex() {
  const items = getSidebarItems();
  if (!items.length) return 0;

  // Quando há categoria selecionada, prioriza o foco nela ao voltar do grid.
  if (typeof activeCategory !== 'undefined' && activeCategory) {
    const catIdx = items.findIndex(item =>
      item.classList.contains('cat-item') &&
      String(item.dataset.cat || '') === String(activeCategory)
    );
    if (catIdx >= 0) return catIdx;
  }

  const activeIdx = items.findIndex(item => item.classList.contains('active'));
  return activeIdx >= 0 ? activeIdx : 0;
}

function clampSidebarIndex() {
  const items = getSidebarItems();
  if (!items.length) {
    NAV.catIdx = 0;
    return items;
  }
  NAV.catIdx = Math.max(0, Math.min(NAV.catIdx, items.length - 1));
  return items;
}

function activateSidebarItem(item, openSearch = false) {
  if (!item) return;
  const shortcut = String(item.dataset.shortcut || '');
  if (shortcut === 'search') {
    if (typeof setSidebarShortcut === 'function') setSidebarShortcut('search');
    if (openSearch && typeof openSearchPanel === 'function') openSearchPanel();
    return;
  }
  item.click();
}

function extractDigitFromKeyEvent(e) {
  const key = String(e?.key || '');
  if (/^[0-9]$/.test(key)) return key;
  if (e?.code && /^Numpad[0-9]$/.test(e.code)) return e.code.replace('Numpad', '');
  return null;
}

function getGridModeMetrics() {
  const scroll = document.querySelector('.row-scroll.grid-mode');
  if (!scroll) return null;

  const rootStyles = getComputedStyle(document.documentElement);
  const scrollStyles = getComputedStyle(scroll);
  const cardW = parseFloat(rootStyles.getPropertyValue('--card-w')) || 300;
  const gap = parseFloat(scrollStyles.gap) || 24;
  const paddingLeft = parseFloat(scrollStyles.paddingLeft) || 0;
  const paddingRight = parseFloat(scrollStyles.paddingRight) || 0;
  const usableWidth = Math.max(1, scroll.clientWidth - paddingLeft - paddingRight + gap);
  const itemsPerRow = Math.max(1, Math.floor(usableWidth / (cardW + gap)));

  return { scroll, itemsPerRow };
}

function ensureRowCardsLoaded(rowIdx, targetIdx) {
  if (!window.rowRenderCounts[rowIdx]) return;
  if (targetIdx >= window.rowRenderCounts[rowIdx] - 1) {
    loadMoreCards(rowIdx);
  }
}

function handleKey(e) {
  console.log(`[Key] ${e.key} (code: ${e.keyCode})`);
  const playerOpen = document.getElementById('playerOverlay').classList.contains('open');
  const adminOpen = document.getElementById('adminPanel').classList.contains('open');
  const firstRunOpen = typeof isFirstRunPanelOpen === 'function' && isFirstRunPanelOpen();
  const searchOpen = typeof isSearchPanelOpen === 'function' && isSearchPanelOpen();

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
  if (firstRunOpen) {
    if (e.key === 'm' || e.key === 'M' || e.key === 'ContextMenu') {
      e.preventDefault();
      if (typeof openAdminFromFirstRun === 'function') openAdminFromFirstRun();
      return;
    }

    if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
      e.preventDefault();
      return;
    }

    const activeEl = document.activeElement;
    const sourceButtons = [...document.querySelectorAll('#firstRunChecklist .first-run-source')];
    const topButtons = [
      document.getElementById('firstRunSelectAllBtn'),
      document.getElementById('firstRunClearBtn'),
      document.getElementById('firstRunGoAddBtn'),
      document.getElementById('firstRunAddBtn'),
      document.getElementById('validateChannelsFirstRun')
    ].filter(Boolean);

    if (e.key === 'ArrowRight' && sourceButtons.includes(activeEl)) {
      e.preventDefault();
      document.getElementById('firstRunAddBtn')?.focus();
      return;
    }

    if (e.key === 'ArrowLeft' && (activeEl?.id === 'firstRunAddBtn' || activeEl?.id === 'validateChannelsFirstRun')) {
      e.preventDefault();
      if (typeof focusFirstRunListItem === 'function') focusFirstRunListItem();
      return;
    }

    if (e.key === 'ArrowDown' && topButtons.includes(activeEl) && sourceButtons.length) {
      e.preventDefault();
      if (typeof focusFirstRunListItem === 'function') focusFirstRunListItem();
      else sourceButtons[0].focus();
      return;
    }

    if (e.key === 'ArrowUp' && sourceButtons.includes(activeEl)) {
      e.preventDefault();
      document.getElementById('firstRunGoAddBtn')?.focus();
      return;
    }

    const focusables = [...document.querySelectorAll('#firstRunPanel button, #firstRunPanel input')]
      .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0 && !el.disabled);
    if (!focusables.length) return;

    let idx = focusables.indexOf(activeEl);
    if (idx === -1) idx = 0;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusables[(idx + 1) % focusables.length].focus();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusables[(idx - 1 + focusables.length) % focusables.length].focus();
      return;
    }

    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && sourceButtons.includes(activeEl)) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter' || e.key === 'OK' || e.key === ' ' || e.key === '6') {
      e.preventDefault();
      if (activeEl && typeof activeEl.click === 'function') activeEl.click();
      return;
    }

    return;
  }

  if (searchOpen) {
    const digit = extractDigitFromKeyEvent(e);
    if (digit !== null && typeof appendSearchChar === 'function') {
      e.preventDefault();
      appendSearchChar(digit);
      return;
    }

    if (/^[a-zA-Z]$/.test(String(e.key || '')) && typeof appendSearchChar === 'function') {
      e.preventDefault();
      appendSearchChar(String(e.key).toUpperCase());
      return;
    }

    switch (e.key) {
      case 'Escape': case 'Backspace': case 'GoBack':
        e.preventDefault();
        if (typeof closeSearchPanel === 'function') closeSearchPanel();
        return;
      case 'ArrowLeft':
        e.preventDefault();
        if (typeof navigateSearchKeyboard === 'function') navigateSearchKeyboard('left');
        return;
      case 'ArrowRight':
        e.preventDefault();
        if (typeof navigateSearchKeyboard === 'function') navigateSearchKeyboard('right');
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (typeof navigateSearchKeyboard === 'function') navigateSearchKeyboard('up');
        return;
      case 'ArrowDown':
        e.preventDefault();
        if (typeof navigateSearchKeyboard === 'function') navigateSearchKeyboard('down');
        return;
      case 'Enter': case 'OK': case ' ': case '6':
        e.preventDefault();
        if (typeof triggerSearchFocusedKey === 'function') triggerSearchFocusedKey();
        return;
      default:
        return;
    }
  }

  if (adminOpen) {
    if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
      e.preventDefault(); toggleAdmin(); return;
    }

    const focusables = [...document.querySelectorAll('#adminPanel button, #adminPanel input, #adminPanel select')]
      .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0 && !el.disabled);
      
    if (!focusables.length) return;
    const adminBox = document.querySelector('#adminPanel .admin-box');

    let idx = focusables.indexOf(document.activeElement);
    if (idx === -1) idx = 0;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = (idx + 1) % focusables.length;
      focusables[nextIdx].focus();
      focusables[nextIdx].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (idx - 1 + focusables.length) % focusables.length;
      focusables[prevIdx].focus();
      focusables[prevIdx].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    } else if (e.key === 'Enter' || e.key === 'OK' || e.key === ' ' || e.key === '6') {
      e.preventDefault(); // Impede clique duplicado
      console.log('[Admin] Action Clicked on:', document.activeElement?.id);
      if (document.activeElement && typeof document.activeElement.click === 'function') {
        document.activeElement.click(); 
      }
      return; 
    }
    if (adminBox && document.activeElement) {
      document.activeElement.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
    return;
  }

  // ─ PLAYER open ─
  if (playerOpen) {
    const digit = extractDigitFromKeyEvent(e);
    if (digit !== null) {
      e.preventDefault();
      if (typeof appendChannelInputDigit === 'function') appendChannelInputDigit(digit);
      return;
    }

    switch (e.key) {
      case 'Escape': case 'Backspace': case 'GoBack':
        e.preventDefault(); closePlayer(); break;
      case 'ArrowUp': case 'ChannelUp':
        e.preventDefault(); changeChannel(-1); break;
      case 'ArrowDown': case 'ChannelDown':
        e.preventDefault(); changeChannel(1); break;
      case 'Enter': case 'OK':
        e.preventDefault();
        if (typeof isZapMenuVisible === 'function' && isZapMenuVisible() && typeof confirmZapSelection === 'function') {
          confirmZapSelection();
        } else if (typeof togglePlayerPause === 'function') {
          togglePlayerPause();
        }
        break;
      case 'i': case 'I': case 'Info':
        e.preventDefault();
        if (typeof togglePlayerInfoPanel === 'function') togglePlayerInfoPanel();
        break;
      case 'd': case 'D':
        e.preventDefault();
        if (typeof togglePlayerDiagnosticsPanel === 'function') togglePlayerDiagnosticsPanel();
        break;
      case 'ArrowRight': case '+': case '=': case 'VolumeUp': {
        e.preventDefault();
        const video = document.getElementById('videoEl');
        video.volume = Math.min(1, video.volume + 0.1);
        video.muted = false;
        if (typeof savePlayerPrefsFromVideo === 'function') savePlayerPrefsFromVideo(video);
        if (typeof senza !== 'undefined' && senza.remotePlayer) {
          try { senza.remotePlayer.setVolume(video.volume); } catch(e){}
        }
        if (typeof showVolumeHUD === 'function') showVolumeHUD(video.volume, video.muted);
        showHud();
        break;
      }
      case 'ArrowLeft': case '-': case '_': case 'VolumeDown': {
        e.preventDefault();
        const video = document.getElementById('videoEl');
        video.volume = Math.max(0, video.volume - 0.1);
        if (typeof savePlayerPrefsFromVideo === 'function') savePlayerPrefsFromVideo(video);
        if (typeof senza !== 'undefined' && senza.remotePlayer) {
          try { senza.remotePlayer.setVolume(video.volume); } catch(e){}
        }
        if (typeof showVolumeHUD === 'function') showVolumeHUD(video.volume, video.muted);
        showHud();
        break;
      }
      case 'm': case 'M': case 'AudioVolumeMute': {
        e.preventDefault();
        const video = document.getElementById('videoEl');
        video.muted = !video.muted;
        if (typeof savePlayerPrefsFromVideo === 'function') savePlayerPrefsFromVideo(video);
        if (typeof senza !== 'undefined' && senza.remotePlayer) {
          try { senza.remotePlayer.setVolume(video.muted ? 0 : video.volume); } catch(e){}
        }
        if (typeof showVolumeHUD === 'function') showVolumeHUD(video.volume, video.muted);
        break;
      }
    }
    return;
  }

  // ─ MAIN GRID navigation ─
  if (!gridRows.length && NAV.zone === 'grid') {
    NAV.zone = 'categories';
    NAV.catIdx = getActiveSidebarIndex();
  }

  e.preventDefault();

  if (NAV.zone === 'categories') {
    const items = clampSidebarIndex();
    switch (e.key) {
      case 'ArrowUp':
        if (items.length) {
          if (NAV.catIdx === 0) {
            NAV.zone = 'sidebar-footer';
          } else {
            NAV.catIdx = NAV.catIdx - 1;
            activateSidebarItem(items[NAV.catIdx], false);
          }
          return;
        }
        NAV.zone = 'sidebar-footer';
        break;
      case 'ArrowDown':
        if (items.length) {
          if (NAV.catIdx === items.length - 1) {
            NAV.zone = 'sidebar-footer';
          } else {
            NAV.catIdx = NAV.catIdx + 1;
            activateSidebarItem(items[NAV.catIdx], false);
          }
          return;
        }
        NAV.zone = 'sidebar-footer';
        break;
      case 'ArrowRight':
        if (gridRows.length) {
          NAV.zone = 'grid'; NAV.rowIdx = 0; NAV.colIdx = 0;
        }
        break;
      case 'ArrowLeft': return;
      case 'Enter': case 'OK':
        activateSidebarItem(items[NAV.catIdx], true); return;
      case 'm': case 'M': case 'ContextMenu':
        toggleAdmin(); return;
      default: return;
    }
  } else if (NAV.zone === 'sidebar-footer') {
    switch (e.key) {
       case 'ArrowUp':
         NAV.zone = 'categories';
         NAV.catIdx = Math.max(0, getSidebarItems().length - 1);
         break;
       case 'ArrowDown':
         NAV.zone = 'categories';
         NAV.catIdx = 0;
         break;
       case 'ArrowRight':
         if (gridRows.length) {
           NAV.zone = 'grid'; NAV.rowIdx = gridRows.length - 1; NAV.colIdx = 0;
         }
         break;
       case 'Enter': case 'OK':
         toggleAdmin(); return;
       case 'm': case 'M': case 'ContextMenu':
         toggleAdmin(); return;
    }
  } else {
    // zone === 'grid'
    switch (e.key) {
      case 'ArrowRight':
        if (activeCategory) {
          const metrics = getGridModeMetrics();
          if (metrics) {
            const { itemsPerRow } = metrics;
            if ((NAV.colIdx % itemsPerRow) < itemsPerRow - 1 && NAV.colIdx < gridRows[NAV.rowIdx].channels.length - 1) {
              NAV.colIdx++;
            }
          }
        } else {
          NAV.colIdx = Math.min(NAV.colIdx + 1, (gridRows[NAV.rowIdx]?.channels.length || 1) - 1);
        }
        
        ensureRowCardsLoaded(NAV.rowIdx, NAV.colIdx + 6);
        break;

      case 'ArrowLeft':
        if (activeCategory) {
          const metrics = getGridModeMetrics();
          if (metrics) {
            const { itemsPerRow } = metrics;
            if (NAV.colIdx % itemsPerRow > 0) {
              NAV.colIdx--;
            } else {
              NAV.zone = 'categories';
              NAV.catIdx = getActiveSidebarIndex();
            }
          }
        } else {
          if (NAV.colIdx > 0) {
            NAV.colIdx--;
          } else {
            NAV.zone = 'categories';
            NAV.catIdx = getActiveSidebarIndex();
          }
        }
        break;

      case 'ArrowDown': {
        if (activeCategory) {
          const metrics = getGridModeMetrics();
          if (metrics) {
            const { itemsPerRow } = metrics;
            const total = gridRows[NAV.rowIdx].channels.length;
            let targetIdx = NAV.colIdx + itemsPerRow;
            if (targetIdx >= total) targetIdx = total - 1;
            if (targetIdx > NAV.colIdx) {
              ensureRowCardsLoaded(NAV.rowIdx, targetIdx + itemsPerRow);
              NAV.colIdx = targetIdx;
            } else {
              // Já está na última linha do grid da categoria
              // Opcional: navegar para o rodapé da sidebar?
            }
          }
        } else if (NAV.rowIdx < gridRows.length - 1) {
          NAV.rowIdx++;
          NAV.colIdx = Math.min(NAV.colIdx, gridRows[NAV.rowIdx].channels.length - 1);
        }
        break;
      }

      case 'ArrowUp': {
        if (activeCategory) {
          const metrics = getGridModeMetrics();
          if (metrics) {
            const { itemsPerRow } = metrics;
            if (NAV.colIdx - itemsPerRow >= 0) {
              NAV.colIdx -= itemsPerRow;
            }
          }
        } else if (NAV.rowIdx > 0) {
          NAV.rowIdx--;
          NAV.colIdx = Math.min(NAV.colIdx, gridRows[NAV.rowIdx].channels.length - 1);
        }
        break;
      }
      case 'Enter': case 'OK':
        const ch = gridRows[NAV.rowIdx]?.channels[NAV.colIdx];
        if (ch) openPlayer(ch.id);
        return;
      case 'Escape': case 'GoBack': case 'Backspace':
        NAV.zone = 'categories';
        NAV.catIdx = getActiveSidebarIndex();
        refreshNavFocus();
        return;
        break;
      case 'm': case 'M': case 'ContextMenu':
        toggleAdmin(); return;
      default: return;
    }
  }
  refreshNavFocus();
}

function clearFocus() {
  document.querySelectorAll('.focused').forEach(el => el.classList.remove('focused'));
}

function ensureCardVisibleInContent(card) {
  const content = document.getElementById('content');
  if (!card || !content) return;

  const contentRect = content.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const topSafeArea = contentRect.top + 84;
  const bottomSafeArea = contentRect.bottom - 96;

  if (cardRect.bottom > bottomSafeArea) {
    const delta = cardRect.bottom - bottomSafeArea;
    content.scrollBy({ top: delta, behavior: 'smooth' });
    return;
  }

  if (cardRect.top < topSafeArea) {
    const delta = cardRect.top - topSafeArea;
    content.scrollBy({ top: delta, behavior: 'smooth' });
  }
}

function refreshNavFocus() {
  clearFocus();
  if (NAV.zone === 'search') {
    if (typeof refreshSearchKeyFocus === 'function') refreshSearchKeyFocus();
  } else if (NAV.zone === 'grid') {
    let card = document.querySelector(`.card[data-row="${NAV.rowIdx}"][data-col="${NAV.colIdx}"]`);
    if (!card && activeCategory) {
      ensureRowCardsLoaded(NAV.rowIdx, NAV.colIdx);
      card = document.querySelector(`.card[data-row="${NAV.rowIdx}"][data-col="${NAV.colIdx}"]`);
    }
    if (card) {
      card.classList.add('focused');
      if (activeCategory) {
        card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        ensureCardVisibleInContent(card);
      } else {
        card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    }
  } else if (NAV.zone === 'categories') {
    const items = clampSidebarIndex();
    if (items[NAV.catIdx]) {
      items[NAV.catIdx].classList.add('focused');
      items[NAV.catIdx].scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'smooth' });
    }
  } else if (NAV.zone === 'sidebar-footer') {
    document.querySelector('.admin-toggle')?.classList.add('focused');
  }
}

function updateFocus() {
  refreshNavFocus();
}

function updateCatFocus() {
  refreshNavFocus();
}
