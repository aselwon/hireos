# SPEC — HireOS MVP: rekrutacja IT

Status: obowiązujący zakres od 2026-10-30 (decyzja właściciela: obcięcie zakresu do MVP IT, jeden tenant).

## Cel MVP

Jeden rekruter (właściciel) prowadzi rekrutacje na stanowiska IT od briefu do decyzji o kandydacie, a AI wykonuje pracę przygotowawczą z dowodami. Mierzalne kryteria: [`docs/mvp-dod.md`](docs/mvp-dod.md).

Przepływ:

1. **Brief IT.** Rekruter wpisuje stack, seniority, widełki płacowe, lokalizację lub tryb zdalny, formę umowy. System generuje ogłoszenie i **macierz wymagań** (must-have / nice-to-have, z wagą). Rekruter je edytuje i zatwierdza.
2. **Aplikacja.** Kandydat wypełnia publiczny formularz rekrutacji i wgrywa CV w PDF, z wymaganymi zgodami RODO.
3. **Parser CV.** Z tekstu CV powstaje profil: umiejętności, doświadczenie (firma, rola, okres, technologie), edukacja, języki. Każdy fakt ma **cytat z CV** i flagę `uncertain`, gdy cytat nie potwierdza go jednoznacznie. Jakość mierzona na ≥20 syntetycznych CV (≥90% kluczowych faktów poprawnych).
4. **Raport screeningowy.** Każde wymaganie z macierzy ma status: spełnione / brak dowodu / niepewne, z cytatami. Rekruter zatwierdza albo odrzuca kandydata z uzasadnieniem. **Brak automatycznego odrzucania.**
5. **Sourcing (opcjonalny).** Lista profili GitHub pasujących do stacku (publiczne API), bez żadnego automatycznego kontaktu.
6. **API dla wykonawcy outreachu.** `/api/v1/tasks` z kluczem API dla Grok Bota obsługującego LinkedIn: rezerwacja (lease), idempotencja, historia prób, stan `unresolved`, pauza, przejęcie rozmowy i zatrzymanie po odmowie kandydata.
7. **Operacje.** HTTPS na VPS, twardy dzienny limit wywołań AI w darmowym przydziale Cloudflare Workers AI (konto właściciela `2791466c5820cfd886aad95e0d3ef948`), bez płatnego nadmiaru, backup i odtworzenie sprawdzone testem.

## Zakres (in scope)

- Jeden tenant, jedno konto rekrutera (logowanie hasłem lub kluczem, sesja HttpOnly). Osobne klucze API z zakresami (`worker:outreach`).
- Tylko rekrutacje IT (backend, frontend, mobile, DevOps, data, QA, security). Słownik technologii i poziomów seniority.
- PDF z warstwą tekstową. Skan bez tekstu oznacza CV jako `needs_manual_review` (bez OCR w MVP).
- Język interfejsu: polski. Ogłoszenia: polski, opcjonalnie angielski.
- Bramka modeli z jednym dostawcą (Cloudflare Workers AI, darmowy przydział), fake providerem do testów i ewidencją zużycia neuronów.
- Audit log decyzji i zmian etapów.
- Wdrożenie na istniejącym VPS (mikr.us, 4 GB RAM) za istniejącym reverse proxy z TLS.

## Poza zakresem (out of scope)

- Wiele firm/tenantów, SSO, role i uprawnienia zespołowe, billing klientów.
- Branże inne niż IT oraz katalog branż (`docs/industry-playbooks.md`).
- **Stary backlog `planning/backlog.json` (36 zadań, 8 epików) jest zarchiwizowany** i nie stanowi planu MVP. Dokumenty `docs/product-plan.md`, `docs/system-design.md`, `docs/definition-of-done.md` i `docs/integration-checklist.md` opisują wizję długoterminową; w razie konfliktu wygrywa ten SPEC.
- Integracje z portalami ogłoszeń (Pracuj, Just Join IT, No Fluff Jobs), ATS/HRIS, pocztą i kalendarzami.
- Wysyłka wiadomości przez samo HireOS. Kontakt na LinkedIn wykonuje zewnętrzny wykonawca przez `/api/v1/tasks`; HireOS nie wysyła wiadomości samodzielnie.
- Scraping LinkedIn, automatyczne zaproszenia z HireOS, automatyczne odrzucanie, ranking „AI score” jako jedyna podstawa decyzji.
- OCR skanów, rozmowy głosowe i wideo, testy techniczne i sandbox kodu, podpisy umów.
- Aplikacja mobilna.

## Założenia i ograniczenia

- Dane w repo, testach i ewaluacji są syntetyczne. Prawdziwe dane kandydatów trafiają wyłącznie do produkcyjnej bazy na VPS po wdrożeniu HTTPS i backupu.
- Koszty: **0 zł za modele**. Wszystkie wywołania modeli idą przez Cloudflare Workers AI na koncie `2791466c5820cfd886aad95e0d3ef948` w darmowym przydziale 10 000 neuronów/dobę (reset 00:00 UTC). Bramka liczy zużycie i zatrzymuje wywołania przed limitem (domyślnie `MODEL_DAILY_NEURON_CAP=9000`), nigdy nie przechodzi w płatny nadmiar. Dozwolone tylko modele dostępne bez płatnej metody rozliczeń. Praca deweloperska i CI: fake provider. Agenci kodujący: wyłącznie subskrypcja ChatGPT (Codex), bez płatnych API.
- Zasady kontaktu dla outreachu (limity dzienne, liczba follow-upów, zakres informacji przekazywanych kandydatom) ustala właściciel przed testem z prawdziwym kandydatem.
- Zgodność z RODO i AI Act (rekrutacja to system wysokiego ryzyka) wymaga przeglądu specjalisty przed użyciem z prawdziwymi kandydatami.
