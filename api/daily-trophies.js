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

    // Получаем текущую дату именно по Киеву
    const kyivDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());

    // Получаем участников клана
    const clanResponse = await fetch(
      `https://proxy.royaleapi.dev/v1/clans/%23${clanTag}`,
      {
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
        error: "Не удалось получить клан",
        details: clanData
      });
    }

    const members = clanData.memberList || [];

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

    return res.status(200).json({
      ok: true,
      timezone: "Europe/Kyiv",
      date: kyivDate,
      members: members.length,
      saved
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,
      error: error.message
    });

  }
}
