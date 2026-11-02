import { clientSelect, clientsPage, leadsPage, submitClientForm } from './clients.js';
import { applicationRow, emptyReport, requirementEvidence } from './report.js';
import { shortlistPanel, submitShortlist } from './shortlists.js';
const app = document.querySelector('#app');
const state = {
  briefs: [],
  outreachLive: null,
  clients: [],
  shortlists: [],
  leads: [],
  brief: null,
  applications: [],
  view: 'jobs',
  application: null,
  dataRequests: [],
  loading: true,
  error: '',
};
const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
const key = () => crypto.randomUUID();
const seniorityLabels = { junior: 'początkujący', mid: 'średni', senior: 'starszy', lead: 'lider' };
const stageLabels = {
  applied: 'Aplikacja',
  screening: 'Weryfikacja',
  interview: 'Rozmowa',
  offer: 'Oferta',
  hired: 'Zatrudniony',
  rejected: 'Odrzucony',
};
const cvStatusLabels = {
  pending: 'Oczekuje',
  queued: 'W kolejce',
  processing: 'Przetwarzanie',
  completed: 'Gotowe',
  failed: 'Nie udało się przetworzyć',
};
async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.method && options.method !== 'GET' ? { 'Idempotency-Key': key() } : {}),
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Nie udało się wykonać operacji.');
  }
  return result;
}
async function loadBriefs() {
  state.loading = true;
  state.error = '';
  render();
  try {
    state.briefs = (await request('/api/v1/briefs')).briefs;
    state.clients = (await request('/api/v1/clients')).clients;
    state.leads = (await request('/api/v1/leads')).leads;
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}
async function openBrief(id) {
  state.loading = true;
  state.error = '';
  render();
  try {
    const result = await request(`/api/v1/briefs/${encodeURIComponent(id)}`);
    state.brief = { ...result.brief, requirements: result.requirements };
    state.applications = (
      await request(`/api/v1/briefs/${encodeURIComponent(id)}/applications`)
    ).applications;
    state.shortlists = (
      await request(`/api/v1/shortlists?briefId=${encodeURIComponent(id)}`)
    ).shortlists;
    state.view = 'brief';
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}
function shell(content) {
  const navCurrent = ['applications', 'report'].includes(state.view) ? 'page' : 'false';
  const applicationsNav = state.brief
    ? `<button data-action="applications" aria-current="${navCurrent}">Aplikacje <span class="count">${state.applications.length}</span></button>`
    : '';
  const pageTitles = {
    outreach: 'Test kontrolny outreachu',
    jobs: 'Rekrutacje',
    clients: 'Klienci',
    leads: 'Zapytania',
  };
  const pageTitle = pageTitles[state.view] || escapeHtml(state.brief?.title || 'Aplikacje');
  return `<div class="mvp-shell"><aside class="mvp-sidebar"><a class="mvp-brand" href="#jobs">HireOS</a><nav aria-label="Nawigacja główna"><button data-action="jobs" aria-current="${state.view === 'jobs' ? 'page' : 'false'}">Rekrutacje</button>${applicationsNav}<button data-action="leads" aria-current="${state.view === 'leads' ? 'page' : 'false'}">Zapytania firm</button><button data-action="clients" aria-current="${state.view === 'clients' ? 'page' : 'false'}">Klienci</button><button data-action="outreach">Test kontrolny outreachu</button></nav><p class="mvp-caption">Panel rekrutera · MVP IT</p></aside><main class="mvp-main"><header class="mvp-top"><span>HireOS / ${pageTitle}</span><span class="tag gray">Panel rekrutera</span></header><div class="mvp-content">${content}<footer class="footer">Dane kandydatów są poufne · decyzję podejmuje rekruter</footer></div></main></div>`;
}
function alertBox(message, kind = 'error') {
  return `<div class="notice ${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${escapeHtml(message)}</div>`;
}
function jobsPage() {
  const empty =
    '<section class="panel empty-state"><h2>Brak rekrutacji</h2><p>Utwórz brief IT, aby rozpocząć proces.</p><button class="button" data-action="new">Utwórz brief</button></section>';
  const message = state.error ? alertBox(state.error) : '';
  const cards = state.briefs
    .map(
      (brief) =>
        `<article class="panel mvp-job"><div><span class="tag ${brief.status === 'approved' ? '' : 'gray'}">${brief.status === 'approved' ? 'Zatwierdzona' : 'Szkic'}</span><h2>${escapeHtml(brief.title)}</h2><p>${escapeHtml((brief.stack || []).join(' · '))} · ${brief.remote ? 'Zdalnie' : escapeHtml(brief.location)}</p></div><button class="button secondary" data-action="open" data-id="${escapeHtml(brief.id)}">Otwórz brief</button></article>`
    )
    .join('');
  const list = state.loading ? alertBox('Ładowanie rekrutacji…', 'loading') : cards || empty;
  return `<section class="page-heading"><div><div class="eyebrow">PANEL REKRUTERA</div><h1>Rekrutacje</h1><p>Przygotuj brief, zatwierdź macierz i przejrzyj aplikacje.</p></div><button class="button" data-action="new">Nowy brief</button></section>${message}${list}`;
}
function briefForm() {
  const b = state.brief;
  const requirements = (b.requirements || []).map(requirementRow).join('');
  const status = b.status === 'approved' ? 'ZATWIERDZONA REKRUTACJA' : 'SZKIC REKRUTACJI';
  const error = state.error ? alertBox(state.error) : '';
  const editing = b.status !== 'approved';
  const actions = editing
    ? '<div class="actions"><button class="button secondary" type="button" data-action="generate">Wygeneruj ogłoszenie i macierz</button><button class="button" type="submit">Zapisz zmiany</button><button class="button" type="button" data-action="approve">Zatwierdź macierz</button></div>'
    : '<span class="tag">Macierz zatwierdzona</span>';
  const addButton = editing
    ? '<button class="button secondary small" type="button" data-action="add-requirement">Dodaj wymaganie</button>'
    : '';
  return `<section class="page-heading"><div><div class="eyebrow">${status}</div><h1>${escapeHtml(b.title)}</h1><p>${escapeHtml((b.stack || []).join(' · '))} · ${seniorityLabels[b.seniority] || escapeHtml(b.seniority)}</p></div><button class="button secondary" data-action="applications">Aplikacje (${state.applications.length})</button></section>${error}<section class="panel client-panel"><h2>Klient rekrutacji</h2><form id="assignment-form">${clientSelect(state.clients, b.client_id, escapeHtml)}<button class="button secondary" type="submit">Zapisz przypisanie</button><p role="status" id="assignment-message"></p></form></section><section class="panel"><div class="panel-head"><div><h2>Ogłoszenie i macierz wymagań</h2><p>Przejrzyj treść przed zatwierdzeniem.</p></div></div><form id="content-form"><label class="field">Treść ogłoszenia<textarea name="advertisement" required rows="8">${escapeHtml(b.advertisement || '')}</textarea></label><div class="panel-head"><h3>Wymagania</h3>${addButton}</div><div id="requirements">${requirements}</div>${actions}</form></section>${applicationList()}`;
}
function requirementRow(r) {
  const options = [1, 2, 3]
    .map((n) => `<option ${r.weight === n ? 'selected' : ''}>${n}</option>`)
    .join('');
  const must = r.priority === 'must' ? 'selected' : '';
  const nice = r.priority === 'nice' ? 'selected' : '';
  return `<div class="mvp-requirement"><label class="field">Wymaganie<input name="description" value="${escapeHtml(r.description)}" required maxlength="500"></label><label class="field">Typ<select name="priority"><option value="must" ${must}>Wymagane</option><option value="nice" ${nice}>Dodatkowe</option></select></label><label class="field">Waga<select name="weight">${options}</select></label></div>`;
}
function applicationList() {
  const rows = state.applications
    .map((item) => applicationRow(item, escapeHtml, stageLabels, cvStatusLabels))
    .join('');
  const content = rows
    ? `<div class="table-scroll"><table><thead><tr><th>Kandydat</th><th>Etap</th><th>CV / profil</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<div class="empty">Brak aplikacji dla tej rekrutacji.</div>';
  return `<section class="panel"><div class="panel-head"><div><h2>Aplikacje · ${state.applications.length}</h2><p>Status CV i niepewne fakty są widoczne przed oceną.</p></div></div>${content}</section>`;
}
function reportPage() {
  const a = state.application;
  const { report } = a;
  const requirements = report?.requirements || [];
  const quoteItems = requirements.map((item) => requirementEvidence(item, escapeHtml)).join('');
  const error = state.error ? alertBox(state.error) : '';
  const manualReview =
    a.cvStatus === 'needs_manual_review'
      ? alertBox('CV nie zawiera warstwy tekstowej. Wymagany ręczny przegląd.', 'warning')
      : '';
  const uncertain = a.uncertain
    ? alertBox('Profil zawiera niepewne fakty. Sprawdź cytaty przed decyzją.', 'warning')
    : '';
  const reportAction =
    report || a.processingStatus === 'queued'
      ? ''
      : '<button class="button" data-action="screening">Utwórz raport oceny</button>';
  const reportBody = report ? quoteItems : emptyReport(a);
  return `<section class="page-heading"><div><div class="eyebrow">RAPORT OCENY</div><h1>${escapeHtml(a.name)}</h1><p>${escapeHtml(a.email)} · ${escapeHtml(state.brief.title)}</p></div><button class="button secondary" data-action="applications">Wróć do aplikacji</button></section>${error}${manualReview}${uncertain}<section class="panel"><div class="panel-head"><div><h2>Wymaganie → dowody</h2><p>Brak dowodu nie oznacza braku kompetencji.</p></div>${reportAction}</div>${reportBody}</section>${decisionPanel()}${dataRightsPanel()}`;
}
function dataRightsPanel() {
  const labels = { access: 'Dostęp', erase: 'Usunięcie', object: 'Sprzeciw' };
  const history = state.dataRequests
    .map(
      (item) =>
        `<li>${labels[item.kind]} · Wpłynęło: ${escapeHtml(item.received_at.slice(0, 10))} · Termin: ${escapeHtml(item.due_at.slice(0, 10))} · Wykonano: ${escapeHtml(item.completed_at.slice(0, 10))}</li>`
    )
    .join('');
  const register = history ? `<ul>${history}</ul>` : '<p>Brak zarejestrowanych żądań.</p>';
  return `<section class="panel"><div class="panel-head"><div><h2>Prawa osoby</h2><p>${state.application.doNotContact ? 'Kontakt zablokowany po sprzeciwie.' : 'Obsługa zweryfikowanego żądania kandydata. Termin realizacji: 30 dni od wpłynięcia.'}</p></div></div><form id="data-rights-form"><label class="field">Data wpłynięcia<input type="date" name="receivedAt" required max="${new Date().toISOString().slice(0, 10)}" value="${new Date().toISOString().slice(0, 10)}"></label><p>Eksport JSON zawiera dane oraz CV zakodowane jako base64. Usunięcie trwale usuwa dane, CV, raporty i zadania outreach.</p><div class="actions"><button class="button secondary" name="kind" value="access">Pobierz dane i CV</button><button class="button secondary" name="kind" value="object">Zablokuj kontakt</button><label><input type="checkbox" name="confirmErase"> Potwierdzam trwałe usunięcie danych i CV. Tej operacji nie można cofnąć.</label><button class="button danger" name="kind" value="erase">Trwale usuń dane</button></div></form><h3>Rejestr żądań</h3>${register}</section>`;
}
async function submitDataRights(event) {
  const kind = event.submitter.value;
  if (kind === 'erase' && !new FormData(event.target).has('confirmErase')) {
    state.error = 'Aby usunąć dane, zaznacz potwierdzenie trwałego usunięcia.';
    render();
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await request(`/api/v1/applications/${state.application.id}/data-rights`, {
      method: 'POST',
      body: JSON.stringify({ kind, receivedAt: new FormData(event.target).get('receivedAt') }),
    });
    if (result.archive) {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result.archive, null, 2)], { type: 'application/json' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'dane-kandydata.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    await openBrief(state.brief.id);
    if (kind === 'erase') {
      state.application = null;
      state.view = 'applications';
    } else {
      state.application = state.applications.find((item) => item.id === state.application.id);
      state.dataRequests = (
        await request(`/api/v1/applications/${state.application.id}/data-rights`)
      ).requests;
      state.view = 'report';
    }
    render();
  } catch (error) {
    state.error = error.message;
    render();
  } finally {
    button.disabled = false;
  }
}
function decisionPanel() {
  return '<section class="panel"><div class="panel-head"><div><h2>Decyzja rekrutera</h2><p>Każda decyzja wymaga uzasadnienia.</p></div></div><form id="decision-form"><label class="field">Czy zgadzasz się z raportem AI?<select name="agreedWithAi" required><option value="">Wybierz ocenę</option><option value="true">Tak</option><option value="false">Nie</option></select></label><label class="field">Uzasadnienie<textarea name="reason" required minlength="1" maxlength="2000" rows="3"></textarea></label><div class="actions"><button class="button" name="outcome" value="approved">Zatwierdź kandydata</button><button class="button danger" name="outcome" value="rejected">Odrzuć kandydata</button></div></form></section>';
}
function render() {
  let content = jobsPage();
  if (state.loading) {
    content = alertBox('Ładowanie danych…', 'loading');
  } else if (state.view === 'outreach') {
    content = outreachPage();
  } else if (state.view === 'clients') {
    content = (state.error ? alertBox(state.error) : '') + clientsPage(state.clients, escapeHtml);
  } else if (state.view === 'leads') {
    content = leadsPage(state.leads, state.error, escapeHtml, alertBox);
  } else if (state.view === 'brief') {
    content = briefForm();
  } else if (state.view === 'applications') {
    content = applicationsPage();
  } else if (state.view === 'report' && state.application) {
    content = reportPage();
  }
  if (['brief', 'applications'].includes(state.view) && !state.loading) {
    content += shortlistPanel(state.brief, state.applications, state.shortlists, escapeHtml);
  }
  app.innerHTML = shell(content);
  const heading = app.querySelector('h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}
async function submitLeadForm(form) {
  const values = new FormData(form);
  const converting = form.matches('.lead-convert-form');
  const body = converting
    ? {
        nip: values.get('nip'),
        billingModel: values.get('billingModel'),
        feeValue: Math.round(Number(values.get('fee')) * 100),
        advanceGrosz: Math.round(Number(values.get('advance')) * 100),
      }
    : { status: values.get('status'), notes: values.get('notes') };
  try {
    await request(
      `/api/v1/leads/${encodeURIComponent(form.dataset.id)}${converting ? '/convert' : ''}`,
      { method: 'POST', body: JSON.stringify(body) }
    );
    await loadBriefs();
  } catch (error) {
    state.error = error.message;
    render();
  }
}
function applicationsPage() {
  const error = state.error ? alertBox(state.error) : '';
  return `<section class="page-heading"><div><h1>Aplikacje</h1><p>${escapeHtml(state.brief?.title)}</p></div></section>${error}${applicationList()}`;
}
function newBriefDialog() {
  const technologies = [
    'JavaScript',
    'TypeScript',
    'Node.js',
    'Python',
    'Java',
    'Go',
    'React',
    'SQL',
    'Docker',
    'AWS',
  ];
  const stackOptions = technologies
    .map(
      (technology) =>
        `<label><input type="checkbox" name="stack" value="${technology}"> ${technology}</label>`
    )
    .join('');
  const body = `<section class="panel"><h2>Nowy brief IT</h2><form id="brief-form"><label class="field">Stanowisko<input name="title" required maxlength="160"></label><fieldset><legend>Technologie (wybierz min. jedną)</legend><div class="chip-list">${stackOptions}</div></fieldset><label class="field">Poziom<select name="seniority"><option value="junior">Początkujący</option><option value="mid">Średni</option><option value="senior">Starszy</option><option value="lead">Lider</option></select></label><div class="mvp-requirement"><label class="field">Widełki od<input name="min" type="number" min="0" required></label><label class="field">Do<input name="max" type="number" min="0" required></label><label class="field">Waluta<select name="currency"><option>PLN</option><option>EUR</option><option>USD</option></select></label></div><div class="mvp-requirement"><label class="field">Kwota<select name="basis"><option value="gross">Brutto</option><option value="net">Netto</option></select></label><label class="field">Umowa<select name="contractType"><option value="b2b">B2B</option><option value="employment">Umowa o pracę</option></select></label><label class="field">Lokalizacja<input name="location" placeholder="Warszawa"></label></div><label><input name="remote" type="checkbox"> Praca zdalna</label><button class="button" type="submit">Utwórz brief</button></form><button class="text-button" data-action="jobs">Anuluj</button></section>`;
  app.innerHTML = shell(body);
  document.querySelector('#brief-form [name=title]').focus();
}
function formContent() {
  const form = document.querySelector('#content-form');
  const data = new FormData(form);
  const descriptions = [...document.querySelectorAll('#requirements .mvp-requirement')];
  return {
    advertisement: data.get('advertisement'),
    requirements: descriptions.map((row) => ({
      description: row.querySelector('[name=description]').value,
      priority: row.querySelector('[name=priority]').value,
      weight: Number(row.querySelector('[name=weight]').value),
    })),
  };
}
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) {
    return;
  }
  try {
    switch (button.dataset.action) {
      case 'outreach':
        state.outreachLive = await request('/api/v1/outreach-live');
        state.error = '';
        state.view = 'outreach';
        render();
        break;
      case 'jobs':
        state.view = 'jobs';
        state.brief = null;
        await loadBriefs();
        break;
      case 'clients':
        state.view = 'clients';
        await loadBriefs();
        break;
      case 'leads':
        state.view = 'leads';
        await loadBriefs();
        break;
      case 'new':
        newBriefDialog();
        break;
      case 'open':
        await openBrief(button.dataset.id);
        break;
      case 'applications':
        state.view = 'applications';
        render();
        break;
      case 'report':
        state.application = state.applications.find((item) => item.id === button.dataset.id);
        if (state.application.report) {
          state.application.report = await request(
            `/api/v1/applications/${state.application.id}/screening`
          );
        }
        state.dataRequests = (
          await request(`/api/v1/applications/${state.application.id}/data-rights`)
        ).requests;
        state.view = 'report';
        state.error = '';
        render();
        break;
      case 'generate': {
        const generated = await request(`/api/v1/briefs/${state.brief.id}/generate`, {
          method: 'POST',
          body: '{}',
        });
        await request(`/api/v1/briefs/${state.brief.id}/content`, {
          method: 'PUT',
          body: JSON.stringify(generated),
        });
        await openBrief(state.brief.id);
        break;
      }
      case 'approve':
        await request(`/api/v1/briefs/${state.brief.id}/content`, {
          method: 'PUT',
          body: JSON.stringify(formContent()),
        });
        await request(`/api/v1/briefs/${state.brief.id}/approve`, { method: 'POST', body: '{}' });
        await openBrief(state.brief.id);
        break;
      case 'add-requirement':
        document
          .querySelector('#requirements')
          .insertAdjacentHTML(
            'beforeend',
            '<div class="mvp-requirement"><label class="field">Wymaganie<input name="description" required maxlength="500"></label><label class="field">Typ<select name="priority"><option value="must">Wymagane</option><option value="nice">Dodatkowe</option></select></label><label class="field">Waga<select name="weight"><option>1</option><option>2</option><option>3</option></select></label></div>'
          );
        document.querySelector('#requirements .mvp-requirement:last-child input').focus();
        break;
      case 'screening':
        await request(`/api/v1/applications/${state.application.id}/screening`, {
          method: 'POST',
          body: '{}',
        });
        await openBrief(state.brief.id);
        state.application = state.applications.find((item) => item.id === state.application.id);
        state.view = 'report';
        render();
        break;
    }
  } catch (error) {
    state.error = error.message;
    render();
  }
});
async function submitAssignment(event) {
  event.preventDefault();
  const form = event.target;
  const briefId = state.brief.id;
  const clientId = new FormData(form).get('clientId') || null;
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    await request(`/api/v1/briefs/${briefId}/client`, {
      method: 'PUT',
      body: JSON.stringify({ clientId }),
    });
    if (state.brief?.id === briefId) {
      state.brief.client_id = clientId;
      render();
    }
    document.querySelector('#assignment-message').textContent = 'Przypisanie zapisane.';
  } catch (error) {
    form.querySelector('#assignment-message').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-revoke-shortlist]');
  if (!button) {
    return;
  }
  button.disabled = true;
  try {
    await request(`/api/v1/shortlists/${button.dataset.revokeShortlist}/revoke`, {
      method: 'POST',
      body: '{}',
    });
    await openBrief(state.brief.id);
  } catch (error) {
    document.querySelector('#shortlist-message').textContent = error.message;
    button.disabled = false;
  }
});
document.addEventListener('submit', async (event) => {
  if (event.target.id === 'shortlist-form') {
    await submitShortlist(event, state.brief.id, request, () => openBrief(state.brief.id));
    return;
  }
  if (event.target.id === 'outreach-live-form') {
    event.preventDefault();
    await submitOutreachLive(event.target);
    return;
  }
  if (event.target.id === 'data-rights-form') {
    event.preventDefault();
    await submitDataRights(event);
    return;
  }
  if (event.target.id === 'client-form') {
    await submitClientForm(event, request, loadBriefs);
  }
  if (event.target.id === 'assignment-form') {
    await submitAssignment(event);
  }
  if (event.target.matches('.lead-form, .lead-convert-form')) {
    event.preventDefault();
    await submitLeadForm(event.target);
  }
  if (event.target.id === 'brief-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    try {
      const result = await request('/api/v1/briefs', {
        method: 'POST',
        body: JSON.stringify({
          title: data.get('title'),
          stack: data.getAll('stack'),
          seniority: data.get('seniority'),
          salary: {
            min: Number(data.get('min')),
            max: Number(data.get('max')),
            currency: data.get('currency'),
            basis: data.get('basis'),
            contractType: data.get('contractType'),
          },
          location: data.get('location'),
          remote: data.has('remote'),
        }),
      });
      await loadBriefs();
      await openBrief(result.brief.id);
    } catch (error) {
      state.error = error.message;
      render();
    }
  }
  if (event.target.id === 'content-form') {
    event.preventDefault();
    try {
      await request(`/api/v1/briefs/${state.brief.id}/content`, {
        method: 'PUT',
        body: JSON.stringify(formContent()),
      });
      await openBrief(state.brief.id);
    } catch (error) {
      state.error = error.message;
      render();
    }
  }
  if (event.target.id === 'decision-form') {
    event.preventDefault();
    const { submitter } = event;
    const form = new FormData(event.target);
    const reason = form.get('reason');
    try {
      await request(`/api/v1/applications/${state.application.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          outcome: submitter.value,
          reason,
          agreedWithAi: form.get('agreedWithAi') === 'true',
        }),
      });
      state.error = 'Decyzja została zapisana.';
      await openBrief(state.brief.id);
      state.application = state.applications.find((item) => item.id === state.application.id);
      state.view = 'report';
      render();
    } catch (error) {
      state.error = error.message;
      render();
    }
  }
});
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
await loadBriefs();
