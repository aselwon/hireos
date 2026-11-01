#!/usr/bin/env node
import { chmod, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function changePassword(
  password,
  path = process.env.HIREOS_PASSWORD_FILE ||
    resolve(process.env.HIREOS_DATA_DIR || 'data', 'recruiter-password')
) {
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 1024 ||
    password.includes('\n')
  ) {
    throw new Error('Hasło musi mieć 12–1024 znaki i nie może zawierać nowej linii.');
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${password}\n`, { mode: 0o600, flag: 'wx' });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    await changePassword(
      Buffer.concat(chunks)
        .toString('utf8')
        .replace(/\r?\n$/, '')
    );
    process.stdout.write('Password changed. Restart the server to apply it.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
