export function createOutreachPanel(state, request, escapeHtml, alertBox, render) {
  function outreachPage() {
    const result = state.outreachLive;
    const status = result?.outreach_live
      ? `<p role="status">Kontakt z kandydatami odblokowany. Test: ${escapeHtml(result.control_test.date)}, raport: ${escapeHtml(result.control_test.report_id)}, wykonał(a): ${escapeHtml(result.control_test.who)}.</p>`
      : '<p>Kontakt z kandydatami jest zablokowany. Dostępne są wyłącznie zadania kontrolne dla odbiorców z listy testowej.</p>';
    const form = result?.outreach_live
      ? ''
      : `<p>Po zaliczonym teście zapisz wynik. Zapis odblokuje kontakt z prawdziwymi kandydatami i trafi do dziennika audytu.</p><form id="outreach-live-form"><label class="field">Data zaliczonego testu<input type="date" name="date" required max="${new Date().toISOString().slice(0, 10)}"></label><label class="field">Identyfikator raportu<input name="report_id" required maxlength="256"></label><label class="field">Kto wykonał test<input name="who" required maxlength="256"></label><label class="field">Hasło rekrutera<input type="password" name="password" autocomplete="current-password" required maxlength="1024"></label><button class="button primary" type="submit">Zapisz zaliczony test i odblokuj kontakt</button></form>`;
    return `<section class="page-heading"><h1>Test kontrolny outreachu</h1></section><section class="panel">${status}${state.error ? alertBox(state.error) : ''}${form}</section>`;
  }
  async function submitOutreachLive(form) {
    const data = new FormData(form);
    const button = form.querySelector('button');
    button.disabled = true;
    button.textContent = 'Zapisywanie…';
    try {
      state.outreachLive = await request('/api/v1/outreach-live', {
        method: 'POST',
        body: JSON.stringify({
          outreach_live: true,
          password: data.get('password'),
          control_test: {
            date: data.get('date'),
            report_id: data.get('report_id'),
            who: data.get('who'),
          },
        }),
      });
      state.error = '';
    } catch (error) {
      state.error = error.message;
    }
    form.elements.password.value = '';
    render();
  }
  return { outreachPage, submitOutreachLive };
}
