#!/usr/bin/env node
// Anonymous usage stats for the skill, mirroring what the CLI does in
// `src/helpers/stats.ts` — one count of "the skill ran, and which command".
//
// It's a script rather than prose for the skill to carry out because consent is
// the kind of thing that must not drift: three call sites reading a config by
// eye would each invent their own idea of what "asked already" means, and the
// failure mode is asking someone who already said no.
//
// Consent is resolved in one order, most specific first:
//   1. the project's own `qoq.config.*` — `stats: true|false`, the same key the
//      CLI writes, so one answer covers both
//   2. ~/.claude/qoq/consent.md — the fallback for projects with no config, and
//      the reason a decline doesn't get re-asked in every new checkout
// Neither present means nobody has been asked, which only the caller can fix.
//
// Usage:   node stats.mjs <command> [--consent yes|no] [--project <dir>]
//   <command>   the qoq command that ran: fix, refactor, bump, plan, replan,
//               execute, test, compress, document, mermaid, sheriff, review — all twelve, and each one has to be in
//               the sink's own vocabulary or the run 400s. It is the entire
//               payload beyond the tool name.
//   --consent   record the user's answer first, then act on it
//   --project   where to look for qoq.config.* (default: cwd)
//
// Called by entry.mjs at the head of every run, and by the thread again each time
// an inner command starts. The thread ignores exit 1 on an inner call, because the
// asking belongs to the head of the run.
//
// Exit code: 0 handled (sent, or declined and nothing to do), 1 nobody has been
// asked yet — ask the user and call again with --consent, 2 usage error.
// Branch on the code; stdout says which of the two 0 cases it was, for a human
// reading a log.
//
// Exit 1 also prints the disclosure to put to the user, built from the literal
// payload a few lines below. It lives here rather than in SKILL.md for two
// reasons. It is only read on the one run in a user's life where somebody is
// actually being asked, so every other run stops paying for it. And a
// disclosure written next to the request body cannot drift from what is sent,
// which is the failure that matters: prose describing an older, smaller payload
// is worse than no prose, because it reads as a promise.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// The sink. A blocked POST falls back to the pixel: same ledger, reached with a
// GET, for networks where an outbound POST never leaves but an image fetch does.
// The sink rejects any query key beyond `tool` and `options`.
const STATS_URL = 'https://stats.adamczyk.ovh';
const PIXEL_URL = 'https://adamczyk.ovh/img/stats/pixel.png';
const STATS_TIMEOUT_MS = 2000;

const pixelUrl = ({ tool, options }) =>
  `${PIXEL_URL}?${new URLSearchParams([['tool', tool], ...options.map((o) => ['options', o])])}`;

const CONSENT_FILE = join(homedir(), '.claude', 'qoq', 'consent.md');
const CONFIG_FILES = ['qoq.config.ts', 'qoq.config.js', 'qoq.config.cjs', 'qoq.config.mjs'];

const COMMANDS = [
  'fix',
  'refactor',
  'bump',
  'plan',
  'replan',
  'execute',
  'test',
  'compress',
  'document',
  'mermaid',
  'sheriff',
  'review',
];

const args = process.argv.slice(2);
const [command] = args;
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

const consentArg = flag('consent');
const projectDir = flag('project') ?? process.cwd();

if (!COMMANDS.includes(command) || (consentArg && !['yes', 'no'].includes(consentArg))) {
  process.stderr.write(
    `usage: stats.mjs <${COMMANDS.join('|')}> [--consent yes|no] [--project <dir>]\n`
  );
  process.exit(2);
}

const findConfig = () =>
  CONFIG_FILES.map((name) => join(projectDir, name)).find((path) => existsSync(path));

// Read and write the config as source text, never as a parsed object: these
// files import workspace packages and carry the user's comments, so evaluating
// one is expensive and re-serializing it would throw their formatting away.
// `stats` is the only key in the schema by that name, so a bare match is safe.
const readConfigConsent = (path) => {
  const match = /\bstats\s*:\s*(true|false)\b/.exec(readFileSync(path, 'utf8'));
  return match ? match[1] === 'true' : undefined;
};

const writeConfigConsent = (path, stats) => {
  const source = readFileSync(path, 'utf8');
  const patched = source.replace(
    /((?:module\.exports\s*=|export\s+default)\s*\{)/,
    `$1 stats: ${stats},`
  );

  if (patched === source) {
    return false;
  }

  writeFileSync(path, patched);

  return true;
};

const readFileConsent = () => {
  if (!existsSync(CONSENT_FILE)) {
    return undefined;
  }

  const match = /\bstats\s*:\s*(true|false)\b/.exec(readFileSync(CONSENT_FILE, 'utf8'));

  return match ? match[1] === 'true' : undefined;
};

const writeFileConsent = (stats) => {
  mkdirSync(join(homedir(), '.claude', 'qoq'), { recursive: true });
  writeFileSync(
    CONSENT_FILE,
    [
      '---',
      `stats: ${stats}`,
      '---',
      '',
      `Recorded ${new Date().toISOString().slice(0, 10)} by the qoq skill.`,
      'Delete this file to be asked again.',
      '',
    ].join('\n')
  );
};

const payload = () => ({ tool: 'qoq-skill', options: [command] });

// Two endpoints, like the CLI's, and fire-and-forget like it too: a dead or slow endpoint must never surface as
// an error or hold a run up, hence the swallowed catch and the 2s cap.
const send = async () => {
  // One deadline for both attempts, so the fallback doesn't double the worst
  // case: a POST that burns the budget leaves the pixel pre-aborted, and a
  // blocked one fails fast enough to leave room.
  const signal = AbortSignal.timeout(STATS_TIMEOUT_MS);

  try {
    const response = await fetch(STATS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload()),
      signal,
    });

    // A 4xx or 5xx counted nothing, same as never reaching the sink at all, so
    // it takes the same path out as a thrown request does.
    if (!response.ok) {
      throw new Error(`stats: ${response.status}`);
    }
  } catch {
    try {
      await fetch(pixelUrl(payload()), { signal });
    } catch {
      // Stats are best-effort; a failed send is not the user's problem.
    }
  }
};

// Quoting the real body rather than describing it: the user is being asked to
// agree to a request, and the request is the only honest thing to show them.
const disclosure = () =>
  [
    'ask: no consent on record',
    '',
    'Put this to the user with AskUserQuestion, on these facts:',
    '',
    `  Each run posts exactly this to ${STATS_URL}:`,
    `    ${JSON.stringify(payload())}`,
    '',
    '  If that POST is blocked, the same two values are fetched as an image',
    '  instead, which counts the same run and carries nothing more:',
    `    ${pixelUrl(payload())}`,
    '',
    '  Never sent: their code, file names, paths, config contents, tool',
    '  findings, project or package names, scope arguments, plan contents, or',
    '  anything identifying them or their machine.',
    '',
    'Then call again with --consent yes|no. The answer is recorded and nobody',
    'is asked twice.',
  ].join('\n');

const report = async (stats) => {
  if (stats) {
    await send();
  }

  process.stdout.write(stats ? 'sent\n' : 'declined\n');
  process.exit(0);
};

const configPath = findConfig();

if (consentArg) {
  const stats = consentArg === 'yes';

  // The config is where the CLI looks too, so recording there means the user is
  // asked once by either entry point rather than once by each.
  if (!configPath || !writeConfigConsent(configPath, stats)) {
    writeFileConsent(stats);
  }

  await report(stats);
}

const consent = (configPath ? readConfigConsent(configPath) : undefined) ?? readFileConsent();

if (consent === undefined) {
  process.stdout.write(`${disclosure()}\n`);
  process.exit(1);
}

await report(consent);
