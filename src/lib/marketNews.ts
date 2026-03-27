/**
 * Market-style headlines for workspace pages. Tries Finnhub when a token is set,
 * then falls back to a browser-friendly source if Finnhub fails or returns nothing.
 */

export type MarketNewsArticle = {
  id?: string | number;
  headline?: string;
  title?: string;
  source: string;
  datetime?: number;
  publishedAt?: number;
  url: string;
  image?: string;
};

const FINNHUB_TOKEN = process.env.REACT_APP_FINNHUB_TOKEN ?? "";

function articleTimeMs(a: MarketNewsArticle): number {
  const t = a.datetime ?? a.publishedAt;
  if (t == null) return Date.now();
  return t > 1e12 ? t : t * 1000;
}

export { articleTimeMs };

async function fetchFinnhubGeneral(limit: number): Promise<MarketNewsArticle[] | null> {
  if (!FINNHUB_TOKEN) return null;
  const res = await fetch(
    `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(FINNHUB_TOKEN)}`
  );
  if (!res.ok) return null;
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return null;
  return data.slice(0, limit) as MarketNewsArticle[];
}

/** Hacker News front page via Algolia — works from the browser without Finnhub. */
async function fetchHNFrontPageFallback(limit: number): Promise<MarketNewsArticle[]> {
  const res = await fetch(
    `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${Math.min(limit, 20)}`
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    hits?: { objectID?: string; title?: string; url?: string; created_at?: string; created_at_i?: number }[];
  };
  const hits = data.hits ?? [];
  return hits.map((h, i) => ({
    id: h.objectID ?? i,
    headline: h.title ?? "Untitled",
    title: h.title,
    source: "Hacker News",
    url: h.url && /^https?:\/\//i.test(h.url) ? h.url : `https://news.ycombinator.com/item?id=${h.objectID ?? ""}`,
    datetime:
      typeof h.created_at_i === "number"
        ? h.created_at_i
        : h.created_at
          ? Math.floor(new Date(h.created_at).getTime() / 1000)
          : undefined,
  }));
}

/** Loads headlines: Finnhub when `REACT_APP_FINNHUB_TOKEN` is set, otherwise HN front page. */
export async function fetchMarketNews(limit = 10): Promise<MarketNewsArticle[]> {
  try {
    const finnhub = await fetchFinnhubGeneral(limit);
    if (finnhub && finnhub.length > 0) {
      return finnhub;
    }
  } catch (e) {
    console.debug("[marketNews] Finnhub failed:", e);
  }

  try {
    return await fetchHNFrontPageFallback(limit);
  } catch (e) {
    console.debug("[marketNews] Fallback failed:", e);
    return [];
  }
}
