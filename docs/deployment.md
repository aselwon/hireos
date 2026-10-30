# Publikacja demonstracyjna

## Aktualny publiczny demonstrator

Adres HTTPS: <https://niezla.bieda.it/>

To statyczny demonstrator `hireos/dist` z danymi przechowywanymi wyłącznie w `localStorage` przeglądarki. Prywatny Node/SQLite pozostaje dostępny przez tunnel `127.0.0.1:4317`; nie jest częścią publicznego wdrożenia. Publiczny endpoint health opisuje `workerApi: "not-implemented"` i `outreachEnabled: false`. Nie ma działającego API worker, klucza ani rutyny outreachu; auth API pozostaje pracą przyszłą. Publiczny routing demo nie dowodzi ukończenia integracji.

Kontener VPS: `hireos-public`, `nginx:1.28-alpine`, digest `sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236`, port `20172:8080`. Mounty read-only: `/opt/hireos/current/hireos/dist:/usr/share/nginx/html` i `/opt/hireos/public/default.conf:/etc/nginx/conf.d/default.conf`; źródłem konfiguracji jest [`ops/hireos-public.conf`](../ops/hireos-public.conf).

N8n został usunięty z VPS 2026-10-30 razem z kopiami zapasowymi i nie jest ścieżką rollbacku. Wycofanie demonstratora: `docker stop hireos-public`.

Weryfikacja 2026-10-30 dla https://niezla.bieda.it: root 200 z tytułem HireOS, app.js/seed.js/styles.css 200, health 200, prywatne /api/state 403, niegotowe /hireos-api/v1/tasks 503, /.env i /lib/store.mjs 404. TLS sprawdzono przez curl bez -k; health potwierdzono również z VPS po IPv4 i IPv6. Wcześniejszy raport CYTR.US dotyczył literówki w nazwie domeny i nie opisywał tej instalacji.

URL: https://hireos-hr-control-20261030.adamselwon1993.chatgpt.site

Widoczność: prywatna dla właściciela. Status publikacji: succeeded.

Site: appgprj_6ae48a099db48191b7143dc34b28e1bb

Wersja: appgprj_6ae48a099db48191b7143dc34b28e1bb~appgver_e4bd6edbdf048191b2e3d810f6672784

Deployment: appgdep_6ae48f70b6f4819186f1dc8d503e5f6c

Źródło UI: 520443f1bd4559b1a2c445656651c04f818f0902

Hostowane jest statyczne demo `hireos/dist`. Dane przechowuje wyłącznie przeglądarka użytkownika. Serwer Node/SQLite uruchamia się lokalnie i nie jest częścią tej publikacji. Nie wprowadzaj prawdziwych CV ani danych kandydatów do demonstratora.
