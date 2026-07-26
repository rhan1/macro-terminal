import handler from '../../api/cron/refresh-economies.js';
import { wrap } from '../lib/vercel-shim.mjs';

// OECD unemployment runs as its own invocation, 2h after the main economies
// cron — the OECD rate limiter only allows ~one 46-call phase per window.
function unempHandler(req, res) {
  req.query = { ...(req.query || {}), part: "oecd-unemp" };
  return handler(req, res);
}

export default wrap(unempHandler, { cronSecret: true });
export const config = { schedule: "17 11 * * 1" };
