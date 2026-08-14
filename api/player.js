import { neon } from "@neondatabase/serverless";


// ==================================================
// COLLECTION LEVEL
// Берём реальное значение напрямую из Clash Royale API
// badges -> CollectionLevel -> progress
// ==================================================

function getCollectionLevel(data) {

  const badges =
    Array.isArray(data.badges)
      ? data.badges
      : [];

  const collectionBadge =
    badges.find(
      badge =>
        badge &&
        badge.name === "CollectionLevel"
    );

  const collectionLevel =
    Number(
      collectionBadge?.progress
    ) || 0;

  return collectionLevel;
}


export default async function handler(req, res) {

  const token =
    process.env.CR_API_TOKEN;


  if (!token) {

    return res.status(500).json({
      error:
        "CR_API_TOKEN не найден в Vercel"
    });

  }


  try {

    const sql =
      neon(process.env.DATABASE_URL);


    // ==========================================
    // TELEGRAM ID
    // ==========================================

    const telegramId =
      String(
        req.query.telegram_id || ""
      ).trim();


    // ==========================================
    // TAG
    // ==========================================

    const tag =
      String(
        req.query.tag || ""
      )
        .replace(/^#+/, "")
        .trim()
        .toUpperCase();


    if (!tag) {

      return res.status(400).json({
        error:
          "Укажи тег игрока"
      });

    }


    // ==========================================
    // CLASH ROYALE API
    // ==========================================

    const url =
      `https://proxy.royaleapi.dev/v1/players/%23${encodeURIComponent(tag)}`;


    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${token}`,

            Accept:
              "application/json"
          }
        }
      );


    const text =
      await response.text();


    let data;

    try {

      data =
        JSON.parse(text);

    } catch {

      return res.status(502).json({
        error:
          "API вернул не JSON",

        response:
          text
      });

    }


    // ==========================================
    // ИГРОК НЕ НАЙДЕН
    // ==========================================

    if (!response.ok) {

      return res.status(
        response.status
      ).json(data);

    }


    // ==========================================
    // COLLECTION LEVEL
    // Реальное значение из Clash Royale API
    // ==========================================

    const collectionLevel =
      getCollectionLevel(data);


    // ==========================================
    // ДАННЫЕ ИГРОКА
    // ==========================================

    const playerTag =
      "#" + tag;

    const trophies =
      Number(
        data.trophies || 0
      );

    const playerName =
      data.name || "";


    // ==========================================
    // СОХРАНЯЕМ В PLAYERS
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
        player_name =
          EXCLUDED.player_name,

        trophies =
          EXCLUDED.trophies,

        wins =
          EXCLUDED.wins,

        losses =
          EXCLUDED.losses,

        updated_at =
          NOW()
    `;


    // ==========================================
    // ИСТОРИЯ КУБКОВ
    // ==========================================

    const lastHistory =
      await sql`
        SELECT trophies
        FROM trophy_history
        WHERE player_tag =
          ${playerTag}
        ORDER BY recorded_at DESC
        LIMIT 1
      `;


    if (
      lastHistory.length === 0 ||
      Number(
        lastHistory[0].trophies
      ) !== trophies
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
    // TELEGRAM
    // ==========================================

    if (telegramId) {

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
          player_tag =
            EXCLUDED.player_tag,

          player_name =
            EXCLUDED.player_name,

          updated_at =
            NOW()
      `;

    }


    // ==========================================
    // ИЩЕМ ВЛАДЕЛЬЦА TELEGRAM
    // ==========================================

    const linkedUser =
      await sql`
        SELECT telegram_id
        FROM telegram_players
        WHERE player_tag =
          ${playerTag}
        LIMIT 1
      `;


    // ==========================================
    // НАГРАДА
    // ==========================================

    let rewardEmoji = null;
    let rewardClaimed = false;
    let rewardTelegramId = null;


    if (linkedUser.length > 0) {

      rewardTelegramId =
        String(
          linkedUser[0].telegram_id
        );

    }


    if (telegramId) {

      rewardTelegramId =
        telegramId;

    }


    if (rewardTelegramId) {

      const rewardResult =
        await sql`
          SELECT
            reward_emoji,
            reward_claimed
          FROM player_rewards
          WHERE telegram_id =
            ${rewardTelegramId}
          LIMIT 1
        `;


      if (rewardResult.length > 0) {

        rewardClaimed =
          rewardResult[0]
            .reward_claimed === true;


        if (rewardClaimed) {

          rewardEmoji =
            rewardResult[0]
              .reward_emoji || null;

        }

      }

    }


    // ==========================================
    // ОТВЕТ
    // ==========================================

    return res.status(200).json({

      ...data,

      tag:
        playerTag,


      // ========================================
      // РЕАЛЬНЫЙ COLLECTION LEVEL
      // ========================================

      collectionLevel:
        collectionLevel,

      collection: {

        level:
          collectionLevel

      },


      reward_emoji:
        rewardEmoji,

      reward_claimed:
        rewardClaimed,


      neon: {

        saved:
          true,

        trophy_history:
          true,

        telegram_linked:
          Boolean(
            linkedUser.length > 0 ||
            telegramId
          ),

        reward_loaded:
          Boolean(
            rewardEmoji
          )

      }

    });


  } catch (error) {

    console.error(
      "Player API error:",
      error
    );


    return res.status(500).json({

      error:
        "Ошибка подключения",

      details:
        error.message

    });

  }

}
