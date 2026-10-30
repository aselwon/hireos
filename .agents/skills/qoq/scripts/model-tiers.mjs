#!/usr/bin/env node
// What the opus / sonnet / haiku tiers resolve to, and the one way qoq changes it.
//
// qoq never maps a tier itself. Claude Code already resolves every alias through
// ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL — subagent frontmatter and the
// Agent tool's per-call `model` both — and reads them from the `env` block of its
// settings files, local over project over user. So that is the one place a
// mapping lives; a qoq file of its own couldn't reach a per-call tier at all.
// Unset means the default alias, and nothing here ever creates a file unasked.
//
// Three modes:
//   (default)   one WARN line per mapping that sends a tier to a dearer family.
//               Nothing mapped, or nothing dearer, prints nothing.
//   --failed <tier>
//               the report for a dispatch that failed because <tier> didn't
//               resolve, and what the caller may do about it.
//   --set <tier>=<id> --scope local|user
//               write that one key, and only after the user confirmed both the
//               id and the scope. Every other key in the file is kept, and the
//               same WARN lines follow, so a dearer mapping is flagged at once.
//
// Usage:   model-tiers.mjs [--project <dir>] [--failed <tier> | --set <tier>=<id> --scope local|user]
//
// Exit code: 0, or 2 on a usage error or a settings file that isn't JSON —
// rewriting one we couldn't parse would throw the user's settings away.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TIERS = ['haiku', 'sonnet', 'opus'];
// Cheapest first, by list price. Fable is no qoq tier, but a mapping can target it.
const FAMILIES = [...TIERS, 'fable'];
const envKey = (tier) => `ANTHROPIC_DEFAULT_${tier.toUpperCase()}_MODEL`;

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

const project = flag('project') ?? process.cwd();
const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');

// Lowest precedence first, so a later file wins. A shell export counts below
// all of them, the way a settings `env` block applies over it.
const SCOPES = {
  user: join(configDir, 'settings.json'),
  project: join(project, '.claude', 'settings.json'),
  local: join(project, '.claude', 'settings.local.json'),
};

const usage = (message) => {
  process.stderr.write(
    `${message}\nusage: model-tiers.mjs [--project <dir>] [--failed <${TIERS.join('|')}> | --set <tier>=<id> --scope local|user]\n`
  );
  process.exit(2);
};

const readSettings = (path) => {
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return usage(
      `${path} is not valid JSON — fix it by hand; nothing was read from or written to it.`
    );
  }
};

// tier → { model, source }, for mapped tiers only.
const mappings = () => {
  const found = {};

  for (const tier of TIERS) {
    const fromShell = process.env[envKey(tier)];

    if (fromShell) {
      found[tier] = { model: fromShell, source: 'the shell environment' };
    }
  }

  for (const [scope, path] of Object.entries(SCOPES)) {
    const env = readSettings(path).env ?? {};

    for (const tier of TIERS) {
      if (env[envKey(tier)]) {
        found[tier] = { model: env[envKey(tier)], source: `${scope} settings (${path})` };
      }
    }
  }

  return found;
};

const familyOf = (model) => FAMILIES.find((family) => model.toLowerCase().includes(family));

const warn = () => {
  for (const [tier, { model, source }] of Object.entries(mappings())) {
    const family = familyOf(model);

    if (family && FAMILIES.indexOf(family) > FAMILIES.indexOf(tier)) {
      process.stdout.write(
        `WARN: ${tier} → ${model} (${family}) costs more than the tier it replaces — set in ${source}\n`
      );
    }
  }
};

const failed = flag('failed');
const set = flag('set');

if (failed !== undefined) {
  if (!TIERS.includes(failed)) {
    usage(`--failed takes one of ${TIERS.join(', ')}, not \`${failed}\`.`);
  }

  const current = mappings()[failed];
  const self = fileURLToPath(import.meta.url);

  process.stdout.write(
    [
      `tier \`${failed}\` did not resolve — it currently points at ${
        current
          ? `${current.model}, set as ${envKey(failed)} in ${current.source}`
          : 'the default alias'
      }.`,
      `ACTION: tell the user exactly that, and stop the dispatch. Ask them which model id \`${failed}\` should map to, and where: local (.claude/settings.local.json — this project, this machine) or user (${SCOPES.user} — every project). Write it only once they have confirmed both: \`node ${self} --project ${project} --set ${failed}=<id> --scope local|user\`. Never re-dispatch on another tier yourself, and never save the choice to memory — the settings file is its only home. If they decline, stop there.`,
      '',
    ].join('\n')
  );
} else if (set !== undefined) {
  const [tier, model] = set.split(/=(.*)/s);
  const scope = flag('scope');

  if (!TIERS.includes(tier) || !model) {
    usage(`--set takes <${TIERS.join('|')}>=<model id>, not \`${set}\`.`);
  }

  // The committed project file is never written: a provider's model id belongs
  // to one machine, not to everyone who clones the repo.
  if (!['local', 'user'].includes(scope)) {
    usage('--set needs --scope local or --scope user.');
  }

  const path = SCOPES[scope];
  const settings = readSettings(path);

  settings.env = { ...settings.env, [envKey(tier)]: model };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  process.stdout.write(`mapped ${tier} → ${model} as ${envKey(tier)} in ${path}\n`);
  warn();
} else {
  warn();
}
