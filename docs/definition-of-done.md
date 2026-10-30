# HireOS — propozycja Definition of Done

Status: propozycja do ustalenia z właścicielem, przed tworzeniem nowych tasków. Istniejący backlog jest materiałem roboczym, a nie dowodem gotowości produktu.

## Cel i granice

HireOS ma obsługiwać operacyjną pracę agencji rekrutacyjnej dla wielu firm w Polsce/UE, z docelowym rozszerzeniem na wszystkie branże. Osiem opisanych branż jest początkiem katalogu, nie pokryciem całego rynku. Astra nadzoruje rozwój; wybór modelu nadzorującego produkt, koszty i dostępność API wymagają osobnej walidacji. Antigravity/Luna mogą wykonywać proste zadania rozwojowe zgodnie z ustalonym zakresem.

„Zastępuje firmę 100-osobową” jest hipotezą biznesową. Weryfikujemy ją rzeczywistym wolumenem rekrutacji, jakością, kosztem i czasem obsługi, a nie liczbą agentów AI. Przed pilotażem trzeba ustalić bazę porównawczą: klientów, otwarte role, aplikacje/miesiąc, rozmowy, zatrudnienia, czas pracy i koszt obecnego procesu.

Autonomia operacyjna obejmuje przygotowanie ofert, publikację w dozwolonych kanałach, zbieranie aplikacji, porządkowanie dowodów, umawianie i prowadzenie uzgodnionych etapów rozmów oraz komunikację. Produkt wymaga ścieżki znaczącego ludzkiego nadzoru nad decyzjami zatrudnienia/odrzucenia, wyjątkami i odwołaniami. Nie uznajemy „zero ludzi” za zaakceptowane kryterium produkcyjne. Zakres zgodności z RODO, przepisami pracy i AI Act musi potwierdzić właściwy specjalista; samo dodanie przycisku zatwierdzania nie dowodzi zgodności.

## Poziom 1 — środowisko rozwojowe gotowe

- Prywatne repozytorium z wersjonowanym kodem, lockfile, instrukcją uruchomienia i bez sekretów.
- CI na pull requestach i main: QoQ, składnia, testy; błąd kontroli kończy pipeline niepowodzeniem. Przed pracą zespołową wymagane kontrole są egzekwowane regułami repozytorium, jeżeli plan GitHub to umożliwia.
- Dostępny prywatny podgląd na VPS, znany identyfikator wdrożonej wersji, status usługi, logi, restart i procedura przywrócenia wersji.
- Dane podglądu syntetyczne; brak publicznego dostępu do nieautoryzowanego API.

To kończy etap infrastruktury demonstratora, nie realizację HireOS.

## Poziom 2 — pojedyncza funkcja gotowa

- Zrozumiałe kryterium akceptacji z przykładem wejścia, rezultatu i zachowania przy błędzie.
- Działający przepływ UI → API → trwałe dane → integracja, jeśli dotyczy; mock nie zastępuje testu integracji.
- Uprawnienia i izolacja tenantów sprawdzone dla odczytu, zapisu, plików, wyszukiwania i zadań w tle.
- Obsłużone timeouty, retry, duplikaty, przerwanie i ponowienie; brak podwójnej wysyłki lub rezerwacji.
- Testy wynikające z ryzyka: logika domenowa, negatywne uprawnienia, kontrakty integracji i najważniejsze ścieżki E2E. QoQ i CI zielone.
- UI po polsku; stany ładowania, błędu, pustych danych i powodzenia; klawiatura, focus, czytelność i responsywność zgodnie z uzgodnionym design systemem Impeccable.
- Przegląd kodu; uzasadnione problemy rozwiązane; aktualne instrukcje, migracje, logi i sposób wycofania zmiany. Brak sekretów i danych kandydatów w logach.

## Poziom 3 — pilot z realnym klientem gotowy

- Pełna ścieżka: brief → zatwierdzenie wymagań → publikacja/formularz → aplikacja → materiały → rozmowa branżowa → zatwierdzona decyzja → komunikacja → archiwizacja/usunięcie.
- Rzeczywiste logowanie, role, tenant isolation, audyt operatorów i działań AI; sprawdzone próby dostępu pomiędzy firmami.
- Działający formularz, co najmniej jeden uzgodniony kanał pozyskania, jeden dostawca poczty, kalendarza i rozmów. Dostępy, umowy i limity portali potwierdzone; integracja bez uprawnień nie jest „gotowa”.
- Zdefiniowane podstawy przetwarzania danych, retencja, realizacja praw osób, informacja o AI, zasady nagrywania, umowy powierzenia i wymagane oceny wpływu. Zweryfikowane usunięcie danych i ścieżka odwołania.
- Wyniki AI oparte na materiałach i wymaganiach stanowiska, ze źródłami i oznaczeniem niepewności; brak domyślnych ocen osobowości i emocji. Testy jakości na reprezentatywnych, legalnie pozyskanych lub syntetycznych przykładach oraz próby prompt injection.
- Minimum trzy różne branże w pilotażu, w tym jedna z uprawnieniami zawodowymi. Każdy playbook zatwierdzony przez specjalistę dziedzinowego, dostępne usprawnienia dla kandydatów.
- Co najmniej jeden udokumentowany pełny scenariusz w każdej pilotowanej branży, obejmujący także awarię dostawcy i odwołanie spotkania. Bez otwartych krytycznych problemów bezpieczeństwa lub utraty danych.
- Dla automatycznego outreachu LinkedIn spełniono osobne kryteria [deklaracji Grok Bota i E2E](linkedin-outreach.md): docelowy VPS działa przez HTTPS, API ma ograniczony/rotowalny klucz, kolejka ma leasing i id zadania, a Mac jest wyłączony w teście niezależności.
- Przed każdą wysyłką sprawdzane są pauza i opt-out; timeout daje wynik `unresolved` bez automatycznego retry, a okno wyścigu pauza–wysyłka jest jawnie opisane i przetestowane bez obietnicy atomowości API i LinkedIn.

## Poziom 4 — gotowość produkcyjna i skala agencji

Proponowane progi do zatwierdzenia, nie osiągnięte wyniki:

- 30 dni pilotażu: dostępność 99,5%, co najmniej 99% poprawnie zakończonych kwalifikujących się zadań automatycznych w uzgodnionym czasie; błędy dostawców i ręczne interwencje raportowane osobno.
- Dla typowych operacji aplikacji p95 poniżej 1 sekundy przy uzgodnionym obciążeniu; długie zadania AI działają asynchronicznie i pokazują status.
- Przeprowadzony test obciążenia przy 2× uzgodnionego wolumenu szczytowego agencji. Nie ustalamy fikcyjnego wolumenu na podstawie liczby 100 pracowników.
- RPO maks. 24 h i RTO maks. 4 h potwierdzone odtworzeniem backupu; monitoring kolejek, błędów, opóźnień, kosztów modeli i integracji; powiadomienia z wyznaczonym właścicielem incydentu.
- Budżety per tenant, limity wydatków i wywołań, kill switch automatyzacji, bezpieczna praca po restarcie, rotacja sekretów i procedura incydentowa.
- Mierzone: czas od briefu do publikacji, czas koordynacji rozmowy, liczba interwencji na 100 aplikacji, koszt obsłużonej aplikacji i rekrutacji, odwołania/skargi oraz jakość materiałów oceniona przez specjalistów.
- Wykazana poprawa względem uzgodnionej bazy agencji bez pogorszenia jakości i praw kandydatów. Docelowy procent automatyzacji oraz oszczędności zatwierdzamy po pomiarze bazy.
- Każda kolejna branża przechodzi oddzielną walidację playbooka, wymogów zawodowych, zadania praktycznego i dostępności. Deklaracja „wszystkie branże” wymaga jawnego katalogu pokrycia i ścieżki obsługi nieobsługiwanej roli.

## Co trzeba ustalić przed nowymi taskami

1. Czy pierwszy cel to pilot obejmujący trzy różne branże, następnie rozszerzanie katalogu?
2. Jakie wolumeny i koszty konkretnej agencji stanowią punkt odniesienia dla „100 osób”?
3. Kto po stronie klienta odpowiada za znaczący nadzór, odwołania i decyzje dotyczące zatrudnienia?
4. Które portale i konta integracyjne są już dostępne oraz jaki jest miesięczny budżet infrastruktury i modeli?
5. Dla outreachu LinkedIn: jaki jest konkretny zakres rekrutacji i odbiorców, jakie niskie limity osobno dla zaproszeń, wiadomości i follow-upów oraz kto zatwierdza wynik `unresolved`?

Dopiero po ustaleniu tych punktów aktualizujemy podział na etapy i backlog. Nie tworzymy kolejnych tasków na podstawie niezatwierdzonych założeń.

Powiązane wymaganie: [LinkedIn Outreach z Grokbotem](linkedin-outreach.md) — zakres, pytania otwarte i warunki gotowości kanału wiadomości.
