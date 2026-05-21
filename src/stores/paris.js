export default {
  name: 'Paris.cl',
  buildSearchUrl(product) {
    return `https://www.paris.cl/search/?text=${encodeURIComponent(product)}&sortBy=price-asc`;
  },
  waitSelector: '[class*="pod"], [class*="product-list"], [class*="search-result"]',
  pageWaitMs: 3000,
};
