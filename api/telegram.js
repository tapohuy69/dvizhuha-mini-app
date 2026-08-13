import { neon } from "@neondatabase/serverless";
export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const DATABASE_URL = process.env.DATABASE_URL;
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
  // =========================
  // GET
  // =========================
  if (req.method !== "POST") {
    return res.status(200).send("Движуха работает 🤙");
  }
  try {
    const update = req.body;
    const message = update?.message;
    if (!message) {
      return res.status(200).json({
        ok: true,
        ignored: true
      });
    }
    // =========================
    // ДАННЫЕ TELEGRAM
    // =========================
    const chatId =
      String(message?.chat?.id || "");
    const telegramId =
      String(message?.from?.id || "");
    const username =
      message?.from?.username || null;
    const firstName =
      message?.from?.first_name || null;
    const lastName =
      message?.from?.last_name || null;
    const text =
      message?.text || "";
    // =========================
    // НАША ГРУППА
    // =========================
    const MAIN_CHAT_ID =
      "-1003932829286";
    console.log(
      "========== TELEGRAM MESSAGE =========="
    );
    console.log(
      "CHAT ID:",
      chatId
    );
    console.log(
      "TELEGRAM ID:",
      telegramId
    );
    console.log(
      "USERNAME:",
      username
    );
    console.log(
      "FIRST NAME:",
      firstName
    );
    console.log(
      "TEXT:",
      text
    );
    console.log(
      "CHAT MATCH:",
      chatId === MAIN_CHAT_ID
    );
    // =========================
    // СТАТИСТИКА СООБЩЕНИЙ
    // =========================
    if (
      chatId === MAIN_CHAT_ID &&
      telegramId &&
      text.trim()
    ) {
      console.log(
        "TRYING TO SAVE MESSAGE..."
      );
      /*
       * Время и начало недели считаем по Киеву.
       *
       * PostgreSQL:
       *  message_date = текущее время
       *  week_start   = понедельник текущей недели
       */
      const saved =
        await sql`
          INSERT INTO telegram_message_stats (
            telegram_id,
            chat_id,
            username,
            first_name,
            last_name,
            display_name,
            message_date,
            week_start,
            created_at
          )
          VALUES (
            ${telegramId},
            ${chatId},
            ${username},
            ${firstName},
            ${lastName},
            ${
              [firstName, lastName]
                .filter(Boolean)
                .join(" ")
                ||
              username ||
              telegramId
            },
            NOW(),
            (
              (
                NOW() AT TIME ZONE 'Europe/Kyiv'
              )::date
              -
              (
                EXTRACT(
                  ISODOW FROM
                  NOW() AT TIME ZONE 'Europe/Kyiv'
                )::int - 1
              )
            ),
            NOW()
          )
          RETURNING
            id,
            telegram_id,
            chat_id,
            display_name,
            message_date,
            week_start,
            created_at;
        `;
      console.log(
        "MESSAGE SUCCESSFULLY SAVED:",
        JSON.stringify(saved)
      );
    } else {
      console.log(
        "MESSAGE NOT SAVED"
      );
    }
    // =========================
    // /start
    // =========================
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
    return res.status(200).json({
      ok: true
    });
  } catch (error) {
    console.error(
      "========== TELEGRAM ERROR =========="
    );
    console.error(
      error
    );
    return res.status(200).json({
      ok: true,
      error: error.message
    });
  }
}
// =========================
// ОТПРАВКА СООБЩЕНИЯ
// =========================
async function sendMessage(
  token,
  chatId,
  text,
  replyMarkup
) {
  const response =
    await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          reply_markup: replyMarkup
        })
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
}
