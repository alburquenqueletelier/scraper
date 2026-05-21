export default {
  name: 'Ripley',
  buildSearchUrl(product) {
    return `https://simple.ripley.cl/search?texto=${encodeURIComponent(product)}&sortBy=offer_price_asc`;
  },
  waitSelector: '[class*="catalog-product"], [class*="ProductCard"], [class*="product-item"]',
  pageWaitMs: 3000,
};
