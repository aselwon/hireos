# Instrukcja użytkowania dla rekrutera

**projekt — wymaga przeglądu prawnego**

Instrukcja opisuje panel [hireos/dist/app.js](../../hireos/dist/app.js) i API.
Nie jest potwierdzeniem gotowości produkcyjnej. Przed realnymi danymi właściciel
musi rozstrzygnąć kwestie z [DPIA](dpia.md), przygotować informację dla kandydatów
oraz potwierdzić HTTPS, dostęp i backup. Instrukcje techniczne:
[docs/auth.md](../auth.md), [docs/deployment.md](../deployment.md).

1. Zaloguj się własną sesją rekrutera. Nie udostępniaj hasła ani klucza `admin`
   wykonawcy outreachu. [lib/auth.mjs](../../lib/auth.mjs) rozdziela sesję i zakresy.
2. Utwórz brief IT: stack, seniority, wynagrodzenie, umowa i lokalizacja/remote.
   Sprawdź wygenerowane ogłoszenie i każde wymaganie, jego priorytet i wagę;
   popraw i zatwierdź dopiero po własnym przeglądzie.
   Mechanizmy: [lib/http-briefs.mjs](../../lib/http-briefs.mjs),
   [lib/advertisements.mjs](../../lib/advertisements.mjs).
3. Publiczny formularz przyjmuje PDF do 10 MB i wymaga zgody wraz z wersją.
   Sam checkbox nie rozstrzyga podstawy prawnej. Ekstrakcja i zapis:
   [lib/http-applications.mjs](../../lib/http-applications.mjs).
   Skan bez tekstu kieruje do `needs_manual_review`; brak OCR w MVP.
4. Uruchom parsowanie przez `POST /api/v1/applications/:id/parse-cv`, jeśli profil
   nie jest gotowy. Endpoint wymaga sesji albo `admin`, JSON `{}` i
   `Idempotency-Key`; kontrakt opisuje [docs/cv-parser.md](../cv-parser.md).
   Porównaj wynik z oryginalnym dokumentem udostępnionym w zatwierdzonym procesie
   operatora. Nie zakładaj, że raport zastępuje dostęp do PDF; nie kopiuj CV
   do publicznego zgłoszenia ani zewnętrznego narzędzia AI.
5. W aplikacji wybierz „Utwórz raport”. `met` to wskazany dowód, `missing` to brak
   dowodu, `uncertain` to niepewność. Żaden status nie stanowi decyzji.
   [lib/screening.mjs](../../lib/screening.mjs) wymaga gotowego profilu i macierzy.
   Nie podejmuj negatywnej decyzji wyłącznie na podstawie braku dowodu.
6. W „Decyzja rekrutera” wpisz własne uzasadnienie i wybierz zatwierdzenie albo
   odrzucenie. Możesz pominąć wynik AI; opisz przyczynę i źródło własnej oceny.
   [lib/decisions.mjs](../../lib/decisions.mjs) zapisuje decyzję i audyt.
   Szczegóły korekty i ograniczeń: [nadzór człowieka](human-oversight.md).

Przy `needs_manual_review` lub 422 zweryfikuj materiał ręcznie. Przy 503 nie
ponawiaj masowo ani nie zmieniaj dostawcy: [lib/model-gateway.mjs](../../lib/model-gateway.mjs)
może blokować wywołania do resetu o 00:00 UTC. Domyślny `fake` nie stanowi oceny
rzeczywistego CV. Powtórzenie zakończonej operacji używa tego samego klucza
idempotencji; nowa zamierzona próba wymaga nowego klucza.

Przy podejrzeniu błędu systemowego wstrzymaj ocenę i zgłoś właścicielowi objaw
oraz identyfikator, bez ujawniania treści CV. Żądanie dostępu, sprostowania,
usunięcia lub zakwestionowania decyzji przekazuj właścicielowi do obsługi;
aplikacja nie zapewnia kompletnego procesu realizacji praw.

Outreach prowadzi zewnętrzny wykonawca. Nie uruchamiaj kontaktu z prawdziwymi
kandydatami bez dopuszczenia przez właściciela i testu na kontrolowanym odbiorcy.
Pauza, przejęcie i odmowa są opisane w [docs/worker-api.md](../worker-api.md),
a egzekwowane w [lib/outreach.mjs](../../lib/outreach.mjs). Nie cofają wysłanej wiadomości.

## Otwarte pytania do prawnika

1. Jaką informację o AI, podstawie przetwarzania i prawach przekazywać kandydatom i kiedy?
2. Jak dokumentować kontakt, wyjaśnienie brakujących dowodów i obsługę odwołania?
3. Jakie zatwierdzenia musi otrzymać rekruter przed rozpoczęciem realnej rekrutacji?
