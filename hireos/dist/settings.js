export function createSettingsUi(state, request, render, escapeHtml, alertBox) {
  function settingsPage() {
    const { settings } = state;
    if (!settings) {
      return alertBox('Ładowanie ustawień…', 'loading');
    }
    const keys = settings.keys
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.scope)}</td><td>${item.revoked_at ? 'Odwołany' : 'Aktywny'}</td><td>${item.revoked_at ? '' : revokeKeyButton(item.id)}</td></tr>`
      )
      .join('');
    const limit = settings.modelUsage;
    return `<section class="page-heading"><div><h1>Ustawienia</h1><p>Klucze dostępu, zasady kontaktu i konfiguracja danych.</p></div></section>${state.error ? alertBox(state.error) : ''}${secretNotice()}<section class="panel"><div class="panel-head"><div><h2>Klucze API</h2><p>Sekrety nie są przechowywane ani wyświetlane w postaci jawnej.</p></div></div><form id="api-key-form"><label class="field">Identyfikator<input name="id" required maxlength="128" pattern="[a-zA-Z0-9_-]+"></label><label class="field">Zakres<select name="scope"><option value="worker:outreach">worker:outreach</option><option value="admin">admin</option></select></label><button class="button" type="submit">Utwórz klucz</button></form><div class="table-scroll"><table><thead><tr><th>Identyfikator</th><th>Zakres</th><th>Stan</th><th></th></tr></thead><tbody>${keys || '<tr><td colspan="4">Brak kluczy API.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-head"><div><h2>Limity outreachu</h2><p>Wartość 0 wyłącza outreach. Zmiana obowiązuje od razu w API.</p></div></div><form id="settings-form"><label class="field">Kontakty dziennie — globalnie<input name="daily_global" type="number" min="0" required value="${settings.outreach.daily_global}"></label><label class="field">Kontakty dziennie — na rekrutację<input name="daily_per_recruitment" type="number" min="0" required value="${settings.outreach.daily_per_recruitment}"></label><label class="field">Maksymalna liczba follow-upów<input name="max_followups" type="number" min="0" required value="${settings.outreach.max_followups}"></label><label class="field">Minimalny odstęp (sekundy)<input name="min_interval_seconds" type="number" min="0" required value="${settings.outreach.min_interval_seconds}"></label><label class="field">Początek okna wysyłki (godzina)<input name="start_hour" type="number" min="0" max="23" required value="${settings.outreach.start_hour}"></label><label class="field">Koniec okna wysyłki (godzina)<input name="end_hour" type="number" min="1" max="24" required value="${settings.outreach.end_hour}"></label><button class="button" type="submit">Zapisz limity</button></form></section><section class="panel settings-facts"><h2>Dane i zużycie modeli</h2><p>Retencja dokumentów: <b>${settings.privacy.days} dni</b> · Klauzula: <b>${escapeHtml(settings.privacy.version)}</b></p><p>Workers AI dziś (${escapeHtml(limit.day)} UTC): <b>${limit.used.toLocaleString('pl-PL')} / ${limit.limit.toLocaleString('pl-PL')} neuronów</b></p></section>`;
  }
  function secretNotice() {
    if (!state.createdSecret) {
      return '';
    }
    return `<section class="notice success" role="status"><b>Skopiuj nowy klucz teraz.</b><p>Pełny sekret nie będzie ponownie wyświetlony.</p><code>${escapeHtml(state.createdSecret)}</code><button class="button secondary" data-action="dismiss-secret">Ukryj sekret</button></section>`;
  }
  function revokeKeyButton(id) {
    return `<button class="text-button" data-action="revoke-key" data-id="${escapeHtml(id)}">Odwołaj</button>`;
  }
  async function submitApiKey(event) {
    event.preventDefault();
    try {
      const data = new FormData(event.target);
      const result = await request('/api/v1/api-keys', {
        method: 'POST',
        body: JSON.stringify({ id: data.get('id'), scope: data.get('scope') }),
      });
      state.createdSecret = result.secret || '';
      state.settings = await request('/api/v1/settings');
      state.error = result.secret
        ? ''
        : 'Klucz o tym identyfikatorze już istnieje; sekret był wyświetlony wyłącznie przy pierwszym utworzeniu.';
    } catch (error) {
      state.error = error.message;
    }
    render();
  }
  async function submitSettings(event) {
    event.preventDefault();
    const data = new FormData(event.target);
    const outreach = { ...state.settings.outreach };
    for (const field of [
      'daily_global',
      'daily_per_recruitment',
      'max_followups',
      'min_interval_seconds',
      'start_hour',
      'end_hour',
    ]) {
      outreach[field] = Number(data.get(field));
    }
    try {
      await request('/api/v1/outreach-settings', {
        method: 'POST',
        body: JSON.stringify(outreach),
      });
      state.settings = await request('/api/v1/settings');
      state.error = '';
    } catch (error) {
      state.error = error.message;
    }
    render();
  }
  return { settingsPage, submitApiKey, submitSettings };
}
