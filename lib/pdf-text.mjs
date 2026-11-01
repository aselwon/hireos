import { inflateSync } from 'node:zlib';

function objects(pdf) {
  const found = new Map();
  const source = pdf.toString('latin1');
  const header = /\b(\d+)\s+\d+\s+obj\b/g;
  for (const match of source.matchAll(header)) {
    const end = source.indexOf('endobj', match.index);
    if (end < 0) {
      continue;
    }
    const body = source.slice(match.index + match[0].length, end);
    const streamStart = body.indexOf('stream\n');
    const streamEnd = body.indexOf('endstream', streamStart);
    const stream =
      streamStart >= 0 && streamEnd >= 0
        ? body.slice(streamStart + 7, streamEnd).replace(/\r$/, '')
        : null;
    let data;
    if (stream !== null) {
      data = Buffer.from(stream, 'latin1');
      if (/\/FlateDecode/.test(body.slice(0, streamStart))) {
        try {
          data = inflateSync(data);
        } catch {
          data = Buffer.alloc(0);
        }
      }
    }
    found.set(Number(match[1]), { body, data });
  }
  return found;
}

function unicodeMap(data) {
  const map = new Map();
  for (const [, source, target] of data
    .toString('latin1')
    .matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) {
    map.set(source.toUpperCase(), String.fromCodePoint(parseInt(target, 16)));
  }
  return map;
}

function decodeHex(value, map) {
  const bytes = value.match(/[\da-f]{2}/gi) || [];
  return bytes
    .map((byte) => map.get(byte.toUpperCase()) ?? String.fromCharCode(parseInt(byte, 16)))
    .join('');
}

function decodeLiteral(value) {
  return value.replace(
    /\\([nrtbf()\\])/g,
    (_, char) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' })[char] ?? char
  );
}

export function extractPdfText(pdf) {
  if (!Buffer.isBuffer(pdf) || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new TypeError('Oczekiwano pliku PDF.');
  }
  const found = objects(pdf);
  const maps = new Map();
  for (const object of found.values()) {
    const font = object.body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (font) {
      maps.set(font[1], found.get(Number(font[1])));
    }
  }
  const fontMaps = new Map();
  for (const object of found.values()) {
    for (const font of object.body.matchAll(/\/(\w+)\s+(\d+)\s+\d+\s+R/g)) {
      const fontObject = found.get(Number(font[2]));
      const unicodeRef = fontObject?.body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
      if (unicodeRef) {
        fontMaps.set(font[1], unicodeMap(maps.get(unicodeRef[1])?.data ?? Buffer.alloc(0)));
      }
    }
  }
  const pages = [...found.values()].filter(({ body }) => /\/Type\s*\/Page\b/.test(body));
  const contentIds = pages.flatMap(({ body }) => {
    const contents = body.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    return contents ? [Number(contents[1])] : [];
  });
  const chunks = contentIds.map((id) => {
    const stream = found.get(id)?.data?.toString('latin1') ?? '';
    let font = '';
    const lines = [];
    // PDF text operands end at delimiters; upload validation caps the input at 10 MiB.
    const operations =
      // eslint-disable-next-line sonarjs/super-linear-regex, sonarjs/regex-complexity
      /(\/\w+\s+[\d.]+\s+Tf)|(<[\da-f\s]+>\s*Tj)|(\([^)]*\)\s*Tj)|(\[[^\]]*\]\s*TJ)/gi;
    for (const match of stream.matchAll(operations)) {
      if (match[1]) {
        const [, fontName] = match[1].match(/\/(\w+)/);
        font = fontName;
      } else if (match[2]) {
        lines.push(
          decodeHex(
            match[2].slice(1).split('>')[0].replace(/\s/g, ''),
            fontMaps.get(font) ?? new Map()
          )
        );
      } else if (match[3] !== undefined) {
        lines.push(decodeLiteral(match[3].slice(1, -3)));
      } else if (match[4]) {
        // eslint-disable-next-line sonarjs/super-linear-regex
        const pieces = match[4].matchAll(/<[^>]+>|\([^)]*\)/g);
        lines.push(
          [...pieces]
            .map(([part]) =>
              part.startsWith('<')
                ? decodeHex(part.slice(1, -1).replace(/\s/g, ''), fontMaps.get(font) ?? new Map())
                : decodeLiteral(part.slice(1, -1))
            )
            .join('')
        );
      }
    }
    return lines.join('\n');
  });
  return chunks
    .join('\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
