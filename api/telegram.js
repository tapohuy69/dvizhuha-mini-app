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
  // Работает и как /start,
  // и как /start@DvizhuhaCR_bot
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
    );
  }

  // =========================
  // Нажатие кнопки
  // =========================

  if (update.callback_query) {
    const callback = update.callback_query;
    const chatId = callback.message.chat.id;

    await fetch(
      `https://api.telegram.org/bot${token}/answerCallbackQuery`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          callback_query_id: callback.id
        })
      }
    );

    if (callback.data === "profile") {
      await sendMessage(
        token,
        chatId,
        "👤 Профиль кента\n\nНапиши тег игрока.\n\nПример:\n#ABC123"
      );
    }

    if (callback.data === "clan") {
      await sendMessage(
        token,
        chatId,
        "🏰 Клан\n\nСкоро здесь будет информация о клане."
      );
    }

    if (callback.data === "friends") {
      await sendMessage(
        token,
        chatId,
        "👥 Кенты\n\nСкоро здесь будет список участников клана."
      );
    }

    if (callback.data === "help") {
      await sendMessage(
        token,
        chatId,
        "❓ Помощь\n\n" +
        "👤 Профиль кента — посмотреть игрока по тегу.\n" +
        "🏰 Клан — информация о клане.\n" +
        "👥 Кенты — список участников."
      );
    }
  }

  // =========================
  // Игрок прислал тег
  // =========================

  if (
    update.message?.text &&
    !update.message.text.startsWith("/")
  ) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();

    if (text.startsWith("#")) {

      await sendMessage(
        token,
        chatId,
        `🔎 Ищу кента ${text}...`
      );

      try {

        const apiUrl =
          `https://dvizhuha-mini-app.vercel.app/api/player?tag=${encodeURIComponent(text)}`;

        const response = await fetch(apiUrl);
        const data = await response.json();

        if (!response.ok) {

          await sendMessage(
            token,
            chatId,
            "❌ Игрок не найден.\nПроверь тег и попробуй ещё раз."
          );

        } else {

          const message =
            `👤 ${data.name || "Без имени"}\n\n` +
            `🏆 Кубки: ${data.trophies ?? "—"}\n` +
            `🏅 Лучший результат: ${data.bestTrophies ?? "—"}\n` +
            `⚔️ Победы: ${data.wins ?? "—"}\n` +
            `💀 Поражения: ${data.losses ?? "—"}\n` +
            `⭐ Уровень: ${data.expLevel ?? "—"}\n` +
            `🏰 Клан: ${data.clan?.name || "Без клана"}`;

          await sendMessage(
            token,
            chatId,
            message
          );
        }

      } catch (error) {

        await sendMessage(
          token,
          chatId,
          "❌ Ошибка при получении данных игрока."
        );
      }
    }
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
    body.reply_markup = {
      inline_keyboard: buttons.inline_keyboard
    };
  }

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
}
