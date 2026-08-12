export default async function handler(req, res) {
  const tag = (req.query.tag || "").replace("#", "").trim();
  const token = process.env.CR_API_TOKEN;

  if (!tag) {
    return res.status(400).json({ error: "Тег не указан" });
  }

  if (!token) {
    return res.status(500).json({ error: "CR_API_TOKEN не найден" });
  }

  try {
    const response = await fetch(
      `https://proxy.royaleapi.dev/v1/players/%23${encodeURIComponent(tag)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

    const body = await response.text();

    return res.status(200).json({
      status: response.status,
      body: body
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
