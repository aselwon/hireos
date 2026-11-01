# Role RODO i projekty umów dotyczących danych

**projekt do przeglądu prawnego — nie do podpisu ani wysyłki klientowi.**

## Karta ustalenia roli

Nie przypisujemy jednej roli wszystkim działaniom wyłącznie na podstawie nazwy umowy. Poniższe warianty są propozycjami do kwalifikacji przez prawnika na podstawie faktycznego procesu. „Usługodawca” oznacza właściciela prowadzącego rekrutację; dane identyfikacyjne uzupełnia się poza repo.

| Obszar                                     | Pytanie do udokumentowania                                                              | Ustalenie                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Pozyskanie aplikacji i własna baza         | Kto określa cel, zakres danych, źródła, odbiorców i czas przechowywania?                | [DECYZJA WŁAŚCICIELA] Opisać faktyczny proces i kwalifikację prawną.                                          |
| Rekrutacja wyłącznie na instrukcje klienta | Czy usługodawca działa tylko w imieniu klienta, bez własnego celu wykorzystania danych? | [DECYZJA WŁAŚCICIELA] Udokumentować instrukcje i zakres powierzenia.                                          |
| Przekazanie shortlisty                     | Czy klient po otrzymaniu danych sam określa cele i sposoby dalszego przetwarzania?      | [DECYZJA WŁAŚCICIELA] Ustalić role przy przekazaniu i dalszym wykorzystaniu.                                  |
| Wspólne ustalanie procesu                  | Czy strony wspólnie określają cele i sposoby przetwarzania?                             | [DECYZJA WŁAŚCICIELA] Zlecić ocenę współadministrowania; nie stosować automatycznie żadnego wariantu poniżej. |
| Narzędzia i odbiorcy                       | Kto ma dostęp do danych, w tym hosting, modele AI i wykonawca outreachu?                | [DECYZJA WŁAŚCICIELA] Zweryfikować dostawców, lokalizacje, umowy i ewentualne transfery.                      |

- [DECYZJA WŁAŚCICIELA] Zatwierdzić mapę operacji i rolę dla każdej z nich, uzasadnienie, datę i wersję oceny oraz osobę dokonującą przeglądu prawnego — poza repo.
- [DECYZJA WŁAŚCICIELA] Wybrać wariant A dla odrębnych administratorów albo B dla powierzenia w danym zakresie. Przy procesie mieszanym rozdzielić operacje w załączniku; przy współadministrowaniu zlecić odrębny projekt i wstrzymać przekazanie do czasu zatwierdzenia.

Do przeglądu: [tekst RODO w EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=pl), zwłaszcza art. 4, 5–6, 13–14, 26, 28, 32–36 i rozdział V. Link wskazuje materiał dla prawnika, nie stanowi potwierdzenia aktualności ani zgodności tego projektu.

## Wariant A — projekt porozumienia o udostępnieniu między administratorami

Stosować tylko po zatwierdzeniu kwalifikacji ról. Ten wariant nie jest umową powierzenia.

1. **Strony i zakres.** [DECYZJA WŁAŚCICIELA] Oznaczyć administratora przekazującego i odbierającego, rekrutację, cel przekazania, kategorie osób i zamknięty zakres danych. Dane stron uzupełnić poza repo.
2. **Warunki przekazania.** Proponuje się przekazywanie wyłącznie danych niezbędnych dla uzgodnionej rekrutacji, po udokumentowaniu dopuszczalności przekazania. [DECYZJA WŁAŚCICIELA] Ustalić podstawy prawne każdej strony, zakres klauzul informacyjnych i dowód spełnienia warunków przekazania, w tym wymaganą wersję zgody w HireOS.
3. **Cel i odbiorcy.** Klient wykorzystuje dane w uzgodnionym celu i ogranicza dostęp do upoważnionych odbiorców. [DECYZJA WŁAŚCICIELA] Ustalić odbiorców, zasady dalszego udostępnienia oraz zakaz lub osobne warunki wykorzystania w innych rekrutacjach.
4. **Sposób udostępnienia.** Proponuje się wygasający i odwoływalny link do minimalnej shortlisty z rejestrem dostępu, bez surowych CV domyślnie. [DECYZJA WŁAŚCICIELA] Ustalić zakres danych, okres ważności, dopuszczalność dołączenia CV i sposób przekazania linku upoważnionemu odbiorcy.
5. **Prawa osób i bezpieczeństwo.** [DECYZJA WŁAŚCICIELA] Uzgodnić odpowiedzialność za informacje dla kandydatów, obsługę żądań, kontakty operacyjne, współpracę przy incydentach i terminy komunikacji. Każda strona ma zapewniać zabezpieczenia adekwatne do swojego zakresu działań.
6. **Retencja i zakończenie.** [DECYZJA WŁAŚCICIELA] Określić okresy i podstawy dalszego przechowywania przez każdą stronę, usunięcie kopii, potwierdzenie wykonania i warunki ewentualnego transferu poza EOG. Odwołanie linku nie usuwa wcześniej pobranych danych klienta.
7. **Akceptacja.** [DECYZJA WŁAŚCICIELA] Zatwierdzić czas obowiązywania, odpowiedzialność, tryb zmian, relację z umową rekrutacyjną i podpisy poza repo.

## Wariant B — projekt umowy powierzenia przetwarzania

Stosować tylko do operacji, w których klient jest administratorem, a usługodawca działa w jego imieniu. Nie uprawnia to usługodawcy do tworzenia własnej bazy kandydatów ani wykorzystania danych dla innych klientów.

1. **Przedmiot i czas.** [DECYZJA WŁAŚCICIELA] Oznaczyć strony i zlecenie, czas powierzenia, charakter i cel operacji, kategorie osób oraz typy danych. Zatwierdzić szczegółowy opis w załączniku przed przekazaniem danych.
2. **Instrukcje.** Podmiot przetwarzający działa wyłącznie na udokumentowane instrukcje administratora, także w sprawach transferów; odrębnie traktuje obowiązki wynikające z prawa. Informuje administratora, gdy instrukcja budzi zastrzeżenia co do zgodności z przepisami. [DECYZJA WŁAŚCICIELA] Ustalić kanał instrukcji, uprawnione osoby i procedurę wstrzymania oraz wyjaśnienia spornych działań.
3. **Poufność.** Dostęp otrzymują wyłącznie osoby upoważnione, zobowiązane do poufności lub objęte odpowiednim obowiązkiem ustawowym. [DECYZJA WŁAŚCICIELA] Uzgodnić zakres upoważnień i sposób dokumentowania ich nadania i odebrania.
4. **Zabezpieczenia.** [DECYZJA WŁAŚCICIELA] Zatwierdzić załącznik techniczny po sprawdzeniu stanu wdrożenia: kontrola dostępu, TLS, ochrona plików i kopii zapasowych, odtwarzanie, logi, retencja i procedury incydentów. Projekt nie poświadcza istnienia tych zabezpieczeń na produkcji.
5. **Dalsze powierzenie.** Korzystanie z dalszego podmiotu wymaga uprzedniego pisemnego upoważnienia administratora oraz zapewnienia odpowiednich obowiązków ochrony danych w umowie z tym podmiotem. Przy upoważnieniu ogólnym przewiduje się informowanie o zmianach i możliwość sprzeciwu. Podmiot przetwarzający pozostaje odpowiedzialny wobec administratora za wykonanie tych obowiązków przez dalszy podmiot. [DECYZJA WŁAŚCICIELA] Wybrać rodzaj upoważnienia, listę dostawców, zakres, lokalizacje, terminy i skutki sprzeciwu; zweryfikować Cloudflare i hosting przed użyciem danych rzeczywistych.
6. **Pomoc administratorowi.** Podmiot przetwarzający pomaga w obsłudze praw osób oraz obowiązków dotyczących bezpieczeństwa, naruszeń, oceny skutków i konsultacji, stosownie do charakteru przetwarzania i dostępnych informacji. [DECYZJA WŁAŚCICIELA] Ustalić tryb pomocy, zakres informacji, kontakty i terminy; odrębnie ocenić obowiązki związane z AI.
7. **Naruszenia.** Podmiot przetwarzający informuje administratora bez zbędnej zwłoki po stwierdzeniu naruszenia oraz przekazuje dostępne informacje i kolejne ustalenia. [DECYZJA WŁAŚCICIELA] Określić kanał, wymagane dane zgłoszenia i operacyjny termin umożliwiający administratorowi spełnienie jego obowiązków.
8. **Kontrola.** Podmiot przetwarzający udostępnia informacje potrzebne do wykazania realizacji obowiązków oraz umożliwia audyty i inspekcje administratora lub upoważnionego audytora. [DECYZJA WŁAŚCICIELA] Uzgodnić organizację kontroli, ochronę danych innych klientów i sposób usuwania stwierdzonych niezgodności.
9. **Zakończenie.** Po zakończeniu usług podmiot przetwarzający, według decyzji administratora, zwraca lub usuwa dane i kopie, chyba że prawo wymaga przechowywania. [DECYZJA WŁAŚCICIELA] Uzgodnić wybór administratora, terminy, postępowanie z backupami, wyjątki prawne i potwierdzenie wykonania.
10. **Transfery i akceptacja.** [DECYZJA WŁAŚCICIELA] Ustalić lokalizacje przetwarzania i dostępu, warunki ewentualnych transferów poza EOG, relację z umową główną, odpowiedzialność, tryb zmian i podpisy poza repo. Brak zatwierdzonych warunków wstrzymuje takie transfery.

## Załącznik operacyjny do wybranego wariantu

- [DECYZJA WŁAŚCICIELA] Opisać przepływ: źródło danych → analiza → shortlista → klient → zakończenie; dla każdego kroku wskazać rolę, cel, podstawę, zakres, odbiorców i retencję.
- [DECYZJA WŁAŚCICIELA] Udokumentować zatwierdzone klauzule dla kandydatów, wersje zgód, procedurę ich wycofania oraz żądań usunięcia; uzgodnić je z mechanizmami HireOS.
- [DECYZJA WŁAŚCICIELA] Zatwierdzić wykaz zabezpieczeń i dostawców, procedury incydentów, kontakty oraz dowody przeglądu prawnego — poza repo.
