# HireOS MVP IT — Definition of Done

MVP jest gotowe, gdy **wszystkie** punkty są odhaczone i każdy ma dowód (link do PR, wynik testu, log lub zrzut). Zakres: [`SPEC.md`](../SPEC.md). Długoterminowa propozycja DoD dla pełnego produktu pozostaje w [`definition-of-done.md`](definition-of-done.md) i nie blokuje MVP.

## 1. Brief i ogłoszenie

- [ ] Formularz briefu IT przyjmuje: stanowisko, stack (min. 1 technologia ze słownika), seniority (junior/mid/senior/lead), widełki (min ≤ max, waluta, netto/brutto, B2B/UoP), lokalizację lub zdalnie. Nieprawidłowe dane → HTTP 400 z komunikatem po polsku (test).
- [ ] Z briefu powstaje ogłoszenie i macierz wymagań (must/nice, waga 1–3). Rekruter może edytować i zatwierdzić; dopiero zatwierdzona rekrutacja przyjmuje aplikacje (test).
- [ ] Generowanie działa z fake providerem w CI i z prawdziwym modelem za bramką kosztów (ręczny test raz, wynik w PR).

## 2. Aplikacja kandydata

- [ ] Publiczny formularz przyjmuje PDF ≤ 10 MB. Weryfikacja magic bytes `%PDF`. Inny typ lub większy plik → 400/413 (test).
- [ ] Wymagana zgoda na przetwarzanie danych z wersją klauzuli zapisaną przy aplikacji (test).
- [ ] Plik CV przechowywany poza katalogiem statycznym, niedostępny bez sesji rekrutera (test negatywny: 401/404).
- [ ] Powtórne wysłanie z tym samym `Idempotency-Key` nie tworzy duplikatu (test).

## 3. Parser CV

- [ ] Ekstrakcja tekstu z PDF lokalnie, bez modelu. PDF bez warstwy tekstowej → `needs_manual_review` (test z fixture).
- [ ] Profil zgodny ze schematem JSON: umiejętności, doświadczenie (firma, rola, od–do, technologie), edukacja, języki. Każdy fakt ma `quote`, a `quote` jest dosłownym fragmentem tekstu CV; jeśli nie jest → `uncertain: true` (test).
- [ ] Zestaw ewaluacyjny: **≥ 20 syntetycznych CV PDF** z plikiem gold (`eval/cv/*.json`), w tym ≥ 3 trudne przypadki (dwie kolumny, CV po angielsku, luki w datach).
- [ ] `npm run eval:cv` raportuje dokładność kluczowych faktów. **≥ 90% poprawnych** na prawdziwym modelu (wynik zapisany w `eval/results/`, koszt podany). W CI eval uruchamia się na nagranych odpowiedziach.

## 4. Raport screeningowy i decyzja

- [ ] Każde wymaganie z macierzy ma w raporcie status `met` / `missing` / `uncertain` i listę cytatów z CV. Wymaganie bez cytatu nie może mieć statusu `met` (test).
- [ ] Rekruter zatwierdza lub odrzuca kandydata z obowiązkowym uzasadnieniem; decyzja trafia do audit logu (test).
- [ ] **Brak automatycznego odrzucenia**: żaden kod poza akcją człowieka nie zmienia etapu na `rejected` (test).
- [ ] Kandydat z `needs_manual_review` lub z flagami `uncertain` jest wyraźnie oznaczony w UI.

## 5. Sourcing GitHub (opcjonalny)

- [ ] Dla zatwierdzonej rekrutacji można wygenerować listę profili GitHub (publiczne API, limit zapytań respektowany) z uzasadnieniem dopasowania (języki, repozytoria).
- [ ] Brak jakiejkolwiek funkcji automatycznego kontaktu z tej listy (przegląd kodu + test, że nie powstają zadania outreach bez akcji człowieka).

## 6. API wykonawcy outreachu (`/api/v1/tasks`)

- [ ] Uwierzytelnianie kluczem API (nagłówek `Authorization: Bearer`), klucze przechowywane jako hash, z zakresem `worker:outreach`, odwoływalne. Brak/odwołany klucz → 401, zły zakres → 403 (testy).
- [ ] Wykonawca widzi tylko zadania mu przydzielone (test negatywny).
- [ ] `POST /api/v1/tasks/claim` rezerwuje jedno zadanie z `lease_until`. Dwa równoległe claimy nie dostają tego samego zadania (test współbieżności). Wygasły lease wraca do kolejki.
- [ ] Każde zadanie i wiadomość mają stabilne `task_id` i `message_id`. Wynik raportowany z `Idempotency-Key`; ponowiony raport nie duplikuje zdarzeń (test).
- [ ] Wyniki: `sent`, `replied`, `needs_intervention`, `failed`, `unresolved`. Historia prób (`attempts`) z czasem, wynikiem i komunikatem.
- [ ] `unresolved` blokuje ponowienie, dopóki wykonawca nie zgłosi `verified_not_sent` (wtedy ponowienie dozwolone) albo `verified_sent` (test).
- [ ] Pauza rekrutacji/rozmowy, przejęcie rozmowy przez człowieka i odmowa kandydata (`refused`) natychmiast blokują nowe claimy i wysyłki; `GET /api/v1/tasks/:id/preflight` zwraca `allowed: false` (testy). Odmowa ustawia `do_not_contact` dla kandydata.
- [ ] Kontrakt API opisany w `docs/worker-api.md` z przykładami żądań.

## 7. Bezpieczeństwo, koszty, operacje

- [ ] HTTPS na VPS przez istniejące reverse proxy. Publiczny jest tylko formularz aplikacji i `/api/v1`. Panel rekrutera wymaga logowania. `/api/state` i demo-mutacje niedostępne publicznie (curl z wynikiem w PR).
- [ ] Miesięczny limit kosztów modeli (konfiguracja `MODEL_MONTHLY_CAP_PLN`). Ewidencja kosztu każdego wywołania. Po przekroczeniu bramka zwraca błąd, a API generowania odpowiada 503 z czytelnym komunikatem; reszta aplikacji działa (test).
- [ ] Brak sekretów w repo (skan `git log -p` / gitleaks w CI) i brak danych kandydatów w logach (przegląd + test loggera).
- [ ] Backup SQLite i plików CV (skrypt + harmonogram). **Odtworzenie sprawdzone** na czystym katalogu: liczba rekrutacji, aplikacji i plików zgodna z oryginałem (log w PR).
- [ ] Polityka retencji: CV odrzuconych kandydatów usuwane po N dniach (N ustala właściciel), z testem zadania czyszczącego.

## 8. Jakość i testy

- [ ] CI zielone na `main`: `npm run ci` (qoq + check + testy).
- [ ] Test E2E **brief → zatwierdzenie → aplikacja z PDF → parser → raport → decyzja** na fake providerze, uruchamiany w CI.
- [ ] Test pełnego przepływu outreach z Grok Botem na **kontrolowanym odbiorcy** (konto testowe właściciela), przy wyłączonym MacBooku: brak podwójnych wiadomości, pauza i odmowa działają przed następną wiadomością. Wynik opisany w PR.
- [ ] README i `docs/vps-preview.md` opisują aktualny stan MVP, uruchomienie, wdrożenie i rollback.

## 9. Decyzje właściciela przed startem z prawdziwymi kandydatami

- [ ] Limit kosztów modeli i wybrany model/dostawca.
- [ ] Limity outreachu (dziennie, follow-upy), treści dozwolone do przekazania kandydatom.
- [ ] Klauzula RODO, okres retencji, przegląd prawny (AI Act: rekrutacja jako system wysokiego ryzyka).
