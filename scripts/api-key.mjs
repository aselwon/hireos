import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openKeys } from '../lib/auth.mjs';

export function runKeyCommand(args, path, stdout = process.stdout, stderr = process.stderr) {
  const [command, id, scope] = args;
  let keys;
  try {
    if (!['create', 'revoke'].includes(command) || !id || (command === 'revoke' && scope)) {
      throw new Error('Użycie: api-key.mjs create <id> <admin|worker:outreach> lub revoke <id>.');
    }
    keys = openKeys(path);
    if (command === 'create') {
      const token = keys.create(id, scope);
      if (token) {
        stdout.write(`${token}\n`);
      } else {
        stderr.write('Identyfikator już istnieje; klucz nie zostanie ponownie ujawniony.\n');
      }
    } else {
      keys.revoke(id);
      stderr.write('Klucz odwołany (o ile istniał).\n');
    }
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  } finally {
    keys?.close();
  }

  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runKeyCommand(
    process.argv.slice(2),
    process.env.HIREOS_DB ||
      resolve(fileURLToPath(new URL('../data/', import.meta.url)), 'hireos.sqlite')
  );
}
