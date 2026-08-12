export default async function handler(req, res) {
  const tag = (req.query.tag || "").replace("#", "").trim();

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
    const response = await fetch(
      `https://proxy.royaleapi.dev/v1/players/%23${encodeURIComponent(tag)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        raw: text
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
