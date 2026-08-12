export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "TELEGRAM_BOT_TOKEN не найден в Vercel"
      });
    }

    const webhookUrl =
      "https://dvizhuha-mini-app.vercel.app/api/telegram";

    const response = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
    );

    const data = await response.json();

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: "Ошибка установки webhook",
      message: error.message
    });
  }
}
