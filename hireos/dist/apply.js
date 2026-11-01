const id = decodeURIComponent(window.location.pathname.split('/').pop());
const status = document.querySelector('#status');
const form = document.querySelector('#application-form');

fetch(`/api/v1/public-briefs/${encodeURIComponent(id)}`)
  .then((response) => {
    if (!response.ok) {
      throw new Error('Ta rekrutacja nie przyjmuje aplikacji.');
    }
    return response.json();
  })
  .then(({ title, advertisement }) => {
    document.title = `${title} — aplikuj`;
    document.querySelector('#title').textContent = title;
    document.querySelector('#advertisement').textContent = advertisement;
  })
  .catch((error) => {
    form.hidden = true;
    status.textContent = error.message;
  });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Wysyłanie…';
  try {
    const data = new FormData();
    data.set('name', form.elements.name.value);
    data.set('email', form.elements.email.value);
    data.set('consentVersion', 'v1');
    data.set('consent', form.elements.consent.checked ? 'yes' : '');
    data.set('cv', form.elements.cv.files[0]);
    const response = await fetch(`/api/v1/briefs/${encodeURIComponent(id)}/applications`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: data,
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Nie udało się wysłać aplikacji.');
    }
    form.reset();
    status.textContent = 'Dziękujemy. Aplikacja została wysłana.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
