export default async function handler(req, res) {

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return res.status(200).json({
      ok: true,
      debug_error: "TELEGRAM_BOT_TOKEN не найден"
    });
  }

  // =========================
  // ПРОВЕРКА ENDPOINT
  // =========================

  if (req.method !== "POST") {
    return res.status(200).send("Движуха работает 🤙");
  }

  try {

    const update = req.body;

    console.log(
      "TELEGRAM UPDATE:",
      JSON.stringify(update)
    );

    const message = update?.message;

    const text =
      message?.text || "";

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

    // =========================
    // ОБЫЧНОЕ СООБЩЕНИЕ
    // =========================

    if (
      message &&
      message.chat &&
      message.from &&
      !(
        text === "/start" ||
        text.startsWith("/start@")
      )
    ) {

      console.log(
        "MESSAGE RECEIVED:",
        JSON.stringify({
          chat_id: message.chat.id,
          telegram_id: message.from.id,
          username: message.from.username || null,
          first_name: message.from.first_name || null,
          last_name: message.from.last_name || null,
          text: text
        })
      );

    }

    // =========================
    // УСПЕШНЫЙ ОТВЕТ
    // =========================

    return res.status(200).json({
      ok: true
    });

  } catch (error) {

    // =========================
    // ВАЖНО:
    // ВРЕМЕННО НЕ ВОЗВРАЩАЕМ 500
    // =========================

    console.error(
      "TELEGRAM WEBHOOK ERROR:",
      error
    );

    return res.status(200).json({
      ok: true,
      debug_error: error.message
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

  const data =
    await response.json();

  console.log(
    "Telegram SEND:",
    data
  );

  if (!response.ok) {

    throw new Error(
      data.description ||
      "Telegram API error"
    );

  }

}
