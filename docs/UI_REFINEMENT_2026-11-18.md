# Počasí Loučka — vizuální úpravy rozhraní (18. 11. 2026)

## Cíl a hranice
Navazující designová revize po PR #146 a #147. Zachovat skutečné meteorologické hodnoty,
jejich zdroje, označení kvalitativních stavů a chybějící intervaly jako NULL.
Nezasahovat do Fastify API, WeeWX, databází, live collectorů ani produkčního nasazení.

## Rozhraní
1. **Mobilní přehled**: aktuální měření, rychlé akce a denní souhrn jsou v přístupných
   skupinách. Větrná růžice a 24hodinový archivní graf mají od sebe oddělené jemnější
   karty. Na desktopu zůstává původní třísloupcové rozmístění.
2. **Grafy**: sjednocené ovládací prvky, čitelnost popisků, kontrast,
   informační a chybové stavy. Časová osa v kompaktní verzi má minimálně
   11px písmo. Nezměnila se logika grafů, dat, jednotek ani výběru veličin.
3. **Webkamera**: primární plochu vyplňuje skutečný obrázek s ověřitelným
   stavem načtení, ne ilustrace. Nová navigace ukazuje aktuální pohled,
   časosběr a fotografie. Časosběr je v archivu nad náhledy fotografií;
   video stále stahuje skutečná MP4 přes Range, datum a čas archivace
   nejsou vydávány za čas pořízení. Doplňkový směr pohledu zůstává v
   rozbalovacím panelu. Ovládání fullscreen/obnovování zůstalo zachováno.
4. **Motivy a přístupnost**: používáme stávající proměnné pro světlý i tmavý
   motiv, focus-visible, minimální 44px dotykové cíle u kamerové navigace,
   a podporu prefers-reduced-motion.

## Vizuální revize výsledného návrhu před PR
- Úspěšný izolovaný screenshot běh: [GitHub Actions #44373715994](https://github.com/Boym323/Loucka_weather/actions/runs/44373715994).
- Úvod 320 px: rychlé odkazy pod hlavním měřením při y = 612,6 px.
  Úvod 390 px: y = 550,6 px; vítr a 24h graf jsou samostatné karty.
- Kamera 320 i 390 px: tři kotvy fungují, galerie leží před sekundárním
  sidebar panelem a ovladače se skládají do **dvou** sloupců.
- Desktopová kamera 1440 px zachovává hlavní fotografii a boční informace.
- Úvod, atlas i kamera na šířkách 320/390/1440 px mají
  document.scrollWidth shodné s viewportem (žádný celostránkový
  vodorovný posuv).
- Snímky obsahují v části měření označené syntetické hodnoty a ostatní
  API může být ve stavu fallback. Screenshoty ověřují **rozložení**,
  nikoli aktuálnost skutečných meteorologických hodnot.

## Ověření
- Referenční snímky: poslední zelený veřejný DEV smoke před úpravou,
  GitHub Actions #44299836283 (390px a 1440px).
- Aktualizované snímky před PR CI: skript `frontend/scripts/ux-pre-ci-capture.mjs`
  na branch-only Astro preview, šířky 320/390/1440px a dvě varianty atlasu.
  Meteorologické hodnoty ve snímcích jsou výhradně označené fixture.
- Na nové revizi vyžadujeme Astro typecheck, unit testy a browser CI;
  porovnat viewport width proti scrollWidth, vizuálně zkontrolovat i
  stránku kamery a zejména skryté/viditelné stavy MP4.
- Referenční webkamera je externí JPEG a může v daném okamžiku zobrazovat
  poslední dostupný snímek. Čas pořízení není ověřován.
