function validateMutation(req, port) {
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

export async function handleOutreachSettings(store, req, send, principal, port, readInput) {
  if (req.method === 'GET') {
    return send(200, { settings: store.outreach.readSettings() });
  }
  if (req.method !== 'POST') {
    return send(405, { error: 'Metoda niedozwolona.' });
  }
  validateMutation(req, port);
  return send(
    200,
    store.outreach.mutate(
      'settings',
      null,
      await readInput(req),
      req.headers['idempotency-key'],
      principal
    )
  );
}

export async function handleOutreachLive(store, sessions, req, send, principal, port, readInput) {
  if (principal?.kind !== 'session' || req.headers.authorization) {
    return send(403, { error: 'Wymagana sesja rekrutera bez klucza API.' });
  }
  if (req.method === 'GET') {
    return send(200, store.outreach.readLive());
  }
  if (req.method !== 'POST') {
    return send(405, { error: 'Metoda niedozwolona.' });
  }
  validateMutation(req, port);
  const { password, ...input } = await readInput(req);
  const status = sessions.verifyPassword(password);
  if (status !== 200) {
    return send(status, {
      error: 'Niepoprawne hasło lub limit prób. Spróbuj ponownie za 15 minut.',
    });
  }
  return send(
    200,
    store.outreach.mutate('live', null, input, req.headers['idempotency-key'], principal)
  );
}
