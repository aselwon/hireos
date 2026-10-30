#!/usr/bin/env node
// Did compressing <original> into <compressed> drop a fact an agent needs?
//
// `qoq compress` rewrites a doc in place with no per-file approval, so the one
// failure that has to be caught mechanically is a *load-bearing literal* going
// missing: a path, a command, a flag, a filename, a URL. Losing a sentence of
// rationale costs nothing. Losing `npm run test -- {file}` costs every agent
// that reads the file afterwards, and it's invisible in a diff full of
// intentional deletions — which is exactly why the model that just did the
// compressing is the wrong thing to ask.
//
// Two lists come back, and they fail in opposite directions:
//   dropped   — in the original, gone from the compressed. Restore it, or be
//               able to say why it was redundant (three spellings of the same
//               path collapse to one and that's fine — this compares sets).
//   invented  — in the compressed, absent from the original. Worse than a drop:
//               nothing in compression should *create* a path or a command, so
//               a hit here is usually a hallucinated filename.
//
// Usage:   node compress-check.mjs <original> <compressed>
//
// Exit code: 0 clean, 1 something dropped or invented, 2 usage error. Exit 1 is
// "read this list", not "revert" — the caller decides, per literal.

import { existsSync, readFileSync } from 'node:fs';

const [originalPath, compressedPath] = process.argv.slice(2);

if (!originalPath || !compressedPath) {
  process.stderr.write('usage: compress-check.mjs <original> <compressed>\n');
  process.exit(2);
}

for (const path of [originalPath, compressedPath]) {
  if (!existsSync(path)) {
    process.stderr.write(`no such file: ${path}\n`);
    process.exit(2);
  }
}

// A filename only counts as one when its extension is a real one. Without the
// list, every "e.g." and "vs." in the prose reads as a file and the dropped
// list drowns in noise nobody will read to the end of.
const EXTENSIONS =
  'md|markdown|json|jsonc|ts|tsx|js|jsx|mjs|cjs|yml|yaml|toml|sh|txt|lock|css|scss|html';

const FENCE = /^\s*```/;

// Trailing sentence punctuation is prose, not part of the literal. Scanned back
// rather than matched with `[…]+$`, which backtracks super-linearly on a long
// line and is a lint error here besides.
const TRAILING = new Set(['.', ',', ';', ':', '!', '?', ')', ']']);

const trimTrailing = (value) => {
  let end = value.length;
  while (end > 0 && TRAILING.has(value[end - 1])) {
    end -= 1;
  }
  return value.slice(0, end);
};

// The comment a fenced line ends with, if any. One `\s` and no quantifier, so
// there's nothing to backtrack — and a URL is safe, since the whitespace before
// `https` is followed by a letter, never by the `//`.
const COMMENT = /\s(?:#|\/\/)/;
const WHOLE_LINE_COMMENT = /^\s*(?:#|\/\/)/;

// Fenced blocks are commands as often as they are code, and a command is only
// itself whole — so each line comes back intact rather than tokenised. Comments
// don't: the whole point of this command is deleting prose, and counting a
// deleted `# Install dependencies` as a lost literal would bury the real losses.
const split = (text) => {
  const commands = [];
  const prose = [];
  let inFence = false;

  for (const line of text.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      prose.push(line);
    } else if (!WHOLE_LINE_COMMENT.test(line)) {
      const comment = line.search(COMMENT);
      commands.push(comment === -1 ? line : line.slice(0, comment));
    }
  }

  return { commands, prose: prose.join('\n') };
};

const literalsIn = (text) => {
  const found = new Set();
  const add = (value) => {
    const literal = trimTrailing(value.trim());
    if (literal.length > 1) {
      found.add(literal);
    }
  };

  const { commands, prose: outsideCode } = split(text);

  for (const command of commands) {
    add(command);
  }
  for (const [, span] of outsideCode.matchAll(/`([^`\n]+)`/g)) {
    add(span);
  }
  for (const [url] of outsideCode.matchAll(/\bhttps?:\/\/\S+/g)) {
    add(url);
  }
  // Bare paths and filenames the author never wrapped in backticks. A slash
  // with word characters on both sides, or a name carrying a known extension.
  for (const [path] of outsideCode.matchAll(/\b[\w@.-]+\/[\w@./*{}-]+/g)) {
    add(path);
  }
  for (const [name] of outsideCode.matchAll(
    new RegExp(`\\b[\\w@.-]+\\.(?:${EXTENSIONS})\\b`, 'g')
  )) {
    add(name);
  }

  return found;
};

const words = (text) => text.split(/\s+/).filter(Boolean).length;

const original = readFileSync(originalPath, 'utf8');
const compressed = readFileSync(compressedPath, 'utf8');

const before = literalsIn(original);
const after = literalsIn(compressed);

const dropped = [...before].filter((literal) => !after.has(literal)).sort();
const invented = [...after].filter((literal) => !before.has(literal)).sort();

const wordsBefore = words(original);
const wordsAfter = words(compressed);
const saved = wordsBefore === 0 ? 0 : Math.round((1 - wordsAfter / wordsBefore) * 100);

process.stdout.write(`${originalPath}: ${wordsBefore} → ${wordsAfter} words (-${saved}%)\n`);

for (const literal of dropped) {
  process.stdout.write(`  dropped   ${literal}\n`);
}
for (const literal of invented) {
  process.stdout.write(`  invented  ${literal}\n`);
}

process.exit(dropped.length || invented.length ? 1 : 0);
