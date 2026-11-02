# Runbook produkcyjny HireOS

Procedura dla właściciela. Instalacja i uruchomienie usług odbywają się ręcznie
na VPS; repozytorium ani CI nie zmieniają usług systemowych.

## Monitoring i alerty

Monitor uruchamia się co pięć minut. Sprawdza `GET /healthz`, wiek najnowszego
manifestu backupu (alarm po 26 godzinach lub gdy backupu brak), wolne miejsce
(alarm poniżej 1 GiB), limit AI oraz liczbę błędów HTTP 5xx zapisanych przez
usługę w journald `hireos-preview` z ostatnich pięciu minut. Log zawiera
wyłącznie kod statusu. Alerty tego samego rodzaju są
ograniczane do jednego na godzinę. Stan deduplikacji jest w
`/var/lib/hireos/monitor-state.json`.

Domyślnie alarm trafia wyłącznie do journald jako `HIREOS_ALERT <problem>`.
Właściciel może dodać `ALERT_COMMAND` w konfiguracji usługi, jeśli wybierze
własny kanał. Komenda dostaje wyłącznie zmienną `HIREOS_ALERT` z kodem problemu,
bez treści żądań, logów ani danych kandydatów. Nie konfiguruj komendy
wypisującej sekrety. Progi można dostosować przez `HIREOS_MONITOR_BACKUP_MAX_AGE_HOURS`
i `HIREOS_MONITOR_MIN_FREE_GB`.

Z checkoutu wydania zainstaluj i aktywuj timer (ręcznie przez właściciela):

```sh
sudo install -m 0644 ops/hireos-monitor.service /etc/systemd/system/
sudo install -m 0644 ops/hireos-monitor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hireos-monitor.timer
sudo systemctl start hireos-monitor.service
sudo systemctl status hireos-monitor.service
sudo systemctl list-timers hireos-monitor.timer
sudo journalctl -u hireos-monitor.service --since today --no-pager
```

Weryfikuj stan co najmniej raz po instalacji: uruchom ręcznie usługę, sprawdź
`systemctl --failed`, status timera oraz wpisy `HIREOS_ALERT` w journalu.
Kanał zewnętrzny (np. e-mail lub darmowy webhook) wybiera i konfiguruje
właściciel; HireOS nie wymaga płatnej usługi monitoringu.
