import assert from 'node:assert/strict';
import test from 'node:test';

import { clientSelect, clientsPage } from '../hireos/dist/clients.js';

const escapeHtml = (value) => String(value).replaceAll('<', '&lt;').replaceAll('"', '&quot;');

test('client panel renders empty state, terms, escaped contact and current assignment', () => {
  assert.match(clientsPage([], escapeHtml), /Brak klientów/);
  const clients = [
    {
      id: 'synthetic',
      name: '<Firma testowa>',
      nip: '0000000000',
      contact: '<script>test</script>',
      billing_model: 'success_fee',
      fee_value: 1250,
      advance_grosz: 50000,
    },
  ];
  const page = clientsPage(clients, escapeHtml);
  assert.match(page, /Success fee: 12,50%/);
  assert.match(page, /Zaliczka: 500,00 PLN/);
  assert.ok(!page.includes('<script>'));
  assert.match(page, /&lt;Firma testowa>/);
  assert.match(clientSelect(clients, 'synthetic', escapeHtml), /value="synthetic" selected/);
  assert.match(clientSelect(clients, null, escapeHtml), /value="">Bez klienta/);
  assert.match(
    clientsPage([{ ...clients[0], billing_model: 'fixed_fee', fee_value: 9900 }], escapeHtml),
    /Stała opłata: 99,00 PLN/
  );
});
