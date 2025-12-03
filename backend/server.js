import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import scrapeSite from "./scraper.js";
import OpenAI from "openai";
import { URL } from "url";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10kb" })); // prevents huge incoming bodies
app.use(cors());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.MODEL || "gpt-4o-mini";
const DEBUG = process.env.DEBUG === "true"; // set DEBUG=true in .env to get extra data

// small helper to sleep
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeOpenAIRequest(messages, attempts = 0) {
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0
    });
    return response;
  } catch (err) {
    // Rate limit handling: exponential backoff with cap
    const isRate = err?.code === "rate_limit_exceeded" || err?.status === 429;
    if (isRate && attempts < 3) {
      const wait = 1000 * Math.pow(2, attempts) + 1000; // 2s, 4s, 8s plus baseline
      console.warn(`Rate limited. retrying in ${wait}ms (attempt ${attempts + 1})`);
      await sleep(wait);
      return safeOpenAIRequest(messages, attempts + 1);
    }
    throw err;
  }
}

// safe JSON extraction: try JSON.parse, else extract JSON array with regex
function safeParseModelJson(text) {
  // try direct parse
  try {
    return JSON.parse(text);
  } catch (e) {
    // attempt to find first JSON array or object in the text
    const arrayMatch = text.match(/(\[.*\])/s);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[1]);
      } catch (e2) {
        throw new Error("Model returned invalid JSON (extraction failed).");
      }
    }
    const objMatch = text.match(/(\{.*\})/s);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[1]);
      } catch (e3) {
        throw new Error("Model returned invalid JSON (extraction failed).");
      }
    }
    throw new Error("Model returned invalid JSON.");
  }
}

// validate URL helper
function isValidHttpUrl(input) {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

app.post("/scrape", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== "string" || !isValidHttpUrl(url)) {
      return res.status(400).json({ error: "Invalid or missing URL" });
    }

    // Scrape and get reduced text
    const { reduced, contexts } = await scrapeSite(url);

    // Build a short strict prompt. VERY IMPORTANT: be explicit and strict.
    const prompt = `
You are an extractor. Extract only coupon-like offers or promo codes that are
directly visible in the provided TEXT. Do NOT invent, infer, or guess.
Return EXACTLY a JSON array. Each item must be an object with keys:
"title" (string), "code" (string or null), "description" (string or null), "url" (string or null).

If there are no valid coupons, return an empty array: []

TEXT:
${reduced}
`;

    const messages = [{ role: "user", content: prompt }];

    // send to model using safe wrapper
    const modelResponse = await safeOpenAIRequest(messages);

    // modelResponse shape depends on SDK; try to get the text safely
    let modelText = "";
    try {
      modelText = modelResponse.choices?.[0]?.message?.content ?? modelResponse.choices?.[0]?.text ?? "";
    } catch {
      modelText = "";
    }

    // parse JSON safely
    let parsed;
    try {
      parsed = safeParseModelJson(modelText);
      // ensure it's an array
      if (!Array.isArray(parsed)) throw new Error("Expected JSON array from model.");
    } catch (err) {
      // return debug info to client so you can see what happened
      return res.status(500).json({
        error: "Failed to parse model response",
        modelRaw: modelText,
        debug: DEBUG ? { reduced, contexts } : undefined
      });
    }

    // final response
    return res.json({
      coupons: parsed,
      debug: DEBUG ? { reduced, contexts, modelRaw: modelText } : undefined
    });
  } catch (err) {
    console.error("Server error:", err?.message ?? err);
    return res.status(500).json({ error: "Server error", detail: err?.message ?? String(err) });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
