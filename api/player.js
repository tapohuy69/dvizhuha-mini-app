export default async function handler(req, res) {
  const tag = (req.query.tag || "").replace("#", "").trim();
  const token = process.env.CR_API_TOKEN;

  if (!tag || !token) {
    return res.status(400).json({ error: "Нет тега или токена" });
  }

  const response = await fetch(
    `https://api.clashroyale.com/v1/players/%23${encodeURIComponent(tag)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await response.json();

  return res.status(response.status).json(data);
}
