const app = document.querySelector('#app');
const state = {
  briefs: [],
  brief: null,
  applications: [],
  view: 'jobs',
  application: null,
  loading: true,
  error: '',
};
const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
const key = () => crypto.randomUUID();
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
  const pageTitle =
    state.view === 'jobs' ? 'Rekrutacje' : escapeHtml(state.brief?.title || 'Aplikacje');
  return `<div class="mvp-shell"><aside class="mvp-sidebar"><a class="mvp-brand" href="#jobs">HireOS</a><nav aria-label="Nawigacja główna"><button data-action="jobs" aria-current="${state.view === 'jobs' ? 'page' : 'false'}">Rekrutacje</button>${applicationsNav}</nav><p class="mvp-caption">Panel rekrutera · MVP IT</p></aside><main class="mvp-main"><header class="mvp-top"><span>HireOS / ${pageTitle}</span><span class="tag gray">Lokalny panel</span></header><div class="mvp-content">${content}<footer class="footer">Dane kandydatów są poufne · decyzję podejmuje rekruter</footer></div></main></div>`;
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
  return `<section class="page-heading"><div><div class="eyebrow">${status}</div><h1>${escapeHtml(b.title)}</h1><p>${escapeHtml((b.stack || []).join(' · '))} · ${escapeHtml(b.seniority)}</p></div><button class="button secondary" data-action="applications">Aplikacje (${state.applications.length})</button></section>${error}<section class="panel"><div class="panel-head"><div><h2>Ogłoszenie i macierz wymagań</h2><p>Przejrzyj treść przed zatwierdzeniem.</p></div></div><form id="content-form"><label class="field">Treść ogłoszenia<textarea name="advertisement" required rows="8">${escapeHtml(b.advertisement || '')}</textarea></label><div class="panel-head"><h3>Wymagania</h3>${addButton}</div><div id="requirements">${requirements}</div>${actions}</form></section>${applicationList()}`;
}
function requirementRow(r) {
  const options = [1, 2, 3]
    .map((n) => `<option ${r.weight === n ? 'selected' : ''}>${n}</option>`)
    .join('');
  const must = r.priority === 'must' ? 'selected' : '';
  const nice = r.priority === 'nice' ? 'selected' : '';
  return `<div class="mvp-requirement"><label class="field">Wymaganie<input name="description" value="${escapeHtml(r.description)}" required maxlength="500"></label><label class="field">Typ<select name="priority"><option value="must" ${must}>Must-have</option><option value="nice" ${nice}>Nice-to-have</option></select></label><label class="field">Waga<select name="weight">${options}</select></label></div>`;
}
function applicationList() {
  const rows = state.applications.map(applicationRow).join('');
  const content = rows
    ? `<div class="table-scroll"><table><thead><tr><th>Kandydat</th><th>Etap</th><th>CV / profil</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<div class="empty">Brak aplikacji dla tej rekrutacji.</div>';
  return `<section class="panel"><div class="panel-head"><div><h2>Aplikacje · ${state.applications.length}</h2><p>Status CV i niepewne fakty są widoczne przed oceną.</p></div></div>${content}</section>`;
}
function applicationStatus(application) {
  if (application.cvStatus === 'needs_manual_review') {
    return '<span class="tag amber">Wymaga ręcznego przeglądu</span>';
  }
  if (application.uncertain) {
    return '<span class="tag amber">Niepewne fakty</span>';
  }
  const ready = application.profileStatus === 'completed';
  const className = ready ? '' : 'gray';
  const label = ready ? 'Profil gotowy' : escapeHtml(application.cvStatus || 'Oczekuje');
  return `<span class="tag ${className}">${label}</span>`;
}
function applicationRow(application) {
  const status = applicationStatus(application);
  return `<tr><td><b>${escapeHtml(application.name)}</b><small>${escapeHtml(application.email)}</small></td><td>${escapeHtml(application.stage)}</td><td>${status}</td><td><button class="text-button" data-action="report" data-id="${escapeHtml(application.id)}">Otwórz raport →</button></td></tr>`;
}
function reportPage() {
  const a = state.application;
  const { report } = a;
  const requirements = report?.requirements || [];
  const quoteItems = requirements.map(requirementEvidence).join('');
  const error = state.error ? alertBox(state.error) : '';
  const manualReview =
    a.cvStatus === 'needs_manual_review'
      ? alertBox('CV nie zawiera warstwy tekstowej. Wymagany ręczny przegląd.', 'warning')
      : '';
  const uncertain = a.uncertain
    ? alertBox('Profil zawiera niepewne fakty. Sprawdź cytaty przed decyzją.', 'warning')
    : '';
  const reportAction = report
    ? ''
    : '<button class="button" data-action="screening">Utwórz raport</button>';
  const reportBody = report ? quoteItems : emptyReport(a);
  return `<section class="page-heading"><div><div class="eyebrow">RAPORT SCREENINGOWY</div><h1>${escapeHtml(a.name)}</h1><p>${escapeHtml(a.email)} · ${escapeHtml(state.brief.title)}</p></div><button class="button secondary" data-action="applications">Wróć do aplikacji</button></section>${error}${manualReview}${uncertain}<section class="panel"><div class="panel-head"><div><h2>Wymaganie → dowody</h2><p>Brak dowodu nie oznacza braku kompetencji.</p></div>${reportAction}</div>${reportBody}</section>${decisionPanel()}`;
}
function emptyReport(application) {
  const message = application.profile
    ? 'Raport nie został jeszcze utworzony.'
    : 'Profil CV nie jest jeszcze dostępny.';
  return `<div class="empty">${message}</div>`;
}
function decisionPanel() {
  return '<section class="panel"><div class="panel-head"><div><h2>Decyzja rekrutera</h2><p>Każda decyzja wymaga uzasadnienia.</p></div></div><form id="decision-form"><label class="field">Uzasadnienie<textarea name="reason" required minlength="1" maxlength="2000" rows="3"></textarea></label><div class="actions"><button class="button" name="outcome" value="approved">Zatwierdź kandydata</button><button class="button danger" name="outcome" value="rejected">Odrzuć kandydata</button></div></form></section>';
}
function requirementEvidence(item) {
  const labels = { met: 'Spełnione', missing: 'Brak dowodu', uncertain: 'Niepewne' };
  const status = labels[item.status] || item.status;
  const statusClass = item.status === 'met' ? '' : 'amber';
  const evidence = (item.evidence || []).map(evidenceQuote).join('');
  const details = evidence
    ? `<ul class="evidence">${evidence}</ul>`
    : '<p>Brak cytatu potwierdzającego wymaganie.</p>';
  return `<article class="mvp-evidence"><div class="panel-head"><h3>${escapeHtml(item.description)}</h3><span class="tag ${statusClass}">${status}</span></div>${details}</article>`;
}
function evidenceQuote(evidence) {
  const uncertain = evidence.uncertain
    ? '<span class="tag amber">Cytat niejednoznaczny</span>'
    : '';
  return `<li><blockquote>${escapeHtml(evidence.quote)}</blockquote>${uncertain}</li>`;
}
function render() {
  let content = jobsPage();
  if (state.loading) {
    content = alertBox('Ładowanie danych…', 'loading');
  } else if (state.view === 'brief') {
    content = briefForm();
  } else if (state.view === 'applications') {
    content = applicationsPage();
  } else if (state.view === 'report' && state.application) {
    content = reportPage();
  }
  app.innerHTML = shell(content);
  const heading = app.querySelector('h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
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
  const body = `<section class="panel"><h2>Nowy brief IT</h2><form id="brief-form"><label class="field">Stanowisko<input name="title" required maxlength="160"></label><fieldset><legend>Stack (wybierz min. jedną technologię)</legend><div class="chip-list">${stackOptions}</div></fieldset><label class="field">Seniority<select name="seniority"><option>junior</option><option>mid</option><option>senior</option><option>lead</option></select></label><div class="mvp-requirement"><label class="field">Widełki od<input name="min" type="number" min="0" required></label><label class="field">Do<input name="max" type="number" min="0" required></label><label class="field">Waluta<select name="currency"><option>PLN</option><option>EUR</option><option>USD</option></select></label></div><div class="mvp-requirement"><label class="field">Kwota<select name="basis"><option value="gross">Brutto</option><option value="net">Netto</option></select></label><label class="field">Umowa<select name="contractType"><option value="b2b">B2B</option><option value="employment">UoP</option></select></label><label class="field">Lokalizacja<input name="location" placeholder="Warszawa"></label></div><label><input name="remote" type="checkbox"> Praca zdalna</label><button class="button" type="submit">Utwórz brief</button></form><button class="text-button" data-action="jobs">Anuluj</button></section>`;
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
      case 'jobs':
        state.view = 'jobs';
        state.brief = null;
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
            '<div class="mvp-requirement"><label class="field">Wymaganie<input name="description" required maxlength="500"></label><label class="field">Typ<select name="priority"><option value="must">Must-have</option><option value="nice">Nice-to-have</option></select></label><label class="field">Waga<select name="weight"><option>1</option><option>2</option><option>3</option></select></label></div>'
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
document.addEventListener('submit', async (event) => {
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
    const reason = new FormData(event.target).get('reason');
    try {
      await request(`/api/v1/applications/${state.application.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ outcome: submitter.value, reason }),
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
await loadBriefs();
