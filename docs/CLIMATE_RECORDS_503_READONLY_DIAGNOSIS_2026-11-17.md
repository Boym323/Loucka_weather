# DEV diagnostika historických rekordů – HTTP 503

Provozní měření 17. 11. 2026 v 19:44:45 UTC: endpoint /api/v1/climate/records vrátil osm HTTP 503 z osmi pokusů.
Ostatní endpointy (readyz, live/current, sensors/channels) odpověděly 8/8.
RSS Fastify během krátkého okna vzrostla z 69,08 na 69,34 MiB; to neprokazuje dlouhodobou stabilitu.

## Jednorázový DEV LXC test

Až se příslušný commit synchronizuje a sestaví do API dist, spusť jako root:

```bash
systemd-run --quiet --pipe --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/api.env \
  -- /usr/bin/node \
  /home/loucka/Loucka_weather/api/scripts/climate-records-diagnostic.mjs
```

Diagnostika je pouze čtecí a má stejnou staging podmínku jako původní kontrola bezpečnosti. Provede tři omezené SELECT dotazy původních denních souhrnů outTemp, rain a windGust, kontrolu kalendářních hranic Europe/Prague a čistou agregaci rekordů. Nespouští zápisy, migrace, restart ani HTTP požadavky. Nevypisuje přihlašovací údaje, adresy, SQL dotazy ani jednotlivé meteorologické hodnoty.

Výsledná hodnota stage rozlišuje daily_summary_read (problém SQL či čtení), calendar_validation (duplicitní/offgrid den), record_computation (chyba výpočtu), complete (izolované tři čtení i výpočet prošly). V posledním případě samotný endpoint může stále vracet 503 kvůli souběhu, cache nebo odlišné aktivní verzi; je nutný druhý nezávislý GET.

Pokud sonda vrátí SQL chybu, neodstraňovat práva, nevytvářet či nemazat tabulky automaticky. Jestli je chyba v historické časové hranici, neopravovat původní archiv a nevydávat nepodložená data za platné rekordy. Před jakoukoliv opravou přidat regresní test přesně pro zjištěný typ selhání.

Staging DB TLS a granty jsou na přání provozovatele odložené. Test není důkaz backupu, kontrola restore ani certifikace meteo historie.