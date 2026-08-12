export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "TELEGRAM_BOT_TOKEN не найден"
    });
  }

  if (req.method !== "POST") {
    return res.status(200).send("Движуха работает 🤙");
  }

  try {
    const update = req.body;

    const message = update?.message;
    const text = message?.text || "";

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
                web_app: {
                  url: "https://dvizhuha-mini-app.vercel.app/"
                }
              }
            ],
            [
              {
                text: "🏰 Клан",
                web_app: {
                  url: "https://dvizhuha-mini-app.vercel.app/"
                }
              },
              {
                text: "👥 Кенты",
                web_app: {
                  url: "https://dvizhuha-mini-app.vercel.app/"
                }
              }
            ],
            [
              {
                text: "❓ Помощь",
                web_app: {
                  url: "https://dvizhuha-mini-app.vercel.app/"
                }
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

    console.error("Telegram error:", error);

    return res.status(500).json({
      ok: false,
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

  const response = await fetch(
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

  const data = await response.json();

  console.log("Telegram response:", data);

  if (!response.ok) {
    throw new Error(
      data.description || "Telegram API error"
    );
  }
}
