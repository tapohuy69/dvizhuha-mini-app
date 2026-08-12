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

  const update = req.body;

  // =========================
  // /start
  // =========================

  const messageText = update.message?.text || "";

  if (
    messageText === "/start" ||
    messageText.startsWith("/start@")
  ) {
    const chatId = update.message.chat.id;

    await sendMessage(
      token,
      chatId,
      "⚜️ Движуха ⚜️\n\nВыбирай чё надо:",
      {
        inline_keyboard: [
          [
            {
              text: "🚀 Открыть Движуху",
              web_app: {
                url: "https://dvizhuha-mini-app.vercel.app/"
              }
            }
          ]
        ]
      }
    );

    return res.status(200).json({
      ok: true
    });
  }

  return res.status(200).json({
    ok: true
  });
}


// =========================
// Отправка сообщения
// =========================

async function sendMessage(
  token,
  chatId,
  text,
  buttons = null
) {
  const body = {
    chat_id: chatId,
    text
  };

  if (buttons) {
    body.reply_markup = buttons;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  console.log("Telegram sendMessage:", data);
}
