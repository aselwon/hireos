import { retentionDays } from '../retention.mjs';

export function loadPrivacy(env = process.env) {
  return {
    version: 'v3',
    name: env.PRIVACY_CONTROLLER_NAME?.trim() || '',
    address: env.PRIVACY_CONTROLLER_ADDRESS?.trim() || '',
    contact: env.PRIVACY_CONTROLLER_CONTACT?.trim() || '',
    dpo: env.PRIVACY_DPO_CONTACT?.trim() || '',
    days: retentionDays(env.RETENTION_DAYS),
  };
}

export function requirePrivacy(privacy, production) {
  if (production && (!privacy.name || !privacy.address || !privacy.contact)) {
    throw Object.assign(
      new Error(
        'Formularz aplikacji jest obecnie niedostępny. Brak konfiguracji administratora danych.'
      ),
      { status: 503 }
    );
  }
}

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}

export function privacyPage(version, privacy) {
  if (!['v1', privacy.version].includes(version)) {
    throw Object.assign(new Error('Nie znaleziono wersji klauzuli.'), { status: 404 });
  }
  const dpo = privacy.dpo
    ? `Kontakt z inspektorem ochrony danych: ${escapeHtml(privacy.dpo)}.`
    : 'Nie wskazano inspektora ochrony danych. Pytania kieruj do administratora.';
  const content =
    version === 'v1'
      ? '<p>Wersja historyczna: „Zgadzam się na przetwarzanie danych w celu przeprowadzenia rekrutacji. Klauzula v1.” Nie była pełną klauzulą informacyjną. Nie jest używana dla nowych aplikacji.</p>'
      : `<h2>Administrator i kontakt</h2>
<p>Administratorem danych jest ${escapeHtml(privacy.name || '[nie skonfigurowano nazwy]')}, adres: ${escapeHtml(privacy.address || '[nie skonfigurowano adresu]')}. Kontakt w sprawach danych i realizacji praw: ${escapeHtml(privacy.contact || '[nie skonfigurowano kontaktu]')}.</p>
<p>${dpo}</p>
<h2>Cele i podstawy przetwarzania</h2>
<p>Dane z formularza i CV przetwarzamy w celu przeprowadzenia bieżącej rekrutacji. Dla zatrudnienia pracowniczego podstawą danych wymaganych prawem jest art. 6 ust. 1 lit. c RODO w związku z art. 22¹ Kodeksu pracy; dla działań przed zawarciem umowy na Twoje żądanie — art. 6 ust. 1 lit. b RODO. Dodatkowe, dobrowolne dane przetwarzamy na podstawie zgody (art. 6 ust. 1 lit. a RODO). Nie przesyłaj danych szczególnych kategorii, które nie są potrzebne do rekrutacji.</p>
<p>Udział w przyszłych rekrutacjach wymaga osobnej, dobrowolnej zgody (art. 6 ust. 1 lit. a RODO). Odmowa nie wpływa na obecną rekrutację. Ustalenie, dochodzenie lub obrona roszczeń oraz bezpieczeństwo systemu mogą opierać się na art. 6 ust. 1 lit. f RODO — uzasadnionym interesie administratora.</p>
<h2>Okres przechowywania</h2>
<p>Dokumenty rekrutacyjne przechowujemy przez czas bieżącej rekrutacji, a po jej zamknięciu przez ${privacy.days} dni. Dla przyszłych rekrutacji: do wycofania zgody, nie dłużej niż ${privacy.days} dni od jej udzielenia. Dane niezbędne do obsługi roszczeń mogą być przechowywane do upływu właściwego okresu przedawnienia. Zakres i wykonanie retencji wymagają potwierdzenia przed użyciem produkcyjnym.</p>
<h2>Odbiorcy i transfery</h2>
<p>Odbiorcami mogą być upoważnione osoby prowadzące rekrutację, zleceniodawca danej rekrutacji (potencjalny pracodawca), dostawcy hostingu i obsługi IT oraz Cloudflare Workers AI wspierający analizę CV. Dane mogą otrzymać podmioty uprawnione na podstawie prawa. Informację o zleceniodawcy uzyskasz od administratora przed przekazaniem mu danych.</p>
<p>Korzystanie z dostawców może wiązać się z przetwarzaniem poza EOG. Przed uruchomieniem administrator musi potwierdzić miejsca przetwarzania i właściwą podstawę transferu (decyzję stwierdzającą odpowiedni stopień ochrony lub zabezpieczenia z art. 46 RODO, w tym standardowe klauzule umowne). Informację o zabezpieczeniach i ich kopię uzyskasz przez wskazany kontakt.</p>
<h2>Twoje prawa</h2>
<p>Masz prawo dostępu do danych i ich kopii, sprostowania, usunięcia, ograniczenia przetwarzania oraz — gdy spełnione są warunki RODO — przenoszenia danych. Możesz wnieść sprzeciw wobec przetwarzania opartego na uzasadnionym interesie. Zgodę możesz wycofać w dowolnym momencie przez kontakt z administratorem, bez wpływu na zgodność z prawem wcześniejszego przetwarzania. Możesz złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych.</p>
<h2>Dobrowolność i udział AI</h2>
<p>Podanie danych jest dobrowolne, lecz brak danych potrzebnych do oceny aplikacji może uniemożliwić udział w rekrutacji; zakres wymagany przepisami dotyczy zatrudnienia pracowniczego. Zgoda na przyszłe rekrutacje nie jest wymagana.</p>
<p>CV analizuje system AI wspierający rekrutera: wyodrębnia fakty i przygotowuje raport dopasowania do wymagań wraz z cytatami. Wyniki mogą zawierać błędy i podlegają ocenie człowieka. AI nie podejmuje decyzji o wyniku rekrutacji ani nie odrzuca kandydatów automatycznie. Decyzję podejmuje człowiek. Możesz poprosić o wyjaśnienie i weryfikację przez człowieka, kontaktując się z administratorem pod wskazanym wyżej adresem.</p>`;
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Klauzula informacyjna ${escapeHtml(version)} — HireOS</title><link rel="stylesheet" href="/styles.css"></head><body><main class="application"><h1>Klauzula informacyjna RODO — ${escapeHtml(version)}</h1><p><strong>Projekt do przeglądu prawnego — wymaga zatwierdzenia przez administratora i specjalistę przed użyciem z prawdziwymi kandydatami.</strong></p>${content}</main></body></html>`;
}
