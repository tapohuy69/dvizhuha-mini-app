import { neon } from "@neondatabase/serverless";

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

  try {
    const sql = neon(process.env.DATABASE_URL);

    const playerTag = "#" + tag;

    const history = await sql`
      SELECT
        trophies,
        recorded_at
      FROM trophy_history
      WHERE player_tag = ${playerTag}
      ORDER BY recorded_at ASC
    `;

    return res.status(200).json({
      player_tag: playerTag,
      history
    });

  } catch (error) {
    return res.status(500).json({
      error: "Ошибка получения истории",
      details: error.message
    });
  }
}
