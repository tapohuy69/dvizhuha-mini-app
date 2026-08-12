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

    console.log("TELEGRAM UPDATE:", JSON.stringify(update));

    const message = update?.message;
    const text = message?.text || "";

    if (
      text === "/start" ||
      text.startsWith("/start@")
    ) {
      await sendMessage(
        token,
        message.chat.id,
        "⚜️ Движуха ⚜️\n\nВыбирай чё надо:"
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


async function sendMessage(token, chatId, text) {

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    }
  );

  const data = await response.json();

  console.log(
    "Telegram response:",
    JSON.stringify(data)
  );

  if (!response.ok) {
    throw new Error(
      data.description || "Telegram API error"
    );
  }
}
