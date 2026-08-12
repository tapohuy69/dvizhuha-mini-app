export default async function handler(req, res) {
  const clanTag = (req.query.tag || "#GCGJ9VJV")
    .replace("#", "")
    .trim()
    .toUpperCase();

  const token = process.env.CR_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "CR_API_TOKEN не найден в Vercel"
    });
  }

  try {
    const response = await fetch(
      `https://proxy.royaleapi.dev/v1/clans/%23${encodeURIComponent(clanTag)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

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
