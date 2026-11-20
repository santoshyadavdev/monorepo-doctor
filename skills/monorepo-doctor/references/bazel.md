# Bazel static target inspection

This supplementary scan works for Bazel-backed JS workspaces and standalone
Bazel workspaces, including Java. It reads the BUILD files inventoried by
[detection.md](detection.md) without invoking Bazel, loading `.bzl` files, or
downloading anything. It writes `$W/bazel.json` for the boundary and
production-leakage checks.

The scan deliberately recognizes only literal attributes on `filegroup`,
`java_library`, `java_binary`, `java_test` loaded from
`@rules_java//java:defs.bzl`, and `js_library` loaded from
`@aspect_rules_js//js:defs.bzl` or `@rules_js//js:defs.bzl`. It follows
literal local labels in `srcs`, `deps`, `data`, `resources`, `runtime_deps`,
and `exports`. It does not evaluate macros, `select()`, `glob()`, package
groups, external repositories, implicit dependencies, or nonliteral
attributes; its results are always `partial`. It is not a general Starlark
interpreter. `REPO.bazel` `ignore_directories` patterns are not evaluated: if
that name occurs in the file or exclusions cannot be read, target findings are
suppressed and the reason is reported. Conditional call expressions and
rule names referenced as values or reassigned are not interpreted.

- Visibility finding: an exact `internal` tag and an explicit, literal public
  visibility on the target. For a native `filegroup` only, an explicit
  `package(default_visibility = ...)` also counts; macro-created targets do
  not necessarily inherit that default.
  The tag is a project convention, **not** Bazel's own visibility policy.
  Public untagged targets are valid. Review the intended consumers before
  restricting visibility.
- Test-only finding: a target explicitly tagged `production` and explicitly
  marked `testonly = False` has a literal local dependency path to a target
  explicitly marked `testonly = True`. Bazel normally rejects such a path at
  analysis time; the finding is a broken production build, not proof that test
  code actually shipped. A test target using test-only fixtures is valid.

Run after detection and the JS scan, from the audited workspace root:

```bash
W="$(node -p 'require("os").tmpdir()')/monorepo-doctor"
cat > "$W/bazel-audit.mjs" <<'EOF'
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const work = path.join(os.tmpdir(), 'monorepo-doctor');
const ws = JSON.parse(fs.readFileSync(path.join(work, 'workspace.json'), 'utf8'));
const root = ws.root;
const findings = { boundaries: [], 'prod-leakage': [] };
const problems = [];
const targets = new Map(), duplicates = new Set();
const closing = { '(': ')', '[': ']', '{': '}' };

function lex(text) {
  const out = [];
  let i = 0, line = 1;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { if (ch === '\n') line++; i++; continue; }
    if (ch === '#') { while (i < text.length && text[i] !== '\n') i++; continue; }
    const start = i, startLine = line;
    if (ch === '"' || ch === "'") {
      const triple = text.slice(i, i + 3) === ch.repeat(3);
      i += triple ? 3 : 1;
      let value = '', valid = !triple, closed = false;
      while (i < text.length) {
        if (triple && text.slice(i, i + 3) === ch.repeat(3)) { i += 3; closed = true; break; }
        if (!triple && text[i] === ch) { i++; closed = true; break; }
        if (text[i] === '\\') {
          i++;
          if (i >= text.length) break;
          const escapes = { '\\': '\\', '"': '"', "'": "'", n: '\n', r: '\r', t: '\t' };
          if (!Object.hasOwn(escapes, text[i])) valid = false;
          else value += escapes[text[i]];
          if (text[i] === '\n') line++;
          i++;
        } else {
          if (text[i] === '\n') {
            line++;
            if (!triple) throw new Error(`unterminated string at line ${startLine}`);
          }
          value += text[i++];
        }
      }
      if (!closed) throw new Error(`unterminated string at line ${startLine}`);
      out.push({ type: valid ? 'string' : 'unknown', value, start, end: i, line: startLine });
    } else if (/[A-Za-z_]/.test(ch)) {
      i++;
      while (i < text.length && /[A-Za-z0-9_]/.test(text[i])) i++;
      out.push({ type: 'id', value: text.slice(start, i), start, end: i, line: startLine });
    } else {
      i++;
      out.push({ type: 'punct', value: ch, start, end: i, line: startLine });
    }
  }
  return out;
}

function groupEnd(tokens, start) {
  const stack = [closing[tokens[start].value]];
  for (let i = start + 1; i < tokens.length; i++) {
    const value = tokens[i].value;
    if (tokens[i].type === 'punct' && closing[value]) stack.push(closing[value]);
    else if (tokens[i].type === 'punct' && [')', ']', '}'].includes(value)) {
      if (stack.pop() !== value) throw new Error(`unbalanced delimiter at line ${tokens[i].line}`);
      if (!stack.length) return i;
    }
  }
  throw new Error(`unclosed delimiter at line ${tokens[start].line}`);
}

function splitArgs(tokens) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'punct' && closing[tokens[i].value]) i = groupEnd(tokens, i);
    else if (tokens[i].type === 'punct' && tokens[i].value === ',') { if (i > start) parts.push(tokens.slice(start, i)); start = i + 1; }
  }
  if (start < tokens.length) parts.push(tokens.slice(start));
  return parts;
}

function literal(tokens) {
  if (tokens.length === 1 && tokens[0].type === 'string') return tokens[0].value;
  if (tokens.length === 1 && tokens[0].type === 'id' && ['True', 'False'].includes(tokens[0].value)) return tokens[0].value === 'True';
  if (tokens[0]?.value === '[' && groupEnd(tokens, 0) === tokens.length - 1) {
    const parts = splitArgs(tokens.slice(1, -1));
    if (parts.every((p) => p.length === 1 && p[0].type === 'string')) return parts.map((p) => p[0].value);
  }
  return undefined;
}

function calls(text) {
  const tokens = lex(text), result = [], loadTokens = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const lineHead = text.slice(text.lastIndexOf('\n', t.start - 1) + 1, t.start).trim();
    if (t.type === 'id' && tokens[i + 1]?.type === 'punct' && tokens[i + 1].value === '(' && lineHead === '') {
      const end = groupEnd(tokens, i + 1);
      if (tokens[end + 1]?.line !== tokens[end].line) {
        result.push({ name: t.value, line: t.line, parts: splitArgs(tokens.slice(i + 2, end)) });
        if (t.value === 'load') for (let j = i + 1; j < end; j++) loadTokens.add(j);
      }
      i = end;
    } else if (t.type === 'punct' && closing[t.value]) {
      i = groupEnd(tokens, i);
    }
  }
  const referenced = new Set(tokens.flatMap((t, i) =>
    t.type === 'id' && tokens[i + 1]?.value !== '(' && !loadTokens.has(i) ? [t.value] : []));
  return { calls: result, referenced };
}

function attributes(parts, text) {
  const attrs = {};
  for (const p of parts) {
    if (p[0]?.type !== 'id' || p[1]?.value !== '=' || p.length < 3) continue;
    if (Object.hasOwn(attrs, p[0].value)) throw new Error(`duplicate ${p[0].value} attribute at line ${p[0].line}`);
    const expr = p.slice(2);
    attrs[p[0].value] = {
      value: literal(expr),
      text: text.slice(expr[0].start, expr[expr.length - 1].end),
      line: p[0].line,
    };
  }
  return attrs;
}

function loadBindings(parsed) {
  const bindings = new Map();
  for (const call of parsed.filter((c) => c.name === 'load')) {
    const source = literal(call.parts[0] ?? []);
    if (typeof source !== 'string') continue;
    for (const part of call.parts.slice(1)) {
      const local = part.length === 1 && part[0].type === 'string' ? part[0].value
        : part[0]?.type === 'id' && part[1]?.value === '=' ? part[0].value : null;
      const symbol = part.length === 1 ? literal(part) : literal(part.slice(2));
      if (local && typeof symbol === 'string') bindings.set(local, { source, symbol });
    }
  }
  return bindings;
}

function ruleKind(name, bindings) {
  const binding = bindings.get(name);
  if (name === 'filegroup' && !binding) return name;
  if (binding?.source === '@rules_java//java:defs.bzl'
      && ['java_library', 'java_binary', 'java_test'].includes(binding.symbol)) return binding.symbol;
  if (['@aspect_rules_js//js:defs.bzl', '@rules_js//js:defs.bzl'].includes(binding?.source)
      && binding.symbol === 'js_library') return binding.symbol;
  return null;
}

function label(value, pkg) {
  if (typeof value !== 'string' || value.startsWith('@')) return null;
  let dir = pkg, name = value;
  if (value.startsWith('//')) {
    const body = value.slice(2), colon = body.indexOf(':');
    dir = colon < 0 ? body : body.slice(0, colon);
    name = colon < 0 ? path.posix.basename(dir) : body.slice(colon + 1);
  } else if (value.startsWith(':')) name = value.slice(1);
  if (!name || name.includes(':') || dir.split('/').includes('..') || name.split('/').includes('..')
      || !/^[A-Za-z0-9_./+~=-]*$/.test(dir) || !/^[A-Za-z0-9_./+~=-]+$/.test(name)) return null;
  return `//${dir}:${name}`;
}

function owner(dir) {
  return [...ws.packages]
    .filter((p) => p.dir === '.' || dir === p.dir || dir.startsWith(`${p.dir}/`))
    .sort((a, b) => b.dir.length - a.dir.length)[0]?.name;
}

for (const file of ws.bazel?.unresolvedExclusions ? [] : ws.bazel?.buildFiles ?? []) {
  try {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const { calls: parsed, referenced } = calls(text);
    const bindings = loadBindings(parsed);
    const packageCall = !referenced.has('package') && !bindings.has('package')
      ? parsed.find((c) => c.name === 'package') : undefined;
    const defaults = packageCall ? attributes(packageCall.parts, text) : {};
    const pkg = path.posix.dirname(file) === '.' ? '' : path.posix.dirname(file);
    for (const call of parsed) {
      const kind = referenced.has(call.name) ? null : ruleKind(call.name, bindings);
      if (!kind) continue;
      const attrs = attributes(call.parts, text);
      const name = attrs.name?.value;
      const targetLabel = label(typeof name === 'string' ? `:${name}` : null, pkg);
      if (!targetLabel) continue;
      const visibility = Object.hasOwn(attrs, 'visibility') ? attrs.visibility
        : kind === 'filegroup' ? defaults.default_visibility : undefined;
      const edges = [];
      for (const key of ['srcs', 'deps', 'data', 'resources', 'runtime_deps', 'exports']) {
        if (!Array.isArray(attrs[key]?.value)) continue;
        for (const value of attrs[key].value) {
          const dest = label(value, pkg);
          if (dest) edges.push({ label: dest, attribute: key, line: attrs[key].line });
        }
      }
      const target = { label: targetLabel, file, line: call.line, pkg: owner(pkg), attrs, visibility, edges };
      if (targets.has(targetLabel)) duplicates.add(targetLabel);
      else targets.set(targetLabel, target);
    }
  } catch (error) {
    problems.push(`${file}: ${error.message}`);
  }
}
for (const duplicate of duplicates) {
  targets.delete(duplicate);
  problems.push(`duplicate target ${duplicate}`);
}

for (const target of targets.values()) {
  if (Array.isArray(target.attrs.tags?.value)
      && target.attrs.tags.value.includes('internal')
      && Array.isArray(target.visibility?.value)
      && target.visibility.value.length === 1
      && target.visibility.value[0] === '//visibility:public') {
    findings.boundaries.push({
      id: 'boundaries/bazel-public-internal-target', severity: 'medium',
      title: `Internal-tagged target ${target.label} is publicly visible`,
      location: { file: target.file, line: target.line, ...(target.pkg ? { package: target.pkg } : {}) },
      evidence: `${target.label} (${target.file}:${target.line}): tags = ${target.attrs.tags.text}; ${Object.hasOwn(target.attrs, 'visibility') ? 'visibility' : 'package default_visibility'} = ${target.visibility.text}`,
      fix: 'Confirm the intended consumers and restrict visibility if the target is meant to be internal; retain any required access.',
    });
  }

  if (!Array.isArray(target.attrs.tags?.value) || !target.attrs.tags.value.includes('production')
      || target.attrs.testonly?.value !== false) continue;
  const seen = new Set([target.label]);
  const queue = [{ target, edges: [] }];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const edge of current.target.edges) {
      if (seen.has(edge.label) || !targets.has(edge.label)) continue;
      seen.add(edge.label);
      const next = targets.get(edge.label);
      const chain = [...current.edges, { from: current.target, edge }];
      if (next.attrs.testonly?.value === true) {
        findings['prod-leakage'].push({
          id: 'prod-leakage/bazel-testonly-dependency', severity: 'high',
          title: `Production target ${target.label} depends on test-only target ${next.label}`,
          location: { file: target.file, line: target.line, ...(target.pkg ? { package: target.pkg } : {}) },
          evidence: `${target.label}: tags = ${target.attrs.tags.text}; testonly = ${target.attrs.testonly.text}\n${chain.map(({ from, edge: e }) => `${from.label} (${from.file}:${e.line}) ${e.attribute} -> ${e.label}`).join('\n')}\n${next.label} (${next.file}:${next.attrs.testonly.line}): testonly = ${next.attrs.testonly.text}`,
          fix: 'Remove the test-only dependency from the production target or replace it with a production-safe input; keep test fixtures test-only.',
        });
      }
      queue.push({ target: next, edges: chain });
    }
  }
}

const reason = [
  'Bazel static inspection covers only literal local targets; macros, selects, package groups and external dependencies are not resolved',
  ...(!ws.bazel?.buildFiles.length ? ['no Bazel BUILD files found'] : []),
  ...(ws.bazel?.errors ?? []),
  ...problems,
].join('; ');
const result = Object.fromEntries(Object.entries(findings).map(([check, entries]) => [check, {
  status: 'partial', reason, findings: entries,
}]));
fs.writeFileSync(path.join(work, 'bazel.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ boundaries: findings.boundaries.length, testonly: findings['prod-leakage'].length, status: 'partial' }));
EOF
node "$W/bazel-audit.mjs"
```

Each check merges its own findings from this file and keeps the scan's partial
reason alongside any other incomplete subchecks. If this scan fails or
`bazel.json` is missing or invalid, mark both Bazel-aware checks `partial` with
the failure reason; do not treat the absence of results as a clean audit.
