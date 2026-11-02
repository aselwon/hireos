export function applicationStatus(application, cvStatusLabels) {
  if (application.processingStatus === 'queued') {
    return '<span class="tag gray">W kolejce</span>';
  }
  if (
    application.processingStatus === 'needs_manual_review' ||
    application.cvStatus === 'needs_manual_review'
  ) {
    return '<span class="tag amber">Wymaga ręcznego przeglądu</span>';
  }
  if (application.uncertain) {
    return '<span class="tag amber">Niepewne fakty</span>';
  }
  const ready = application.profileStatus === 'completed';
  const className = ready ? '' : 'gray';
  const label = ready ? 'Profil gotowy' : cvStatusLabels[application.cvStatus] || 'Oczekuje';
  return `<span class="tag ${className}">${label}</span>`;
}
export function applicationRow(application, escapeHtml, stageLabels, cvStatusLabels) {
  const status = applicationStatus(application, cvStatusLabels);
  return `<tr><td><b>${escapeHtml(application.name)}</b><small>${escapeHtml(application.email)}</small></td><td>${stageLabels[application.stage] || escapeHtml(application.stage)}</td><td>${status}</td><td><button class="text-button" data-action="report" data-id="${escapeHtml(application.id)}">Otwórz raport →</button></td></tr>`;
}
export function emptyReport(application) {
  if (application.processingStatus === 'queued') {
    return '<div class="empty">W kolejce — profil i raport powstaną automatycznie. Po wyczerpaniu limitu AI praca zostanie wznowiona o 00:00 UTC. Wróć do aplikacji, aby odświeżyć status.</div>';
  }
  const message = application.profile
    ? 'Raport nie został jeszcze utworzony.'
    : 'Profil CV nie jest jeszcze dostępny.';
  return `<div class="empty">${message}</div>`;
}
export function requirementEvidence(item, escapeHtml) {
  const labels = { met: 'Spełnione', missing: 'Brak dowodu', uncertain: 'Niepewne' };
  const status = labels[item.status] || item.status;
  const statusClass = item.status === 'met' ? '' : 'amber';
  const evidence = (item.evidence || []).map((entry) => evidenceQuote(entry, escapeHtml)).join('');
  const details = evidence
    ? `<ul class="evidence">${evidence}</ul>`
    : '<p>Brak cytatu potwierdzającego wymaganie.</p>';
  return `<article class="mvp-evidence"><div class="panel-head"><h3>${escapeHtml(item.description)}</h3><span class="tag ${statusClass}">${status}</span></div>${details}</article>`;
}
function evidenceQuote(evidence, escapeHtml) {
  const uncertain = evidence.uncertain
    ? '<span class="tag amber">Cytat niejednoznaczny</span>'
    : '';
  return `<li><blockquote>${escapeHtml(evidence.quote)}</blockquote>${uncertain}</li>`;
}
