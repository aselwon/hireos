import { randomUUID } from 'node:crypto';

const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});
function localTime(timestamp) {
  const parts = Object.fromEntries(
    calendar.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}
function reject(code) {
  throw Object.assign(new Error(`Claim zablokowany przez limity outreachu: ${code}.`), {
    status: 429,
    code,
  });
}
export function createOutreachLimits(db) {
  const readSettings = () =>
    JSON.parse(
      db.prepare('SELECT payload_json FROM outreach_settings WHERE id=1').get().payload_json
    );
  function saveSettings(input, key, principal, timestamp) {
    const before = readSettings();
    const integer = (value) => Number.isSafeInteger(value) && value >= 0;
    const fields = [
      'daily_global',
      'daily_per_recruitment',
      'max_followups',
      'min_interval_seconds',
      'start_hour',
      'end_hour',
    ];
    if (
      Object.keys(input).some((field) => !Object.hasOwn(before, field)) ||
      fields.some((field) => !integer(input[field])) ||
      input.start_hour > 23 ||
      input.end_hour > 24 ||
      input.start_hour === input.end_hour ||
      !input.recruitment_limits ||
      typeof input.recruitment_limits !== 'object' ||
      Array.isArray(input.recruitment_limits) ||
      Object.entries(input.recruitment_limits).some(
        ([id, limit]) =>
          !integer(limit) || !db.prepare('SELECT id FROM job_briefs WHERE id=?').get(id)
      )
    ) {
      throw Object.assign(
        new Error('Podaj pełną konfigurację limitów, poprawne godziny i istniejące rekrutacje.'),
        { status: 400 }
      );
    }
    db.prepare('UPDATE outreach_settings SET payload_json=? WHERE id=1').run(JSON.stringify(input));
    db.prepare(
      'INSERT INTO audit_events (id,actor,action,entity_type,entity_id,detail_json,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(
      randomUUID(),
      principal.id,
      'outreach_limits_updated',
      'outreach_settings',
      '1',
      JSON.stringify({ before, after: input }),
      key,
      timestamp
    );
    return { settings: input };
  }
  function reserve(row, timestamp) {
    const settings = readSettings();
    const limit = Object.hasOwn(settings.recruitment_limits, row.job_brief_id)
      ? settings.recruitment_limits[row.job_brief_id]
      : settings.daily_per_recruitment;
    if (!settings.daily_global || !limit) {
      reject('outreach_disabled');
    }
    const { day, hour } = localTime(timestamp);
    const inHours =
      settings.start_hour < settings.end_hour
        ? hour >= settings.start_hour && hour < settings.end_hour
        : hour >= settings.start_hour || hour < settings.end_hour;
    if (!inHours) {
      reject('outside_sending_hours');
    }
    const reservations = db
      .prepare(
        `SELECT r.*, t.application_id, a.job_brief_id FROM outreach_reservations r
      JOIN outreach_tasks t ON t.id=r.task_id JOIN applications a ON a.id=t.application_id`
      )
      .all();
    const own = reservations.find((item) => item.task_id === row.id);
    const previous = reservations.filter(
      (item) => item.application_id === row.application_id && item.task_id !== row.id
    );
    if (!own && previous.length > settings.max_followups) {
      reject('followup_limit');
    }
    if (
      previous.some(
        (item) =>
          Date.parse(timestamp) - Date.parse(item.reserved_at) <
          settings.min_interval_seconds * 1000
      )
    ) {
      reject('message_interval');
    }
    const initial = own ? own.is_initial : Number(previous.length === 0);
    if (initial && (!own || localTime(own.reserved_at).day !== day)) {
      const today = reservations.filter(
        (item) => item.is_initial && localTime(item.reserved_at).day === day
      );
      if (today.length >= settings.daily_global) {
        reject('daily_global_limit');
      }
      if (today.filter((item) => item.job_brief_id === row.job_brief_id).length >= limit) {
        reject('daily_recruitment_limit');
      }
    }
    db.prepare(
      `INSERT INTO outreach_reservations VALUES (?,?,?)
      ON CONFLICT(task_id) DO UPDATE SET reserved_at=excluded.reserved_at`
    ).run(row.id, timestamp, initial);
  }
  function recordResult(action, id, result, timestamp) {
    // Potwierdzenie może nadejść długo po claimie; wydłuża minimalny odstęp.
    if (action === 'result' && result !== 'verified_not_sent') {
      db.prepare('UPDATE outreach_reservations SET reserved_at=? WHERE task_id=?').run(
        timestamp,
        id
      );
    }
  }
  return { readSettings, saveSettings, reserve, recordResult };
}
