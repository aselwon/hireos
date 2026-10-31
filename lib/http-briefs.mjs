export function createBriefRoutes(store, port, readInput) {
  function jsonMutation(req) {
    if (
      req.headers.origin &&
      ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)
    ) {
      throw Object.assign(new Error('Origin niedozwolony.'), { status: 403 });
    }
    if (!req.headers['content-type']?.startsWith('application/json')) {
      throw Object.assign(new Error('Wymagany JSON.'), { status: 415 });
    }
    return readInput(req);
  }

  async function create(req, send) {
    const input = await jsonMutation(req);
    return send(201, { brief: store.createBrief(input, req.headers['idempotency-key']) });
  }

  async function mutate(req, id, action, send) {
    if (req.method === 'POST' && action === 'generate') {
      await jsonMutation(req);
      return send(200, await store.generateBrief(id, req.headers['idempotency-key']));
    }
    if (req.method === 'PUT' && action === 'content') {
      const input = await jsonMutation(req);
      return send(200, { content: store.saveContent(id, input, req.headers['idempotency-key']) });
    }
    if (req.method === 'POST' && action === 'approve') {
      await jsonMutation(req);
      return send(200, { brief: store.approveBrief(id, req.headers['idempotency-key']) });
    }
    if (req.method === 'POST' && action === 'applications') {
      const input = await jsonMutation(req);
      return send(201, {
        application: store.createApplication(id, input, req.headers['idempotency-key']),
      });
    }
    return send(404, { error: 'Nieznana ścieżka API.' });
  }

  function route(req, url, send) {
    const match = url.pathname.match(
      /^\/api\/v1\/briefs\/([^/]+)(?:\/(generate|content|approve|applications))?$/
    );
    if (!match) {
      return send(404, { error: 'Nieznana ścieżka API.' });
    }
    const [, id, action] = match;
    if (req.method === 'GET' && !action) {
      const brief = store.getBrief(id);
      return send(
        brief ? 200 : 404,
        brief
          ? { brief, requirements: store.listRequirements(id) }
          : { error: 'Nie znaleziono rekrutacji.' }
      );
    }
    return mutate(req, id, action, send);
  }

  return { create, route };
}
