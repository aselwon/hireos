# HireOS — plan produktu

Stan: 30.10.2026. Zakres uzgodniony: wszystkie branże, Polska/UE, wielu klientów, interfejs po polsku. Nazwa robocza. Ten dokument opisuje produkt docelowy; README rozdziela funkcje wdrożone od planowanych.

## Cel i granica autonomii

Zautomatyzować powtarzalne operacje agencji rekrutacyjnej: przyjęcie briefu, przygotowanie oferty, publikację w uprawnionych kanałach, przyjęcie aplikacji, porządkowanie dowodów, korespondencję transakcyjną, planowanie rozmów, przygotowanie zadań, dokumentowanie przebiegu i raportowanie SLA. System ma obsługiwać wolumen dużej agencji, ale nie zakładamy z góry równoważności ze 100 pracownikami.

Autonomia dotyczy operacji w ustalonej polityce klienta. Odrzucenie, oferta zatrudnienia i decyzja o zatrudnieniu wymagają znaczącej oceny osoby odpowiedzialnej. Model nie ustala samodzielnie rankingu osób, nie wnioskuje o emocjach ani cechach chronionych. Wymagania stanowiska muszą być związane z pracą. Brak dowodu nie jest negatywną oceną. Człowiek ma dostęp do materiałów źródłowych, może zmienić wynik i zatrzymać proces.

## Użytkownicy i podstawowe przepływy

1. Administrator agencji tworzy organizację, klienta, uprawnienia i politykę automatyzacji.
2. Hiring manager wprowadza brief: obowiązki, wynagrodzenie, lokalizacja, godziny, formalne kwalifikacje, kryteria i dostępne dostosowania. Rekruter zatwierdza brief oraz scenariusz oceny.
3. Agent przygotowuje ogłoszenie. Publikacja wykorzystuje wyłącznie uprawnione API/feed i uzgodniony budżet. Wyjście poza limity trafia do operatora.
4. Kandydat aplikuje przez portal lub formularz; otrzymuje informację o AI, celu przetwarzania i kontakt do człowieka. System przechowuje pochodzenie danych i wersję informacji prawnej.
5. Parser wyodrębnia fakty z CV z cytatami i numerami stron. Usuwa aktywną zawartość, traktuje dokument jako niezaufane dane. Nie wykonuje poleceń zawartych w CV.
6. Agent przygotowuje macierz wymagań i materiałów: potwierdzone w źródle, niejasne, brak materiału. Rekruter decyduje o dalszym etapie; system może automatycznie poprosić o dokument, jeśli wynika to z zatwierdzonego procesu.
7. Koordynator proponuje terminy zgodne z dostępnością i strefą czasową. Kandydat wybiera termin, może zmienić go lub poprosić o dostosowanie.
8. Rozmowa używa scenariusza właściwego dla roli. IT: kod i system design; produkcja: scenariusz jakości/bezpieczeństwa; sprzedaż: zadanie na fikcyjnych danych; branże regulowane: osobna weryfikacja uprawnień. Transkrypcja i nagrywanie zależą od właściwej podstawy i informacji dla uczestnika.
9. Agent tworzy podsumowanie z odnośnikami do dowodów. Rekruter zatwierdza ocenę. Oferta, odmowa i dokumenty są obsługiwane dopiero po zatwierdzeniu decyzji.
10. Po zamknięciu procesu system uruchamia retencję, usuwanie danych i raport wyników procesu, bez wykorzystywania chronionych cech do decyzji.

## Moduły

- Control room: SLA, wyjątki, zadania, koszty i wyłącznik awaryjny.
- CRM klientów i rekrutacje: brief, wersje kryteriów, budżet, właściciel, kanban.
- Sourcing: katalog kanałów, zatwierdzone zapytania, publikacja, provenance i deduplikacja.
- Candidate hub: aplikacje, komunikacja, materiały, zgody/informacje, prośby o dostęp/usunięcie.
- Evidence review: powiązanie wymagań z cytatami, niepewność i przegląd człowieka.
- Interview studio: terminy, szablony branżowe, zadania praktyczne, transkrypcja i dostosowania.
- Decision desk: materiały, uzasadnienie, uprawniony zatwierdzający, odwołanie.
- Integracje: OAuth, kondycja połączeń, uprawnienia, limity, historia synchronizacji.
- Billing/operations: limity per klient, usage, budżety i eksport rozliczeń.

## Etapy realizacji i bramki akceptacji

Terminy są wstępnym planem dla zespołu 4–6 inżynierów + product/design + specjalisty HR/prawnego; nie stanowią zobowiązania ani prognozy pracy samego modelu.

| Etap                | Orientacyjny czas | Zakres                                                              | Bramka                                                     |
| ------------------- | ----------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| 0. Discovery        | 1–2 tyg.          | 3 klientów pilota, wolumeny, mapy procesów, role, API/umowy         | Zatwierdzony zakres, podstawy przetwarzania i mierniki     |
| 1. Fundament        | 3–4 tyg.          | Auth, tenant isolation, role, audit, workflow, secrets              | Testy izolacji tenantów i odtwarzania kopii                |
| 2. MVP operacyjne   | 4–6 tyg.          | Formularz, brief, poczta, kalendarz, materiały i review             | E2E aplikacja → rozmowa → zatwierdzenie, bez utraty danych |
| 3. Rozmowy i kanały | 4–6 tyg.          | Portal partnerski, scenariusze branżowe, zadania, audio opcjonalnie | Zgody, jakość transkrypcji, odwołania, sandbox             |
| 4. Pilotaż          | 3–4 tyg.          | Tryb obserwacyjny, 3 klientów, minimum 2 różne branże               | Spełnione SLO i jakość dowodów; akceptacja właściciela     |
| 5. Skalowanie       | zależne od pilota | Load tests, billing, więcej portali, DR                             | Zmierzona przepustowość przy budżecie i SLA                |

## Skala „100 osób” — hipoteza do pomiaru

Początkowa koperta testowa: 50 organizacji klientów, 500 aktywnych rekrutacji, 100 000 aplikacji/miesiąc, 10 000 rozmów/miesiąc. To założenia projektowe, nie zmierzone możliwości prototypu. Przy 22 dniach roboczych i 8 h/dzień średnia wynosi 568 aplikacji/h; testujemy szczyt 10×, ok. 1,58 aplikacji/s. Rozmowy 45-minutowe przy równym rozkładzie oznaczają średnio 43 równoległe sesje w godzinach pracy; testowy szczyt 3× daje 129 sesji. Kolejki i dostawców trzeba wymiarować niezależnie.

Mierzymy: czas obsługi na aplikację, udział operacji bez interwencji, wyjątki/100 spraw, terminowość, błędy faktograficzne podsumowań, skargi, skuteczność usuwania danych, koszt/aplikację, koszt/rozmowę oraz czas ludzkiego review. Redukcja pracy = wolumen × różnica czasu ręcznego na zadanie; wynik podzielony przez produktywne godziny FTE. Nie utożsamiamy liczby agentów z etatami.

Wstępne cele produkcyjne: API 99,9% miesięcznie; p95 odczytów <500 ms przy ustalonym obciążeniu; 99% aplikacji przyjętych do kolejki w 60 s; potwierdzenie przetworzenia webhooka <2 s; brak podwójnej wysyłki w testach replay; RPO ≤15 min, RTO ≤4 h po zweryfikowanym odtworzeniu. Retencja i SLO muszą być zatwierdzone w pilotażu.

## Ryzyka i warunki uruchomienia produkcji

Ocena zastosowania RODO, obowiązków dotyczących decyzji automatycznych i przepisów AI Act wymaga specjalisty dla konkretnego wdrożenia. Systemy AI stosowane w rekrutacji mogą należeć do kategorii wysokiego ryzyka; nie traktujemy zgody jako uniwersalnej podstawy przetwarzania. Przed produkcją: analiza ról administrator/podmiot przetwarzający, DPIA tam gdzie wymagana, umowy powierzenia, mechanizm odwołania, przegląd kryteriów i realny nadzór człowieka. Szczególne branże dodają własne wymagania.

Pozostałe ryzyka: brak API portali, limity poczty, błędny odczyt CV, nierówna jakość dla języków, prompt injection, halucynacje, wyciek między klientami, niekontrolowany koszt modeli i niebezpieczny kod w zadaniach. Każde ma właściciela i bramkę w backlogu.
