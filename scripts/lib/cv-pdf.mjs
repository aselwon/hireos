// Standardowa czcionka PDF z jawnym kodowaniem polskich znaków i mapą Unicode.
const polishGlyphs = [
  ['ą', 'aogonek'],
  ['ć', 'cacute'],
  ['ę', 'eogonek'],
  ['ł', 'lslash'],
  ['ń', 'nacute'],
  ['ó', 'oacute'],
  ['ś', 'sacute'],
  ['ź', 'zacute'],
  ['ż', 'zdotaccent'],
  ['Ą', 'Aogonek'],
  ['Ć', 'Cacute'],
  ['Ę', 'Eogonek'],
  ['Ł', 'Lslash'],
  ['Ń', 'Nacute'],
  ['Ó', 'Oacute'],
  ['Ś', 'Sacute'],
  ['Ź', 'Zacute'],
  ['Ż', 'Zdotaccent'],
];
const characters = Array.from({ length: 95 }, (_, index) => [
  String.fromCharCode(index + 32),
  index + 32,
]).concat(polishGlyphs.map(([character], index) => [character, index + 128]));
const encoding = new Map(characters);
const hex = (value, length) => value.toString(16).padStart(length, '0');

function textHex(text) {
  return [...text]
    .map((character) => {
      const code = encoding.get(character);
      if (code === undefined) {
        throw new Error(`Nieobsługiwany znak PDF: ${character}`);
      }
      return hex(code, 2);
    })
    .join('');
}

function wrap(text, limit) {
  const lines = [''];
  for (const word of text.split(' ')) {
    const last = lines.length - 1;
    if (lines[last] && lines[last].length + word.length + 1 > limit) {
      lines.push(word);
    } else {
      lines[last] += `${lines[last] ? ' ' : ''}${word}`;
    }
  }
  return lines;
}

function pageContent(gold) {
  const commands = [];
  const text = (value, x, y, size = 11) => {
    commands.push(`BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm <${textHex(value)}> Tj ET`);
  };
  text(`CV DEMO ${gold.id} - ${gold.language.toUpperCase()}`, 40, 800, 18);
  text(
    gold.language === 'pl'
      ? 'DANE SYNTETYCZNE - fikcyjna osoba i organizacje'
      : 'SYNTHETIC DATA - fictional person and organizations',
    40,
    777,
    10
  );
  text(`Demo Candidate ${gold.id.slice(3)} | ${gold.id}@example.invalid`, 40, 754);
  const columns = gold.layout === 'two_columns';
  const table = gold.layout === 'table';
  const split = 6;
  let y = 715;
  gold.facts.forEach((fact, index) => {
    if (columns && index === split) {
      y = 715;
    }
    const x = columns && index >= split ? 310 : 40;
    const singleColumnLimit = table ? 60 : 80;
    const lines = wrap(fact.evidence, columns ? 39 : singleColumnLimit);
    if (table) {
      const bottom = y - (lines.length - 1) * 15 - 7;
      commands.push(
        `0.7 G 40 ${bottom} 515 ${lines.length * 15 + 9} re S 170 ${bottom} m 170 ${y + 17} l S 0 G`
      );
      const [section] = fact.field.split('.');
      const labels =
        gold.language === 'pl'
          ? {
              role: 'Stanowisko',
              seniority: 'Poziom',
              skills: 'Umiejętności',
              experience: 'Doświadczenie',
              education: 'Wykształcenie',
              languages: 'Języki',
            }
          : {
              role: 'Position',
              seniority: 'Level',
              skills: 'Skills',
              experience: 'Experience',
              education: 'Education',
              languages: 'Languages',
            };
      text(labels[section], 48, y);
    }
    for (const line of lines) {
      text(line, table ? 180 : x, y);
      y -= 15;
    }
    y -= table ? 9 : 7;
    if (y < 50) {
      throw new Error(`Treść wykracza poza stronę: ${gold.id}`);
    }
  });
  return commands.join('\n');
}

export function renderCvPdf(gold) {
  const mappings = characters.map(
    ([character, code]) => `<${hex(code, 2)}> <${hex(character.charCodeAt(0), 4)}>`
  );
  // Bloki bfchar mają najwyżej 100 wpisów zgodnie ze specyfikacją CMap.
  const blocks = [mappings.slice(0, 100), mappings.slice(100)]
    .map((block) => `${block.length} beginbfchar\n${block.join('\n')}\nendbfchar`)
    .join('\n');
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /DemoUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<00> <ff>\nendcodespacerange\n${blocks}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const stream = (value) =>
    `<< /Length ${Buffer.byteLength(value)} >>\nstream\n${value}\nendstream`;
  const differences = polishGlyphs.map(([, name]) => `/${name}`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${differences}] >> /ToUnicode 6 0 R >>`,
    stream(pageContent(gold)),
    stream(cmap),
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
