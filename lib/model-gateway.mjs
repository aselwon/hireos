import { createHash, randomUUID } from 'node:crypto';

import { createProvider, defaultModel, gatewayError, modelRates } from './model-providers.mjs';

function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function request(input, key) {
  const { model = defaultModel, prompt, maxTokens = 256, purpose = 'generation' } = input;
  if (!Object.hasOwn(modelRates, model)) {
    throw gatewayError(400, 'Model spoza listy dozwolonych.');
  }
  if (
    typeof key !== 'string' ||
    !key.trim() ||
    key.length > 128 ||
    typeof prompt !== 'string' ||
    !prompt.trim() ||
    Buffer.byteLength(prompt) > 12000 ||
    !Number.isInteger(maxTokens) ||
    maxTokens < 1 ||
    maxTokens > 2048 ||
    typeof purpose !== 'string' ||
    !purpose.trim() ||
    purpose.length > 80
  ) {
    throw gatewayError(400, 'Niepoprawne żądanie generowania lub Idempotency-Key.');
  }
  // Bajt UTF-8 na token plus zapas na szablon rozmowy. Nie zwalniamy
  // rezerwacji po odpowiedzi: szacunek stanowi konserwatywny koszt budżetowy.
  const inputTokens = Buffer.byteLength(prompt) + 256;
  const rates = modelRates[model];
  const neurons = Math.ceil((inputTokens * rates.input + maxTokens * rates.output) / 1000000);
  const payload = { model, prompt, maxTokens, purpose };
  return {
    ...payload,
    inputTokens,
    neurons,
    fingerprint: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  };
}

export function createModelGateway(
  db,
  {
    env = process.env,
    now = () => new Date(),
    fetchImpl = globalThis.fetch,
    provider: suppliedProvider,
  } = {}
) {
  const provider = suppliedProvider || createProvider(env, fetchImpl);
  if (!['fake', 'cloudflare'].includes(provider.name)) {
    throw new Error('Niepoprawna konfiguracja dostawcy modeli.');
  }
  const cap = Number(env.MODEL_DAILY_NEURON_CAP ?? 9000);
  if (!Number.isInteger(cap) || cap < 1 || cap > 9000) {
    throw new Error('MODEL_DAILY_NEURON_CAP musi być liczbą całkowitą od 1 do 9000.');
  }
  const block = (day) =>
    db.prepare('INSERT OR IGNORE INTO model_gateway_blocks VALUES (?, ?)').run(provider.name, day);
  return {
    async generate(input, key) {
      const call = request(input, key);
      const at = now().toISOString();
      const day = at.slice(0, 10);
      const cached = transaction(db, () => {
        const previous = db.prepare('SELECT * FROM model_calls WHERE idempotency_key=?').get(key);
        if (previous) {
          if (previous.fingerprint !== call.fingerprint || previous.provider !== provider.name) {
            throw gatewayError(409, 'Klucz idempotencji został użyty dla innego żądania.');
          }
          if (previous.status === 'completed') {
            return JSON.parse(previous.response_json);
          }
          throw gatewayError(
            503,
            'Wywołanie jest w toku lub zakończyło się błędem; nie zostanie powtórzone.'
          );
        }
        const blocked = db
          .prepare('SELECT 1 FROM model_gateway_blocks WHERE provider=? AND day=?')
          .get(provider.name, day);
        const { used } = db
          .prepare(
            `SELECT COALESCE(SUM(estimated_neurons), 0) AS used FROM model_calls
          WHERE provider=? AND (substr(created_at, 1, 10)=? OR substr(finished_at, 1, 10)=? OR status='reserved')`
          )
          .get(provider.name, day, day);
        if (blocked || used + call.neurons > cap) {
          throw gatewayError(503, 'Dzienny limit modeli wyczerpany. Ponów po 00:00 UTC.');
        }
        db.prepare(
          `INSERT INTO model_calls
          (id, provider, model, purpose, estimated_neurons, status, idempotency_key, created_at, fingerprint, input_tokens, output_tokens)
          VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?, ?)`
        ).run(
          randomUUID(),
          provider.name,
          call.model,
          call.purpose,
          call.neurons,
          key,
          at,
          call.fingerprint,
          call.inputTokens,
          call.maxTokens
        );
        return null;
      });
      if (cached) {
        return cached;
      }
      let result;
      try {
        result = await provider.generate(call);
      } catch {
        transaction(db, () => {
          block(day);
          block(now().toISOString().slice(0, 10));
          db.prepare(
            "UPDATE model_calls SET status='limit_exceeded', finished_at=? WHERE idempotency_key=?"
          ).run(now().toISOString(), key);
        });
        throw gatewayError(503, 'Bramka modeli zablokowana do resetu doby UTC.');
      }
      const { usage } = result;
      const validUsage =
        Number.isInteger(usage?.prompt_tokens) &&
        usage.prompt_tokens >= 0 &&
        Number.isInteger(usage?.completion_tokens) &&
        usage.completion_tokens >= 0;
      const response = {
        text: result.text,
        model: call.model,
        provider: provider.name,
        estimatedNeurons: call.neurons,
      };
      transaction(db, () => {
        if (
          validUsage &&
          (usage.prompt_tokens > call.inputTokens || usage.completion_tokens > call.maxTokens)
        ) {
          block(day);
          block(now().toISOString().slice(0, 10));
        }
        db.prepare(
          `UPDATE model_calls SET status='completed', response_json=?, finished_at=?, input_tokens=?, output_tokens=?, tokens_estimated=? WHERE idempotency_key=?`
        ).run(
          JSON.stringify(response),
          now().toISOString(),
          validUsage ? usage.prompt_tokens : call.inputTokens,
          validUsage ? usage.completion_tokens : call.maxTokens,
          validUsage ? 0 : 1,
          key
        );
      });
      return response;
    },
  };
}
