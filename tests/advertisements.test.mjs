import assert from 'node:assert/strict';
import test from 'node:test';

import { openStore } from '../lib/store.mjs';

const briefInput = {
  title: 'Backend Developer',
  stack: ['Node.js'],
  seniority: 'senior',
  salary: { min: 20000, max: 25000, currency: 'PLN', basis: 'net', contractType: 'b2b' },
  location: 'Warszawa',
  remote: false,
};

function createBrief(store) {
  return store.createBrief(briefInput, 'brief-create');
}

test('fake provider deterministycznie generuje ogłoszenie; można je zapisać i zatwierdzić', async (t) => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const brief = await createBrief(store);
  const generated = await store.generateBrief(brief.id, 'generate-one');
  assert.deepEqual(generated, await store.generateBrief(brief.id, 'generate-two'));
  const saved = store.saveContent(brief.id, generated, 'save-one');
  assert.equal(saved.requirements.length, 2);
  assert.ok(
    saved.requirements.every(
      (item) => ['must', 'nice'].includes(item.priority) && [1, 2, 3].includes(item.weight)
    )
  );
  assert.equal(store.approveBrief(brief.id, 'approve-one').status, 'approved');
});

test('niepoprawny JSON jest ponawiany dokładnie raz, po czym zwraca polski błąd', async (t) => {
  let calls = 0;
  const store = openStore(':memory:', {
    provider: {
      name: 'fake',
      generate: () => {
        calls += 1;
        return { text: '{' };
      },
    },
  });
  t.after(() => store.close());
  const brief = await createBrief(store);
  await assert.rejects(
    store.generateBrief(brief.id, 'bad-json'),
    /Nie udało się wygenerować poprawnego ogłoszenia/
  );
  assert.equal(calls, 2);
});

test('aplikacja nie jest przyjmowana do niezatwierdzonej rekrutacji', async (t) => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const brief = await createBrief(store);
  assert.throws(
    () =>
      store.createApplication(
        brief.id,
        { name: 'Jan Test', email: 'jan@example.test', consentVersion: 'v1' },
        'application-one'
      ),
    { status: 409, message: 'Rekrutacja nie przyjmuje aplikacji.' }
  );
});
