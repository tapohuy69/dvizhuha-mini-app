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

  // ==========================================
  // GET
  // ==========================================

  if (req.method !== "POST") {
    return res.status(200).send("Движуха работает 🤙");
  }

  try {

    const update = req.body;

    console.log("TELEGRAM UPDATE:", update);

    const message = update?.message;

    // ==========================================
    // ЕСЛИ ЭТО НЕ СООБЩЕНИЕ
    // ==========================================

    if (!message) {
      return res.status(200).json({
        ok: true,
        ignored: true
      });
    }

    const chatId = message?.chat?.id
      ? String(message.chat.id)
      : "";

    const telegramId = message?.from?.id
      ? String(message.from.id)
      : "";

    const username =
      message?.from?.username || null;

    const firstName =
      message?.from?.first_name || null;

    const lastName =
      message?.from?.last_name || null;

    const text =
      message?.text || "";

    console.log("MESSAGE RECEIVED:", {
      chat_id: chatId,
      telegram_id: telegramId,
      username,
      first_name: firstName,
      last_name: lastName,
      text
    });

    // ==========================================
    // НАША ГРУППА
    // ==========================================

    const MAIN_CHAT_ID = "-1003932829286";

    // ==========================================
    // СОХРАНЕНИЕ СООБЩЕНИЙ
    // ==========================================

    if (
      chatId === MAIN_CHAT_ID &&
      telegramId &&
      text.trim()
    ) {

      await sql`
        INSERT INTO telegram_message_stats (
          chat_id,
          telegram_id,
          username,
          first_name,
          last_name,
          message_text,
          created_at
        )
        VALUES (
          ${chatId},
          ${telegramId},
          ${username},
          ${firstName},
          ${lastName},
          ${text},
          NOW()
        )
      `;

      console.log(
        "MESSAGE SAVED TO NEON:",
        telegramId,
        text
      );
    }

    // ==========================================
    // /start
    // ==========================================

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
    // УСПЕШНЫЙ ОТВЕТ TELEGRAM
    // ==========================================

    return res.status(200).json({
      ok: true
    });

  } catch (error) {

    console.error(
      "Telegram webhook error:",
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
  replyMarkup
) {

  const response = await fetch(
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
    "Telegram sendMessage:",
    data
  );

  if (!response.ok) {

    throw new Error(
      data.description ||
      "Telegram API error"
    );
  }
}
