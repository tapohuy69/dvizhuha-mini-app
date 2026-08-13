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

        const MAIN_CHAT_ID = "-1003932829286";

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
        // ТЕКУЩАЯ НЕДЕЛЯ
        // ==================================================

        const weekResult = await sql`
            SELECT
                date_trunc(
                    'week',
                    NOW() AT TIME ZONE 'Europe/Kyiv'
                )::date AS week_start
        `;

        const weekStart = weekResult[0].week_start;

        // ==================================================
        // WEEKLY WINNER
        // ==================================================

        if (action === "weekly-winner") {

            const weekEndResult = await sql`
                SELECT
                    (
                        date_trunc(
                            'week',
                            NOW() AT TIME ZONE 'Europe/Kyiv'
                        )::date
                        - INTERVAL '1 day'
                    )::date AS week_end
            `;

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

            const previousWeekStart =
                previousWeekResult[0].week_start;

            const previousWeekEnd =
                weekEndResult[0].week_end;

            const alreadyWinner = await sql`
                SELECT *
                FROM weekly_winners
                WHERE
                    week_start = ${previousWeekStart}
                LIMIT 1
            `;

            if (alreadyWinner.length > 0) {
                return res.status(200).json({
                    ok: true,
                    already_announced: true,
                    week_start: previousWeekStart,
                    week_end: previousWeekEnd,
                    winner: alreadyWinner[0]
                });
            }

            const winnerResult = await sql`
                SELECT
                    telegram_id,
                    MAX(username) AS username,
                    MAX(first_name) AS first_name,
                    COUNT(*)::int AS message_count
                FROM telegram_message_stats
                WHERE
                    chat_id = ${MAIN_CHAT_ID}
                    AND week_start = ${previousWeekStart}
                GROUP BY telegram_id
                ORDER BY
                    message_count DESC,
                    telegram_id ASC
                LIMIT 1
            `;

            if (winnerResult.length === 0) {
                return res.status(200).json({
                    ok: true,
                    winner: null,
                    week_start: previousWeekStart,
                    week_end: previousWeekEnd,
                    message: "За эту неделю сообщений не было."
                });
            }

            const winner = winnerResult[0];

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
                    ${winner.first_name || "Игрок"},
                    ${previousWeekStart},
                    ${previousWeekEnd},
                    ${winner.message_count},
                    FALSE,
                    NULL,
                    NOW()
                )
                RETURNING *
            `;

            return res.status(200).json({
                ok: true,
                announced: true,
                week_start: previousWeekStart,
                week_end: previousWeekEnd,
                winner: savedWinner[0]
            });
        }

        // ==================================================
        // REWARD EMOJIS
        //
        // Связываем:
        //
        // player_rewards
        //      ↓
        // telegram_players
        //      ↓
        // player_tag
        //
        // Это позволяет показывать смайлик возле
        // Clash Royale ника игрока.
        // ==================================================

        if (
            req.method === "GET" &&
            action === "reward-emojis"
        ) {

            const rewardsResult = await sql`
                SELECT
                    tp.player_tag,
                    pr.telegram_id,
                    pr.reward_emoji,
                    pr.reward_claimed
                FROM player_rewards pr
                INNER JOIN telegram_players tp
                    ON String(tp.telegram_id) =
                       String(pr.telegram_id)
                WHERE
                    pr.reward_claimed = TRUE
                    AND pr.reward_emoji IS NOT NULL
                    AND TRIM(pr.reward_emoji) <> ''
                    AND tp.player_tag IS NOT NULL
                    AND TRIM(tp.player_tag) <> ''
            `;

            const rewards = rewardsResult.map(row => ({
                player_tag: row.player_tag,
                telegram_id: String(row.telegram_id),
                reward_emoji: row.reward_emoji
            }));

            return res.status(200).json({
                ok: true,
                rewards
            });
        }

        // ==================================================
        // REWARD GET
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
                WHERE
                    telegram_id = ${telegramId}
                ORDER BY
                    week_start DESC
                LIMIT 1
            `;

            const winner =
                winnerResult[0] || null;

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

            const reward =
                rewardResult[0] || null;

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

            if (winner.reward_claimed === true) {

                return res.status(200).json({
                    ok: true,
                    winner,
                    reward,
                    can_choose: false
                });
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

                const winnerCreatedAt =
                    new Date(
                        winner.created_at
                    );

                if (claimedAt >= winnerCreatedAt) {

                    return res.status(200).json({
                        ok: true,
                        winner,
                        reward,
                        can_choose: false
                    });
                }
            }

            return res.status(200).json({
                ok: true,
                winner,
                reward,
                can_choose: true
            });
        }

        // ==================================================
        // REWARD POST
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

            const winnerResult = await sql`
                SELECT
                    *
                FROM weekly_winners
                WHERE
                    telegram_id = ${telegramId}
                ORDER BY
                    week_start DESC
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

            if (
                winner.reward_claimed === true
            ) {
                return res.status(403).json({
                    ok: false,
                    error:
                        "Награда за эту победу уже выбрана.",
                    reward:
                        winner.emoji || null
                });
            }

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

            const updatedWinner = await sql`
                UPDATE weekly_winners
                SET
                    reward_claimed = TRUE,
                    emoji = ${emoji}
                WHERE
                    id = ${winner.id}
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

        if (telegramId) {

            const userStats = await sql`
                SELECT
                    COUNT(*) FILTER (
                        WHERE week_start = ${weekStart}
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

        // ==================================================
        // ТОП НЕДЕЛИ
        // ==================================================

        const weeklyTop = await sql`
            SELECT
                telegram_id,
                MAX(username) AS username,
                MAX(first_name) AS first_name,
                COUNT(*)::int AS messages
            FROM telegram_message_stats
            WHERE
                chat_id = ${MAIN_CHAT_ID}
                AND week_start = ${weekStart}
            GROUP BY telegram_id
            ORDER BY
                messages DESC,
                telegram_id ASC
            LIMIT 10
        `;

        let winner = null;

        if (weeklyTop.length > 0) {

            const top =
                weeklyTop[0];

            winner = {
                telegram_id:
                    String(top.telegram_id),

                display_name:
                    top.first_name ||
                    top.username ||
                    "Игрок",

                username:
                    top.username || null,

                messages:
                    Number(top.messages)
            };
        }

        // ==================================================
        // ТОП ЗА ВСЁ ВРЕМЯ
        // ==================================================

        const totalTop = await sql`
            SELECT
                telegram_id,
                MAX(username) AS username,
                MAX(first_name) AS first_name,
                COUNT(*)::int AS messages
            FROM telegram_message_stats
            WHERE
                chat_id = ${MAIN_CHAT_ID}
            GROUP BY telegram_id
            ORDER BY
                messages DESC,
                telegram_id ASC
            LIMIT 10
        `;

        // ==================================================
        // ФОРМАТИРОВАНИЕ ТОПА НЕДЕЛИ
        // ==================================================

        const weeklyLeaderboard =
            weeklyTop.map(
                (player, index) => ({
                    place: index + 1,

                    telegram_id:
                        String(
                            player.telegram_id
                        ),

                    display_name:
                        player.first_name ||
                        player.username ||
                        "Игрок",

                    username:
                        player.username || null,

                    messages:
                        Number(
                            player.messages
                        )
                })
            );

        // ==================================================
        // ФОРМАТИРОВАНИЕ ТОПА ЗА ВСЁ ВРЕМЯ
        // ==================================================

        const totalLeaderboard =
            totalTop.map(
                (player, index) => ({
                    place: index + 1,

                    telegram_id:
                        String(
                            player.telegram_id
                        ),

                    display_name:
                        player.first_name ||
                        player.username ||
                        "Игрок",

                    username:
                        player.username || null,

                    messages:
                        Number(
                            player.messages
                        )
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
                error?.message ||
                String(error)
        });
    }
}
