import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Scrape a page and return a reduced, deduped text blob
 * plus an array of extracted snippet objects for debugging.
 *
 * Returns: { reduced: string, contexts: Array<{snippet, href}> }
 */
export default async function scrapeSite(url, opts = {}) {
  const MAX_CHARS = opts.maxChars || 4000; // characters to send to LLM
  const MAX_FRAGMENTS = opts.maxFragments || 50;

  // fetch HTML
  const { data: html } = await axios.get(url, {
    // some sites block non-browser UA; use a common UA
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    },
    timeout: 15000
  });

  const $ = cheerio.load(html);

  // Remove junk nodes
  $("script, style, noscript, iframe, svg, meta, link[rel='stylesheet']").remove();
  // remove HTML comments
  $("*")
    .contents()
    .each(function () {
      if (this.type === "comment") $(this).remove();
    });

  // Candidate selectors to inspect (narrower than body *)
  const selectors = ["a", "div", "span", "p", "li", "button"];

  const KEYWORDS = ["coupon", "promo", "code", "discount", "offer", "deal", "% off", "off"];
  const fragments = new Map(); // use Map to dedupe (keyed by text)

  // helper to clean and normalize snippet text
  const normalize = (s) =>
    s
      .replace(/\s+/g, " ")
      .replace(/\u00A0/g, " ")
      .trim();

  // iterate selected elements only
  selectors.forEach((sel) => {
    $(sel).each((i, el) => {
      let text = $(el).text() || "";
      text = normalize(text);
      if (!text || text.length < 3) return;

      const lower = text.toLowerCase();

      // quick keyword prefilter
      const hasKeyword = KEYWORDS.some((k) => lower.includes(k));
      // also capture common coupon-code formats (e.g., SAVE20, SAVE-20, SHOP20)
      const codeLike = /[A-Z0-9]{4,12}/.test(text) && /[A-Z]/.test(text);

      if (!hasKeyword && !codeLike) return;

      // find anchor href if available
      let href = $(el).closest("a").attr("href") || $(el).attr("href") || null;
      if (href && typeof href === "string") href = href.trim();

      // reduce excessively long snippet
      const snippet = text.length > 300 ? text.slice(0, 300) + "…" : text;

      // dedupe by normalized snippet
      const key = snippet.toLowerCase();
      if (!fragments.has(key)) {
        // score: prefer shorter, contains keywords, contains percent or code
        let score = 0;
        if (KEYWORDS.some((k) => lower.includes(k))) score += 10;
        if (/%\s*\d+/.test(text) || /\d+\s*%/.test(text)) score += 8;
        if (/[A-Z0-9]{4,12}/.test(text)) score += 6;
        if (lower.includes("free shipping")) score += 5;
        fragments.set(key, { snippet, href, score });
      }
    });
  });

  // convert map to array and sort by score desc
  let arr = Array.from(fragments.values()).sort((a, b) => b.score - a.score);

  // cap fragments
  arr = arr.slice(0, MAX_FRAGMENTS);

  // final reduced text (join snippets with some context)
  let reduced = arr.map((f) => (f.href ? `${f.snippet} [${f.href}]` : f.snippet)).join("\n\n");

  // fallback: if nothing found, give a very small sample of page text (first 1000 chars)
  if (!reduced || reduced.trim().length < 10) {
    const bodyText = normalize($("body").text()).slice(0, 1000);
    reduced = `NO_OBVIOUS_COUPON_SNIPPETS_FOUND\nPAGE_SNIPPET:\n${bodyText}`;
  }

  // collapse whitespace and slice to MAX_CHARS limit
  reduced = reduced.replace(/\s{2,}/g, " ").trim().slice(0, MAX_CHARS);

  return { reduced, contexts: arr };
}
