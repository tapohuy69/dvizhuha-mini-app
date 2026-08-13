import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {

  try {

    const token =
      process.env.TELEGRAM_BOT_TOKEN;

    const DATABASE_URL =
      process.env.DATABASE_URL;

    if (!token) {
      return res.status(500).json({
        error: "TELEGRAM_BOT_TOKEN не найден"
      });
    }

    if (!DATABASE_URL) {
      return res.status(500).json({
        error: "DATABASE_URL не найден"
      });
    }

    const sql = neon(DATABASE_URL);

    const CHAT_ID =
      "-1003932829286";

    // ==========================================
    // ПОСЛЕДНЯЯ ЗАВЕРШЁННАЯ НЕДЕЛЯ
    // ==========================================

    const weekResult = await sql`
      SELECT
        (
          date_trunc(
            'week',
            NOW() AT TIME ZONE 'Europe/Kyiv'
          )::date
          - INTERVAL '7 days'
        )::date AS week_start
    `;

    const weekStart =
      weekResult[0].week_start;

    // ==========================================
    // ПРОВЕРЯЕМ, ОБЪЯВЛЯЛАСЬ ЛИ ЭТА НЕДЕЛЯ
    // ==========================================

    const alreadyAnnounced = await sql`
      SELECT *
      FROM weekly_winners
      WHERE
        chat_id = ${CHAT_ID}
        AND week_start = ${weekStart}
      LIMIT 1
    `;

    if (alreadyAnnounced.length > 0) {

      return res.status(200).json({

        ok: true,

        already_announced: true,

        week_start:
          weekStart,

        winner:
          alreadyAnnounced[0]

      });

    }

    // ==========================================
    // НАХОДИМ ПОБЕДИТЕЛЯ
    // ==========================================

    const winnerResult = await sql`
      SELECT
        telegram_id,
        MAX(display_name) AS display_name,
        MAX(username) AS username,
        COUNT(*)::int AS message_count

      FROM telegram_message_stats

      WHERE
        chat_id = ${CHAT_ID}
        AND week_start = ${weekStart}

      GROUP BY telegram_id

      ORDER BY
        message_count DESC,
        telegram_id ASC

      LIMIT 1
    `;

    // ==========================================
    // НЕТ СООБЩЕНИЙ
    // ==========================================

    if (winnerResult.length === 0) {

      return res.status(200).json({

        ok: true,

        week_start:
          weekStart,

        winner: null,

        message:
          "За эту неделю сообщений не было."

      });

    }

    const winner =
      winnerResult[0];

    const displayName =
      winner.display_name ||
      winner.username ||
      "Игрок";

    // ==========================================
    // СОХРАНЯЕМ ПОБЕДИТЕЛЯ
    // ==========================================

    const savedWinner = await sql`
      INSERT INTO weekly_winners (
        telegram_id,
        chat_id,
        display_name,
        username,
        week_start,
        message_count,
        announced_at
      )

      VALUES (
        ${String(winner.telegram_id)},
        ${CHAT_ID},
        ${displayName},
        ${winner.username || null},
        ${weekStart},
        ${winner.message_count},
        NOW()
      )

      RETURNING *
    `;

    // ==========================================
    // ОТПРАВЛЯЕМ СООБЩЕНИЕ В TELEGRAM
    // ==========================================

    const telegramText =
      `🏆 <b>Победитель недели!</b>\n\n` +
      `🥇 ${escapeHtml(displayName)}\n` +
      `💬 Сообщений: <b>${winner.message_count}</b>\n\n` +
      `🎁 Победитель получает возможность выбрать ` +
      `любой смайлик себе в ник в Mini App.\n\n` +
      `⚠️ Награда доступна <b>один раз</b> ` +
      `до следующей победы.`;

    const telegramResponse =
      await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({

            chat_id: CHAT_ID,

            text: telegramText,

            parse_mode: "HTML"

          })
        }
      );

    const telegramData =
      await telegramResponse.json();

    if (!telegramResponse.ok) {

      return res.status(500).json({

        ok: false,

        error:
          "Победитель сохранён, но Telegram не отправил сообщение.",

        telegram:
          telegramData,

        winner:
          savedWinner[0]

      });

    }

    // ==========================================
    // ГОТОВО
    // ==========================================

    return res.status(200).json({

      ok: true,

      announced: true,

      week_start:
        weekStart,

      winner:
        savedWinner[0],

      telegram:
        telegramData

    });

  } catch (error) {

    console.error(
      "Weekly winner error:",
      error
    );

    return res.status(500).json({

      ok: false,

      error:
        "Ошибка определения победителя",

      details:
        error.message

    });

  }

}


// ==========================================
// ЗАЩИТА HTML
// ==========================================

function escapeHtml(value) {

  return String(value)

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;")

    .replace(/'/g, "&#039;");

}
