import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {

  try {

    const DATABASE_URL =
      process.env.DATABASE_URL;

    if (!DATABASE_URL) {
      return res.status(500).json({
        error: "DATABASE_URL не найден"
      });
    }

    const sql = neon(DATABASE_URL);

    // =========================
    // TELEGRAM ID
    // =========================

    const telegramId =
      String(
        req.query?.telegram_id || ""
      ).trim();

    // =========================
    // НАША ГРУППА
    // =========================

    const MAIN_CHAT_ID =
      "-1003932829286";

    // =========================
    // ТЕКУЩАЯ НЕДЕЛЯ
    // ВРЕМЯ КИЕВА
    // =========================

    const weekResult = await sql`
      SELECT
        date_trunc(
          'week',
          NOW() AT TIME ZONE 'Europe/Kyiv'
        )::date AS week_start
    `;

    const weekStart =
      weekResult[0].week_start;

    // =========================
    // СТАТИСТИКА КОНКРЕТНОГО
    // ПОЛЬЗОВАТЕЛЯ
    // =========================

    let weeklyMessages = 0;
    let totalMessages = 0;

    if (telegramId) {

      const userStats = await sql`
        SELECT
          COUNT(*) FILTER (
            WHERE week_start = ${weekStart}
          ) AS weekly_messages,

          COUNT(*) AS total_messages

        FROM telegram_message_stats

        WHERE
          chat_id = ${MAIN_CHAT_ID}
          AND telegram_id = ${telegramId}
      `;

      weeklyMessages =
        Number(
          userStats[0]?.weekly_messages || 0
        );

      totalMessages =
        Number(
          userStats[0]?.total_messages || 0
        );
    }

    // =========================
    // ТОП ТЕКУЩЕЙ НЕДЕЛИ
    // =========================

    const weeklyTop = await sql`
      SELECT
        telegram_id,
        MAX(display_name) AS display_name,
        MAX(username) AS username,
        COUNT(*) AS messages

      FROM telegram_message_stats

      WHERE
        chat_id = ${MAIN_CHAT_ID}
        AND week_start = ${weekStart}

      GROUP BY telegram_id

      ORDER BY messages DESC, telegram_id ASC

      LIMIT 10
    `;

    // =========================
    // ПОБЕДИТЕЛЬ НЕДЕЛИ
    // =========================

    let winner = null;

    if (weeklyTop.length > 0) {

      const top =
        weeklyTop[0];

      winner = {
        telegram_id: String(
          top.telegram_id
        ),

        display_name:
          top.display_name ||
          top.username ||
          "Игрок",

        username:
          top.username || null,

        messages:
          Number(top.messages)
      };
    }

    // =========================
    // ТОП ЗА ВСЁ ВРЕМЯ
    // =========================

    const totalTop = await sql`
      SELECT
        telegram_id,
        MAX(display_name) AS display_name,
        MAX(username) AS username,
        COUNT(*) AS messages

      FROM telegram_message_stats

      WHERE
        chat_id = ${MAIN_CHAT_ID}

      GROUP BY telegram_id

      ORDER BY messages DESC, telegram_id ASC

      LIMIT 10
    `;

    // =========================
    // ФОРМАТИРУЕМ ТОП НЕДЕЛИ
    // =========================

    const weeklyLeaderboard =
      weeklyTop.map(
        (player, index) => ({
          place: index + 1,

          telegram_id:
            String(player.telegram_id),

          display_name:
            player.display_name ||
            player.username ||
            "Игрок",

          username:
            player.username || null,

          messages:
            Number(player.messages)
        })
      );

    // =========================
    // ФОРМАТИРУЕМ ТОП ЗА ВСЁ ВРЕМЯ
    // =========================

    const totalLeaderboard =
      totalTop.map(
        (player, index) => ({
          place: index + 1,

          telegram_id:
            String(player.telegram_id),

          display_name:
            player.display_name ||
            player.username ||
            "Игрок",

          username:
            player.username || null,

          messages:
            Number(player.messages)
        })
      );

    // =========================
    // ОТВЕТ
    // =========================

    return res.status(200).json({

      ok: true,

      telegram_id:
        telegramId || null,

      week: {
        timezone: "Europe/Kyiv",
        week_start: weekStart
      },

      statistics: {
        weekly_messages:
          weeklyMessages,

        total_messages:
          totalMessages
      },

      winner,

      weekly_leaderboard:
        weeklyLeaderboard,

      total_leaderboard:
        totalLeaderboard
    });

  } catch (error) {

    console.error(
      "Message stats error:",
      error
    );

    return res.status(500).json({

      error:
        "Ошибка получения статистики",

      details:
        error.message
    });
  }
}
