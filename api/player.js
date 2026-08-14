import { neon } from "@neondatabase/serverless";


// ==================================================
// COLLECTION LEVEL
// ==================================================

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}


// --------------------------------------------------
// Проверяем, разблокирована ли форма
// --------------------------------------------------

function isUnlockedForm(value) {

  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  if (typeof value === "string") {

    const text =
      value.trim().toLowerCase();

    if (
      text === "true" ||
      text === "yes" ||
      text === "unlocked"
    ) {
      return true;
    }

    const n =
      Number(text);

    if (Number.isFinite(n)) {
      return n > 0;
    }

  }

  if (typeof value === "object") {

    if (
      value.unlocked === true ||
      value.owned === true ||
      value.active === true
    ) {
      return true;
    }

    if (
      number(value.level) > 0 ||
      number(value.count) > 0
    ) {
      return true;
    }

  }

  return false;
}


// --------------------------------------------------
// Evolution
// --------------------------------------------------

function hasEvolution(card) {

  const possibleValues = [

    card?.evolutionLevel,

    card?.evolution_level,

    card?.evolutionUnlocked,

    card?.evolution_unlocked,

    card?.hasEvolution,

    card?.has_evolution,

    card?.evolution?.level,

    card?.evolution?.count,

    card?.evolution?.unlocked,

    card?.evolution?.owned

  ];

  return possibleValues.some(
    value =>
      isUnlockedForm(value)
  );

}


// --------------------------------------------------
// Hero
// --------------------------------------------------

function hasHero(card) {

  const possibleValues = [

    card?.heroLevel,

    card?.hero_level,

    card?.heroUnlocked,

    card?.hero_unlocked,

    card?.hasHero,

    card?.has_hero,

    card?.hero?.level,

    card?.hero?.count,

    card?.hero?.unlocked,

    card?.hero?.owned

  ];

  return possibleValues.some(
    value =>
      isUnlockedForm(value)
  );

}


// --------------------------------------------------
// Базовый расчёт Collection Level
// --------------------------------------------------

function calculateCollectionLevel(data) {

  const cards =
    Array.isArray(data?.cards)
      ? data.cards
      : [];

  let total = 0;

  let evolutionCount = 0;

  let heroCount = 0;


  for (const card of cards) {

    const level =
      number(
        card?.level
      );

    /*
     * Clash Royale Collection Level
     *
     * Каждый уровень карты = +1
     *
     * Evolution = +5
     * Hero = +5
     */

    if (level > 0) {

      total += level;

    }


    if (
      hasEvolution(card)
    ) {

      evolutionCount++;

    }


    if (
      hasHero(card)
    ) {

      heroCount++;

    }

  }


  total +=
    evolutionCount * 5;

  total +=
    heroCount * 5;


  return {

    level:
      total,

    evolutionCount,

    heroCount,

    cardLevelSum:
      total -
      (
        evolutionCount * 5
      ) -
      (
        heroCount * 5
      )

  };

}


// ==================================================
// ROYALEAPI COLLECTION LEVEL
// ==================================================

async function getRoyaleApiCollectionLevel(
  tag
) {

  try {

    const cleanTag =
      String(tag || "")
        .replace(/^#+/, "")
        .trim()
        .toUpperCase();


    if (!cleanTag) {
      return null;
    }


    const url =
      `https://royaleapi.com/feature/kl?lang=en&q=%23${encodeURIComponent(cleanTag)}`;


    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            Accept:
              "text/html,application/xhtml+xml",

            "User-Agent":
              "Mozilla/5.0"
          }
        }
      );


    if (!response.ok) {
      return null;
    }


    const html =
      await response.text();


    /*
     * RoyaleAPI calculator показывает:
     *
     * After Collection Level: 1571
     */


    const patterns = [

      /After\s+Collection\s+Level\s*:\s*([0-9,]+)/i,

      /Collection\s+Level\s*:\s*([0-9,]+)/i,

      /afterCollectionLevel["']?\s*[:=]\s*["']?([0-9,]+)/i,

      /collectionLevel["']?\s*[:=]\s*["']?([0-9,]+)/i

    ];


    for (
      const pattern of patterns
    ) {

      const match =
        html.match(
          pattern
        );


      if (
        match &&
        match[1]
      ) {

        const value =
          Number(
            String(
              match[1]
            ).replace(
              /,/g,
              ""
            )
          );


        if (
          Number.isFinite(value) &&
          value > 0
        ) {

          return value;

        }

      }

    }


    return null;


  } catch (error) {

    console.warn(
      "RoyaleAPI Collection Level error:",
      error?.message
    );

    return null;

  }

}


// ==================================================
// HANDLER
// ==================================================

export default async function handler(
  req,
  res
) {

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
      neon(
        process.env.DATABASE_URL
      );


    // ==================================================
    // TELEGRAM ID
    // ==================================================

    const telegramId =
      String(
        req.query.telegram_id || ""
      ).trim();


    // ==================================================
    // TAG
    // ==================================================

    const tag =
      String(
        req.query.tag || ""
      )
        .replace(
          /^#+/,
          ""
        )
        .trim()
        .toUpperCase();


    // ==================================================
    // ПРОВЕРКА TAG
    // ==================================================

    if (!tag) {

      return res.status(400).json({

        error:
          "Укажи тег игрока"

      });

    }


    // ==================================================
    // CLASH ROYALE API
    // ==================================================

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


    // ==================================================
    // ИГРОК НЕ НАЙДЕН
    // ==================================================

    if (!response.ok) {

      return res.status(
        response.status
      ).json(
        data
      );

    }


    // ==================================================
    // ДАННЫЕ ИГРОКА
    // ==================================================

    const playerTag =
      "#" + tag;


    const trophies =
      Number(
        data.trophies || 0
      );


    const playerName =
      data.name || "";


    // ==================================================
    // COLLECTION LEVEL
    // ==================================================

    const calculatedCollection =
      calculateCollectionLevel(
        data
      );


    /*
     * Сначала получаем значение
     * из нашего расчёта.
     *
     * Затем пробуем получить
     * фактический Collection Level
     * через RoyaleAPI calculator.
     */


    let collectionLevel =
      calculatedCollection.level;


    const royaleApiLevel =
      await getRoyaleApiCollectionLevel(
        tag
      );


    if (
      royaleApiLevel !== null
    ) {

      collectionLevel =
        royaleApiLevel;

    }


    // ==================================================
    // СОХРАНЯЕМ В PLAYERS
    // ==================================================

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


    // ==================================================
    // ИСТОРИЯ КУБКОВ
    // ==================================================

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


    // ==================================================
    // ПРИВЯЗКА TELEGRAM
    // ==================================================

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


    // ==================================================
    // ИЩЕМ ВЛАДЕЛЬЦА TELEGRAM
    // ==================================================

    const linkedUser =
      await sql`

        SELECT telegram_id

        FROM telegram_players

        WHERE player_tag =
          ${playerTag}

        LIMIT 1

      `;


    // ==================================================
    // НАГРАДА
    // ==================================================

    let rewardEmoji =
      null;


    let rewardClaimed =
      false;


    let rewardTelegramId =
      null;


    if (
      linkedUser.length > 0
    ) {

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


      if (
        rewardResult.length > 0
      ) {

        rewardClaimed =
          rewardResult[0]
            .reward_claimed === true;


        if (
          rewardClaimed
        ) {

          rewardEmoji =
            rewardResult[0]
              .reward_emoji ||
            null;

        }

      }

    }


    // ==================================================
    // ОТВЕТ
    // ==================================================

    return res.status(200).json({

      ...data,


      // ==================================================
      // TAG
      // ==================================================

      tag:
        playerTag,


      // ==================================================
      // COLLECTION LEVEL
      // ==================================================

      collectionLevel:
        collectionLevel,


      // Дополнительная информация
      // для проверки

      collectionLevelCalculated:
        calculatedCollection.level,

      collectionCardLevelSum:
        calculatedCollection.cardLevelSum,

      collectionEvolutionCount:
        calculatedCollection.evolutionCount,

      collectionHeroCount:
        calculatedCollection.heroCount,

      collectionLevelSource:
        royaleApiLevel !== null
          ? "royaleapi"
          : "clash_royale_api_calculation",


      // ==================================================
      // REWARD
      // ==================================================

      reward_emoji:
        rewardEmoji,


      reward_claimed:
        rewardClaimed,


      // ==================================================
      // NEON
      // ==================================================

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
