#!/usr/bin/env node
// QoQ digest: read the per-tool JSON reports written by `qoq --json` and print
// one compact, human/agent-readable summary. The whole point is token economy:
// the raw ESLint and JSCPD reports can be tens of thousands of lines, so an
// agent should NEVER read them directly — it reads this digest instead, and
// only drills into a specific raw report when a finding needs more detail.
//
// Usage:   node summarize.mjs <report-dir>
//   <report-dir>  where `qoq --check --json` wrote its reports — the CLI's own
//                 default (bin/report inside the package), unless a caller
//                 overrode it with --output
//
// Exit code: 0 when no findings, 1 when any tool reported findings, 2 on a
// usage/parse error. The non-zero "findings" code lets a caller branch without
// parsing the text.

import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

// Max instances listed per group before "(+N more)".
const MAX = 6;

const reportDir = process.argv.slice(2).find((a) => !a.startsWith('--'));

if (!reportDir) {
  process.stderr.write('usage: summarize.mjs <report-dir>\n');
  process.exit(2);
}

const cwd = process.cwd();
const rel = (p) => {
  if (!p || typeof p !== 'string') {
    return p;
  }
  try {
    const r = relative(cwd, p);
    return r && !r.startsWith('..') ? r : p;
  } catch {
    return p;
  }
};

let reportsFound = 0;
const read = (name) => {
  const path = join(reportDir, name);
  if (!existsSync(path)) {
    return undefined;
  }
  reportsFound++;
  try {
    const raw = readFileSync(path, 'utf8').trim();
    return raw ? JSON.parse(raw) : undefined;
  } catch (err) {
    return { __parseError: String(err?.message ?? err) };
  }
};

// Collapse a list to "a, b, c (+N more)" so groups never explode the digest.
const cap = (items, max = MAX) => {
  const list = [...new Set(items.filter(Boolean))];
  if (list.length <= max) {
    return list.join(', ');
  }
  return `${list.slice(0, max).join(', ')} (+${list.length - max} more)`;
};

// "\n  (+N more <noun>)" suffix when a capped list hid items, else "". Keeps the
// truncation hint in one place instead of re-deriving it at each call site.
const moreLine = (total, noun = '') => {
  if (total <= MAX) {
    return '';
  }
  const label = noun ? ` ${noun}` : '';
  return `\n  (+${total - MAX} more${label})`;
};

// Severity tag for an eslint rule group: all-error, mixed, or all-warning.
const severityTag = ({ count, errors }) => {
  if (errors === count) {
    return 'err';
  }
  if (errors) {
    return 'err+warn';
  }
  return 'warn';
};

// Auto-fix label for an eslint rule group: all fixable, some, or none.
const fixableLabel = ({ count, fixable }) => {
  if (fixable === count) {
    return 'auto-fixable';
  }
  if (fixable) {
    return `${fixable} fixable`;
  }
  return '';
};

// name | {name} | {symbol} | {from} -> a plain string, whatever knip emits.
const nameOf = (x) =>
  typeof x === 'string' ? x : (x?.name ?? x?.symbol ?? x?.from ?? JSON.stringify(x));

const sections = [];
let totalFindings = 0;

// ---------- Prettier ----------
// Report is written by PrettierExecutor's JS-API path: { issues: string[] } —
// the list of files that are not Prettier-formatted (relative paths).
const prettier = read('prettier-report.json');
if (prettier && !prettier.__parseError) {
  const files = (prettier.issues ?? []).map(rel);
  if (files.length) {
    totalFindings += files.length;
    sections.push(
      `PRETTIER  ${files.length} file(s) need formatting  [auto-fixable: run qoq --fix]\n  ${files
        .slice(0, MAX)
        .join('\n  ')}${moreLine(files.length)}`
    );
  }
} else if (prettier?.__parseError) {
  sections.push(`PRETTIER  ⚠ could not parse report: ${prettier.__parseError}`);
}

// ---------- ESLint ----------
// Report is written by EslintExecutor's JS-API path: a lean array of
// { filePath, messages:[{ ruleId, severity, message, line, column, fix }] } —
// eslint's heavy per-file `source`/`output` blobs are dropped at the source and
// `fix` is flattened to a boolean (truthy when the message is auto-fixable).
const eslint = read('eslint-report.json');
if (Array.isArray(eslint)) {
  const byRule = new Map(); // ruleId -> { count, errors, fixable, locs:[] }
  let errors = 0;
  let warnings = 0;
  let fixable = 0;
  const files = new Set();
  for (const file of eslint) {
    const fp = rel(file.filePath);
    for (const m of file.messages ?? []) {
      files.add(fp);
      const rule = m.ruleId ?? '(parse/syntax error)';
      const isErr = m.severity === 2;
      if (isErr) {
        errors++;
      } else {
        warnings++;
      }
      const canFix = Boolean(m.fix);
      if (canFix) {
        fixable++;
      }
      const g = byRule.get(rule) ?? { count: 0, errors: 0, fixable: 0, locs: [] };
      g.count++;
      if (isErr) {
        g.errors++;
      }
      if (canFix) {
        g.fixable++;
      }
      g.locs.push(`${fp}:${m.line ?? '?'}`);
      byRule.set(rule, g);
    }
  }
  const total = errors + warnings;
  if (total) {
    totalFindings += total;
    const lines = [...byRule.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([rule, g]) => {
        const tag = severityTag(g);
        const fix = fixableLabel(g);
        return `  ${rule.padEnd(38)} x${String(g.count).padEnd(3)} ${tag.padEnd(8)} ${fix.padEnd(
          12
        )} ${cap(g.locs)}`;
      });
    sections.push(
      `ESLINT  ${total} problem(s) across ${files.size} file(s) / ${byRule.size} rule(s)  ` +
        `(${errors} error, ${warnings} warn, ${fixable} auto-fixable)\n${lines.join('\n')}`
    );
  }
} else if (eslint?.__parseError) {
  sections.push(`ESLINT  ⚠ could not parse report: ${eslint.__parseError}`);
}

// ---------- Knip ----------
const knip = read('knip-report.json');
if (knip && !knip.__parseError) {
  // Two shapes exist across knip versions: a flat { files, issues:{...} } and a
  // per-file issues array. Normalize both into category -> [labels].
  const cats = {
    'unused files': [],
    'unused exports': [],
    'unused types': [],
    'unused dependencies': [],
    'unused devDependencies': [],
    'unlisted dependencies': [],
    'unresolved imports': [],
    'unused binaries': [],
    'duplicate exports': [],
    'unused enum members': [],
    'unused class members': [],
  };
  for (const f of knip.files ?? []) {
    cats['unused files'].push(rel(f));
  }
  const pushFrom = (issue) => {
    const where = issue.file ? ` (${rel(issue.file)})` : '';
    const add = (key, arr) => (arr ?? []).forEach((x) => cats[key].push(`${nameOf(x)}${where}`));
    // Unused files arrive per-issue in the array shape and top-level in the flat one;
    // only the top-level spelling was read, so every unused file was silently dropped.
    // Pushed bare — the name already is the path, so `where` would just repeat it.
    (issue.files ?? []).forEach((x) => cats['unused files'].push(rel(nameOf(x))));
    add('unused exports', issue.exports);
    add('unused types', issue.types);
    add('unused dependencies', issue.dependencies);
    add('unused devDependencies', issue.devDependencies);
    add('unlisted dependencies', issue.unlisted);
    add('unresolved imports', issue.unresolved);
    add('unused binaries', issue.binaries);
    add('duplicate exports', issue.duplicates);
    (Object.values(issue.enumMembers ?? {}) ?? []).forEach((arr) =>
      (arr ?? []).forEach((x) => cats['unused enum members'].push(nameOf(x)))
    );
    (Object.values(issue.classMembers ?? {}) ?? []).forEach((arr) =>
      (arr ?? []).forEach((x) => cats['unused class members'].push(nameOf(x)))
    );
  };
  const { issues } = knip;
  if (Array.isArray(issues)) {
    issues.forEach(pushFrom);
  } else if (issues && typeof issues === 'object') {
    // flat shape: issues.exports is { 'src/a.ts': { foo: {...} } } etc.
    for (const [key, mapKey] of [
      ['unused exports', 'exports'],
      ['unused types', 'types'],
      ['unused dependencies', 'dependencies'],
      ['unused devDependencies', 'devDependencies'],
      ['unlisted dependencies', 'unlisted'],
      ['unresolved imports', 'unresolved'],
      ['unused binaries', 'binaries'],
    ]) {
      const node = issues[mapKey];
      if (!node) {
        continue;
      }
      if (Array.isArray(node)) {
        node.forEach((x) => cats[key].push(nameOf(x)));
      } else {
        for (const [file, members] of Object.entries(node)) {
          Object.keys(members ?? {}).forEach((m) => cats[key].push(`${m} (${rel(file)})`));
        }
      }
    }
  }
  const present = Object.entries(cats).filter(([, v]) => v.length);
  const count = present.reduce((n, [, v]) => n + v.length, 0);
  if (count) {
    totalFindings += count;
    const lines = present.map(([k, v]) => {
      const label = `${k}:`;
      return `  ${label.padEnd(24)} x${v.length}  ${cap(v)}`;
    });
    sections.push(
      `KNIP  ${count} finding(s)  [judgment needed — verify before deleting]\n${lines.join('\n')}`
    );
  }
} else if (knip?.__parseError) {
  sections.push(`KNIP  ⚠ could not parse report: ${knip.__parseError}`);
}

// ---------- JSCPD ----------
// Report is written by JscpdExecutor's JS-API path: a lean
// { percentage, clones:[{ format, lines, firstFile:{name,start,end}, secondFile:{…} }] }
// (jscpd's heavy `fragment`/token/blame data is dropped at the source).
const jscpd = read('jscpd-report.json');
if (jscpd && !jscpd.__parseError) {
  const dups = jscpd.clones ?? [];
  const pct = jscpd.percentage;
  if (dups.length) {
    totalFindings += dups.length;
    const pctStr = typeof pct === 'number' ? `${pct.toFixed(2)}% duplication` : 'duplication';
    const lines = dups.slice(0, MAX).map((d) => {
      const a = d.firstFile ?? {};
      const b = d.secondFile ?? {};
      return `  ${rel(a.name)}:${a.start ?? '?'}-${a.end ?? '?'}  <=>  ${rel(b.name)}:${
        b.start ?? '?'
      }-${b.end ?? '?'}  (${d.lines ?? '?'} lines, ${d.format ?? '?'})`;
    });
    sections.push(
      `JSCPD  ${dups.length} clone(s), ${pctStr}  [extract shared code — verify both sites]\n${lines.join(
        '\n'
      )}${moreLine(dups.length, 'clones')}`
    );
  }
} else if (jscpd?.__parseError) {
  sections.push(`JSCPD  ⚠ could not parse report: ${jscpd.__parseError}`);
}

// ---------- npm outdated ----------
// Report is written by NpmExecutor's --json path: @ladamczyk/outdated's schema v3
// verbatim. `packages` always lists the ok ones too, so they are filtered here.
// `blocked` is informational (latest needs a newer Node) — shown, never counted.
const npm = read('npm-report.json');
if (npm && !npm.__parseError) {
  const pkgs = (npm.packages ?? []).filter((p) => !p.flags?.includes('ok'));
  const has = (flag) => pkgs.filter((p) => p.flags?.includes(flag));
  const upgrade = (p) => `${p.name} ${p.current}->${p.latest}`;
  const outdated = has('outdated');
  const groups = [
    ['major', outdated.filter((p) => p.majorBump).map(upgrade)],
    ['minor/patch', outdated.filter((p) => !p.majorBump).map(upgrade)],
    ['deprecated', has('deprecated').map((p) => `${p.name}: ${p.deprecated}`)],
    ['stale', has('stale').map((p) => `${p.name} (last release ${p.lastPublish?.slice(0, 10)})`)],
    ['unknown', has('unknown').map((p) => `${p.name}: ${p.unknown}`)],
    ['blocked', has('blocked').map((p) => `${p.name} (latest needs node ${p.latestNode})`)],
  ].filter(([, items]) => items.length);
  const total = pkgs.filter((p) => p.flags?.some((f) => f !== 'blocked')).length;
  if (groups.length) {
    totalFindings += total;
    const lines = groups.map(
      ([name, items]) => `  ${name.padEnd(11)} x${items.length}  ${cap(items)}`
    );
    sections.push(
      `NPM  ${total} package(s) need attention  [judgment needed — check changelogs before major bumps]\n${lines.join('\n')}`
    );
  }
} else if (npm?.__parseError) {
  sections.push(`NPM  ⚠ could not parse report: ${npm.__parseError}`);
}

// ---------- Stylelint (optional) ----------
// Report is written by StylelintExecutor's JS-API path: an array of
// { source, warnings:[{ rule, severity:'error'|'warning', line, fixable }] }.
// `fixable` comes from stylelint's rule metadata (the json formatter omits it).
const stylelint = read('stylelint-report.json');
if (Array.isArray(stylelint)) {
  const byRule = new Map();
  let count = 0;
  let errors = 0;
  let fixable = 0;
  for (const file of stylelint) {
    const fp = rel(file.source);
    for (const w of file.warnings ?? []) {
      count++;
      const isErr = w.severity === 'error';
      if (isErr) {
        errors++;
      }
      if (w.fixable) {
        fixable++;
      }
      const g = byRule.get(w.rule) ?? { count: 0, errors: 0, locs: [], fixable: 0 };
      g.count++;
      if (isErr) {
        g.errors++;
      }
      if (w.fixable) {
        g.fixable++;
      }
      g.locs.push(`${fp}:${w.line ?? '?'}`);
      byRule.set(w.rule, g);
    }
  }
  const warnings = count - errors;
  if (count) {
    totalFindings += count;
    const lines = [...byRule.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([rule, g]) => {
        const tag = severityTag(g);
        const fix = fixableLabel(g);
        return `  ${String(rule).padEnd(38)} x${String(g.count).padEnd(3)} ${tag.padEnd(8)} ${fix.padEnd(
          12
        )} ${cap(g.locs)}`;
      });
    sections.push(
      `STYLELINT  ${count} problem(s) / ${byRule.size} rule(s)  ` +
        `(${errors} error, ${warnings} warn, ${fixable} auto-fixable)\n${lines.join('\n')}`
    );
  }
}

// ---------- Structurelint (optional) ----------
const structurelint = read('structurelint-report.json');
if (structurelint && !structurelint.__parseError) {
  const violations = structurelint.violations ?? [];
  const byType = new Map(); // 'unexpected' | 'missing' -> { count, locs: [] }
  for (const v of violations) {
    const type = v.type ?? '(unknown)';
    const g = byType.get(type) ?? { count: 0, locs: [] };
    g.count++;
    g.locs.push(v.path ? rel(v.path) : '(root)');
    byType.set(type, g);
  }
  if (violations.length) {
    totalFindings += violations.length;
    const lines = [...byType.entries()].map(
      ([type, g]) => `  ${type.padEnd(12)} x${String(g.count).padEnd(3)} ${cap(g.locs)}`
    );
    sections.push(
      `STRUCTURELINT  ${violations.length} violation(s) in ${rel(structurelint.root) || '.'}  [not auto-fixable — move/rename/create by hand]\n${lines.join(
        '\n'
      )}`
    );
  }
} else if (structurelint?.__parseError) {
  sections.push(`STRUCTURELINT  ⚠ could not parse report: ${structurelint.__parseError}`);
}

// ---------- Skillslint (optional) ----------
const skillslint = read('skillslint-report.json');
if (skillslint && !skillslint.__parseError) {
  // Two finding kinds: textlint prose problems (per file) and skills whose
  // quality scores fall below the configured threshold.
  const byRule = new Map(); // ruleId -> { count, errors, locs:[] }
  let textErrors = 0;
  let textWarnings = 0;
  for (const file of skillslint.textlint ?? []) {
    const fp = rel(file.filePath);
    for (const m of file.messages ?? []) {
      const rule = m.ruleId ?? '(text)';
      const isErr = m.severity === 2;
      if (isErr) {
        textErrors++;
      } else {
        textWarnings++;
      }
      const g = byRule.get(rule) ?? { count: 0, errors: 0, locs: [] };
      g.count++;
      if (isErr) {
        g.errors++;
      }
      g.locs.push(`${fp}:${m.line ?? '?'}`);
      byRule.set(rule, g);
    }
  }
  const textTotal = textErrors + textWarnings;
  const failingSkills = (skillslint.skills ?? []).filter((s) => !s.passed);
  const count = textTotal + failingSkills.length;
  if (count) {
    totalFindings += count;
    const lines = [];
    if (textTotal) {
      lines.push(
        `  textlint  ${textTotal} problem(s) / ${byRule.size} rule(s)  (${textErrors} error, ${textWarnings} warn)`
      );
      for (const [rule, g] of [...byRule.entries()].sort((a, b) => b[1].count - a[1].count)) {
        const tag = severityTag(g);
        lines.push(
          `    ${String(rule).padEnd(36)} x${String(g.count).padEnd(3)} ${tag.padEnd(8)} ${cap(g.locs)}`
        );
      }
    }
    for (const s of failingSkills) {
      const below = ['overall', 'structure', 'clarity', 'specificity', 'advanced']
        .map((d) => `${d} ${s.scores?.[d] ?? '?'}`)
        .join(', ');
      lines.push(`  /${s.name}  below threshold  (${below})`);
    }
    sections.push(
      `SKILLSLINT  ${count} finding(s)  [textlint auto-fixable via qoq --fix; low scores need rewriting]\n${lines.join(
        '\n'
      )}`
    );
  }
} else if (skillslint?.__parseError) {
  sections.push(`SKILLSLINT  ⚠ could not parse report: ${skillslint.__parseError}`);
}

// ---------- Justify-disable (optional) ----------
const justifyDisable = read('justify-disable-report.json');
if (justifyDisable && !justifyDisable.__parseError) {
  const violations = justifyDisable.violations ?? [];
  const byRule = new Map(); // rule -> { count, errors, locs: [] }
  let errors = 0;
  for (const v of violations) {
    const isErr = v.severity === 'error';
    if (isErr) {
      errors++;
    }
    const g = byRule.get(v.rule) ?? { count: 0, errors: 0, locs: [] };
    g.count++;
    if (isErr) {
      g.errors++;
    }
    g.locs.push(`${rel(v.path)}:${v.line ?? '?'}`);
    byRule.set(v.rule, g);
  }
  if (violations.length) {
    // Warns count too, on purpose: the severity knob is the user's choice of how loud, and `/qoq fix` is meant to work warn findings as well.
    totalFindings += violations.length;
    const lines = [...byRule.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(
        ([rule, g]) =>
          `  ${String(rule).padEnd(38)} x${String(g.count).padEnd(3)} ${severityTag(g).padEnd(8)} ${cap(g.locs)}`
      );
    sections.push(
      `JUSTIFY-DISABLE  ${violations.length} violation(s) / ${byRule.size} rule(s)  ` +
        `(${errors} error, ${violations.length - errors} warn)  [not auto-fixable — add a \`@todo <reason>\` comment on the line above the directive, or remove the directive]\n${lines.join('\n')}`
    );
  }
} else if (justifyDisable?.__parseError) {
  sections.push(`JUSTIFY-DISABLE  ⚠ could not parse report: ${justifyDisable.__parseError}`);
}

if (reportsFound === 0) {
  // No report files at all — qoq likely never ran (or wrote elsewhere). Don't
  // claim "clean": that would let a caller skip fixes that do exist.
  const msg = `No *-report.json found in ${reportDir}. Run \`qoq --check --json\` first — --json is what writes them, and they land in the CLI's default report dir.`;
  process.stderr.write(`=== QoQ DIGEST ===\n⚠ ${msg}\n`);
  process.exit(2);
}

if (!sections.length) {
  process.stdout.write('=== QoQ DIGEST ===\nNo findings — all tools clean. ✅\n');
} else {
  process.stdout.write(
    `=== QoQ DIGEST (${reportDir}) ===\n\n${sections.join('\n\n')}\n\nTOTAL: ${totalFindings} finding(s)\n`
  );
}

process.exit(totalFindings > 0 ? 1 : 0);
