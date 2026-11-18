# Počasí Loučka – opravy po UX auditu 18. 11. 2026

## Provenience ověření
- Výchozí stav: `main` commit `c9b652116436b1a10b71822638978fef369f43bb`.
- Výchozí snímky: poslední zelený Chromium běh 44289731102. Výřezy 320/390/1440 px
  a klimatologie byly prostudovány **před vytvořením nového PR**.
- Nové snímky opravené větve mají vzniknout v samostatném branch-only preview
  (bez spuštění plného PR CI) v `test-results/pre-ci-screenshots`. Všechny
  meteorologické hodnoty pro snímkování jsou pouze izolované **testovací**
  hodnoty, nikoliv reálné údaje ze stanice.
- Nelze zaměňovat lokální Astro preview s běžícím DEV serverem. Veřejnou
  DEV doménu nebylo možné přímo načíst z prostředí auditora.

## Implementované opravy
1. **Mobilní úvod:** tři rychlé odkazy Předpověď, Radar, Kamera jsou přímo uvnitř
   meteorologického hero panelu, po aktuálních hodnotách a před větrnou růžicí
   a historickým grafem; desktopové třísloupcové uspořádání zůstává.
2. **Souběh live/archive:** neúspěšný GET archivu nepřepíše stav platného,
   časově čerstvého živého měření. Pokusy o obnovení archivu zůstávají.
   Po vypršení živého zdroje se dostupnost archivu opět ukazuje pravdivě.
3. **Mobilní navigace:** položka Klima je aktivní i na podstránkách atlasu.
4. **Vizualizační fixture:** test pro mobilní rozložení nyní posílá validní,
   samostatný API payload a explicitně uvádí TEST. Už nevkládá izolovaná
   čísla do nedostupného stavu; fyzikálně konzistentní příklad.
5. **Atlas:** rozšířené grafy rozděleny do tří nativních `details` sekcí.
   Při hlubokých odkazech se postupně otevřou všechny příslušné
   nadřazené sekce, bez odstranění grafů nebo jakýchkoliv měření.
6. **SEO DEV:** auditovaný `deploy/lxc/nginx-preview.conf` **již** obsahuje
   `X-Robots-Tag: noindex, nofollow` pro HTML. Není potřeba přidávat
   `<meta name=robots noindex>` do sdíleného Astro layoutu a ohrožovat
   indexaci budoucí produkce. Živou odpověď Nginx/NPM je stále třeba ověřit.

## Výsledek vizuální revize **před PR CI**
- Branch-only screenshot preview: [GitHub Actions 44297813387](https://github.com/Boym323/Loucka_weather/actions/runs/44297813387) – **PASS**, bez spuštění PR test suite.
- Úvod 390 px: rychlé odkazy začínají na y=536,6 px (dříve kolem 1 420 px);
  na 320 px y=574,0 px. Obě varianty se dostaly na první obrazovku a před vítr.
- Úvod: výška 390px snímku 4 933 → 4 896 px. Hlavní přínos je
  **přístupnost praktických informací**, nikoli zásadní zkrácení všech sekcí.
- Klimatologie 390 px se zavřenými pokročilými grafy: 10 898 → 2 572 px.
  Po otevření všech tří kategorií zůstává bohatý odborný obsah zachovaný.
- Vizuální kontrola 320, 390 a 1440 px pro úvod, atlas i kameru:
  document.scrollWidth odpovídá viewportu, bez celostránkového
  horizontálního přetečení. Nově opraveno i chybné „Otevřít analýzu · aktivní“
  na jasné „Zavřít analýzu“.
- Screenshoty používají real-data-shaped syntetické browser fixture;
  tyto snímky nejsou důkazem provozního API ani skutečných měření.

## Výslovně neuzavřené body
- Issue #143: ověření fyzického přehrání MP4 v iOS Safari a desktop Chrome,
  včetně posouvání v průběžném i dokončeném videu. HTTP 206 a H.264 byly
  samostatně ověřeny, ale nenahrazují tyto uživatelské E2E scénáře.
- Ruční posouzení 75 nedokončených kontrol kontrastu a reálné
  VoiceOver/TalkBack. Automatické Axe výsledky nejsou certifikát WCAG.
- DEV live smoke: skutečně nasazený commit, `readyz`, HTTP hlavičky,
  API data, měření webových metrik (LCP/CLS/INP).
- Samostatné provozní/security issue #69 a #124 vyžadují přístup ke stagingu,
  aktuálním závislostem a provozní dokumentaci; neprovádět neověřené změny
  firewallu nebo DB v čistě UI úpravě.

## Hranice
Bez zápisů do MariaDB, rekonstrukce archivu, WeeWX, live collectorů nebo
produkčního webu. Úpravy spadají pouze do Astro frontendu, jeho testů,
návštěvnického CSS a read-only dokumentace konfigurace.
