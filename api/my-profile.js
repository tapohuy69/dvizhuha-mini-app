import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {

  const telegramId =
    String(req.query.telegram_id || "").trim();

  if (!telegramId) {
    return res.status(400).json({
      error: "Telegram ID не найден"
    });
  }

  const token = process.env.CR_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "CR_API_TOKEN не найден в Vercel"
    });
  }

  try {

    const sql = neon(process.env.DATABASE_URL);

    // ==========================================
    // ИЩЕМ ПРИВЯЗАННЫЙ АККАУНТ
    // ==========================================

    const linked = await sql`
      SELECT
        telegram_id,
        player_tag,
        player_name
      FROM telegram_players
      WHERE telegram_id = ${telegramId}
      LIMIT 1
    `;

    if (linked.length === 0) {
      return res.status(404).json({
        error: "Аккаунт Clash Royale не привязан"
      });
    }

    const playerTag =
      String(linked[0].player_tag || "")
        .replace(/^#+/, "")
        .trim()
        .toUpperCase();

    if (!playerTag) {
      return res.status(404).json({
        error: "Тег Clash Royale не найден"
      });
    }

    // ==========================================
    // ПОЛУЧАЕМ АКТУАЛЬНЫЕ ДАННЫЕ CLASH ROYALE
    // ==========================================

    const url =
      `https://proxy.royaleapi.dev/v1/players/%23${encodeURIComponent(playerTag)}`;

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

    // ==========================================
    // ОБНОВЛЯЕМ PLAYERS
    // ==========================================

    const cleanTag = "#" + playerTag;
    const trophies = Number(data.trophies || 0);
    const playerName = data.name || "";

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
        ${cleanTag},
        ${playerName},
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

    // ==========================================
    // ИСТОРИЯ КУБКОВ
    // ==========================================

    const lastHistory = await sql`
      SELECT trophies
      FROM trophy_history
      WHERE player_tag = ${cleanTag}
      ORDER BY recorded_at DESC
      LIMIT 1
    `;

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
          ${cleanTag},
          ${trophies}
        )
      `;
    }

    return res.status(200).json({
      ...data,

      linked_telegram: {
        telegram_id: telegramId,
        player_tag: cleanTag
      },

      neon: {
        saved: true,
        trophy_history: true
      }
    });

  } catch (error) {

    console.error("My profile error:", error);

    return res.status(500).json({
      error: "Ошибка подключения",
      details: error.message
    });
  }
}
