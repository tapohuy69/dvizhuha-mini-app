import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL);

    const today = new Date();
    const todayDate = today.toISOString().slice(0, 10);

    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const yesterdayDate = yesterday.toISOString().slice(0, 10);

    const stats = await sql`
      SELECT
        today.player_tag,
        today.player_name,
        today.trophies AS today_trophies,
        COALESCE(yesterday.trophies, today.trophies) AS yesterday_trophies,
        today.trophies - COALESCE(yesterday.trophies, today.trophies) AS change
      FROM trophy_daily today
      LEFT JOIN trophy_daily yesterday
        ON yesterday.player_tag = today.player_tag
        AND yesterday.recorded_date = ${yesterdayDate}
      WHERE today.recorded_date = ${todayDate}
      ORDER BY today.trophies DESC
    `;

    return res.status(200).json({
      ok: true,
      date: todayDate,
      compared_with: yesterdayDate,
      players: stats
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,
      error: error.message
    });

  }
}
