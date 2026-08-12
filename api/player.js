export default async function handler(req, res) {
  const tag = (req.query.tag || "")
    .replace("#", "")
    .trim()
    .toUpperCase();

  if (!tag) {
    return res.status(400).json({
      error: "Укажи тег игрока"
    });
  }

  const token = process.env.CR_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "CR_API_TOKEN не найден в Vercel"
    });
  }

  try {
    const url =
      `https://proxy.royaleapi.dev/v1/players/%23${encodeURIComponent(tag)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        error: "API вернул не JSON",
        response: text
      };
    }

    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({
      error: "Ошибка подключения к Clash Royale API",
      details: error.message
    });
  }
}
