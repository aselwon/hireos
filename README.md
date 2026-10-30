# HireOS

Platforma operacyjna rekrutacji dla wielu firm i wszystkich branż w Polsce/UE. Astra 6 prowadzi architekturę i implementację; Antigravity wykonał katalog branż i checklisty integracji, zweryfikowane przez Astrę.

**Stan: działający prototyp, plan produkcyjny i backlog. Nie jest to autonomiczna agencja produkcyjna.** Operacje HR docelowo automatyzuje trwały workflow; decyzje o odrzuceniu i zatrudnieniu wymagają znaczącego nadzoru człowieka.

[Otwórz publiczny demonstrator HTTPS](https://niezla.bieda.it/)

Publiczny adres jest statycznym demonstratorem `hireos/dist` i zapisuje dane w `localStorage` przeglądarki. Prywatny Node/SQLite pozostaje dostępny przez tunnel `127.0.0.1:4317`. Endpoint health sygnalizuje brak implementacji worker API (`workerApi: "not-implemented"`, `outreachEnabled: false`); nie ma działającego API worker, klucza ani rutyny outreachu. Auth API jest pracą przyszłą, a publiczny routing demo nie dowodzi ukończenia integracji.

## Uruchomienie lokalne

Wymagany jest Node.js `22.23.1` (wersja zapisana w `.nvmrc`). Zainstaluj zależności z lockfile:

```sh
npm ci --ignore-scripts
```

Następnie przygotuj konfigurację jakości i uruchom aplikację:

```sh
npm run quality:prepare
npm start
```

Otwórz http://localhost:4310. Serwer nasłuchuje tylko na 127.0.0.1; SQLite zapisuje dane w ignorowanym `data/hireos.sqlite`. Można ustawić `PORT` i `HIREOS_DB`. Ostrzeżenie Node o eksperymentalnym SQLite jest oczekiwane. Nie wystawiaj tego serwera jako publicznego SaaS — nie ma logowania ani izolacji wielu klientów.

```sh
npm test
npm run check
```

## Jakość i CI

Skrypty jakościowe działają w następujący sposób:

- `npm run quality:prepare` przygotowuje konfigurację QoQ.
- `npm run quality:check` uruchamia kontrole QoQ bez modyfikowania plików.
- `npm run quality:fix` stosuje automatyczne poprawki formatowania.
- `npm run ci` uruchamia bramkę jakości, sprawdzenie składni i testy.

Pełna kolejność weryfikacji CI to `npm ci --ignore-scripts`, `npm run quality:prepare`, a następnie `npm run ci`. Jest zdefiniowana w [`.github/workflows/quality.yml`](.github/workflows/quality.yml) i działa dla pull requestów, pushy do `main` oraz ręcznego uruchomienia. Po podpięciu remote status uruchomień jest dostępny w zakładce Actions repozytorium GitHub.

## Co działa

- 8 widoków: przegląd, rekrutacje, kandydaci, agenci, rozmowy, integracje, dziennik i design system.
- Tworzenie szkicu rekrutacji, wyszukiwanie i filtrowanie kandydatów.
- Przegląd materiałów i ręczna zmiana sąsiedniego etapu z uzasadnieniem.
- Uruchomienie deterministycznej checklisty lub szablonu rozmowy, pauza/wznowienie kolejki.
- Dziennik zmian i eksport JSON; transakcje i idempotencja lokalnego API.
- Lokalna trwałość SQLite; wersja hostowana używa localStorage danej przeglądarki.

## Co jest zaplanowane

Auth/SSO, tenant isolation, rzeczywiste modele AI, sourcing przez portale, parsing CV, poczta, kalendarze, rozmowy live, sandbox kodu, ATS/HRIS, podpisy, retencja i skala produkcyjna. Karty integracji pokazują wymagania, nie pozorują działających połączeń. Wszystkie osoby i firmy są fikcyjne. Nie wprowadzaj danych rzeczywistych do prototypu.

Linear: [status synchronizacji](planning/linear-sync-status.json). Lokalne klucze HOS nie są identyfikatorami issue w Linear.

## Dokumentacja projektu

- [Propozycja Definition of Done](docs/definition-of-done.md)
- [Prywatny podgląd na VPS, logi i operacje](docs/vps-preview.md)
- [Publikacja demonstracyjna i ograniczenia](docs/deployment.md)

- [Plan produktu, etapy, mierniki i hipoteza skali](docs/product-plan.md)
- [System design i model domenowy](docs/system-design.md)
- [Design system](docs/design-system.md)
- [Playbooki 8 branż](docs/industry-playbooks.md)
- [Checklisty integracji](docs/integration-checklist.md)
- [Podział pracy agentów](docs/agent-orchestration.md)
- [Backlog: 8 epików i 36 zadań](planning/backlog.json)
- [Wyniki weryfikacji](docs/verification.md)
- [Publikacja i ograniczenia hostowanego demo](docs/deployment.md)

## Struktura

`server.mjs` — lokalny HTTP/API. `lib/store.mjs` — transakcyjny store SQLite i reguły workflow. `hireos/dist/` — statyczny frontend i syntetyczne dane. `tests/` — reguły, retry i trwałość. `scripts/make-preview.mjs` — samowystarczalny artefakt HTML dla T3. `docs/` — projekt produkcyjny. `planning/` — backlog.
