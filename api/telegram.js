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

  // ==========================================
  // MINI APP
  // ==========================================

  const miniAppUrl =
    "https://dvizhuha-mini-app.vercel.app/";


  // ==========================================
  // /start
  // ==========================================

  const messageText = update.message?.text || "";

  if (
    messageText === "/start" ||
    messageText.startsWith("/start@")
  ) {
    const chatId = update.message.chat.id;

    await sendMainMenu(
      token,
      chatId,
      miniAppUrl
    );
  }


  // ==========================================
  // ОБРАБОТКА ТЕГА ИГРОКА
  // Оставляем старую возможность
  // ==========================================

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


// ==========================================
// ГЛАВНОЕ МЕНЮ
// ==========================================

async function sendMainMenu(
  token,
  chatId,
  miniAppUrl
) {

  const body = {
    chat_id: chatId,

    text:
      "⚜️ Движуха ⚜️\n\n" +
      "Выбирай чё надо:",

    reply_markup: {

      inline_keyboard: [

        [
          {
            text: "👤 Профиль кента",
            web_app: {
              url: miniAppUrl
            }
          }
        ],

        [
          {
            text: "🏰 Клан",
            web_app: {
              url: miniAppUrl
            }
          },
          {
            text: "👥 Кенты",
            web_app: {
              url: miniAppUrl
            }
          }
        ],

        [
          {
            text: "❓ Помощь",
            web_app: {
              url: miniAppUrl
            }
          }
        ]

      ]
    }
  };


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


// ==========================================
// ОТПРАВКА СООБЩЕНИЯ
// ==========================================

async function sendMessage(
  token,
  chatId,
  text
) {

  await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    }
  );
}
