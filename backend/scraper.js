import axios from "axios";
import * as cheerio from "cheerio";

export default async function scrapeSite(url) {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  // remove junk nodes first
  $("script, style, meta, link[rel='stylesheet']").remove();
  $("*")
    .contents()
    .each(function () {
      if (this.type === "comment") $(this).remove();
    });

  let chunks = [];

  $("body *").each((i, el) => {
    const text = $(el).text().trim().toLowerCase();
    if (!text) return;

    // match coupon-related content
    if (
      text.includes("coupon") ||
      text.includes("promo") ||
      text.includes("deal") ||
      text.includes("%") ||
      text.includes("off")
    ) {
      chunks.push(text);
    }
  });

  let links = [];
  $("a").each((i, el) => {
    const href = $(el).attr("href")?.toLowerCase() || "";
    if (
      href.includes("coupon") ||
      href.includes("promo") ||
      href.includes("deal")
    ) {
      links.push(href);
    }
  });

  // final output
  let output = chunks.join("\n") + "\nLinks:\n" + links.join("\n");

  // character limit to protect OpenAI calls
  const MAX = 8000;
  return output.slice(0, MAX);
}
