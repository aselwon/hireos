import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { generateCvEval } from '../scripts/generate-cv-eval.mjs';

const corpus = new URL('../eval/cv/', import.meta.url);

test('corpus contains paired synthetic CVs covering IT roles, seniority, languages and difficult layouts', async () => {
  const files = await readdir(corpus);
  const jsons = files.filter((name) => name.endsWith('.json'));
  assert.ok(jsons.length >= 20);
  assert.equal(files.length, jsons.length * 2);
  const coverage = {
    area: new Set(),
    language: new Set(),
    layout: new Set(),
    seniority: new Set(),
  };
  let gaps = 0;
  for (const file of jsons) {
    const gold = JSON.parse(await readFile(new URL(file, corpus), 'utf8'));
    assert.equal(gold.schemaVersion, 1);
    assert.equal(gold.synthetic, true);
    assert.equal(file, `${gold.id}.json`);
    for (const key of ['area', 'language', 'layout']) {
      coverage[key].add(gold[key]);
    }
    coverage.seniority.add(gold.facts.find((fact) => fact.field === 'seniority').value);
    for (const prefix of ['skills', 'experience.', 'education.', 'languages.']) {
      assert.ok(gold.facts.some((fact) => fact.field.startsWith(prefix)));
    }
    assert.ok(gold.facts.some((fact) => fact.uncertain));
    for (const fact of gold.facts) {
      assert.ok(fact.evidence.length > 0);
      assert.equal(typeof fact.uncertain, 'boolean');
      assert.ok(fact.value === null || typeof fact.value === 'string');
    }
    if (gold.layout === 'date_gaps') {
      const value = (field) => gold.facts.find((fact) => fact.field === field).value;
      assert.ok(value('experience.1.start') > value('experience.0.end'));
      gaps += 1;
    }
    const pdf = await readFile(new URL(`${gold.id}.pdf`, corpus), 'utf8');
    assert.ok(pdf.startsWith('%PDF-1.4\n'));
    assert.ok(pdf.endsWith('%%EOF\n'));
    assert.match(pdf, /\/ToUnicode 6 0 R/);
    const xref = Number(pdf.match(/startxref\n(\d+)/)[1]);
    assert.equal(pdf.slice(xref, xref + 4), 'xref');
    for (const entry of pdf.matchAll(/(\d{10}) 00000 n /g)) {
      assert.match(pdf.slice(Number(entry[1])), /^\d+ 0 obj\n/);
    }
  }
  assert.equal(coverage.area.size, 7);
  assert.deepEqual([...coverage.language].sort(), ['en', 'pl']);
  assert.deepEqual([...coverage.layout].sort(), ['date_gaps', 'standard', 'table', 'two_columns']);
  assert.deepEqual([...coverage.seniority].sort(), ['junior', 'mid', 'senior']);
  assert.ok(gaps >= 3);
});

test('generation is byte-identical across repeated runs and matches the committed corpus', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hireos-cv-eval-'));
  try {
    await generateCvEval(directory);
    const names = (await readdir(corpus)).sort();
    assert.deepEqual((await readdir(directory)).sort(), names);
    const first = new Map();
    for (const name of names) {
      const bytes = await readFile(join(directory, name));
      first.set(name, bytes);
      assert.deepEqual(bytes, await readFile(new URL(name, corpus)), name);
    }
    await generateCvEval(directory);
    for (const name of names) {
      assert.deepEqual(await readFile(join(directory, name)), first.get(name), name);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
