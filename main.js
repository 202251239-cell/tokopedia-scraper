/**
 * Tokopedia Product Search Scraper
 *
 * Uses PlaywrightCrawler (headless browser) to bypass Tokopedia's anti-bot.
 * On Apify cloud, residential proxies and browser rendering are handled by the platform.
 * Extracts product data from rendered search pages via __NEXT_DATA__ JSON + DOM fallback.
 *
 * Pricing model: Pay-per-event (charged per product scraped)
 */

import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { log } from 'crawlee';

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function buildSearchUrl(input) {
  const { searchTerms, sortBy, minPrice, maxPrice, officialStore, location } = input;
  const encoded = encodeURIComponent(searchTerms);
  const params = new URLSearchParams({ q: encoded, st: 'product' });

  // Sort mapping
  const sortMap = {
    newest: '5',
    price_high: '4',
    price_low: '3',
    popular: '2',
    reviews: '1',
  };
  if (sortBy && sortMap[sortBy]) params.set('ob', sortMap[sortBy]);

  if (minPrice) params.set('minprice', String(minPrice));
  if (maxPrice) params.set('maxprice', String(maxPrice));
  if (officialStore) params.set('official', '1');
  if (location) params.set('city', location);

  return `https://www.tokopedia.com/search?${params.toString()}`;
}

function normalizeProduct(raw) {
  // Handle both __NEXT_DATA__ format and DOM-extracted format
  const price = raw.price || {};
  const shop = raw.shop || {};
  const stats = raw.stats || {};

  return {
    id: raw.id || raw.productId || null,
    name: raw.name || raw.title || null,
    // Price
    price: typeof price.value === 'number' ? price.value : (raw.priceValue || null),
    priceText: price.text || raw.priceText || null,
    originalPrice: price.original || raw.originalPrice || null,
    discount: price.discount || raw.discount || null,
    discountPercent: price.discountPercent || raw.discountPercent || 0,
    currency: price.currency || 'IDR',
    // Product
    imageUrl: raw.imageUrl || raw.image || null,
    url: raw.url || raw.link || null,
    // Shop
    shopId: shop.id || raw.shopId || null,
    shopName: shop.name || raw.shopName || null,
    shopCity: shop.city || raw.shopCity || null,
    isOfficialStore: shop.isOfficial || raw.isOfficial || false,
    isPowerMerchant: shop.isPowerBadge || raw.isPowerBadge || false,
    // Stats
    reviewCount: stats.countReview || raw.reviewCount || 0,
    favoriteCount: stats.countFavorite || raw.favoriteCount || 0,
    soldCount: raw.soldCount || raw.countSold || null,
    // Category
    categoryName: raw.categoryName || null,
    // Metadata
    scrapedAt: new Date().toISOString(),
  };
}

/* ──────────────────────────────────────────────
   Main Actor
   ────────────────────────────────────────────── */

Actor.main(async () => {
  const input = await Actor.getInput();
  if (!input || !input.searchTerms) {
    throw new Error('Input "searchTerms" is required');
  }

  const maxPages = Math.min(input.maxPages || 1, 50);
  const baseUrl = buildSearchUrl(input);

  log.info(`Starting Tokopedia scrape: "${input.searchTerms}" (${maxPages} pages)`);
  log.info(`Base URL: ${baseUrl}`);

  let totalScraped = 0;

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 2,
    requestHandlerTimeoutSecs: 30,

    async requestHandler({ page, request, enqueueLinks }) {
      const currentPage = request.userData.page || 1;
      log.info(`Processing page ${currentPage}...`);

      // Wait for product cards to load
      try {
        await page.waitForSelector('[data-testid="divSRPContentProducts"], [data-testid="master-product-card"]', {
          timeout: 15000,
        });
      } catch {
        log.warning('Product cards not found, trying to extract from __NEXT_DATA__...');
      }

      // Strategy 1: Extract from __NEXT_DATA__ (faster, more reliable)
      let products = [];
      try {
        const nextData = await page.evaluate(() => {
          const el = document.querySelector('#__NEXT_DATA__');
          if (el) return JSON.parse(el.textContent);
          return null;
        });

        if (nextData) {
          const searchData = nextData?.props?.initialState?.products;
          if (searchData && Array.isArray(searchData)) {
            products = searchData;
          } else {
            // Try alternative path
            const queries = nextData?.props?.initialProps?.pageProps?.tabsState?.data?.products;
            if (queries) products = queries;
          }
          log.info(`Strategy 1 (NEXT_DATA): found ${products.length} products`);
        }
      } catch (err) {
        log.warning(`Strategy 1 failed: ${err.message}`);
      }

      // Strategy 2: DOM extraction (fallback)
      if (products.length === 0) {
        try {
          products = await page.evaluate(() => {
            const cards = document.querySelectorAll('[data-testid="master-product-card"], div[data-testid="divSRPContentProducts"] > div > div');
            return Array.from(cards).map((card) => {
              const nameEl = card.querySelector('[data-testid="linkProductName"], [data-testid="spnSRPProdName"]');
              const priceEl = card.querySelector('[data-testid="linkProductPrice"], [data-testid="spnSRPProdPrice"]');
              const imgEl = card.querySelector('img');
              const linkEl = card.querySelector('a[href*="/product/"], a[href*="tokopedia.com"]');
              const shopEl = card.querySelector('[data-testid="shopName"], [data-testid="spnSRPProdInfoShopName"]');
              const ratingEl = card.querySelector('[data-testid="rating"]');
              const soldEl = card.querySelector('[data-testid="countSold"], span[class*="terjual"]');
              const officialEl = card.querySelector('img[alt="Official Store"], [data-testid="officialBadge"]');

              // Parse price text to number
              const priceText = priceEl?.textContent?.trim() || '';
              const priceNum = parseInt(priceText.replace(/[^0-9]/g, ''), 10) || null;

              return {
                name: nameEl?.textContent?.trim() || null,
                price: priceNum,
                priceText: priceText,
                imageUrl: imgEl?.src || null,
                url: linkEl?.href || null,
                shopName: shopEl?.textContent?.trim() || null,
                reviewCount: parseInt(ratingEl?.textContent?.match(/\d+/)?.[0] || '0', 10),
                soldCount: soldEl?.textContent?.trim() || null,
                isOfficialStore: !!officialEl,
              };
            }).filter(p => p.name);
          });
          log.info(`Strategy 2 (DOM): found ${products.length} products`);
        } catch (err) {
          log.warning(`Strategy 2 failed: ${err.message}`);
        }
      }

      // Normalize and push
      for (const raw of products) {
        const normalized = normalizeProduct(raw);
        if (normalized.name) {
          await Actor.pushData(normalized);
          totalScraped++;
        }
      }

      log.info(`Page ${currentPage}: ${products.length} products scraped (total: ${totalScraped})`);
    },

    async failedRequestHandler({ request }, error) {
      log.error(`Request failed: ${request.url} — ${error.message}`);
    },
  });

  // Build request list
  const requests = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? baseUrl : `${baseUrl}&page=${page}`;
    requests.push({ url, userData: { page } });
  }

  await crawler.run(requests);

  // Push summary metadata
  await Actor.pushData({
    _metadata: {
      searchTerms: input.searchTerms,
      totalScraped,
      pages: maxPages,
      completedAt: new Date().toISOString(),
    },
  });

  log.info(`Done! Total: ${totalScraped} products from "${input.searchTerms}"`);
});
