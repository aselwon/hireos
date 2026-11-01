# HireOS — MVP rekrutacji IT

HireOS wspiera jednego rekrutera w prowadzeniu rekrutacji IT: od briefu stanowiska przez aplikację i analizę CV po decyzję człowieka. Zakres MVP i jego ograniczenia opisują [SPEC](SPEC.md) oraz [Definition of Done MVP](docs/mvp-dod.md).

Interfejs jest po polsku. Dane w repozytorium, testach i ewaluacji są syntetyczne. HireOS nie odrzuca kandydatów automatycznie; decyzję podejmuje rekruter.

## Uruchomienie lokalne

Wymagany jest Node.js `22.23.1` (wersja z `.nvmrc`). Zainstaluj zależności i przygotuj konfigurację jakości:

```sh
npm ci --ignore-scripts
npm run quality:prepare
```

Uruchom serwer:

```sh
npm start
```

Aplikacja działa pod adresem http://localhost:4310. Serwer nasłuchuje na `127.0.0.1`, a SQLite domyślnie zapisuje dane w `data/hireos.sqlite`. Ostrzeżenie Node o eksperymentalnym SQLite jest oczekiwane.

## Konfiguracja

Zmienne są opcjonalne, o ile nie zaznaczono inaczej. Nie umieszczaj wartości sekretów w repozytorium.

| Zmienna                        | Zastosowanie                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `PORT`                         | Port lokalnego serwera; domyślnie `4310`.                                       |
| `HIREOS_DATA_DIR`              | Katalog danych serwera.                                                         |
| `HIREOS_DB`                    | Ścieżka do bazy SQLite; nadpisuje domyślną lokalizację.                         |
| `HIREOS_RECRUITER_PASSWORD`    | Hasło rekrutera przy uruchomieniu serwera.                                      |
| `HIREOS_SECURE_COOKIE`         | Ustaw `1`, gdy sesja działa za HTTPS.                                           |
| `GITHUB_TOKEN`                 | Opcjonalny token do limitów publicznego API GitHub.                             |
| `MODEL_PROVIDER`               | Dostawca modeli; domyślnie `fake`. Produkcyjne wywołania wymagają `cloudflare`. |
| `CF_ACCOUNT_ID`, `CF_AI_TOKEN` | Wymagane dla Cloudflare Workers AI; token trzymaj poza repozytorium.            |
| `MODEL_DAILY_NEURON_CAP`       | Limit bramki AI na dobę; domyślnie `9000`.                                      |
| `NODE_ENV`, `CI`               | W `test` lub CI prawdziwy dostawca modeli jest wyłączony.                       |
| `RETENTION_DAYS`               | Okres retencji używany przez funkcje retencji.                                  |
| `HIREOS_BACKUP_DIR`            | Katalog kopii zapasowych; domyślna lokalizacja zależy od trybu uruchomienia.    |
| `HIREOS_BACKUP_RETENTION`      | Liczba zachowywanych kopii; domyślnie `14`.                                     |

Nie uruchamiaj lokalnego serwera jako publicznej usługi. Wdrożenie wymaga HTTPS, ochrony panelu rekrutera oraz skonfigurowanych kopii zapasowych. Instrukcje podglądu i operacji są w [dokumentacji VPS](docs/vps-preview.md).

## Zakres i ograniczenia

MVP obejmuje rekrutację IT dla jednego tenanta i jednego rekrutera. Zakres obejmuje brief IT, aplikacje z tekstowym PDF, profilowanie CV i raport screeningowy z dowodami, ręczne decyzje, opcjonalne wyszukiwanie profili przez publiczne API GitHub oraz API zadań wykonawcy outreachu. Skanowane CV bez warstwy tekstowej wymagają ręcznej weryfikacji. HireOS nie wysyła wiadomości do kandydatów.

Poza MVP są m.in. inne branże, wiele firm, SSO, integracje z portalami pracy, pocztą i kalendarzami, OCR oraz automatyczny kontakt. Przed użyciem z prawdziwymi kandydatami wymagane są decyzje właściciela dotyczące limitów outreachu, retencji i przeglądu prawnego. Szczegóły: [SPEC](SPEC.md) i [kryteria DoD](docs/mvp-dod.md).

## Kontrola jakości

```sh
npm run quality:check
npm run check
npm test
npm run ci
```

`npm run ci` uruchamia kontrole qoq, sprawdzenie składni i testy. Pipeline CI jest zdefiniowany w [`.github/workflows/quality.yml`](.github/workflows/quality.yml).

## Struktura

- `server.mjs` — lokalny serwer HTTP i konfiguracja.
- `lib/` — logika domenowa, SQLite, API i bramka modeli.
- `hireos/dist/` — statyczny interfejs aplikacji.
- `tests/` — testy jednostkowe i integracyjne.
- `eval/` — syntetyczne dane i ewaluacja parsera CV.
- `docs/` — dokumentacja MVP i operacyjna.
- `planning/` — kolejka bieżących zadań MVP; [stary backlog](planning/backlog.json) jest zarchiwizowany i poza zakresem.
