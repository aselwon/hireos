# Wdrożenie HireOS

## Stan obecny i docelowy

Adres HTTPS: <https://niezla.bieda.it/>

Publiczny adres HTTPS <https://niezla.bieda.it/> nadal wskazuje statyczny demonstrator `hireos/dist`. Nie należy wprowadzać tam prawdziwych CV ani danych kandydatów. Prywatny Node/SQLite pozostaje dostępny przez tunnel `127.0.0.1:4317`; nie jest częścią publicznego wdrożenia. Publiczny endpoint health opisuje `workerApi: "not-implemented"` i `outreachEnabled: false`.

Stan docelowy po wdrożeniu przez właściciela: publiczny adres obsługuje aplikację Node/SQLite za reverse proxy z TLS. Panel rekrutera po zalogowaniu ładuje briefy i aplikacje z API; demonstracyjny seed nie jest udostępniany ani wczytywany w produkcji. Publiczny formularz aplikacji pozostaje dostępny bez logowania. Wdrożenie nie jest wykonywane przez harness.

Kontener VPS: `hireos-public`, `nginx:1.28-alpine`, digest `sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236`, port `20172:8080`. Mounty read-only: `/opt/hireos/current/hireos/dist:/usr/share/nginx/html` i `/opt/hireos/public/default.conf:/etc/nginx/conf.d/default.conf`; źródłem konfiguracji jest [`ops/hireos-public.conf`](../ops/hireos-public.conf).

N8n został usunięty z VPS 2026-10-30 razem z kopiami zapasowymi i nie jest ścieżką rollbacku.

## Przełączenie i rollback

Właściciel wdraża aplikację Node/SQLite i konfigurację reverse proxy zgodnie z lokalną procedurą VPS. Po przełączeniu należy sprawdzić logowanie, pusty panel na nowej bazie, utworzenie briefu oraz publiczny formularz aplikacji. Należy też potwierdzić, że `/seed.js` nie jest dostępny, a panel nie pokazuje danych demonstracyjnych.

Jeśli kontrola po wdrożeniu nie przejdzie, rollback polega na przywróceniu poprzedniego routingu statycznego demonstratora do katalogu `hireos/dist` w kontenerze `hireos-public` i ponownym uruchomieniu kontenera po wcześniejszym zatrzymaniu. Obecny demonstrator jest statyczny i przechowuje dane wyłącznie w przeglądarce; rollback nie przywraca ani nie migruje danych z bazy produkcyjnej. Po rollbacku nie wolno używać demonstratora z prawdziwymi danymi kandydatów.

Weryfikacja 2026-10-30 opisywała ówczesny demonstrator na https://niezla.bieda.it: root 200 z tytułem HireOS, app.js/seed.js/styles.css 200, health 200, prywatne /api/state 403, niegotowe /hireos-api/v1/tasks 503, /.env i /lib/store.mjs 404. Nie potwierdza stanu po przyszłym wdrożeniu aplikacji Node. TLS sprawdzono wtedy przez curl bez -k; health potwierdzono również z VPS po IPv4 i IPv6. Wcześniejszy raport CYTR.US dotyczył literówki w nazwie domeny i nie opisywał tej instalacji.

URL: https://hireos-hr-control-20261030.adamselwon1993.chatgpt.site

Widoczność: prywatna dla właściciela. Status publikacji: succeeded.

Site: appgprj_6ae48a099db48191b7143dc34b28e1bb

Wersja: appgprj_6ae48a099db48191b7143dc34b28e1bb~appgver_e4bd6edbdf048191b2e3d810f6672784

Deployment: appgdep_6ae48f70b6f4819186f1dc8d503e5f6c

Źródło UI: 520443f1bd4559b1a2c445656651c04f818f0902

Hostowane jest statyczne demo `hireos/dist`. Dane przechowuje wyłącznie przeglądarka użytkownika. Serwer Node/SQLite uruchamia się lokalnie i nie jest częścią tej publikacji. Nie wprowadzaj prawdziwych CV ani danych kandydatów do demonstratora.
