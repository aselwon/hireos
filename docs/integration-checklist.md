# Checklisty integracji

Szkic Antigravity, po przeglądzie Astry 6. Żadne połączenie produkcyjne nie zostało uruchomione. Nazwy funkcji opisują oczekiwany zakres do potwierdzenia; dostępność, ceny, scope, webhooki, partnerstwa i sandboxy wymagają sprawdzenia w aktualnej dokumentacji i umowie dostawcy.

## Każdy adapter

- [ ] Potwierdzić dostępne API/feed, uprawnienia do danych, umowę, limity i konto testowe.
- [ ] Zdefiniować minimalne operacje i OAuth scopes; nie żądać odczytu całej skrzynki, jeśli wystarczy wysyłka.
- [ ] Dla OAuth: state, PKCE gdzie wspierane/wymagane, allowlist redirect URI, kontrola tenant binding, odświeżanie i odwołanie tokenów.
- [ ] Sekrety w secret manager, bez logowania tokenów; rotacja, audit dostępu i usuwanie po rozłączeniu.
- [ ] Webhook autoryzowany mechanizmem dostawcy (podpis/OIDC/inny udokumentowany mechanizm). Nie zakładać HMAC i timestamp dla każdego API.
- [ ] Trwale zapisać inbox przed odpowiedzią 2xx. Unikalny identyfikator zdarzenia w Postgres; cache nie jest źródłem prawdy.
- [ ] Replay, out-of-order events, wygasłe subskrypcje, paginacja, reconciliation, retry z jitter i Retry-After, dead-letter queue.
- [ ] Nie ponawiać ślepo wysyłki po timeout, gdy jej rezultat jest nieznany. Przetestować deduplikację i ustalenie stanu u dostawcy.
- [ ] Mapa pól, pochodzenie danych, retencja, usuwanie, region i podwykonawcy; test wycieku między tenantami.
- [ ] Testy na danych syntetycznych, kill switch per tenant i connector, metryki błędów/latencji bez PII.

## Kanały pozyskiwania

| Dostawca         | Oczekiwany zakres                       | Co potwierdzić przed kodowaniem                                                      |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| Własny formularz | Aplikacja, pliki, informacja o procesie | Antyspam, skanowanie, dostępność, limity uploadu, retencja                           |
| LinkedIn         | Publikacja i przepływy Talent Solutions | Właściwy program partnerski i produkt; dostępność operacji dla konta; bez scrapingu  |
| Pracuj.pl        | Ogłoszenia i aplikacje                  | Umowny zakres API/feed, opiekun integracji, słowniki i przekazanie aplikacji         |
| OLX Praca        | Ogłoszenia i kontakt                    | Zakres API dla kategorii Praca, warunki konta, dostępność webhooków lub pollingu     |
| Indeed           | Publikacja/Apply                        | Aktualny program integracji, format feedu/API, autoryzacja i wymagania zatwierdzenia |
| Just Join IT     | Ogłoszenia IT                           | Partnerskie API/feed, widełki, lokalizacja, redirect/aplikacje                       |
| No Fluff Jobs    | Ogłoszenia                              | Dostępny kanał ATS/feed, wymagane pola, umowa i raporty                              |

Brak dostępu oznacza zablokowany adapter lub uzgodniony import, nigdy obchodzenie ograniczeń. Dostępność konkretnego API nie została w tym projekcie zweryfikowana.

## Poczta i kalendarz

- [ ] Gmail: dobrać scopes do funkcji; klasyfikację sensitive/restricted i ewentualny audyt ustalić z aktualną dokumentacją. Nie zakładać, że każdy zakres wysyłki wymaga CASA.
- [ ] Microsoft 365: konto testowe, delegowane/aplikacyjne uprawnienia, zakres skrzynek i zgoda administratora jeśli wymagana.
- [ ] Poczta: potwierdzenia, threading, suppression list, bounce, opt-out, limity, SPF/DKIM/DMARC i brak wysyłki bez polityki komunikacji.
- [ ] Calendar/Outlook: free-busy z minimalnym zakresem, brak treści prywatnych spotkań, strefy IANA, DST, dwa równoczesne rezerwowania, odwołanie i wygasłe subskrypcje.
- [ ] Synchronizacja po awarii i cofnięciu OAuth; błąd integracji nie kończy aplikacji kandydata.

## Rozmowy i zadania

- [ ] Meet/Teams/Zoom: wymagany plan konta, tworzenie linku, dostęp gościa, poczekalnia, aktualizacja i anulowanie.
- [ ] Nagrania/transkrypcje: informacja, właściwa podstawa, odrębne sterowanie nagrywaniem, retencja, dostęp i usunięcie; opcja bez nagrania.
- [ ] LiveKit/własne audio: region, jakość, opóźnienie, przerwanie, ludzki kontakt i awaria modelu.
- [ ] GitHub: tylko repozytorium wskazane przez kandydata lub zadanie; minimalny scope.
- [ ] Sandbox: izolacja, brak sekretów/sieci domyślnie, limity zasobów, timeout, cleanup i audyt uruchomienia.

## ATS, HRIS, podpisy i zarządzanie produktem

- [ ] Wybrać jeden ATS pilota z Greenhouse, Lever, Workable, eRecruiter, Traffit lub HRlink po potwierdzeniu konta i API.
- [ ] Ustalić system źródłowy dla każdego pola, mapę etapów i reguły konfliktów. Decyzja pozostaje decyzją zatwierdzającego, nie skutkiem synchronizacji.
- [ ] HRIS (np. Personio): przekazać wyłącznie zatwierdzone zatrudnienie i niezbędny zakres danych.
- [ ] Autenti/DocuSign/Adobe Sign: potwierdzić rodzaj podpisu i wymaganą formę prawną dokumentu, tożsamość podpisującego, webhook, dowód podpisu i archiwum. API nie przesądza prawnej skuteczności konkretnej umowy.
- [ ] Linear: dedykowany projekt, epiki, zależności, uprawnienia, idempotentny import. Bez CV i danych kandydatów w issue trackerze.
