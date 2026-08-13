import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "TELEGRAM_BOT_TOKEN не найден"
    });
  }

  const sql = neon(process.env.DATABASE_URL);

  // ==========================================
  // TELEGRAM WEBHOOK
  // ==========================================

  if (req.method !== "POST") {
    return res.status(200).send("Движуха работает 🤙");
  }

  try {

    const update = req.body;

    const message = update?.message;

    if (!message) {
      return res.status(200).json({
        ok: true
      });
    }


    // ==========================================
    // ДАННЫЕ СООБЩЕНИЯ
    // ==========================================

    const chatId =
      message.chat?.id
        ? String(message.chat.id)
        : "";

    const telegramId =
      message.from?.id
        ? String(message.from.id)
        : "";

    const text =
      message.text || "";


    if (!chatId || !telegramId) {
      return res.status(200).json({
        ok: true
      });
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

      return res.status(200).json({
        ok: true
      });
    }


    // ==========================================
    // СЧИТАЕМ СООБЩЕНИЕ
    // ==========================================

    await sql`
      INSERT INTO message_stats (
        telegram_id,
        chat_id,
        message_date
      )
      VALUES (
        ${telegramId},
        ${chatId},
        NOW()
      )
    `;


    // ==========================================
    // ОТВЕТ
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

          text: text,

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
