#!/usr/bin/env node
// Estimate calibration for `qoq plan` — kept out of prose for the same reason
// `stats.mjs` is: three call sites resolving a threshold by eye would each
// invent their own idea of what "keeps going wrong" means, and a mis-read
// threshold leaves nothing in the transcript to notice.
//
// An estimate is one decision with two halves — the t-shirt size and the model
// tier it gets delegated to. Outcomes are counted per tier inside the bucket,
// because "this shape of work is fine at sonnet and hopeless at haiku" is the
// sentence the record has to be able to say, and a tier-blind count can't.
//
// The bucket is the exact tag *combination* scoped to one tech stack, never a
// single tag and never a stack-blind average: `pattern-repeat` alone estimates
// fine, `pattern-repeat + architectural` may reliably blow up, and the same
// combination can be safe in React and hopeless in NestJS inside one repo.
//
// Two verdicts, and they read different columns:
//   - escalate — this tier keeps missing. Retries mean the model was too small,
//     and a bigger one is much the cheaper side of that mistake.
//   - split    — no tier delivers this bucket at all, even after `execute`
//     escalated as far as it could. That's the ticket being wrong, not the
//     model, and a bigger model fixes nothing.
//
// Usage:
//   estimate.mjs --tags a,b --stack react --size S --tier haiku [--project DIR]
//   estimate.mjs --record --tags a,b --stack react --tier haiku
//                --outcome success|failure --attempts N
//                --attribution as-estimated|scope-expansion
//                [--summary "..."] [--project DIR]
//
// Exit code, estimate mode — branch on it rather than parsing the JSON:
//   0  the pick stands (in band, or too little data to argue)
//   1  keeps missing — take the dearer tier it returns, flag it for approval
//   2  split — this shape of ticket keeps going undelivered, decompose it
//   4  usage error
// Record mode: 0 recorded, 4 usage error.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';

// Enough outcomes for a count to mean anything. Below this every bucket on a
// fresh project would flag every ticket in the plan, which turns the warning
// into wallpaper exactly when it starts being worth reading.
const MIN_ATTEMPTS = 3;

// Only misses are logged, so growth is slow — but "slow" is still unbounded on
// a bucket that keeps going wrong. The log is diagnostic: what a human reads to
// see the shape of it. The counts are what drive the verdict.
const LOG_CAP = 20;

// The per-ticket budget in `execute`. Landing inside it is the tier working;
// past it means the ticket only landed after an escalation, which is this call
// having rated it wrong — counted as a miss even though it was delivered.
const BUDGET = 3;

const TIERS = ['haiku', 'sonnet', 'session'];
const OUTCOMES = ['success', 'failure'];
const ATTRIBUTIONS = ['as-estimated', 'scope-expansion'];

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? undefined : args[index + 1];
};

const die = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(4);
};

const projectRoot = resolvePath(flag('project') ?? process.cwd());
const tags = flag('tags');
const stack = flag('stack');
const tier = flag('tier');

if (!tags || !stack || !TIERS.includes(tier)) {
  die(
    'usage: estimate.mjs --tags a,b --stack <stack> --tier haiku|sonnet|session ' +
      '--size XS|S|M  (or --record, see the header)'
  );
}

// Sorted and de-duplicated so `a,b` and `b,a` are one bucket. Tag order is an
// accident of how a ticket was read; treating it as significant would silently
// scatter one combination's history across several buckets, and every one of
// them would look like it had too little data to say anything.
const bucket = `${[
  ...new Set(
    tags
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
  ),
]
  .sort()
  .join('+')}|${stack.trim().toLowerCase()}`;

// Travels with a clone and is visible in review, which is what makes it worth
// having: the calibration is about this repo's tickets, so it belongs to the
// repo rather than to whichever machine happened to run the plan.
const storePath = join(projectRoot, '.claude', 'qoq-estimator.json');

const loadStore = () => {
  if (!existsSync(storePath)) {
    return { version: 1, buckets: {} };
  }

  try {
    return JSON.parse(readFileSync(storePath, 'utf8'));
  } catch {
    // Never fall back to an empty store here. A corrupt file read as "no data"
    // silently resets every bucket it held, and the only symptom is estimates
    // quietly getting worse.
    return die(`unreadable calibration file: ${storePath}`);
  }
};

const emptyTier = () => ({ attempts: 0, misses: 0 });
const emptyBucket = () => ({ scopeExpansions: 0, log: [], tiers: {} });

const store = loadStore();
const entry = { ...emptyBucket(), ...store.buckets[bucket] };

if (args.includes('--record')) {
  const outcome = flag('outcome');
  const attempts = Number(flag('attempts'));
  const attribution = flag('attribution');

  if (
    !OUTCOMES.includes(outcome) ||
    !ATTRIBUTIONS.includes(attribution) ||
    !Number.isInteger(attempts) ||
    attempts < 1
  ) {
    die(
      'usage: estimate.mjs --record --tags a,b --stack <stack> --tier <tier> ' +
        '--outcome success|failure --attempts N ' +
        '--attribution as-estimated|scope-expansion [--summary "..."]'
    );
  }

  // Scope discovered mid-execution says nothing about whether the estimate was
  // right — the ticket that was estimated is not the ticket that got built. It
  // is counted, because a combination that keeps growing scope is worth seeing,
  // but it never touches a verdict.
  if (attribution === 'scope-expansion') {
    entry.scopeExpansions += 1;
  } else {
    const missed = outcome === 'failure' || attempts > BUDGET;
    const counters = { ...emptyTier(), ...entry.tiers[tier] };

    counters.attempts += 1;
    counters.misses += missed ? 1 : 0;
    entry.tiers[tier] = counters;

    if (missed) {
      entry.log = [
        ...entry.log,
        {
          date: new Date().toISOString().slice(0, 10),
          tier,
          attempts,
          outcome,
          summary: flag('summary') ?? '',
        },
      ].slice(-LOG_CAP);
    }
  }

  store.buckets[bucket] = entry;
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
  process.stdout.write(`recorded ${bucket} @ ${tier} → ${storePath}\n`);
  process.exit(0);
}

const size = flag('size');

if (!['XS', 'S', 'M'].includes(size)) {
  die('--size takes XS, S or M');
}

const at = (name) => ({ ...emptyTier(), ...entry.tiers[name] });
const atThisTier = at(tier);

// Every tier pooled, and counting only what was never delivered at all. A
// combination nothing can deliver is a badly-shaped ticket, and that verdict
// has nothing to do with which model was pointed at it — so the split signal
// reads the pool while the escalate signal reads its own lane.
const undelivered = entry.log.filter(({ outcome }) => outcome === 'failure').length;
const pooled = TIERS.reduce((total, name) => total + at(name).attempts, 0);

// A simple majority, both times. Half a bucket going wrong is past the point
// where the pick is worth defending, and a threshold with a decimal in it would
// only invite argument about the decimal.
const verdict = (() => {
  if (pooled >= MIN_ATTEMPTS && undelivered * 2 > pooled) {
    return 'split';
  }

  if (atThisTier.attempts < MIN_ATTEMPTS) {
    return 'baseline';
  }

  return atThisTier.misses * 2 > atThisTier.attempts ? 'escalate' : 'confident';
})();

// Up only. `plan.md` is explicit that an inflated rating costs a bigger model
// and nothing more — cheap, next to three failed attempts and an escalation.
// There is no downgrade: it would be an experiment run on the user's ticket to
// save one rung, and it needs a guard against oscillating between two rungs
// that costs more than the rung ever did.
//
// At the top rung there is nowhere to escalate to, and this still exits 1 —
// that is the model-ceiling case `plan.md` already surfaces at approval.
const chosen = (verdict === 'escalate' ? TIERS[TIERS.indexOf(tier) + 1] : undefined) ?? tier;

process.stdout.write(
  `${JSON.stringify(
    {
      bucket,
      verdict,
      size,
      tier: chosen,
      tierChange: chosen === tier ? null : `${tier}→${chosen}`,
      misses: atThisTier.misses,
      attempts: atThisTier.attempts,
      undelivered,
      pooledAttempts: pooled,
      scopeExpansions: entry.scopeExpansions,
      recentMisses: entry.log.slice(-3),
    },
    null,
    2
  )}\n`
);

process.exit({ baseline: 0, confident: 0, escalate: 1, split: 2 }[verdict]);
