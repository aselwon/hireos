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
- Co próbowano: harness auto-merge; CI czerwone na cc42525
- Ostatni błąd (bez sekretów): Quality: failure
- Hipoteza: lokalny `npm run ci` przeszedł, CI na GitHubie nie.
- Pytanie do właściciela: poprawić gałąź `task/MVP-20` (nowy push → harness ponownie sprawdzi CI i zmerguje) albo zamknąć PR.
