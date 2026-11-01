# Przeznaczenie systemu i zakres projektu

**projekt — wymaga przeglądu prawnego**

Stan opisany na 2026-11-01, zadanie MVP-35. Pakiet opisuje kod i proponowane
procedury; nie jest deklaracją zgodności, zatwierdzoną DPIA ani zgodą na produkcję.
Ocenę prawną i decyzję o użyciu z rzeczywistymi kandydatami podejmuje właściciel
po przeglądzie specjalisty. Niniejsze zadanie nie zmienia działania aplikacji.

HireOS wspiera jednego rekrutera w rekrutacjach IT: brief i ogłoszenie
([lib/advertisements.mjs](../../lib/advertisements.mjs)), przyjmowanie PDF,
profil z cytatami ([lib/cv-profiles.mjs](../../lib/cv-profiles.mjs)), raport wymagań
([lib/screening.mjs](../../lib/screening.mjs)) i decyzję człowieka
([lib/decisions.mjs](../../lib/decisions.mjs)). Nie służy do samodzielnego
odrzucania, oceny osobowości ani podejmowania decyzji o zatrudnieniu przez model.
Sourcing GitHub i zadania zewnętrznego wykonawcy opisują
[lib/github-sourcing.mjs](../../lib/github-sourcing.mjs) oraz
[lib/outreach.mjs](../../lib/outreach.mjs); HireOS sam nie wysyła wiadomości.

Założenie do przeglądu: zastosowanie do analizy aplikacji i oceny kandydatów
należy rozpatrywać jako system wysokiego ryzyka w rekrutacji — AI Act, art. 6
oraz załącznik III pkt 4 lit. a. Obecność człowieka nie jest sama w sobie
podstawą do wyłączenia tej kwalifikacji. Role dostawcy i podmiotu stosującego,
wyjątki, terminy stosowania i obowiązki w konkretnym modelu działalności wymagają
ustalenia przez prawnika; single tenant nie rozstrzyga tych kwestii.

Punkty odniesienia do przeglądu w aktualnym brzmieniu:
[AI Act, rozporządzenie 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
(art. 6, 12–15, 26, załącznik III pkt 4) oraz
[RODO, rozporządzenie 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
(art. 5, 6, 9, 13–22, 28, 32, 35–36 i rozdział V).
Próba odczytu EUR-Lex podczas przygotowania pakietu została zatrzymana przez
weryfikację JavaScript; aktualność tekstu i harmonogramu nie została potwierdzona.

Pakiet do wspólnego przeglądu:

- [Nadzór człowieka](human-oversight.md) — odpowiedzialność i pomijanie wyników AI.
- [Logi i retencja](logging-retention.md) — zapisane dane i luki retencji.
- [Rejestr ryzyk](risk-register.md) — szkody, istniejące mechanizmy i działania.
- [Dane ewaluacyjne](evaluation-data.md) — zakres pomiarów i ograniczenia.
- [Instrukcja rekrutera](recruiter-guide.md) — przebieg pracy i sytuacje wyjątkowe.
- [Projekt DPIA](dpia.md) — przepływ danych, proporcjonalność i decyzje otwarte.

## Otwarte pytania do prawnika

1. Jak zakwalifikować HireOS i role właściciela, zleceniodawcy oraz dostawcy modelu?
2. Jakie obowiązki i terminy AI Act dotyczą tej konfiguracji, w tym dokumentacji,
   rejestracji, informacji dla kandydatów, kompetencji osób i oceny skutków?
3. Jakie dowody oraz zatwierdzenia są konieczne przed użyciem z realnymi danymi?
