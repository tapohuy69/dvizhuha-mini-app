import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "TELEGRAM_BOT_TOKEN не найден"
    });
  }

  // ==========================================
  // GET
  // ==========================================

  if (req.method !== "POST") {
    return res.status(200).send("Движуха работает 🤙");
  }

  try {

    const sql = neon(process.env.DATABASE_URL);

    const update = req.body;

    // ==========================================
    // TELEGRAM MESSAGE
    // ==========================================

    const message = update?.message;

    if (!message) {
      return res.status(200).json({
        ok: true
      });
    }

    const chat = message.chat;

    const from = message.from;

    if (!chat || !from) {
      return res.status(200).json({
        ok: true
      });
    }

    // ==========================================
    // НЕ СЧИТАЕМ БОТА
    // ==========================================

    if (from.is_bot) {
      return res.status(200).json({
        ok: true
      });
    }

    // ==========================================
    // ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
    // ==========================================

    const telegramId =
      String(from.id);

    const chatId =
      String(chat.id);

    const username =
      from.username || "";

    const firstName =
      from.first_name || "";

    const lastName =
      from.last_name || "";

    const displayName =
      [firstName, lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      username ||
      `Игрок ${telegramId}`;

    // ==========================================
    // СОЗДАЁМ ТАБЛИЦЫ
    // ==========================================

    await sql`
      CREATE TABLE IF NOT EXISTS telegram_message_stats (
        id BIGSERIAL PRIMARY KEY,

        telegram_id TEXT NOT NULL,

        chat_id TEXT NOT NULL,

        username TEXT,

        first_name TEXT,

        last_name TEXT,

        display_name TEXT,

        message_date TIMESTAMPTZ NOT NULL,

        week_start DATE NOT NULL,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // ==========================================
    // ТАБЛИЦА ПОБЕДИТЕЛЕЙ
    // ==========================================

    await sql`
      CREATE TABLE IF NOT EXISTS telegram_weekly_winners (
        id BIGSERIAL PRIMARY KEY,

        chat_id TEXT NOT NULL,

        telegram_id TEXT NOT NULL,

        username TEXT,

        display_name TEXT,

        week_start DATE NOT NULL,

        week_end DATE NOT NULL,

        message_count INTEGER NOT NULL DEFAULT 0,

        reward_emoji TEXT,

        reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE(chat_id, week_start)
      )
    `;

    // ==========================================
    // КИЕВСКОЕ ВРЕМЯ
    // ==========================================

    const now = new Date();

    const kyivDateString =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone: "Europe/Kyiv",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }
      ).format(now);

    const kyivParts =
      kyivDateString.split("-");

    const kyivYear =
      Number(kyivParts[0]);

    const kyivMonth =
      Number(kyivParts[1]);

    const kyivDay =
      Number(kyivParts[2]);

    const kyivDate =
      new Date(
        Date.UTC(
          kyivYear,
          kyivMonth - 1,
          kyivDay
        )
      );

    // ==========================================
    // ПОНЕДЕЛЬНИК = НАЧАЛО НЕДЕЛИ
    // ==========================================

    const dayOfWeek =
      kyivDate.getUTCDay();

    const daysFromMonday =
      dayOfWeek === 0
        ? 6
        : dayOfWeek - 1;

    const weekStartDate =
      new Date(kyivDate);

    weekStartDate.setUTCDate(
      weekStartDate.getUTCDate() -
      daysFromMonday
    );

    const weekStart =
      weekStartDate
        .toISOString()
        .slice(0, 10);

    // ==========================================
    // ПРЕДЫДУЩАЯ НЕДЕЛЯ
    // ==========================================

    const previousWeekDate =
      new Date(weekStartDate);

    previousWeekDate.setUTCDate(
      previousWeekDate.getUTCDate() - 7
    );

    const previousWeekStart =
      previousWeekDate
        .toISOString()
        .slice(0, 10);

    const previousWeekEndDate =
      new Date(weekStartDate);

    previousWeekEndDate.setUTCDate(
      previousWeekEndDate.getUTCDate() - 1
    );

    const previousWeekEnd =
      previousWeekEndDate
        .toISOString()
        .slice(0, 10);

    // ==========================================
    // ПРОВЕРЯЕМ, ЕСТЬ ЛИ ПОБЕДИТЕЛЬ
    // ЗА ПРЕДЫДУЩУЮ НЕДЕЛЮ
    // ==========================================

    const existingWinner =
      await sql`
        SELECT id
        FROM telegram_weekly_winners
        WHERE chat_id = ${chatId}
          AND week_start = ${previousWeekStart}
        LIMIT 1
      `;

    // ==========================================
    // ЕСЛИ ПОБЕДИТЕЛЯ ЕЩЁ НЕТ —
    // ИЩЕМ ЛУЧШЕГО ЗА ПРОШЛУЮ НЕДЕЛЮ
    // ==========================================

    if (existingWinner.length === 0) {

      const winnerResult =
        await sql`
          SELECT
            telegram_id,
            username,
            display_name,
            COUNT(*)::INTEGER AS message_count
          FROM telegram_message_stats
          WHERE chat_id = ${chatId}
            AND week_start = ${previousWeekStart}
          GROUP BY
            telegram_id,
            username,
            display_name
          ORDER BY
            message_count DESC,
            telegram_id ASC
          LIMIT 1
        `;

      // ==========================================
      // ЕСЛИ БЫЛ ХОТЯ БЫ ОДИН УЧАСТНИК
      // ==========================================

      if (winnerResult.length > 0) {

        const winner =
          winnerResult[0];

        // ======================================
        // СОХРАНЯЕМ ПОБЕДИТЕЛЯ
        // ======================================

        await sql`
          INSERT INTO telegram_weekly_winners (
            chat_id,
            telegram_id,
            username,
            display_name,
            week_start,
            week_end,
            message_count
          )
          VALUES (
            ${chatId},
            ${winner.telegram_id},
            ${winner.username || ""},
            ${winner.display_name || ""},
            ${previousWeekStart},
            ${previousWeekEnd},
            ${winner.message_count}
          )
          ON CONFLICT (chat_id, week_start)
          DO NOTHING
        `;

        // ======================================
        // ИМЯ ДЛЯ TELEGRAM
        // ======================================

        let winnerMention;

        if (winner.username) {

          winnerMention =
            `@${winner.username}`;

        } else {

          winnerMention =
            `<a href="tg://user?id=${winner.telegram_id}">` +
            escapeHtml(
              winner.display_name ||
              "Победитель"
            ) +
            `</a>`;
        }

        // ======================================
        // СООБЩЕНИЕ В ЧАТ
        // ======================================

        const announcement =
          `🏆 <b>ПОБЕДИТЕЛЬ НЕДЕЛИ!</b>\n\n` +
          `${winnerMention}\n\n` +
          `💬 Сообщений: <b>${winner.message_count}</b>\n\n` +
          `🎁 Тебе доступна награда!\n` +
          `Ты можешь выбрать <b>ЛЮБОЙ смайлик</b> ` +
          `для своего ника в Движухе.\n\n` +
          `⚠️ Награда используется <b>один раз</b> ` +
          `до следующей победы.\n\n` +
          `🔥 Поздравляем!`;

        try {

          await sendMessage(
            token,
            chat.id,
            announcement
          );

        } catch (error) {

          console.error(
            "Ошибка объявления победителя:",
            error
          );

        }
      }
    }

    // ==========================================
    // СОХРАНЯЕМ СООБЩЕНИЕ
    // ==========================================

    await sql`
      INSERT INTO telegram_message_stats (
        telegram_id,
        chat_id,
        username,
        first_name,
        last_name,
        display_name,
        message_date,
        week_start
      )
      VALUES (
        ${telegramId},
        ${chatId},
        ${username},
        ${firstName},
        ${lastName},
        ${displayName},
        NOW(),
        ${weekStart}
      )
    `;

    // ==========================================
    // /start
    // ==========================================

    const text =
      message.text || "";

    if (
      text === "/start" ||
      text.startsWith("/start@")
    ) {

      await sendMessage(
        token,
        message.chat.id,
        "⚜️ Движуха ⚜️\n\nВыбирай чё надо:",
        {
          inline_keyboard: [
            [
              {
                text: "👤 Профиль кента",
                url: "https://t.me/DvizhuhaCR_bot?startapp=profile"
              }
            ],
            [
              {
                text: "🙋‍♂️ Мой профиль",
                url: "https://t.me/DvizhuhaCR_bot?startapp=myprofile"
              }
            ],
            [
              {
                text: "🏰 Клан",
                url: "https://t.me/DvizhuhaCR_bot?startapp=clan"
              },
              {
                text: "👥 Кенты",
                url: "https://t.me/DvizhuhaCR_bot?startapp=players"
              }
            ],
            [
              {
                text: "🆘 Помощь",
                url: "https://t.me/DvizhuhaCR_bot?startapp=help"
              }
            ]
          ]
        }
      );
    }

    // ==========================================
    // ГОТОВО
    // ==========================================

    return res.status(200).json({
      ok: true
    });

  } catch (error) {

    console.error(
      "Telegram error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}


// ==========================================
// ОТПРАВКА СООБЩЕНИЯ
// ==========================================

async function sendMessage(
  token,
  chatId,
  text,
  replyMarkup = undefined
) {

  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const response =
    await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(body)
      }
    );

  const data =
    await response.json();

  console.log(
    "Telegram:",
    data
  );

  if (!response.ok) {

    throw new Error(
      data.description ||
      "Telegram API error"
    );
  }

  return data;
}


// ==========================================
// ЗАЩИТА HTML
// ==========================================

function escapeHtml(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
