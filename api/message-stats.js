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

    const MAIN_CHAT_ID =
      "-1003932829286";

    const telegramId =
      String(
        req.query?.telegram_id ||
        req.body?.telegram_id ||
        ""
      ).trim();

    const action =
      String(
        req.query?.action || ""
      ).trim();


    // ==================================================
    // WEEKLY WINNER
    // ==================================================

    if (action === "weekly-winner") {

      const token =
        process.env.TELEGRAM_BOT_TOKEN;

      if (!token) {
        return res.status(500).json({
          error:
            "TELEGRAM_BOT_TOKEN не найден"
        });
      }


      // ================================================
      // ПОСЛЕДНЯЯ ЗАВЕРШЁННАЯ НЕДЕЛЯ
      // ================================================

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


      // ================================================
      // ПРОВЕРЯЕМ, ОБЪЯВЛЯЛАСЬ ЛИ НЕДЕЛЯ
      // ================================================

      const alreadyAnnounced = await sql`
        SELECT *
        FROM weekly_winners
        WHERE
          chat_id = ${MAIN_CHAT_ID}
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


      // ================================================
      // НАХОДИМ ПОБЕДИТЕЛЯ
      // ================================================

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


      // ================================================
      // НЕТ СООБЩЕНИЙ
      // ================================================

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


      // ================================================
      // СОХРАНЯЕМ ПОБЕДИТЕЛЯ
      // ================================================

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
          ${MAIN_CHAT_ID},
          ${displayName},
          ${winner.username || null},
          ${weekStart},
          ${winner.message_count},
          NOW()
        )

        RETURNING *
      `;


      // ================================================
      // СООБЩЕНИЕ В TELEGRAM
      // ================================================

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

              chat_id:
                MAIN_CHAT_ID,

              text:
                telegramText,

              parse_mode:
                "HTML"

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
    }


    // ==================================================
    // НАГРАДА — GET
    // ==================================================

    if (
      req.method === "GET" &&
      action === "reward"
    ) {

      if (!telegramId) {

        return res.status(400).json({
          error:
            "telegram_id обязателен"
        });
      }


      // Последняя победа пользователя

      const winnerResult = await sql`
        SELECT
          id,
          telegram_id,
          chat_id,
          week_start,
          message_count,
          announced_at

        FROM weekly_winners

        WHERE
          telegram_id = ${telegramId}

        ORDER BY
          week_start DESC

        LIMIT 1
      `;


      // Текущая сохранённая награда

      const rewardResult = await sql`
        SELECT
          telegram_id,
          reward_emoji,
          reward_claimed,
          reward_claimed_at,
          updated_at

        FROM player_rewards

        WHERE
          telegram_id = ${telegramId}

        LIMIT 1
      `;


      const winner =
        winnerResult[0] || null;

      const reward =
        rewardResult[0] || null;


      let canChoose = false;


      if (winner) {

        if (!reward) {

          canChoose = true;

        } else if (
          reward.reward_claimed !== true
        ) {

          canChoose = true;

        } else if (
          !reward.reward_claimed_at
        ) {

          canChoose = true;

        } else {

          const claimedAt =
            new Date(
              reward.reward_claimed_at
            );

          const winnerWeek =
            new Date(
              winner.week_start
            );

          /*
           * Если награда была получена
           * до новой победы — новую награду
           * можно выбрать.
           */

          canChoose =
            claimedAt < winnerWeek;
        }
      }


      return res.status(200).json({

        ok: true,

        winner,

        reward,

        can_choose:
          canChoose

      });
    }


    // ==================================================
    // НАГРАДА — POST
    // ==================================================

    if (
      req.method === "POST" &&
      action === "reward"
    ) {

      if (!telegramId) {

        return res.status(400).json({
          error:
            "telegram_id обязателен"
        });
      }


      const emoji =
        String(
          req.body?.emoji || ""
        ).trim();


      if (!emoji) {

        return res.status(400).json({
          error:
            "Смайлик не указан"
        });
      }


      // ================================================
      // ПОСЛЕДНЯЯ ПОБЕДА
      // ================================================

      const winnerResult = await sql`
        SELECT
          id,
          telegram_id,
          chat_id,
          week_start,
          message_count,
          announced_at

        FROM weekly_winners

        WHERE
          telegram_id = ${telegramId}

        ORDER BY
          week_start DESC

        LIMIT 1
      `;


      if (winnerResult.length === 0) {

        return res.status(403).json({

          error:
            "У тебя пока нет победы в статистике."

        });
      }


      const winner =
        winnerResult[0];


      // ================================================
      // ПРОВЕРЯЕМ СТАРУЮ НАГРАДУ
      // ================================================

      const rewardResult = await sql`
        SELECT *

        FROM player_rewards

        WHERE
          telegram_id = ${telegramId}

        LIMIT 1
      `;


      const existingReward =
        rewardResult[0] || null;


      if (
        existingReward &&
        existingReward.reward_claimed === true &&
        existingReward.reward_claimed_at
      ) {

        const claimedAt =
          new Date(
            existingReward.reward_claimed_at
          );

        const winnerWeek =
          new Date(
            winner.week_start
          );


        /*
         * Если награда уже была получена
         * после начала последней победы —
         * повторно выбрать нельзя.
         */

        if (
          claimedAt >= winnerWeek
        ) {

          return res.status(403).json({

            error:
              "Награда за эту победу уже выбрана.",

            reward:
              existingReward.reward_emoji

          });
        }
      }


      // ================================================
      // СОХРАНЯЕМ СМАЙЛИК
      // ================================================

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

          reward_emoji =
            EXCLUDED.reward_emoji,

          reward_claimed =
            TRUE,

          reward_claimed_at =
            NOW(),

          updated_at =
            NOW()

        RETURNING *
      `;


      return res.status(200).json({

        ok: true,

        message:
          "Награда успешно получена.",

        winner,

        reward:
          savedReward[0]

      });
    }


    // ==================================================
    // ОБЫЧНАЯ СТАТИСТИКА
    // ==================================================

    let weeklyMessages = 0;

    let totalMessages = 0;


    // ================================================
    // ТЕКУЩАЯ НЕДЕЛЯ
    // ================================================

    const weekResult = await sql`
      SELECT
        date_trunc(
          'week',
          NOW() AT TIME ZONE 'Europe/Kyiv'
        )::date AS week_start
    `;


    const weekStart =
      weekResult[0].week_start;


    // ================================================
    // СТАТИСТИКА ПОЛЬЗОВАТЕЛЯ
    // ================================================

    if (telegramId) {

      const userStats = await sql`
        SELECT

          COUNT(*) FILTER (
            WHERE
              week_start = ${weekStart}
          ) AS weekly_messages,

          COUNT(*) AS total_messages

        FROM telegram_message_stats

        WHERE
          chat_id = ${MAIN_CHAT_ID}

          AND telegram_id =
            ${telegramId}
      `;


      weeklyMessages =
        Number(
          userStats[0]?.weekly_messages ||
          0
        );


      totalMessages =
        Number(
          userStats[0]?.total_messages ||
          0
        );
    }


    // ================================================
    // ТОП НЕДЕЛИ
    // ================================================

    const weeklyTop = await sql`
      SELECT

        telegram_id,

        MAX(display_name)
          AS display_name,

        MAX(username)
          AS username,

        COUNT(*) AS messages

      FROM telegram_message_stats

      WHERE

        chat_id =
          ${MAIN_CHAT_ID}

        AND week_start =
          ${weekStart}

      GROUP BY
        telegram_id

      ORDER BY
        messages DESC,
        telegram_id ASC

      LIMIT 10
    `;


    // ================================================
    // ПОБЕДИТЕЛЬ ТЕКУЩЕЙ НЕДЕЛИ
    // ================================================

    let winner = null;


    if (weeklyTop.length > 0) {

      const top =
        weeklyTop[0];


      winner = {

        telegram_id:
          String(
            top.telegram_id
          ),

        display_name:
          top.display_name ||
          top.username ||
          "Игрок",

        username:
          top.username ||
          null,

        messages:
          Number(
            top.messages
          )

      };
    }


    // ================================================
    // ТОП ЗА ВСЁ ВРЕМЯ
    // ================================================

    const totalTop = await sql`
      SELECT

        telegram_id,

        MAX(display_name)
          AS display_name,

        MAX(username)
          AS username,

        COUNT(*) AS messages

      FROM telegram_message_stats

      WHERE
        chat_id =
          ${MAIN_CHAT_ID}

      GROUP BY
        telegram_id

      ORDER BY
        messages DESC,
        telegram_id ASC

      LIMIT 10
    `;


    // ================================================
    // ФОРМАТ ТОПА НЕДЕЛИ
    // ================================================

    const weeklyLeaderboard =
      weeklyTop.map(
        (player, index) => ({

          place:
            index + 1,

          telegram_id:
            String(
              player.telegram_id
            ),

          display_name:
            player.display_name ||
            player.username ||
            "Игрок",

          username:
            player.username ||
            null,

          messages:
            Number(
              player.messages
            )

        })
      );


    // ================================================
    // ФОРМАТ ТОПА ЗА ВСЁ ВРЕМЯ
    // ================================================

    const totalLeaderboard =
      totalTop.map(
        (player, index) => ({

          place:
            index + 1,

          telegram_id:
            String(
              player.telegram_id
            ),

          display_name:
            player.display_name ||
            player.username ||
            "Игрок",

          username:
            player.username ||
            null,

          messages:
            Number(
              player.messages
            )

        })
      );


    // ================================================
    // ОТВЕТ
    // ================================================

    return res.status(200).json({

      ok: true,

      telegram_id:
        telegramId || null,

      week: {

        timezone:
          "Europe/Kyiv",

        week_start:
          weekStart

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
        error.message

    });
  }
}


// ==================================================
// ЗАЩИТА HTML
// ==================================================

function escapeHtml(value) {

  return String(value)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );
}
