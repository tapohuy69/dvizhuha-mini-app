import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL);

    const clanTag = "GCGJ9VJV";
    const token = process.env.CR_API_TOKEN;

    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "CR_API_TOKEN не найден"
      });
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
    // ПОЛУЧАЕМ КЛАН
    // =========================

    const clanResponse = await fetch(
      `https://proxy.royaleapi.dev/v1/clans/%23${clanTag}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

    const clanData = await clanResponse.json();

    if (!clanResponse.ok) {
      return res.status(clanResponse.status).json({
        ok: false,
        error: "Не удалось получить данные клана",
        details: clanData
      });
    }

    const members = clanData.memberList || [];

    // =========================
    // СОХРАНЯЕМ СЕГОДНЯШНИЕ КУБКИ
    // =========================

    let saved = 0;

    for (const member of members) {
      const playerTag = member.tag;
      const playerName = member.name || "";
      const trophies = Number(member.trophies) || 0;

      await sql`
        INSERT INTO trophy_daily (
          player_tag,
          player_name,
          trophies,
          recorded_date
        )
        VALUES (
          ${playerTag},
          ${playerName},
          ${trophies},
          ${kyivDate}
        )
        ON CONFLICT (player_tag, recorded_date)
        DO UPDATE SET
          player_name = EXCLUDED.player_name,
          trophies = EXCLUDED.trophies
      `;

      saved++;
    }

    // =========================
    // НАХОДИМ ВЧЕРАШНЮЮ ДАТУ
    // =========================

    const yesterdayResult = await sql`
      SELECT
        TO_CHAR(
          (${kyivDate}::date - INTERVAL '1 day'),
          'YYYY-MM-DD'
        ) AS yesterday
    `;

    const yesterday = yesterdayResult[0].yesterday;

    // =========================
    // СРАВНИВАЕМ С ВЧЕРА
    // =========================

    const changes = await sql`
      SELECT
        today.player_tag,
        today.player_name,
        today.trophies AS today_trophies,
        yesterday.trophies AS yesterday_trophies,
        today.trophies - yesterday.trophies AS change
      FROM trophy_daily today
      LEFT JOIN trophy_daily yesterday
        ON yesterday.player_tag = today.player_tag
        AND yesterday.recorded_date = ${yesterday}
      WHERE today.recorded_date = ${kyivDate}
      ORDER BY change DESC
    `;

    return res.status(200).json({
      ok: true,
      timezone: "Europe/Kyiv",
      date: kyivDate,
      compared_with: yesterday,
      members: members.length,
      saved,
      players: changes
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
