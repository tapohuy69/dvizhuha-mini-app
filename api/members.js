import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  const clanTag = (req.query.tag || "#GCGJ9VJV")
    .replace("#", "")
    .trim()
    .toUpperCase();

  const token = process.env.CR_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "CR_API_TOKEN не найден в Vercel"
    });
  }

  try {
    const response = await fetch(
      `https://proxy.royaleapi.dev/v1/clans/%23${encodeURIComponent(clanTag)}/members`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        error: "API вернул не JSON",
        response: text
      };
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const sql = neon(process.env.DATABASE_URL);

    const clanResult = await sql`
      SELECT id
      FROM clan
      WHERE clan_tag = ${"#" + clanTag}
      LIMIT 1
    `;

    if (clanResult.length === 0) {
      return res.status(500).json({
        error: "Клан не найден в Neon",
        clan_tag: "#" + clanTag
      });
    }

    const clanId = clanResult[0].id;

    const members = Array.isArray(data.items) ? data.items : [];

    // =========================
    // СОХРАНЯЕМ АКТУАЛЬНЫЕ ДАННЫЕ
    // =========================

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
          player_name = EXCLUDED.player_name,
          trophies = EXCLUDED.trophies,
          clan_id = EXCLUDED.clan_id,
          updated_at = NOW()
      `;
    }

    // =========================
    // ДАТА ПО КИЕВУ
    // =========================

    const now = new Date();

    const kyivDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);

    // =========================
    // ВЧЕРАШНЯЯ ДАТА
    // =========================

    const yesterdayResult = await sql`
      SELECT TO_CHAR(
        (${kyivDate}::date - INTERVAL '1 day'),
        'YYYY-MM-DD'
      ) AS yesterday
    `;

    const yesterday = yesterdayResult[0].yesterday;

    // =========================
    // ДОБАВЛЯЕМ ИЗМЕНЕНИЕ ЗА СУТКИ
    // =========================

    const resultMembers = [];

    for (const member of members) {
      const playerTag = member.tag || "";
      const todayTrophies = Number(member.trophies) || 0;

      const history = await sql`
        SELECT trophies
        FROM trophy_daily
        WHERE player_tag = ${playerTag}
          AND recorded_date = ${yesterday}
        LIMIT 1
      `;

      let dailyChange = null;

      if (history.length > 0) {
        const yesterdayTrophies = Number(history[0].trophies) || 0;
        dailyChange = todayTrophies - yesterdayTrophies;
      }

      resultMembers.push({
        ...member,
        dailyChange
      });
    }

    return res.status(200).json({
      ...data,
      items: resultMembers,
      neon: {
        saved: members.length
      },
      daily: {
        timezone: "Europe/Kyiv",
        date: kyivDate,
        compared_with: yesterday
      }
    });

  } catch (error) {
    return res.status(500).json({
      error: "Ошибка подключения",
      details: error.message
    });
  }
}
