# Pierwsze wdrożenie produkcyjne — MVP-28

**Wdraża tylko właściciel.** Agent przygotowuje kod, testy i dokumentację;
harness oraz CI nie łączą się z VPS, nie restartują usług i nie wykonują deployu.
Poniższe czynności na VPS wykonuje ręcznie właściciel w oknie serwisowym.
To procedura, nie potwierdzenie wdrożenia ani zgoda na kontakt z kandydatami.

## Przed wdrożeniem

- [ ] Właściciel wybiera zatwierdzoną rewizję, sprawdza zielone CI i zapisuje ID
      poprzedniego release oraz konfigurację proxy/systemd do rollbacku.
- [ ] Właściciel potwierdza gotowość prawną i operacyjną przed prawdziwymi danymi.
      Outreach pozostaje wstrzymany do kontrolowanego testu i osobnej zgody.
- [ ] Właściciel przygotowuje Node zgodny dokładnie z `.nvmrc`, konto `hireos`,
      `/var/lib/hireos` jako `hireos:hireos`, tryb 0700, oraz bazę
      `/var/lib/hireos/preview.sqlite` należącą do `hireos`, bez dostępu grupy/innych.
      Baza i CV pozostają poza release. Przy pierwszym starcie pustą bazę SQLite
      tworzy właściciel jako użytkownik `hireos`; brak bazy zatrzymuje preflight.
- [ ] Właściciel przygotowuje `/etc/hireos/env` jako root:root 0600 w katalogu 0700.
      Używa lokalnego bezpiecznego edytora, bez sekretów w poleceniach i logach.
      Preflight uruchamia jako root, z zaufanym PATH wskazującym ten sam Node co
      `/usr/bin/node` w jednostce systemd. Nie używa `bash -x` ani `NODE_OPTIONS`.
- [ ] Plik env zawiera niepuste: `HIREOS_RECRUITER_PASSWORD` (12–1024 znaki),
      `MODEL_PROVIDER` (cloudflare), `MODEL_DAILY_NEURON_CAP` (1–9000),
      `CF_ACCOUNT_ID` (konto właściciela ze SPEC), `CF_AI_TOKEN`, `RETENTION_DAYS`
      (dodatnia liczba całkowita), `PRIVACY_CONTROLLER_NAME`,
      `PRIVACY_CONTROLLER_ADDRESS`, `PRIVACY_CONTROLLER_CONTACT` (dane administratora
      zatwierdzone przez właściciela; opcjonalnie `PRIVACY_DPO_CONTACT`). Token i hasło wprowadza wyłącznie właściciel.
      Weryfikuje darmowy model, brak overage i zakres tokenu bez wykonywania
      generacji w ramach tej checklisty.
- [ ] Env używa jednej pary `NAZWA=wartość` na linię, opcjonalnie pojedynczych
      lub podwójnych cudzysłowów wokół całej wartości. Bez `export`, duplikatów,
      backslashy, wieloliniowych wartości i komentarzy na końcu wartości.
      Preflight obsługuje ten ograniczony podzbiór EnvironmentFile; nie wykonuje
      `source`, ekspansji zmiennych ani poleceń. Nie nadpisujemy ścieżek i
      zabezpieczeń jednostki ani `HIREOS_PASSWORD_FILE` w tym wariancie wdrożenia.
- [ ] Właściciel wstrzymuje zapisy aplikacji/workera i wykonuje świeżą kopię bazy
      oraz CV przez `ops/backup.mjs backup` jako `hireos`, zgodnie z konfiguracją
      [jednostki backupu](../ops/hireos-backup.service). Baza ma wskazywać
      `preview.sqlite`, a katalog kopii `/var/backups/hireos`.
      Robi również próbę `ops/backup.mjs restore BACKUP_DIR EMPTY_TARGET_DIR`
      do osobnego katalogu i chroni odzyskane dane tak jak produkcyjne.
- [ ] Właściciel ma lokalnie pełny checkout wybranej rewizji, wraz z `ops`, `lib`
      i `.nvmrc`, poza katalogiem danych. Uruchamia z niego:

```sh
bash ops/preflight.sh
```

Kod 0 oznacza zaliczenie lokalnych kontroli, kod 1 — **wstrzymanie wdrożenia**.
Skrypt wypisuje wyłącznie stałe nazwy etapów, bez wartości env i wyjątków.
Sprawdza Node, konfigurację, właściciela i tryby danych, co najmniej 1 GiB wolnego
miejsca i trzykrotność rozmiaru głównego pliku bazy. Wymaga kompletnego katalogu
backupu z manifestem nie starszym niż 24 godziny, sprawdza integralność SQLite
oraz liczności tabel zapisane w manifeście. Nie porównuje treści ani liczby CV —
temu służy osobna próba odtworzenia. Manifest i zegar VPS muszą być wiarygodne.

Migracje wybranej rewizji wykonuje tylko na snapshotcie SQLite (API backup
uwzględnia WAL), w prywatnym `.preflight-*` pod katalogiem danych. Sprawdza
integralność i klucze obce kopii, usuwa ją również przy błędzie. Nie migruje
oryginału, nie restartuje usług i nie korzysta z sieci. Po przerwaniu przez
SIGKILL właściciel usuwa osierocony katalog tymczasowy po upewnieniu się, że
preflight już nie działa. `--root KATALOG` służy do izolowanych testów układu
`etc/` i `var/`; nie jest potwierdzeniem gotowości prawdziwego VPS.

## Kolejność przełączenia — tylko właściciel

1. Zaliczyć całą checklistę powyżej. Utrzymać blokadę zapisów podczas backupu
   końcowego, przełączenia i kontroli. Powtórzyć preflight po zmianie env lub kodu.
2. Przygotować konfigurację TLS/proxy i jednostkę według
   [paczki VPS](vps-preview.md), wykonać `nginx -t` w docelowym środowisku.
   Produkcja wymaga Cloudflare i retencji; historyczne zalecenie `fake` w paczce
   VPS dotyczy testów, nie obecnej walidacji produkcyjnej.
3. Właściciel uruchamia lokalnie na VPS `bash ops/deploy.sh --owner /opt/hireos deploy ID SOURCE`,
   gdzie SOURCE to zweryfikowany checkout, a ID to nowe unikatowe ID rewizji.
   **Ten skrypt restartuje usługę**; preflight tego nie robi. Zachować wskazany
   poprzedni release. Start aplikacji migruje właściwą bazę automatycznie.
4. Właściciel przełącza routing publiczny zgodnie z paczką VPS. Nie wystawia
   portów 4317/20172 do Internetu. Sprawdza checklistę poniżej przed otwarciem ruchu.
5. Skrypt deploy kopiuje tylko runtime, bez `ops`. Właściciel musi zapewnić
   osobną trwałą lokalizację `ops/backup.mjs` i dostosować `ExecStart` jednostki
   backupu; nie pozostawia domyślnego wskazania na nieistniejący `current/ops`.
   Sprawdza ręczne wykonanie backupu i harmonogram timera po przełączeniu.

## Po wdrożeniu — curl i kontrola ręczna

Wykonuje właściciel lokalnie na VPS i z zewnętrznego hosta, bez `-k`.
Polecenia GET nie wywołują modeli ani kontaktu. Dla każdej odpowiedzi sprawdzić
kod HTTP i treść, nie traktować samego uruchomienia curl jako zaliczenia.

```sh
curl --fail --silent --show-error http://127.0.0.1:4317/healthz
curl --fail --silent --show-error https://niezla.bieda.it/healthz
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://niezla.bieda.it/login
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://niezla.bieda.it/api/v1/briefs
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://niezla.bieda.it/seed.js
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://niezla.bieda.it/.env
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://niezla.bieda.it/lib/store.mjs
```

- [ ] Oba health: HTTP 200, `status: ok`, `revision` równe wybranemu ID;
      HTTPS ma ważny certyfikat. `/login`: 200; anonimowe briefy: 401;
      `/seed.js`, `/.env`, `/lib/store.mjs`: 404.
- [ ] Właściciel loguje się w przeglądarce bez zapisywania hasła w poleceniach;
      sesja ma HttpOnly i Secure, wylogowanie odbiera dostęp do panelu.
- [ ] Panel nie pokazuje seeda demo; istniejące briefy i aplikacje są zachowane.
      Na świeżej bazie lista jest pusta. Właściciel sprawdza publiczny formularz
      dla kontrolowanego briefu i syntetyczne CV, bez wysyłki do kandydatów.
- [ ] Usługa i timer backupu działają; po restarcie zachowane są baza oraz CV.
      Właściciel zapisuje czas, ID rewizji i wyniki, bez sekretów ani danych osób.
- [ ] Dopiero po tych kontrolach właściciel przywraca ruch. Błąd oznacza
      utrzymanie okna serwisowego i decyzję o rollbacku.

## Rollback — tylko właściciel

1. Wstrzymać ruch/zapisy/workera, zatrzymać usługę. Zachować wadliwy release,
   kopię aktualnych danych i logi bez sekretów do diagnozy; nie usuwać dowodów.
2. Jeśli schemat i dane są zgodne z poprzednim kodem, wybrać poprzedni release
   przez `bash ops/deploy.sh --owner /opt/hireos rollback PREVIOUS_ID`.
   Polecenie restartuje usługę i sprawdza lokalny health/revision.
3. Jeśli migracja zmieniła schemat, nie zakładać migracji wstecznej. Przy
   zatrzymanej usłudze odtworzyć **bazę i CV razem** z kopii sprzed przełączenia
   przez `ops/backup.mjs restore BACKUP_DIR EMPTY_TARGET_DIR`. Zachować obecny
   katalog danych, zastąpić go zweryfikowanym odtworzonym katalogiem, ustawić
   właściciela/tryby, uniknąć pozostawienia starego `-wal`/`-shm`, a dopiero potem
   uruchomić poprzedni release. Właściciel akceptuje utratę zapisów od backupu;
   nie scala ręcznie baz.
4. Przy pierwszym wdrożeniu bez poprzedniego release przywrócić zachowaną
   konfigurację routingu statycznego demonstratora zgodnie z
   [opisem wdrożenia](deployment.md), pozostawiając Node zatrzymany i dane
   produkcyjne zabezpieczone. Demo nie może przyjmować prawdziwych danych.
5. Powtórzyć odpowiednie kontrole HTTP, logowania i odtworzonych danych;
   potwierdzić poprzednią rewizję i backup. Nie otwierać ruchu przy niezgodności.

## Ograniczenia dowodu

Preflight nie sprawdza DNS/TLS, konfiguracji nginx/systemd, ważności tokenu,
pozostałego limitu Cloudflare ani działania zdalnego CI. Te kontrole i decyzję
GO/NO-GO wykonuje właściciel. Testy w repo uruchamiają skrypt na syntetycznych
katalogach tymczasowych, bez wdrażania; nie dowodzą gotowości konkretnego VPS.
