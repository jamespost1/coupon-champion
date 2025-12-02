import axios from "axios";
import cheerio from "cheerio";

export default async function scrapeSite(url) {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  let chunks = [];

  $("body *").each((i, el) => {
    const text = $(el).text().trim();
    if (!text) return;
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
    const href = $(el).attr("href") || "";
    if (href.includes("coupon") || href.includes("promo") || href.includes("deal")) {
      links.push(href);
    }
  });

  return chunks.join("\n") + "\nLinks:\n" + links.join("\n");
}
