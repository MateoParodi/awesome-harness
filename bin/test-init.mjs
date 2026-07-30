#!/usr/bin/env node
/**
 * Awesome Harness — installer smoke test.
 *
 * init.mjs writes into people's repositories and edits .git/info/exclude — a tool that
 * does that untested is a footgun with a README. This exercises the non-TTY path (piped
 * answers) against throwaway git fixtures and asserts every promise the installer makes:
 *
 *   1. a fresh init writes the config, the adapters, the manifest, and the excludes
 *   2. the produced config validates against the schema
 *   3. re-init removes stale generated files from a previous run (the rename case)
 *   4. a tracked AGENTS.md is never touched
 *
 *   node bin/test-init.mjs
 *
 * No dependencies. Node 18+.
 */

import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INIT = join(HARNESS, "bin", "init.mjs");
const VALIDATE = join(HARNESS, "bin", "validate.mjs");

let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

function sh(cwd, cmd, args, input = null) {
  return execFileSync(cmd, args, {
    cwd, encoding: "utf8",
    input: input ?? undefined,
    stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"],
  });
}

function gitFixture() {
  const dir = mkdtempSync(join(tmpdir(), "harness-test-"));
  sh(dir, "git", ["init", "-q", "-b", "main"]);
  sh(dir, "git", ["config", "user.email", "test@harness.invalid"]);
  sh(dir, "git", ["config", "user.name", "harness-test"]);
  return dir;
}

function runInit(cwd, answers) {
  return sh(cwd, process.execPath, [INIT], answers.join("\n") + "\n");
}

/* Answer order mirrors the ask() sequence in init.mjs. Empty string = accept default. */
const NODE_ANSWERS = [
  "",            // stack (detected: node)
  "fixture",     // project name
  "",            // tracker (notion)
  "",            // board env var
  "",            // marker field
  "", "", "", "", "",  // five state mappings
  "Sprint",      // iteration property (sprint board)
  "",            // current-iteration predicate (default)
  "HARNESS_ASSIGNEE", // assignee env var
  "y",           // use proposed verify chain
  "",            // push policy (never)
  "",            // commit language
  "",            // review model
  "",            // critical model
  "",            // extra tools
  "both",        // adapters
];

/* ── 1 + 2: fresh init on a node fixture ────────────────────────────── */

console.log("\nfresh init (node fixture, both adapters)");
{
  const dir = gitFixture();
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: "fixture",
    scripts: { typecheck: "true", lint: "true", test: "true" },
  }, null, 2));
  sh(dir, "git", ["add", "package.json"]);
  sh(dir, "git", ["commit", "-qm", "init"]);

  const out = runInit(dir, NODE_ANSWERS);

  check(existsSync(join(dir, ".harness/config.yml")), "writes .harness/config.yml");
  check(existsSync(join(dir, ".harness/generated.json")), "writes the generated-files manifest");
  for (const pb of ["create-task", "start-task", "pipeline", "review-and-fix", "ship"]) {
    check(existsSync(join(dir, `.claude/skills/${pb}/SKILL.md`)), `writes skill ${pb}`);
  }
  for (const agent of ["reviewer", "critical-reviewer", "fixer"]) {
    check(existsSync(join(dir, `.claude/agents/${agent}.md`)), `writes agent ${agent}`);
  }
  const agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
  check(agentsMd.includes("awesome-harness:start"), "writes the AGENTS.md block");

  const exclude = readFileSync(join(dir, ".git/info/exclude"), "utf8");
  check(exclude.includes(".claude/skills/create-task/"), "excludes generated skills locally");
  check(exclude.includes(".harness/state.json"), "excludes the cursor");
  check(exclude.includes(".harness/generated.json"), "excludes the manifest");
  check(!out.includes("does not validate"), "produced config raises no schema warning");

  const cfg = readFileSync(join(dir, ".harness/config.yml"), "utf8");
  check(cfg.includes("assignee: ${HARNESS_ASSIGNEE}"), "config carries the assignee env reference");
  check(cfg.includes('from: "Sprint"'), "config carries the iteration property");
  check(cfg.includes('current: "Sprint status is Current"'), "config carries the current-iteration predicate");

  try {
    sh(dir, process.execPath, [VALIDATE, ".harness/config.yml"]);
    check(true, "config validates against the schema");
  } catch (e) {
    check(false, `config validates against the schema — ${e.stdout || e.message}`);
  }

  const tracked = sh(dir, "git", ["status", "--porcelain"]).split("\n").filter((l) => l && !l.startsWith("??"));
  check(tracked.length === 0, "no tracked file was modified");

  /* ── 3: re-init cleans up stale generated files ──────────────────── */

  console.log("\nre-init after a playbook rename (stale cleanup)");
  const staleSkill = join(dir, ".claude/skills/capture/SKILL.md");
  mkdirSync(dirname(staleSkill), { recursive: true });
  writeFileSync(staleSkill, "# capture\nstale pointer\n");
  const manifest = JSON.parse(readFileSync(join(dir, ".harness/generated.json"), "utf8"));
  manifest.paths.push(".claude/skills/capture/SKILL.md");
  writeFileSync(join(dir, ".harness/generated.json"), JSON.stringify(manifest, null, 2));

  runInit(dir, NODE_ANSWERS);

  check(!existsSync(staleSkill), "stale skill file removed");
  check(!existsSync(dirname(staleSkill)), "empty stale skill directory pruned");
  check(existsSync(join(dir, ".claude/skills/create-task/SKILL.md")), "current skills still present");
  const manifest2 = JSON.parse(readFileSync(join(dir, ".harness/generated.json"), "utf8"));
  check(!manifest2.paths.includes(".claude/skills/capture/SKILL.md"), "manifest no longer lists the stale path");

  rmSync(dir, { recursive: true, force: true });
}

/* ── 4: a tracked AGENTS.md is never touched ────────────────────────── */

console.log("\ntracked AGENTS.md (unknown stack, agents-md adapter)");
{
  const dir = gitFixture();
  writeFileSync(join(dir, "AGENTS.md"), "# Team conventions\nDo not touch.\n");
  sh(dir, "git", ["add", "AGENTS.md"]);
  sh(dir, "git", ["commit", "-qm", "team file"]);

  const answers = [
    "plain", "fixture2", "", "", "",
    "", "", "", "", "",
    "", "",  // iteration (empty = kanban, skips the predicate question) · assignee (none)
    // no preset for "plain" → no chain confirmation question
    "", "", "", "", "",
    "agents-md",
  ];
  const out = runInit(dir, answers);

  check(readFileSync(join(dir, "AGENTS.md"), "utf8") === "# Team conventions\nDo not touch.\n",
    "tracked AGENTS.md left byte-for-byte untouched");
  const cfg2 = readFileSync(join(dir, ".harness/config.yml"), "utf8");
  check(!cfg2.includes("iteration:") && !cfg2.includes("assignee:"),
    "kanban board writes no iteration or assignee keys");
  check(out.includes("TRACKED"), "installer says why it did not write");
  check(out.includes("TODO"), "unknown stack leaves the gate as an explicit TODO");

  rmSync(dir, { recursive: true, force: true });
}

/* ── report ─────────────────────────────────────────────────────────── */

if (failures) {
  console.error(`\n✗ ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\n✓ installer smoke test passed");
