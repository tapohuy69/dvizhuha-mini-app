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
    // =========================
    // CLASH ROYALE API
    // =========================

    const response = await fetch(
      `https://proxy.royaleapi.dev/v1/clans/%23${encodeURIComponent(clanTag)}`,
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
      return res.status(502).json({
        error: "API вернул не JSON",
        response: text
      });
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // =========================
    // NEON
    // =========================

    const sql = neon(process.env.DATABASE_URL);

    // =========================
    // ПОСЛЕДНИЙ ПОБЕДИТЕЛЬ
    // =========================

    const winnerResult = await sql`
      SELECT
        telegram_id,
        first_name,
        username,
        week_start,
        message_count
      FROM weekly_winners
      ORDER BY week_start DESC
      LIMIT 1
    `;

    let weeklyWinner = null;

    if (winnerResult.length > 0) {
      const winner = winnerResult[0];

      const rewardResult = await sql`
        SELECT
          reward_emoji,
          reward_claimed
        FROM player_rewards
        WHERE telegram_id = ${String(winner.telegram_id)}
        LIMIT 1
      `;

      const reward = rewardResult[0] || null;

      weeklyWinner = {
        telegram_id:
          String(winner.telegram_id),

        display_name:
          winner.first_name ||
          winner.username ||
          "Игрок",

        username:
          winner.username || null,

        week_start:
          winner.week_start,

        message_count:
          Number(winner.message_count) || 0,

        reward_emoji:
          reward?.reward_claimed
            ? reward.reward_emoji
            : null
      };
    }

    // =========================
    // ОТВЕТ
    // =========================

    return res.status(200).json({
      ...data,

      weekly_winner:
        weeklyWinner
    });

  } catch (error) {
    console.error(
      "Clan API error:",
      error
    );

    return res.status(500).json({
      error:
        "Ошибка подключения к Clash Royale API",

      details:
        error.message
    });
  }
}
