// Vercel Serverless Function – proxy para buscar playlists M3U
// Usa CommonJS (obrigatório no runtime padrão do Vercel)
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Parâmetro "url" obrigatório. Uso: /api/proxy?url=https://...' });
  }

  try {
    // Usa fetch nativo (Node 18+, que é o default da Vercel)
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'CinaMidia/1.0',
        'Accept': '*/*',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream retornou ${response.status}: ${response.statusText}`,
        url: targetUrl,
      });
    }

    const text = await response.text();

    // Cache de 5 minutos para não re-buscar a cada request
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    console.error('[proxy] Erro ao buscar URL:', targetUrl, e.message);
    res.status(500).json({ error: e.message, url: targetUrl });
  }
};
