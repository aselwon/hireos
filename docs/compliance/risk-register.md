# Rejestr ryzyk

**projekt — wymaga przeglądu prawnego**

Wstępna ocena jakościowa, bez pomiaru częstości. Właścicielem poniższych ryzyk jest
właściciel HireOS jako rekruter/operator. „Wysokie” oznacza możliwość istotnej
szkody dla kandydata lub ujawnienia danych, a nie formalny wynik zatwierdzonej DPIA.
Żadne ryzyko resztkowe nie zostało zaakceptowane w tym dokumencie.

| Ryzyko i szkoda                                                                                     | Istniejąca mitygacja w kodzie                                                                                                                                        | Luka / dalsze działanie                                                                                                                       | Ryzyko resztkowe                     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Stronnicze wymagania lub wnioskowanie z języka, przerw w pracy i cech zastępczych; nierówne szanse. | Edycja macierzy w [lib/advertisements.mjs](../../lib/advertisements.mjs), brak score w [lib/screening.mjs](../../lib/screening.mjs).                                 | Brak testu równego traktowania; rekruter powinien sprawdzać zasadność wymagań, potrzebna ocena reprezentatywności.                            | Wysokie, częstość nieznana.          |
| Parser myli daty, rolę lub umiejętność; kandydat pominięty.                                         | Schemat, cytaty, `uncertain`, ręczny przegląd w [lib/cv-profiles.mjs](../../lib/cv-profiles.mjs); obsługa braku tekstu w [lib/pdf-text.mjs](../../lib/pdf-text.mjs). | Cytat nie dowodzi semantyki; porównanie z oryginałem i szersza ewaluacja przed użyciem.                                                       | Wysokie, częstość live niezmierzona. |
| Halucynacja dowodu lub instrukcje w CV wpływają na ocenę.                                           | Sprawdzenie fragmentu źródła w [lib/cv-profiles.mjs](../../lib/cv-profiles.mjs), powiązanie dowodów z faktami w [lib/screening.mjs](../../lib/screening.mjs).        | Prompty traktują CV jako niezaufane, ale nie gwarantują odporności na prompt injection; ręczna kontrola znaczenia cytatu.                     | Wysokie.                             |
| Automatyczne zaufanie rekrutera do raportu.                                                         | Uzasadnienie decyzji wymagane przez [lib/decisions.mjs](../../lib/decisions.mjs).                                                                                    | Nie jest wymuszane przeczytanie źródeł; szkolenie i przegląd decyzji według [procedury](human-oversight.md).                                  | Wysokie.                             |
| Ujawnienie CV, danych szczególnych kategorii lub nadmierna retencja.                                | Sesja i zakresy w [lib/auth.mjs](../../lib/auth.mjs), częściowa retencja w [lib/retention.mjs](../../lib/retention.mjs).                                             | Kopie w cache, modelu i backupach; brak filtra danych przed wysłaniem CV do modelu. Ustalić podstawy, umowy i pełny cykl usuwania.            | Wysokie.                             |
| Brak możliwości odtworzenia podstaw decyzji.                                                        | Transakcyjny audyt w [lib/decisions.mjs](../../lib/decisions.mjs).                                                                                                   | Brak pełnego wersjonowania powiązań i gwarancji retencji/integralności; zaprojektować uzupełnienia.                                           | Wysokie.                             |
| Kontakt mimo odmowy lub duplikat wiadomości wykonawcy.                                              | Lease, stany niepewne, odmowa i pauzy w [lib/outreach.mjs](../../lib/outreach.mjs).                                                                                  | Zewnętrzna wysyłka pozostaje poza kontrolą transakcji; przed realnym kontaktem wymagany test na kontrolowanym odbiorcy i decyzja właściciela. | Wysokie.                             |
| Niedostępność AI opóźnia ocenę.                                                                     | Limit i blokada w [lib/model-gateway.mjs](../../lib/model-gateway.mjs), bez płatnego fallbacku.                                                                      | Ręczna ocena zamiast uznania awarii za brak kompetencji; sprawdzić organizację zastępstwa.                                                    | Średnie.                             |

Proponowany przegląd: przed realnymi danymi, po zmianie modelu/promptów, po błędzie
wpływającym na decyzję lub incydencie. Zapisać wersję, objaw, wpływ i działanie
w chronionej ewidencji właściciela; do repo trafiają wyłącznie syntetyczne przykłady.
[tests/cv-profiles.test.mjs](../../tests/cv-profiles.test.mjs) i
[tests/outreach.test.mjs](../../tests/outreach.test.mjs) sprawdzają mechanizmy,
nie prawdopodobieństwo szkód w produkcji.

## Otwarte pytania do prawnika

1. Jak oceniać dyskryminację i dobierać dane do badań bez nadmiernego zbierania cech wrażliwych?
2. Które ryzyka wymagają dodatkowych zabezpieczeń, konsultacji lub wstrzymania użycia?
3. Jakie zdarzenia, terminy i adresaci zgłoszeń dotyczą incydentów tej konfiguracji?
