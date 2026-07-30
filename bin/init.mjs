#!/usr/bin/env node
/**
 * Awesome Harness — project initialiser.
 *
 * Wires the current repository to the global core: writes one committed config file,
 * generates agent adapters, and adds everything else to the repository's LOCAL-ONLY
 * ignore file so personal tooling never reaches a shared tree.
 *
 * No dependencies. Node 18+.
 *
 * Design rules this script must obey:
 *   - Never guess the verification chain. A gate that always passes is worse than no gate.
 *   - Never edit a tracked file the harness does not own.
 *   - Never write a literal tracker identifier into the committed config.
 *   - Print exactly what was written and what was excluded. Nothing implicit.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CORE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(CORE, "harness.json"), "utf8")).version;

const PLAYBOOKS = ["capture", "plan", "execute", "verify", "ship"];
const MARK_START = "<!-- awesome-harness:start -->";
const MARK_END = "<!-- awesome-harness:end -->";

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

const written = [];
const excluded = [];
const warnings = [];

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function isTracked(path) {
  return git("ls-files", "--error-unmatch", path) !== null;
}

function die(msg) {
  console.error(`\n${c.red("✗")} ${msg}\n`);
  process.exit(1);
}

/* ── stack detection ────────────────────────────────────────────────── */

function detectStack() {
  const hits = [];
  if (existsSync("package.json")) hits.push({ stack: "node", why: "package.json" });
  if (existsSync("ProjectSettings") || existsSync("Assets")) {
    hits.push({ stack: "editor-driven", why: "engine project directories" });
  }
  if (existsSync("Cargo.toml")) hits.push({ stack: "rust", why: "Cargo.toml" });
  if (existsSync("go.mod")) hits.push({ stack: "go", why: "go.mod" });
  if (existsSync("pyproject.toml")) hits.push({ stack: "python", why: "pyproject.toml" });
  return hits;
}

/** Read a preset's verify chain so it can be PROPOSED, never silently adopted. */
function presetVerify(stack) {
  const p = join(CORE, "presets", `${stack}.yml`);
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, "utf8").split("\n");
  const out = [];
  let inVerify = false;
  for (const line of lines) {
    if (/^verify:/.test(line)) { inVerify = true; continue; }
    if (inVerify && /^\S/.test(line)) break;
    if (inVerify && line.trim()) out.push(line);
  }
  return out.length ? out.join("\n") : null;
}

/**
 * Which proposed commands this repository cannot actually run.
 *
 * Only checks what is checkable — package manager scripts. A bare binary might be on the
 * PATH, and an editor integration cannot be probed from here at all, so those are left
 * alone rather than reported as false positives. Silence from this function means
 * "nothing provably missing", not "verified working".
 */
function unresolvableCommands(chain) {
  const runLines = [...chain.matchAll(/^\s*run:\s*(.+)$/gm)].map((m) => m[1].trim());
  if (!runLines.length || !existsSync("package.json")) return [];

  let scripts = {};
  try {
    scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts ?? {};
  } catch {
    return [];
  }

  const missing = [];
  for (const cmd of runLines) {
    const m = cmd.match(/^(?:npm run|pnpm run|yarn run|pnpm|yarn|bun run)\s+([\w:-]+)/);
    const bare = cmd.match(/^(?:npm|pnpm|yarn|bun)\s+(test|start|build)$/);
    const name = m?.[1] ?? bare?.[1];
    if (name && !(name in scripts)) missing.push(name);
  }
  return [...new Set(missing)];
}

/* ── writers ───────────────────────────────────────────────────────── */

function writeConfig(answers) {
  mkdirSync(".harness", { recursive: true });
  const path = ".harness/config.yml";

  if (existsSync(path)) {
    warnings.push(`${path} already existed and was left untouched — delete it to regenerate.`);
    return;
  }

  const yml = `# Awesome Harness — project config
# THE ONLY FILE HERE THAT IS COMMITTED. Project truth: the gate, the state map, the rules.
# Safe to commit because identifiers are \${ENV_VAR} references, never literals.

harness:
  version: ${VERSION}

project: ${answers.project}
stack: ${answers.stack}

tracker:
  kind: ${answers.tracker}
  board: \${${answers.boardEnv}}
  shared: true
  marker_field: ${answers.markerField}
  cache_ttl: 5m
  states:
    queued:    "${answers.states.queued}"
    running:   "${answers.states.running}"
    verified:  "${answers.states.verified}"
    in_review: "${answers.states.in_review}"
    blocked:   "${answers.states.blocked}"

# CONFIRMED BY THE OPERATOR AT INIT — the one section never guessed.
verify:
${answers.verify}

vcs:
  branch: current
  push: ${answers.push}
  language: ${answers.language}
  attribution: none
  pr:
    enabled: ${answers.push !== "never"}
    granularity: run
    draft: true
    link: ${answers.tracker === "github-issues" ? "issue-ref" : "url"}

agents:
  review_model: ${answers.reviewModel}
  critical_model: ${answers.criticalModel}
  extra_tools: [${answers.extraTools.join(", ")}]

rules: []

preflight:
  - working tree clean, or the operator accepted the mixing
  - current branch is not the default branch when pushing is enabled
`;

  writeFileSync(path, yml);
  written.push(`${path}  ${c.green("(committed)")}`);
}

function writeClaudeAdapter(answers) {
  for (const pb of PLAYBOOKS) {
    const dir = join(".claude", "skills", pb);
    const path = join(dir, "SKILL.md");
    if (isTracked(path)) {
      warnings.push(`${path} is TRACKED — left untouched. The harness never edits a tracked file it does not own.`);
      continue;
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, `---
name: ${pb}
description: Harness ${pb} playbook. See ~/.harness/core/${pb}.md
---

# ${pb}

Follow the playbook at \`~/.harness/core/${pb}.md\`.

Read first, in this order:
1. \`~/.harness/profile/me.md\` — who you are working for
2. \`.harness/config.yml\` — this project's tracker, gate and rules
3. \`~/.harness/trackers/${answers.tracker}.md\` — how to speak this tracker

Before starting, compare \`harness.version\` in the config against the core version
(\`~/.harness/harness.json\`). Minor mismatch: warn and continue. Major mismatch: stop.
`);
    written.push(path);
    excluded.push(`.claude/skills/${pb}/`);
  }
}

/**
 * Reviewer and fixer definitions.
 *
 * The behaviour lives in ~/.harness/agents/ and is pointed at, not copied. The frontmatter
 * is generated here because it is project-specific: read-only tools for the reviewers, and
 * for the fixer whatever this project's verify chain actually needs to compile and test.
 */
function writeReviewAgents(answers) {
  const roles = [
    { file: "reviewer",          core: "reviewer",          tools: "Read, Grep, Glob, Bash", model: answers.reviewModel },
    { file: "critical-reviewer", core: "critical-reviewer", tools: "Read, Grep, Glob, Bash", model: answers.criticalModel },
    { file: "fixer",             core: "fixer",             tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash", ...answers.extraTools].join(", "), model: answers.reviewModel },
  ];

  for (const r of roles) {
    const path = join(".claude", "agents", `${r.file}.md`);
    if (isTracked(path)) {
      warnings.push(`${path} is TRACKED — left untouched.`);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `---
name: ${r.file}
description: Harness ${r.file}. Behaviour defined in ~/.harness/agents/${r.core}.md
tools: ${r.tools}
model: ${r.model}
---

Follow the agent definition at \`~/.harness/agents/${r.core}.md\` exactly.

Project rules and the verification chain you must respect are in \`.harness/config.yml\`.
`);
    written.push(path);
  }
  excluded.push(".claude/agents/");

  if (answers.hasIntegrationCheck && !answers.extraTools.length) {
    warnings.push(
      `The verify chain has a check that runs through an integration, but agents.extra_tools is empty.\n` +
      `    The fixer will not be able to validate its own edits — add the integration's tools to\n` +
      `    .harness/config.yml before the first run.`
    );
  }
}

function writeAgentsAdapter(answers) {
  const path = "AGENTS.md";
  const block = `${MARK_START}
## Harness

This project uses Awesome Harness. Playbooks live in \`~/.harness/core/\`:
${PLAYBOOKS.join(" · ")}

Read before acting: \`~/.harness/profile/me.md\`, then \`.harness/config.yml\`,
then \`~/.harness/trackers/${answers.tracker}.md\`.

Check \`harness.version\` against \`~/.harness/harness.json\` before starting a run.

Capability note: if this agent has no sub-agent primitive, the execute playbook runs
implementation in the main thread — keep runs short and report that context was not
isolated.
${MARK_END}`;

  if (existsSync(path) && isTracked(path)) {
    warnings.push(
      `AGENTS.md exists and is TRACKED — not modified.\n` +
      `    Appending would commit an adapter. Decide how you want to reference the harness\n` +
      `    from it, or keep an untracked copy instead.`
    );
    return;
  }

  if (existsSync(path)) {
    const cur = readFileSync(path, "utf8");
    const next = cur.includes(MARK_START)
      ? cur.replace(new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`), block)
      : `${cur.trimEnd()}\n\n${block}\n`;
    writeFileSync(path, next);
    written.push(`${path} ${c.dim("(harness block replaced)")}`);
  } else {
    writeFileSync(path, `${block}\n`);
    written.push(path);
  }
  excluded.push("AGENTS.md");
}

/** Local-only ignore: never the shared .gitignore. */
function writeExcludes(paths) {
  const path = ".git/info/exclude";
  if (!existsSync(".git")) die("Not a git repository.");
  mkdirSync(dirname(path), { recursive: true });

  const cur = existsSync(path) ? readFileSync(path, "utf8") : "";
  const missing = paths.filter((p) => !cur.includes(p));
  if (!missing.length) return;

  appendFileSync(
    path,
    `\n# awesome-harness — generated, derivable from .harness/config.yml\n${missing.join("\n")}\n`
  );
  written.push(`${path} ${c.dim(`(+${missing.length} entries)`)}`);
}

/* ── main ──────────────────────────────────────────────────────────── */

/**
 * Interactive when stdin is a terminal; otherwise answers come from piped input, one
 * line per question, falling back to defaults once it runs out.
 *
 * The non-TTY path exists because readline hits EOF on a pipe after the first question
 * and every later one hangs forever. Reading the input up front makes the installer
 * scriptable and testable, which a tool that writes to your repo ought to be.
 */
const interactive = stdin.isTTY;
const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;

let piped = [];
if (!interactive) {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  piped = Buffer.concat(chunks).toString("utf8").split("\n");
}

const ask = async (q, dflt) => {
  if (!interactive) {
    const a = (piped.shift() ?? "").trim();
    const val = a || dflt || "";
    stdout.write(`${q}${dflt ? c.dim(` [${dflt}]`) : ""} ${c.dim(val)}\n`);
    return val;
  }
  const a = (await rl.question(`${q}${dflt ? c.dim(` [${dflt}]`) : ""} `)).trim();
  return a || dflt || "";
};

try {
  console.log(`\n${c.bold("Awesome Harness")} ${c.dim(`v${VERSION}`)}\n`);

  if (!existsSync(".git")) die("Not a git repository. Run this from the root of the project.");

  const branch = git("branch", "--show-current");
  const defaultBranch = (git("symbolic-ref", "refs/remotes/origin/HEAD") || "").split("/").pop();
  if (branch && defaultBranch && branch === defaultBranch) {
    warnings.push(`You are on the default branch (${branch}). Runs that push will refuse to start here.`);
  }

  const hits = detectStack();
  if (hits.length === 1) console.log(`${c.green("→")} detected ${c.bold(hits[0].stack)} ${c.dim(`(${hits[0].why})`)}`);
  else if (hits.length > 1) console.log(`${c.yellow("→")} several stacks detected: ${hits.map((h) => h.stack).join(", ")}`);
  else console.log(`${c.yellow("→")} stack not recognised`);

  const answers = {};
  answers.stack = await ask("stack?", hits[0]?.stack);
  answers.project = await ask("project name?", require_basename());
  answers.tracker = await ask("tracker? (notion · github-issues)", "notion");
  answers.boardEnv = await ask("env var holding the board id?", "HARNESS_BOARD");
  answers.markerField = await ask("tracker text field for the ownership marker?", "Internal Notes");

  console.log(`\n${c.dim("Map your tracker's real status values onto the harness states.")}`);
  answers.states = {
    queued: await ask("  queued    →", "Todo"),
    running: await ask("  running   →", "In Progress"),
    verified: await ask("  verified  →", "Done (dev)"),
    in_review: await ask("  in-review →", "In Review"),
    blocked: await ask("  blocked   →", "Blocked"),
  };

  // The one step that is never inferred.
  const proposed = presetVerify(answers.stack);
  console.log(`\n${c.bold("Verification chain")} — the gate. This is never guessed.`);
  if (proposed) {
    console.log(c.dim(proposed));

    // A preset proposes generic commands; this repository may not have them. Presenting an
    // unchecked chain as "confirmed" is how a gate ends up referencing scripts that do not
    // exist — so verify what can be verified and say so out loud.
    const unresolved = unresolvableCommands(proposed);
    if (unresolved.length) {
      console.log(
        `\n  ${c.yellow("!")} not present in this project: ${c.bold(unresolved.join(", "))}` +
        `\n    ${c.dim("answer n and declare the real commands, or fix them in the config before the first run.")}`
      );
      warnings.push(
        `Verification chain references ${unresolved.length} command(s) this project does not define: ` +
        `${unresolved.join(", ")}. Fix .harness/config.yml before the first run.`
      );
    }
    const ok = await ask("Use this chain? (y/n)", "y");
    if (ok.toLowerCase().startsWith("y")) {
      answers.verify = proposed;
    } else {
      console.log(c.yellow("  Left as a TODO — edit .harness/config.yml before the first run."));
      answers.verify = "  # TODO: declare the real checks. An unverified gate must not pass.\n  - name: TODO\n    run: false";
    }
  } else {
    console.log(c.yellow(`  No preset for "${answers.stack}". Left as a TODO.`));
    answers.verify = "  # TODO: declare the real checks. An unverified gate must not pass.\n  - name: TODO\n    run: false";
  }

  answers.push = await ask("\npush policy? (never · ask · always)", "never");
  answers.language = await ask("commit message language?", "en");

  answers.hasIntegrationCheck = /^\s*via:/m.test(answers.verify);
  answers.reviewModel = await ask("model for reviewer + fixer?", "sonnet");
  answers.criticalModel = await ask("model for the critical reviewer?", "opus");
  answers.extraTools = (await ask(
    `extra tools the fixer needs to run the gate?${answers.hasIntegrationCheck ? c.yellow(" (your chain uses an integration — it needs them)") : ""}`,
    ""
  )).split(",").map((s) => s.trim()).filter(Boolean);

  const agents = (await ask("adapters? (claude-code, agents-md, both, none)", "claude-code")).toLowerCase();

  writeConfig(answers);
  if (agents.includes("claude") || agents === "both") {
    writeClaudeAdapter(answers);
    writeReviewAgents(answers);
  }
  if (agents.includes("agents") || agents === "both") writeAgentsAdapter(answers);
  writeExcludes([...excluded, ".harness/state.json"]);

  console.log(`\n${c.bold("Written")}`);
  for (const w of written) console.log(`  ${w}`);
  console.log(`\n${c.bold("Excluded")} ${c.dim("(via .git/info/exclude — local only, never travels)")}`);
  for (const e of [...excluded, ".harness/state.json"]) console.log(`  ${c.dim(e)}`);

  if (warnings.length) {
    console.log(`\n${c.yellow(c.bold("Attention"))}`);
    for (const w of warnings) console.log(`  ${c.yellow("!")} ${w}`);
  }

  console.log(`\n${c.bold("Next")}`);
  console.log(`  1. export ${answers.boardEnv}=<your board id>`);
  console.log(`  2. cp ~/.harness/profile/TEMPLATE.md ~/.harness/profile/me.md  ${c.dim("and fill it in")}`);
  if (answers.verify.includes("TODO")) {
    console.log(`  3. ${c.yellow("declare the verification chain in .harness/config.yml — it is a TODO right now")}`);
  }
  console.log(`  4. commit .harness/config.yml\n`);
} finally {
  rl?.close();
}

function require_basename() {
  return process.cwd().split("/").filter(Boolean).pop() || "project";
}
