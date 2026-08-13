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

    return res.status(200).json({
      ...data,
      neon: {
        saved: members.length
      }
    });

  } catch (error) {
    return res.status(500).json({
      error: "Ошибка подключения",
      details: error.message
    });
  }
}
