# Kolejka przetwarzania CV

Nowe aplikacje zapisują zadanie w `cv_processing_jobs` w tej samej transakcji co
aplikację i plik CV. Migracja 006 nie uruchamia ponownie historycznych aplikacji.
Serwer sprawdza kolejkę co sekundę, przetwarzając maksymalnie 20 aplikacji na cykl.
Uruchamiaj jeden proces serwera dla jednej bazy SQLite.

Etapy to parsowanie i raport screeningowy. Każdy etap korzysta z trwałego klucza
idempotencji i wspólnej bramki modeli. Restart odczytuje kolejkę z SQLite, a zapisany
wynik etapu jest ponownie używany. Zakończenie serwera czeka na bieżący cykl.

Przy braku budżetu albo błędzie bramki zadanie pozostaje `queued`, z terminem
najbliższej północy UTC. Panel pokazuje „W kolejce”; powrót do listy aplikacji
odświeża status. Nie ma płatnego dostawcy ani fallbacku. Błąd dostawcy zachowuje
konserwatywne rozliczenie próby; nowy klucz jest używany dopiero kolejnej doby.
Nierozliczone rezerwacje po nagłym przerwaniu procesu nadal obciążają budżet,
zgodnie z zachowaniem bramki. Limit mniejszy niż koszt pojedynczego etapu nie
pozwoli go wykonać również następnej doby.

CV bez tekstu oraz niepoprawne wyniki wymagają ręcznego przeglądu. Kolejka nie
podejmuje decyzji o kandydacie. Usunięcie CV przez retencję usuwa też wpis kolejki.
