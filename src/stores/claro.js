// Claro is a telco — scrapes their promotions/smartphones pages instead of a generic search
export default {
  name: 'Claro Chile',
  promoMode: true,
  buildSearchUrl(product) {
    // Claro equipment/smartphone catalog
    return `https://www.clarochile.cl/personas/servicios/servicios-moviles/postpago/smartphone/?search=${encodeURIComponent(product)}`;
  },
  // Fallback promo page
  promoUrl: 'https://www.clarochile.cl/personas/servicios/servicios-moviles/postpago/smartphone/',
  waitSelector: '[class*="product"], [class*="card"], [class*="item"], [class*="smartphone"]',
  pageWaitMs: 4000,
};
