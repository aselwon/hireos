# Checklista onboardingu klienta

**projekt do przeglądu prawnego — nie do podpisu ani wysyłki klientowi.**

Checklistę wypełnia właściciel w kopii poza repo. Zaznaczenie punktu oznacza sprawdzenie dowodu, nie sam zamiar. Dowody i dane klienta przechowuje się poza repo; nie wklejać tutaj tokenów, CV, danych kontaktowych ani eksportów.

## Warunki rozpoczęcia

- [ ] [DECYZJA WŁAŚCICIELA] Uzupełnić identyfikator zlecenia, odpowiedzialną osobę, datę i miejsce przechowywania dowodów poza repo.
- [ ] [DECYZJA WŁAŚCICIELA] Zakończyć MVP-52: zatwierdzić warunki biznesowe, dane działalności i dokumenty po przeglądzie prawnym. Zachować wersje zaakceptowanej [oferty](oferta.md), [umowy](umowa-rekrutacyjna.md) i [dokumentu dotyczącego danych](role-rodo.md).
- [ ] [DECYZJA WŁAŚCICIELA] Potwierdzić role RODO dla rzeczywistych operacji, podstawy przekazania, klauzule, retencję, zabezpieczenia i dostawców. Wątpliwości przekazać prawnikowi przed użyciem danych.
- [ ] Potwierdzić wykonane przez właściciela wdrożenie z HTTPS, kontrolą dostępu i sprawdzonym odtworzeniem backupu zgodnie z [DoD](../mvp-dod.md). Agent nie wdraża systemu.
- [ ] Sprawdzić dostępność i wyniki weryfikacji funkcji MVP-46/47/48 z [planu](../../planning/tasks.json). Są to funkcje planowane; brak funkcji wstrzymuje zależny krok. Nie zastępować jej ręcznym przesyłaniem CV bez zatwierdzonych zasad.

## MVP-46 — klient i rekrutacja

- [ ] [DECYZJA WŁAŚCICIELA] Uzgodnić dane firmy, NIP i kontakt upoważniony do zlecenia; wprowadzić je do rekordu klienta w panelu poza repo.
- [ ] [DECYZJA WŁAŚCICIELA] Wprowadzić zatwierdzony model rozliczenia (success fee albo stała opłata), kwotę lub procent oraz zaliczkę zgodnie z umową; bez wartości domyślnych z tego szablonu.
- [ ] Utworzyć brief IT, przypisać rekrutację do właściwego klienta (`brief.client_id`) i sprawdzić klienta na liście w panelu.
- [ ] [DECYZJA WŁAŚCICIELA] Zatwierdzić stack, seniority, warunki pracy, macierz wymagań, harmonogram i sposób przekazywania informacji zwrotnej.

## MVP-47 — bezpieczna shortlista

- [ ] [DECYZJA WŁAŚCICIELA] Zatwierdzić odbiorcę, minimalny zakres danych, okres ważności linku i ewentualne dołączenie surowego CV. Domyślnie bez CV i bez dostępu klienta do panelu.
- [ ] [DECYZJA WŁAŚCICIELA] Wybrać kandydatów po weryfikacji przez rekrutera. Sprawdzić, że wymagana wersja zgody/klauzuli obejmuje przekazanie zleceniodawcy; brak właściwej wersji musi blokować dodanie do shortlisty.
- [ ] Na danych syntetycznych potwierdzić: otwarcie aktywnego linku zapisuje zdarzenie audytu, link wygasły i odwołany zwracają 404. Dowód testu zachować poza repo.
- [ ] [DECYZJA WŁAŚCICIELA] Zatwierdzić sposób przekazania linku właściwemu odbiorcy, zasady dalszego wykorzystania i procedurę odwołania. Link przekazuje człowiek poza harness; nie umieszczać go w repo.
- [ ] Jeśli przewidziano outreach do prawdziwych kandydatów, potwierdzić zaliczenie bramki kontrolowanego odbiorcy MVP-40/41, stop po odmowie, pauzie i przejęciu oraz ochronę przed duplikatami. Bez spełnienia bramki nie rozpoczynać kontaktu.

## MVP-48 — zdarzenia rozliczeniowe i eksport

- [ ] Zarejestrować właściwe zdarzenie dla klienta i rekrutacji: zaliczkę lub zatrudnienie (placement), z datą i wynagrodzeniem wymaganym do obliczenia należności; dane rzeczywiste wyłącznie poza repo.
- [ ] Porównać należność z podpisanymi warunkami; na danych syntetycznych potwierdzić wyliczenie success fee i stałej opłaty oraz dokładność kwot w groszach w CSV.
- [ ] Sprawdzić statusy „do zafakturowania”, „zafakturowane”, „opłacone” i audyt każdej zmiany; zmieniać status tylko na podstawie właściwego dokumentu lub potwierdzenia.
- [ ] [DECYZJA WŁAŚCICIELA] Zatwierdzić odbiorcę eksportu, zakres i bezpieczne miejsce przechowywania CSV oraz narzędzie do wystawienia faktury poza HireOS. Płatne narzędzie wymaga odrębnej zgody właściciela.
- [ ] Wyeksportować dane do faktury i porównać klienta, rekrutację, zdarzenie oraz kwoty z rejestrem. HireOS nie wystawia faktury i nie pobiera płatności.

## Zakończenie lub wstrzymanie

- [ ] Odwołać niepotrzebne linki, rozliczyć zdarzenia i wykonać uzgodnioną retencję, usunięcie lub zwrot danych; uwzględnić kopie pobrane przez klienta.
- [ ] [DECYZJA WŁAŚCICIELA] Potwierdzić zakończenie, ewentualny bieg gwarancji wymiany oraz sposób przechowywania dowodów wykonania obowiązków.
- [ ] [DECYZJA WŁAŚCICIELA] Przy brakach zapisać przyczynę wstrzymania, osobę odpowiedzialną i warunek wznowienia w dokumentacji zlecenia poza repo. Nie oznaczać niezrealizowanego punktu jako wykonanego.
