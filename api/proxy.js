export default async function handler(req, res) {
  // Permitir CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Parâmetro "url" obrigatório' });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CinaMidia/1.0' },
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Erro ao buscar: ${response.statusText}` });
    }
    const text = await response.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
