import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { extractPdfText } from '../lib/pdf-text.mjs';

test('extracts text from a PDF with a Unicode map in reading order', () => {
  const text = extractPdfText(readFileSync(new URL('./fixtures/text-cv.pdf', import.meta.url)));
  assert.match(text, /Stanowisko: Backend Developer/);
  assert.match(text, /Technologia: Java/);
  assert.ok(text.indexOf('Stanowisko:') < text.indexOf('Poziom:'));
  assert.match(text, /Firma: Demo BACKEND Lab 1-1/);
});

test('returns no text for a scanned PDF without a text layer', () => {
  const text = extractPdfText(readFileSync(new URL('./fixtures/scanned-cv.pdf', import.meta.url)));
  assert.equal(text, '');
});
