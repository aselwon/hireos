# Zablokowane zadania

Agent dopisuje tu wpis po 3 nieudanych próbach CI albo przy blokadzie wymagającej decyzji człowieka. Format:

```text
## <id zadania> — <data>
- Gałąź / PR:
- Co próbowano:
- Ostatni błąd (bez sekretów):
- Hipoteza:
- Pytanie do właściciela:
```

## MVP-30 — 2026-11-01

- Gałąź / PR: brak (krok człowieka, zadanie ze statusem blocked od utworzenia)
- Co próbowano: nic — agent nie wykonuje tego zadania (Pierwsze wdrożenie produkcyjne).
- Ostatni błąd (bez sekretów): brak
- Hipoteza: wymaga decyzji lub działania właściciela.
- Pytanie do właściciela: Wykonać docs/production-runbook.md na VPS po MVP-27/28/29/44: /etc/hireos/env (hasło, token Workers AI ograniczony do AI), preflight, deploy, backup i monitor. Która domena docelowa (niezla.bieda.it czy inna)?

## MVP-37 — 2026-11-01

- Gałąź / PR: brak (krok człowieka, zadanie ze statusem blocked od utworzenia)
- Co próbowano: nic — agent nie wykonuje tego zadania (Akceptacja dokumentów RODO i AI Act).
- Ostatni błąd (bez sekretów): brak
- Hipoteza: wymaga decyzji lub działania właściciela.
- Pytanie do właściciela: Przeczytać i zaakceptować klauzulę i informację o AI (MVP-31/32), okres retencji N, procedurę praw osób (MVP-33), dokumentację AI Act i DPIA (MVP-35), podstawę przekazania danych zleceniodawcom.
- Decyzja właściciela (2026-11-01): bez płatnego prawnika i bez zewnętrznego przeglądu prawnego; dokumenty akceptuje sam Kamil.

## MVP-41 — 2026-11-01

- Gałąź / PR: brak (krok człowieka, zadanie ze statusem blocked od utworzenia)
- Co próbowano: nic — agent nie wykonuje tego zadania (Test kontrolny outreachu na produkcji).
- Ostatni błąd (bez sekretów): brak
- Hipoteza: wymaga decyzji lub działania właściciela.
- Pytanie do właściciela: Przeprowadzić scenariusz MVP-23 z kontrolowanym odbiorcą, ustalić wartości limitów outreachu, zapisać wynik w panelu i ręcznie włączyć outreach_live. Bez tego żaden prawdziwy kandydat nie dostanie wiadomości.

## MVP-52 — 2026-11-01

- Gałąź / PR: brak (krok człowieka, zadanie ze statusem blocked od utworzenia)
- Co próbowano: nic — agent nie wykonuje tego zadania (Decyzje biznesowe przed sprzedażą).
- Ostatni błąd (bez sekretów): brak
- Hipoteza: wymaga decyzji lub działania właściciela.
- Pytanie do właściciela: Cennik (success fee %/stała/zaliczka), forma działalności i dane administratora/sprzedawcy, narzędzie do faktur (płatne wymaga zgody), adres kontaktowy, akceptacja szablonów umów z MVP-51.
- Notatka (2026-11-01): fakturowanie odłożone. Kamil ma już iFirmę (istniejąca subskrypcja); integracja możliwa później, nie teraz.

## MVP-55 — 2026-11-01

- Gałąź / PR: brak (krok człowieka, zadanie ze statusem blocked od utworzenia)
- Co próbowano: nic — agent nie wykonuje tego zadania (Onboarding pierwszego klienta).
- Ostatni błąd (bez sekretów): brak
- Hipoteza: wymaga decyzji lub działania właściciela.
- Pytanie do właściciela: Po MVP-30/37/41/52: umowa z pierwszą firmą, rekrutacja z prawdziwymi kandydatami, pierwsza faktura.

## MVP-43 — 2026-11-02

- Gałąź / PR: https://github.com/aselwon/hireos/pull/54 (otwarty, NIE zmergowany)
- Co próbowano: harness auto-merge; CI czerwone na da2e998
- Ostatni błąd (bez sekretów): Quality: failure
- Hipoteza: lokalny `npm run ci` przeszedł, CI na GitHubie nie.
- Pytanie do właściciela: poprawić gałąź `task/MVP-43` (nowy push → harness ponownie sprawdzi CI i zmerguje) albo zamknąć PR.
