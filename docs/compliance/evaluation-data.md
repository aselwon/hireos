# Dane i wyniki ewaluacji

**projekt — wymaga przeglądu prawnego**

[Generator](../../scripts/generate-cv-eval.mjs) tworzy deterministycznie 21 par
PDF i gold JSON w [eval/cv](../../eval/cv). Osoby, firmy, uczelnia i kontakty są
syntetyczne (domena `example.invalid`). To materiał testowy, nie dane treningowe
modelu ani próbka rzeczywistych kandydatów. Nie dokumentuje pochodzenia danych
treningowych dostawcy modelu.

Pokrycie obejmuje siedem obszarów IT, poziomy junior/mid/senior, 11 CV polskich
i 10 angielskich, cztery układy (standardowy, dwie kolumny, luki w datach, tabela),
cytaty i umiejętności dopiero poznawane. Szczegóły schematu gold:
[eval/README.md](../../eval/README.md). Jednostronicowe szablony nie obejmują
całej populacji, skanów ani wielostronicowych dokumentów. Nie stanowią badania
różnic wyników według cech chronionych.

[scripts/eval-cv.mjs](../../scripts/eval-cv.mjs) porównuje umiejętności, role,
okresy i języki z gold; domyślny próg wynosi 0,9 w każdej kategorii. Domyślny
tryb `replay` czyta gotowe profile z `eval/cv/replay`, bez wywołania parsera ani
modelu. Zapisany [raport replay](../../eval/results/2026-11-01T13-24-39.526Z.json)
ma 100% w tych czterech kategoriach, 21 przypadków i 0 szacowanych neuronów.
Jest dowodem zgodności fixture'ów z gold, nie 100% trafności Workers AI.
Gold i PDF pochodzą z tego samego generatora, co dodatkowo ogranicza niezależność.

[tests/cv-eval.test.mjs](../../tests/cv-eval.test.mjs) sprawdza m.in. odtwarzalność
korpusu; [tests/cv-profiles.test.mjs](../../tests/cv-profiles.test.mjs) sprawdza
walidację profilu i niepewność na deterministycznym dostawcy. Kontrola cytatów
w [lib/cv-profiles.mjs](../../lib/cv-profiles.mjs) sprawdza wystąpienie fragmentu,
a nie prawdziwość interpretacji. Sam wynik czterech kategorii nie mierzy
halucynacji, edukacji, kompletności wszystkich faktów ani równego traktowania.

Do dalszej oceny: niezależny przegląd gold i cytatów, zestaw przypadków brzegowych,
odrębny zbiór walidacyjny, pomiar błędów pominięcia i nadinterpretacji oraz
porównanie wersji modelu/promptu. Tryb live istnieje w evaluatorze i korzysta
z [bramki](../../lib/model-gateway.mjs); w MVP-35 go nie uruchamiano.
Ocena rzeczywistego modelu wymaga osobnego kontrolowanego wykonania w darmowym
limicie, bez prawdziwych CV. Nie należy przenosić wyniku replay na produkcję.

## Otwarte pytania do prawnika

1. Jakie dowody jakości i reprezentatywności są potrzebne do zamierzonego użycia?
2. Jak zaprojektować legalne badanie nierównego traktowania i dokumentację danych?
3. Jakie informacje o treningu i ograniczeniach należy uzyskać od dostawcy modelu?
