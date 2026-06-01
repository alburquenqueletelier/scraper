// Claro is a telco — no keyword search; scrapes equipment+plan offer page
export default {
  name: 'Claro Chile',
  promoMode: true,
  buildSearchUrl() {
    return 'https://www.clarochile.cl/personas/ofertaplanconequipo/';
  },
  promoUrl: 'https://www.clarochile.cl/personas/ofertaplanconequipo/',
  waitSelector: '[class*="rounded-3xl"]',
  pageWaitMs: 5000,
};
