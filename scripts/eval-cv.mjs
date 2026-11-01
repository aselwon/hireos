import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { createCvProfiles } from '../lib/cv-profiles.mjs';
import { migrate } from '../lib/migrations.mjs';
import { createModelGateway } from '../lib/model-gateway.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const corpus = join(root, 'eval/cv');
const categories = ['skills', 'roles', 'periods', 'languages'];
const runId = `${Date.now()}-${process.pid}`;

function options(args) {
  const minArg = args.find((arg) => arg.startsWith('--min='));
  const min = minArg ? Number(minArg.slice(6)) : 0;
  if (!Number.isFinite(min) || min < 0 || min > 1) {
    throw new Error('--min musi być liczbą od 0 do 1.');
  }
  if (args.some((arg) => !['--live'].includes(arg) && !arg.startsWith('--min='))) {
    throw new Error('Użycie: npm run eval:cv [-- --min=0.9] [--live]');
  }
  return { live: args.includes('--live'), min };
}

function expected(gold) {
  const get = (prefix) => gold.facts.filter((fact) => fact.field.startsWith(prefix));
  return {
    skills: get('skills')
      .filter((fact) => !fact.uncertain)
      .map((fact) => fact.value),
    roles: get('experience.')
      .filter((fact) => fact.field.endsWith('.role'))
      .map((fact) => fact.value),
    periods: get('experience.')
      .filter((fact) => /\.(start|end)$/.test(fact.field))
      .map((fact) => fact.value),
    languages: get('languages.').map((fact) => fact.value),
  };
}

function actual(profile) {
  return {
    skills: profile.skills.filter((fact) => !fact.uncertain).map((fact) => fact.value),
    roles: [...profile.experience.map((fact) => fact.value.role)],
    periods: profile.experience.flatMap((fact) => [fact.value.from, fact.value.to]),
    languages: profile.languages.map((fact) => fact.value),
  };
}

function score(gold, profile) {
  const wanted = expected(gold);
  const found = actual(profile);
  return Object.fromEntries(
    categories.map((category) => {
      const expectedValues = wanted[category];
      const actualValues = [...found[category]];
      const matched = expectedValues.filter((value) => {
        const index = actualValues.indexOf(value);
        if (index < 0) {
          return false;
        }
        actualValues.splice(index, 1);
        return true;
      }).length;
      const total = Math.max(expectedValues.length, found[category].length);
      return [
        category,
        {
          correct: matched,
          total,
          accuracy: total ? matched / total : 1,
        },
      ];
    })
  );
}

async function parseLive(db, id) {
  const pdf = await readFile(join(corpus, `${id}.pdf`), 'utf8');
  const cmap = pdf.match(/begincmap([\s\S]*?)endcmap/)?.[1] || '';
  const unicode = new Map(
    [...cmap.matchAll(/<([\da-f]{2})> <([\da-f]{4})>/gi)].map((match) => [
      match[1].toLowerCase(),
      String.fromCharCode(parseInt(match[2], 16)),
    ])
  );
  const content = pdf.match(/stream\n([\s\S]*?)\nendstream/)?.[1] || '';
  const text = [...content.matchAll(/<([\da-f]+)> Tj/gi)]
    .map((match) =>
      (match[1].match(/.{2}/g) || []).map((code) => unicode.get(code.toLowerCase()) || '').join('')
    )
    .join('\n');
  const applicationId = `eval-${runId}-${id}`;
  db.prepare(
    'INSERT INTO cv_files (id, application_id, storage_path, original_name, sha256, size_bytes, extracted_text, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    applicationId,
    applicationId,
    `${id}.pdf`,
    `${id}.pdf`,
    createHash('sha256').update(pdf).digest('hex'),
    Buffer.byteLength(pdf),
    text,
    'extracted'
  );
  const profiles = createCvProfiles(db, createModelGateway(db));
  return (await profiles.parseCv(applicationId, `eval-cv-${runId}-${id}`)).profile;
}

export async function runCvEval(args = process.argv.slice(2)) {
  const { live, min } = options(args);
  if (live && process.env.MODEL_PROVIDER !== 'cloudflare') {
    throw new Error('Tryb live wymaga MODEL_PROVIDER=cloudflare i konfiguracji bramki.');
  }
  const dbPath = live
    ? process.env.HIREOS_DATABASE_PATH || join(root, 'data/hireos.sqlite')
    : ':memory:';
  if (live) {
    await mkdir(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  try {
    migrate(db);
    const ids = (await readdir(corpus))
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => basename(file, '.json'));
    const results = [];
    for (const id of ids) {
      const gold = JSON.parse(await readFile(join(corpus, `${id}.json`), 'utf8'));
      const profile = live
        ? await parseLive(db, id)
        : JSON.parse(await readFile(join(corpus, 'replay', `${id}.json`), 'utf8'));
      results.push({ id, categories: score(gold, profile) });
    }
    const neurons = live
      ? db
          .prepare(
            'SELECT COALESCE(SUM(estimated_neurons), 0) AS estimated, SUM(actual_neurons) AS actual FROM model_calls WHERE idempotency_key LIKE ?'
          )
          .get(`eval-cv-${runId}-%`)
      : { estimated: 0, actual: null };
    const report = {
      schemaVersion: 1,
      mode: live ? 'live' : 'replay',
      generatedAt: new Date().toISOString(),
      minimumAccuracy: min,
      categories: Object.fromEntries(
        categories.map((category) => {
          const totals = results.reduce(
            (sum, item) => ({
              correct: sum.correct + item.categories[category].correct,
              total: sum.total + item.categories[category].total,
            }),
            { correct: 0, total: 0 }
          );
          return [
            category,
            { ...totals, accuracy: totals.total ? totals.correct / totals.total : 1 },
          ];
        })
      ),
      neurons,
      results,
    };
    const passed = categories.every((category) => report.categories[category].accuracy >= min);
    report.passed = passed;
    const outputDir = join(root, 'eval/results');
    await mkdir(outputDir, { recursive: true });
    const output = join(outputDir, `${new Date().toISOString().replaceAll(':', '-')}.json`);
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(
      `${JSON.stringify({ output, passed, categories: report.categories, neurons: report.neurons }, null, 2)}\n`
    );
    return passed;
  } finally {
    db.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (!(await runCvEval())) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
