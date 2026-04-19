#!/usr/bin/env node
// One-shot script that fetches congressional committee membership from the
// unitedstates/congress-legislators repo and writes src/data/committees.json.
// Run: `node scripts/build-committees.js`. Re-run quarterly — Congress
// committee assignments shift with each new session.
//
// The same parsing logic lives in api/cron/refresh-committees.js which keeps
// Blob in sync automatically. Both scripts are pure-JS YAML parsers because
// these YAML files are flat enough not to warrant pulling in a dep.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const LEGISLATORS_URL = "https://unitedstates.github.io/congress-legislators/legislators-current.json";
const MEMBERSHIP_URL = "https://unitedstates.github.io/congress-legislators/committee-membership-current.yaml";
const COMMITTEES_URL = "https://unitedstates.github.io/congress-legislators/committees-current.yaml";

const OUT_PATH = resolve(process.cwd(), "src/data/committees.json");

// Parses committee-membership-current.yaml into { thomasId: [{name, bioguide, party, rank, title}] }.
// The file has top-level `THOMAS_ID:` keys each followed by a list of inline
// `- key: value` pairs per member. No nested structures.
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

// Parses committees-current.yaml into { thomasId: name } — a shallow traversal
// that only needs the two fields from each top-level list entry.
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

function buildCommittees(legislators, membership, committeeNames) {
  // Flip membership to bioguide → [{thomasId, role}] for O(1) lookup while iterating legislators.
  const byBioguide = new Map();
  for (const [thomasId, members] of Object.entries(membership || {})) {
    for (const m of members) {
      const bio = m.bioguide;
      if (!bio) continue;
      if (!byBioguide.has(bio)) byBioguide.set(bio, []);
      // Rank 1 on the majority side → Chair; rank 1 on minority → Ranking. Everyone else → Member.
      const role = m.title || (String(m.rank) === "1" ? (m.party === "majority" ? "Chair" : "Ranking") : "Member");
      byBioguide.get(bio).push({ thomasId, name: committeeNames[thomasId] || thomasId, role });
    }
  }
  const out = [];
  for (const leg of legislators) {
    const bioguide = leg?.id?.bioguide;
    if (!bioguide) continue;
    const term = (leg.terms || []).slice(-1)[0] || {};
    out.push({
      bioguideId: bioguide,
      name: leg.name?.official_full || `${leg.name?.first || ""} ${leg.name?.last || ""}`.trim(),
      party: term.party || null,
      chamber: term.type === "rep" ? "H" : term.type === "sen" ? "S" : null,
      state: term.state || null,
      committees: byBioguide.get(bioguide) || [],
    });
  }
  return out;
}

async function main() {
  const [legResp, memResp, comResp] = await Promise.all([
    fetch(LEGISLATORS_URL),
    fetch(MEMBERSHIP_URL),
    fetch(COMMITTEES_URL),
  ]);
  if (!legResp.ok) throw new Error(`legislators fetch failed: ${legResp.status}`);
  if (!memResp.ok) throw new Error(`membership fetch failed: ${memResp.status}`);
  if (!comResp.ok) throw new Error(`committees fetch failed: ${comResp.status}`);
  const [legislators, membershipYaml, committeesYaml] = await Promise.all([
    legResp.json(),
    memResp.text(),
    comResp.text(),
  ]);
  const membership = parseMembership(membershipYaml);
  const names = parseCommitteeNames(committeesYaml);
  const data = buildCommittees(legislators, membership, names);
  if (data.length < 400) throw new Error(`suspicious data length: ${data.length}`);
  writeFileSync(OUT_PATH, JSON.stringify(data, null, 2));
  const withCommittees = data.filter((d) => d.committees.length > 0).length;
  console.log(`Wrote ${data.length} legislators (${withCommittees} with committees) → ${OUT_PATH}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
