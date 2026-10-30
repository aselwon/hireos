# Ewaluacja parsera CV

Zestaw MVP-08 zawiera **21 par** `cv/<id>.pdf` + `cv/<id>.json`.
Wszystkie osoby, firmy i uczelnia są fikcyjne. Adresy używają domeny
`example.invalid`; dokumenty są oznaczone jako syntetyczne. Nie korzystamy
z modeli, sieci, prawdziwych CV ani generatorów losowych.

## Odtwarzanie

W wymaganej przez repo wersji Node.js:

```sh
npm run eval:generate
npm test
npm run ci
```

Opcjonalnie `npm run eval:generate -- /tmp/hireos-cv` zapisuje zestaw poza repo.
Generator nadpisuje wyłącznie własne 21 par; nie usuwa innych plików.
Nie zapisuje daty wygenerowania, identyfikatora losowego ani ścieżki systemowej.
Test porównuje bajty PDF i JSON z repo oraz między dwoma uruchomieniami.
Ponowne uruchomienie daje ten sam wynik niezależnie od zegara i katalogu wyjściowego.

## Pokrycie

- Siedem obszarów: backend, frontend, mobile, DevOps, data, QA, security.
- Każdy obszar występuje na poziomach junior, mid i senior.
- 11 CV po polsku i 10 po angielsku, w tym polskie znaki w warstwie tekstowej.
- Układ standardowy: 01, 05, 09, 13, 17, 21.
- Dwie kolumny: 02, 06, 10, 14, 18 (profil i umiejętności po lewej,
  doświadczenie, edukacja i języki po prawej).
- Luki w datach: 03, 07, 11, 15, 19 (dwa okresy pracy z przerwą,
  bez dopowiadania jej przyczyny).
- Tabela: 04, 08, 12, 16, 20 (kolumny kategorii i treści, obramowane wiersze).
- Każde CV zawiera technologię dopiero poznawaną, oznaczoną `uncertain: true`.
- Każde CV ma dwa wpisy doświadczenia, edukację, język z poziomem CEFR
  oraz bieżące zatrudnienie z datą końcową `null`.

## Schemat gold, wersja 1

Gold jest listą kluczowych faktów, a nie kontraktem API parsera.

| Pole            | Typ     | Znaczenie                                            |
| --------------- | ------- | ---------------------------------------------------- |
| `schemaVersion` | liczba  | Obecnie `1`.                                         |
| `id`            | tekst   | Identyfikator zgodny z nazwą PDF, np. `cv-01`.       |
| `synthetic`     | boolean | Zawsze `true`.                                       |
| `language`      | tekst   | `pl` albo `en`: język dokumentu.                     |
| `area`          | tekst   | Jeden z siedmiu obszarów IT wymienionych wyżej.      |
| `layout`        | tekst   | `standard`, `two_columns`, `date_gaps` albo `table`. |
| `facts`         | tablica | Oczekiwane fakty opisane poniżej.                    |

Każdy element `facts` ma cztery wymagane pola:

| Pole        | Typ            | Znaczenie                                                              |
| ----------- | -------------- | ---------------------------------------------------------------------- |
| `field`     | tekst          | Ścieżka semantyczna faktu.                                             |
| `value`     | tekst lub null | Wartość znormalizowana, bez dopowiadania danych.                       |
| `evidence`  | tekst          | Dosłowny cytat z PDF; przy ekstrakcji wolno znormalizować białe znaki. |
| `uncertain` | boolean        | `true`, gdy cytat nie dowodzi opanowania danej umiejętności.           |

Dopuszczalne ścieżki: `role`, `seniority`, powtarzalne `skills`,
`experience.<indeks>.company`, `.role`, `.start`, `.end`, `.technologies`,
`education.<indeks>.degree`, `.institution`, `languages.<indeks>.name`, `.level`.
Indeksy od zera wiążą fakty w jeden wpis. Technologie i umiejętności są pojedynczymi
faktami, nie listami rozdzielanymi przecinkiem. Daty mają format `YYYY-MM`;
`null` w `.end` oznacza wyłącznie jawne „obecnie”/„present”.
`seniority` ma wartości `junior`, `mid`, `senior`. Nazwa języka jest kanoniczna
(`English` także dla cytatu „angielski”); poziom jest osobnym faktem.

Przykład:

```json
{
  "field": "skills",
  "value": "Kotlin",
  "evidence": "Dopiero uczę się: Kotlin",
  "uncertain": true
}
```

## Wykorzystanie i ograniczenia

Parser powinien otrzymać wyłącznie PDF, nigdy plik gold. Przyszły evaluator
powinien porównać wartości oraz powiązania wpisów i weryfikować cytaty oraz flagi
niepewności. Samo wystąpienie technologii w tekście nie potwierdza umiejętności.
Nazwy, kontakt i metadane układu nie należą do ocenianych faktów.

PDF-y mają jedną stronę A4, rzeczywisty tekst, standardową czcionkę Helvetica,
jawne kodowanie polskich znaków i mapę ToUnicode. Generator nie potrzebuje
zewnętrznych fontów ani zależności. Są to kontrolowane szablony, nie reprezentatywna
próba wszystkich CV. Zestaw nie obejmuje skanów/OCR ani wielostronicowych dokumentów.
Gold i dokument są budowane z tego samego opisu: test zgodności generatora
**nie jest pomiarem trafności parsera** i nie potwierdza progu 90% z DoD.

Dodatkowa kontrola niezależnym narzędziem (jeśli lokalnie jest Poppler):
`pdftotext -layout eval/cv/cv-01.pdf -`. Do przeglądu wyglądu otwórz po jednym
PDF z każdego układu, szczególnie polskie znaki, kolumny i granice tabeli.
Te narzędzia nie są zależnościami generatora ani CI.
