# Bramka modeli (MVP-04)

`lib/model-gateway.mjs` jest wspólnym wejściem do generowania. Domyślny provider
`fake` daje deterministyczny wynik bez sieci. Nie generuje prawdziwego ogłoszenia
ani oceny kandydata. Nie ma fallbacku do innych dostawców.

## Konfiguracja

- `MODEL_PROVIDER`: `fake` (domyślnie) albo `cloudflare`.
- `CF_ACCOUNT_ID`: dla Cloudflare wyłącznie `2791466c5820cfd886aad95e0d3ef948`.
- `CF_AI_TOKEN`: przekazywany przez środowisko procesu, nigdy w repo ani logach.
- `MODEL_DAILY_NEURON_CAP`: całkowita liczba 1–9000, domyślnie 9000.
  Nie można skonfigurować wykorzystania całych darmowych 10 000 neuronów.
- `CI` lub `NODE_ENV=test` zabraniają konfiguracji prawdziwego dostawcy.

Zamknięta lista w `lib/model-providers.mjs` zawiera
`@cf/meta/llama-3.1-8b-instruct`: 4119 neuronów na milion tokenów wejściowych
oraz 34868 na milion tokenów wyjściowych. Nowy model wymaga zmiany kodu,
sprawdzenia darmowej dostępności i testów; klient nie może podać własnej stawki.
Przed włączeniem Cloudflare właściciel musi potwierdzić aktualność stawek
oraz dostępność modelu bez płatnego rozliczania. W sandboxie nie wykonano
weryfikacji sieciowej ani zmian konta.

## API

`POST /api/generate`, `Content-Type: application/json`, wymagany nagłówek
`Idempotency-Key` (1–128 znaków). Przykładowe syntetyczne body:

```json
{
  "prompt": "Przygotuj szkic ogłoszenia dla demonstracyjnego zespołu Node.js",
  "maxTokens": 256,
  "purpose": "advertisement"
}
```

Opcjonalne `model` wskazuje model z listy. `maxTokens` mieści się w 1–2048,
a prompt ma najwyżej 12 000 bajtów UTF-8. Odpowiedź 200 zawiera `text`, `model`,
`provider`, `estimatedNeurons`. Wyczerpany budżet lub błąd dostawcy zwracają 503;
zły model lub parametry 400; konflikt klucza idempotencji 409.
Endpoint zachowuje ograniczenia lokalnego prototypu (loopback, Host i Origin).
Nie wdraża uwierzytelniania z osobnego zadania MVP.

## Budżet i trwałość

Migracja 003 rozszerza `model_calls` i dodaje `model_gateway_blocks`.
Transakcja `BEGIN IMMEDIATE` sprawdza limit i rezerwuje koszt przed wywołaniem
REST. Szacunek wejścia to liczba bajtów UTF-8 plus 256 tokenów na szablon rozmowy;
wyjście to cały `maxTokens`. Koszt zaokrąglany jest w górę do pełnych neuronów.
Nie zwalniamy rezerwacji nawet po błędzie, bo dostawca mógł już wykonać pracę.
`input_tokens` i `output_tokens` przechowują raport dostawcy, jeżeli jest poprawny,
albo szacunek (`tokens_estimated=1`). `actual_neurons` pozostaje NULL: nie udajemy,
że raport tokenów jest pomiarem neuronów.

Reset następuje o 00:00 UTC. Trwające rezerwacje obciążają również następną dobę,
a wywołanie ukończone po północy obciąża obie doby. Nieznany wynik po awarii
procesu pozostaje `reserved` i wymaga ręcznego wyjaśnienia; nie wysyłamy go ponownie.
Zakończony wynik można odczytać tym samym kluczem także po wyczerpaniu limitu.
Klucz jest trwały, a fingerprint nie przechowuje promptu. Wynik generowania
jest przechowywany w bazie i wymaga takiej samej ochrony jak inne dane aplikacji.

Każdy błąd Cloudflare (również timeout, niepoprawny JSON i HTTP 429) blokuje
bramkę do resetu. Takie zachowanie celowo ogranicza dostępność na rzecz ochrony
budżetu. Przekroczenie rezerwacji w raporcie tokenów także blokuje dalsze wywołania.
Brak automatycznych ponowień, przekierowań i przełączania dostawcy.

Limit jest lokalny dla wspólnej bazy HireOS. Inne aplikacje na tym samym koncie
Cloudflare zużywają wspólny przydział poza tą ewidencją. Gwarancja 0 zł wymaga
pozostawienia konta bez płatnego nadmiaru i niewykorzystywania przydziału poza
bramką; sam szacunek tokenów nie jest kontrolą rozliczeń konta.

## Weryfikacja

`npm run ci` sprawdza migrację istniejącej bazy, limit i reset UTC, trwałość blokady,
współbieżność, idempotencję, kontrakt REST oraz handler HTTP 200/503.
Testy używają fake lub wstrzykniętego transportu z odpowiedziami fixture.
`tests/fixtures/workers-ai-limit.json` jest syntetyczną odpowiedzią limitu,
nie zapisem z konta właściciela. Test fake i test HTTP blokują globalny `fetch`.

Poza sandboxem uruchomić lokalnie serwer z providerem `fake` i limitem 2,
wysłać dwa żądania z `maxTokens=1` i różnymi kluczami: oczekiwane 200, potem 503;
ponowienie pierwszego klucza ma zwrócić 200. Sandbox nie pozwala otwierać portów.
Harness powinien dodatkowo potwierdzić zielony workflow GitHub.
