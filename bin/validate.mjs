#!/usr/bin/env node
/**
 * Awesome Harness — config validator.
 *
 * Runs schema/config.schema.json against a project config. A schema nobody executes is
 * documentation wearing a costume — this is the thing that executes it.
 *
 *   node ~/.harness/bin/validate.mjs                       # validates .harness/config.yml
 *   node ~/.harness/bin/validate.mjs path/to/config.yml
 *   node ~/.harness/bin/validate.mjs presets/node.yml --preset
 *
 * --preset validates only the sections present against their sub-schemas: presets are
 * proposals, not complete configs, so root-level required keys do not apply.
 *
 * No dependencies. Node 18+. The YAML parser below handles exactly the subset the
 * installer writes and the presets use — nested maps, block lists of scalars and maps,
 * inline arrays, quoted scalars, full-line comments. It refuses anything it does not
 * understand rather than guessing: a config that cannot be parsed cannot be trusted.
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CORE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(join(CORE, "schema", "config.schema.json"), "utf8"));

/* ── YAML subset parser ─────────────────────────────────────────────── */

function scalar(raw) {
  let s = raw.trim();
  // Trailing comment — only outside quotes; a quoted scalar keeps its # verbatim.
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  const q = s.match(/^("(?:[^"\\]|\\.)*"|'[^']*')\s+#.*$/);
  if (q) return scalar(q[1]);
  s = s.replace(/\s+#.*$/, "");
  if (s === "") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (s === "[]") return [];
  if (s === "{}") return {};
  if (/^\[.*\]$/.test(s)) {
    const inner = s.slice(1, -1).trim();
    return inner ? inner.split(",").map((x) => scalar(x)) : [];
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

export function parseYaml(text) {
  // Physical lines → { indent, content }, skipping blanks and full-line comments.
  const lines = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    if (raw.includes("\t")) throw new Error("tabs are not valid YAML indentation");
    lines.push({ indent: raw.length - raw.trimStart().length, content: raw.trim() });
  }

  let i = 0;

  function parseBlock(indent) {
    if (i >= lines.length || lines[i].indent < indent) return null;
    return lines[i].content.startsWith("- ") || lines[i].content === "-"
      ? parseList(lines[i].indent)
      : parseMap(lines[i].indent);
  }

  function parseMap(indent) {
    const out = {};
    while (i < lines.length && lines[i].indent === indent && !lines[i].content.startsWith("- ")) {
      const line = lines[i].content;
      const m = line.match(/^([^:]+):(.*)$/);
      if (!m) throw new Error(`cannot parse line: "${line}"`);
      const key = m[1].trim();
      const rest = m[2];
      i++;
      if (rest.trim() !== "") {
        out[key] = scalar(rest);
      } else if (i < lines.length && lines[i].indent > indent) {
        out[key] = parseBlock(indent + 1);
      } else {
        out[key] = null;
      }
    }
    return out;
  }

  function parseList(indent) {
    const out = [];
    while (i < lines.length && lines[i].indent === indent && lines[i].content.startsWith("- ")) {
      const rest = lines[i].content.slice(2);
      if (/^[^:]+:(\s|$)/.test(rest)) {
        // "- key: value" opens an inline map item; its remaining keys sit deeper.
        const item = {};
        const m = rest.match(/^([^:]+):(.*)$/);
        item[m[1].trim()] = m[2].trim() === "" ? null : scalar(m[2]);
        i++;
        if (i < lines.length && lines[i].indent > indent && !lines[i].content.startsWith("- ")) {
          Object.assign(item, parseMap(lines[i].indent));
        }
        out.push(item);
      } else {
        out.push(scalar(rest));
        i++;
      }
    }
    return out;
  }

  const doc = parseBlock(0) ?? {};
  if (i < lines.length) throw new Error(`unparsed content from: "${lines[i].content}"`);
  return doc;
}

/* ── JSON Schema subset validator ───────────────────────────────────── */

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v; // object, string, boolean, number
}

export function validate(value, schema, path, errors) {
  const at = path || "(root)";

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${at}: expected ${JSON.stringify(schema.const)}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at}: "${value}" is not one of ${schema.enum.join(" · ")}`);
    return;
  }
  if (schema.type && typeOf(value) !== schema.type) {
    errors.push(`${at}: expected ${schema.type}, got ${typeOf(value)}`);
    return;
  }

  if (schema.type === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${at}: "${value}" does not match ${schema.pattern}`);
    }
    if (schema.minLength && value.length < schema.minLength) {
      errors.push(`${at}: must not be empty`);
    }
  }

  if (schema.type === "array") {
    if (schema.minItems && value.length < schema.minItems) {
      errors.push(`${at}: needs at least ${schema.minItems} item(s)`);
    }
    if (schema.items) value.forEach((v, n) => validate(v, schema.items, `${at}[${n}]`, errors));
  }

  if (typeOf(value) === "object") {
    for (const req of schema.required ?? []) {
      if (!(req in value)) errors.push(`${at}: missing required key "${req}"`);
    }
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties && k in schema.properties) {
        validate(v, schema.properties[k], path ? `${path}.${k}` : k, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${at}: unknown key "${k}"`);
      } else if (typeof schema.additionalProperties === "object") {
        validate(v, schema.additionalProperties, path ? `${path}.${k}` : k, errors);
      }
    }
  }

  if (schema.oneOf) {
    const matches = schema.oneOf.filter((s) => {
      const scratch = [];
      validate(value, { ...s, type: undefined }, at, scratch);
      // required-only oneOf branches (run | via): check presence directly.
      return scratch.length === 0;
    });
    if (matches.length !== 1) {
      const names = schema.oneOf.map((s) => (s.required ?? []).join("+")).join(" | ");
      errors.push(`${at}: must satisfy exactly one of: ${names} (satisfied ${matches.length})`);
    }
  }

  for (const sub of schema.allOf ?? []) {
    if (sub.if) {
      const scratch = [];
      validate(value, { ...sub.if, type: undefined }, at, scratch);
      if (scratch.length === 0 && sub.then) {
        const before = errors.length;
        validate(value, { ...sub.then, type: undefined }, at, errors);
        if (errors.length > before && sub.then.description) {
          errors[errors.length - 1] += ` — ${sub.then.description}`;
        }
      }
    } else {
      validate(value, sub, at, errors);
    }
  }
}

/* ── entry points ───────────────────────────────────────────────────── */

export function validateFile(path, { preset = false } = {}) {
  const doc = parseYaml(readFileSync(path, "utf8"));
  const errors = [];
  if (preset) {
    for (const [k, v] of Object.entries(doc)) {
      if (SCHEMA.properties[k]) validate(v, SCHEMA.properties[k], k, errors);
    }
  } else {
    validate(doc, SCHEMA, "", errors);
  }
  return errors;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const preset = args.includes("--preset");
  const file = args.find((a) => !a.startsWith("--")) ?? ".harness/config.yml";

  let errors;
  try {
    errors = validateFile(file, { preset });
  } catch (e) {
    console.error(`✗ ${file}: ${e.message}`);
    process.exit(1);
  }

  if (errors.length) {
    console.error(`✗ ${file} — ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`✓ ${file} validates${preset ? " (preset mode: sections present only)" : ""}`);
}
