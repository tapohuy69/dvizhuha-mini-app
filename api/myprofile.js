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
        error: "PLAYER_NOT_LINKED",
        message: "Аккаунт Clash Royale не привязан"
      });

    }

    // ==========================================
    // ПОЛУЧАЕМ ТЕГ
    // ==========================================

    const playerTag =
      String(linked[0].player_tag || "")
        .replace(/^#+/, "")
        .trim()
        .toUpperCase();

    if (!playerTag) {

      return res.status(404).json({
        error: "PLAYER_NOT_LINKED",
        message: "Тег Clash Royale не найден"
      });

    }

    // ==========================================
    // ПОЛУЧАЕМ ПРОФИЛЬ CLASH ROYALE
    // ==========================================

    const playerUrl =
      `https://proxy.royaleapi.dev/v1/players/%23${encodeURIComponent(playerTag)}`;

    const playerResponse =
      await fetch(playerUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      });

    const playerText =
      await playerResponse.text();

    let data;

    try {
      data = JSON.parse(playerText);
    } catch {

      return res.status(502).json({
        error: "API вернул не JSON",
        response: playerText
      });

    }

    if (!playerResponse.ok) {

      return res.status(playerResponse.status).json(data);

    }

    // ==========================================
    // ПРОВЕРЯЕМ УЧАСТИЕ В КЛАНЕ
    // ==========================================

    let isClanMember = false;

    try {

      const clanUrl =
        `https://proxy.royaleapi.dev/v1/clans/%23GCGJ9VJV/members`;

      const clanResponse =
        await fetch(clanUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json"
          }
        });

      const clanText =
        await clanResponse.text();

      let clanData;

      try {
        clanData = JSON.parse(clanText);
      } catch {
        clanData = null;
      }

      if (clanResponse.ok && clanData) {

        const members =
          clanData.items || [];

        isClanMember =
          members.some(member => {

            const memberTag =
              String(member.tag || "")
                .replace(/^#+/, "")
                .trim()
                .toUpperCase();

            return memberTag === playerTag;

          });

      }

    } catch (error) {

      console.error(
        "Clan membership check error:",
        error
      );

      isClanMember = false;

    }

    // ==========================================
    // ОБНОВЛЯЕМ PLAYERS
    // ==========================================

    const cleanTag =
      "#" + playerTag;

    const trophies =
      Number(data.trophies || 0);

    const playerName =
      data.name || "";

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

    const lastHistory =
      await sql`
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

    // ==========================================
    // ОТВЕТ
    // ==========================================

    return res.status(200).json({

      ...data,

      telegram: {
        telegram_id: telegramId,
        player_tag: cleanTag,
        player_name: playerName,
        linked: true
      },

      clan: {
        is_member: isClanMember,
        message: isClanMember
          ? "✅ Реальный кент клана!"
          : "😤 Не кент клана."
      },

      neon: {
        saved: true,
        trophy_history: true
      }

    });

  } catch (error) {

    console.error(
      "My profile error:",
      error
    );

    return res.status(500).json({
      error: "Ошибка подключения",
      details: error.message
    });

  }
}
