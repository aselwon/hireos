import { randomUUID } from 'node:crypto';

import { runIdempotentTransaction } from './idempotency.mjs';

const statuses = ['to_invoice', 'invoiced', 'paid'];
const validDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function feeGrosz(salaryGrosz, percentage) {
  const numerator = BigInt(salaryGrosz) * BigInt(percentage);
  return Number((numerator + 5000n) / 10000n);
}

export function createBilling(db) {
  return {
    listBillingEvents: () =>
      db
        .prepare(
          `SELECT e.*, c.name AS client_name, c.nip,
      b.title AS brief_title FROM billing_events e JOIN clients c ON c.id=e.client_id
      JOIN job_briefs b ON b.id=e.brief_id ORDER BY e.occurred_on DESC, e.id`
        )
        .all(),
    createBillingEvent(input, key) {
      if (
        !input ||
        !['advance', 'placement'].includes(input.type) ||
        !validDate(input.occurredOn)
      ) {
        throw new Error('Podaj rodzaj zdarzenia i prawidłową datę.');
      }
      return runIdempotentTransaction(db, 'billing:create', input, key, () => {
        const brief = db
          .prepare(
            `SELECT b.id, b.client_id, c.billing_model, c.fee_value,
          c.advance_grosz FROM job_briefs b JOIN clients c ON c.id=b.client_id WHERE b.id=?`
          )
          .get(input.briefId);
        if (!brief) {
          throw Object.assign(new Error('Rekrutacja nie ma przypisanego klienta.'), {
            status: 404,
          });
        }
        const salaryGrosz = input.type === 'placement' ? input.salaryGrosz : null;
        let amountGrosz;
        if (input.type === 'advance') {
          amountGrosz = brief.advance_grosz;
          if (amountGrosz <= 0) {
            throw new Error('Klient nie ma ustalonej zaliczki.');
          }
        } else {
          if (!Number.isSafeInteger(input.salaryGrosz) || input.salaryGrosz <= 0) {
            throw new Error('Wynagrodzenie musi być dodatnią kwotą w groszach.');
          }
          const fee =
            brief.billing_model === 'success_fee'
              ? feeGrosz(salaryGrosz, brief.fee_value)
              : brief.fee_value;
          const { amount_grosz: advance = 0 } =
            db
              .prepare(
                "SELECT amount_grosz FROM billing_events WHERE brief_id=? AND event_type='advance'"
              )
              .get(input.briefId) || {};
          amountGrosz = Math.max(0, fee - advance);
        }
        const id = randomUUID();
        db.prepare(
          `INSERT INTO billing_events (id, client_id, brief_id, event_type, occurred_on,
          salary_grosz, amount_grosz) VALUES (?,?,?,?,?,?,?)`
        ).run(
          id,
          brief.client_id,
          brief.id,
          input.type,
          input.occurredOn,
          salaryGrosz,
          amountGrosz
        );
        return db.prepare('SELECT * FROM billing_events WHERE id=?').get(id);
      });
    },
    updateBillingStatus(id, input, key, actor = 'recruiter-session') {
      if (!input || !statuses.includes(input.status)) {
        throw new Error('Nieprawidłowy status rozliczenia.');
      }
      return runIdempotentTransaction(db, 'billing:status', { id, input }, key, () => {
        const event = db.prepare('SELECT status FROM billing_events WHERE id=?').get(id);
        if (!event) {
          throw Object.assign(new Error('Nie znaleziono zdarzenia rozliczeniowego.'), {
            status: 404,
          });
        }
        db.prepare('UPDATE billing_events SET status=? WHERE id=?').run(input.status, id);
        db.prepare(
          `INSERT INTO audit_events (id, actor, action, entity_type, entity_id, detail_json, idempotency_key)
          VALUES (?,?,?,?,?,?,?)`
        ).run(
          randomUUID(),
          actor,
          'billing.status_changed',
          'billing_event',
          id,
          JSON.stringify({ from: event.status, to: input.status }),
          key
        );
        return { id, status: input.status };
      });
    },
    exportBillingCsv() {
      const rows = db
        .prepare(
          `SELECT e.occurred_on, e.event_type, c.name AS client_name, c.nip, c.contact,
        b.title AS brief_title, e.salary_grosz, e.amount_grosz, e.status FROM billing_events e
        JOIN clients c ON c.id=e.client_id JOIN job_briefs b ON b.id=e.brief_id
        ORDER BY e.occurred_on, e.id`
        )
        .all();
      const header = 'date,event,client,nip,contact,recruitment,salary_grosz,amount_grosz,status';
      return [header, ...rows.map((row) => Object.values(row).map(csvCell).join(','))].join('\r\n');
    },
  };
}
