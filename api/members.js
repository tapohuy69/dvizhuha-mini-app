import { neon } from "@neondatabase/serverless";


// ==================================================
// COLLECTION LEVEL
// ==================================================

function calculateCollectionLevel(data) {

  let cardLevels = 0;
  let towerTroopLevels = 0;
  let evolutions = 0;
  let heroes = 0;


  // ==========================================
  // ОБЫЧНЫЕ КАРТЫ
  // ==========================================

  const cards =
    Array.isArray(data.cards)
      ? data.cards
      : [];


  for (const card of cards) {

    cardLevels +=
      Number(card?.level) || 0;


    const evolutionLevel =
      Number(card?.evolutionLevel) || 0;


    if (evolutionLevel > 0) {

      evolutions++;

    }

  }


  // ==========================================
  // TOWER TROOPS
  // ==========================================

  const supportCards =
    Array.isArray(data.supportCards)
      ? data.supportCards
      : [];


  for (const card of supportCards) {

    towerTroopLevels +=
      Number(card?.level) || 0;

  }


  // ==========================================
  // HEROES
  // ==========================================

  if (
    Array.isArray(data.heroes)
  ) {

    heroes =
      data.heroes.filter(
        hero =>
          hero &&
          (
            hero.unlocked === true ||
            Number(hero.level) > 0
          )
      ).length;

  } else if (
    Array.isArray(data.heroCards)
  ) {

    heroes =
      data.heroCards.filter(
        hero =>
          hero &&
          (
            hero.unlocked === true ||
            Number(hero.level) > 0
          )
      ).length;

  }


  // ==========================================
  // ИТОГ
  // ==========================================

  const collectionLevel =
    cardLevels +
    towerTroopLevels +
    (evolutions * 5) +
    (heroes * 5);


  return {
    collectionLevel,
    cardLevels,
    towerTroopLevels,
    evolutions,
    heroes
  };

}


// ==================================================
// ПОЛУЧИТЬ ПРОФИЛЬ ИГРОКА
// ==================================================

async function getPlayer(
  tag,
  token
) {

  const cleanTag =
    String(tag || "")
      .replace(/^#+/, "")
      .trim()
      .toUpperCase();


  if (!cleanTag) {
    return null;
  }


  const response =
    await fetch(
      `https://proxy.royaleapi.dev/v1/players/%23${encodeURIComponent(cleanTag)}`,
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


  if (!response.ok) {

    return null;

  }


  const text =
    await response.text();


  try {

    return JSON.parse(text);

  } catch {

    return null;

  }

}


export default async function handler(req, res) {

  const clanTag =
    (req.query.tag || "#GCGJ9VJV")
      .replace("#", "")
      .trim()
      .toUpperCase();


  const token =
    process.env.CR_API_TOKEN;


  if (!token) {

    return res.status(500).json({

      error:
        "CR_API_TOKEN не найден в Vercel"

    });

  }


  try {

    const response =
      await fetch(

        `https://proxy.royaleapi.dev/v1/clans/%23${encodeURIComponent(clanTag)}/members`,

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

      data = {

        error:
          "API вернул не JSON",

        response:
          text

      };

    }


    if (!response.ok) {

      return res.status(
        response.status
      ).json(data);

    }


    const sql =
      neon(process.env.DATABASE_URL);


    // ==========================================
    // НАХОДИМ КЛАН
    // ==========================================

    const clanResult =
      await sql`

        SELECT id

        FROM clan

        WHERE clan_tag =
          ${"#" + clanTag}

        LIMIT 1

      `;


    if (
      clanResult.length === 0
    ) {

      return res.status(500).json({

        error:
          "Клан не найден в Neon",

        clan_tag:
          "#" + clanTag

      });

    }


    const clanId =
      clanResult[0].id;


    const members =
      Array.isArray(data.items)
        ? data.items
        : [];


    // ==========================================
    // СОХРАНЯЕМ УЧАСТНИКОВ
    // ==========================================

    for (const member of members) {

      await sql`

        INSERT INTO players (

          player_tag,
          player_name,
          trophies,
          clan_id,
          updated_at

        )

        VALUES (

          ${member.tag || ""},
          ${member.name || ""},
          ${member.trophies || 0},
          ${clanId},
          NOW()

        )

        ON CONFLICT (player_tag)

        DO UPDATE SET

          player_name =
            EXCLUDED.player_name,

          trophies =
            EXCLUDED.trophies,

          clan_id =
            EXCLUDED.clan_id,

          updated_at =
            NOW()

      `;

    }


    // ==========================================
    // ДАТА ПО КИЕВУ
    // ==========================================

    const now =
      new Date();


    const kyivDate =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            "Europe/Kyiv",

          year:
            "numeric",

          month:
            "2-digit",

          day:
            "2-digit"
        }
      ).format(now);


    // ==========================================
    // ВЧЕРА
    // ==========================================

    const yesterdayResult =
      await sql`

        SELECT TO_CHAR(

          (${kyivDate}::date -
            INTERVAL '1 day'),

          'YYYY-MM-DD'

        ) AS yesterday

      `;


    const yesterday =
      yesterdayResult[0].yesterday;


    // ==========================================
    // ФОРМИРУЕМ УЧАСТНИКОВ
    // ==========================================

    const resultMembers = [];


    for (const member of members) {

      const playerTag =
        member.tag || "";


      const todayTrophies =
        Number(
          member.trophies
        ) || 0;


      // ========================================
      // ИЗМЕНЕНИЕ КУБКОВ
      // ========================================

      const history =
        await sql`

          SELECT trophies

          FROM trophy_daily

          WHERE player_tag =
            ${playerTag}

            AND recorded_date =
              ${yesterday}

          LIMIT 1

        `;


      let dailyChange =
        null;


      if (
        history.length > 0
      ) {

        const yesterdayTrophies =
          Number(
            history[0].trophies
          ) || 0;


        dailyChange =
          todayTrophies -
          yesterdayTrophies;

      }


      // ========================================
      // TELEGRAM
      // ========================================

      const telegramPlayer =
        await sql`

          SELECT telegram_id

          FROM telegram_players

          WHERE player_tag =
            ${playerTag}

          LIMIT 1

        `;


      let rewardEmoji =
        null;


      if (
        telegramPlayer.length > 0
      ) {

        const telegramId =
          String(
            telegramPlayer[0].telegram_id
          );


        const reward =
          await sql`

            SELECT reward_emoji

            FROM player_rewards

            WHERE telegram_id =
              ${telegramId}

              AND reward_claimed =
                TRUE

              AND reward_emoji IS NOT NULL

            LIMIT 1

          `;


        if (
          reward.length > 0
        ) {

          rewardEmoji =
            reward[0].reward_emoji;

        }

      }


      // ========================================
      // ПОЛУЧАЕМ ПОЛНЫЙ ПРОФИЛЬ
      // ========================================

      const playerData =
        await getPlayer(
          playerTag,
          token
        );


      let collection = {

        collectionLevel:
          null,

        cardLevels:
          0,

        towerTroopLevels:
          0,

        evolutions:
          0,

        heroes:
          0

      };


      if (playerData) {

        collection =
          calculateCollectionLevel(
            playerData
          );

      }


      // ========================================
      // РЕЗУЛЬТАТ
      // ========================================

      resultMembers.push({

        ...member,


        // ======================================
        // ГЛАВА / РОЛИ
        // ======================================

        role:
          member.role || "MEMBER",


        isLeader:
          member.role === "LEADER",


        // ======================================
        // COLLECTION LEVEL
        // ======================================

        collectionLevel:
          collection.collectionLevel,


        collection: {

          level:
            collection.collectionLevel,

          card_levels:
            collection.cardLevels,

          tower_troop_levels:
            collection.towerTroopLevels,

          evolutions:
            collection.evolutions,

          heroes:
            collection.heroes

        },


        dailyChange,


        reward_emoji:
          rewardEmoji

      });

    }


    // ==========================================
    // ОТВЕТ
    // ==========================================

    return res.status(200).json({

      ...data,


      items:
        resultMembers,


      neon: {

        saved:
          members.length

      },


      daily: {

        timezone:
          "Europe/Kyiv",

        date:
          kyivDate,

        compared_with:
          yesterday

      }

    });


  } catch (error) {

    console.error(
      "Members API error:",
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
