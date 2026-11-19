# P2: Dotažení návštěvnického UX, grafů a kamery · 19. 11. 2026

## Co se změnilo
1. Na displejích do 650 px je k dispozici jediná hlavní navigace:
   spodní dock se čtyřmi přímými cíli a plně dostupným panelem `Více`.
   Druhé horní menu se skryje, neztrácí se žádná stránka.
2. Odborný graf `/grafy/` má nativně rozbalovací tabulku
   všech **skutečně vrácených** měření. Tabulka má interval,
   veličinu, hodnotu, kvalitu a zdroj/provenienci.
   Při chybějícím/suspect bodu uvádí pomlčku. Časy převádí
   do Europe/Prague. Rozbalení tabulky nedělá nový GET.
   Tabulka se vytváří až při otevření (ochrana výkonu).
   Původní CSV export zůstává beze změny.
3. Časosběr kamery používá skutečný archivní JPEG jako poster
   **pouze tehdy, pokud odpovídá kalendářnímu dni videa v
   Europe/Prague**. V ostatních případech je poster vynechán.
   Text výslovně upozorňuje, že nejde o ověřený okamžik z videa.
   Žádná falešná AI fotografie ani záměna času pořízení.
4. Tokeny a typografie jsou odvozeny ze stávajícího
   `ui-refinement.css`; bez přidávání dalších frameworků.

## Vizuální a behaviorální kontrola
- Na 320, 390, 1440 px ve světlém/tmavém režimu
  `node scripts/ux-media-history-browser-check.mjs`.
- V izolovaném API fixture musí mít tabulka čtyři řádky,
  kvalitu measured/missing/suspect/reconstructed, čísla se
  nesmějí objevit v missing/suspect buňkách.
- Otevření tabulky nepřidává nový API request.
- Kamera s videem a JPEG stejného dne zobrazí poster;
  přepnutí na video bez snímku stejného dne poster odstraní.
- Mobile dock `Více` zůstává přístupný a top `Menu`
  se nezdvojuje. Desktop navigace zůstává.
- Databáze, WeeWX, Fastify, srážkové QC a produkce beze změn.

## Omezení
Způsob dekódování H.264 ve skutečném iPhonu / Safari nelze
ověřit pouze headless Chromium; zachovat issue #143 pro ruční
test. Browser snímky jsou izolované a nesmějí být vydávány
za skutečné meteorologické hodnoty.
