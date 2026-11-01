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


## MVP-20 — 2026-11-01
- Gałąź / PR: https://github.com/aselwon/hireos/pull/23 (otwarty, NIE zmergowany)
- Co próbowano: harness auto-merge; CI czerwone na 150c476
- Ostatni błąd (bez sekretów): Quality: failure
- Hipoteza: lokalny `npm run ci` przeszedł, CI na GitHubie nie.
- Pytanie do właściciela: poprawić gałąź `task/MVP-20` (nowy push → harness ponownie sprawdzi CI i zmerguje) albo zamknąć PR.

## MVP-21 — 2026-11-01
- Gałąź / PR: https://github.com/aselwon/hireos/pull/24 (otwarty, NIE zmergowany)
- Co próbowano: harness auto-merge; CI czerwone na dfee37f
- Ostatni błąd (bez sekretów): Quality: failure
- Hipoteza: lokalny `npm run ci` przeszedł, CI na GitHubie nie.
- Pytanie do właściciela: poprawić gałąź `task/MVP-21` (nowy push → harness ponownie sprawdzi CI i zmerguje) albo zamknąć PR.

## MVP-20 — 2026-11-01
- Gałąź / PR: https://github.com/aselwon/hireos/pull/23 (otwarty, NIE zmergowany)
- Co próbowano: harness auto-merge; CI czerwone na cc42525
- Ostatni błąd (bez sekretów): Quality: failure
- Hipoteza: lokalny `npm run ci` przeszedł, CI na GitHubie nie.
- Pytanie do właściciela: poprawić gałąź `task/MVP-20` (nowy push → harness ponownie sprawdzi CI i zmerguje) albo zamknąć PR.

## MVP-23 — 2026-11-01
- Gałąź / PR: gałąź `task/MVP-23` (WIP, bez PR)
- Co próbowano: harness, 3 próby Codexa (gpt-6-luna → gpt-6-astra)
- Ostatni błąd (bez sekretów):
```text
QoQ found some Prettier errors!
```
- Hipoteza: Po 3 próbach `npm run ci` nadal nie przechodzi.
- Pytanie do właściciela: przejrzeć log `2026-11-01T19-45-13-933Z-hireos-slot-3-MVP-23` i zdecydować: doprecyzować zadanie, podzielić je albo zrobić ręcznie.
