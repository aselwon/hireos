export async function loadOutreachPanel(state, request, render) {
  state.outreachLive = await request('/api/v1/outreach-live');
  state.outreachSettings = (await request('/api/v1/outreach-settings')).settings;
  const taskList = await request('/api/v1/tasks');
  state.outreachTasks = taskList.tasks;
  state.outreachUsage = taskList.usage;
  state.outreachCandidates = (
    await Promise.all(
      state.briefs.map(async (brief) => {
        const { applications } = await request(
          `/api/v1/briefs/${encodeURIComponent(brief.id)}/applications`
        );
        return applications.map((application) => ({
          ...application,
          jobBriefId: brief.id,
          briefTitle: brief.title,
        }));
      })
    )
  ).flat();
  state.error = '';
  state.view = 'outreach';
  render();
}

export async function handleOutreachAction(button, state, request, render) {
  if (button.dataset.action === 'cancel-task') {
    await request(`/api/v1/tasks/${encodeURIComponent(button.dataset.id)}/cancel`, {
      method: 'POST',
      body: '{}',
    });
    state.outreachTasks = (await request('/api/v1/tasks')).tasks;
  } else {
    const input =
      button.dataset.paused !== undefined
        ? { paused: button.dataset.paused === 'true' }
        : { human_takeover: button.dataset.takeover === 'true' };
    await request(
      `/api/v1/applications/${encodeURIComponent(button.dataset.id)}/outreach-control`,
      { method: 'POST', body: JSON.stringify(input) }
    );
    const candidate = state.outreachCandidates.find((item) => item.id === button.dataset.id);
    Object.assign(candidate, input);
  }
  render();
}

export function outreachPage(state, escapeHtml, alertBox) {
  const result = state.outreachLive;
  const status = result?.outreach_live
    ? `<p role="status">Kontakt z kandydatami odblokowany. Test: ${escapeHtml(result.control_test.date)}, raport: ${escapeHtml(result.control_test.report_id)}, wykonał(a): ${escapeHtml(result.control_test.who)}.</p>`
    : '<p>Kontakt z kandydatami jest zablokowany. Dostępne są wyłącznie zadania kontrolne dla odbiorców z listy testowej.</p>';
  const candidates = state.outreachCandidates.filter((item) => !item.doNotContact);
  const candidateOptions = candidates
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.briefTitle)}</option>`
    )
    .join('');
  const testRequired = result?.outreach_live ? '' : 'required';
  const submitDisabled = candidates.length ? '' : 'disabled';
  const form = `<section class="panel"><h2>Nowe zadanie</h2><form id="outreach-task-form"><label class="field">Kandydat<select name="applicationId" required>${candidateOptions}</select></label><label class="field">Kontekst<textarea name="context" required maxlength="8000"></textarea></label><label class="field">Zasady kontaktu<textarea name="contactRules" required maxlength="4000"></textarea></label><label><input type="checkbox" name="approved" required> Zasady kontaktu zostały zatwierdzone</label><label><input type="checkbox" name="controlRecipient" ${testRequired}> Odbiorca testowy</label><button class="button primary" ${submitDisabled}>Utwórz zadanie</button></form></section>`;
  const rows = state.outreachTasks.map((task) => outreachTaskRow(task, state, escapeHtml)).join('');
  const limits = state.outreachSettings
    ? `<p>Wykorzystano dziś: ${state.outreachUsage || 0} / ${state.outreachSettings.daily_global} zadań globalnie · limit na rekrutację: ${state.outreachSettings.daily_per_recruitment}.</p>`
    : '';
  return `<section class="page-heading"><h1>Zadania outreach</h1></section><section class="panel">${status}${limits}${state.error ? alertBox(state.error) : ''}</section>${form}<section class="panel"><h2>Lista zadań</h2><div class="table-scroll"><table><thead><tr><th>Kandydat</th><th>Stan</th><th>Akcje</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Brak zadań.</td></tr>'}</tbody></table></div></section>`;
}

function outreachTaskRow(task, state, escapeHtml) {
  const candidate = state.outreachCandidates.find((item) => item.id === task.application_id);
  const actions =
    !candidate || candidate.doNotContact
      ? 'Kontakt zablokowany'
      : contactActions(task, candidate, escapeHtml);
  return `<tr><td>${escapeHtml(candidate?.name || 'Kandydat')}</td><td>${escapeHtml(task.status)}</td><td>${actions}</td></tr>`;
}

function contactActions(task, candidate, escapeHtml) {
  const pauseLabel = candidate.paused ? 'Wznów' : 'Pauza';
  const pauseValue = candidate.paused ? 'false' : 'true';
  const takeoverLabel = candidate.humanTakeover ? 'Oddaj wykonawcy' : 'Przejmij rozmowę';
  const takeoverValue = candidate.humanTakeover ? 'false' : 'true';
  const cancel = ['queued', 'unresolved'].includes(task.status)
    ? `<button class="button danger" data-action="cancel-task" data-id="${escapeHtml(task.task_id)}">Anuluj</button>`
    : '';
  const id = escapeHtml(candidate.id);
  return `<button class="button secondary" data-action="candidate-control" data-id="${id}" data-paused="${pauseValue}">${pauseLabel}</button><button class="button secondary" data-action="candidate-control" data-id="${id}" data-takeover="${takeoverValue}">${takeoverLabel}</button>${cancel}`;
}

export async function submitOutreachTask(event, state, request, render) {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const candidate = state.outreachCandidates.find((item) => item.id === data.get('applicationId'));
  try {
    const result = await request('/api/v1/tasks', {
      method: 'POST',
      body: JSON.stringify({
        application_id: candidate.id,
        job_brief_id: candidate.jobBriefId,
        context: data.get('context'),
        contact_rules: data.get('contactRules'),
        contact_rules_approved: data.has('approved'),
        control_recipient: data.has('controlRecipient'),
      }),
    });
    state.outreachTasks.push(result.task);
    state.error = '';
  } catch (error) {
    state.error = error.message;
  }
  render();
}

export async function submitOutreachLive(form, state, request, render) {
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
