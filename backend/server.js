import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import scrapeSite from "./scraper.js";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/scrape", async (req, res) => {
  try {
    const { url } = req.body;

    const text = await scrapeSite(url);

    const prompt = `
Extract coupon or promo codes from the text below.
Return ONLY a JSON array like:
[
  { "title": string, "code": string|null, "description": string|null }
]

TEXT:
${text}
`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [{ role: "user", content: prompt }],
      temperature: 0
    });

    const json = JSON.parse(response.choices[0].message.content);

    res.json({ coupons: json });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to scrape" });
  }
});

app.listen(3001, () => console.log("Backend running on http://localhost:3001"));
