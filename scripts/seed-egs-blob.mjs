// One-time seed script: uploads current egs-snapshot.json + egs-history.json
// to Vercel Blob so the cloud refresh function has a starting point with
// preserved history. Requires BLOB_READ_WRITE_TOKEN in the environment.

import { readFile } from "node:fs/promises";
import { put } from "@vercel/blob";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN not set");
  process.exit(1);
}

async function seed(localPath, blobKey) {
  const body = await readFile(localPath);
  const result = await put(blobKey, body, {
    access: "private",
    contentType: "application/json",
    token: BLOB_TOKEN,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  console.log(`uploaded ${localPath} → ${result.pathname}`);
  console.log(`  url: ${result.url}`);
  return result;
}

const snap = await seed("/Users/razakhan/Documents/Projects/macro-terminal/data/egs-snapshot.json", "egs/snapshot.json");
const hist = await seed("/Users/razakhan/Documents/Projects/macro-terminal/data/egs-history.json",  "egs/history.json");

console.log("\n--- save these to vercel env ---");
console.log(`EGS_SNAPSHOT_BLOB_URL=${snap.url}`);
console.log(`EGS_HISTORY_BLOB_URL=${hist.url}`);
