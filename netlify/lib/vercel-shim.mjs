/**
 * vercel-shim.mjs
 *
 * Adapts a Vercel-style `export default async function handler(req, res)`
 * to a Netlify v2 function `(request, context) => Response`.
 *
 * Usage:
 *   import { wrap } from '../lib/vercel-shim.mjs';
 *   import handler from '../../api/fred.js';
 *   export default wrap(handler);
 *
 *   // For cron endpoints that check CRON_SECRET:
 *   export default wrap(handler, { cronSecret: true });
 */

/**
 * @param {Function} handler  Vercel-style handler(req, res)
 * @param {{ cronSecret?: boolean }} [opts]
 * @returns {(request: Request, context: unknown) => Promise<Response>}
 */
export function wrap(handler, opts = {}) {
  return async function netlifyHandler(request /*, context */) {
    // ── Build synthetic req ──────────────────────────────────────────────────

    const url = new URL(request.url);

    // query: plain object from URL search params
    const query = {};
    for (const [k, v] of url.searchParams.entries()) {
      query[k] = v;
    }

    // headers: plain lowercased object
    const headers = {};
    for (const [k, v] of request.headers.entries()) {
      headers[k.toLowerCase()] = v;
    }

    // body: parsed JSON for non-GET when content-type is application/json
    let body;
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      const ct = headers["content-type"] || "";
      if (ct.includes("application/json")) {
        try {
          body = await request.json();
        } catch {
          body = undefined;
        }
      }
    }

    const req = {
      method,
      url: request.url,
      query,
      headers,
      body,
    };

    // ── cronSecret injection ─────────────────────────────────────────────────
    // Covers three guard patterns seen in the codebase:
    //   1. req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`  (reseed.js)
    //   2. req.query.secret === process.env.CRON_SECRET                        (potential guard)
    //   3. req.headers['x-cron-secret'] === secret                             (alternative guard)
    if (opts.cronSecret) {
      const secret = process.env.CRON_SECRET || "";
      req.query.secret = secret;
      req.headers["authorization"] = `Bearer ${secret}`;
      req.headers["x-cron-secret"] = secret;
    }

    // ── Build synthetic res ──────────────────────────────────────────────────

    let _status = 200;
    const _headers = {};
    let _body = null;

    const res = {
      // writable statusCode property (some handlers set res.statusCode directly)
      get statusCode() {
        return _status;
      },
      set statusCode(code) {
        _status = code;
      },

      // chainable status(code)
      status(code) {
        _status = code;
        return this;
      },

      setHeader(key, value) {
        _headers[key.toLowerCase()] = String(value);
        return this;
      },

      getHeader(key) {
        return _headers[key.toLowerCase()];
      },

      json(obj) {
        _headers["content-type"] = "application/json";
        _body = JSON.stringify(obj);
        return this;
      },

      send(data) {
        if (data !== undefined && data !== null) {
          _body = typeof data === "string" ? data : JSON.stringify(data);
        }
        return this;
      },

      end(data) {
        if (data !== undefined && data !== null) {
          _body = typeof data === "string" ? data : JSON.stringify(data);
        }
        return this;
      },
    };

    // ── Invoke handler ───────────────────────────────────────────────────────

    try {
      await handler(req, res);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err?.message || String(err) }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    }

    // ── Build and return Netlify Response ────────────────────────────────────

    return new Response(_body ?? "", {
      status: _status,
      headers: _headers,
    });
  };
}
