import { randomUUID } from 'node:crypto';

export function createOutreachLive(db, allowlist) {
  const addresses = new Set(
    allowlist
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const read = () =>
    JSON.parse(
      db.prepare('SELECT payload_json FROM outreach_live_settings WHERE id=1').get().payload_json
    );
  function allowed(row) {
    if (read().outreach_live) {
      return true;
    }
    const recipient = db
      .prepare('SELECT email FROM applications WHERE id=?')
      .get(row.application_id);
    return (
      JSON.parse(row.payload_json).control_recipient === true &&
      addresses.has(recipient?.email.trim().toLowerCase())
    );
  }
  function requireAllowed(row) {
    if (!allowed(row)) {
      throw Object.assign(
        new Error('Wymagany zaliczony test kontrolny przed kontaktem z kandydatem.'),
        { status: 403, code: 'control_test_required' }
      );
    }
  }
  function save(input, key, principal, timestamp) {
    const validText = (value) =>
      typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
    const date = input.control_test?.date;
    if (
      input.outreach_live !== true ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date ||
      date > timestamp.slice(0, 10) ||
      !validText(input.control_test?.report_id) ||
      !validText(input.control_test?.who)
    ) {
      throw Object.assign(
        new Error(
          'Podaj datę zaliczonego testu (nie przyszłą), identyfikator raportu i osobę wykonującą test.'
        ),
        { status: 400 }
      );
    }
    const before = read();
    const after = {
      outreach_live: true,
      control_test: {
        date,
        report_id: input.control_test.report_id.trim(),
        who: input.control_test.who.trim(),
      },
    };
    db.prepare('UPDATE outreach_live_settings SET payload_json=? WHERE id=1').run(
      JSON.stringify(after)
    );
    db.prepare(
      'INSERT INTO audit_events (id,actor,action,entity_type,entity_id,detail_json,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(
      randomUUID(),
      principal.id,
      'outreach_live_enabled',
      'outreach_live_settings',
      '1',
      JSON.stringify({ before, after }),
      key,
      timestamp
    );
    return after;
  }
  return { read, allowed, requireAllowed, save };
}
