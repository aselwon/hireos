const form = document.querySelector('#lead-form');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  const status = form.querySelector('.form-status');
  button.disabled = true;
  status.textContent = 'Wysyłanie…';
  const fields = Object.fromEntries(new FormData(form));
  fields.consent = form.elements.consent.checked;
  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(fields),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Nie udało się wysłać zapytania.');
    }
    form.reset();
    status.textContent = 'Dziękujemy. Odezwiemy się w sprawie Twojego zapytania.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
