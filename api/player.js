export default async function handler(req, res) {
  try {
    const token = process.env.CR_API_TOKEN;

    return res.status(200).json({
      ok: true,
      token_exists: !!token
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
