# API zadań outreach (MVP-14)

HireOS przechowuje zadania i raporty; nie wysyła wiadomości. Kandydat to rekord
`applications`, rekrutacja to `job_briefs`. Dane demonstracyjne panelu nie są
rekordami tego API.

Wszystkie mutacje wymagają JSON oraz `Idempotency-Key` (1–128 znaków).
Ponowienie tego samego żądania przez tego samego aktora zwraca zapisany wynik;
zmiana treści lub operacji przy tym samym kluczu daje 409. Nowa operacja wymaga
nowego klucza, także po pustym wyniku claim. Odpowiedzi zapisuje się atomowo ze
zmianą zadania w SQLite. Idempotencja przetrwa restart.

## Rekruter

Sesja rekrutera lub klucz `admin` pozwala na `POST /api/v1/tasks` (201):

```json
{
  "application_id": "id-aplikacji",
  "job_brief_id": "id-rekrutacji",
  "context": "Kontekst rozmowy zatwierdzony przez rekrutera",
  "contact_rules": "Zatwierdzone zasady kontaktu",
  "contact_rules_approved": true
}
```

Kandydat musi należeć do wskazanej rekrutacji. Kontekst ma maksymalnie 8000 znaków,
a zasady 4000. Serwer nadaje stabilne `task_id` i `message_id`.

## Wykonawca

Nagłówek `Authorization: Bearer …` musi zawierać klucz `worker:outreach`.
`worker_id` pochodzi z identyfikatora klucza API; opcjonalne pole żądania o tej
nazwie musi być z nim zgodne (inaczej 403).

- `POST /api/v1/tasks/claim`, treść `{}`: zwraca `{ "task": ... }` lub
  `{ "task": null }`, jeśli nie ma zadania. Rezerwacja trwa 60 sekund. Odpowiedź
  zawiera `worker_id`, `lease_until` (UTC), `lease_id` oraz kontekst i zasady.
- `POST /api/v1/tasks/:id/heartbeat`: wymaga `task_id`, `message_id`, `lease_id`
  z claim. Przedłuża aktywny lease o 60 sekund od czasu żądania.
- `POST /api/v1/tasks/:id/result`: wymaga tych samych identyfikatorów oraz
  `result` (`sent`, `replied`, `needs_intervention`, `failed`, `unresolved`) i
  niepustego `message` (maks. 4000 znaków). Zapisuje próbę i kończy rezerwację.
  Każdy wynik jest końcowy dla tego zadania; dalszy kontakt wymaga nowego zadania.
- `GET /api/v1/tasks`: wykonawca widzi tylko przypisane mu zadania, rekruter wszystkie.
- `GET /api/v1/tasks/:id`: zadanie i historia `attempts`. Cudze oraz nieprzypisane
  zadania są niewidoczne dla wykonawcy (404). Tworzenie przez wykonawcę i rezerwacja
  przez rekrutera są zabronione (403).

Wygasłe rezerwacje wracają do kolejki atomowo podczas następnego claim.
`message_id` pozostaje ten sam, `lease_id` zmienia się. Nieaktywny lease lub
niezgodne identyfikatory dają 409, a utrata własności 404, również przy ponowieniu
starego żądania. Powtórzony heartbeat nie przedłuża lease ponownie; odpowiedź
idempotentna jest historyczna, więc wykonawca musi sprawdzić `lease_until`.

Idempotencja raportu nie zapewnia jednokrotnej wysyłki w zewnętrznym systemie.
Wykonawca musi deduplikować kontakt po stabilnym `message_id`. Niepewny wynik
należy zgłosić jako `unresolved` przed wygaśnięciem lease. API nie wznawia samo
zadań z raportowanym wynikiem. Pauza, przejęcie i stop po odmowie oraz pełny test
kontaktu są osobnymi zadaniami MVP; to API samo nie wystarcza do uruchomienia
kontaktu z prawdziwymi osobami.
