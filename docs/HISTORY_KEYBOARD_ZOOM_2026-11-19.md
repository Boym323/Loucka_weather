# Ovládání historických grafů klávesnicí · 19. 11. 2026

## Reaudit (main `35504d9`)
PR #150 a #151 již odstranily duplicitní načítání `/api/v1/current`, zpřístupnily tabulkovou alternativu historie, zjednodušily mobilní navigaci a přidaly skutečný archivní snímek pro časosběr. Tato změna řeší jen další bod P2 v issue #152.

## Změna
- Tři nativní tlačítka **Přiblížit / Oddálit / Celé období** nad odborným grafem. Fungují s klávesnicí i dotykem.
- Příkazy mění procentuální okno stávající ECharts `dataZoom` akce; výchozí 100 %, přiblížení na polovinu, oddálení na dvojnásobek, minimální okno 2 %.
- Text pro asistivní technologie sděluje aktuální podíl časové osy. Posuvník ECharts i tabulková alternativa zůstávají.
- Tlačítka jsou vypnuta při načítání a při méně než dvou platných hodnotách; chybové stavy se nezakrývají.
- Žádný nový HTTP request, cache, přepočet měření ani změna původních časových značek.

## Ověřovací kritéria
1. `cd frontend && npm test && npm run check && npm run build`.
2. `node scripts/ux-media-history-browser-check.mjs` v izolovaném Astro preview s Playwrightem: šířky 320/390/1440, světlý/tmavý režim, Enter a mezerník mění zoom a obnovení nepotřebuje nový request.
3. Zachovat původní regresní testy failover, kvality dat, tabulky, kamery a WCAG; vizuální screenshoty po CI v obou motivech.
4. Skutečná ruční kontrola VoiceOver/TalkBack a iPhone Safari zůstává otevřená. Automatický Chromium test ji nenahrazuje.

## Hranice
Jde pouze o frontend a jeho testy. Žádná produkce, MariaDB, WeeWX, GW3000, rekonstruovaná nebo původní archivní data.
