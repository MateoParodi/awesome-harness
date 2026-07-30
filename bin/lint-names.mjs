#!/usr/bin/env node
/**
 * Awesome Harness — name lint.
 *
 * harness.json is the source of truth for playbook and agent names. This checks that the
 * rest of the repository agrees with it, because the alternative already happened once:
 * the 0.2 rename left headings, cross-references and docs pointing at playbooks that no
 * longer existed. A project whose thesis is "instructions drift until they only work in
 * one place" does not get to drift.
 *
 *   node bin/lint-names.mjs        # exits 1 with findings, 0 when clean
 *
 * No dependencies. Node 18+.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "harness.json"), "utf8"));

/** Names retired by a rename. Grows over time; never shrinks. */
const RETIRED = {
  "capture": "create-task",
  "plan": "start-task",
  "execute": "pipeline",
  "verify": "review-and-fix",
};

const findings = [];
const flag = (file, line, msg) => findings.push(`${file}:${line} — ${msg}`);

/* ── 1. harness.json entries must exist on disk ─────────────────────── */

for (const pb of MANIFEST.playbooks) {
  if (!existsSync(join(ROOT, "core", `${pb}.md`))) {
    flag("harness.json", 1, `playbook "${pb}" has no core/${pb}.md`);
  }
}
for (const agent of MANIFEST.agents) {
  if (!existsSync(join(ROOT, "agents", `${agent}.md`))) {
    flag("harness.json", 1, `agent "${agent}" has no agents/${agent}.md`);
  }
}

/* ── 2. every playbook file's H1 must match its filename ────────────── */

for (const pb of MANIFEST.playbooks) {
  const path = join(ROOT, "core", `${pb}.md`);
  if (!existsSync(path)) continue;
  const h1 = readFileSync(path, "utf8").match(/^# (.+)$/m)?.[1].trim();
  if (h1 !== pb) {
    flag(`core/${pb}.md`, 1, `H1 is "# ${h1}" but the canonical name is "${pb}"`);
  }
}

/* ── 3. no references to retired names ──────────────────────────────── */

const retiredAlt = Object.keys(RETIRED).join("|");
const PATTERNS = [
  // A path reference to a retired core file: core/execute.md
  { re: new RegExp(`core/(${retiredAlt})\\.md`), why: (m) => `references retired core/${m[1]}.md — now core/${RETIRED[m[1]]}.md` },
  // Prose naming a retired playbook: "the verify playbook", "**execute** playbook"
  { re: new RegExp(`\\b(${retiredAlt})\\*{0,2} playbook`), why: (m) => `"${m[1]} playbook" — the playbook is now "${RETIRED[m[1]]}"` },
  { re: new RegExp(`\\*\\*(${retiredAlt})\\*\\*\\s*$`), why: (m) => `line ends mid-reference to retired "**${m[1]}**" — now "${RETIRED[m[1]]}"` },
  // The old cycle spelled out
  { re: /capture → plan → execute/, why: () => "old playbook chain — now create-task → start-task → pipeline → review-and-fix → ship" },
  // A skill or command form of a retired name: /capture, skills/execute/
  { re: new RegExp(`skills/(${retiredAlt})/`), why: (m) => `generated skill path for retired "${m[1]}"` },
];

const SCAN_DIRS = ["core", "agents", "adapters", "trackers", "presets"];
const SCAN_FILES = ["README.md", "docs/index.html"];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(md|html|yml|json|mjs)$/.test(entry.name)) yield p;
  }
}

const targets = [
  ...SCAN_DIRS.flatMap((d) => (existsSync(join(ROOT, d)) ? [...walk(join(ROOT, d))] : [])),
  ...SCAN_FILES.map((f) => join(ROOT, f)).filter(existsSync),
];

for (const path of targets) {
  const rel = path.slice(ROOT.length + 1);
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, n) => {
    for (const { re, why } of PATTERNS) {
      const m = line.match(re);
      if (m) flag(rel, n + 1, why(m));
    }
  });
}

/* ── report ─────────────────────────────────────────────────────────── */

if (findings.length) {
  console.error(`✗ name lint — ${findings.length} finding(s):\n`);
  for (const f of findings) console.error(`  ${f}`);
  console.error(`\nharness.json names are canonical. Fix the reference, or update RETIRED in bin/lint-names.mjs after a deliberate rename.`);
  process.exit(1);
}
console.log(`✓ name lint — ${MANIFEST.playbooks.length} playbooks, ${MANIFEST.agents.length} agents, ${targets.length} files scanned, no stale references`);
