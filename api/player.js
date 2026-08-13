import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {

  const token = process.env.CR_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "CR_API_TOKEN не найден в Vercel"
    });
  }

  const sql = neon(process.env.DATABASE_URL);


  // ==========================================
  // TELEGRAM ID
  // ==========================================

  const telegramId =
    String(req.query.telegram_id || "").trim();


  // ==========================================
  // TAG
  // ==========================================

  const tag =
    String(req.query.tag || "")
      .replace(/^#+/, "")
      .trim()
      .toUpperCase();


  // ==========================================
  // МОЙ ПРОФИЛЬ
  // telegram_id → player_tag
  // ==========================================

  if (telegramId && !tag) {

    try {

      const linked = await sql`
        SELECT
          player_tag
        FROM telegram_players
        WHERE telegram_id = ${telegramId}
        LIMIT 1
      `;


      if (linked.length === 0) {

        return res.status(404).json({
          error: "PLAYER_NOT_LINKED"
        });

      }


      const playerTag =
        String(linked[0].player_tag || "")
          .replace(/^#+/, "")
          .toUpperCase();


      if (!playerTag) {

        return res.status(404).json({
          error: "PLAYER_NOT_LINKED"
        });

      }


      const url =
        `https://proxy.royaleapi.dev/v1/players/%23${encodeURIComponent(playerTag)}`;


      const response =
        await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json"
          }
        });


      const text =
        await response.text();


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


      return res.status(200).json(data);

    } catch (error) {

      return res.status(500).json({
        error: "Ошибка получения профиля",
        details: error.message
      });

    }
  }


  // ==========================================
  // ПРИВЯЗКА TAG → TELEGRAM
  // ==========================================

  if (!tag) {

    return res.status(400).json({
      error: "Укажи тег игрока"
    });

  }


  if (!telegramId) {

    return res.status(400).json({
      error: "Telegram ID не найден"
    });

  }


  try {

    const url =
      `https://proxy.royaleapi.dev/v1/players/%23${encodeURIComponent(tag)}`;


    const response =
      await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      });


    const text =
      await response.text();


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


    const playerTag =
      "#" + tag;


    const trophies =
      Number(data.trophies || 0);


    const playerName =
      data.name || "";


    // ==========================================
    // PLAYERS
    // ==========================================

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

    const lastHistory =
      await sql`
        SELECT trophies
        FROM trophy_history
        WHERE player_tag = ${playerTag}
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
          ${playerTag},
          ${trophies}
        )
      `;

    }


    // ==========================================
    // TELEGRAM → CLASH ROYALE
    // ==========================================

    await sql`
      INSERT INTO telegram_players (
        telegram_id,
        player_tag,
        player_name,
        updated_at
      )
      VALUES (
        ${telegramId},
        ${playerTag},
        ${playerName},
        NOW()
      )
      ON CONFLICT (telegram_id)
      DO UPDATE SET
        player_tag = EXCLUDED.player_tag,
        player_name = EXCLUDED.player_name,
        updated_at = NOW()
    `;


    return res.status(200).json({

      ...data,

      neon: {
        saved: true,
        trophy_history: true,
        telegram_linked: true
      }

    });


  } catch (error) {

    return res.status(500).json({
      error: "Ошибка подключения",
      details: error.message
    });

  }
}
