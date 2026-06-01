// Entel is a telco — no keyword search; catalog is at miportal.entel.cl
export default {
  name: 'Entel',
  promoMode: true,
  buildSearchUrl() {
    return 'https://miportal.entel.cl/personas/catalogo/celulares';
  },
  promoUrl: 'https://miportal.entel.cl/personas/catalogo/celulares',
  waitSelector: '[class*="product-col"]',
  pageWaitMs: 7000,
};
