import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const dist = new URL('../hireos/dist/', import.meta.url);
const html = readFileSync(new URL('apply.html', dist), 'utf8');
const app = readFileSync(new URL('app.js', dist), 'utf8');
const styles = readFileSync(new URL('styles.css', dist), 'utf8');

test('dist has no known untranslated English UI labels', () => {
  const source = readdirSync(dist)
    .filter((file) => /\.(html|js)$/.test(file))
    .map((file) => readFileSync(new URL(file, dist), 'utf8'))
    .join('\n');
  for (const phrase of ['Must-have', 'Nice-to-have', 'Seniority', 'Screening report', 'Loading']) {
    assert.equal(source.includes(phrase), false, `Untranslated UI phrase: ${phrase}`);
  }
});

test('application controls have accessible labels', () => {
  for (const id of ['name', 'email', 'cv', 'consent', 'futureRecruitmentConsent']) {
    assert.match(html, new RegExp(`<label[^>]*for="${id}"`), `${id} needs an explicit label`);
    assert.match(html, new RegExp(`id="${id}"`), `${id} control must match its label`);
  }
  assert.match(app, /<label class="field">[^<]+<input/);
  assert.match(app, /<label><input type="checkbox" name="stack"/);
});

test('application layout fits a 375 px viewport and preserves visible keyboard focus', () => {
  assert.match(html, /name="viewport" content="width=device-width/);
  assert.match(
    styles,
    /@media \(max-width: 760px\)\s*\{\s*\.application\s*\{\s*width: calc\(100% - 24px\)/
  );
  assert.match(styles, /\.application input:not\(\[type='checkbox'\]\)\s*\{\s*width: 100%/);
  assert.match(styles, /button:focus-visible,[\s\S]*?outline: 3px solid/);
});
