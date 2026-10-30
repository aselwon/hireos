# HireOS — design system v0.1

Kierunek: spokojny panel operacyjny, ciepłe neutralne tło, ciemna leśna nawigacja, limonkowe akcenty. Główną jednostką interakcji jest zadanie lub materiał do przeglądu; nie wynik rankingowy osoby.

Źródło tokenów prototypu: `hireos/dist/styles.css`. Galeria komponentów jest dostępna w zakładce Design system.

| Token   | Wartość | Użycie                                                              |
| ------- | ------- | ------------------------------------------------------------------- |
| canvas  | #F5F6F2 | Tło aplikacji                                                       |
| surface | #FFFFFF | Karty i dialogi                                                     |
| ink     | #172E28 | Tekst główny                                                        |
| brand   | #265B46 | Działanie główne                                                    |
| forest  | #142E27 | Nawigacja                                                           |
| lime    | #D8EDAB | Aktywna pozycja                                                     |
| muted   | #75817B | Tekst pomocniczy; przed produkcją sprawdzić kontrast małych etykiet |
| line    | #E3E8E0 | Separatory                                                          |
| amber   | #9A6928 | Wyjątek wymagający działania                                        |

Font: systemowy sans-serif, bez pobierania danych użytkownika do CDN fontów. Skala docelowa 12/14/16/20/28/36; prototyp ma również drobne etykiety 10–11 px, do walidacji czytelności w pilotażu. Odstępy 4/8/12/16/24/32/48. Promienie 8/12/18. Cienie tylko dla dialogów i toastów.

Komponenty: AppShell, WorkspaceSwitcher (docelowo), SideNav, PageHeader, PrimaryButton, StatusBadge, MetricCard, JobRow, CandidateTable, EvidenceList, TaskQueue, EventTimeline, IntegrationCard, FormField, NativeDialog, Toast, EmptyState. Stany każdej operacji: idle, pending, success, failure; niedostępna integracja nigdy nie wygląda jak połączona.

Wzorce: po zmianie etapu uzasadnienie i dziennik; destructive actions z konkretnym opisem skutku; krytyczne decyzje pokazują materiał źródłowy i osobę odpowiedzialną; skeleton tylko przy rzeczywistym ładowaniu; puste stany prowadzą do pierwszego sensownego kroku. W wersji demo nie pokazujemy wymyślonego ROI, konwersji ani „AI confidence” jako oceny człowieka.

Responsywność: desktop od 1100 px, kompakt 760–1100 px, mobile poniżej 760 px. Tabele mogą przewijać się poziomo, kontrolki pozostają dostępne klawiaturą. Produkcyjny cel: WCAG 2.2 AA, widoczny focus, pełne etykiety, kontrast co najmniej 4.5:1 dla zwykłego tekstu, target 44 px tam gdzie to możliwe, brak zależności od koloru, reduced-motion i sensowna kolejność czytania. Prototyp nie jest certyfikowanym audytem dostępności.

Język: polski, krótkie aktywne komunikaty, daty i godziny lokalizowane, nazwa strefy przy umawianiu spotkań. „Brak materiału” zamiast „nie spełnia”; „wymaga weryfikacji” zamiast nieuzasadnionego wyniku; „demo” i „niepodłączone” zawsze widoczne przy takich funkcjach.
