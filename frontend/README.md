# Počasí Loučka – testovací frontend

Stav k 1. 11. 2026: rozpracovaný Astro frontend podle dodaného tmavého devítipanelového návrhu. Testovací web je dostupný na https://dev.pocasi-loucka.eu/; nejde o náhradu veřejné produkce. Další změny zaznamenávej do [changelogu](../CHANGELOG.md).

## Spuštění a ověření

Použij Node.js 24 a checkout aktuální větve `main`:

```bash
cd frontend
npm ci
npm run check
npm test
npm run build
npm run dev
```

Vývojový server je standardně dostupný lokálně. Automatický testovací deploy, API a konfigurace proxy jsou popsány v [deploy/lxc/README.md](../deploy/lxc/README.md). GitHub CI kontroluje frontend, ale samo o sobě nepotvrzuje, jaký commit LXC skutečně servíruje.

## Současné stránky a data

- **Přehled:** aktuální archivní hodnoty a graf přes API; kamera používá dodaný západní snímek. Předpověď, výstrahy a radar zatím nemají ověřený připojený zdroj.
- **Aktuálně:** poslední dostupný archivní záznam a směr větru. Není to sekundový živý LOOP.
- **Grafy:** jedna zvolená veličina, 6/24/72 hodin a tabulka archivních bodů. Grafy pro libovolné datum, více současných veličin a dlouhá agregovaná období z předlohy zatím chybí.
- **Klimatologie:** rozvržení přehledu bez zveřejněných statistik. Výběr období a grafy čekají na implementaci API a ověření dat.
- **Kamera:** snímek z uživatelem dodaného zdroje. Stránka obsahuje ruční obnovení a oznámení chyby načtení. Čas pořízení, automatická obnova, archiv a funkce v nasazeném prohlížeči vyžadují ověření.
- **Mapy a senzory:** stavy nepřipojených zdrojů; radar, vrstvy a ověřený registr fyzických senzorů zatím nejsou hotové.
- **O projektu:** přehled stanice a dat. Krajina v `public/landscape.svg` je ilustrace.
- **Mobilní zobrazení:** CSS obsahuje responzivní pravidla a mobilní menu. Kompletní vizuální a funkční kontrola všech stránek v reálném mobilním viewportu zůstává otevřená.

Barvy, hustota a obsah obrazovek zatím plně neodpovídají přiloženému návrhu. Chybějící data se nezobrazují jako nula ani jako skutečná demo měření.

## API a statistiky

Současný Fastify slice nabízí mimo jiné `/api/v1/current` a surovou `/api/v1/history`; hourly/daily historie a endpointy denních, měsíčních a ročních statistik nejsou implementované. [Produktový kontrakt](../docs/API_V1_PRODUCT_CONTRACT.md) je širší než implementace. Denní souhrny WeeWX jsou popsány v [auditu](../WEEWX_DAILY_SUMMARIES_AUDIT.md); práva stagingového DB účtu pro konkrétní denní tabulky dosud nebyla ověřena.

## Nasazená verze

Parser a komponenta pro validovaná metadata `/deployment.json` byly doplněny v `65691ea`; commit `62e8917` je zapojuje do layoutu a stránky projektu a upravuje deploy skript pro publikování metadat. Skutečnou dostupnost a správnost metadat na testovacím webu je nutné ověřit po nasazení. Úspěšné vytvoření commitu neprokazuje jeho nasazení.
