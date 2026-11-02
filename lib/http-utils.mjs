export function sendError(send, error) {
  return send(error instanceof SyntaxError ? 400 : error.status || 400, {
    error: error instanceof SyntaxError ? 'Niepoprawny JSON.' : error.message,
    ...(error.code && [403, 429].includes(error.status) ? { code: error.code } : {}),
  });
}
export function validateMutation(req, port) {
  if (
    req.headers.origin &&
    ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)
  ) {
    throw Object.assign(new Error('Origin niedozwolony.'), { status: 403 });
  }
  if (!req.headers['content-type']?.startsWith('application/json')) {
    throw Object.assign(new Error('Wymagany JSON.'), { status: 415 });
  }
}
export function mutateDemo(production, store, action, input, key, send) {
  return production
    ? send(404, { error: 'Nie znaleziono.' })
    : send(200, store.mutate(action, input, key));
}
