# Klimatologický atlas · dokončení vizuálního doladění (18. 11. 2026)

## Kontext
- PR #148 (`e101dd244a131e77604f25e27859b6e4cf9238ef`) už obsahuje
  původně navrhované samostatné mobilní karty, sjednocení grafů,
  obrazovější webkameru a mobilní ovládání.
- Tato navazující změna neimplementuje stejné funkce podruhé.
  Doplňuje jedinou zbylou významnou vizuální oblast: orientaci
  návštěvníka v klimatologickém atlasu.
- Referenční produktem ověřené DEV snímky před úpravou:
  GitHub Actions #44376964715; izolované světlé/tmavé snímky:
  #44373715994. Výchozí mobilní záběr řadí čtyři karty
  historických extrémů nad hlavní kapitoly.
  
## Změna rozhraní
1. Po úvodu a nativní mobilní navigaci následuje jasný nadpis
   **Vyber si kapitolu** a čtyři odkazy na Extrémy, Trendy,
   Srovnání sezón a Meteorologickou ročenku.
2. Karty používají stejnou typografii, vizuální akcent,
   mezery, focus-visible a dark-mode tokeny jako ostatní web.
   Na mobilu jsou stručnější a snadno ovladatelné.
3. Historické zajímavosti zůstávají dostupné níže. API,
   hodnoty, kvalita a upozornění na nejistotu se nemění.
4. Při chybě / prázdném výsledku API neukazujeme čtyři
   zbytečně prázdné karty s pomlčkami. Zůstává čitelná zpráva
   a skutečně funkční tlačítko **Opakovat načtení**.
5. V úspěšném stavu se původní čtyři rekordy vykreslí stejně
   jako doposud, včetně dat a kvality z původního archivu.

## Vizuální ověřovací kritéria
- 320 / 390 / 1440 px, světlý i tmavý režim.
- První kapitola na mobilu do 730 px od horního okraje.
- Prvky kapitoly musí být před historickými zajímavostmi,
  tedy dříve než prvky, jejichž API nemusí být dostupné.
- Bez horizontálního přetečení či skrytých ovládacích prvků.
- Není dovoleno označit nedostupná data za nulové hodnoty.
- Kamera, 24h graf, meteorologická data a původní dokument
  zůstávají beze změn.

## Rozsah a bezpečnost
Pouze Astro frontend, CSS, screenshot workflow a regresní testy.
Bez změny Fastify, MariaDB, WeeWX, historického archivu,
meteo API, live kolektorů a produkčního webu.

## Důkazy
Doplnit výsledek nového screenshot běhu a PR CI před sloučením.
