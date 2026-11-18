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
