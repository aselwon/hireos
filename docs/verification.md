# Weryfikacja HireOS

## Historyczna weryfikacja prototypu — 30.10.2026

- `npm test`: 5/5 testów PASS. Retry mutacji nie duplikuje danych; konflikt idempotency key odrzucany; zmiana etapu wymaga uzasadnienia i sąsiedniego stanu; pauza blokuje zadania; zablokowana integracja nie przechodzi do completed; zapis i idempotencja przetrwały ponowne otwarcie SQLite; niepoprawne dane nie tworzą zdarzeń.
- `npm run check`: PASS — składnia serwera, store i UI.
- Render HTML: 1440 px i 728 px, bez błędów konsoli. Nie jest to pełny audyt WCAG.
- Interakcje przeglądarkowe na samowystarczalnym artefakcie tego samego UI: utworzenie rekrutacji, wyszukiwanie, zmiana etapu, pauza/wznowienie, wykonanie szablonu i dialog wymagań integracji — PASS.
- Publikacja Sites: status succeeded, prywatny dostęp właściciela. Wersja hostowana używa localStorage, nie lokalnego SQLite.
- HTTP/API na tymczasowej bazie: strona i stan 200, utworzenie szkicu 200, ponowienie tego samego żądania nie dubluje szkicu, obcy Origin 403, nieznana ścieżka 404. Serwer testowy zatrzymany.
- Backlog: 8 unikalnych epików, 36 unikalnych zadań, wszystkie zależności istnieją, graf bez cykli.

Nie zweryfikowano produkcyjnej izolacji tenantów, realnych integracji, wywołań modeli, wysyłki poczty, rozmów audio ani zadeklarowanej skali. To są zadania backlogu, nie funkcje tego prototypu. Dane wyłącznie fikcyjne.

## MVP-23 — raport kontrolowanego testu z Grok Botem

**Status: NIE WYKONANO — oczekuje na właściciela.** Przygotowano scenariusz;
nie potwierdzono integracji ani dostarczenia wiadomości. Historyczne wyniki
powyżej i lokalne testy API nie zaliczają tego testu E2E.

**Zakaz kontaktu z prawdziwą osobą w ramach rekrutacji przed zaliczeniem całego
MVP-23 na kontrolowanym odbiorcy (koncie testowym właściciela).** Do tego czasu
rutyna produkcyjna pozostaje wyłączona. Brak dowodu, wynik negatywny lub pominięty
krok oznacza brak zaliczenia. Zaliczenie nie zastępuje przeglądu prawnego ani
zatwierdzenia zasad kontaktu przez właściciela.

### Przygotowanie przez właściciela

- [ ] Potwierdź gotowość MVP-16, MVP-17 i MVP-21: dostęp przez HTTPS, uwierzytelnienie,
      API z leasingiem i blokadami. Wdrożenie i konfigurację wykonuje właściciel.
- [ ] Użyj odizolowanej kolejki z syntetyczną rekrutacją i aplikacjami testowymi.
      Jedynym dozwolonym odbiorcą jest kontrolowane konto właściciela; sprawdź
      przypisanie aplikacji do dokładnego konta i wątku po stronie Grok Bota.
      Nie importuj prawdziwych kandydatów. Nie obchodź ograniczeń platformy.
- [ ] Zatwierdź nadawcę, treści, okno testu, limit wiadomości i follow-upów oraz
      sposób awaryjnego zatrzymania rutyny. Każda zamierzona wiadomość ma osobne
      zadanie; automatyczne follow-upy poza scenariuszem są wyłączone.
- [ ] Właściciel loguje się do zdalnej przeglądarki. Hasła, cookies, nagłówki
      Authorization i tokeny nie trafiają do raportu, logów ani repozytorium.
- [ ] Utwórz dedykowany klucz `worker:outreach` według CLI w
      [instrukcji uwierzytelniania](../scripts/api-key.mjs), na tej samej bazie co
      testowany serwer. Przekaż go prywatnie wykonawcy; nie przekazuj klucza admin.
      Zapisz tylko identyfikator klucza. Po teście odwołaj klucz przez
      `api-key.mjs revoke <id>` (Node z obsługą SQLite, właściwe `HIREOS_DB`).
- [ ] Ustal interwał rutyny i czas obserwacji: co najmniej dwa pełne cykle rutyny
      oraz ponad 60 sekund lease; zapisz rzeczywiste czasy UTC. Brak kolejnego
      wykonanego cyklu nie dowodzi zablokowania wysyłki.
- [ ] Zapewnij sterowanie testem z innego urządzenia. Wyłącz MacBook całkowicie
      przed pierwszym claimem i pozostaw wyłączony do końca. Zapisz czas wyłączenia
      i dowody wykonania rutyny na serwerze Grok Bota w tym przedziale.

### Konwencje wykonania i dowodów

Stosuj [Worker API](worker-api.md) oraz [warunki kanału](linkedin-outreach.md).
Wszystkie ścieżki poniżej są względne wobec testowego HTTPS. POST wymaga JSON
oraz `Idempotency-Key`: ten sam klucz i identyczna treść dla retry tej samej
operacji, nowy klucz dla nowej operacji (również kolejnego pustego claimu).
Próby zakresu wykonuj bez cookies sesji rekrutera, aby sesja nie maskowała klucza.

Rekruter tworzy `POST /api/v1/tasks` z `application_id`, `job_brief_id`,
`context`, `contact_rules`, `contact_rules_approved: true` (201). W kontekście
umieść syntetyczny znacznik przebiegu i zamierzonej wiadomości. Grok Bot używa
`POST /api/v1/tasks/claim` z `{}` (200), a przed wysyłką sprawdza aktualny lease
oraz `GET /api/v1/tasks/:id/preflight` (200, `allowed: true`). Sam preflight
nie sprawdza ważności lease. Heartbeat z aktualnymi `task_id`, `message_id`,
`lease_id` przedłuża lease o 60 sekund; historyczna odpowiedź retry nie zapewnia
aktualnej rezerwacji. Brak odpowiedzi API oznacza zakaz wysyłki.

Raport `POST /api/v1/tasks/:id/result` zawiera te trzy identyfikatory, `result`
i niepusty opis `message`. `GET /api/v1/tasks/:id` dostarcza stan i `attempts`.
W każdej próbie zapisz: identyfikator przebiegu, zadania, wiadomości i lease,
czas UTC kontroli/wysyłki/raportu, kod HTTP i stan, liczbę wiadomości przed/po
oraz odnośnik do zanonimizowanego dowodu z właściwego wątku. Zapis API bez dowodu
u odbiorcy nie potwierdza dostarczenia ani braku duplikatów. Nie dodawaj danych
osobowych do repozytorium; surowe dowody przechowuje właściciel prywatnie.

### Scenariusze (wykonuje właściciel z Grok Botem)

| ID  | Czynności                                                                                                                                                                                                                                                                                                                  | Oczekiwany wynik i dowód                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Przy wyłączonym MacBooku utwórz zadanie, powtórz utworzenie z tym samym kluczem. Bot wykonuje claim, powtarza ten sam claim, sprawdza lease i preflight, wysyła jedną wiadomość i zgłasza `sent`. Powtórz identyczny raport.                                                                                               | Jeden `task_id` i `message_id`, identyczne odpowiedzi retry, jedna próba `sent` w historii i dokładnie jedna wiadomość w kontrolowanym wątku. Kolejne cykle nie wysyłają ponownie. Dowody UTC potwierdzają wykonanie bez MacBooka.                                                     |
| S2  | Dla nowego zadania zasymuluj niepewne potwierdzenie po faktycznej wysyłce, zachowując dostęp do API. Bot raportuje `unresolved` w aktywnym lease. Wykonaj kolejne claimy z nowymi kluczami i obserwuj cykle. Właściciel sprawdza wątek, bot raportuje `verified_sent` z opisem dowodu i identyfikatorami ostatniego lease. | Stan `unresolved` nie daje zadania do claimu; brak ponownej wysyłki. Po weryfikacji stan `sent`, historia obu raportów, w wątku nadal jedna wiadomość.                                                                                                                                 |
| S3  | Osobne zadanie: kontrolowanie zatrzymaj próbę przed wysyłką i zgłoś `unresolved`. Po sprawdzeniu dowodów niewysłania zgłoś `verified_not_sent`. Następnie nowy claim, preflight i jedna wysyłka.                                                                                                                           | Przed decyzją brak automatycznego retry. Po decyzji `queued`, ten sam `message_id`, nowy `lease_id`; łącznie dokładnie jedna wiadomość. Sam brak widocznej wiadomości nie wystarcza jako dowód niewysłania.                                                                            |
| S4  | Po claimie, przed ostatnim preflight, rekruter wywołuje `POST /api/v1/applications/:applicationId/outreach-control` z `{"paused":true}`. Bot próbuje kontynuować. Powtórz osobno dla pauzy rekrutacji przez `POST /api/v1/briefs/:jobId/outreach-control`.                                                                 | Odpowiednio `conversation_paused` i `recruitment_paused`, `allowed:false`; świeży raport `sent` daje 409, nowe claimy nie pobierają zablokowanych zadań. Zero nowych wiadomości przez pełne okno obserwacji. Wznów wyłącznie kontrolę ustawioną w danej próbie po jej udokumentowaniu. |
| S5  | Na osobnej aplikacji zarezerwuj zadanie, ustaw `{"human_takeover":true}` przez kontrolę aplikacji i pozwól rutynie wykonać kolejne cykle.                                                                                                                                                                                  | `human_takeover`, `allowed:false`, brak nowej wiadomości, wynik z nowym kluczem daje 409, claim nie pobiera zadania. Przejęcie pozostaje aktywne do świadomej decyzji właściciela.                                                                                                     |
| S6  | Na osobnej aplikacji przygotuj zadanie kolejnej wiadomości i wykonaj claim. Przed wysyłką odpowiedz z kontrolowanego konta jednoznaczną odmową. Bot ma ją odczytać, przerwać kontakt i zgłosić `refused` w aktywnym lease; jeśli nie zdąży, zatrzymaj rutynę i oznacz próbę jako niezaliczoną.                             | Raport 200, stan `refused`; preflight `do_not_contact`, nowe zadanie dla tej aplikacji daje 409, oczekujące zadania nie trafiają do claimu. Zero wiadomości po odmowie również po kolejnych cyklach. Nie raportuj odmowy na zamkniętym zadaniu `sent`: API wymaga aktywnego lease.     |
| S7  | Powtórz próbę pauzy między ostatnim udanym preflight a rozpoczęciem wysyłki, używając kontrolowanego zatrzymania rutyny. Osobno zasymuluj brak odpowiedzi preflight.                                                                                                                                                       | Zapisz moment pauzy, ostatniej kontroli i rozpoczęcia wysyłki. Brak API blokuje wysyłkę. Jeśli pauza poprzedza rozpoczęcie, a wiadomość mimo to wychodzi, test niezaliczony. Wysyłka rozpoczęta wcześniej nie jest cofana; API i LinkedIn nie tworzą atomowej transakcji.              |
| S8  | Po wysyłce zasymuluj przerwę rutyny przed raportem; pozwól lease wygasnąć i ponownie pobierz zadanie.                                                                                                                                                                                                                      | Stały `message_id`, nowy `lease_id`. Bot sprawdza trwały rejestr wysyłek i wątek przed działaniem, nie wysyła drugi raz. Niepewny stan raportuje jako `unresolved` w nowym aktywnym lease. W wątku pozostaje jedna wiadomość; sam leasing nie zapewnia deduplikacji zewnętrznej.       |
| S9  | Kluczem workera sprawdź własne zadanie (200), cudze/nieprzypisane (404), `POST /api/v1/tasks` (403), `POST /api/v1/applications/:applicationId/outreach-control` (403) i `POST /api/v1/briefs` (403). Odwołaj klucz na bazie serwera, następnie tym samym tokenem wykonaj GET zadania oraz POST claim.                     | Po odwołaniu oba żądania dają 401, także ponowienie wcześniej udanego claimu z tym samym kluczem idempotencji. Bot zatrzymuje się i nie wysyła. Zapisz kody, identyfikator klucza i czas odwołania, nigdy token.                                                                       |

W S4–S6 sprawdź również zadanie oczekujące dla tej samej aplikacji, aby brak
claimu nie wynikał jedynie z aktywnego lease. Nie używaj aplikacji z odmową
w kolejnych próbach. Nie usuwaj `do_not_contact`, aby uzyskać zielony wynik.
Jeśli bot nie umożliwia kontrolowanego zatrzymania lub symulacji awarii, oznacz
odpowiedni scenariusz jako niewykonany, zamiast zastępować go testem handlera.

### Wynik do uzupełnienia po wykonaniu

- Data i przedział UTC: **nie wykonano**.
- Właściciel wykonujący / identyfikator przebiegu: **do uzupełnienia**.
- Wersja HireOS (SHA), wersja/konfiguracja rutyny, środowisko HTTPS: **do uzupełnienia**.
- Pseudonimy konta i aplikacji, identyfikator klucza, limity i interwał: **do uzupełnienia**.
- Wyłączenie MacBooka / ponowne włączenie / dowód serwerowego wykonania: **do uzupełnienia**.

| Scenariusz                    | Wynik        | Dowody, czasy UTC, oczekiwana/rzeczywista liczba wiadomości, odchylenia |
| ----------------------------- | ------------ | ----------------------------------------------------------------------- |
| S1 — wysyłka i retry          | NIE WYKONANO | —                                                                       |
| S2 — unresolved / wysłano     | NIE WYKONANO | —                                                                       |
| S3 — unresolved / nie wysłano | NIE WYKONANO | —                                                                       |
| S4 — pauzy                    | NIE WYKONANO | —                                                                       |
| S5 — przejęcie                | NIE WYKONANO | —                                                                       |
| S6 — odmowa                   | NIE WYKONANO | —                                                                       |
| S7 — wyścig i brak API        | NIE WYKONANO | —                                                                       |
| S8 — wygaśnięcie lease        | NIE WYKONANO | —                                                                       |
| S9 — zakres i odwołanie       | NIE WYKONANO | —                                                                       |

Wynik końcowy: **NIE ZALICZONO — brak wykonania i dowodów E2E**.
Właściciel wpisuje dla każdego scenariusza ZALICZONO / NIE ZALICZONO / NIE
WYKONANO i dowody. Dopiero komplet zaliczonych scenariuszy pozwala zmienić wynik
końcowy. Powtórki zachowują historię poprzednich niepowodzeń.

Po teście wyłącz rutynę, odwołaj klucz, wstrzymaj testową rekrutację i sprawdź
brak dalszych wiadomości przez uzgodnione okno. Zapisz czas i wynik sprzątania.
Przy duplikacie, wysyłce mimo blokady lub kontakcie poza kontem testowym zatrzymaj
rutynę natychmiast, odwołaj klucz i przekaż właścicielowi dowody do wyjaśnienia.
Nie uruchamiaj rutyny produkcyjnej automatycznie po teście.
