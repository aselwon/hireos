# Prywatny podgląd HireOS na VPS

## Publiczny demonstrator HTTPS

Aktualny adres publiczny to <https://niezla.bieda.it/>. Jest to statyczny demonstrator `hireos/dist`, który zapisuje dane wyłącznie w `localStorage` przeglądarki. Prywatny Node/SQLite pozostaje dostępny tylko przez tunel `127.0.0.1:4317` opisany poniżej; publiczny routing nie udostępnia prywatnego API.

Na VPS wdrożono kontener `hireos-public` z obrazu `nginx:1.28-alpine`, digest `sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236`. Mapowanie to `20172:8080`; mounty read-only to `/opt/hireos/current/hireos/dist:/usr/share/nginx/html` oraz `/opt/hireos/public/default.conf:/etc/nginx/conf.d/default.conf`. Konfiguracja źródłowa znajduje się w [`ops/hireos-public.conf`](../ops/hireos-public.conf).

Endpoint `GET /hireos-api/health` ma zwracać JSON z `workerApi: "not-implemented"` i `outreachEnabled: false`. Worker API, klucz, rutyna outreachu i auth API nie są działające ani ukończone; publiczny routing demo nie dowodzi ukończenia integracji. `/api/state` jest prywatnym endpointem (403), a `/hireos-api/v1/tasks` pozostaje niedostępny (503).

N8n zatrzymano, ale nie usunięto. Backup rollbacku jest root-only w `/root/hireos-backup-before-public/` (`n8n-inspect.json` i `n8n-data.tar.gz`); jego zawartości nie należy czytać. Procedura awaryjna: `docker stop hireos-public`, następnie `docker start n8n` — bez kasowania danych. Auth API jest pracą przyszłą.

### Weryfikacja publiczna

Weryfikacja 2026-10-30 dla https://niezla.bieda.it: root 200 z tytułem HireOS, app.js/seed.js/styles.css 200, health 200, prywatne /api/state 403, niegotowe /hireos-api/v1/tasks 503, /.env i /lib/store.mjs 404. TLS sprawdzono przez curl bez -k; health potwierdzono również z VPS po IPv4 i IPv6. Wcześniejszy raport CYTR.US dotyczył literówki w nazwie domeny i nie opisywał tej instalacji.

Serwer: `marek172.mikrus.xyz`, SSH port `10172`. Usługa `hireos-preview` działa jako użytkownik `hireos`, a nie root. Runtime Node 22.22.2 spełnia engines projektu. Wersja CI jest przypięta osobno w `.nvmrc`.

## Dostęp

Aplikacja nasłuchuje wyłącznie na `127.0.0.1:4317` VPS. Na komputerze operatora uruchom tunel:

```sh
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 127.0.0.1:4317:127.0.0.1:4317 -p 10172 root@marek172.mikrus.xyz
```

Otwórz http://127.0.0.1:4317. Tunel wymaga działającego SSH i trwa tylko podczas jego działania; nie jest publicznym URL ani wdrożeniem SaaS. Pierwszy tunel został uruchomiony w tle na komputerze roboczym podczas konfiguracji. Po restarcie komputera uruchom go ponownie.

## Pliki i operacje

- Kod: `/opt/hireos/releases/initial`; aktywny symlink: `/opt/hireos/current`.
- Baza demonstracyjna: `/var/lib/hireos/preview.sqlite`.
- Konfiguracja: `/etc/systemd/system/hireos-preview.service`; źródło w `ops/hireos-preview.service`.
- Identyfikator źródła: `/opt/hireos/current/REVISION` (zapisany po publikacji repo).
- Status: `ssh -p 10172 root@marek172.mikrus.xyz systemctl status hireos-preview`.
- Logi: `ssh -p 10172 root@marek172.mikrus.xyz journalctl -u hireos-preview -n 100 --no-pager`.
- Restart: `ssh -p 10172 root@marek172.mikrus.xyz systemctl restart hireos-preview`.
- Zatrzymanie: `ssh -p 10172 root@marek172.mikrus.xyz systemctl stop hireos-preview`.

Usługa ma restart po awarii, limit 256 MB i 50% CPU oraz zapis wyłącznie w katalogu danych i prywatnym tmp. Istniejące aplikacje VPS pozostają niezależne.

## Aktualizacja i odtworzenie

Wdrożenia są na razie ręczne. Przed zmianą: zielone CI, zapis SHA, nowy katalog release i spójna kopia SQLite (przy zatrzymanej usłudze lub przez SQLite backup). Przenieś wyłącznie kod runtime i plik package.json, przygotuj pusty katalog data wymagany przez bootstrap, zapisz REVISION. Przełącz symlink current i zrestartuj usługę; sprawdź / i /api/state przez tunel. Zachowaj poprzedni katalog release. W razie błędu przywróć poprzedni symlink i restart; migracje bazy wymagają osobnego planu przywrócenia. Pierwsze wdrożenie nie ma poprzedniej wersji do rollbacku.

Nie skonfigurowano automatycznego CD ani cyklicznych backupów. To środowisko demonstracyjne z syntetycznymi danymi, bez logowania produktu i izolacji klientów.

## Zakres podglądu

Dostępne: działająca aplikacja UI/API, pliki, stan usługi, logi i baza demonstracyjna przez SSH. Narzędzia T3 do powiązania zdalnego environment nie były dostępne podczas konfiguracji. To nie daje automatycznie natywnej przeglądarki Codexa, zdalnych sesji agentów, desktopu ani pełnego panelu obserwowalności. Takie możliwości wymagają osobnej integracji; nie są deklarowane jako ukończone.
