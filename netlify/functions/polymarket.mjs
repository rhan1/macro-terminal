import handler from '../../api/polymarket.js';
// api/polymarket.js is edge-style: export default async function handler()
// that takes no req/res args and returns a Response directly.
// The wrap() shim is not compatible — use a native Netlify v2 function instead.
export default async (request, context) => handler();
