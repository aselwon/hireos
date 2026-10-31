const form = document.querySelector('form');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ password: form.elements.password.value }),
    });
    form.reset();
    if (response.ok) {
      window.location.assign('/');
    } else {
      document.querySelector('#status').textContent =
        response.status === 429
          ? 'Limit prób logowania. Spróbuj ponownie za 15 minut.'
          : 'Nie udało się zalogować. Sprawdź hasło.';
    }
  } catch {
    document.querySelector('#status').textContent = 'Brak połączenia z serwerem.';
  } finally {
    button.disabled = false;
  }
});
