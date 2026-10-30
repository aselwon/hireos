# Publikacja demonstracyjna

## Aktualny publiczny demonstrator

Adres HTTPS: <https://nezla.bieda.it/>

To statyczny demonstrator `hireos/dist` z danymi przechowywanymi wyłącznie w `localStorage` przeglądarki. Prywatny Node/SQLite pozostaje dostępny przez tunnel `127.0.0.1:4317`; nie jest częścią publicznego wdrożenia. Publiczny endpoint health opisuje `workerApi: "not-implemented"` i `outreachEnabled: false`. Nie ma działającego API worker, klucza ani rutyny outreachu; auth API pozostaje pracą przyszłą. Publiczny routing demo nie dowodzi ukończenia integracji.

Kontener VPS: `hireos-public`, `nginx:1.28-alpine`, digest `sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236`, port `20172:8080`. Mounty read-only: `/opt/hireos/current/hireos/dist:/usr/share/nginx/html` i `/opt/hireos/public/default.conf:/etc/nginx/conf.d/default.conf`; źródłem konfiguracji jest [`ops/hireos-public.conf`](../ops/hireos-public.conf).

N8n jest zatrzymany, nie usunięty. Rollback: `docker stop hireos-public`, `docker start n8n`; nie usuwać danych. Backup znajduje się root-only w `/root/hireos-backup-before-public/` i nie należy czytać jego zawartości.

Test edge z 2026-10-30 potwierdził rozbieżność: publiczne `/` zwróciło 200, ale tytuł `CYTR.US`, zasoby oraz endpointy oczekiwane dla HireOS zwróciły 404. `python urllib` dostał `HTTP 403 Forbidden` na edge; bezpośredni root i pliki w kontenerze były poprawne. `curl` bez `-k` zestawił TLS, natomiast `--cert-status` zakończył się brakiem OCSP (`curl: (91) No OCSP response received`).

URL: https://hireos-hr-control-20261030.adamselwon1993.chatgpt.site

Widoczność: prywatna dla właściciela. Status publikacji: succeeded.

Site: appgprj_6ae48a099db48191b7143dc34b28e1bb

Wersja: appgprj_6ae48a099db48191b7143dc34b28e1bb~appgver_e4bd6edbdf048191b2e3d810f6672784

Deployment: appgdep_6ae48f70b6f4819186f1dc8d503e5f6c

Źródło UI: 520443f1bd4559b1a2c445656651c04f818f0902

Hostowane jest statyczne demo `hireos/dist`. Dane przechowuje wyłącznie przeglądarka użytkownika. Serwer Node/SQLite uruchamia się lokalnie i nie jest częścią tej publikacji. Nie wprowadzaj prawdziwych CV ani danych kandydatów do demonstratora.
