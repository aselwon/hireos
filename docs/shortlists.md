# Shortlista dla klienta (MVP-47)

W widoku briefu lub aplikacji przypisz najpierw klienta rekrutacji. W sekcji
„Shortlista dla klienta” wybierz kandydatów, pola oraz ważność linku (1–30 dni).
Domyślnie udostępniane jest tylko imię i nazwisko. E-mail i CV wymagają jawnego
zaznaczenia. CV jest przypinane do konkretnego pliku — późniejszy upload nie
rozszerza uprawnień starego linku. Skopiuj wygenerowany link; lista zarządzania
pokazuje terminy ważności i przyciski odwołania, bez tokenów.

Warunkiem jest zapis zgody `v3`, obejmującej zleceniodawcę, oraz brak sprzeciwu
(`do_not_contact`). Wersje starsze i nieznane są blokowane. Nie należy zmieniać
historycznej wersji zgody w bazie: potrzebne jest rzeczywiste udzielenie zgody.
Przed przekazaniem danych rekruter informuje kandydata o zleceniodawcy zgodnie
z klauzulą. Funkcja nie zastępuje przeglądu prawnego przed użyciem produkcyjnym.

## API

Zarządzanie wymaga sesji rekrutera lub klucza `admin`:

- `GET /api/v1/shortlists?briefId=...` — metadane linków rekrutacji.
- `POST /api/v1/shortlists` — JSON: `briefId`, `applicationIds` (1–100 unikalnych
  identyfikatorów), `expiresAt` (ISO, przyszłość do 30 dni), opcjonalnie `fields`
  (`name`, `email`; domyślnie `name`) oraz `cvApplicationIds` (podzbiór wybranych
  kandydatów). Odpowiedź: `id`, `path`, `expiresAt`.
- `POST /api/v1/shortlists/:id/revoke` — JSON `{}`; odwołanie linku.

Oba zapisy wymagają `Idempotency-Key` i są transakcyjne. Powtórzenie tego samego
żądania zwraca zapisaną odpowiedź, a inne dane pod tym samym kluczem są odrzucane.

Publiczny `GET /s/:token` zwraca stronę HTML; `GET /s/:token/cv/:id` udostępnia
wyłącznie jawnie dołączony plik. Token ma 256 bitów losowości. Nie daje sesji ani
uprawnień do panelu. Odczyty mają `Cache-Control: no-store`, `Referrer-Policy:
no-referrer` oraz zakaz indeksowania. Nieznany, wygasły lub odwołany link zwraca 404. Zmiana klienta, sprzeciw, utrata właściwej zgody lub usunięcie aplikacji
blokuje całą shortlistę. Kontrola jest wykonywana ponownie przy pobraniu CV.

Każdy odczyt, także odrzucony, tworzy osobny `audit_events` z akcją
`shortlist.opened`, czasem, identyfikatorem shortlisty (lub `unknown`), rodzajem
zasobu i wynikiem autoryzacji `granted`. Nie zapisujemy tokenu ani IP w audycie.
Pole `granted` opisuje uprawnienie, nie potwierdza pobrania całej odpowiedzi przez
klienta. Utworzenie i odwołanie również są audytowane.

Migracja `012-shortlists.sql` dodaje shortlisty, powiązania i osobny cache
idempotencji. Usunięcie aplikacji usuwa jej powiązanie, usunięcie CV zeruje
powiązanie pliku. Nie przechowujemy kopii danych kandydata. W tabeli shortlist
jest skrót tokenu; cache idempotencji zawiera odpowiedź z linkiem, więc baza i
backupy wymagają ochrony tak jak pozostałe dane poufne. Link jest uprawnieniem
na okaziciela: osoba, która go otrzyma, może go użyć do wygaśnięcia lub odwołania.
Właściciel powinien wyłączyć logowanie pełnych ścieżek `/s/` w reverse proxy;
konfiguracji produkcyjnej nie zmienia ten task.

## Weryfikacja ręczna

Po uruchomieniu lokalnym utwórz shortlistę syntetycznego kandydata ze zgodą v3,
otwórz link w prywatnym oknie i sprawdź domyślny brak e-maila oraz CV. Utwórz
drugą z e-mailem i CV, pobierz PDF, odwołaj link w panelu i sprawdź 404.
Sprawdź formularz klawiaturą i przy szerokościach 390 oraz 1280 px. CI uruchamia
syntetyczne testy HTTP, bazy, migracji i generowanego formularza, bez usług AI.
