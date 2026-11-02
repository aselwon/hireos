# Kontrakt Worker API (MVP-17)

HireOS przechowuje zatwierdzone zadania i raporty prób; nie wykonuje ani nie
wysyła wiadomości. Endpointy wymagają `Authorization: Bearer <klucz>`. Rekruter
używa sesji lub klucza `admin`; wykonawca używa klucza `worker:outreach`.
Wykonawca widzi tylko zadania przypisane jego kluczowi. Kluczy nie należy umieszczać
w logach, kodzie ani przykładach rzeczywistego użycia.

Wszystkie POST-y wymagają `Content-Type: application/json` i
`Idempotency-Key` o długości 1–128 znaków. Powtórzenie tego samego żądania przez
tego samego aktora z tym samym kluczem zwraca zapisany wynik. Inna treść lub
operacja używająca tego klucza zwraca 409. Nowa operacja, w tym następny claim po
odpowiedzi `{ "task": null }`, wymaga nowego klucza. Zapis żądania, odpowiedzi i
zmiany zadania jest atomowy i trwały po restarcie.

## Tworzenie zadania przez rekrutera

`POST /api/v1/tasks` zwraca 201. Kandydat musi należeć do wskazanej rekrutacji;
kontakt wymaga zatwierdzonych zasad.

```sh
curl -X POST "$HIREOS_URL/api/v1/tasks" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: create-demo-1' \
  -d '{"application_id":"app-demo","job_brief_id":"job-demo","context":"Rozmowa o roli Node.js.","contact_rules":"Jedna wiadomość, bez follow-upów.","contact_rules_approved":true}'
```

Odpowiedź zawiera `task` z nadanymi `task_id`, `message_id` i stanem `queued`.
Kontekst ma limit 8000 znaków, zasady 4000. Kandydat z aktywną odmową kontaktu
nie może otrzymać nowego zadania (409).

Każde zadanie zawiera `opt_out_url` oraz `message_footer`. Executor musi dołączyć
stopkę do każdej wysyłanej wiadomości. Link jest publiczny i jednorazowy; jego
otwarcie pod `GET /opt-out/:token` ustawia `do_not_contact`, anuluje zadania w
stanach `queued`, `leased` i `unresolved`, a strona pokazuje wyłącznie
potwierdzenie. Adres bazowy linku ustawia `HIREOS_PUBLIC_URL` (np.
`https://hireos.example`); bez konfiguracji używany jest lokalny adres serwera.

## Claim, kontrola i wysłanie

Wykonawca pobiera pracę przez `POST /api/v1/tasks/claim` z treścią `{}`. Claim
zwraca `{ "task": null }`, gdy kolejka jest pusta, wstrzymana lub zablokowana.
W przeciwnym razie zadanie ma stan `leased`, `worker_id`, `lease_until` w UTC i
losowy `lease_id`. Lease trwa 60 sekund.

```sh
curl -X POST "$HIREOS_URL/api/v1/tasks/claim" \
  -H "Authorization: Bearer $WORKER_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: claim-demo-1' -d '{}'
```

Przed każdą próbą wysyłki wykonawca sprawdza `GET /api/v1/tasks/:id/preflight`.
Wysyła wyłącznie przy `allowed: true`. Niepowodzenie lub brak odpowiedzi oznacza,
że nie wolno wysyłać.

```sh
curl "$HIREOS_URL/api/v1/tasks/TASK_ID/preflight" \
  -H "Authorization: Bearer $WORKER_KEY"
```

Odpowiedź ma postać `{"allowed":true,"reason":null}` lub `allowed:false` z
powodem: `do_not_contact`, `recruitment_paused`, `conversation_paused`,
`human_takeover` albo `refused`. Rekruter może ustawić pauzę rekrutacji przez
`POST /api/v1/briefs/:jobId/outreach-control` z `{"paused":true|false}`; pauzę
rozmowy lub przejęcie przez człowieka przez
`POST /api/v1/applications/:applicationId/outreach-control` z polami
`paused` i/lub `human_takeover` (wartości logiczne). Oba endpointy wymagają
rekruterskiej sesji lub `admin` i zwracają `{"ok":true}`.

Po udanej kontroli wykonawca wykonuje wysyłkę w swoim systemie, deduplikując po
stabilnym `message_id`, a następnie raportuje próbę przez
`POST /api/v1/tasks/:id/result`. Każdy raport wymaga `task_id`, `message_id`,
`lease_id`, pola `result` i niepustego opisu `message` (maks. 4000 znaków).

```sh
curl -X POST "$HIREOS_URL/api/v1/tasks/TASK_ID/result" \
  -H "Authorization: Bearer $WORKER_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: result-demo-1' \
  -d '{"task_id":"TASK_ID","message_id":"MESSAGE_ID","lease_id":"LEASE_ID","result":"sent","message":"Wysłano i potwierdzono w docelowym wątku."}'
```

Wyniki to `sent`, `replied`, `needs_intervention`, `failed`, `unresolved` i
`refused`. `refused` zapisuje `do_not_contact` dla kandydata i blokuje następne
claimy oraz nowe zadania. Wynik kończy lease; dalszy kontakt wymaga osobnego
zadania. Raport idempotentny nie gwarantuje jednokrotnego działania w systemie
zewnętrznym — za deduplikację wysyłki odpowiada wykonawca.

## Lease i ponowienia

`POST /api/v1/tasks/:id/heartbeat` przyjmuje `task_id`, `message_id` i `lease_id`
z claimu oraz przedłuża aktywny lease o 60 sekund od czasu żądania. Nie wysyłaj,
jeśli lease wygasł. Ponowiony heartbeat z tym samym kluczem zwraca historyczną
odpowiedź; sprawdź w niej `lease_until`.

Wygasły lease wraca do kolejki podczas następnego claimu. `message_id` pozostaje
stały, ale nowy lease ma inne `lease_id`. Stary właściciel traci dostęp. Nie
ponawiaj wysyłki po timeoutie ani po niejednoznacznym wyniku: zgłoś `unresolved`
przed wygaśnięciem lease.

Zadanie w stanie `unresolved` nie trafia do kolejki. Po ręcznym sprawdzeniu
właściwego wątku wykonawca może zgłosić na tym samym endpointcie wyniku
`verified_not_sent` albo `verified_sent` wraz z opisem weryfikacji. Pierwszy
wynik zwraca zadanie do `queued`; drugi zamyka je jako `sent`. Nie wolno
automatycznie retry ani uznać samego braku widocznej wiadomości za dowód
niewysłania.

## Odczyt i stany

- `GET /api/v1/tasks` zwraca listę `tasks`; rekruter widzi wszystkie, wykonawca
  tylko przypisane do jego klucza.
- `GET /api/v1/tasks/:id` zwraca `task` oraz `attempts` z wynikiem, opisem i czasem.
- `GET /api/v1/tasks/:id/preflight` zwraca `allowed` i `reason`.

Stany: `queued` (czeka na claim), `leased` (przypisane do aktywnego lease),
`unresolved` (oczekuje na ręczne rozstrzygnięcie), `sent`, `replied`,
`needs_intervention`, `failed`, `refused` oraz `cancelled`. W tym API nie ma
endpointu anulowania. Odpowiedzi z zewnętrznego systemu raportuj jako `replied`;
wymagają dalszego działania kieruj przez `needs_intervention`.

## Błędy HTTP

- `400` — brak lub niepoprawny JSON, `Idempotency-Key` albo pola raportu.
- `401` — brak, błędny lub odwołany klucz.
- `403` — niewłaściwy zakres, niezgodny `worker_id`, niedozwolony Origin/Host.
- `404` — brak zadania lub zadanie niewidoczne dla tego wykonawcy.
- `409` — użycie klucza idempotencji dla innego żądania, niezgodne identyfikatory
  lease, nieaktywny lease albo blokada preflight.
- `415` — brak `application/json` dla POST.

Błąd zwraca JSON `{"error":"..."}`. Po 401/403 nie ponawiaj operacji z tym
samym nieważnym uwierzytelnieniem. Po 409 pobierz aktualny stan i wykonaj
preflight; nie wysyłaj ponownie w ciemno. Po błędzie sieciowym claimu użyj
idempotentnego ponowienia z tym samym kluczem. Po niepewnym wyniku wysyłki
zgłoś `unresolved`, nie ponawiaj kontaktu. Brak API albo preflight oznacza
wstrzymanie wysyłki.

Testy kontraktowe handlera HTTP znajdują się w `tests/outreach.test.mjs`. API
nasłuchuje lokalnie; publiczny HTTPS i integracja z wykonawcą wymagają osobnej
konfiguracji i kontrolowanego testu E2E.
