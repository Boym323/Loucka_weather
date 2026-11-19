# P1 · Testovací kompaktní mobilní úvod (19. 11. 2026)

## Rozsah
Roadmapa #152 uvádí, že mobilní první část domovské stránky je dlouhá a před specializovaným grafem a větrem návštěvník často potřebuje teplotu, srážky, předpověď a kameru. Tento PR **nepřepíná výchozí design**. Zpřístupňuje pouze dobrovolné porovnání prostřednictvím `/?mobile=compact`.

## Prototyp
- Na šířkách do 760 px mírně zkrátí dekorativní kamerový pohled. Nejde o změnu pořízeného snímku ani jeho provenance.
- Aktuální hodnoty, denní souhrn, výstrahy, odkazy Předpověď/Radar/Kamera zůstávají v původních komponentách, ve stejném pořadí.
- Specializovaná větrná růžice a historický graf jsou v testovací variantě sbalené, ale dostupné po aktivaci přístupného tlačítka klávesou Enter, mezerníkem nebo dotykem.
- V zobrazení je jasné testovací označení a návrat na původní variantu. Na běžné URL je design a pořadí nedotčeno. Není žádné ukládání preferencí ani měření návštěvnického chování.

## Důkazy a omezení
- Izolovaný Chromium screenshot test pro 320/390/1440 px, světlý/tmavý režim, ovládání klávesnicí, absence horizontálního overflow, rozdíl výšky hero a zachování komponent.
- Automatický test **nenahrazuje krátký skutečný uživatelský test**: minimální úkoly zjistit teplotu, srážky, předpověď, kameru a dostupnost větru/grafu pro časté návštěvníky.
- Výkonnostní LCP/FCP zlepšení nelze odvodit pouze ze zkrácení vizuální výšky. Meteorologická data ani rychlost API se tím nemění.
- Žádný produkční web, MariaDB, WeeWX, původní archiv ani rekonstrukční databáze se nemění.

## Ověření
`cd frontend && npm test && npm run check && npm run build`; potom `node scripts/mobile-home-variant-browser-check.mjs` v izolovaném `astro preview`. Po merge zkontrolovat `deployment.json` SHA a odezvu na DEV, ale bez výchozího zapnutí varianty.
