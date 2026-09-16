/**
 * Tokopedia Product Search Scraper v2
 *
 * PlaywrightCrawler with screenshot debugging + robust extraction.
 * Uses __NEXT_DATA__ JSON (primary) and DOM scraping (fallback).
 */

import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { log } from 'crawlee';

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function buildSearchUrl(input) {
  const { searchTerms, sortBy, minPrice, maxPrice, officialStore, location } = input;

  // Use plain string concat — URLSearchParams double-encodes
  let url = `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(searchTerms)}`;

  const sortMap = {
    newest: '5', price_high: '4', price_low: '3', popular: '2', reviews: '1',
  };
  if (sortBy && sortBy !== 'relevance' && sortMap[sortBy]) {
    url += `&ob=${sortMap[sortBy]}`;
  }
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
    requestHandlerTimeoutSecs: 60,
    // Reduce memory: disable screenshots in production, enable for debug
    headless: true,

    async requestHandler({ page, request }) {
      const currentPage = request.userData.page || 1;
      log.info(`Processing page ${currentPage}...`);

      // Navigate with longer wait
      await page.goto(request.url, { waitUntil: 'networkidle', timeout: 30000 });

      // Wait for content to settle
      await page.waitForTimeout(3000);

      // Debug: save screenshot
      const ssPath = `page-${currentPage}.png`;
      await page.screenshot({ path: ssPath, fullPage: false });
      log.info(`Screenshot saved: ${ssPath}`);

      // Debug: check page title and URL
      const title = await page.title();
      const currentUrl = page.url();
      log.info(`Page title: "${title}" | URL: ${currentUrl}`);

      // Check if we got captcha/challenge
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
      log.info(`Body preview: ${bodyText.slice(0, 200)}`);

      // Strategy 1: Extract from __NEXT_DATA__
      let products = [];
      try {
        const nextData = await page.evaluate(() => {
          const el = document.querySelector('#__NEXT_DATA__');
          if (el) {
            try { return JSON.parse(el.textContent); } catch { return null; }
          }
          // Also try window.__NEXT_DATA__
          if (window.__NEXT_DATA__) return window.__NEXT_DATA__;
          return null;
        });

        if (nextData) {
          log.info(`__NEXT_DATA__ found, keys: ${JSON.stringify(Object.keys(nextData?.props || {}))}`);

          // Try multiple paths where Tokopedia might put product data
          const candidates = [
            nextData?.props?.initialState?.products,
            nextData?.props?.initialProps?.pageProps?.tabsState?.data?.products,
            nextData?.props?.pageProps?.products,
            nextData?.props?.initialState?.search?.products,
          ];

          for (const c of candidates) {
            if (Array.isArray(c) && c.length > 0) {
              products = c;
              log.info(`NEXT_DATA path found ${products.length} products`);
              break;
            }
          }

          // If no array found, dump keys for debugging
          if (products.length === 0) {
            const stateKeys = Object.keys(nextData?.props?.initialState || {});
            const pagePropsKeys = Object.keys(nextData?.props?.initialProps?.pageProps || {});
            log.info(`initialState keys: ${JSON.stringify(stateKeys)}`);
            log.info(`pageProps keys: ${JSON.stringify(pagePropsKeys)}`);
          }
        } else {
          log.info('No __NEXT_DATA__ found on page');
        }
      } catch (err) {
        log.warning(`Strategy 1 error: ${err.message}`);
      }

      // Strategy 2: DOM extraction with flexible selectors
      if (products.length === 0) {
        try {
          products = await page.evaluate(() => {
            const results = [];

            // Try multiple selector strategies
            const selectors = [
              '[data-testid="master-product-card"]',
              '[data-testid="divSRPContentProducts"] > div > div > div',
              'a[data-testid="linkProductCard"]',
              'div[class*="product-card"]',
              'div[class*="css-"][class*="product"]',
            ];

            let cards = [];
            for (const sel of selectors) {
              cards = document.querySelectorAll(sel);
              if (cards.length > 0) break;
            }

            // If no cards found, try getting all links that look like products
            if (cards.length === 0) {
              const allLinks = document.querySelectorAll('a[href*="/product/"]');
              cards = allLinks;
            }

            for (const card of cards) {
              // Try multiple selectors for each field
              const nameEl = card.querySelector('[data-testid="linkProductName"]')
                || card.querySelector('[data-testid="spnSRPProdName"]')
                || card.querySelector('span[class*="product-name"]')
                || card.querySelector('h3, h2');

              const priceEl = card.querySelector('[data-testid="linkProductPrice"]')
                || card.querySelector('[data-testid="spnSRPProdPrice"]')
                || card.querySelector('span[class*="price"]')
                || card.querySelector('div[class*="price"]');

              const linkEl = card.closest('a') || card.querySelector('a[href*="tokopedia.com"]');

              const imgEl = card.querySelector('img[src*="tokopedia"]') || card.querySelector('img');

              const shopEl = card.querySelector('[data-testid="shopName"]')
                || card.querySelector('[data-testid="spnSRPProdInfoShopName"]')
                || card.querySelector('span[class*="shop"]');

              const name = nameEl?.textContent?.trim();
              if (!name) continue;

              const priceText = priceEl?.textContent?.trim() || '';
              const priceNum = parseInt(priceText.replace(/[^0-9]/g, ''), 10) || null;

              results.push({
                name,
                price: priceNum,
                priceText,
                url: linkEl?.href || null,
                imageUrl: imgEl?.src || null,
                shopName: shopEl?.textContent?.trim() || null,
              });
            }

            return results;
          });
          log.info(`Strategy 2 (DOM): found ${products.length} products`);
        } catch (err) {
          log.warning(`Strategy 2 error: ${err.message}`);
        }
      }

      // Strategy 3: Extract raw HTML for external parsing
      if (products.length === 0) {
        const html = await page.content();
        const { writeFileSync } = await import('fs');
        writeFileSync(`page-${currentPage}-raw.html`, html);
        log.info(`Saved raw HTML for debugging (${html.length} bytes)`);
      }

      // Normalize and push
      for (const raw of products) {
        const normalized = normalizeProduct(raw);
        if (normalized.name) {
          await Actor.pushData(normalized);
          totalScraped++;
        }
      }

      log.info(`Page ${currentPage}: ${products.length} products (total: ${totalScraped})`);
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

  // Push summary
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
