import { neon } from "@neondatabase/serverless";

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


    // ==========================================
    // ПРОВЕРКА ТЕГА
    // ==========================================

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
    // УРОВЕНЬ КОЛЛЕКЦИИ
    //
    // Официальная формула Clash Royale:
    //
    // сумма уровней всех карт
    // +5 за каждую эволюцию
    // +5 за каждого героя
    //
    // ВАЖНО:
    // НЕ используем card.count.
    // count = количество физических карт,
    // а не уровень коллекции.
    // ==========================================

    let collectionLevel = 0;

    const cards =
      Array.isArray(data.cards)
        ? data.cards
        : [];


    // Сумма уровней обычных карт
    for (const card of cards) {

      const level =
        Number(
          card?.level || 0
        );

      collectionLevel +=
        level;

    }


    // ==========================================
    // ЭВОЛЮЦИИ
    //
    // API может отдавать evolutionLevel
    // у карты, если эволюция открыта.
    //
    // Также поддерживаем несколько возможных
    // форматов, чтобы код не ломался.
    // ==========================================

    let evolutionCount = 0;

    for (const card of cards) {

      const evolutionLevel =
        Number(
          card?.evolutionLevel || 0
        );

      const evolutionUnlocked =
        card?.evolution === true ||
        card?.hasEvolution === true ||
        evolutionLevel > 0;

      if (evolutionUnlocked) {

        evolutionCount += 1;

      }

    }


    // ==========================================
    // ГЕРОИ
    //
    // Поддерживаем возможные поля API.
    // ==========================================

    let heroCount = 0;

    if (
      Array.isArray(
        data.heroes
      )
    ) {

      heroCount =
        data.heroes.filter(
          hero =>
            hero &&
            (
              hero.unlocked === true ||
              Number(hero.level || 0) > 0
            )
        ).length;

    }


    // Дополнительная поддержка,
    // если API отдаёт heroes как число

    if (
      heroCount === 0 &&
      Number.isFinite(
        Number(data.heroCount)
      )
    ) {

      heroCount =
        Number(
          data.heroCount
        );

    }


    // ==========================================
    // TOWER TROOPS
    //
    // Если API отдаёт их отдельным массивом,
    // их уровни тоже входят в Collection Level.
    // ==========================================

    const towerCards =
      Array.isArray(data.towerCards)
        ? data.towerCards
        : (
            Array.isArray(data.towerTroops)
              ? data.towerTroops
              : []
          );


    for (const towerCard of towerCards) {

      collectionLevel +=
        Number(
          towerCard?.level || 0
        );

    }


    // ==========================================
    // +5 ЗА ЭВОЛЮЦИЮ
    // +5 ЗА ГЕРОЯ
    // ==========================================

    collectionLevel +=
      evolutionCount * 5;

    collectionLevel +=
      heroCount * 5;


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
    // ПРИВЯЗКА TELEGRAM
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
    // ИЩЕМ НАГРАДУ
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
      // НОВОЕ
      // ========================================

      collectionLevel:
        collectionLevel,

      collection_level:
        collectionLevel,

      evolutionCount:
        evolutionCount,

      heroCount:
        heroCount,

      towerCardsCount:
        towerCards.length,

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
          ),

        collection_level:
          collectionLevel

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
