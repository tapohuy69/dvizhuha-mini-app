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
        req.query?.telegram_id ||
        req.body?.telegram_id ||
        ""
      ).trim();

    if (!telegramId) {

      return res.status(400).json({
        error: "telegram_id обязателен"
      });

    }

    // =========================
    // GET
    // Проверяем награду
    // =========================

    if (req.method === "GET") {

      const winnerResult = await sql`
        SELECT
          id,
          telegram_id,
          week_start,
          message_count
        FROM weekly_winners
        WHERE telegram_id = ${telegramId}
        ORDER BY week_start DESC
        LIMIT 1
      `;

      const rewardResult = await sql`
        SELECT
          telegram_id,
          reward_emoji,
          reward_claimed,
          reward_claimed_at
        FROM player_rewards
        WHERE telegram_id = ${telegramId}
        LIMIT 1
      `;

      const winner =
        winnerResult[0] || null;

      const reward =
        rewardResult[0] || null;

      return res.status(200).json({

        ok: true,

        winner,

        reward,

        can_choose:

          Boolean(winner) &&
          (
            !reward ||
            reward.reward_claimed !== true
          )

      });

    }

    // =========================
    // POST
    // Выбор смайлика
    // =========================

    if (req.method === "POST") {

      const emoji =
        String(
          req.body?.emoji || ""
        ).trim();

      if (!emoji) {

        return res.status(400).json({
          error: "Смайлик не указан"
        });

      }

      // =========================
      // ПРОВЕРЯЕМ ПОБЕДИТЕЛЯ
      // =========================

      const winnerResult = await sql`
        SELECT
          id,
          telegram_id,
          week_start,
          message_count
        FROM weekly_winners
        WHERE telegram_id = ${telegramId}
        ORDER BY week_start DESC
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

      // =========================
      // ПРОВЕРЯЕМ НАГРАДУ
      // =========================

      const rewardResult = await sql`
        SELECT *
        FROM player_rewards
        WHERE telegram_id = ${telegramId}
        LIMIT 1
      `;

      const existingReward =
        rewardResult[0] || null;

      // =========================
      // УЖЕ ПОЛУЧАЛ НАГРАДУ
      // =========================

      if (
        existingReward &&
        existingReward.reward_claimed === true
      ) {

        return res.status(403).json({

          error:
            "Награда за эту победу уже выбрана.",

          reward:
            existingReward.reward_emoji

        });

      }

      // =========================
      // СОХРАНЯЕМ СМАЙЛИК
      // =========================

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

    return res.status(405).json({
      error: "Метод не поддерживается"
    });

  } catch (error) {

    console.error(
      "Reward error:",
      error
    );

    return res.status(500).json({

      error:
        "Ошибка работы с наградой",

      details:
        error.message

    });

  }

}
