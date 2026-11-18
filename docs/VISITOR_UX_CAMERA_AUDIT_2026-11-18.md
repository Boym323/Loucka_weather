# Návštěvnický audit webu Počasí Loučka – 18. 11. 2026

## Rozsah a důkazní základ
Audit zdrojových komponent aktuálního `main` pro návštěvnické stránky, zejména
`/kamera/`, `/stav/`, společné rozvržení, navigaci a archiv. Referenční
automatizovaný public smoke pokrývá 15 cest v desktopu (1440 px) a mobilu
(390 px) a dále existuje samostatná kontrola přístupnosti pro 320 px.
Při tomto auditu nebyl přímý vizuální či síťový přístup k běžícímu DEV serveru
z prostředí auditora k dispozici; **provozní fungování musí potvrdit až
následný veřejný smoke konkrétního commitu**.

## Potvrzená zjištění a implementované opravy

| Priorita | Zjištění | Oprava |
|---|---|---|
| P1 | Kamera – položky Archiv snímků a Časosběr směrovaly na stejný fragment stránky. | Samostatný cíl `#camera-timelapse-title`, scroll-margin pod sticky header. |
| P1 | Metadatový stav posledního archivního snímku mohl přepsat aktuální stav externího JPEG, i po chybě načtení. | Stav aktuálního obrázku určuje jen load/error; archivní aktuálnost se zobrazuje pouze v příslušném poli. Při chybě je místo rozbitého obrázku náhradní text a možnost obnovení. |
| P2 | Nové průběžné MP4 bylo možné objevit pouze úplným obnovením stránky, což znovu spouštělo desítky JPEG náhledů. | Tlačítko Načíst nejnovější obnovuje pouze JSON seznam MP4; nepřerušuje stejnou již přehrávanou verzi a zvolenou novější verzi načítá na výslovný klik. |
| P2 | Galerie měla permanentní 450ms časovač i po vyčerpání fronty náhledů. | Samovypínací plánování dalších JPEG, spuštěné pouze pokud čekají další snímky. |
| P2 | Stránka stavu opakovala monitorovací požadavky i při skryté kartě. | Pozastaveno 30s obnovování v neaktivní kartě, obnovení po návratu, odpojení listenerů při navigaci. |
| P3 | Hodiny ve společné hlavičce nevypínaly minutový interval při výměně Astro stránky. | Úklid časovače při `astro:before-swap`. |
| P3 | Kamera obsahovala interní provozní texty a slabší popis stránky. | Návštěvnická čeština, upřesnění časových zón archivu a denních videí, popis stránky pro vyhledávání. |

## Kontrola rozsahu změn

- Žádné změny MariaDB, WeeWX, historických meteorologických záznamů, přístupů nebo root-owned kolektoru.
- Nezkracovat bezpečnostní pravidla pro HTTP Range, originální JPEG a schválení produkčního nasazení.
- Před merge projít Astro check, frontend unit testy a statický build; následně Chromium smoke podle skutečně nasazeného commitu.
- Po merge na DEV potvrdit dvě rozlišené kotvy, správné zobrazení chyby JPEG, aktualizaci nabídky průběžných MP4 bez reloadu a přehrávání HTTP 206.

## Otevřené úkoly mimo tento bezpečný patch

1. **Živé vizuální/a11y ověření** na 320, 390 a 1440 px, v obou motivech (včetně klávesnice a dotyku); statické testy samy o sobě necertifikují WCAG.
2. **Reálná rychlost**: vzít srovnatelné opakované vzorky z `visitor-performance.json` a ověřit LCP/INP/CLS z reálného prostředí, nevyvozovat výkon z jedné laboratorní navigace.
3. **Provozní brány**: dle `docs/VISITOR_PERFORMANCE_AND_RELEASE_GATES_2026-11-17.md` zůstává produkce NO-GO do potvrzení DB grantů/sítě, backup/restore a rollbacku.

Audit nijak nemění publikaci rekonstrukčních meteorologických dat ani produkční systém.
