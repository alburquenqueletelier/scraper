export default {
  name: 'Lider',
  buildSearchUrl(product) {
    return `https://www.lider.cl/catalogo/search?Ntt=${encodeURIComponent(product)}&sortOrder=price_asc`;
  },
  waitSelector: '[class*="product-item"], [class*="shelf"], [class*="ProductCard"]',
  pageWaitMs: 3000,
};
