/**
 * Tokopedia Product Search Scraper v3
 *
 * Intercepts XHR/fetch responses from Tokopedia's internal API
 * instead of parsing DOM. Much more reliable.
 */

import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { log } from 'crawlee';

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function buildSearchUrl(input) {
  const { searchTerms, sortBy, minPrice, maxPrice, officialStore, location } = input;
  let url = `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(searchTerms)}`;

  const sortMap = {
    newest: '5', price_high: '4', price_low: '3', popular: '2', reviews: '1',
  };
  if (sortBy && sortBy !== 'relevance' && sortMap[sortBy]) url += `&ob=${sortMap[sortBy]}`;
  if (minPrice && minPrice > 0) url += `&minprice=${minPrice}`;
  if (maxPrice && maxPrice > 0) url += `&maxprice=${maxPrice}`;
  if (officialStore) url += `&official=1`;
  if (location) url += `&city=${encodeURIComponent(location)}`;

  return url;
}

function normalizeProduct(raw) {
  const price = raw.price || {};
  const shop = raw.shop || {};
  const stats = raw.stats || {};
  return {
    id: raw.id || raw.productId || null,
    name: raw.name || raw.title || null,
    price: typeof price.value === 'number' ? price.value : (raw.priceValue || null),
    priceText: price.text || raw.priceText || null,
    originalPrice: price.original || raw.originalPrice || null,
    discount: price.discount || raw.discount || null,
    discountPercent: price.discountPercent || raw.discountPercent || 0,
    currency: price.currency || 'IDR',
    imageUrl: raw.imageUrl || raw.image || null,
    url: raw.url || raw.link || null,
    shopId: shop.id || raw.shopId || null,
    shopName: shop.name || raw.shopName || null,
    shopCity: shop.city || raw.shopCity || null,
    isOfficialStore: shop.isOfficial || raw.isOfficial || false,
    isPowerMerchant: shop.isPowerBadge || raw.isPowerBadge || false,
    reviewCount: stats.countReview || raw.reviewCount || 0,
    favoriteCount: stats.countFavorite || raw.favoriteCount || 0,
    soldCount: raw.soldCount || raw.countSold || null,
    categoryName: raw.categoryName || null,
    scrapedAt: new Date().toISOString(),
  };
}

function extractProductsFromApiResponse(json) {
  // Try all known response shapes
  const products = [];

  // Shape 1: { data: { ace_search_product_v4: { data: { products: [...] } } } }
  const ace = json?.data?.ace_search_product_v4?.data?.products;
  if (ace && Array.isArray(ace)) {
    for (const p of ace) {
      products.push({
        id: p.id,
        name: p.name,
        price: p.price?.value || null,
        priceText: p.price?.text || null,
        originalPrice: p.price?.original || null,
        discount: p.price?.discount || null,
        discountPercent: p.price?.discountPercent || 0,
        imageUrl: p.imageUrl || null,
        url: p.url || null,
        shopName: p.shop?.name || null,
        shopCity: p.shop?.city || null,
        isOfficialStore: p.shop?.isOfficial || false,
        isPowerMerchant: p.shop?.isPowerBadge || false,
        reviewCount: p.stats?.countReview || 0,
        favoriteCount: p.stats?.countFavorite || 0,
        categoryName: p.category?.name || null,
      });
    }
    if (products.length > 0) return { products, source: 'ace_gql' };
  }

  // Shape 2: { data: { ... products embedded in response } }
  const dataKeys = Object.keys(json?.data || {});
  for (const key of dataKeys) {
    const val = json.data[key];
    if (val?.data?.products && Array.isArray(val.data.products)) {
      for (const p of val.data.products) {
        products.push({
          id: p.id,
          name: p.name,
          price: p.price?.value || null,
          priceText: p.price?.text || null,
          imageUrl: p.imageUrl || null,
          url: p.url || null,
          shopName: p.shop?.name || null,
          reviewCount: p.stats?.countReview || 0,
        });
      }
      if (products.length > 0) return { products, source: key };
    }
  }

  // Shape 3: data is array of products directly
  if (Array.isArray(json?.data)) {
    for (const p of json.data) {
      if (p.name && (p.price || p.url)) {
        products.push({
          id: p.id || p.productId || null,
          name: p.name,
          price: p.price?.value || p.priceValue || null,
          priceText: p.price?.text || null,
          imageUrl: p.imageUrl || p.image || null,
          url: p.url || p.link || null,
          shopName: p.shop?.name || p.shopName || null,
          reviewCount: p.stats?.countReview || p.reviewCount || 0,
        });
      }
    }
    if (products.length > 0) return { products, source: 'data_array' };
  }

  return { products: [], source: 'none' };
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
  const apiResponses = [];

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 60,

    async requestHandler({ page, request }) {
      const currentPage = request.userData.page || 1;
      log.info(`Processing page ${currentPage}...`);

      // Intercept all fetch/XHR responses
      const capturedResponses = [];
      page.on('response', async (response) => {
        const url = response.url();
        const ct = response.headers()['content-type'] || '';

        // Capture JSON responses from Tokopedia's API endpoints
        if (ct.includes('json') && (
          url.includes('gql.tokopedia.com') ||
          url.includes('ace_search') ||
          url.includes('SearchProduct') ||
          url.includes('/graphql/') ||
          url.includes('gql')
        )) {
          try {
            const json = await response.json();
            capturedResponses.push({ url, json });
            log.info(`Captured API response: ${url.slice(0, 100)}...`);
          } catch { /* not json */ }
        }
      });

      // Navigate
      await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for products to load — try multiple strategies
      log.info('Waiting for products to load...');

      // Wait for either product cards OR API responses
      try {
        await Promise.race([
          page.waitForSelector('[data-testid="master-product-card"], [data-testid="linkProductCard"], div[data-testid="divSRPContentProducts"]', { timeout: 20000 }),
          new Promise(resolve => setTimeout(resolve, 25000)),
        ]);
      } catch { /* timeout ok */ }

      // Extra wait for lazy loading
      await page.waitForTimeout(5000);

      // Also scroll down to trigger lazy load
      await page.evaluate(() => window.scrollBy(0, 2000));
      await page.waitForTimeout(3000);

      log.info(`Captured ${capturedResponses.length} API responses`);

      // Try to extract from captured API responses
      let allProducts = [];
      for (const { url, json } of capturedResponses) {
        const { products, source } = extractProductsFromApiResponse(json);
        if (products.length > 0) {
          log.info(`Found ${products.length} products from ${source}`);
          allProducts = products;
          break;
        }
      }

      // Fallback: extract from __NEXT_DATA__ or DOM
      if (allProducts.length === 0) {
        log.info('No API products, trying DOM extraction...');

        // Try __NEXT_DATA__ one more time
        try {
          const nextData = await page.evaluate(() => {
            const el = document.querySelector('#__NEXT_DATA__');
            if (el) return JSON.parse(el.textContent);
            return window.__NEXT_DATA__ || null;
          });
          if (nextData) {
            // Dump structure for debugging
            const keys = Object.keys(nextData?.props || {});
            log.info(`NEXT_DATA props keys: ${JSON.stringify(keys)}`);
          }
        } catch {}

        // DOM extraction with very flexible selectors
        try {
          allProducts = await page.evaluate(() => {
            const results = [];
            // Find all anchor elements that link to products
            const links = document.querySelectorAll('a[href*="/product/"]');
            for (const link of links) {
              const card = link.closest('div') || link;
              const name = link.getAttribute('title')
                || card.querySelector('span')?.textContent?.trim();
              const priceText = card.querySelector('span[class*="price"], div[class*="price"]')?.textContent?.trim();
              if (name && name.length > 5) {
                results.push({
                  name,
                  priceText: priceText || null,
                  url: link.href,
                });
              }
            }
            return results;
          });
          log.info(`DOM fallback: ${allProducts.length} products`);
        } catch (err) {
          log.warning(`DOM fallback error: ${err.message}`);
        }
      }

      // Normalize and push
      for (const raw of allProducts) {
        const normalized = normalizeProduct(raw);
        if (normalized.name) {
          await Actor.pushData(normalized);
          totalScraped++;
        }
      }

      log.info(`Page ${currentPage}: ${allProducts.length} products (total: ${totalScraped})`);
    },

    async failedRequestHandler({ request }, error) {
      log.error(`Request failed: ${request.url} — ${error.message}`);
    },
  });

  const requests = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? baseUrl : `${baseUrl}&page=${page}`;
    requests.push({ url, userData: { page } });
  }

  await crawler.run(requests);

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
