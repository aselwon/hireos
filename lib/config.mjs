import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { retentionDays } from './retention.mjs';

const accountId = '2791466c5820cfd886aad95e0d3ef948';

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  let password;
  try {
    password = readFileSync(
      env.HIREOS_PASSWORD_FILE || resolve(env.HIREOS_DATA_DIR || 'data', 'recruiter-password'),
      'utf8'
    ).trimEnd();
  } catch {
    password = env.HIREOS_RECRUITER_PASSWORD;
  }
  if (production) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
      throw new Error('Konfiguracja produkcyjna: ustaw hasło rekrutera o długości 12–1024 znaków.');
    }
    if (env.HIREOS_SECURE_COOKIE !== '1') {
      throw new Error('Konfiguracja produkcyjna: HIREOS_SECURE_COOKIE musi mieć wartość 1.');
    }
    try {
      retentionDays(env.RETENTION_DAYS);
    } catch {
      throw new Error(
        'Konfiguracja produkcyjna: RETENTION_DAYS musi być dodatnią liczbą całkowitą.'
      );
    }
    const cap = Number(env.MODEL_DAILY_NEURON_CAP ?? 9000);
    if (!Number.isInteger(cap) || cap < 1 || cap > 9000) {
      throw new Error(
        'Konfiguracja produkcyjna: MODEL_DAILY_NEURON_CAP musi być liczbą całkowitą od 1 do 9000.'
      );
    }
    if (
      env.MODEL_PROVIDER !== 'cloudflare' ||
      env.CF_ACCOUNT_ID !== accountId ||
      !env.CF_AI_TOKEN
    ) {
      throw new Error(
        'Konfiguracja produkcyjna: wymagany jest poprawny dostawca modeli Cloudflare.'
      );
    }
  }
  return {
    production,
    password,
    secureCookie: production || env.HIREOS_SECURE_COOKIE === '1',
  };
}
