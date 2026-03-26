import * as cheerio from "cheerio";

export async function scrapeArticle(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $("script, style, nav, header, footer, aside, .sidebar, .comments, .ad, .advertisement, .social-share, .related-posts, iframe, noscript").remove();

    // Try to find the main article content
    const selectors = [
      "article",
      '[role="main"]',
      ".post-content",
      ".article-content",
      ".entry-content",
      ".content-body",
      ".story-body",
      "main",
      "#content",
      ".content",
    ];

    let text = "";
    for (const selector of selectors) {
      const el = $(selector);
      if (el.length > 0) {
        text = el
          .find("p, h1, h2, h3, h4, blockquote, li")
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((t) => t.length > 20)
          .join("\n\n");
        if (text.length > 500) break;
      }
    }

    // Fallback: get all paragraphs
    if (text.length < 500) {
      text = $("p")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((t) => t.length > 20)
        .join("\n\n");
    }

    // Get title and author info
    const title = $("title").text().trim() || $("h1").first().text().trim();
    const author =
      $('meta[name="author"]').attr("content") ||
      $('[rel="author"]').text().trim() ||
      $(".author").first().text().trim() ||
      "";

    const datePublished =
      $('meta[property="article:published_time"]').attr("content") ||
      $("time").first().attr("datetime") ||
      $(".date, .published, .post-date").first().text().trim() ||
      "";

    return `TITLE: ${title}\nAUTHOR: ${author}\nDATE: ${datePublished}\nURL: ${url}\n\n${text}`;
  } catch (error) {
    console.error(`Scraping failed for ${url}:`, error);
    return "";
  }
}
