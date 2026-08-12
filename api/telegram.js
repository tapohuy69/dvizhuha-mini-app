export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Движуха работает 🤙");
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "TELEGRAM_BOT_TOKEN не найден"
    });
  }

  const update = req.body;

  // /start
  if (update.message?.text === "/start") {
    const chatId = update.message.chat.id;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: "⚜️ Движуха ⚜️\n\nВыбирай чё надо:",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "👤 Профиль кента",
                callback_data: "profile"
              }
            ],
            [
              {
                text: "🏰 Клан",
                callback_data: "clan"
              },
              {
                text: "👥 Кенты",
                callback_data: "friends"
              }
            ],
            [
              {
                text: "❓ Помощь",
                callback_data: "help"
              }
            ]
          ]
        }
      })
    });
  }

  // Нажатие кнопок
  if (update.callback_query) {
    const callback = update.callback_query;

    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        callback_query_id: callback.id
      })
    });
  }

  return res.status(200).json({
    ok: true
  });
}
