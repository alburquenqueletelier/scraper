const CNSTRC_KEY = 'key_8pjkPsSkEsJHKgxR';
const CNSTRC_ZONE = 'pwcdauseo-zone.cnstrc.com';

export default {
  name: 'Paris.cl',
  buildSearchUrl(product) {
    return `https://www.paris.cl/search?q=${encodeURIComponent(product)}`;
  },
  async fetchProducts(product) {
    const url = `https://${CNSTRC_ZONE}/search/${encodeURIComponent(product)}?key=${CNSTRC_KEY}&section=Products&num_results_per_page=25&sort_by=relevance`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://www.paris.cl/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) throw new Error(`Constructor.io HTTP ${res.status}`);
    const data = await res.json();

    const products = (data.response?.results ?? [])
      .map((item) => {
        const d = item.data;
        const priceStr = d.displayedPrice != null
          ? `$${Number(d.displayedPrice).toLocaleString('es-CL')}`
          : null;
        return {
          name: item.value ?? null,
          prices: priceStr ? [priceStr] : [],
          url: d.url ?? null,
          badge: d.discountPercentage > 0 ? `-${d.discountPercentage}%` : null,
        };
      })
      .filter((p) => p.name || p.prices.length > 0);

    return { type: 'products', products };
  },
};
