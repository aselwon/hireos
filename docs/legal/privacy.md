# Klauzula informacyjna — projekt do przeglądu prawnego

Publiczny dokument `/privacy/v2` powstaje z wersjonowanego szablonu
`lib/legal/privacy.mjs`. `/privacy/v1` zachowuje historyczną, niepełną treść;
nowe aplikacje wymagają v2. Nie poprawiaj historycznej wersji przy kolejnej
zmianie treści: dodaj nową wersję, zachowaj poprzednią stronę i zmień wersję
formularza. Wersja w zapisanych aplikacjach pozostaje bez zmian.

Konfiguracja administratora (bez przykładowych danych produkcyjnych):

- `PRIVACY_CONTROLLER_NAME` — nazwa administratora.
- `PRIVACY_CONTROLLER_ADDRESS` — adres administratora.
- `PRIVACY_CONTROLLER_CONTACT` — kontakt do realizacji praw osoby.
- `PRIVACY_DPO_CONTACT` — kontakt do IOD, jeśli został powołany.
- `RETENTION_DAYS` — dodatnia liczba całkowita, domyślnie 90 dni.

Przy `NODE_ENV=production` brak lub pusta wartość dowolnego z trzech pól
administratora blokuje formularz, publiczny brief i zapis aplikacji (HTTP 503).
IOD jest opcjonalny. Lokalnie dokument wskazuje brakujące dane wprost.
Wartości są kodowane jako tekst HTML. Przed zmianą konfiguracji zachowaj
kopię opublikowanej klauzuli: konfiguracja jest odczytywana przy starcie,
a historyczne wartości administratora nie są archiwizowane przez aplikację.

`consent_version` i `consent_at` przechowują wersję i czas złożenia aplikacji.
`future_recruitment_consent` przechowuje osobną zgodę (domyślnie 0, również
po migracji starych rekordów). Checkbox jest opcjonalny i domyślnie odznaczony.
Zmiana zgody przy ponowieniu tego samego klucza idempotencji jest konfliktem.
Formularz ze starą wersją wymaga odświeżenia (HTTP 409).

Po zamknięciu rekrutacji dane aplikacji bez zgody na przyszłe rekrutacje są
anonimizowane po `RETENTION_DAYS`. Dane ze zgodą są anonimizowane po tym samym
okresie liczonym od jej udzielenia. CV, profile, raporty i treści zadań outreach
są usuwane, a uzasadnienia decyzji zastępowane adnotacją retencji. Harmonogram
działa codziennie; każdy przebieg zapisuje w audycie wyłącznie liczbę aplikacji,
plików CV, zadań outreach i wartość okresu. Kopie zapasowe nadal mogą zawierać
wcześniej usunięte dane.

Właściciel i specjalista muszą przed użyciem z prawdziwymi kandydatami potwierdzić
podstawy prawne, dane zleceniodawcy, odbiorców i warunki transferu poza EOG oraz
okresy i wykonanie retencji. Projekt klauzuli nie stanowi potwierdzenia zgodności
prawnej.
