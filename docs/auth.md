# Logowanie i klucze API (MVP-02)

Serwer wymaga zmiennej środowiskowej `HIREOS_RECRUITER_PASSWORD` (12–1024 znaki).
Przekaż ją przez środowisko procesu, bez wpisywania hasła do repozytorium ani
argumentów polecenia. Brak poprawnej konfiguracji uniemożliwia start. Hasło jest
haszowane przez scrypt z losową solą przy starcie; nie jest zapisywane w bazie.
Zmiana hasła wymaga restartu serwera.

Otwórz `/login` i wpisz hasło. Panel, jego zasoby i `/api/state` wymagają sesji;
bez niej zwracają 401. Klucz API nie zastępuje sesji dla tych ścieżek.
Sesja ma losowy, nieprzewidywalny identyfikator i wygasa po 8 godzinach.
Serwer przechowuje jej hash w pamięci; restart unieważnia wszystkie sesje.
Cookie ma `HttpOnly`, `SameSite=Strict`, `Path=/` i `Max-Age=28800`.
Dla HTTPS ustaw `HIREOS_SECURE_COOKIE=1`, aby dodać `Secure`.
Serwer nadal nasłuchuje wyłącznie na loopback; konfiguracja HTTPS i reverse proxy
należy do osobnego zadania wdrożeniowego. Proxy musi zachować dozwolony lokalny
Host i zapewnić zgodność kontroli Origin; obecnie dopuszczone są tylko lokalne
adresy HTTP. Nie należy wyłączać tych kontroli przy wdrożeniu.

`POST /api/login` przyjmuje JSON z polem `password` i nagłówkiem `Idempotency-Key`.
Powtórzenie udanego żądania z tym samym kluczem zwraca tę samą sesję, bez
przedłużania jej ważności po stronie serwera. Zmienione hasło przy tym samym
kluczu daje 409. Po wylogowaniu powtórzenie nie reaktywuje sesji.
Limit wynosi 5 prób na 15 minut, globalnie dla jednego konta, niezależnie od IP.
Dotyczy również udanych logowań; powtórzenia udanego żądania nie zużywają limitu.
Po przekroczeniu zwracane jest 429, również dla powtórzeń udanych żądań. Limit jest w pamięci i resetuje się po restarcie.

Wylogowanie: `POST /api/logout`, JSON `{}`, `Idempotency-Key` i cookie sesji.
Operacja jest idempotentna i usuwa sesję oraz cookie. Można ją wykonać z konsoli
przeglądarki na stronie HireOS:

```js
await fetch('/api/logout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
  body: '{}',
});
location.assign('/login');
```

## Klucze API

CLI używa tej samej bazy co serwer (`HIREOS_DB`, domyślnie `data/hireos.sqlite`).
Uruchom je po pierwszym starcie serwera, który tworzy katalog danych, albo wskaż
bazę w istniejącym katalogu. Polecenia wykonuje uprawniony operator lokalny:

```sh
node scripts/api-key.mjs create operator-1 admin
node scripts/api-key.mjs create outreach-1 worker:outreach
node scripts/api-key.mjs revoke outreach-1
```

CLI wypisuje nowy klucz tylko raz na standardowe wyjście. Przechowaj go bezpiecznie;
nie przekierowuj do logów. Baza zawiera wyłącznie SHA-256 losowego klucza 256-bitowego.
Identyfikator podany w CLI jest kluczem idempotencji: ponowne utworzenie z tym samym
identyfikatorem i zakresem nic nie zmienia i nie ujawnia klucza. Inny zakres powoduje
błąd. Utracony lub odwołany klucz zastąp nowym identyfikatorem. Odwołanie jest trwałe,
idempotentne i działa od następnego żądania, także w już uruchomionym serwerze.
Zapisy kluczy to pojedyncze atomowe instrukcje SQLite.

Klient przekazuje `Authorization: Bearer <klucz>`. Zakres `admin` pozwala wykonywać
istniejące mutacje API; nadal wymagane są JSON i `Idempotency-Key`.
`worker:outreach` jest zarezerwowany dla przyszłego API zadań; nie daje dostępu do
mutacji panelu (403). Brak, błędny lub odwołany klucz daje 401.
Nie utworzono endpointów outreach w ramach tego zadania.

## Weryfikacja

`npm run ci` obejmuje testy handlera HTTP używanego przez serwer, sesji i funkcji CLI oraz kontrolę
braku jawnych kluczy w plikach SQLite, błędach CLI i odpowiedziach HTTP. Poza sandboxem należy sprawdzić
formularz `/login` w przeglądarce (błędne i poprawne hasło, wejście do panelu),
a po przygotowaniu HTTPS także atrybut `Secure` i działanie polityki Origin.
