import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  try {
    const DATABASE_URL = process.env.DATABASE_URL;

    if (!DATABASE_URL) {
      return res.status(500).json({
        ok: false,
        error: "DATABASE_URL не найден"
      });
    }

    const sql = neon(DATABASE_URL);

    // ==================================================
    // ОСНОВНОЙ TELEGRAM ЧАТ
    // ==================================================

    const MAIN_CHAT_ID = "-1003932829286";

    // ==================================================
    // ПОЛУЧАЕМ ПАРАМЕТРЫ
    // ==================================================

    const telegramId = String(
      req.query?.telegram_id ||
      req.body?.telegram_id ||
      ""
    ).trim();

    const action = String(
      req.query?.action ||
      req.body?.action ||
      ""
    ).trim();

    // ==================================================
    // WEEK START
    // Понедельник = начало недели
    // ==================================================

    const weekResult = await sql`
      SELECT
        date_trunc(
          'week',
          NOW() AT TIME ZONE 'Europe/Kyiv'
        )::date AS week_start
    `;

    const currentWeekStart = weekResult[0].week_start;

    // ==================================================
    // WEEKLY WINNER
    // ==================================================

    if (action === "weekly-winner") {
      const token = process.env.TELEGRAM_BOT_TOKEN;

      if (!token) {
        return res.status(500).json({
          ok: false,
          error: "TELEGRAM_BOT_TOKEN не найден"
        });
      }

      // --------------------------------------------------
      // Последняя завершённая неделя
      // --------------------------------------------------

      const previousWeekResult = await sql`
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
        previousWeekResult[0].week_start;

      // --------------------------------------------------
      // Проверяем, был ли уже победитель
      // --------------------------------------------------

      const alreadyAnnounced = await sql`
        SELECT *
        FROM weekly_winners
        WHERE week_start = ${weekStart}
        ORDER BY id DESC
        LIMIT 1
      `;

      if (alreadyAnnounced.length > 0) {
        return res.status(200).json({
          ok: true,
          already_announced: true,
          week_start: weekStart,
          winner: alreadyAnnounced[0]
        });
      }

      // --------------------------------------------------
      // Ищем победителя
      // --------------------------------------------------

      const winnerResult = await sql`
        SELECT
          telegram_id,
          MAX(display_name) AS display_name,
          MAX(username) AS username,
          COUNT(*)::int AS message_count
        FROM telegram_message_stats
        WHERE
          chat_id = ${MAIN_CHAT_ID}
          AND week_start = ${weekStart}
        GROUP BY telegram_id
        ORDER BY
          message_count DESC,
          telegram_id ASC
        LIMIT 1
      `;

      // --------------------------------------------------
      // Сообщений не было
      // --------------------------------------------------

      if (winnerResult.length === 0) {
        return res.status(200).json({
          ok: true,
          week_start: weekStart,
          winner: null,
          message: "За эту неделю сообщений не было."
        });
      }

      const winner = winnerResult[0];

      const displayName =
        winner.display_name ||
        winner.username ||
        "Игрок";

      // --------------------------------------------------
      // Дата окончания недели
      // --------------------------------------------------

      const weekEndResult = await sql`
        SELECT
          (
            ${weekStart}::date
            + INTERVAL '6 days'
          )::date AS week_end
      `;

      const weekEnd = weekEndResult[0].week_end;

      // --------------------------------------------------
      // Сохраняем победителя
      //
      // Используем РЕАЛЬНУЮ структуру weekly_winners
      // --------------------------------------------------

      const savedWinner = await sql`
        INSERT INTO weekly_winners (
          telegram_id,
          username,
          first_name,
          week_start,
          week_end,
          message_count,
          reward_claimed,
          emoji,
          created_at
        )
        VALUES (
          ${String(winner.telegram_id)},
          ${winner.username || null},
          ${displayName},
          ${weekStart},
          ${weekEnd},
          ${winner.message_count},
          FALSE,
          NULL,
          NOW()
        )
        RETURNING *
      `;

      // --------------------------------------------------
      // Сообщение в Telegram
      // --------------------------------------------------

      const telegramText =
        `🏆 <b>Победитель недели!</b>\n\n` +
        `🥇 ${escapeHtml(displayName)}\n` +
        `💬 Сообщений: <b>${winner.message_count}</b>\n\n` +
        `🎁 Победитель получает возможность выбрать ` +
        `любой смайлик себе в ник в Mini App.\n\n` +
        `⚠️ Награда доступна один раз.`;

      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: MAIN_CHAT_ID,
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
          telegram: telegramData,
          winner: savedWinner[0]
        });
      }

      return res.status(200).json({
        ok: true,
        announced: true,
        week_start: weekStart,
        winner: savedWinner[0],
        telegram: telegramData
      });
    }

    // ==================================================
    // REWARD — GET
    // ==================================================

    if (
      req.method === "GET" &&
      action === "reward"
    ) {
      if (!telegramId) {
        return res.status(400).json({
          ok: false,
          error: "telegram_id обязателен"
        });
      }

      // --------------------------------------------------
      // Последняя победа пользователя
      // --------------------------------------------------

      const winnerResult = await sql`
        SELECT
          id,
          telegram_id,
          username,
          first_name,
          week_start,
          week_end,
          message_count,
          reward_claimed,
          emoji,
          created_at
        FROM weekly_winners
        WHERE telegram_id = ${telegramId}
        ORDER BY week_start DESC, id DESC
        LIMIT 1
      `;

      // --------------------------------------------------
      // Награда пользователя
      // --------------------------------------------------

      const rewardResult = await sql`
        SELECT
          telegram_id,
          reward_emoji,
          reward_claimed,
          reward_claimed_at,
          updated_at
        FROM player_rewards
        WHERE telegram_id = ${telegramId}
        LIMIT 1
      `;

      const winner =
        winnerResult[0] || null;

      const reward =
        rewardResult[0] || null;

      // --------------------------------------------------
      // Победы нет
      // --------------------------------------------------

      if (!winner) {
        return res.status(200).json({
          ok: true,
          winner: null,
          reward,
          can_choose: false,
          message:
            "У тебя пока нет доступной награды."
        });
      }

      // --------------------------------------------------
      // Проверяем, можно ли выбрать награду
      // --------------------------------------------------

      let canChoose = true;

      if (
        winner.reward_claimed === true
      ) {
        canChoose = false;
      }

      if (
        reward &&
        reward.reward_claimed === true &&
        reward.reward_claimed_at
      ) {
        const claimedAt =
          new Date(
            reward.reward_claimed_at
          );

        const winnerWeek =
          new Date(
            winner.week_start
          );

        if (claimedAt >= winnerWeek) {
          canChoose = false;
        }
      }

      return res.status(200).json({
        ok: true,
        winner,
        reward,
        can_choose: canChoose
      });
    }

    // ==================================================
    // REWARD — POST
    // ==================================================

    if (
      req.method === "POST" &&
      action === "reward"
    ) {
      if (!telegramId) {
        return res.status(400).json({
          ok: false,
          error: "telegram_id обязателен"
        });
      }

      const emoji = String(
        req.body?.emoji || ""
      ).trim();

      if (!emoji) {
        return res.status(400).json({
          ok: false,
          error: "Смайлик не указан"
        });
      }

      // --------------------------------------------------
      // Последняя победа
      // --------------------------------------------------

      const winnerResult = await sql`
        SELECT
          id,
          telegram_id,
          username,
          first_name,
          week_start,
          week_end,
          message_count,
          reward_claimed,
          emoji,
          created_at
        FROM weekly_winners
        WHERE telegram_id = ${telegramId}
        ORDER BY week_start DESC, id DESC
        LIMIT 1
      `;

      if (winnerResult.length === 0) {
        return res.status(403).json({
          ok: false,
          error:
            "У тебя пока нет победы в статистике."
        });
      }

      const winner =
        winnerResult[0];

      // --------------------------------------------------
      // Уже получена награда за эту победу?
      // --------------------------------------------------

      if (winner.reward_claimed === true) {
        return res.status(403).json({
          ok: false,
          error:
            "Награда за эту победу уже выбрана.",
          reward:
            winner.emoji || null
        });
      }

      // --------------------------------------------------
      // Сохраняем награду в player_rewards
      // --------------------------------------------------

      const savedReward = await sql`
        INSERT INTO player_rewards (
          telegram_id,
          reward_emoji,
          reward_claimed,
          reward_claimed_at,
          updated_at
        )
        VALUES (
          ${telegramId},
          ${emoji},
          TRUE,
          NOW(),
          NOW()
        )
        ON CONFLICT (telegram_id)
        DO UPDATE SET
          reward_emoji = EXCLUDED.reward_emoji,
          reward_claimed = TRUE,
          reward_claimed_at = NOW(),
          updated_at = NOW()
        RETURNING *
      `;

      // --------------------------------------------------
      // Помечаем конкретную победу как использованную
      // --------------------------------------------------

      const updatedWinner = await sql`
        UPDATE weekly_winners
        SET
          reward_claimed = TRUE,
          emoji = ${emoji}
        WHERE id = ${winner.id}
        RETURNING *
      `;

      return res.status(200).json({
        ok: true,
        message:
          "Награда успешно получена.",
        winner:
          updatedWinner[0],
        reward:
          savedReward[0]
      });
    }

    // ==================================================
    // ОБЫЧНАЯ СТАТИСТИКА
    // ==================================================

    let weeklyMessages = 0;
    let totalMessages = 0;

    // --------------------------------------------------
    // Статистика пользователя
    // --------------------------------------------------

    if (telegramId) {
      const userStats = await sql`
        SELECT
          COUNT(*) FILTER (
            WHERE week_start = ${currentWeekStart}
          )::int AS weekly_messages,

          COUNT(*)::int AS total_messages

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

    // --------------------------------------------------
    // Топ текущей недели
    // --------------------------------------------------

    const weeklyTop = await sql`
      SELECT
        telegram_id,
        MAX(display_name) AS display_name,
        MAX(username) AS username,
        COUNT(*)::int AS messages

      FROM telegram_message_stats

      WHERE
        chat_id = ${MAIN_CHAT_ID}
        AND week_start = ${currentWeekStart}

      GROUP BY telegram_id

      ORDER BY
        messages DESC,
        telegram_id ASC

      LIMIT 10
    `;

    // --------------------------------------------------
    // Текущий лидер недели
    // --------------------------------------------------

    let winner = null;

    if (weeklyTop.length > 0) {
      const top = weeklyTop[0];

      winner = {
        telegram_id:
          String(top.telegram_id),

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

    // --------------------------------------------------
    // Топ за всё время
    // --------------------------------------------------

    const totalTop = await sql`
      SELECT
        telegram_id,
        MAX(display_name) AS display_name,
        MAX(username) AS username,
        COUNT(*)::int AS messages

      FROM telegram_message_stats

      WHERE chat_id = ${MAIN_CHAT_ID}

      GROUP BY telegram_id

      ORDER BY
        messages DESC,
        telegram_id ASC

      LIMIT 10
    `;

    // --------------------------------------------------
    // Формируем топ недели
    // --------------------------------------------------

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

    // --------------------------------------------------
    // Формируем топ за всё время
    // --------------------------------------------------

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

    // ==================================================
    // ОТВЕТ
    // ==================================================

    return res.status(200).json({
      ok: true,

      telegram_id:
        telegramId || null,

      week: {
        timezone:
          "Europe/Kyiv",

        week_start:
          currentWeekStart
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
      ok: false,

      error:
        "Ошибка работы со статистикой",

      details:
        error?.message ||
        String(error)
    });
  }
}

// ==================================================
// HTML ESCAPE
// ==================================================

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
