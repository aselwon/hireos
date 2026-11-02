# Weryfikacja HireOS

## Historyczna weryfikacja prototypu

30.10.2026:

- `npm test`: 5/5 testów PASS. Retry mutacji nie duplikuje danych; konflikt idempotency key odrzucany; zmiana etapu wymaga uzasadnienia i sąsiedniego stanu; pauza blokuje zadania; zablokowana integracja nie przechodzi do completed; zapis i idempotencja przetrwały ponowne otwarcie SQLite; niepoprawne dane nie tworzą zdarzeń.
- `npm run check`: PASS — składnia serwera, store i UI.
- Render HTML: 1440 px i 728 px, bez błędów konsoli. Nie jest to pełny audyt WCAG.
- Interakcje przeglądarkowe na samowystarczalnym artefakcie tego samego UI: utworzenie rekrutacji, wyszukiwanie, zmiana etapu, pauza/wznowienie, wykonanie szablonu i dialog wymagań integracji — PASS.
- Publikacja Sites: status succeeded, prywatny dostęp właściciela. Wersja hostowana używa localStorage, nie lokalnego SQLite.
- HTTP/API na tymczasowej bazie: strona i stan 200, utworzenie szkicu 200, ponowienie tego samego żądania nie dubluje szkicu, obcy Origin 403, nieznana ścieżka 404. Serwer testowy zatrzymany.
- Backlog: 8 unikalnych epików, 36 unikalnych zadań, wszystkie zależności istnieją, graf bez cykli.

Nie zweryfikowano produkcyjnej izolacji tenantów, realnych integracji, wywołań modeli, wysyłki poczty, rozmów audio ani zadeklarowanej skali. To są zadania backlogu, nie funkcje tego prototypu. Dane wyłącznie fikcyjne.

## MVP-23 — test integracyjny z Grok Botem

**Status: NIE WYKONANO — oczekuje na właściciela.** Przygotowanie scenariusza
ani zielone testy lokalne nie zaliczają integracji. Historyczne wyniki powyżej
nie są dowodem MVP-23. Agent nie uruchamia Grok Bota, nie wdraża aplikacji i nie
kontaktuje się z odbiorcami.

**Zakaz kontaktu z prawdziwymi kandydatami pozostaje aktywny do zaliczenia
całego testu na kontrolowanym odbiorcy i zapisania dowodów oraz decyzji
właściciela w tym raporcie.** Zaliczenie nie zastępuje pozostałych warunków
[SPEC](../SPEC.md), w tym przeglądu prawnego i zatwierdzenia zasad kontaktu.

### Przygotowanie przez właściciela

- [ ] Potwierdź gotowość MVP-16, MVP-17 i MVP-21 oraz dostęp Grok Bota do
      przygotowanego przez właściciela HTTPS. Zapisz wersję HireOS i rutyny.
- [ ] Użyj izolowanej bazy testowej z syntetyczną rekrutacją i aplikacjami,
      bez zadań produkcyjnych. Claim wybiera dowolne kwalifikujące się zadanie
      z kolejki; zakres klucza nie ogranicza go do konkretnej rekrutacji.
- [ ] Wskaż wyłącznie konto odbiorcy kontrolowane przez właściciela i nadawcę
      testowego. Właściciel loguje zdalną przeglądarkę. Poświadczenia i cookies
      nie trafiają do HireOS ani raportu.
- [ ] W rutynie jawnie powiąż syntetyczne `application_id` z dozwolonym kontem
      i wątkiem. API nie dostarcza osobnego pola adresu LinkedIn; nie zgaduj
      odbiorcy na podstawie nazwiska. Nieznane powiązanie ma blokować wysyłkę.
- [ ] Zatwierdź treść testową, dozwolone konta, godziny i maksymalną liczbę
      wiadomości dla każdego przypadku. Wyłącz automatyczne follow-upy poza
      jawnie zaplanowanymi próbami. Jeśli dostawca nie umożliwia kontrolowanego
      zatrzymania przed wysyłką lub symulacji timeoutu, oznacz przypadek jako
      niezweryfikowany, zamiast wykonywać ryzykowne ponowienia.
- [ ] Utwórz osobny klucz `worker:outreach` zgodnie z [instrukcją kluczy](auth.md)
      na tej samej bazie co serwer testowy. Grok Bot nie otrzymuje `admin`.
      Zapisz tylko identyfikator klucza, nigdy jego wartość. Operacje rekrutera
      wykonuj osobno przez sesję lub klucz administratora.
- [ ] Potwierdź trwałą deduplikację wykonawcy po `message_id`, również po
      restarcie rutyny. Ustal interwał rutyny i okno obserwacji: co najmniej
      dwa pełne cykle oraz ponad 60 sekund lease. Zapisz rzeczywiste czasy UTC;
      deklarowane około 5 minut nie jest gwarancją dostawcy.
- [ ] Wyłącz MacBooka przed pierwszym claimem. Prowadź kontrolę i zbieraj dowody
      z innego urządzenia; Mac pozostaje wyłączony przez cały test. Zapisz
      czas wyłączenia i późniejszego włączenia oraz dowód wykonania rutyny
      i przeglądarki na serwerze dostawcy.

### Wspólne zasady wykonania i dowody

Użyj [kontraktu Worker API](worker-api.md) dla treści żądań i nagłówków.
Każdy POST wymaga JSON i `Idempotency-Key`. Nadaj identyfikator przebiegu,
np. `mvp23-run-01`, i osobny klucz dla każdej nowej operacji. Retry tej samej
operacji zachowuje klucz i body; nowy claim po `task:null` wymaga nowego klucza.

Dla każdego przypadku zapisz: czas UTC, pseudonim konta, `application_id`,
`task_id`, `message_id`, `lease_id`, statusy HTTP i istotne pola odpowiedzi,
historię `GET /api/v1/tasks/:id` (w tym `attempts`), liczbę wiadomości przed i po
oraz odnośnik do zanonimizowanego dowodu z właściwego wątku i dziennika rutyny.
Nie zapisuj nagłówków Authorization, cookies, sekretów ani danych prawdziwych osób.
Same logi HireOS nie dowodzą liczby wiadomości na platformie.

Przed każdym wysłaniem rutyna musi mieć aktualny lease i udany preflight.
`allowed:true` samo nie potwierdza ważności lease. Lease trwa 60 sekund;
heartbeat przedłuża go o 60 sekund. Stary claim odtworzony idempotentnie nie
jest nowym pozwoleniem na wysyłkę. Brak odpowiedzi API lub niepewność oznacza
zatrzymanie. Osobne przypadki prowadź na nowych zadaniach, a odmowę na osobnej
syntetycznej aplikacji; nie usuwaj `do_not_contact`, aby kontynuować test.

### Scenariusz i oczekiwane wyniki

1. **Wysyłka bez MacBooka.** Rekruter tworzy zadanie przez `POST /api/v1/tasks`
   (201, `queued`). Grok Bot wykonuje claim (200, `leased`), preflight
   (200, `allowed:true`), jedną wysyłkę i raport `sent` z identyfikatorami
   claimu (200, `sent`). Odbiorca widzi dokładnie jedną wiadomość.
   Powtórz tworzenie i raport z tym samym body i kluczem: te same identyfikatory,
   jedna próba w `attempts`, nadal jedna wiadomość. Zmienione body pod tym samym
   kluczem daje 409. Nie uruchamiaj ponownie samej wysyłki przy retry raportu.
2. **Konkurencja i wygasły lease.** Dwa wykonania rutyny próbują claimować
   jedno nowe zadanie, używając różnych kluczy idempotencji. Tylko jedno
   otrzymuje zadanie, drugie `task:null`. Zatrzymaj zwycięzcę przed wysyłką
   i heartbeat; po ponad 60 sekundach wykonaj nowy claim. `task_id` i
   `message_id` są stałe, `lease_id` jest nowy. Stare wykonanie nie wysyła;
   jego heartbeat/raport jest odrzucony (409, a przy zmianie właściciela 404).
   Nowe wykonanie po preflight może wysłać raz: łącznie jedna wiadomość.
3. **Timeout po możliwej wysyłce.** Na nowym zadaniu zasymuluj utratę
   potwierdzenia platformy, pozostawiając API dostępne. Wykonawca zgłasza
   `unresolved` przed wygaśnięciem lease (200). Przez całe okno obserwacji
   nowe claimy nie pobierają tego zadania, a rutyna nie wysyła ponownie,
   również po jej restarcie. Właściciel sprawdza właściwy wątek; gdy wysyłka
   jest potwierdzona, ten sam wykonawca raportuje `verified_sent` na tym samym
   zadaniu, z pierwotnymi identyfikatorami. Stan to `sent`, liczba wiadomości
   wynosi jeden. Brak rozstrzygającego dowodu pozostawia `unresolved`.
4. **Timeout bez wysyłki.** W osobnym przypadku zatrzymaj działanie przed
   platformą i zgłoś `unresolved`. Dopiero po udokumentowaniu, że wysyłka nie
   nastąpiła, właściciel zezwala wykonawcy na `verified_not_sent` (200,
   `queued`). Sam brak widocznej wiadomości nie jest dowodem. Nowy claim ma
   ten sam `message_id`, nowy `lease_id`; po preflight jedna wysyłka i raport
   `sent`. Łącznie jedna wiadomość. Sprawdź trwały rejestr deduplikacji rutyny.
5. **Pauza rekrutacji, rozmowy i przejęcie.** Dla każdej blokady użyj osobnego
   zadania. Zatrzymaj rutynę po claimie, przed ostatnim preflight. Rekruter
   ustawia odpowiednio `POST /api/v1/briefs/:jobId/outreach-control`
   z `{"paused":true}` lub
   `POST /api/v1/applications/:applicationId/outreach-control`
   z `{"paused":true}` albo `{"human_takeover":true}` (200, `ok:true`).
   Preflight zwraca `allowed:false` i odpowiednio `recruitment_paused`,
   `conversation_paused`, `human_takeover`. Nowy claim nie pobiera zablokowanej
   pracy; nowy raport `sent` jest odrzucony (409). Przez okno obserwacji liczba
   nowych wiadomości wynosi zero. Po próbie właściciel może zdjąć blokadę
   polem `false` z nowym kluczem idempotencji; sam retry starego claimu nie
   uprawnia do wysłania.
6. **Odmowa przed następną wiadomością.** Na oddzielnej aplikacji przygotuj
   zadanie kolejnego kontaktu i zatrzymaj rutynę po claimie. Kontrolowany
   odbiorca wpisuje testową odmowę w ustalonym wątku. Rutyna rozpoznaje ją,
   zatrzymuje wysyłkę i raportuje `refused` przy aktywnym lease (200).
   Preflight zwraca `allowed:false`, `reason:do_not_contact`; nowy claim
   omija także wcześniej zakolejkowane zadania tej aplikacji, a tworzenie
   nowego zadania daje 409. Obserwuj co najmniej dwa cykle: zero kolejnych
   wiadomości. Zapisz czas odbioru odmowy, zapisu blokady i prób następnego
   kontaktu. Jeśli rutyna nie potrafi zarejestrować odmowy po zakończonym
   zadaniu bez wysyłania nowej wiadomości, zapisz lukę i nie zaliczaj testu.
7. **Brak API i wyścig z wysyłką.** Kontrolowanie zasymuluj brak odpowiedzi
   preflight: zero wysyłek. Osobno zatrzymaj rutynę po udanym preflight,
   ale przed działaniem w przeglądarce, i ustaw pauzę. Zmierz czas ostatniej
   kontroli, ustawienia pauzy i rozpoczęcia wysyłki. Rutyna musi sprawdzić
   blokadę przed wznowieniem. Zapisz faktyczne okno wyścigu; API i platforma
   nie są atomowe. Wiadomość rozpoczęta przed blokadą musi być odnotowana,
   a wiadomość rozpoczęta po blokadzie oznacza niezaliczenie przypadku.
8. **Zakres i odwołanie klucza.** Działając kluczem wykonawcy, sprawdź
   `GET /api/v1/tasks` (200), `POST /api/v1/tasks` z poprawną treścią (403),
   `POST /api/v1/applications/:applicationId/outreach-control` (403)
   i `GET /api/v1/briefs` (403). Nieprzypisane zadanie jest niewidoczne
   (GET szczegółów: 404). Właściciel odwołuje klucz na bazie serwera testowego:

   ```sh
   export PATH=/home/harness/.local/bin:$PATH && node scripts/api-key.mjs revoke mvp23-worker
   ```

   `mvp23-worker` zastąp identyfikatorem faktycznie utworzonego klucza;
   `HIREOS_DB` musi wskazywać bazę testową. Bez restartu HireOS powtórz
   GET listy, preflight i POST claim z odwołanym kluczem: każde daje 401.
   Rutyna zatrzymuje się, nie przełącza na admin i nie wysyła. Zapisz dowód
   401 z rzeczywistego połączenia Grok Bota, bez ujawniania klucza.

Po każdym nieoczekiwanym wysłaniu, duplikacie lub obejściu blokady przerwij test,
wyłącz rutynę i odwołaj klucz. Zachowaj dowody; nie zaznaczaj zaliczenia po
samym ponowieniu udanego przypadku. Po zakończeniu wyłącz rutynę, odwołaj
pozostałe klucze testowe i sprawdź, że nie ma aktywnych wysyłek.

### Raport właściciela — do uzupełnienia po wykonaniu

- Przebieg / data UTC / operator: **nie wykonano**.
- Wersja HireOS (SHA) / wersja i konfiguracja rutyny: **nie zapisano**.
- Środowisko HTTPS / izolowana baza / pseudonimy nadawcy i odbiorcy: **nie zapisano**.
- Identyfikator klucza i potwierdzenie zakresu (bez sekretu): **nie zapisano**.
- Zatwierdzone limity / interwał / długość okna obserwacji: **nie zapisano**.
- MacBook wyłączony od–do / dowód wykonania zdalnego: **nie zapisano**.

| Przypadek                                 | Wynik        | Identyfikatory, czasy UTC, HTTP, liczba wiadomości przed/po, dowody |
| ----------------------------------------- | ------------ | ------------------------------------------------------------------- |
| 1. Wysyłka i retry                        | nie wykonano | —                                                                   |
| 2. Konkurencja i lease                    | nie wykonano | —                                                                   |
| 3. Unresolved → verified_sent             | nie wykonano | —                                                                   |
| 4. Unresolved → verified_not_sent         | nie wykonano | —                                                                   |
| 5. Pauza rekrutacji / rozmowy / przejęcie | nie wykonano | Osobny wynik dla każdej blokady                                     |
| 6. Odmowa                                 | nie wykonano | —                                                                   |
| 7. Brak API / okno wyścigu                | nie wykonano | —                                                                   |
| 8. Zakres / odwołanie → 401               | nie wykonano | —                                                                   |

Wynik każdego przypadku: **zaliczony / niezaliczony / niezweryfikowany**.
Brak dowodu oznacza niezweryfikowany. Wszystkie przypadki muszą być zaliczone;
raport ma zawierać dowody z API i wykonawcy oraz kontrolowanego wątku.

- Brak podwójnych wiadomości: **niezweryfikowany**.
- Pauza, przejęcie i odmowa przed następną wiadomością: **niezweryfikowane**.
- Ograniczony i odwoływalny klucz (401): **niezweryfikowany w integracji**.
- Sprzątnięcie testu / odwołanie kluczy / brak aktywnej rutyny: **niezweryfikowane**.
- Decyzja właściciela / data / odnośniki do dowodów: **brak; kontakt z prawdziwymi kandydatami niedopuszczony**.

## Bramka testu kontrolnego przed kontaktem (MVP-40)

Domyślnie `outreach_live=false`, również po migracji istniejącej bazy.
Właściciel konfiguruje `OUTREACH_CONTROL_ALLOWLIST` jako adresy e-mail odbiorców
kontrolnych rozdzielone przecinkami (np. `kontrola@example.test`). Pusta lista
blokuje wszystkie zadania przed zaliczeniem testu. Porównanie adresu z pola
`applications.email` pomija wielkość liter i skrajne spacje; brak wildcardów.
Adres musi identyfikować kontrolowanego odbiorcę także w używanym kanale outreachu.
Zmiana konfiguracji wymaga ponownego uruchomienia procesu przez właściciela.

1. Utwórz zadanie kontrolne przez `POST /api/v1/tasks`, dodając
   `control_recipient: true` do zwykłego payloadu zadania. Adres kandydata musi
   znajdować się na allowliście. Sam znacznik nie wystarcza. Włącz również limity
   outreachu zgodnie z [opisem limitów](outreach-limits.md).
2. Wykonaj test na kontrolowanym odbiorcy: pełny przepływ, odmowa, pauza,
   przejęcie i brak duplikatów. Zachowaj raport z wynikami; nie zapisuj sukcesu,
   jeśli dowolny wymagany scenariusz zawiódł.
3. Zaloguj się do panelu jako rekruter i otwórz **Test kontrolny outreachu**.
   Podaj datę zaliczonego testu, identyfikator raportu, osobę wykonującą test
   oraz ponownie hasło rekrutera. Wybierz **Zapisz zaliczony test i odblokuj kontakt**.
4. Sprawdź status odblokowania i dane raportu w panelu. Zapis jest trwały,
   transakcyjny, idempotentny i tworzy zdarzenie `outreach_live_enabled`
   w `audit_events` z aktorem sesji, poprzednim i nowym stanem. Hasło nie jest
   zapisywane w audycie ani cache żądań. Raport stanowi oświadczenie właściciela;
   aplikacja nie ocenia automatycznie jego zawartości.

Panel korzysta z `GET/POST /api/v1/outreach-live`. POST wymaga sesji, hasła,
`Idempotency-Key` oraz `{outreach_live:true, control_test:{date,report_id,who}}`.
Klucze API, w tym `admin`, nie mogą odblokować bramki. Agent nie powinien
wykonywać tego kroku: zapis wyniku należy do właściciela. Po pięciu próbach
potwierdzenia hasła obowiązuje blokada na 15 minut.
Przed zaliczeniem testu claim zwykłego zadania zwraca HTTP 403 z kodem
`control_test_required`, bez rezerwacji i naliczenia limitu. Jeżeli kolejka
zawiera poprawne zadanie kontrolne, zostanie wybrane zamiast zwykłego.
Preflight i ponowienie claim ponownie sprawdzają bramkę oraz odbiorcę.

Weryfikacja lokalna: `node --experimental-sqlite --test tests/outreach-live.test.mjs`.
Poza sandboxem sprawdź panel w przeglądarce (telefon i desktop), komunikaty
błędu hasła, stan po odświeżeniu oraz rzeczywisty raport testu kontrolnego.
Nie wykonuj kontaktu z prawdziwymi kandydatami w ramach weryfikacji kodu.
