/**
 * netlify-blob.mjs
 *
 * Storage adapter over @netlify/blobs that mirrors the @vercel/blob surface
 * used by the macro-terminal API routes.
 *
 * Vercel patterns replaced:
 *
 *   // Read path (api/*.js)
 *   import { head } from "@vercel/blob";
 *   const meta = await head(BLOB_PATH, { token });
 *   const resp = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
 *   const body = await resp.json();
 *
 *   // Direct-URL read path (overview-narrative.js, egs.js)
 *   const resp = await fetch(HARDCODED_BLOB_URL, { headers: { Authorization: `Bearer ${token}` } });
 *   const body = await resp.json();
 *
 *   // Write path (api/cron/*.js)
 *   import { put } from "@vercel/blob";
 *   await put(key, JSON.stringify(obj), { access: "private", contentType: "application/json", token, addRandomSuffix: false, allowOverwrite: true });
 *
 * Netlify replacements (this file):
 *
 *   import { getJSON, putJSON, get, put, head } from '../lib/netlify-blob.mjs';
 *
 *   getJSON(key)           — getStore().get(key, { type: 'json' })
 *   putJSON(key, obj)      — getStore().setJSON(key, obj)
 *   get(key)               — getStore().get(key, { type: 'text' })  (raw text/buffer)
 *   put(key, data, opts)   — getStore().set(key, data, { metadata })
 *   head(key)              — getStore().getMetadata(key)
 *
 * The store name 'macro-terminal' matches the Netlify Blobs store configured
 * for this site. All keys are the existing blob pathnames, e.g.:
 *   'overview/narrative.json'
 *   'egs/snapshot.json'
 *   'egs/history.json'
 *   'shipments/incidents.json'
 *   'shipments/advisories.json'
 *   'shipments/portwatch.json'
 *   'global/yields.json'
 *   'trends/terms.json'
 *   'capitol/trades.json'
 *   'labor/layoffs-structured.json'
 */

import { getStore } from "@netlify/blobs";

const STORE_NAME = "macro-terminal";

function store() {
  // Local/off-platform runs (seed scripts, cron debugging) can't use the
  // ambient function context — pass explicit credentials via env instead.
  const { NETLIFY_LOCAL_SITE_ID, NETLIFY_LOCAL_BLOB_TOKEN } = process.env;
  if (NETLIFY_LOCAL_SITE_ID && NETLIFY_LOCAL_BLOB_TOKEN) {
    return getStore({ name: STORE_NAME, siteID: NETLIFY_LOCAL_SITE_ID, token: NETLIFY_LOCAL_BLOB_TOKEN });
  }
  return getStore(STORE_NAME);
}

/**
 * Read a blob key and JSON-parse it.
 * Returns null (not throws) when the key does not exist.
 *
 * Replaces the two-step Vercel pattern:
 *   const meta = await head(key, { token });
 *   const resp = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
 *   const body = await resp.json();
 *
 * And the direct-URL pattern:
 *   const resp = await fetch(HARDCODED_URL, { headers: { Authorization: `Bearer ${token}` } });
 *   const body = await resp.json();
 *
 * @param {string} key  blob pathname, e.g. 'overview/narrative.json'
 * @returns {Promise<any|null>}
 */
export async function getJSON(key) {
  try {
    const value = await store().get(key, { type: "json" });
    return value ?? null;
  } catch {
    return null;
  }
}

/**
 * Serialise obj as JSON and write it to the store under key.
 *
 * Replaces:
 *   await put(key, JSON.stringify(obj), { access: "private", contentType: "application/json", token, addRandomSuffix: false, allowOverwrite: true });
 *
 * @param {string} key
 * @param {any} obj
 * @returns {Promise<void>}
 */
export async function putJSON(key, obj) {
  await store().setJSON(key, obj);
}

/**
 * Read a blob key as raw text.
 * Returns null when the key does not exist.
 *
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function get(key) {
  try {
    const value = await store().get(key, { type: "text" });
    return value ?? null;
  } catch {
    return null;
  }
}

/**
 * Write raw data (string, Buffer, ArrayBuffer, ReadableStream) to a key.
 * opts mirrors the @vercel/blob put() options shape; only contentType is
 * forwarded (access/token/addRandomSuffix/allowOverwrite are Vercel-specific
 * and have no Netlify equivalent — Netlify Blobs are always private to the
 * site, and keys are always upserted without random suffixes).
 *
 * Replaces:
 *   await put(key, data, { access: "private", contentType: "...", token, ... });
 *
 * @param {string} key
 * @param {string|Buffer|ArrayBuffer|ReadableStream} data
 * @param {{ contentType?: string } & Record<string, unknown>} [opts]
 * @returns {Promise<void>}
 */
export async function put(key, data, opts = {}) {
  const setOpts = {};
  if (opts.contentType) {
    setOpts.metadata = { contentType: opts.contentType };
  }
  await store().set(key, data, setOpts);
}

/**
 * Return metadata for a key, or null when the key does not exist.
 *
 * Vercel's head() returns { url, size, uploadedAt, ... }; Netlify's
 * getMetadata() returns { etag, size, uploadedAt, ... }.
 * The Vercel callers only use `meta.url` to issue a follow-up fetch, so the
 * adapter exposes a synthetic `url` field that is a data: URI for very small
 * blobs, but in practice callers should be migrated to use getJSON() instead.
 *
 * For the migration spec below, every head() + fetch(meta.url) pair is
 * replaced by a single getJSON() call, so this function is provided for
 * completeness / any remaining callers that truly need metadata.
 *
 * @param {string} key
 * @returns {Promise<object|null>}
 */
export async function head(key) {
  try {
    const meta = await store().getMetadata(key);
    return meta ?? null;
  } catch {
    return null;
  }
}
