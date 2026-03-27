// ─── PLAYER ───────────────────────────────────────────────────────────────────
let currentPlayingIndex = -1; // index in currentPlaylist
let currentPlaylist = [];     // flat list for channel switching
let hudTimer = null;

async function openPlayer(channelId) {
  const ch = allChannels.find(c => c.id === channelId);
  if (!ch) return;

  // Build playlist from current view
  currentPlaylist = gridRows.flatMap(r => r.channels);
  currentPlayingIndex = currentPlaylist.findIndex(c => c.id === channelId);

  loadChannel(ch);
}

async function loadChannel(ch) {
  const overlay = document.getElementById('playerOverlay');
  overlay.classList.add('open');

  document.getElementById('playerName').textContent = ch.name;
  document.getElementById('playerCat').textContent = ch.group_title || '';
  const logo = document.getElementById('playerLogo');
  logo.src = ch.logo || ''; logo.style.display = ch.logo ? 'block' : 'none';
  document.getElementById('playerError').classList.remove('show');
  showHud();

  if (senzaReady && typeof senza !== 'undefined') {
    try { await senza.lifecycle.moveToForeground(); } catch (e) { }
  }

  // Cleanup previous
  const video = document.getElementById('videoEl');
  video.pause();
  video.removeAttribute('src');
  if (video._hlsInstance) { video._hlsInstance.destroy(); video._hlsInstance = null; }
  if (senzaPlayer) { try { (senzaPlayer.destroy ? senzaPlayer.destroy() : null); } catch (e) { } senzaPlayer = null; }

  const streamUrl = (ch.stream_url.startsWith('http') && !ch.stream_url.startsWith('https')) 
    ? `/api/proxy?url=${encodeURIComponent(ch.stream_url)}` 
    : ch.stream_url;

  const isDASH = streamUrl.includes('.mpd');
  const isHLS = streamUrl.includes('.m3u8') || streamUrl.includes('type=m3u') || streamUrl.includes('output=hls') || streamUrl.includes('output=ts');

  // Lógica de Player para Senza SDK (Smart TVs)
  if (senzaReady && typeof senza !== 'undefined') {
    const SenzaPlayerClass = (senza.ShakaPlayer) || (senza.shaka && senza.shaka.Player) || (window.shaka && window.shaka.Player);
    // O Shaka Player da Senza suporta tanto DASH quanto HLS!
    if (SenzaPlayerClass) {
      try {
        // Se for HLS, o SDK da Senza recomenda estar em Foreground para processar localmente
        if (!isDASH) await senza.lifecycle.moveToForeground();
        
        // Força volume máximo no hardware
        try { await senza.remotePlayer.setVolume(1.0); } catch (e) { }

        senzaPlayer = new (SenzaPlayerClass); 
        // Shaka Player do Senza se vincula ao video via .attach(videoEl)
        if (senzaPlayer.attach) {
           await senzaPlayer.attach(video);
        }

        // Garante trilha de áudio conforme sample banner.js
        const trackHandler = () => {
          try {
            if (senzaPlayer && senzaPlayer.selectAudioLanguage) {
               senzaPlayer.selectAudioLanguage('pt-BR');
            }
          } catch(e) {}
        };
        
        if (senzaPlayer.addEventListener) {
          senzaPlayer.addEventListener('trackschanged', trackHandler);
          senzaPlayer.addEventListener('loading', () => console.log('[Player] Loading...'));
        }

        await senzaPlayer.load(streamUrl);
        video.play().catch(e => console.error('[Video] Play Error', e));
        return;
      } catch (e) {
        console.error('[SenzaPlayer] Load failed', e.message);
      }
    }
  }

  // Fallback Hls.js ou Nativo
  if (isHLS && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true });
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (e, data) => { if (data.fatal) document.getElementById('playerError').classList.add('show'); });
    video._hlsInstance = hls;
  } else {
    video.src = streamUrl;
    video.play().catch(() => document.getElementById('playerError').classList.add('show'));
  }
}

function closePlayer() {
  document.getElementById('playerOverlay').classList.remove('open');
  const video = document.getElementById('videoEl');
  video.pause();
  video.removeAttribute('src');
  if (video._hlsInstance) { video._hlsInstance.destroy(); video._hlsInstance = null; }
  if (senzaPlayer) { try { (senzaPlayer.destroy ? senzaPlayer.destroy() : null); } catch (e) { } senzaPlayer = null; }
  updateFocus();
}

function changeChannel(dir) {
  if (currentPlaylist.length === 0) return;
  currentPlayingIndex = (currentPlayingIndex + dir + currentPlaylist.length) % currentPlaylist.length;
  loadChannel(currentPlaylist[currentPlayingIndex]);
}

function showHud() {
  const hud = document.getElementById('playerHud');
  hud.classList.remove('hidden');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => hud.classList.add('hidden'), 5000);
}
