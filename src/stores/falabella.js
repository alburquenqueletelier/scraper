export default {
  name: 'Falabella',
  buildSearchUrl(product) {
    return `https://www.falabella.com/falabella-cl/search?Ntt=${encodeURIComponent(product)}&sortBy=PCS_Price|0`;
  },
  waitSelector: '[class*="pod"], [class*="product"], [class*="GridItem"]',
  pageWaitMs: 4000,
};
