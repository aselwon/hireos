# Limity outreachu (MVP-38)

Administrator odczytuje ustawienia przez `GET /api/v1/outreach-settings`.
`POST /api/v1/outreach-settings` zastępuje pełną konfigurację. Wymaga sesji
rekrutera lub klucza `admin`, JSON i nagłówka `Idempotency-Key`.

Przykład konfiguracji (wartości ustala właściciel):

```json
{
  "daily_global": 10,
  "daily_per_recruitment": 5,
  "recruitment_limits": {},
  "max_followups": 1,
  "min_interval_seconds": 86400,
  "start_hour": 9,
  "end_hour": 17
}
```

`recruitment_limits` jest mapą identyfikatorów rekrutacji na ich indywidualne
limity dzienne. Bez wpisu obowiązuje `daily_per_recruitment`. Wartość 0 limitu
globalnego lub limitu danej rekrutacji wyłącza wszystkie jej claimy, również
follow-upy. Domyślnie oba limity dzienne i liczba follow-upów wynoszą 0.

Dzień i godziny liczone są w `Europe/Warsaw`, z uwzględnieniem czasu letniego.
Początek przedziału jest włączony, koniec wyłączony. Godziny są całkowite:
początek 0–23, koniec 0–24; muszą się różnić. Przedział 22–6 przechodzi
przez północ, a 0–24 obejmuje całą dobę.

Claim rezerwuje budżet transakcyjnie, zanim wykonawca zgłosi wynik. Nowy kontakt
to pierwsze zarezerwowane zadanie dla aplikacji kandydata. Kolejne zadania tej
aplikacji są follow-upami. Różne aplikacje tej samej osoby liczone są osobno.
Ponowienie tego samego zadania nie dodaje follow-upu; ponowny claim pierwszej
wiadomości w innym dniu wymaga miejsca w dziennym budżecie tego dnia.

Minimalny odstęp dotyczy kolejnych zadań tej samej aplikacji i jest liczony
od ostatniej rezerwacji lub zgłoszenia wyniku poprzedniej wiadomości.
Wyniki niepewne i nieudane nie zwalniają budżetu: nie są dowodem braku kontaktu.
Weryfikacja i ponowienie tego samego zadania zachowują jego tożsamość.
Istniejąca historia zadań jest uwzględniana przez migrację; konfiguracja po
migracji pozostaje wyłączona.

Przekroczenie ograniczenia dla pierwszego dostępnego zadania zwraca HTTP 429
z polskim opisem i polem `code`:

- `outreach_disabled`
- `daily_global_limit`
- `daily_recruitment_limit`
- `followup_limit`
- `message_interval`
- `outside_sending_hours`

Zablokowane zadanie pozostaje w kolejce. Pusta kolejka zwraca `task: null`.
Ponowienia udanego żądania z tym samym kluczem idempotencji odtwarzają odpowiedź;
nowa próba claimu wymaga nowego klucza. Limity obowiązują przy przydziale zadania,
nie unieważniają już przyznanej rezerwacji ani nie sterują zewnętrznym wykonawcą.
Wykonawca nadal musi sprawdzić preflight przed kontaktem.

Każdy skuteczny zapis ustawień tworzy `outreach_limits_updated` w `audit_events`
z aktorem, czasem oraz konfiguracją przed zmianą i po zmianie. Powtórzenie
identycznego żądania nie dodaje wpisu. Zapis konfiguracji, audytu i odpowiedzi
idempotentnej jest jedną transakcją.
