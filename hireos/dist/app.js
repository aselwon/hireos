import { seed } from './seed.js';
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  briefcase:
    '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12a24 24 0 0 0 18 0M12 11v4"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 3v4M18 5h4"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 17h6"/>',
  plug: '<path d="M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0ZM12 17v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  palette:
    '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="9" r="1"/><circle cx="14" cy="7" r="1"/><circle cx="17" cy="12" r="1"/><path d="M7 16h6"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[n] || icons.grid}</svg>`;
const escapeHtml = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const labels = {
  new: 'Nowa aplikacja',
  review: 'Przegląd materiałów',
  interview: 'Rozmowa',
  decision: 'Decyzja człowieka',
};
const nav = [
  ['overview', 'grid', 'Przegląd'],
  ['jobs', 'briefcase', 'Rekrutacje'],
  ['candidates', 'users', 'Kandydaci'],
  ['agents', 'spark', 'Centrum agentów'],
  ['interviews', 'calendar', 'Rozmowy'],
  ['integrations', 'plug', 'Integracje'],
  ['audit', 'clock', 'Dziennik działań'],
  ['design', 'palette', 'Design system'],
];
let state = structuredClone(seed),
  mode = 'browser',
  view = 'overview',
  search = '',
  filter = 'all',
  busy = false;
const app = document.querySelector('#app'),
  modal = document.querySelector('#modal');
try {
  const response = await fetch('/api/state');
  if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
    state = await response.json();
    mode = 'server';
  } else {
    const saved = localStorage.getItem('hireos-demo-v1');
    if (saved) {
      state = JSON.parse(saved);
    }
  }
} catch {
  try {
    const saved = localStorage.getItem('hireos-demo-v1');
    if (saved) {
      state = JSON.parse(saved);
    }
  } catch {
    state = structuredClone(seed);
  }
}
function toast(text) {
  const element = document.querySelector('#toast');
  element.textContent = text;
  element.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => element.classList.remove('show'), 5000);
}
function event(action, detail) {
  state.events.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor: 'Operator demo',
    action,
    detail,
  });
}
function pauseAction(input) {
  state.paused = input.paused;
  event(
    input.paused ? 'Wstrzymano automatyzację' : 'Wznowiono automatyzację',
    'Tryb przeglądarkowy.'
  );
}
function jobAction(input) {
  state.jobs.unshift({
    id: crypto.randomUUID(),
    ...input,
    skills: [],
    salary: 'Do ustalenia',
    status: 'draft',
  });
  event('Utworzono rekrutację', input.title);
}
function stageAction(input) {
  const c = state.candidates.find((c) => c.id === input.id);
  const steps = Object.keys(labels);
  if (
    !c ||
    Math.abs(steps.indexOf(c.stage) - steps.indexOf(input.stage)) !== 1 ||
    input.note.trim().length < 8
  ) {
    throw new Error('Podaj uzasadnienie i sąsiedni etap.');
  }
  const previous = c.stage;
  c.stage = input.stage;
  c.updated = new Date().toISOString();
  event('Zmieniono etap', `${c.name}: ${previous} → ${input.stage}. ${input.note}`);
}
function runAction(input) {
  if (state.paused) {
    throw new Error('Automatyzacja jest wstrzymana.');
  }
  const t = state.tasks.find((t) => t.id === input.id);
  if (!t || t.status !== 'queued') {
    throw new Error('Zadanie nie jest gotowe.');
  }
  const c = state.candidates.find((c) => c.id === t.candidateId);
  if (!c?.consent) {
    throw new Error('Brak zgody demonstracyjnej.');
  }
  t.status = 'completed';
  t.output =
    t.type === 'interview_plan'
      ? 'Plan rozmowy (szablon, bez AI): 5 min wprowadzenia, 20 min projektu, 20 min zadania technicznego, 10 min pytań, 5 min podsumowania. Kryteria: poprawność, testy i uzasadnienie wyborów.'
      : `Checklista (reguły, bez AI): ${c.evidence.join('; ')}. Brak materiału nie oznacza braku kompetencji.`;
  event('Ukończono zadanie lokalne', `${t.title}. Bez działań w systemach zewnętrznych.`);
}
const browserActions = { pause: pauseAction, job: jobAction, stage: stageAction, run: runAction };
async function mutate(action, input) {
  if (busy) {
    return;
  }
  busy = true;
  try {
    if (mode === 'server') {
      const response = await fetch(`/api/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error);
      }
      state = result;
    } else {
      browserActions[action](input);
      localStorage.setItem('hireos-demo-v1', JSON.stringify(state));
    }
    modal.close();
    render();
    toast('Zapisano zmianę.');
  } catch (error) {
    toast(error.message);
  } finally {
    busy = false;
  }
}
const button = (text, action, extra = '', cls = '') =>
  `<button class="button ${cls}" data-action="${action}" ${extra}>${text}</button>`;
function heading(title, subtitle, action = '') {
  return `<div class="page-heading"><div><div class="eyebrow">YOUR PEOPLE. YOUR MOMENTUM.</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function jobRows(limit = 100) {
  return state.jobs
    .slice(0, limit)
    .map(
      (j) =>
        `<div class="job-row"><div class="job-icon">${icon('briefcase')}</div><div class="job-info"><h3>${escapeHtml(j.title)}</h3><p>${escapeHtml(j.company)} <span aria-hidden="true">·</span> ${escapeHtml(j.location)}</p></div><span class="tag ${j.status === 'draft' ? 'gray' : ''}">${j.status === 'draft' ? 'Szkic' : 'Aktywna'}</span><button class="text-button" data-action="job-detail" data-id="${j.id}" aria-label="Szczegóły ${escapeHtml(j.title)}">${icon('arrow')}</button></div>`
    )
    .join('');
}
function taskRow(t) {
  const statusClass = { blocked: 'amber', queued: 'gray' }[t.status] || '';
  const statusLabel = { queued: 'W kolejce', completed: 'Ukończono', blocked: 'Zablokowane' }[
    t.status
  ];
  const attrs = `data-id="${t.id}" ${state.paused ? 'disabled' : ''}`;
  const runButton =
    t.status === 'queued' ? button('Uruchom szablon', 'run', attrs, 'small secondary') : '';
  const output = t.output ? `<p class="task-output">${escapeHtml(t.output)}</p>` : '';
  const reason = t.reason ? `<p class="task-output">${escapeHtml(t.reason)}</p>` : '';
  return `<div class="task-row"><div class="task-symbol">${icon('spark')}</div><div class="task-body"><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.agent)} · ${escapeHtml(state.candidates.find((c) => c.id === t.candidateId)?.name || '')}</p><div class="actions"><span class="tag ${statusClass}">${statusLabel}</span>${runButton}</div>${output}${reason}</div></div>`;
}
function taskRows() {
  return state.tasks.map(taskRow).join('');
}
function activity(limit = 100) {
  return state.events
    .slice(0, limit)
    .map(
      (e) =>
        `<div class="activity-row"><span class="activity-dot"></span><div><b>${escapeHtml(e.action)}</b><p>${escapeHtml(e.detail)}</p></div><time datetime="${escapeHtml(e.at)}">${new Date(e.at).toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })}</time></div>`
    )
    .join('');
}
function overview() {
  const queued = state.tasks.filter((t) => t.status === 'queued').length;
  return `${heading(
    'Dzień dobry, Operatorze',
    'Twoje rekrutacje, agenci i kolejne kroki — w jednym miejscu.',
    button(`${icon('plus')} Nowa rekrutacja`, 'new-job')
  )}<section class="hero"><div class="hero-main"><div class="hero-icon">${icon('spark')}</div><div><h2>${state.paused ? 'Automatyzacja jest wstrzymana' : 'Mniej koordynacji. Więcej dobrych rozmów.'}</h2><p>${queued} zadania gotowe do uruchomienia. Szablony pomagają przygotować materiały; decyzje dotyczące zatrudnienia pozostają po stronie człowieka.</p></div></div>${button(`Centrum agentów ${icon('arrow')}`, 'navigate', 'data-view="agents"', 'secondary small')}</section><div class="metrics">${[
    [
      state.jobs.filter((j) => j.status === 'active').length,
      'Aktywne rekrutacje',
      'briefcase',
      'Pozostałe projekty są szkicami',
    ],
    [state.candidates.length, 'Kandydaci w procesie', 'users', 'Dane wyłącznie demonstracyjne'],
    [
      state.candidates.filter((c) => c.stage === 'interview').length,
      'Etap rozmowy',
      'calendar',
      'Termin wymaga koordynacji',
    ],
    [queued, 'Zadania w kolejce', 'spark', 'Bez zewnętrznych wywołań AI'],
  ]
    .map(
      ([v, l, i, f]) =>
        `<div class="metric"><div class="metric-label">${l}${icon(i)}</div><div class="metric-value">${v.toString().padStart(2, '0')}</div><div class="metric-foot">${f}</div></div>`
    )
    .join(
      ''
    )}</div><div class="grid-main"><div><section class="panel"><div class="panel-head"><div><h2>Twoje rekrutacje</h2><p>Każda rola ma swój następny krok.</p></div><button class="text-button" data-action="navigate" data-view="jobs">Wszystkie ${icon('arrow')}</button></div>${jobRows(3)}</section><section class="panel"><div class="panel-head"><div><h2>Przepływ kandydatów</h2><p>Aktualna liczba osób na każdym etapie</p></div>${icon('users')}</div><div class="pipeline">${Object.entries(
    labels
  )
    .map(
      ([k, l]) =>
        `<div class="pipeline-step"><b>${state.candidates.filter((c) => c.stage === k).length}</b><small>${l}</small><div class="pipeline-bar"></div></div>`
    )
    .join(
      ''
    )}</div></section><section class="panel"><div class="panel-head"><h2>Ostatnie działania</h2><button class="text-button" data-action="navigate" data-view="audit">Dziennik ${icon('arrow')}</button></div>${activity(3)}</section></div><div><section class="panel"><div class="panel-head"><div><h2>Praca w tle</h2><p>Przejrzysta kolejka. Pełna kontrola.</p></div><span class="tag gray">${state.tasks.length} zadania</span></div>${taskRows()}<div class="panel-foot">${icon('shield')}Tryb demo · żadne wiadomości nie są wysyłane</div></section><section class="panel"><div class="panel-head"><div><h2>Gotowe do przeglądu</h2><p>Materiały czekające na ocenę rekrutera</p></div></div>${state.candidates
    .filter((c) => ['review', 'decision'].includes(c.stage))
    .map(
      (c) =>
        `<div class="job-row"><div class="avatar">${escapeHtml(c.initials)}</div><div class="job-info"><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(labels[c.stage])}</p></div><button class="text-button" data-action="candidate" data-id="${c.id}">Otwórz ${icon('arrow')}</button></div>`
    )
    .join('')}</section></div></div>`;
}
function candidateRow(c) {
  return `<tr><td><div class="person"><div class="avatar">${escapeHtml(c.initials)}</div><div><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.role)}</small></div></div></td><td><span class="tag ${{ decision: 'amber', interview: 'blue' }[c.stage] || 'gray'}">${labels[c.stage]}</span></td><td>${escapeHtml(c.source)}</td><td>${c.evidence.length} wpisy</td><td><button class="text-button" data-action="candidate" data-id="${c.id}">Przejrzyj ${icon('arrow')}</button></td></tr>`;
}
function candidateTable() {
  const candidates = state.candidates.filter(
    (c) =>
      (filter === 'all' || c.stage === filter) &&
      `${c.name} ${c.role}`.toLowerCase().includes(search.toLowerCase())
  );
  return `<section class="panel table-scroll"><table><thead><tr><th>Kandydat</th><th>Etap</th><th>Źródło</th><th>Materiały</th><th></th></tr></thead><tbody>${candidates.map(candidateRow).join('')}</tbody></table>${!candidates.length ? '<div class="empty">Brak kandydatów spełniających wybrane filtry.</div>' : ''}</section>`;
}
const integrations = [
  [
    'Formularz kariery',
    'Pozyskiwanie aplikacji bezpośrednio od kandydatów.',
    'Własny formularz + pliki + zgody',
  ],
  [
    'LinkedIn Talent Solutions',
    'Publikacja ofert i synchronizacja przez zatwierdzone API partnerskie.',
    'Dostęp partnerski / umowa',
  ],
  [
    'Pracuj.pl / OLX / Indeed',
    'Kanały wielobranżowe; zakres publikacji i aplikacji do uzgodnienia.',
    'Dostęp do API/feed i umowa',
  ],
  [
    'Just Join IT / No Fluff Jobs',
    'Kanały specjalistyczne; publikacja w granicach dostępnych API.',
    'Potwierdzenie API z portalem',
  ],
  [
    'Gmail / Microsoft 365',
    'Potwierdzenia, korespondencja i kontrola wypisania.',
    'OAuth · skrzynka zespołowa',
  ],
  [
    'Google / Outlook Calendar',
    'Dostępność, rezerwacja terminu i odwołanie spotkania.',
    'OAuth · dostęp do kalendarza',
  ],
  [
    'LiveKit / Teams / Meet',
    'Rozmowa na żywo z informacją o udziale AI i zgodą na nagrywanie.',
    'Konto dostawcy + polityka retencji',
  ],
  [
    'GitHub / sandbox kodu',
    'Repozytorium przekazane przez kandydata i izolowane zadania.',
    'OAuth · jednorazowy sandbox',
  ],
  ['Linear', 'Plan produktu, epiki, zadania i zależności.', 'Połączenie pluginu / OAuth'],
  [
    'ATS / HRIS / podpis',
    'Greenhouse, Lever, Personio i DocuSign jako wymienne adaptery.',
    'Konto + zakresy API',
  ],
];
function integrationCard([name, desc], i) {
  const control = button(
    `Wymagania ${icon('arrow')}`,
    'integration',
    `data-index="${i}"`,
    'secondary small'
  );
  return `<section class="integration"><div class="job-icon">${icon('plug')}</div><h3>${name}</h3><p>${desc}</p><span class="tag gray">Niepodłączone</span><div class="actions">${control}</div></section>`;
}
function page() {
  if (view === 'overview') {
    return overview();
  }
  if (view === 'jobs') {
    return `${heading(
      'Rekrutacje',
      'Od briefu do uporządkowanego procesu.',
      button(`${icon('plus')} Nowa rekrutacja`, 'new-job')
    )}<section class="panel"><div class="panel-head"><h2>Wszystkie projekty · ${state.jobs.length}</h2></div>${jobRows()}</section>`;
  }
  if (view === 'candidates') {
    return `${heading(
      'Kandydaci',
      'Materiały i etapy procesu. Bez automatycznego rankingu osób.'
    )}<div class="toolbar"><label class="search">${icon('search')}<input id="search" placeholder="Szukaj osoby lub stanowiska" aria-label="Szukaj kandydatów" value="${escapeHtml(search)}"></label><select id="stage-filter" aria-label="Filtruj po etapie"><option value="all">Wszystkie etapy</option>${Object.entries(
      labels
    )
      .map(([k, v]) => `<option value="${k}" ${filter === k ? 'selected' : ''}>${v}</option>`)
      .join('')}</select></div><div id="candidate-table">${candidateTable()}</div>`;
  }
  if (view === 'agents') {
    return `${heading(
      'Centrum agentów',
      'Widoczne zadania, wyniki i wyjątki.',
      button(
        icon(state.paused ? 'play' : 'pause') +
          (state.paused ? ' Wznów kolejkę' : ' Wstrzymaj kolejkę'),
        'pause',
        '',
        'secondary'
      )
    )}<div class="notice">Tryb demonstracyjny: zadania wykonują deterministyczne szablony. Astra 6 nadzoruje rozwój projektu; modele AI nie są jeszcze podłączone do produktu. Antigravity: wykonał katalog branż i checklisty pod nadzorem Astry.</div><section class="panel"><div class="panel-head"><h2>Kolejka wykonawcza</h2><span class="tag ${state.paused ? 'amber' : ''}">${state.paused ? 'Wstrzymana' : 'Gotowa'}</span></div>${taskRows()}</section>`;
  }
  if (view === 'interviews') {
    return `${heading(
      'Rozmowy i zadania',
      'Scenariusze branżowe i dowody związane z wymaganiami roli.'
    )}<div class="notice">IT: kod i architektura. Logistyka: plan trasy. Sprzedaż: oferta na fikcyjny brief. Pozostałe branże: playbook zatwierdzany przez specjalistę. Brak podłączonego kalendarza i dostawcy rozmów. Poniższy przykład IT jest szkicem; nie utworzono spotkań ani nagrań.</div><div class="grid-main"><section class="panel"><div class="panel-head"><div><h2>Senior Backend Engineer</h2><p>60 minut · sesja strukturyzowana</p></div><span class="tag blue">Szkic</span></div><div class="rubric"><ol><li>5 min — wprowadzenie, dostępność i zasady sesji.</li><li>20 min — omówienie projektu wybranego przez kandydata.</li><li>20 min — zadanie praktyczne z testami w sandboxie.</li><li>10 min — pytania kandydata.</li><li>5 min — podsumowanie i następne kroki.</li></ol></div></section><section class="panel"><div class="panel-head"><h2>Kryteria przeglądu</h2></div><div class="rubric"><ul><li>Poprawność rozwiązania z odnośnikiem do testów.</li><li>Umiejętność wyjaśnienia kompromisów technicznych.</li><li>Testowanie przypadków brzegowych.</li><li>Obszary niezweryfikowane opisane jako niepewność.</li></ul><p>Bez analizy emocji, wyglądu, głosu, pochodzenia i domniemanych cech osobowości. Ocenę zatwierdza rekruter.</p></div></section></div>`;
  }
  if (view === 'integrations') {
    return `${heading(
      'Integracje',
      'Jedno centrum operacyjne. Wymienne narzędzia i jawne uprawnienia.'
    )}<div class="notice">Wszystkie integracje są niepodłączone. Przycisk pokazuje wymagania wdrożenia, nie inicjuje OAuth ani wysyłki danych.</div><div class="integration-grid">${integrations.map(integrationCard).join('')}</div>`;
  }
  if (view === 'audit') {
    return `${heading(
      'Dziennik działań',
      'Każda zmiana etapu i wykonanie zadania pozostawia ślad.',
      button('Eksport JSON', 'export', '', 'secondary')
    )}<div class="notice">Dziennik lokalnego prototypu. Produkcyjny dziennik niezmienialny, tożsamość operatora i kontrola dostępu są elementami backlogu.</div><section class="panel"><div class="panel-head"><h2>Zdarzenia · ${state.events.length}</h2></div>${activity()}</section>`;
  }
  return `${heading(
    'Design system',
    'Spokojne centrum pracy. Czytelne decyzje i widoczne wyjątki.'
  )}<section class="panel"><div class="panel-head"><h2>01 / Kolory semantyczne</h2></div><div class="design-colors"><div class="swatch">Forest<br>#142E27</div><div class="swatch">Action<br>#265B46</div><div class="swatch">Lime<br>#D8EDAB</div><div class="swatch">Canvas<br>#F5F6F2</div><div class="swatch">Surface<br>#FFFFFF</div></div></section><div class="grid-main"><section class="panel"><div class="panel-head"><h2>02 / Typografia i rytm</h2></div><div class="token-list">Font: systemowy sans-serif<br>Nagłówek: 29 / 550 · Sekcja: 16 / 600<br>Treść: 13 / 400 · Etykieta: 11 / 500<br>Odstępy: 4, 8, 12, 16, 24, 32, 48 px<br>Promień: 8 px kontrolki · 12 px karty · 18 px dialogi</div></section><section class="panel"><div class="panel-head"><h2>03 / Stan zawsze ma etykietę</h2></div><div class="rubric"><div class="chip-list"><span class="tag">Ukończono</span><span class="tag gray">W kolejce</span><span class="tag amber">Wymaga działania</span><span class="tag blue">Rozmowa</span></div><p>Kolor nie jest jedynym nośnikiem informacji. Widoczny focus, obsługa klawiaturą, dialogi z etykietą i komunikaty aria-live.</p></div></section></div>`;
}
function navItem([id, i, l]) {
  const count = id === 'candidates' ? `<span class="count">${state.candidates.length}</span>` : '';
  return `<button class="${view === id ? 'active' : ''}" data-action="navigate" data-view="${id}" ${view === id ? 'aria-current="page"' : ''}>${icon(i)}${l}${count}</button>`;
}
function render() {
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="logo"><span class="logo-mark">h</span>hireos<span class="dot"></span></div><div class="workspace"><div class="workspace-icon">H</div><div><b>HireOS Workspace</b>Środowisko demonstracyjne</div></div><div class="nav-label">Centrum operacyjne</div><nav class="nav" aria-label="Nawigacja główna">${nav.map(navItem).join('')}</nav><div class="sidebar-bottom"><div class="agent-status"><b><span class="dot"></span>${state.paused ? 'Kolejka wstrzymana' : 'Środowisko gotowe'}</b>Tryb demo · brak połączeń AI<br>Astra 6 · nadzór nad projektem</div><div class="profile"><div class="avatar">OP</div><div><b>Operator demo</b>Przestrzeń lokalna</div></div></div></aside><main class="main"><header class="topbar"><span>Workspace <span aria-hidden="true"> / </span> <strong>${nav.find((n) => n[0] === view)[2]}</strong></span><div class="topbar-right"><span class="mode">${mode === 'server' ? 'LOCAL · SQLITE' : 'DEMO · PRZEGLĄDARKA'}</span><div class="avatar" aria-label="Operator demo">OP</div></div></header><div class="content">${page()}<footer class="footer"><span>HireOS / Recruitment operating system</span><span>Fikcyjne dane · decyzje zatrudnienia zatwierdza człowiek</span></footer></div></main></div>`;
}
function showDialog(title, body) {
  modal.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${escapeHtml(title)}</h2><button class="close" data-action="close" aria-label="Zamknij">×</button></div>${body}`;
  modal.setAttribute('aria-labelledby', 'dialog-title');
  modal.showModal();
}
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) {
    return;
  }
  const a = target.dataset.action;
  if (a === 'navigate') {
    ({ view } = target.dataset);
    render();
    return;
  }
  if (a === 'close') {
    modal.close();
    return;
  }
  if (a === 'pause') {
    mutate('pause', { paused: !state.paused });
    return;
  }
  if (a === 'run') {
    mutate('run', { id: target.dataset.id });
    return;
  }
  if (a === 'new-job') {
    showDialog(
      'Nowa rekrutacja',
      `<p>Utwórz szkic. Publikacja na portalach wymaga podłączonej integracji.</p><form id="job-form"><label class="field">Stanowisko<input name="title" required maxlength="160" placeholder="np. Senior Backend Engineer"></label><label class="field">Firma<input name="company" required maxlength="160" placeholder="Nazwa firmy"></label><label class="field">Lokalizacja / tryb<input name="location" required maxlength="160" placeholder="np. Warszawa · Remote"></label><div class="actions"><button class="button" type="submit">Utwórz szkic</button><button class="button secondary" type="button" data-action="close">Anuluj</button></div></form>`
    );
    return;
  }
  if (a === 'job-detail') {
    const j = state.jobs.find((j) => j.id === target.dataset.id);
    const chips = j.skills.map((s) => `<span class="tag gray">${escapeHtml(s)}</span>`).join('');
    showDialog(
      j.title,
      `<p>${escapeHtml(j.company)} · ${escapeHtml(j.location)}</p><div class="chip-list">${chips}</div><p>Budżet: ${escapeHtml(j.salary)}<br>Kandydaci: ${state.candidates.filter((c) => c.jobId === j.id).length}<br>Publikacja zewnętrzna: niepodłączona</p>`
    );
    return;
  }
  if (a === 'candidate') {
    const c = state.candidates.find((c) => c.id === target.dataset.id);
    const stages = Object.keys(labels),
      index = stages.indexOf(c.stage);
    const evidence = c.evidence.map((e) => `<li>${escapeHtml(e)}</li>`).join('');
    showDialog(
      c.name,
      `<p>${escapeHtml(c.role)} · ${labels[c.stage]}</p><ul class="evidence">${evidence}</ul><div class="notice">Materiał demonstracyjny. Brak potwierdzenia nie oznacza braku umiejętności. Zmiana etapu jest działaniem operatora.</div><form id="stage-form" data-id="${c.id}"><label class="field">Następny etap<select name="stage" aria-label="Następny etap">${stages
        .filter((s, i) => Math.abs(i - index) === 1)
        .map((s) => `<option value="${s}">${labels[s]}</option>`)
        .join(
          ''
        )}</select></label><label class="field">Uzasadnienie<textarea name="note" required minlength="8" maxlength="2000" placeholder="Opisz powód zmiany etapu i wykorzystane materiały."></textarea></label><button type="submit" class="button">Zapisz zmianę etapu</button></form>`
    );
    return;
  }
  if (a === 'integration') {
    const [name, desc, req] = integrations[Number(target.dataset.index)];
    showDialog(
      name,
      `<p>${desc}</p><ul class="evidence"><li>${req}</li><li>Poświadczenia wyłącznie w menedżerze sekretów serwera.</li><li>Webhook z weryfikacją podpisu, deduplikacja zdarzeń i limity dostawcy.</li><li>Test w sandboxie przed aktywacją na danych rzeczywistych.</li></ul><span class="tag gray">Adapter zaplanowany · brak połączenia</span>`
    );
    return;
  }
  if (a === 'export') {
    const blob = new Blob([JSON.stringify(state.events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hireos-audit-demo.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Wyeksportowano dziennik demonstracyjny.');
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'search') {
    search = e.target.value;
    document.querySelector('#candidate-table').innerHTML = candidateTable();
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'stage-filter') {
    filter = e.target.value;
    document.querySelector('#candidate-table').innerHTML = candidateTable();
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'job-form') {
    e.preventDefault();
    const input = Object.fromEntries(new FormData(e.target));
    for (const key in input) {
      input[key] = input[key].trim();
    }
    if (Object.values(input).some((v) => !v)) {
      toast('Uzupełnij wszystkie pola.');
      return;
    }
    mutate('job', input);
  }
  if (e.target.id === 'stage-form') {
    e.preventDefault();
    mutate('stage', { id: e.target.dataset.id, ...Object.fromEntries(new FormData(e.target)) });
  }
});
render();
