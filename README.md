# Tokopedia Product Search Scraper

Scrape product search results from [Tokopedia](https://www.tokopedia.com) — Indonesia's largest online marketplace with 100M+ monthly visitors.

## What It Extracts

Per product:
- **Identity**: product ID, name, URL, image URL
- **Pricing**: current price, original price, discount amount, discount percentage, currency (IDR)
- **Shop**: shop ID, name, URL, city, official store status, power merchant status
- **Performance**: view count, review count, talk count, favorite count
- **Category**: category ID, name, breadcrumb
- **Badges & Labels**: Official Store badge, cashback, promo labels
- **Metadata**: variant count, minimum order, pre-order status, weight

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
| `maxPages` | | 1 | Pages to scrape (1–50, each = up to 50 products) |
| `itemsPerPage` | | 50 | Products per page (max 50) |
| `sortBy` | | Relevance | Sort: relevance, newest, price (high/low), popular, reviews |
| `minPrice` | | — | Minimum price filter (IDR) |
| `maxPrice` | | — | Maximum price filter (IDR) |
| `minRating` | | — | Minimum product rating (1–4) |
| `officialStore` | | false | Official stores only |
| `location` | | — | Filter by seller city |

## Output Example

```json
{
  "id": "12345678",
  "name": "Laptop ASUS VivoBook 14 Intel i5-1235U 8GB 512GB",
  "price": 7499000,
  "priceText": "Rp7.499.000",
  "originalPrice": 8999000,
  "discount": 1500000,
  "discountPercent": 17,
  "currency": "IDR",
  "imageUrl": "https://ecs7-p.tokopedia.net/img/cache/...",
  "url": "https://www.tokopedia.com/officialstore/laptop-asus...",
  "shopId": 6309604,
  "shopName": "ASUS Official Store",
  "shopCity": "Jakarta Pusat",
  "isOfficialStore": true,
  "isPowerMerchant": true,
  "viewCount": 12500,
  "reviewCount": 342,
  "favoriteCount": 890,
  "categoryName": "Komputer & Laptop",
  "labels": [{ "position": "promo", "title": "Cashback", "type": "lightGreen" }],
  "scrapedAt": "2026-09-16T12:00:00.000Z"
}
```

## Rate Limits & Best Practices

- Max 50 products per page, max 50 pages per run (2500 products)
- Built-in 1.5s delay between pages to avoid rate limiting
- If rate-limited (HTTP 429), the actor waits and retries automatically
- Free Apify tier includes enough credits for ~5,000 products/month

## About

Built by [RGamer-Z](https://github.com/202251239-cell). Part of the [Apify Store](https://apify.com/store).

For issues or feature requests, open a GitHub issue or contact via Apify.
