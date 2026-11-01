# Paczka wdrożeniowa VPS (MVP-21)

To instrukcja dla właściciela, nie raport wdrożenia. Harness nie uruchamia tych
poleceń na VPS, nie zmienia DNS, TLS, nginx ani usług. Historyczny statyczny
demonstrator nie potwierdza działania poniższej konfiguracji.

## Topologia i przygotowanie

HTTPS `https://niezla.bieda.it` → istniejący reverse proxy z certyfikatem TLS →
`hireos-public` na `127.0.0.1:20172` → Node na `127.0.0.1:4317`.
Właściciel zapewnia przekierowanie HTTP na HTTPS, poprawny certyfikat i Host
`niezla.bieda.it`. Porty 20172 i 4317 nie mogą być dostępne z Internetu.

[Konfiguracja nginx](../ops/hireos-public.conf) jest plikiem kontekstu `http`
(np. `/etc/nginx/conf.d/default.conf` w kontenerze). Właściciel zastępuje stary
kontener `hireos-public` konfiguracją **sieci hosta**, bez mapowania `-p` i bez
mountu statycznego `hireos/dist`. W sieci bridge adres 127.0.0.1 oznacza kontener,
nie hosta, więc ta konfiguracja tam nie zadziała. Mount read-only:
`/opt/hireos/public/default.conf:/etc/nginx/conf.d/default.conf`.
Przed przełączeniem właściciel wykonuje `nginx -t` w docelowym kontenerze,
zachowuje starą konfigurację i sprawdza routing istniejącego reverse proxy.
Nie należy uruchamiać dwóch listenerów na porcie 20172.

Node obsługuje `/api/v1`, `/apply/:id`, logowanie i panel. Panel oraz `/api/state`
wymagają sesji rekrutera; anonimowy klient i klucz workera nie otrzymują stanu.
Zalogowany panel potrzebuje `/api/state`, dlatego nie blokujemy tej ścieżki dla
sesji. Brak sesji zwraca 401 z odnośnikiem do `/login`. Publiczne zasoby formularza
to `/apply.js` i `/styles.css`. Worker nadal wymaga klucza `worker:outreach`.
Proxy zachowuje Authorization, Cookie i Idempotency-Key. Tylko dokładny Origin
`https://niezla.bieda.it` jest mapowany na lokalny Origin; obce wartości pozostają
do odrzucenia przez backend. Zmiana domeny wymaga zmiany server_name i mapy Origin.

Limity nginx: 10 żądań/s, burst 20; logowanie 5/min, burst 5; przekroczenie → 429.
Przy zewnętrznym proxy limit jest wspólny dla jego adresu — celowo nie ufamy
nagłówkom IP klienta. Backend dodatkowo ogranicza logowania. Limit body 11 MiB
pozwala na CV do 10 MiB z narzutem multipart; większe żądania → 413.

## Sekrety i trwałe dane

Właściciel przygotowuje konto systemowe `hireos`, Node **22.23.1** w
`/usr/bin/node`, katalog `/opt/hireos/releases` (root, odczyt dla usługi) oraz
`/var/lib/hireos` (hireos:hireos, 0700). Kod nie wymaga zależności runtime.
[Jednostka systemd](../ops/hireos-preview.service) używa
`/etc/hireos/env`: właściciel tworzy katalog 0700 i plik root:root 0600, poza repo.
Plik ma składnię EnvironmentFile systemd, bez `export`. Wartości wprowadza lokalnie
w bezpiecznym edytorze, nigdy w argumentach, logach, PR ani historii powłoki:

- `HIREOS_RECRUITER_PASSWORD`: unikatowe hasło 12–1024 znaki.
- `MODEL_PROVIDER=fake` na pierwszy test, bez połączenia z dostawcą.
- `MODEL_DAILY_NEURON_CAP=9000`: twardy limit; nigdy ponad darmowy przydział.
- `CF_ACCOUNT_ID=2791466c5820cfd886aad95e0d3ef948`.
- `CF_AI_TOKEN`: token ograniczony wyłącznie do Workers AI na tym koncie,
  bez uprawnień DNS, administracji kontem i innych zasobów. Tworzy go właściciel.
  Dopiero po sprawdzeniu darmowego modelu i limitów może ustawić
  `MODEL_PROVIDER=cloudflare`; nie włączać płatnego planu ani overage.

Jednostka ustawia `PORT=4317`, `HIREOS_SECURE_COOKIE=1`,
`HIREOS_DB=/var/lib/hireos/preview.sqlite`, `HIREOS_DATA_DIR=/var/lib/hireos`.
Nie nadpisuj ich w env. SQLite i CV (`/var/lib/hireos/cv`) pozostają poza release.
Istniejące CV trzeba przenieść z katalogu starego release przed zmianą dataDir.
Nie kopiuj prawdziwych danych do repo. Restart unieważnia sesje.

Właściciel instaluje jednostkę w `/etc/systemd/system/hireos-preview.service`
i wykonuje `systemctl daemon-reload`. Sekrety są czytane przez systemd, nie nginx.
Nie należy montować env ani katalogu danych do kontenera publicznego.

## Backup i odtworzenie (MVP-22)

Backup obejmuje spójny snapshot SQLite utworzony przez `node:sqlite` backup API,
katalog `/var/lib/hireos/cv` oraz manifest z licznością rekordów i plików. Jednostki
[backup service](../ops/hireos-backup.service) i [timer](../ops/hireos-backup.timer)
wykonują go codziennie z rotacją do 14 kopii. Katalog kopii domyślnie znajduje się
w `/var/lib/hireos/backups`; powinien pozostać w chronionym katalogu danych (0700).
Do kopii należy zapewnić dodatkową, odseparowaną kopię poza VPS.

Właściciel kopiuje oba pliki jednostek do `/etc/systemd/system/`, po czym uruchamia:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now hireos-backup.timer
sudo systemctl start hireos-backup.service
sudo systemctl status hireos-backup.service
sudo systemctl list-timers hireos-backup.timer
```

SQLite ma spójny snapshot, ale kopia CV nie jest atomowa względem bazy.
Dla wspólnego punktu odtworzenia bazy i CV właściciel zatrzymuje aplikację na czas
ręcznej kopii. Timer nie zatrzymuje aplikacji; jego kopie mogą zawierać CV z innej
chwili niż snapshot bazy. Sama zgodność liczności nie dowodzi spójności relacji.

Ręczny backup (jawne ścieżki, bez sekretów):

```sh
sudo -u hireos /usr/bin/node --experimental-sqlite \
  /opt/hireos/current/ops/backup.mjs backup --keep 14 \
  --db /var/lib/hireos/preview.sqlite --data-dir /var/lib/hireos
```

Skrypt odtwarzania przyjmuje wyłącznie pusty katalog danych i nieistniejący plik bazy. Właściciel najpierw
zatrzymuje aplikację i wybiera pustą lokalizację; następnie wskazuje kopię oraz
osobne ścieżki bazy i danych. Skrypt porównuje liczności wszystkich tabel oraz
CV po odtworzeniu i kończy się błędem, jeśli wartości się różnią. Po błędzie
nie uruchamiaj odtworzonej bazy; usuń tylko utworzony cel i ponów z poprawną kopią.
Rotacja obejmuje katalogi hireos z datą w nazwie; własne nazwy nie są rotowane.

```sh
sudo systemctl stop hireos-preview
sudo install -d -o hireos -g hireos -m 0700 /var/lib/hireos-restore
sudo -u hireos /usr/bin/node --experimental-sqlite \
  /opt/hireos/current/ops/backup.mjs restore \
  --from /var/lib/hireos/backups/hireos-YYYY-MM-DDTHH-MM-SS.mmmZ \
  --db /var/lib/hireos-restore/preview.sqlite \
  --data-dir /var/lib/hireos-restore
```

Po sprawdzeniu wyniku właściciel planuje przełączenie odtworzonej bazy i katalogu
CV, a następnie uruchamia usługę i wykonuje checklistę curl poniżej. Nie nadpisuj
działającej bazy w miejscu. Lokalny test `npm test` sprawdza backup i restore na
syntetycznej bazie oraz potwierdza odmowę odtworzenia do zajętego celu; nie sprawdza
działania timerów na VPS ani przechowywania kopii poza serwerem.

## Release i rollback — wyłącznie właściciel

Przed każdą zmianą: zielone CI, zapis SHA, kontrola migracji i spójna kopia
**całego** `/var/lib/hireos` przy zatrzymanej usłudze (baza, WAL/SHM i CV).
Właściciel przygotowuje lokalny checkout wybranego SHA, bez sekretów w runtime.
ID release powinno zawierać SHA. Skrypt nie pobiera kodu ani zależności, nie używa
SSH, nie zmienia nginx/systemd/env i nie jest wywoływany przez CI.

```sh
# Tylko na VPS, ręcznie przez właściciela po backupie:
bash ops/deploy.sh --owner /opt/hireos deploy r-SHA /sciezka/do/checkout
```

[Skrypt](../ops/deploy.sh) kopiuje wyłącznie runtime do nowego release, zapisuje
REVISION, atomowo przełącza symlink `current`, restartuje `hireos-preview` i
sprawdza `/login` na loopback. Blokada flock wyklucza równoległe operacje.
Istniejący release nie jest nadpisywany. Zachowaj wypisaną ścieżkę poprzedniego
release i backup. Błąd restartu lub probe daje niezerowy kod i pozostawia nowy
symlink do diagnozy; nie wykonuje automatycznego cofania migracji.

```sh
# Po sprawdzeniu zgodności bazy ze starszym kodem:
bash ops/deploy.sh --owner /opt/hireos rollback r-POPRZEDNI-SHA
```

Rollback atomowo wskazuje zachowany release, restartuje usługę i ponawia probe.
Jeśli migracje nie są zgodne wstecz, najpierw zatrzymaj usługę i odtwórz spójny
backup danych, a dopiero potem wykonaj rollback. Odtworzenie usuwa zapisy po
backupie — decyzję podejmuje właściciel. Pierwszy release nie ma poprzednika;
w razie awarii zatrzymaj usługę i przywróć zapisaną konfigurację demonstratora.
Rollback kodu nie cofa konfiguracji nginx, jednostki ani env.

Test lokalny: `node --experimental-sqlite --test tests/deployment.test.mjs`
tworzy dwa release w katalogu tymczasowym, przełącza A → B → A i sprawdza treść,
symlink oraz nienaruszone dane. Systemctl i curl są atrapami: test nie dowodzi
startu systemd ani poprawnego TLS na VPS.

## Lista kontrolna curl po wdrożeniu przez właściciela

Używaj syntetycznych danych, bez `-k`. Nie publikuj cookies ani kluczy.

```sh
base=https://niezla.bieda.it
curl -I http://niezla.bieda.it/                 # 301/308 do HTTPS
curl -i "$base/login"                        # 200, certyfikat poprawny
curl -i "$base/"                             # 401 bez sesji
curl -i "$base/api/state"                    # 401 bez sesji
curl -i "$base/api/v1/tasks"                 # 401 bez klucza
curl -i "$base/apply/synthetic-missing"       # 200, szkielet formularza
curl -i "$base/apply.js"                     # 200 JavaScript
curl -i "$base/styles.css"                   # 200 CSS
curl -i "$base/api/v1/public-briefs/missing"  # 404
curl -i "$base/.env"                         # 401/404, nigdy treść pliku
curl -i "$base/lib/store.mjs"                # 401/404
curl -i "$base/api/login" -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: origin-check' \
  --data '{}'                               # 403
curl -i "$base/api/login" -H "Origin: $base" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: login-check' \
  --data '{}'                               # 401 (Origin zaakceptowany, brak hasła)
```

- Zaloguj się przez `/login`; sprawdź Secure, HttpOnly, SameSite=Strict cookie,
  panel oraz `/api/state` → 200 wyłącznie z sesją. W DevTools „Copy as cURL”
  wykonaj żądanie lokalnie bez zapisywania sekretu w historii i bez udostępniania.
  Po wylogowaniu to samo żądanie stanu musi zwrócić 401.
- Z kluczem workera przechowywanym w prywatnym pliku konfiguracji curl 0600:
  `curl --config /bezpieczna/sciezka/worker.curl "$base/api/v1/tasks"` → 200;
  `/api/state` z tym samym kluczem → 401; po odwołaniu klucza tasks → 401.
- Na opublikowanym syntetycznym briefie wyślij PDF przez formularz, sprawdź 201
  i brak duplikatu przy powtórzeniu Idempotency-Key. Po zmianie release sprawdź
  dostępność CV i stanu z sesją. Żądanie większe niż 11 MiB musi dać 413.
- Kontrolowana seria żądań powyżej limitu nginx musi dać 429. Wykonuj poza
  normalną pracą, bo limit jest współdzielony przez proxy.
- Z zewnętrznej maszyny porty 4317 i 20172 muszą odrzucać połączenia.
  Właściciel sprawdza `ss -ltn`, status usługi i logi bez kopiowania danych osób.
- Powtórz checklistę po rollbacku, sprawdź REVISION i aktualny symlink.

Zielone lokalne CI nie zastępuje tych kontroli. Kontakt z prawdziwym kandydatem
pozostaje zablokowany do spełnienia MVP-23 i przeglądu właściciela.
