import { createHash } from 'node:crypto';

const accountId = '2791466c5820cfd886aad95e0d3ef948';
export const defaultModel = '@cf/meta/llama-3.1-8b-instruct';
// Neurony na milion tokenów; zamknięta lista modeli dostępnych w darmowym planie.
export const modelRates = Object.freeze({
  [defaultModel]: Object.freeze({ input: 4119, output: 34868 }),
});

export function gatewayError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function createProvider(env, fetchImpl) {
  const name = env.MODEL_PROVIDER || 'fake';
  if (name === 'fake') {
    return {
      name,
      generate({ prompt, purpose }) {
        if (purpose === 'screening') {
          const { requirements } = JSON.parse(prompt.split('\nDane:\n')[1]);
          return {
            text: JSON.stringify({
              requirements: requirements.map(({ id }) => ({
                requirementId: id,
                status: 'missing',
                factIds: [],
              })),
            }),
          };
        }
        if (purpose === 'job-advertisement') {
          return {
            text: JSON.stringify({
              advertisement: `Poszukujemy: ${prompt.match(/Stanowisko: ([^\n]+)/)?.[1] || 'Specjalista IT'}. Dołącz do naszego zespołu i pracuj z nowoczesnymi technologiami.`,
              requirements: [
                { description: 'Doświadczenie w wymaganym stacku', priority: 'must', weight: 3 },
                { description: 'Umiejętność współpracy w zespole', priority: 'nice', weight: 1 },
              ],
            }),
          };
        }
        return {
          text: `Wynik demonstracyjny: ${createHash('sha256').update(prompt).digest('hex')}`,
        };
      },
    };
  }
  if (name !== 'cloudflare' || env.CF_ACCOUNT_ID !== accountId || !env.CF_AI_TOKEN) {
    throw new Error('Niepoprawna konfiguracja dostawcy modeli.');
  }
  if (env.NODE_ENV === 'test' || env.CI) {
    throw new Error('W testach i CI dozwolony jest tylko dostawca fake.');
  }
  return {
    name,
    async generate({ model, prompt, maxTokens }) {
      let response;
      let data;
      try {
        response = await fetchImpl(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
          {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(30000),
            headers: {
              Authorization: `Bearer ${env.CF_AI_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: prompt }],
              max_tokens: maxTokens,
              stream: false,
            }),
          }
        );
        data = await response.json();
      } catch {
        throw gatewayError(503, 'Dostawca modeli jest niedostępny.');
      }
      // Każdy błąd dostawcy zamyka budżet na dobę. Obejmuje również nowe
      // kody limitu, bez zależności od angielskiego tekstu odpowiedzi.
      if (!response.ok || data?.success !== true || typeof data.result?.response !== 'string') {
        throw gatewayError(503, 'Dostawca modeli jest niedostępny.');
      }
      return { text: data.result.response, usage: data.result.usage };
    },
  };
}
