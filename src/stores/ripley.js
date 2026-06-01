export default {
  name: 'Ripley',
  buildSearchUrl(product) {
    return `https://simple.ripley.cl/search/${encodeURIComponent(product)}?sort=price_asc&page=1`;
  },
  waitSelector: '.product-item--wrapper',
  pageWaitMs: 5000,
};
