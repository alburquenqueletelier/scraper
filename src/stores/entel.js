// Entel is a telco — scrapes their promotions/equipo pages instead of a generic search
export default {
  name: 'Entel',
  promoMode: true,
  buildSearchUrl(product) {
    // Entel equipment search
    return `https://www.entel.cl/buscador/?q=${encodeURIComponent(product)}`;
  },
  // Fallback promo page if search returns nothing useful
  promoUrl: 'https://www.entel.cl/equipos/',
  waitSelector: '[class*="product"], [class*="card"], [class*="item"], [class*="equipo"]',
  pageWaitMs: 4000,
};
