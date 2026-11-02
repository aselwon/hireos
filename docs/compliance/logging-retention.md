# Zakres logów i okres przechowywania

**projekt — wymaga przeglądu prawnego**

Założenie projektowe do weryfikacji według art. 26 ust. 6 AI Act: podmiot stosujący
przechowuje automatycznie generowane logi pozostające pod jego kontrolą przez
okres odpowiedni do przeznaczenia, co najmniej 6 miesięcy, chyba że właściwe prawo
stanowi inaczej, w szczególności prawo ochrony danych. Nie oznacza to obowiązku
zachowania wszystkich CV przez sześć miesięcy. Zakres i podstawa wymagają decyzji
prawnika; kod nie wymusza tego minimum ani końcowego terminu usuwania logów.

| Zbiór                                 | Faktycznie zapisywana zawartość                                                                                         | Obecna retencja                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `decisions`, `audit_events`           | Aktor, czas, identyfikator aplikacji, wynik i powód; audyt zawiera wcześniejszy etap i identyfikator decyzji.           | Brak automatycznego usuwania i ochrony przed zmianą przez administratora bazy.                                   |
| `model_calls`, `model_gateway_blocks` | Dostawca, model, cel, czas, status, szacunek neuronów, tokeny, fingerprint, odpowiedź modelu; blokada dostawcy na dobę. | Brak automatycznego usuwania; odpowiedź może zawierać dane z CV. Fingerprint nie jest jawnym promptem.           |
| `requests`                            | Klucz, fingerprint i odpowiedź dla idempotencji; mogą zawierać profil, raport, dane aplikacji lub uzasadnienie.         | Brak ogólnego czyszczenia; usunięcie profilu nie usuwa tych kopii.                                               |
| `outreach_tasks`, `task_attempts`     | Ładunek zadania, stan, wykonawca, lease, wyniki i teksty prób.                                                          | Brak automatycznego usuwania.                                                                                    |
| Log procesu                           | Zdarzenia przekazane do loggera; redakcja wybranych kluczy, adresów e-mail i numerów telefonu.                          | Rotacja i czas przechowywania zależą od środowiska, nie od loggera. Redakcja nie gwarantuje anonimizacji tekstu. |

Podstawy w kodzie: [lib/migrations/001-demo.sql](../../lib/migrations/001-demo.sql),
[lib/migrations/002-mvp.sql](../../lib/migrations/002-mvp.sql),
[lib/migrations/003-model-gateway.sql](../../lib/migrations/003-model-gateway.sql),
[lib/decisions.mjs](../../lib/decisions.mjs),
[lib/model-gateway.mjs](../../lib/model-gateway.mjs),
[lib/outreach.mjs](../../lib/outreach.mjs), [lib/logger.mjs](../../lib/logger.mjs).
Log procesu nie zastępuje audytu decyzji. Nie ma dowodu, że rejestrowane są wszystkie
zdarzenia potrzebne do rekonstrukcji działania systemu.

[lib/retention.mjs](../../lib/retention.mjs) udostępnia `purgeRejectedCv`.
Odrzucone aplikacje zachowują dotychczasową retencję. Po zamknięciu rekrutacji
aplikacje bez zgody na przyszłe rekrutacje są anonimizowane po `RETENTION_DAYS`
od zamknięcia; aplikacje ze zgodą — po tym okresie od udzielenia zgody. Usuwane
są CV, profile, fakty, raporty i treść powiązanych zadań outreach, a dane
identyfikujące aplikację oraz uzasadnienia decyzji są anonimizowane. Oczekujące
zadania outreach są anulowane. Codzienny harmonogram działa podczas pracy serwera.
Każdy przebieg zapisuje w audycie liczby aplikacji, plików CV i zadań outreach
oraz okres, bez danych osobowych. Błąd usuwania pliku po zatwierdzeniu transakcji może pozostawić
plik bez rekordu; wymaga obsługi operacyjnej. Test zakresu:
[tests/retention.test.mjs](../../tests/retention.test.mjs).

[ops/backup.mjs](../../ops/backup.mjs) kopiuje bazę i CV oraz domyślnie zachowuje
14 kopii, nie 14 dni ani 6 miesięcy logów. Kopie mogą odtworzyć dane wcześniej
usunięte z aktywnej bazy. Brak wdrożonej tu polityki usuwania po odtworzeniu.

Proponowane działania właściciela po przeglądzie: ustalić macierz zbiorów, celów,
podstaw i terminów; oddzielić minimalny audyt od treści CV; ograniczyć dostęp do
bazy i kopii; wdrożyć kontrolę integralności, harmonogram usuwania oraz test
odtworzenia respektujący usunięcia. To prace do wykonania, nie obecne gwarancje.

## Otwarte pytania do prawnika

1. Które zapisy stanowią logi z art. 26 ust. 6 i od jakiego zdarzenia liczyć okres?
2. Jak pogodzić minimum 6 miesięcy, roszczenia, minimalizację i żądania usunięcia?
3. Jakie terminy oraz wyjątki zastosować do cache, treści odpowiedzi i backupów?
