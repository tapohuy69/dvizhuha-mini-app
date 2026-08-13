import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {

  const token = process.env.CR_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "CR_API_TOKEN не найден в Vercel"
    });
  }

  const sql = neon(process.env.DATABASE_URL);

  const telegramId =
    String(req.query.telegram_id || "").trim();

  const tag =
    String(req.query.tag || "")
      .replace(/^#+/, "")
      .trim()
      .toUpperCase();


  // ==========================================
  // ПОЛУЧЕНИЕ ПРОФИЛЯ CLASH ROYALE
  // ==========================================

  async function getPlayer(playerTag) {

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

      return {
        ok: false,
        status: 502,
        data: {
          error: "API вернул не JSON",
          response: text
        }
      };

    }

    if (!response.ok) {

      return {
        ok: false,
        status: response.status,
        data
      };

    }

    return {
      ok: true,
      status: 200,
      data
    };
  }


  // ==========================================
  // ПРОВЕРКА ЧЛЕНСТВА В КЛАНЕ
  // ==========================================

  async function checkClanMember(playerTag) {

    const clanTag = "GCGJ9VJV";

    const url =
      `https://proxy.royaleapi.dev/v1/clans/%23${clanTag}`;

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

    let clanData;

    try {

      clanData = JSON.parse(text);

    } catch {

      return {
        isMember: false,
        checked: false
      };

    }

    if (!response.ok) {

      return {
        isMember: false,
        checked: false
      };

    }

    const members =
      Array.isArray(clanData.memberList)
        ? clanData.memberList
        : [];

    const cleanPlayerTag =
      String(playerTag)
        .replace(/^#+/, "")
        .trim()
        .toUpperCase();


    const found =
      members.find(member => {

        const memberTag =
          String(member.tag || "")
            .replace(/^#+/, "")
            .trim()
            .toUpperCase();

        return memberTag === cleanPlayerTag;

      });


    return {
      isMember: Boolean(found),
      checked: true,

      clan: {
        tag: "#" + clanTag,
        name: clanData.name || "Движуха"
      }
    };
  }


  try {

    // ==========================================
    // МОЙ ПРОФИЛЬ
    // Telegram ID → Clash Royale TAG
    // ==========================================

    if (telegramId && !tag) {

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
          message: "Аккаунт Clash Royale не привязан",
          telegram_id: telegramId
        });

      }


      const playerTag =
        String(linked[0].player_tag || "")
          .replace(/^#+/, "")
          .trim()
          .toUpperCase();


      if (!playerTag) {

        return res.status(404).json({
          error: "PLAYER_NOT_LINKED"
        });

      }


      const playerResult =
        await getPlayer(playerTag);


      if (!playerResult.ok) {

        return res
          .status(playerResult.status)
          .json(playerResult.data);

      }


      const data =
        playerResult.data;


      // Проверяем членство в клане
      const clanStatus =
        await checkClanMember(playerTag);


      return res.status(200).json({

        ...data,

        clan_membership: {

          is_member:
            clanStatus.isMember,

          checked:
            clanStatus.checked,

          message:
            clanStatus.isMember
              ? "✅ Реальный кент клана!"
              : "😤 Не кент клана.",

          clan:
            clanStatus.clan || null

        },

        telegram: {

          telegram_id:
            telegramId,

          player_tag:
            "#" + playerTag,

          player_name:
            data.name || linked[0].player_name || "",

          linked: true

        }

      });

    }


    // ==========================================
    // ПОИСК ЛЮБОГО ИГРОКА ПО ТЕГУ
    // ==========================================

    if (!tag) {

      return res.status(400).json({
        error: "Укажи тег игрока"
      });

    }


    const playerResult =
      await getPlayer(tag);


    if (!playerResult.ok) {

      return res
        .status(playerResult.status)
        .json(playerResult.data);

    }


    const data =
      playerResult.data;


    // Проверяем членство в клане
    const clanStatus =
      await checkClanMember(tag);


    const playerTag =
      "#" + tag;


    const trophies =
      Number(data.trophies || 0);

    const playerName =
      data.name || "";


    // ==========================================
    // СОХРАНЯЕМ ИГРОКА В PLAYERS
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
    // ЕСЛИ ПЕРЕДАН TELEGRAM ID —
    // ПРИВЯЗЫВАЕМ АККАУНТ
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
    // ОТВЕТ
    // ==========================================

    return res.status(200).json({

      ...data,

      tag:
        playerTag,

      clan_membership: {

        is_member:
          clanStatus.isMember,

        checked:
          clanStatus.checked,

        message:
          clanStatus.isMember
            ? "✅ Реальный кент клана!"
            : "😤 Не кент клана.",

        clan:
          clanStatus.clan || null

      },

      neon: {

        saved: true,

        trophy_history: true,

        telegram_linked:
          Boolean(telegramId)

      }

    });


  } catch (error) {

    console.error(
      "My profile error:",
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
