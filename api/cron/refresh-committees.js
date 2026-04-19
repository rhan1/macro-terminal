// Monthly re-pull of congressional committee assignments from the
// unitedstates/congress-legislators repo, written to Blob capitol/committees.json.
// The static file at src/data/committees.json serves as a build-time seed;
// this cron keeps the live data fresh without requiring a redeploy.
//
// The YAML parsing logic is duplicated from scripts/build-committees.js so
// the cron stays self-contained (no cross-package imports from a Vercel fn).
import { put } from "@vercel/blob";

const LEGISLATORS_URL = "https://unitedstates.github.io/congress-legislators/legislators-current.json";
const MEMBERSHIP_URL = "https://unitedstates.github.io/congress-legislators/committee-membership-current.yaml";
const COMMITTEES_URL = "https://unitedstates.github.io/congress-legislators/committees-current.yaml";
const BLOB_PATH = "capitol/committees.json";

function parseMembership(yaml) {
  const out = {};
  const lines = yaml.split(/\r?\n/);
  let current = null;
  let member = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line || line.startsWith("#")) continue;
    const topMatch = line.match(/^([A-Z0-9]+):\s*$/);
    if (topMatch) {
      current = topMatch[1];
      out[current] = [];
      member = null;
      continue;
    }
    const startMember = line.match(/^\s*-\s+(\w+):\s*(.*)$/);
    if (startMember && current) {
      if (member) out[current].push(member);
      member = {};
      member[startMember[1]] = startMember[2].replace(/^['"]|['"]$/g, "").trim();
      continue;
    }
    const kvMatch = line.match(/^\s+(\w+):\s*(.*)$/);
    if (kvMatch && member) {
      member[kvMatch[1]] = kvMatch[2].replace(/^['"]|['"]$/g, "").trim();
    }
  }
  if (current && member) out[current].push(member);
  return out;
}

function parseCommitteeNames(yaml) {
  const out = {};
  const lines = yaml.split(/\r?\n/);
  let currentId = null;
  let currentName = null;
  let inSubcommittees = false;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line || line.startsWith("#")) continue;
    if (/^-\s+type:/.test(line)) {
      if (currentId && currentName) out[currentId] = currentName;
      currentId = null;
      currentName = null;
      inSubcommittees = false;
      continue;
    }
    if (/^\s+subcommittees:\s*$/.test(line)) { inSubcommittees = true; continue; }
    if (inSubcommittees) continue;
    const nameMatch = line.match(/^\s+name:\s*(.*)$/);
    if (nameMatch && !currentName) currentName = nameMatch[1].replace(/^['"]|['"]$/g, "").trim();
    const idMatch = line.match(/^\s+thomas_id:\s*['"]?([A-Z0-9]+)['"]?\s*$/);
    if (idMatch && !currentId) currentId = idMatch[1];
  }
  if (currentId && currentName) out[currentId] = currentName;
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN missing" });

    const [legResp, memResp, comResp] = await Promise.all([
      fetch(LEGISLATORS_URL, { signal: AbortSignal.timeout(15000) }),
      fetch(MEMBERSHIP_URL, { signal: AbortSignal.timeout(15000) }),
      fetch(COMMITTEES_URL, { signal: AbortSignal.timeout(15000) }),
    ]);
    if (!legResp.ok || !memResp.ok || !comResp.ok) {
      return res.status(502).json({ error: "upstream fetch failed", statuses: [legResp.status, memResp.status, comResp.status] });
    }
    const [legislators, membershipYaml, committeesYaml] = await Promise.all([
      legResp.json(), memResp.text(), comResp.text(),
    ]);
    const membership = parseMembership(membershipYaml);
    const names = parseCommitteeNames(committeesYaml);

    const byBioguide = new Map();
    for (const [thomasId, memberList] of Object.entries(membership)) {
      for (const m of memberList) {
        const bio = m.bioguide;
        if (!bio) continue;
        if (!byBioguide.has(bio)) byBioguide.set(bio, []);
        const role = m.title || (String(m.rank) === "1" ? (m.party === "majority" ? "Chair" : "Ranking") : "Member");
        byBioguide.get(bio).push({ thomasId, name: names[thomasId] || thomasId, role });
      }
    }
    const members = [];
    for (const leg of legislators) {
      const bioguide = leg?.id?.bioguide;
      if (!bioguide) continue;
      const term = (leg.terms || []).slice(-1)[0] || {};
      members.push({
        bioguideId: bioguide,
        name: leg.name?.official_full || `${leg.name?.first || ""} ${leg.name?.last || ""}`.trim(),
        party: term.party || null,
        chamber: term.type === "rep" ? "H" : term.type === "sen" ? "S" : null,
        state: term.state || null,
        committees: byBioguide.get(bioguide) || [],
      });
    }
    if (members.length < 400) return res.status(502).json({ error: "suspicious member count", count: members.length });

    const fetchedAt = new Date().toISOString();
    await put(BLOB_PATH, JSON.stringify({ members, count: members.length, fetchedAt }), {
      access: "private",
      contentType: "application/json",
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.status(200).json({ ok: true, count: members.length, fetchedAt });
  } catch (err) {
    console.error(err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "unknown" });
  }
}
