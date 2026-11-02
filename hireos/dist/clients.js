const money = (value) =>
  (value / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function clientSelect(clients, selected, escapeHtml) {
  const options = clients
    .map(
      (client) =>
        `<option value="${escapeHtml(client.id)}" ${client.id === selected ? 'selected' : ''}>${escapeHtml(client.name)} · NIP ${escapeHtml(client.nip)}</option>`
    )
    .join('');
  return `<label class="field">Zleceniodawca<select name="clientId"><option value="">Bez klienta</option>${options}</select></label>`;
}

export function clientsPage(clients, escapeHtml) {
  const list = clients
    .map((client) => {
      const fee =
        client.billing_model === 'success_fee'
          ? `Success fee: ${money(client.fee_value)}%`
          : `Stała opłata: ${money(client.fee_value)} PLN`;
      return `<article class="panel client-panel"><h2>${escapeHtml(client.name)}</h2><p>NIP: ${escapeHtml(client.nip)}</p><p>${escapeHtml(client.contact)}</p><p>${fee} · Zaliczka: ${money(client.advance_grosz)} PLN</p></article>`;
    })
    .join('');
  return `<section class="page-heading"><div><h1>Klienci firmowi</h1><p>Zleceniodawcy rekrutacji i warunki współpracy.</p></div></section>${list || '<section class="panel client-panel"><h2>Brak klientów</h2><p>Dodaj firmę, aby przypisać jej rekrutację w widoku briefu.</p></section>'}<section class="panel client-panel"><h2>Dodaj klienta</h2><p>Warunki wpisuje właściciel. Kwoty w PLN; procent dotyczy uzgodnionej z klientem podstawy rozliczenia.</p><form id="client-form"><label class="field">Nazwa firmy<input name="name" required maxlength="160"></label><label class="field">NIP (10 cyfr)<input name="nip" required pattern="[0-9]{10}" maxlength="10" inputmode="numeric"></label><label class="field">Kontakt<textarea name="contact" required maxlength="1000" rows="3"></textarea></label><label class="field">Model rozliczenia<select name="billingModel"><option value="success_fee">Success fee (%)</option><option value="fixed_fee">Stała opłata (PLN)</option></select></label><label class="field">Wartość: procent dla success fee lub kwota PLN dla stałej opłaty<input name="fee" type="number" min="0" step="0.01" required></label><label class="field">Zaliczka (PLN)<input name="advance" type="number" min="0" step="0.01" required></label><button class="button" type="submit">Dodaj klienta</button><p role="status" id="client-message"></p></form></section>`;
}

export async function submitClientForm(event, request, refresh) {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    await request('/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify({
        name: data.get('name'),
        nip: data.get('nip'),
        contact: data.get('contact'),
        billingModel: data.get('billingModel'),
        feeValue: Math.round(Number(data.get('fee')) * 100),
        advanceGrosz: Math.round(Number(data.get('advance')) * 100),
      }),
    });
    await refresh();
  } catch (error) {
    form.querySelector('#client-message').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

export function leadsPage(leads, error, escapeHtml, alertBox) {
  const labels = {
    new: 'Nowy',
    contacted: 'W kontakcie',
    offer: 'Oferta',
    won: 'Wygrany',
    lost: 'Przegrany',
  };
  const cards = leads
    .filter((lead) => !lead.client_id)
    .map(
      (lead) =>
        `<article class="panel client-panel"><h2>${escapeHtml(lead.company)}</h2><p>${escapeHtml(lead.contact)} · ${escapeHtml(lead.position)}</p><p>Otrzymano: ${escapeHtml(lead.created_at)}</p><form class="lead-form" data-id="${escapeHtml(lead.id)}"><label class="field">Status<select name="status">${Object.entries(
          labels
        )
          .map(
            ([value, label]) =>
              `<option value="${value}" ${lead.status === value ? 'selected' : ''}>${label}</option>`
          )
          .join(
            ''
          )}</select></label><label class="field">Notatki<textarea name="notes" maxlength="5000">${escapeHtml(lead.notes)}</textarea></label><button class="button secondary" type="submit">Zapisz</button></form><form class="lead-convert-form" data-id="${escapeHtml(lead.id)}"><h3>Konwertuj w klienta</h3><label class="field">NIP<input name="nip" required pattern="[0-9]{10}" maxlength="10" inputmode="numeric"></label><label class="field">Model rozliczenia<select name="billingModel"><option value="success_fee">Success fee (%)</option><option value="fixed_fee">Stała opłata (PLN)</option></select></label><label class="field">Wartość (procent lub PLN)<input name="fee" type="number" min="0" step="0.01" required></label><label class="field">Zaliczka (PLN)<input name="advance" type="number" min="0" step="0.01" required></label><button class="button" type="submit">Utwórz klienta</button></form></article>`
    )
    .join('');
  return `<section class="page-heading"><div><h1>Zapytania od firm</h1><p>Leady z formularza, statusy i konwersja do klientów.</p></div></section>${error ? alertBox(error) : ''}${cards || '<section class="panel client-panel"><h2>Brak aktywnych zapytań</h2></section>'}`;
}
