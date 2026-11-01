# Parser CV (MVP-09)

Rekruter uruchamia `POST /api/v1/applications/:applicationId/parse-cv` z sesją
lub kluczem `admin`, nagłówkami `Content-Type: application/json`,
`Idempotency-Key` i ciałem `{}`. Klucz `worker:outreach` nie daje dostępu.
Parser odczytuje tekst zapisany przez ekstraktor PDF i wywołuje wspólną bramkę
modeli z celem `cv-profile`.

Odpowiedź 200 zawiera `id`, `status: completed` i `profile`. Profil ma tablice
`skills`, `experience`, `education`, `languages`. Każdy element ma `value`,
`quote` (niepusty cytat) oraz logiczne `uncertain`. Wartość doświadczenia jest
obiektem `company`, `role`, `from`, `to`, `technologies`; daty są tekstem lub
`null`, technologie tablicą tekstów. W pozostałych kategoriach `value` jest
niepustym tekstem. Puste tablice oznaczają brak ustalonych faktów.

Cytat jest sprawdzany jako dosłowny fragment tekstu, bez normalizacji wielkości
liter lub odstępów. Brak fragmentu ustawia `uncertain: true`; parser zachowuje
też niepewność zgłoszoną przez model. Dosłowny cytat sam w sobie nie dowodzi
semantycznej poprawności faktu — ocena pozostaje po stronie rekrutera.

Profil i fakty są zapisywane atomowo w `cv_profiles` i `profile_facts`.
Błędny JSON, niezgodny schemat, brak tekstu lub przekroczenie rozmiaru wejścia
bramki zwracają 422 i zapisują profil `needs_manual_review` bez faktów.
Błąd dostępności lub limitu bramki zwraca 503 bez zapisu profilu.
Nie zmienia się etap aplikacji ani decyzja o kandydacie.

Powtórzenie zakończonego żądania z tym samym kluczem odtwarza wynik lub błąd,
bez dodatkowego profilu i wywołania modelu. Nowy klucz oznacza nową próbę.
Równoległe żądanie, którego wywołanie modelu jeszcze trwa, może otrzymać 503;
po zakończeniu należy ponowić ten sam klucz.

Testy używają deterministycznych odpowiedzi dostawcy `fake` przekazanych przez
bramkę. Domyślny demonstracyjny fake nie parsuje CV i jego odpowiedź trafi do
ręcznego przeglądu. Testy nie mierzą jakości rzeczywistego modelu ani progu
90% na korpusie ewaluacyjnym (osobne zadanie).
