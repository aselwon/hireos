# Prawa osoby w panelu

W raporcie kandydata sekcja **Prawa osoby** obsługuje zweryfikowane przez rekrutera żądania dostępu, usunięcia i sprzeciwu wobec kontaktu. Rekruter podaje rzeczywistą datę wpłynięcia; rejestr zapisuje ją, termin 30 dni i datę wykonania. Usunięcie wymaga zaznaczenia potwierdzenia. Operacje dotyczą wybranej aplikacji; jeśli osoba aplikowała do kilku rekrutacji, obsłuż każdą aplikację.

- **Pobierz dane i CV**: plik JSON z tabelami powiązanymi bezpośrednio i pośrednio, kontekstem rekrutacji, cache żądań, odpowiedziami modeli i CV w `files[].content` (base64). Dekodowanie base64 odtwarza oryginalny PDF. Plik zawiera dane poufne; przekazanie zweryfikowanemu odbiorcy wykonuje rekruter.
- **Zablokuj kontakt**: ustawia `do_not_contact`. Nowe zadania, claim, ponowienia wcześniejszych create/claim i preflight są blokowane. Już pobranej kopii danych u zewnętrznego wykonawcy nie można zdalnie usunąć; wykonawca musi sprawdzać preflight przed kontaktem.
- **Trwale usuń dane**: usuwa CV, aplikację, profile, fakty, raporty, decyzje, kolejkę przetwarzania, outreach i jego próby, powiązane cache oraz stare wpisy audytu. Pozostaje ślad `data.erased` bez danych osoby i bez identyfikatora aplikacji. Rejestr traci powiązanie z aplikacją; zachowuje daty oraz skróty techniczne do obsługi ponowień. Licznik kosztów AI pozostaje bez odpowiedzi modelu i powiązania z aplikacją, aby nie zwalniać dziennego limitu.

API administratora: `GET /api/v1/applications/:id/data-rights` zwraca rejestr, `POST` przyjmuje JSON `{"kind":"access|erase|object","receivedAt":"2026-01-01"}` i wymagany `Idempotency-Key`. Ponowienie z tym samym kluczem nie tworzy nowego wpisu. Eksport jest odczytywany ponownie z aktualnych danych, bez przechowywania kolejnej kopii archiwum w cache. Nie jest dostępny po usunięciu aplikacji. Klucz użyty z innymi parametrami daje HTTP 409. Konto wykonawcy outreachu nie ma dostępu do tych endpointów.

## Ograniczenia operacyjne

Aktywne wywołanie modelu blokuje usunięcie (HTTP 409); ponów po zakończeniu analizy. Osierocona rezerwacja po awarii procesu wymaga wyjaśnienia przez operatora. Błąd odczytu CV nie oznacza udanego eksportu. Błąd usuwania pliku wycofuje transakcję bazy; ponowienie toleruje już usunięte pliki. SQLite i system plików nie mają wspólnej transakcji: po przerwaniu operacji część plików może już nie istnieć, a rekordy pozostaną do skutecznego ponowienia.

Operacja usuwa dane z aktywnej bazy i magazynu CV. Nie usuwa istniejących backupów, pobranych eksportów ani kopii wykonawcy. Przy odtwarzaniu backupu właściciel musi ponownie uwzględnić wykonane żądania usunięcia. Fizyczne nadpisanie wolnych stron SQLite/WAL i nośnika nie jest gwarantowane. Przed użyciem z prawdziwymi osobami procedura nadal wymaga przeglądu prawnego wskazanego w SPEC.
