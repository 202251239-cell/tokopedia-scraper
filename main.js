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
  // If price is already a number, fromRaw() already normalized — just add scrapedAt
  if (typeof raw.price === 'number' || (raw.price === null && raw.priceText)) {
    return { ...raw, scrapedAt: raw.scrapedAt || new Date().toISOString() };
  }
  // Otherwise normalize from raw Tokopedia data (DOM fallback path)
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
  // Tokopedia GraphQL wraps responses in an array: [{ data: { ... } }]
  // Unwrap first so all path lookups work on the inner object
  if (Array.isArray(json)) {
    if (json.length === 0) return { products: [], source: 'empty_array' };
    json = json[0];
  }
  if (!json || typeof json !== 'object') return { products: [], source: 'invalid' };

  // Try all known Tokopedia GraphQL response shapes
  const products = [];

  // Helper: normalize a raw product object from Tokopedia GraphQL
  function fromRaw(p) {
    if (!p || (!p.name && !p.title)) return null;

    const price = p.price || {};
    const shop = p.shop || {};
    const stats = p.stats || {};

    // Parse numeric price from various formats
    let numericPrice = null;
    if (typeof price === 'number') {
      numericPrice = price;
    } else if (typeof price === 'object' && price !== null) {
      numericPrice = typeof price.value === 'number' ? price.value : null;
    }
    // Fallback: parse from priceText string "Rp24.900" → 24900
    if (numericPrice === null) {
      const priceStr = price.text || p.priceText || p.price || '';
      if (typeof priceStr === 'string') {
        const cleaned = priceStr.replace(/[^0-9]/g, '');
        if (cleaned) numericPrice = parseInt(cleaned, 10) || null;
      }
    }

    // Parse imageUrl from various field names (Tokopedia uses mediaURL.image)
    const mediaUrl = p.mediaURL || {};
    const imageUrl = mediaUrl.image || p.imageUrl || p.image || p.imgUrl || p.thumbnail || p.thumb || null;

    // Parse discount
    let discount = null;
    if (typeof price === 'object' && price !== null) {
      // discountedValue is the actual discounted price amount
      discount = price.discountedValue || null;
      // If discount is a string like "69%", parse the number
      if (!discount && price.discount) {
        const pct = String(price.discount).replace(/[^0-9]/g, '');
        if (pct) discount = parseInt(pct, 10) || null;
      }
    }
    if (discount === null && p.discount) {
      const pct = String(p.discount).replace(/[^0-9]/g, '');
      if (pct) discount = parseInt(pct, 10) || null;
    }

    // Parse original price
    let originalPrice = null;
    if (typeof price === 'object' && price !== null) {
      originalPrice = price.original || null;
    }
    if (originalPrice === null) originalPrice = p.originalPrice || null;
    // Parse original price from string
    if (typeof originalPrice === 'string') {
      const cleaned = originalPrice.replace(/[^0-9]/g, '');
      if (cleaned) originalPrice = parseInt(cleaned, 10) || originalPrice;
    }

    // Computed discount fallback: originalPrice - price (must be before discountPercent)
    if (discount === null && numericPrice && originalPrice && typeof originalPrice === 'number') {
      discount = originalPrice - numericPrice;
    }

    // Parse discount percent
    let discountPercent = 0;
    if (typeof price === 'object' && price !== null) {
      discountPercent = price.discountPercent || 0;
      // Parse from string like "69%"
      if (!discountPercent && price.discount) {
        const pct = String(price.discount).replace(/[^0-9]/g, '');
        if (pct) discountPercent = parseInt(pct, 10) || 0;
      }
    }
    if (!discountPercent && p.discountPercent) discountPercent = p.discountPercent;
    // Compute from discount amount if still 0
    if (!discountPercent && discount && numericPrice && numericPrice > 0) {
      discountPercent = Math.round((discount / (discount + numericPrice)) * 100);
    }

    // Extract rating
    const rating = p.rating || {};
    const avgRating = typeof rating === 'number' ? rating : (rating.average || rating.count || 0);

    // Extract soldCount from various locations
    const soldCount = p.soldCount || p.countSold || p.meta?.countSold || null;

    // Extract reviewCount from rating object
    const reviewCount = stats.countReview || stats.reviewCount || rating.countReview || p.reviewCount || 0;

    // Extract favoriteCount from wishlist
    const wishlist = p.wishlist || {};
    const favoriteCount = stats.countFavorite || stats.favoriteCount || (typeof wishlist === 'number' ? wishlist : wishlist.count) || p.favoriteCount || 0;

    return {
      id: p.id || p.productId || null,
      name: p.name || p.title || null,
      price: numericPrice,
      priceText: (typeof price === 'object' ? price.text : null) || p.priceText || null,
      originalPrice: originalPrice,
      discount: discount,
      discountPercent: discountPercent,
      currency: (typeof price === 'object' ? price.currency : null) || 'IDR',
      imageUrl: imageUrl,
      url: p.url || p.link || null,
      shopId: shop.id || p.shopId || null,
      shopName: shop.name || p.shopName || null,
      shopCity: shop.city || p.shopCity || null,
      isOfficialStore: shop.isOfficial || p.isOfficial || false,
      isPowerMerchant: shop.isPowerBadge || p.isPowerBadge || false,
      rating: avgRating,
      reviewCount: reviewCount,
      favoriteCount: favoriteCount,
      soldCount: soldCount,
      categoryName: (p.category && p.category.name) || p.categoryName || null,
      scrapedAt: new Date().toISOString(),
    };
  }

  // Shape 1 (v5): { data: { ace_search_product_v5: { data: [...products] } } }
  // Tokopedia's SearchProductV5 puts products as a direct array under .data
  for (const vkey of ['ace_search_product_v5', 'ace_search_product_v4', 'ace_search_product_v3']) {
    const ace = json?.data?.[vkey];
    if (ace) {
      // Case A: products array is directly at ace.data
      if (Array.isArray(ace.data)) {
        for (const p of ace.data) {
          const n = fromRaw(p);
          if (n) products.push(n);
        }
        if (products.length > 0) {
          log.info(`Matched ${vkey} shape A (ace.data array): ${products.length} products`);
          return { products, source: `${vkey}_data_array` };
        }
      }
      // Case B: products nested at ace.data.products (older format)
      if (ace.data?.products && Array.isArray(ace.data.products)) {
        for (const p of ace.data.products) {
          const n = fromRaw(p);
          if (n) products.push(n);
        }
        if (products.length > 0) {
          log.info(`Matched ${vkey} shape B (ace.data.products): ${products.length} products`);
          return { products, source: `${vkey}_data_products` };
        }
      }
      // Case C: products directly at ace.products
      if (ace.products && Array.isArray(ace.products)) {
        for (const p of ace.products) {
          const n = fromRaw(p);
          if (n) products.push(n);
        }
        if (products.length > 0) {
          log.info(`Matched ${vkey} shape C (ace.products): ${products.length} products`);
          return { products, source: `${vkey}_products` };
        }
      }
      // Log what keys we see for debugging
      log.info(`${vkey} keys: ${JSON.stringify(Object.keys(ace))}`);
    }
  }

  // Shape 2: Generic scan — any key under json.data containing products
  const dataKeys = Object.keys(json?.data || {});
  for (const key of dataKeys) {
    const val = json.data[key];
    // Check various nesting patterns
    const candidates = [
      val?.data?.products,
      val?.products,
      val?.data,
    ].filter(Array.isArray);
    for (const arr of candidates) {
      for (const p of arr) {
        const n = fromRaw(p);
        if (n) products.push(n);
      }
      if (products.length > 0) {
        log.info(`Matched generic shape (json.data.${key}): ${products.length} products`);
        return { products, source: `generic_${key}` };
      }
    }
  }

  // Shape 3: data is array of products directly
  if (Array.isArray(json?.data)) {
    for (const p of json.data) {
      const n = fromRaw(p);
      if (n) products.push(n);
    }
    if (products.length > 0) {
      log.info(`Matched data_array shape: ${products.length} products`);
      return { products, source: 'data_array' };
    }
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

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    // goto (30s) + product wait (45s) + DOM fallback must fit inside this budget,
    // otherwise the handler is aborted mid-extraction and the run returns 0 items.
    requestHandlerTimeoutSecs: 120,

    async requestHandler({ page, request }) {
      const currentPage = request.userData.page || 1;
      log.info(`Processing page ${currentPage}...`);

      // Intercept all fetch/XHR responses. Products are extracted inside the
      // listener the moment a product-bearing response arrives — a blind sleep
      // was racing against SearchProductV5, which can land 30s+ after navigate.
      const PRODUCT_WAIT_MS = 45000;
      const capturedResponses = [];
      let allProducts = [];

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
            // Stream-extract: stop waiting as soon as products are available
            if (allProducts.length === 0) {
              const { products, source } = extractProductsFromApiResponse(json);
              if (products.length > 0) {
                allProducts = products;
                log.info(`Found ${products.length} products from ${source}`);
                // Field-discovery aid: with DEBUG_DUMP=1 the first raw product node
                // is written to the key-value store so new output fields can be
                // mapped against the real payload instead of guessed. Off by
                // default, and KV (not the dataset) so it is never billed.
                if (process.env.DEBUG_DUMP === '1') {
                  const raw = json?.data?.searchProductV5?.[0];
                  if (raw) {
                    await Actor.setValue('DEBUG_RAW', {
                      topLevelKeys: Object.keys(raw),
                      raw,
                    });
                    log.info('DEBUG_DUMP: wrote DEBUG_RAW to key-value store');
                  }
                }
              }
            }
          } catch { /* not json */ }
        }
      });

      // Navigate
      await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Event-driven wait: poll until a product-bearing response is captured, or
      // timeout. Exits early on success, so multi-page runs don't pay the full wait.
      log.info('Waiting for product data...');
      const deadline = Date.now() + PRODUCT_WAIT_MS;
      while (allProducts.length === 0 && Date.now() < deadline) {
        await page.waitForTimeout(1000);
      }

      log.info(`Captured ${capturedResponses.length} API responses`);

      // Fallback: sweep everything captured in case the streaming check missed
      if (allProducts.length === 0) {
        for (const { url, json } of capturedResponses) {
          const { products, source } = extractProductsFromApiResponse(json);
          if (products.length > 0) {
            log.info(`Found ${products.length} products from ${source}`);
            allProducts = products;
            break;
          }
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

      // Free memory by closing the page after extraction
      try { await page.close(); } catch {}
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

  // Write the run summary to the key-value store, NOT the default dataset.
  // With pay-per-event pricing on `apify-default-dataset-item`, every default
  // dataset row is charged to the user — the summary must not be billed.
  await Actor.setValue('SUMMARY', {
    searchTerms: input.searchTerms,
    totalScraped,
    pages: maxPages,
    completedAt: new Date().toISOString(),
  });

  log.info(`Done! Total: ${totalScraped} products from "${input.searchTerms}"`);
});
