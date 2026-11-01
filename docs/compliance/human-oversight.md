# Procedura nadzoru człowieka

**projekt — wymaga przeglądu prawnego**

Odpowiedzialnym operacyjnie jest właściciel pełniący rolę rekrutera. Proponowana
procedura wymaga zapoznania się z ograniczeniami modelu, cytatów i zbioru
[ewaluacyjnego](evaluation-data.md). Kod nie potwierdza odbycia szkolenia.
Sesję i zakresy kluczy kontroluje [lib/auth.mjs](../../lib/auth.mjs).
Tożsamość sesji jest wspólna (`recruiter-session`), a nie imienną ewidencją
wielu pracowników: [lib/http-decisions.mjs](../../lib/http-decisions.mjs).

| Moment                  | Czynność rekrutera                                                                                             | Mechanizm i ograniczenie                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Przed publikacją        | Sprawdź związek wymagań ze stanowiskiem, popraw ogłoszenie i macierz, dopiero potem zatwierdź.                 | [lib/store.mjs](../../lib/store.mjs), [lib/advertisements.mjs](../../lib/advertisements.mjs): brief i wymagania; brak automatycznej oceny dyskryminacyjności. |
| Po parsowaniu           | Porównaj fakty, daty i cytaty z oryginalnym CV; `uncertain` wymaga wyjaśnienia.                                | [lib/cv-profiles.mjs](../../lib/cv-profiles.mjs): brak dosłownego cytatu ustawia niepewność, nie sprawdza znaczenia cytatu.                                   |
| Przed decyzją           | Sprawdź każde wymaganie i kontekst; brak dowodu nie oznacza braku umiejętności.                                | [lib/screening.mjs](../../lib/screening.mjs): `met`, `missing`, `uncertain`; raport nie odrzuca kandydata.                                                    |
| Przy decyzji            | Podejmij własną ocenę i zapisz jej uzasadnienie, także gdy pomijasz błędny wynik AI.                           | [lib/decisions.mjs](../../lib/decisions.mjs): `approved`/`rejected`, wymagany powód i aktor, zapis decyzji, etapu i audytu w transakcji.                      |
| Przy błędzie lub sporze | Wstrzymaj ocenę, sprawdź materiał ręcznie i eskaluj do właściciela; nie kopiuj danych do zgłoszeń publicznych. | Brak dedykowanego procesu odwołań; dostępna jest kolejna decyzja z nowym kluczem idempotencji, wcześniejszy zapis pozostaje.                                  |

Rekruter może zignorować raport i wybrać własną decyzję w formularzu
„Decyzja rekrutera” w [hireos/dist/app.js](../../hireos/dist/app.js). API decyzji
nie wymaga gotowego raportu ani nie uzależnia wyniku od statusów AI. W uzasadnieniu
należy wskazać zakwestionowane wymaganie, źródło i własną ocenę, bez zbędnych danych
osobowych. Nie ma osobnego znacznika „override” ani wymuszonego potwierdzenia
przeczytania dowodów. Pole `screening_report_id` istnieje w schemacie, ale obecny
zapis decyzji go nie wypełnia; powiązanie z konkretną wersją raportu nie jest pełne.

W razie powtarzających się błędów proponuje się zaprzestać generowania i prowadzić
przegląd ręczny do wyjaśnienia. Pauza rekrutacji/rozmowy, przejęcie przez człowieka
oraz odmowa blokują działania wykonawcy w
[lib/outreach.mjs](../../lib/outreach.mjs); nie są globalnym wyłącznikiem AI
ani możliwością cofnięcia wiadomości już wysłanej przez wykonawcę.
Testy mechanizmów: [tests/decisions.test.mjs](../../tests/decisions.test.mjs),
[tests/screening.test.mjs](../../tests/screening.test.mjs).

## Otwarte pytania do prawnika

1. Jak udokumentować kompetencje, uprawnienia i czas na rzeczywisty nadzór rekrutera?
2. Czy potrzebne są dodatkowe potwierdzenia przeglądu i powiązanie decyzji z wersją raportu?
3. Jak obsługiwać kwestionowanie decyzji, informować o AI i dokumentować ponowną ocenę?
