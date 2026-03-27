// ─── M3U PARSER ───────────────────────────────────────────────────────────────
function parseM3U(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Se já reconhece como M3U...
  if (!content.includes('#EXTM3U') && content.includes('#EXTINF')) {
    // Segue lógica normal abaixo
  } else if (!content.includes('#EXTM3U') && lines.length === 1 && lines[0].startsWith('http')) {
    return [{
      name: 'Canal Importado',
      logo: '',
      groupTitle: 'Importados',
      url: lines[0]
    }];
  }

  const result = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXTINF')) continue;
    const url = lines[i + 1];
    if (!url || url.startsWith('#')) continue;
    const line = lines[i];
    result.push({
      name: line.split(',').slice(1).join(',').trim(),
      logo: line.match(/tvg-logo="([^"]*)"/)?.[1] ?? '',
      groupTitle: line.match(/group-title="([^"]*)"/)?.[1] ?? 'Sem categoria',
      tvgId: line.match(/tvg-id="([^"]*)"/)?.[1] ?? '',
      tvgName: line.match(/tvg-name="([^"]*)"/)?.[1] ?? '',
      url
    });
  }
  return result;
}
