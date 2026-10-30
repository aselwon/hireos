# Backlog HireOS

> **Zarchiwizowane (2026-10-30).** `backlog.json` opisuje pełny produkt dla wielu firm i branż i jest poza zakresem MVP. Aktualna kolejka zadań MVP IT: [`tasks.json`](tasks.json), zakres: [`../SPEC.md`](../SPEC.md), DoD: [`../docs/mvp-dod.md`](../docs/mvp-dod.md). Zablokowane zadania: [`blocked.md`](blocked.md).

Źródło: `backlog.json`. 8 epików, 36 zadań; klucze HOS są lokalne i nie udają identyfikatorów Linear. Wszystkie zadania dotyczą wersji produkcyjnej i są planowane. Działający prototyp nie oznacza ich ukończenia.

Priorytety lokalne: 1 = najwyższy priorytet projektu, 2 = następny etap, 3 = później. Przy imporcie mapujemy je na Linear High (2), Normal (3), Low (4), bez nadawania wszystkim zadaniom statusu Urgent. Estymaty 2/3/5/8 to względne punkty, nie liczba dni. `owner` opisuje ścieżkę realizacji, nie przypisuje fikcyjnych użytkowników w Linear. `dependsOn` to rzeczywiste zależności, a `acceptance` kryteria akceptacji.

Kolejność ścieżki krytycznej: discovery/prawne → tożsamość/tenant → workflow/policy → aplikacje/dowody → poczta/kalendarz → pilotaż. Uzgodnienie dostępu do portali rozpoczyna się od razu, równolegle z fundamentem. Brak partnerstwa nie blokuje własnego formularza.

Status synchronizacji Linear jest zapisany osobno po skutecznym utworzeniu obiektów. Bez takiego potwierdzenia backlog pozostaje lokalny.
