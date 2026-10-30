#!/usr/bin/env node
// How much of the plan's limits is left, and may `execute` spend it?
//
// `qoq execute` runs one ticket after another unattended for as long as the
// plan has tickets, so it is the one command that can drain a session or a
// week's budget while nobody is watching. This answers the question it asks
// before each ticket: what is consumed now, and does that cross the ceiling
// the user set with --session-limit / --weekly-limit.
//
// It's a script rather than prose for the skill to carry out because the
// numbers come from an authenticated endpoint and the comparison is a `>=`
// nobody should be re-deciding per ticket — an eyeballed "looks fine" over a
// number the model never fetched is indistinguishable from a real check in the
// transcript.
//
// Usage:   node usage-check.mjs [--session-limit <pct>] [--weekly-limit <pct>]
//   --session-limit  percent of the 5-hour session limit execution may consume
//   --weekly-limit   percent of the 7-day limit execution may consume
//   Both default to 100 — the gate then fires only on an exhausted limit.
//
// Exit code: 0 proceed, 1 a limit is reached — show stdout to the user and ask
// before dispatching the next ticket, 2 usage error (a limit isn't a
// percentage). stdout is one line per window, meant to be shown as-is.
//
// A failed fetch is exit 0 with `usage unavailable` on stdout, not a stop: the
// endpoint being down is not a reason to wedge a plan, and the account's real
// limits enforce themselves regardless of whether this check ran.

import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

// Number(), not parseInt: parseInt('90abc') is 90, and a typo that silently
// becomes a valid ceiling is the one failure this script exists to stop. Above
// 100 the gate could never fire; below 0 it always would. Both are typos — as
// is the empty string, which Number() would otherwise turn into a pause-always
// 0 rather than the mistake it is.
export const parseLimit = (name, value) => {
  if (value === undefined) {
    return 100;
  }
  const parsed = value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`--${name} must be a percentage between 0 and 100 (got "${value}")`);
  }
  return parsed;
};

// At the limit counts as reached: a ceiling of 80 means execution stops having
// spent 80%, not after overrunning it.
export const verdict = (usage, { sessionLimit, weeklyLimit }) => {
  const windows = [
    { label: 'session (5h)', used: usage.five_hour.utilization, limit: sessionLimit },
    { label: 'weekly (7d)', used: usage.seven_day.utilization, limit: weeklyLimit },
  ];
  const lines = windows.map(
    ({ label, used, limit }) =>
      `${label}: ${used}% used of ${limit}% allowed — ${Math.max(0, limit - used)}% headroom`
  );
  const reached = windows.filter(({ used, limit }) => used >= limit);
  return {
    ok: reached.length === 0,
    lines: reached.length
      ? [...lines, `LIMIT REACHED: ${reached.map(({ label }) => label).join(', ')}`]
      : lines,
  };
};

const loadToken = () => {
  const fromEnv = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (fromEnv) {
    return fromEnv;
  }
  const path = join(homedir(), '.claude', '.credentials.json');
  return JSON.parse(readFileSync(path, 'utf8')).claudeAiOauth.accessToken;
};

const fetchUsage = async (token) => {
  const res = await fetch(USAGE_URL, {
    headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? `${res.status} ${res.statusText} — token may be expired, run \`claude\` once to refresh it`
        : `${res.status} ${res.statusText}`
    );
  }
  return res.json();
};

// import.meta.url is realpath'd and argv[1] isn't, so compare real paths: through
// the .claude/skills/qoq symlink this block otherwise never runs and the gate
// exits 0 with nothing on stdout.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? undefined : args[index + 1];
  };

  let limits;
  try {
    limits = {
      sessionLimit: parseLimit('session-limit', flag('session-limit')),
      weeklyLimit: parseLimit('weekly-limit', flag('weekly-limit')),
    };
  } catch (error) {
    process.stderr.write(`usage-check: ${error.message}\n`);
    process.exit(2);
  }

  let usage;
  try {
    usage = await fetchUsage(loadToken());
  } catch (error) {
    process.stdout.write(`usage unavailable: ${error.message}\n`);
    process.exit(0);
  }

  const { ok, lines } = verdict(usage, limits);
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exit(ok ? 0 : 1);
}
