# AGENTS.md — HireOS

Instrukcje dla agentów (planista i wykonawcy) pracujących w tym repozytorium w harnessie na VPS.

## Projekt w skrócie

HireOS to narzędzie rekrutacyjne. Obecnie jest klikalnym prototypem z danymi fikcyjnymi. Aktualny cel to **MVP rekrutacji IT dla jednego zespołu (single tenant)**, opisany w [`SPEC.md`](SPEC.md). Mierzalne kryteria ukończenia są w [`docs/mvp-dod.md`](docs/mvp-dod.md), a kolejka zadań w [`planning/tasks.json`](planning/tasks.json).

- Backend: czysty Node.js ESM (`server.mjs`), magazyn `node:sqlite` (`lib/store.mjs`), bez frameworka.
- Frontend: statyczne pliki w `hireos/dist/` (`app.js`, `index.html`, `styles.css`, `seed.js`).
- Jakość: [qoq](https://github.com/ladamczyk-it/qoq) (ESLint, Prettier, Knip, JSCPD), testy `node:test`, CI w `.github/workflows/quality.yml`.
- Skille agentów: `.agents/skills/` (tstack: `full-stop`, `babysit-pr`, `file-pr`, `qoq`, `impeccable` i inne). Opis w [`docs/tstack-skills.md`](docs/tstack-skills.md).
- Stary backlog (`planning/backlog.json`, 36 zadań, wszystkie branże, multi-tenant) jest **zarchiwizowany** i poza zakresem MVP. Nie bierz z niego zadań.

## Uruchamianie, testy, lint

Wymagany Node.js z `.nvmrc` (`22.23.1`).

```sh
npm ci --ignore-scripts     # instalacja z lockfile
npm run quality:prepare     # przygotowanie konfiguracji qoq (raz po instalacji)
npm start                   # http://localhost:4310, dane w data/hireos.sqlite
npm test                    # testy node:test
npm run check               # kontrola składni
npm run quality:check       # qoq bez modyfikacji plików
npm run quality:fix         # automatyczne poprawki formatowania
npm run ci                  # pełna bramka: quality:check + check + test (to samo co CI)
```

Zweryfikowano lokalnie 2026-10-30 (Node 22.23.1): `npm run ci` przechodzi — qoq bez błędów, `check` OK, testy 5/5.

Nowe pliki Markdown w `docs/` oraz JSON w `planning/` i katalogu głównym podlegają Prettierowi z qoq. Po edycji uruchom `npm run quality:fix`, a potem `npm run ci`.

## Agenci kodujący i koszty

- Agenci kodujący działają **wyłącznie w ramach subskrypcji ChatGPT (Codex)** właściciela. Nigdy nie używaj pay-per-token API do pracy agentowej.
- Agentom nie wolno dodawać ani wywoływać płatnych API ani kupować kredytów. Jeśli zadanie wydaje się tego wymagać, zatrzymaj się i eskaluj do `planning/blocked.md`.

## Zasady kodowania

- Małe, samodzielne zmiany: jedno zadanie z `planning/tasks.json` = jedna gałąź = jeden PR do `main`.
- Gałąź: `task/<id>-<krótki-opis>`, np. `task/MVP-03-it-brief-api`.
- Każda zmiana zachowania ma test. Logika domenowa w `lib/`, HTTP w `server.mjs` (lub rozbity router w `lib/http/`).
- Bez nowych frameworków i ciężkich zależności bez uzasadnienia w opisie PR. Preferuj wbudowane moduły Node.
- Zmiany schematu bazy wyłącznie przez wersjonowane migracje z testem migracji na istniejącej bazie.
- Wszystkie operacje z efektem ubocznym (zapis, zadania, wysyłki) muszą być idempotentne (`Idempotency-Key`) i transakcyjne.
- Wywołania modeli AI tylko przez wspólną bramkę modeli (zadanie MVP-04). Jedyny prawdziwy dostawca to **Cloudflare Workers AI na koncie właściciela `2791466c5820cfd886aad95e0d3ef948`**, wyłącznie w darmowym dziennym przydziale (10 000 neuronów/dobę, reset 00:00 UTC) z twardym stopem w bramce. W testach i CI wyłącznie deterministyczny fake provider lub nagrane odpowiedzi.
- Tekst interfejsu i dokumentacja po polsku, identyfikatory w kodzie po angielsku.
- Dane w repo, testach i fixture'ach wyłącznie syntetyczne. Żadnych prawdziwych CV ani danych osobowych.
- Brak automatycznego odrzucania kandydatów. Decyzję zawsze podejmuje człowiek.
- Zadanie kończy się dopiero, gdy spełnione są jego `acceptance` i `npm run ci` jest zielone (skill `full-stop`). Do pilnowania CI używaj `babysit-pr`.

## Czego agentom nie wolno

- Commitować, wypisywać w logach ani wklejać do PR sekretów (`.env*`, klucze API, tokeny, hasła). `.env*` jest w `.gitignore` i tak ma zostać.
- Wdrażać na produkcję ani zmieniać VPS (`marek172.mikrus.xyz`), DNS, nginx, systemd ani kontenerów. Agent przygotowuje skrypt i instrukcję, wdrożenie wykonuje człowiek.
- Wysyłać wiadomości do prawdziwych osób (LinkedIn, e-mail, SMS, GitHub). Outreach do kandydatów robi wyłącznie zewnętrzny wykonawca (Grok Bot) po zatwierdzeniu przez właściciela. DoD przed pierwszym kontaktem z prawdziwą osobą: pełny test przepływu na kontrolowanym odbiorcy (MVP-23) zaliczony, stop po odmowie, pauzie i przejęciu, kontrola duplikatów (brak podwójnych wiadomości) oraz klucz API wykonawcy z ograniczonym zakresem i możliwością odwołania. Harness nie wdraża HireOS na produkcję — wdrożenie wykonuje właściciel.
- Dodawać do kodu ani wywoływać jakichkolwiek płatnych API (OpenAI, Anthropic, Google i inne pay-per-token), kupować kredytów, włączać płatnych planów ani płatnego nadmiaru (overage). Dotyczy to też modeli Workers AI wymagających płatnej metody rozliczeń.
- Przekraczać darmowego dziennego przydziału Workers AI. Po osiągnięciu limitu bramka ma zatrzymać wywołania do resetu, nigdy przełączać na płatny tryb ani innego dostawcę.
- Mergować własnych PR, force-pushować do `main`, wyłączać kontroli CI ani obniżać progów jakości lub ewaluacji, żeby test przeszedł.
- Scrapować LinkedIn ani omijać regulaminów portali. Sourcing tylko przez publiczne API GitHub, bez kontaktu.

## Eskalacja

- Po **3 nieudanych próbach CI** dla tego samego zadania przestań. Dopisz wpis do [`planning/blocked.md`](planning/blocked.md): id zadania, gałąź/PR, co próbowano, ostatni błąd (bez sekretów), hipoteza i pytanie do człowieka. Ustaw `status: "blocked"` w `planning/tasks.json`.
- Wykonawca (`worker`) przy blokadzie projektowej (niejasna specyfikacja, konflikt wymagań, potrzeba zmiany schematu poza zadaniem) oddaje zadanie planiście (`planner`), zanim zacznie zgadywać.
- Decyzje prawne (RODO, AI Act), koszty, wdrożenia i kontakt z ludźmi zawsze eskaluj do właściciela.
