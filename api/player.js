export default async function handler(req, res) {
  const tag = (req.query.tag || "").replace("#", "").trim();
  const token = process.env.CR_API_TOKEN;

  if (!tag) {
    return res.status(400).json({ error: "Тег не получен" });
  }

  if (!token) {
    return res.status(500).json({ error: "CR_API_TOKEN не найден" });
  }

  try {
    const url =
      `https://api.clashroyale.com/v1/players/%23${encodeURIComponent(tag)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const body = await response.text();

    return res.status(200).json({
      clashRoyaleStatus: response.status,
      clashRoyaleResponse: body
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
