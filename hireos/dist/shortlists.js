export function shortlistPanel(brief, applications, shortlists, escapeHtml) {
  if (!brief.client_id) {
    return '<section class="panel client-panel"><h2>Shortlista dla klienta</h2><p>Najpierw przypisz klienta w widoku briefu.</p></section>';
  }
  const candidates = applications
    .map((application) => {
      const eligible = application.consentVersion === 'v3' && !application.doNotContact;
      const id = escapeHtml(application.id);
      const attachment = eligible
        ? `<label><input type="checkbox" name="cvApplicationIds" value="${id}"> Dołącz CV: ${escapeHtml(application.name)}</label>`
        : '— brak zgody v3 lub zgłoszony sprzeciw';
      return `<p><label><input type="checkbox" name="applicationIds" value="${id}" ${eligible ? '' : 'disabled'}> ${escapeHtml(application.name)}</label> ${attachment}</p>`;
    })
    .join('');
  const links = shortlists
    .map((item) => {
      const action = item.revoked_at
        ? 'Odwołany'
        : `<button class="text-button" type="button" data-revoke-shortlist="${escapeHtml(item.id)}">Odwołaj link ${escapeHtml(item.id.slice(0, 8))}</button>`;
      return `<li>Link ${escapeHtml(item.id.slice(0, 8))} · Kandydaci: ${escapeHtml(item.candidate_count)} · Ważny do ${escapeHtml(new Date(item.expires_at).toLocaleString('pl-PL'))} · ${action}</li>`;
    })
    .join('');
  return `<section class="panel client-panel"><h2>Shortlista dla klienta</h2><p>Wybierz kandydatów i minimalny zakres danych. Każde otwarcie linku jest zapisywane. Przed przekazaniem danych poinformuj kandydata o zleceniodawcy.</p><form id="shortlist-form"><fieldset><legend>Kandydaci</legend>${candidates || '<p>Brak aplikacji do udostępnienia.</p>'}</fieldset><fieldset><legend>Udostępniane pola</legend><label><input type="checkbox" name="fields" value="name" checked> Imię i nazwisko</label> <label><input type="checkbox" name="fields" value="email"> E-mail</label></fieldset><label class="field">Ważność linku (dni, maksymalnie 30)<input name="days" type="number" min="1" max="30" value="7" required></label><button class="button" type="submit" ${applications.length ? '' : 'disabled'}>Utwórz link</button></form><p role="status" id="shortlist-message"></p><div id="shortlist-link"></div><h3>Utworzone linki</h3><ul>${links || '<li>Brak linków.</li>'}</ul></section>`;
}

export async function submitShortlist(event, briefId, request, refresh) {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const result = await request('/api/v1/shortlists', {
      method: 'POST',
      body: JSON.stringify({
        briefId,
        applicationIds: data.getAll('applicationIds'),
        cvApplicationIds: data.getAll('cvApplicationIds'),
        fields: data.getAll('fields'),
        expiresAt: new Date(Date.now() + Number(data.get('days')) * 86400000).toISOString(),
      }),
    });
    await refresh();
    const link = document.createElement('a');
    link.href = result.path;
    link.textContent = new URL(result.path, window.location.origin).href;
    document.querySelector('#shortlist-link').replaceChildren(link);
    document.querySelector('#shortlist-message').textContent =
      'Link gotowy. Skopiuj go i przekaż wyłącznie klientowi. Zapisz go teraz — lista poniżej nie wyświetla tokenów.';
  } catch (error) {
    document.querySelector('#shortlist-message').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
