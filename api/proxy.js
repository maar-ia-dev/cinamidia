// Vercel Serverless Function – proxy para buscar playlists M3U
// Usa CommonJS (obrigatório no runtime padrão do Vercel)
function isHttpProtocol(protocol) {
  return protocol === 'http:' || protocol === 'https:';
}

function proxifyUrl(value, baseUrl) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return rawValue;

  try {
    const absoluteUrl = new URL(rawValue, baseUrl);
    if (!isHttpProtocol(absoluteUrl.protocol)) return rawValue;
    return `/api/proxy?url=${encodeURIComponent(absoluteUrl.toString())}`;
  } catch (e) {
    return rawValue;
  }
}

function looksLikeHlsPlaylist(text, targetUrl) {
  return /#EXT-X-[A-Z-]+/i.test(text) || /\.m3u8($|\?)/i.test(targetUrl);
}

function rewriteHlsPlaylist(text, targetUrl) {
  return text
    .split(/\r?\n/)
    .map(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return line;

      if (trimmedLine.startsWith('#')) {
        return line.replace(/URI=\"([^\"]+)\"/g, (_match, uri) => `URI="${proxifyUrl(uri, targetUrl)}"`);
      }

      return proxifyUrl(trimmedLine, targetUrl);
    })
    .join('\n');
}

function isTextResponse(contentType) {
  const lowerType = String(contentType || '').toLowerCase();
  return (
    lowerType.startsWith('text/') ||
    lowerType.includes('json') ||
    lowerType.includes('xml') ||
    lowerType.includes('javascript') ||
    lowerType.includes('mpegurl') ||
    lowerType.includes('application/vnd.apple.mpegurl')
  );
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Parâmetro "url" obrigatório. Uso: /api/proxy?url=https://...' });
  }

  try {
    // Usa fetch nativo (Node 18+, que é o default da Vercel)
    const parsedUrl = new URL(targetUrl);
    if (!isHttpProtocol(parsedUrl.protocol)) {
      throw new Error('Somente URLs HTTP(S) sao aceitas');
    }

    const requestHeaders = {
      'User-Agent': 'CinaMidia/1.0',
      'Accept': '*/*',
    };

    if (req.headers.range) {
      requestHeaders.Range = req.headers.range;
    }

    const response = await fetch(targetUrl, {
      headers: requestHeaders,
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream retornou ${response.status}: ${response.statusText}`,
        url: targetUrl,
      });
    }

    const contentType = response.headers.get('content-type') || '';

    if (isTextResponse(contentType)) {
      const text = await response.text();
      const isHls = looksLikeHlsPlaylist(text, targetUrl);
      const body = isHls ? rewriteHlsPlaylist(text, targetUrl) : text;

      res.setHeader('Cache-Control', isHls ? 'no-store' : 's-maxage=300, stale-while-revalidate=600');
      res.setHeader(
        'Content-Type',
        isHls
          ? 'application/vnd.apple.mpegurl; charset=utf-8'
          : `${contentType || 'text/plain'}${contentType.includes('charset=') ? '' : '; charset=utf-8'}`
      );
      return res.status(response.status).send(body);
    }

    // Cache de 5 minutos para não re-buscar a cada request
    ['accept-ranges', 'content-range', 'last-modified', 'etag'].forEach(headerName => {
      const value = response.headers.get(headerName);
      if (value) res.setHeader(headerName, value);
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.status(response.status).send(buffer);
  } catch (e) {
    console.error('[proxy] Erro ao buscar URL:', targetUrl, e.message);
    res.status(500).json({ error: e.message, url: targetUrl });
  }
};
