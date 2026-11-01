# LinkedIn Outreach z Grok Botem — deklaracja dostawcy i warunki gotowości

## Status i zakres deklaracji

Użytkownik przekazał deklarację dostawcy Grok Bota: rutyny wykonują się na serwerze Grok Bota, a przeglądarka używana przez rutynę również jest po stronie Grok Bota, niezależnie od Maca. Jest to deklaracja dostawcy przekazana przez użytkownika, a nie dowód działania integracji. Wymaga kontrolowanego potwierdzenia E2E.

Poprzednia propozycja lokalnego workera na Macu nie jest docelową architekturą. Mac może służyć wyłącznie do kontrolowanego testu pełnego przepływu i musi być w tym teście wyłączony, aby potwierdzić niezależność wykonania.

Użytkownik wybrał automatyczny pierwszy kontakt oraz dalsze odpowiedzi według zatwierdzonych zasad. Rutyna musi zawierać instrukcję obejmującą konkretny zakres rekrutacji, ofert i odbiorców; sama ogólna zgoda na „automatyzację LinkedIn” nie wystarcza. Częstotliwość domyślna jest deklarowana jako około 5 minut, bez real-time SLA.

Nie zakładamy, że Grok Bot oznacza xAI. Model generujący tekst, rutyna, zdalna przeglądarka i kontrola wysyłki są osobnymi elementami, które wymagają oddzielnej walidacji.

## Docelowa architektura i kolejność uruchomienia

Docelowym celem jest publiczny VPS z HTTPS i API zabezpieczonym ograniczonym, rotowalnym kluczem. API udostępnia uwierzytelnioną kolejkę z leasingiem oraz identyfikatorem zadania. System zapisuje audyt, stan próby i wynik w sposób pozwalający odtworzyć przebieg oraz skierować niepewne przypadki do ręcznej interwencji.

Kontrakt zaimplementowanego API, endpointy, pola, stany i kody HTTP opisuje
[Worker API](worker-api.md). Dokument ten opisuje wymagania uruchomienia kanału
i kontrolowanego testu; nie stanowi potwierdzenia gotowości produkcyjnej.

Kolejność jest obowiązkowa:

1. HTTPS, API, ograniczony/rotowalny klucz, kolejka z leasingiem, id zadania i audyt.
2. Kontrolowany test pełnego przepływu z Maciem wyłączonym, obejmujący awarie, timeouty i pauzę.
3. Dopiero po pozytywnym potwierdzeniu E2E — aktywacja rutyny produkcyjnej w uzgodnionym zakresie.

Logowanie do zdalnej przeglądarki Grok Bota wykonuje właściciel. Hasło, cookies ani inne dane sesji nie trafiają do HireOS, API ani logów. Nie wystawiamy publicznego demo, nie generujemy sekretów i nie wysyłamy wiadomości w ramach tego wymagania.

## Zakres funkcjonalny i kontrola wysyłki

Po zatwierdzeniu kanału, zasad i zakresu rekrutacji funkcja ma obsługiwać:

- automatyczny pierwszy kontakt oraz dalsze odpowiedzi i follow-upy według zatwierdzonych reguł;
- jawne powiązanie zadania z tenantem, operatorem, ofertą, rekrutacją, odbiorcą i wątkiem;
- kolejkę z leasingiem, id zadania, deduplikacją, wygasaniem leasingu i audytem każdej próby;
- pauzę, opt-out kandydata, przejęcie przez człowieka i odłączenie kanału;
- wynik weryfikacji wysyłki oraz ręczną ścieżkę rozstrzygania niepewności.

Przed każdą wysyłką — nie tylko przed startem batcha — rutyna musi sprawdzić aktywną pauzę, opt-out, takeover, zakres rekrutacji/odbiorców i aktualne uprawnienie do wykonania zadania. Brak potwierdzenia z API oznacza „nie wysyłać”. Opt-out odebrany od kandydata blokuje kontakt przed następną wiadomością. Polecenie pauzy lub opt-out nie cofa wysyłki, która już się rozpoczęła.

Wyścig pauza–wysyłka musi mieć jawnie opisane i przetestowane okno: system opisuje, w którym momencie kontrola jest wykonywana, kiedy wysyłka uznawana jest za rozpoczętą oraz jak raportuje zmianę stanu w tym oknie. Nie obiecujemy atomowości między API a LinkedIn.

Domyślna deklarowana częstotliwość to około 5 minut; nie jest to gwarancja terminowości ani real-time SLA. Przed aktywacją trzeba uzgodnić niskie, konfigurowalne limity osobno dla zaproszeń, wiadomości i follow-upów. Nie deklarujemy bezpiecznej uniwersalnej liczby i nie obchodzimy limitów ani CAPTCHA.

## Wyniki prób i timeouty

Timeout wysyłki oznacza wynik `unresolved`, a nie zgodę na retry. Nie wolno wykonywać ślepego retry.

Worker API przyjmuje wyniki `sent`, `replied`, `needs_intervention`, `failed`,
`unresolved` i `refused`. Po wyniku `unresolved` ręczne rozstrzygnięcie raportuje
`verified_not_sent` (zadanie wraca do kolejki) albo `verified_sent` (zadanie
zamyka się jako `sent`). Są to wyniki weryfikacji, a nie automatyczne ponowienie.
Każda próba kontaktu powinna mieć jeden z jawnych rezultatów operacyjnych:

- `verified_sent` — potwierdzona wysyłka, z dowodem platformowym lub id, jeśli jest dostępne, oraz czasem;
- `verified_not_sent_retryable` — po sprawdzeniu właściwego wątku można bezpiecznie zaplanować ponowienie; w Worker API raportuje się to jako `verified_not_sent` z opisem sprawdzenia;
- `unresolved` — nie da się ustalić stanu; wymagana jest ręczna interwencja.

Sam brak widocznej wiadomości nie zawsze dowodzi niewysłania. Po `unresolved` nigdy nie wykonujemy automatycznego retry. Właściwy wątek, zakres sprawdzenia, dowód, czas, błąd i decyzja operatora trafiają do audytu.

## Warunki dostępu i bezpieczeństwa

Przed uznaniem funkcji za gotową trzeba potwierdzić:

- właściwy interfejs API Grok Bota, zakres operacji, uwierzytelnienie, rotację klucza i uprawnienia do kolejki;
- profil/nadawcę, konto LinkedIn, zakres odbiorców, konkretne rekrutacje i tenant/operator binding;
- limity, godziny wysyłki, liczbę follow-upów, opt-out, pauzę, takeover i sposób ustalania stanu po timeout;
- warunki dostawcy, zgodność z zasadami LinkedIn oraz brak obchodzenia ograniczeń i CAPTCHA.

Nie instalujemy nieznanego bota, nie przekazujemy HireOS haseł ani cookies, nie logujemy się za właściciela, nie wysyłamy wiadomości i nie generujemy sekretów w ramach tego wymagania. Agent nie wymyśla wynagrodzeń ani warunków, nie składa obietnic i nie podejmuje decyzji o zatrudnieniu. Dane rozmów są minimalizowane i odseparowane między tenantami; treść kandydata nie może zmieniać polityki wysyłki, uprawnień ani zakresu danych.

## Kryteria gotowości

- [ ] Deklaracja dostawcy o serwerze i przeglądarce Grok Bota jest oznaczona jako deklaracja przekazana przez użytkownika i potwierdzona kontrolowanym E2E.
- [ ] Docelowa architektura to publiczny VPS HTTPS + API z ograniczonym, rotowalnym kluczem; lokalny worker Mac nie jest wymagany.
- [ ] Działa uwierzytelniona kolejka z leasingiem, id zadania, deduplikacją, audytem i wynikami próby.
- [ ] Przed każdą wysyłką sprawdzane są pauza, opt-out, takeover, zakres oraz potwierdzenie API; brak potwierdzenia blokuje wysyłkę.
- [ ] Jawnie opisano i przetestowano okno wyścigu pauza–wysyłka bez obietnicy atomowości API i LinkedIn.
- [ ] Zaimplementowano semantykę `verified_sent`, `verified_not_sent_retryable` i `unresolved`; po `unresolved` nie ma automatycznego retry.
- [ ] Uzgodniono niskie, konfigurowalne limity osobno dla zaproszeń, wiadomości i follow-upów; nie ma obchodzenia limitów/CAPTCHA.
- [ ] Zdefiniowano instrukcję rutyny dla automatycznego pierwszego kontaktu i dalszych odpowiedzi, z konkretnym zakresem rekrutacji i odbiorców.
- [ ] Test E2E wykonano z Maciem wyłączonym oraz z awariami, timeoutami i pauzą; dopiero potem dopuszczono rutynę produkcyjną.
- [ ] Właściciel sam wykonał logowanie do zdalnej przeglądarki; hasło i cookies nie trafiły do HireOS ani logów.
