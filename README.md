# Tokopedia Product Search Scraper

Scrape product search results from [Tokopedia](https://www.tokopedia.com) — Indonesia's largest online marketplace with 100M+ monthly visitors.

## What It Extracts

Per product:
- **Identity**: product ID, name, URL, image URL
- **Pricing**: current price (numeric), price text (formatted), original price, discount amount, discount percentage, currency (IDR)
- **Shop**: shop ID, name, city, official store status, power merchant status
- **Performance**: rating, review count, favorite count, sold count
- **Category**: category name
- **Metadata**: scraped timestamp

Plus a `_metadata` record at the end with search summary stats.

## Use Cases

- **Price monitoring**: Track product prices over time for dropshipping decisions
- **Market research**: Analyze pricing trends, discount patterns, and competitor positioning
- **Product research**: Find trending products, high-rated items, or specific niches
- **Competitive intelligence**: Monitor official store offerings vs regular sellers
- **Data enrichment**: Feed structured product data into analytics pipelines

## Pricing

**Pay-per-event**: You pay only for products actually scraped.

| Tier | Price per product |
|------|-------------------|
| Free | $0.009 |
| Bronze | $0.0075 |
| Silver | $0.006 |
| Gold+ | $0.005 |

A 50-product search run costs ~$0.45 on the free tier.

## Input Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `searchTerms` | ✅ | — | Search keywords (e.g., "laptop gaming") |
| `maxPages` | | 1 | Pages to scrape (1–50, each = up to 60 products) |
| `sortBy` | | Relevance | Sort: relevance, newest, price (high/low), popular, reviews |
| `minPrice` | | — | Minimum price filter (IDR) |
| `maxPrice` | | — | Maximum price filter (IDR) |
| `minRating` | | — | Minimum product rating (1–4) |
| `officialStore` | | false | Official stores only |
| `location` | | — | Filter by seller city |

## Output Example

```json
{
  "id": "102139308541",
  "name": "VIKING Baterai BM59 For Xiaomi Mi 11T Double Power",
  "price": 143000,
  "priceText": "Rp143.000",
  "originalPrice": 183000,
  "discount": 40000,
  "discountPercent": 22,
  "currency": "IDR",
  "imageUrl": "https://p16-images-sign-sg.tokopedia-static.net/...",
  "url": "https://www.tokopedia.com/vikingpowerbattery/viking-baterai-bm59...",
  "shopId": 7548661,
  "shopName": "VIKING OFFICIAL STORE",
  "shopCity": "Jakarta Pusat",
  "isOfficialStore": false,
  "isPowerMerchant": false,
  "rating": 4.8,
  "reviewCount": 125,
  "favoriteCount": 89,
  "soldCount": 500,
  "categoryName": "Handphone & Aksesoris",
  "scrapedAt": "2026-09-16T12:00:00.000Z"
}
```

## Rate Limits & Best Practices

- Max 60 products per page, max 50 pages per run (3000 products)
- Built-in page load waiting to avoid rate limiting
- If rate-limited (HTTP 429), the actor waits and retries automatically
- Free Apify tier includes enough credits for ~5,000 products/month

## About

Built by [RGamer-Z](https://github.com/202251239-cell). Part of the [Apify Store](https://apify.com/store).

For issues or feature requests, open a GitHub issue or contact via Apify.
