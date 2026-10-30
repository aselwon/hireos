import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { renderCvPdf } from './lib/cv-pdf.mjs';

const roles = [
  ['backend', 'Backend Developer', ['Java', 'Spring', 'PostgreSQL'], 'Kotlin'],
  ['frontend', 'Frontend Developer', ['TypeScript', 'React', 'CSS'], 'Vue'],
  ['mobile', 'Mobile Developer', ['Kotlin', 'Android', 'SQLite'], 'Swift'],
  ['devops', 'DevOps Engineer', ['Linux', 'Docker', 'Terraform'], 'Kubernetes'],
  ['data', 'Data Engineer', ['Python', 'SQL', 'Airflow'], 'Spark'],
  ['qa', 'QA Engineer', ['Playwright', 'TypeScript', 'Git'], 'Cypress'],
  ['security', 'Security Engineer', ['Python', 'Linux', 'OWASP'], 'Rust'],
];

function makeCase(index) {
  const [area, role, skills, learning] = roles[index % roles.length];
  const seniority = ['junior', 'mid', 'senior'][Math.floor(index / roles.length)];
  const language = index % 2 === 0 ? 'pl' : 'en';
  const polish = language === 'pl';
  const id = `cv-${String(index + 1).padStart(2, '0')}`;
  const layout = ['standard', 'two_columns', 'date_gaps', 'table'][index % 4];
  const facts = [];
  const add = (field, value, evidence, uncertain = false) => {
    facts.push({ field, value, evidence, uncertain });
  };
  add('role', role, `${polish ? 'Stanowisko' : 'Position'}: ${role}`);
  add('seniority', seniority, `${polish ? 'Poziom' : 'Level'}: ${seniority}`);
  for (const skill of skills) {
    add('skills', skill, `${polish ? 'Technologia' : 'Technology'}: ${skill}`);
  }
  add(
    'skills',
    learning,
    `${polish ? 'Dopiero uczę się' : 'Only starting to learn'}: ${learning}`,
    true
  );
  const periods =
    seniority === 'junior'
      ? [
          ['2024-01', '2024-06'],
          ['2025-09', null],
        ]
      : [
          ['2017-03', '2019-08'],
          [layout === 'date_gaps' ? '2022-11' : '2019-09', null],
        ];
  periods.forEach(([start, end], job) => {
    const prefix = `experience.${job}`;
    const company = `Demo ${area.toUpperCase()} Lab ${index + 1}-${job + 1}`;
    add(`${prefix}.company`, company, `${polish ? 'Firma' : 'Company'}: ${company}`);
    add(`${prefix}.role`, role, `${polish ? 'Rola' : 'Role'}: ${role}`);
    add(`${prefix}.start`, start, `${polish ? 'Od' : 'From'}: ${start}`);
    add(
      `${prefix}.end`,
      end,
      `${polish ? 'Do' : 'To'}: ${end ?? (polish ? 'obecnie' : 'present')}`
    );
    add(`${prefix}.technologies`, skills[job], `${polish ? 'Projekt' : 'Project'}: ${skills[job]}`);
  });
  add(
    'education.0.degree',
    polish ? 'Inżynier informatyki' : 'BSc Computer Science',
    polish ? 'Dyplom: Inżynier informatyki' : 'Degree: BSc Computer Science'
  );
  add(
    'education.0.institution',
    'Demo Technical Academy',
    `${polish ? 'Uczelnia' : 'Institution'}: Demo Technical Academy`
  );
  add('languages.0.name', 'English', polish ? 'Język: angielski' : 'Language: English');
  add(
    'languages.0.level',
    ['B1', 'B2', 'C1'][Math.floor(index / roles.length)],
    `CEFR: ${['B1', 'B2', 'C1'][Math.floor(index / roles.length)]}`
  );
  return { schemaVersion: 1, id, synthetic: true, language, area, layout, facts };
}

export async function generateCvEval(outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  for (let index = 0; index < 21; index += 1) {
    const gold = makeCase(index);
    const pdf = renderCvPdf(gold);
    await writeFile(resolve(outputDirectory, `${gold.id}.pdf`), pdf);
    await writeFile(
      resolve(outputDirectory, `${gold.id}.json`),
      `${JSON.stringify(gold, null, 2)}\n`
    );
  }
}

// Importowanie generatora w testach nie zapisuje plików w repozytorium.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv[2] ?? new URL('../eval/cv/', import.meta.url).pathname;
  await generateCvEval(output);
  process.stdout.write('Wygenerowano 21 syntetycznych par PDF + gold.\n');
}
