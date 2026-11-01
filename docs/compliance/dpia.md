# DPIA — projekt oceny skutków dla ochrony danych

**projekt — wymaga przeglądu prawnego**

Wersja robocza z 2026-11-01. Nie jest zakończoną oceną z art. 35 RODO.
Odpowiedzialny za zebranie ustaleń: właściciel HireOS. Administrator, ewentualni
współadministratorzy/podmioty przetwarzające, dane kontaktowe, udział IOD oraz
osoba zatwierdzająca: **do ustalenia przed realnym przetwarzaniem**. Zleceniodawca
rekrutacji nie staje się automatycznie administratorem ani procesorem przez sam
fakt korzystania z usługi właściciela.

## Cel, osoby i przepływ danych

Cel: przygotowanie rekrutacji IT, analiza materiałów i wsparcie decyzji człowieka,
zgodnie z [przeznaczeniem](README.md). Osoby: kandydaci, publiczne profile GitHub,
rekruter i identyfikowani kluczem wykonawcy. Skala docelowa, liczba aplikacji,
częstotliwość i okresy rekrutacji pozostają do określenia przez właściciela.

| Etap                | Dane i odbiorcy / miejsce                                                                                                     | Mechanizm                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Aplikacja           | Imię/nazwa, e-mail, wersja i czas zgody, oryginalny PDF i tekst; lokalna baza SQLite i katalog CV.                            | [lib/http-applications.mjs](../../lib/http-applications.mjs), [lib/store.mjs](../../lib/store.mjs)         |
| Analiza AI          | Tekst CV trafia w prompt do skonfigurowanego dostawcy; wynik zawiera fakty i cytaty. Przy `fake` brak zewnętrznego wywołania. | [lib/cv-profiles.mjs](../../lib/cv-profiles.mjs), [lib/model-providers.mjs](../../lib/model-providers.mjs) |
| Screening i decyzja | Wymagania i fakty przekazywane modelowi; raport, uzasadnienie i aktor zapisane lokalnie, udostępnione rekruterowi.            | [lib/screening.mjs](../../lib/screening.mjs), [lib/decisions.mjs](../../lib/decisions.mjs)                 |
| Sourcing / outreach | Publiczne dane profili GitHub, ładunki zadań i próby wykonawcy; rzeczywisty kontakt poza HireOS.                              | [lib/github-sourcing.mjs](../../lib/github-sourcing.mjs), [lib/outreach.mjs](../../lib/outreach.mjs)       |
| Eksploatacja        | Kopie bazy i CV, odpowiedzi w cache, logi audytowe i techniczne; dostęp operatora.                                            | [ops/backup.mjs](../../ops/backup.mjs), [lib/logger.mjs](../../lib/logger.mjs)                             |

CV może zawierać dane szczególnych kategorii lub inne informacje zbędne dla
rekrutacji. Kod nie usuwa ich przed wysłaniem tekstu do modelu. Jedynym rzeczywistym
dostawcą bramki jest Workers AI, ale lokalizacja przetwarzania, podwykonawcy,
retencja, wykorzystanie danych i transfery poza EOG nie zostały tu ustalone.
Potrzebne są aktualne warunki, umowy i analiza rozdziału V RODO; nie wolno
wnioskować o braku transferu z lokalizacji VPS ani o ochronie danych z darmowego planu.

## Niezbędność i proporcjonalność

Proponowany cel AI to oszczędność pracy przygotowawczej, nie zastąpienie decyzji
rekrutera. Alternatywą jest ręczny przegląd CV i macierzy bez wysyłania do modelu.
Nie udokumentowano jeszcze porównania korzyści, błędów i ingerencji w prawa osób.
Właściciel powinien uzasadnić potrzebę każdego pola i zewnętrznej analizy,
ograniczyć dane do związanych ze stanowiskiem i ustalić postępowanie z nadmiarem.

Walidacja zgody i zapis `consent_version`/`consent_at` w
[lib/migrations/002-mvp.sql](../../lib/migrations/002-mvp.sql) opisują technikę,
nie wystarczalność podstawy prawnej. Podstawy dla aplikacji, sourcingu,
outreachu, danych szczególnych kategorii i ewentualnej obrony roszczeń wymagają
osobnego ustalenia. Informacja dla kandydata, prawa dostępu, sprostowania,
usunięcia, ograniczenia i sprzeciwu oraz ocena art. 22 pozostają do opracowania.
Człowiek w przepływie nie dowodzi automatycznie rzeczywistego nadzoru.

## Ryzyka i środki

[Rejestr ryzyk](risk-register.md) opisuje stronniczość, błędy parsera,
halucynacje, nadmierne zaufanie, ujawnienie i retencję. Istnieją: sesja i zakresy
([lib/auth.mjs](../../lib/auth.mjs)), cytaty i flagi niepewności, wymóg uzasadnienia
oraz audyt. Nie stanowią dowodu wystarczającego bezpieczeństwa ani trafności.
Brak potwierdzenia produkcyjnego HTTPS, uprawnień operatorów i skuteczności
organizacyjnego nadzoru w ramach tego zadania.

[Polityka logów](logging-retention.md) wskazuje częściowe usuwanie CV po 90 dniach,
pozostałości w cache i brak egzekwowania minimum 6 miesięcy logów. Potrzebna jest
jedna uzgodniona macierz retencji, wraz z backupami i odtwarzaniem. Syntetyczna
[ewaluacja](evaluation-data.md) nie uzasadnia akceptacji ryzyka dyskryminacji.

## Plan uzupełnienia i decyzja

| Czynność przed realnymi danymi                                          | Odpowiedzialny                     | Dowód do zebrania                                                  |
| ----------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| Ustalenie ról, podstaw, obowiązków informacyjnych i umów                | Właściciel z prawnikiem            | Pisemne ustalenia, treści informacji i warunki dostawców           |
| Pełna retencja, prawa osób, kontrola dostępu i odtworzenie              | Właściciel z wykonawcą technicznym | Testy usuwania wszystkich kopii, przegląd konfiguracji i procedury |
| Ocena jakości i nadzoru, przegląd ryzyk                                 | Właściciel/rekruter                | Niezależna walidacja, szkolenie, przykłady ręcznych korekt         |
| Opinia IOD, jeśli dotyczy, i konsultacja zainteresowanych, gdy właściwa | Właściciel z prawnikiem            | Opinia, sposób uwzględnienia lub uzasadnienie odstąpienia          |
| Akceptacja ryzyka resztkowego lub dalsze środki/konsultacja             | Uprawniony administrator           | Datowana decyzja i uzasadnienie; obecnie brak                      |

Jeśli pozostaje wysokie ryzyko, należy z prawnikiem ustalić konieczność uprzedniej
konsultacji z organem (art. 36); niniejszy projekt jej nie zastępuje. Proponowany
ponowny przegląd: zmiana modelu, celu, kategorii danych, odbiorcy, istotny błąd
lub incydent. Termin okresowego przeglądu pozostaje do zatwierdzenia.

## Otwarte pytania do prawnika

1. Kto jest administratorem i jakie podstawy dotyczą poszczególnych etapów oraz danych nadmiarowych?
2. Czy i jak stosują się art. 22, 35–36 RODO, udział IOD oraz ocena praw podstawowych z AI Act?
3. Jakie umowy, ustalenia transferowe i informacje uzyskać od Cloudflare oraz wykonawcy?
4. Jak zapewnić prawa kandydatów, retencję logów i usuwanie danych również z kopii?
5. Czy środki po uzupełnieniu projektu wystarczą, kto zatwierdzi wynik i jakie ryzyko pozostaje?
