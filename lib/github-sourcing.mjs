const endpoint = 'https://api.github.com/search/users';

export function createGitHubSourcing({ fetchImpl = fetch, token } = {}) {
  return async function search({ language, location }) {
    if (typeof language !== 'string' || !language.trim() || language.length > 80) {
      throw new Error('Podaj język technologii (maks. 80 znaków).');
    }
    if (typeof location !== 'string' || !location.trim() || location.length > 120) {
      throw new Error('Podaj lokalizację (maks. 120 znaków).');
    }
    const query = `language:${language.trim()} location:${location.trim()}`;
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'HireOS-MVP',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetchImpl(`${endpoint}?q=${encodeURIComponent(query)}&per_page=30`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0' || response.status === 403 || response.status === 429) {
      const error = new Error('Limit GitHub API został osiągnięty. Spróbuj po resecie limitu.');
      error.status = 429;
      error.resetAt = response.headers.get('x-ratelimit-reset');
      throw error;
    }
    if (!response.ok) {
      const error = new Error('GitHub API chwilowo nie obsłużyło wyszukiwania.');
      error.status = 502;
      throw error;
    }
    const data = await response.json();
    if (!Array.isArray(data.items)) {
      throw Object.assign(new Error('GitHub API zwróciło niepoprawną odpowiedź.'), { status: 502 });
    }
    return {
      total: data.total_count,
      profiles: data.items.map((item) => ({
        login: item.login,
        url: item.html_url,
        score: item.score,
        reasons: [`język: ${language.trim()}`, `lokalizacja: ${location.trim()}`],
      })),
    };
  };
}
