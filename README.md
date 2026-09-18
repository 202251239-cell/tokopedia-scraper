# Tokopedia Search Scraper

Scrape product search results from **Tokopedia** — Indonesia's #1 marketplace — into clean JSON with **30+ fields** per product.

## Why This Actor?

- **30+ output fields** — more data per product than any other Tokopedia scraper
- **Auto anti-bot bypass** — PlaywrightCrawler handles Tokopedia's bot detection automatically
- **Multi-page scraping** — scrape up to 50 pages (~3,000 products per keyword)
- **Deduplication** — automatic duplicate removal across pages
- **Fast & reliable** — intercepts GraphQL API responses, not DOM parsing

## Output Fields

| Field | Description |
|-------|-------------|
| `keyword` | Search keyword used |
| `page` | Page number |
| `position` | Product position in results |
| `productId` | Tokopedia product ID |
| `title` | Product title |
| `price` | Current price (IDR) |
| `priceText` | Formatted price string |
| `originalPrice` | Price before discount |
| `discount` | Discount amount |
| `discountPercent` | Discount percentage |
| `currency` | Currency code (IDR) |
| `imageUrl` | Primary image URL |
| `imageUrls` | Array of all image URLs |
| `url` | Product page URL |
| `shopId` | Shop ID |
| `shopName` | Shop name |
| `shopUrl` | Shop page URL |
| `shopCity` | Shop location |
| `shopTier` | Shop tier level |
| `isOfficialStore` | Official store badge |
| `isPowerMerchant` | Power merchant badge |
| `badgeTitle` | Badge text |
| `badgeUrl` | Badge image URL |
| `rating` | Average rating (0-5) |
| `reviewCount` | Number of reviews |
| `favoriteCount` | Number of favorites/wishlists |
| `soldCount` | Units sold |
| `categoryId` | Category ID |
| `categoryName` | Category name |
| `categoryBreadcrumb` | Full category path |
| `isAd` | Sponsored result flag |
| `isWishlist` | Wishlisted flag |
| `weight` | Product weight in grams (from detail page) |
| `stock` | Available stock quantity |
| `condition` | Product condition (Baru/Bekas) |
| `minOrder` | Minimum order quantity |
| `wholesalePrice` | Wholesale/bulk price |
| `fetchedAt` | Scrape timestamp |

## Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `searchTerms` | string | ✅ | Search keyword (e.g. "laptop gaming") |
| `maxPages` | integer | No | Pages to scrape (1-50, default: 1) |
| `minRating` | number | No | Minimum rating filter (0-5) |
| `sortBy` | select | No | Sort: relevance, newest, price_high, price_low, popular, reviews |
| `minPrice` | integer | No | Min price in IDR |
| `maxPrice` | integer | No | Max price in IDR |
| `officialStore` | boolean | No | Official store only |
| `location` | string | No | Seller city filter |

## Sample Output

```json
{
  "keyword": "laptop gaming",
  "page": 1,
  "position": 1,
  "productId": 123456789,
  "title": "Laptop Gaming ASUS ROG Strix G15 RTX 3060",
  "price": 12999000,
  "priceText": "Rp12.999.000",
  "originalPrice": 15999000,
  "discount": 3000000,
  "discountPercent": 19,
  "currency": "IDR",
  "imageUrl": "https://images.tokopedia.net/img/cache/...",
  "url": "https://www.tokopedia.com/shop/product",
  "shopId": "98765432",
  "shopName": "ASUS Official Store",
  "shopCity": "Jakarta",
  "isOfficialStore": true,
  "isPowerMerchant": true,
  "rating": 4.9,
  "reviewCount": 150,
  "soldCount": 500,
  "categoryName": "Laptops",
  "fetchedAt": "2026-09-18T10:00:00.000Z"
}
```

## Pricing

Pay-per-item: **$0.001** per product scraped.

| Tier | Price/Item |
|------|-----------|
| FREE | $0.001 |
| BRONZE | $0.0009 |
| SILVER | $0.0008 |
| GOLD+ | $0.0007 |

## Use Cases

- **Price monitoring** — track price changes over time
- **Market research** — analyze product trends and competition
- **Competitive intelligence** — monitor competitor pricing and stock
- **Data analysis** — build datasets for ML/AI projects
- **Dropshipping** — find suppliers and compare prices

## Limitations

- Tokopedia may rate-limit aggressive scraping. The actor includes random delays.
- Some fields may be null if Tokopedia doesn't return them for certain products.

## Legal

This actor only extracts publicly available listing data from Tokopedia. Use responsibly and comply with Tokopedia's terms of service.
