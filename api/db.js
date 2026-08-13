import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL);

    const result = await sql`
      SELECT
        current_database() AS database,
        NOW() AS time
    `;

    return res.status(200).json({
      ok: true,
      database: result[0].database,
      time: result[0].time
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
