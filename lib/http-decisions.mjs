export function createDecisionRoute(store, validateMutation, readInput) {
  return async (req, pathname, send, principal) => {
    const match = pathname.match(/^\/api\/v1\/applications\/([^/]+)\/decision$/);
    if (!match) {
      return null;
    }
    validateMutation(req);
    const decision = store.decide(
      match[1],
      await readInput(req),
      req.headers['idempotency-key'],
      principal?.id || 'recruiter-session'
    );
    return { response: send(200, { decision }) };
  };
}
