import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {

  try {

    const sql = neon(process.env.DATABASE_URL);

    const telegramId =
      String(req.query.telegram_id || "").trim();

    const chatId =
      String(req.query.chat_id || "").trim();


    // ==========================================
    // TELEGRAM ID ОБЯЗАТЕЛЕН
    // ==========================================

    if (!telegramId) {

      return res.status(400).json({
        error: "Telegram ID не найден"
      });

    }


    // ==========================================
    // ТЕКУЩАЯ НЕДЕЛЯ ПО КИЕВСКОМУ ВРЕМЕНИ
    // ==========================================

    const weekData = await sql`
      SELECT
        date_trunc(
          'week',
          NOW() AT TIME ZONE 'Europe/Kyiv'
        ) AS week_start
    `;


    const weekStart =
      weekData[0].week_start;


    // ==========================================
    // МОЯ СТАТИСТИКА ЗА НЕДЕЛЮ
    // ==========================================

    let weeklyQuery;


    if (chatId) {

      weeklyQuery = await sql`
        SELECT COUNT(*) AS count
        FROM message_stats
        WHERE telegram_id = ${telegramId}
          AND chat_id = ${chatId}
          AND (
            message_date AT TIME ZONE 'Europe/Kyiv'
          ) >= ${weekStart}
      `;

    } else {

      weeklyQuery = await sql`
        SELECT COUNT(*) AS count
        FROM message_stats
        WHERE telegram_id = ${telegramId}
          AND (
            message_date AT TIME ZONE 'Europe/Kyiv'
          ) >= ${weekStart}
      `;

    }


    const weeklyMessages =
      Number(
        weeklyQuery[0]?.count || 0
      );


    // ==========================================
    // ВСЕ СООБЩЕНИЯ
    // ==========================================

    let totalQuery;


    if (chatId) {

      totalQuery = await sql`
        SELECT COUNT(*) AS count
        FROM message_stats
        WHERE telegram_id = ${telegramId}
          AND chat_id = ${chatId}
      `;

    } else {

      totalQuery = await sql`
        SELECT COUNT(*) AS count
        FROM message_stats
        WHERE telegram_id = ${telegramId}
      `;

    }


    const totalMessages =
      Number(
        totalQuery[0]?.count || 0
      );


    // ==========================================
    // ПОБЕДИТЕЛЬ НЕДЕЛИ
    // ==========================================

    let winnerQuery;


    if (chatId) {

      winnerQuery = await sql`
        SELECT
          telegram_id,
          COUNT(*) AS message_count
        FROM message_stats
        WHERE chat_id = ${chatId}
          AND (
            message_date AT TIME ZONE 'Europe/Kyiv'
          ) >= ${weekStart}
        GROUP BY telegram_id
        ORDER BY message_count DESC
        LIMIT 1
      `;

    } else {

      winnerQuery = await sql`
        SELECT
          telegram_id,
          COUNT(*) AS message_count
        FROM message_stats
        WHERE (
          message_date AT TIME ZONE 'Europe/Kyiv'
        ) >= ${weekStart}
        GROUP BY telegram_id
        ORDER BY message_count DESC
        LIMIT 1
      `;

    }


    let winner = null;


    if (winnerQuery.length > 0) {

      winner = {

        telegram_id:
          String(
            winnerQuery[0].telegram_id
          ),

        message_count:
          Number(
            winnerQuery[0].message_count
          )

      };

    }


    // ==========================================
    // ОТВЕТ
    // ==========================================

    return res.status(200).json({

      ok: true,

      telegram_id: telegramId,

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

      winner

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
