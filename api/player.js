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
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: "API вернул не JSON",
        response: text
      });
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const sql = neon(process.env.DATABASE_URL);

    const playerTag = "#" + tag;
    const trophies = Number(data.trophies || 0);

    // Сохраняем актуальные данные игрока
    await sql`
      INSERT INTO players (
        player_tag,
        player_name,
        trophies,
        wins,
        losses,
        updated_at
      )
      VALUES (
        ${playerTag},
        ${data.name || ""},
        ${trophies},
        ${data.wins || 0},
        ${data.losses || 0},
        NOW()
      )
      ON CONFLICT (player_tag)
      DO UPDATE SET
        player_name = EXCLUDED.player_name,
        trophies = EXCLUDED.trophies,
        wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        updated_at = NOW()
    `;

    // Получаем последнюю запись истории
    const lastHistory = await sql`
      SELECT trophies
      FROM trophy_history
      WHERE player_tag = ${playerTag}
      ORDER BY recorded_at DESC
      LIMIT 1
    `;

    // Записываем новую историю только если кубки изменились
    if (
      lastHistory.length === 0 ||
      Number(lastHistory[0].trophies) !== trophies
    ) {
      await sql`
        INSERT INTO trophy_history (
          player_tag,
          trophies
        )
        VALUES (
          ${playerTag},
          ${trophies}
        )
      `;
    }

    return res.status(200).json({
      ...data,
      neon: {
        saved: true,
        trophy_history: true
      }
    });

  } catch (error) {
    return res.status(500).json({
      error: "Ошибка подключения",
      details: error.message
    });
  }
}
