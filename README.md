# Tokopedia Product Search Scraper

Scrape product search results from [Tokopedia](https://www.tokopedia.com) — Indonesia's largest online marketplace with 100M+ monthly visitors.

## What It Extracts

**30+ fields per product:**

| Category | Fields |
|----------|--------|
| Context | keyword, page, position |
| Product | productId, title, URL, imageUrl, imageUrls |
| Pricing | price, priceText, originalPrice, discount, discountPercent, currency |
| Shop | shopId, shopName, shopUrl, shopCity, shopTier, isOfficialStore, isPowerMerchant |
| Badge | badgeTitle, badgeUrl |
| Performance | rating, reviewCount, favoriteCount, soldCount |
| Category | categoryId, categoryName, categoryBreadcrumb |
| Flags | isAd, isWishlist |
| Metadata | fetchedAt |

## Use Cases

- **Price monitoring**: Track product prices over time for dropshipping decisions
- **Market research**: Analyze pricing trends, discount patterns, and competitor positioning
- **Product research**: Find trending products, high-rated items, or specific niches
- **Competitive intelligence**: Monitor official store offerings vs regular sellers
- **Data enrichment**: Feed structured product data into analytics pipelines

## Pricing

**Pay-per-event**: you pay only for products actually written to the dataset.

| Apify plan tier | Price per product |
|-----------------|-------------------|
| Free | $0.001 |
| Bronze | $0.0009 |
| Silver | $0.0008 |
| Gold+ | $0.0007 |

A 50-product search costs ~$0.05 on the free tier. The run summary is stored in the key-value store — not billed.

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
  "keyword": "headset gaming",
  "page": 1,
  "position": 1,
  "productId": "3131173901",
  "title": "Earphone I Earbuds I Headset Gaming with Mic JETEX HX11",
  "price": 242158,
  "priceText": "Rp242.158",
  "originalPrice": 349900,
  "discount": 107742,
  "discountPercent": 31,
  "currency": "IDR",
  "imageUrl": "https://p16-images-sign-sg.tokopedia-static.net/...",
  "imageUrls": [],
  "url": "https://www.tokopedia.com/doran-gadget-manado/...",
  "shopId": "271905",
  "shopName": "Doran Gadget Manado",
  "shopUrl": "https://www.tokopedia.com/doran-gadget-manado",
  "shopCity": "Surabaya",
  "shopTier": 2,
  "isOfficialStore": true,
  "isPowerMerchant": false,
  "badgeTitle": "Surabaya",
  "badgeUrl": "https://p16-images-comn-sg.tokopedia-static.net/...",
  "rating": 5,
  "reviewCount": 0,
  "favoriteCount": 0,
  "soldCount": 2,
  "categoryId": "297",
  "categoryName": "Komputer & Laptop",
  "categoryBreadcrumb": "komputer-laptop/aksesoris-pc-gaming/headset-gaming",
  "isAd": false,
  "isWishlist": false,
  "fetchedAt": "2026-09-18T11:16:07.397Z"
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
