# Migracje SQLite MVP

`openStore()` uruchamia migracje automatycznie przed odczytem lub zapisem stanu.
Wymagany jest Node.js z `.nvmrc`; nie są potrzebne dodatkowe zależności.

- `001-demo.sql` obejmuje istniejące tabele `workspace` i `requests`. Zachowuje
  stan demo oraz odpowiedzi zapisane pod kluczami idempotencji.
- `002-mvp.sql` tworzy 13 tabel MVP, ich klucze obce, ograniczenia oraz indeksy.
  Tabele MVP są początkowo puste. Fikcyjny stan demo nadal działa w `workspace`;
  nie jest konwertowany na aplikacje kandydatów.
- `schema_migrations` zapisuje numer, nazwę i czas zastosowania migracji w UTC.
  Cały zestaw oczekujących migracji i wpisy historii są jedną transakcją
  `BEGIN IMMEDIATE`. Błąd wycofuje cały zestaw. Ponowne uruchomienie pomija
  zastosowane wersje. Nieznana lub nieciągła historia zatrzymuje otwarcie bazy.

Klucze obce są włączane dla każdego połączenia używającego `migrate()`.
Nowe połączenia otwierane bezpośrednio przez `DatabaseSync` również muszą włączyć
`PRAGMA foreign_keys=ON`. Usuwanie rekordów nadrzędnych z zależnościami jest
blokowane; migracja nie wprowadza kaskadowego usuwania danych.

Brief i wymagania są powiązane z aplikacją, a aplikacja z plikami CV, profilami,
faktami, decyzjami i zadaniami outreachu. Raport wskazuje profil; szczegóły oceny
wymagań i cytaty mieszczą się w `report_json`. Pola JSON mają kontrolę poprawności
składni; ich strukturę i reguły biznesowe będą walidować kolejne zadania MVP.
Klucze API mają wyłącznie pole skrótu `key_hash`. `model_calls` przechowuje
szacowane i rzeczywiste zużycie neuronów oraz czas UTC do rozliczania doby.
Sam schemat nie wykonuje wywołań modeli ani nie implementuje limitera.

Pola `idempotency_key` zabezpieczają unikalność operacji w nowych tabelach.
Porównywanie treści powtórzonych żądań oraz atomowy zapis operacji i audytu należy
wdrożyć w odpowiednich usługach/API. Demo nadal korzysta z tabeli `requests`.

Kolejne zmiany schematu należy dodawać jako nowe pliki SQL z kolejnym numerem
w `lib/migrations/` oraz dopisywać do listy w `lib/migrations.mjs`. Nie należy
edytować już zastosowanych migracji ani umieszczać w SQL własnych transakcji.
Przed ręcznym wdrożeniem należy wykonać kopię bazy. Nie ma migracji wstecznych;
cofnięcie zmiany wymaga odtworzenia kopii zgodnej z poprzednią wersją aplikacji.

Weryfikacja lokalna: `npm run ci`. Testy migracji obejmują pustą i istniejącą bazę,
ponowne otwarcie, zachowanie danych i idempotencji demo, ograniczenia schematu,
nieobsługiwaną historię oraz wycofanie nieudanej migracji.
