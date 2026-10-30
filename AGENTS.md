# AGENTS.md – pravidla pro AI vývojáře

Před jakoukoliv úpravou si přečti `README.md`, `FRONTEND_SPEC.md`, `STATISTICS_SPEC.md`, `ARCHITECTURE.md` a `DECISIONS.md`. Tento repozitář je zatím pouze specifikace a nesmí se prezentovat jako již implementovaný web.

## Povinnosti
1. Nejprve ověř stav repozitáře, přesnou konfiguraci, schema a skutečné měřené datové zdroje. Nikdy nehadej DB tabulky, URL kamery nebo interní adresy.
2. Webový backend **čte MariaDB přímo při HTTP požadavcích** (přes parametrizované SQL, allowlist, limity, pool a cache). Prohlížeč se nesmí přímo připojit k DB. Bez výslovného schválení **žádné zápisy** do `pocasi-loucka.eu`, `loucka_reconstruction`, WeeWX konfigurace nebo produkčních služeb. Pozor: účet MCP může mít širší práva, než některé jednotlivé nástroje pro čtení.
3. Pro měření používáš vždy explicitně určenou databázi. Nepoužívej default `DATABASE()` bez ověření identity – může se měnit mezi historickou/rekonstrukční DB.
4. Výpočty jednotek, časových intervalů, DST a původu musí mít regresní testy na konkrétních fixtures. Původní, opravená, rekonstruovaná a modelová data odlišovat.
5. Na produkčním LXC nespouštěj build webu. Build provozuj v CI; změny staging dříve než prod.
6. Žádné live demo číslo nesmí vypadat jako skutečné měření; při absenci dat ukaž „Nedostupné“.
7. Nepoužívej předgenerované JSON soubory jako hlavní datový přístup k historii: požadovaná architektura je Nginx + Astro + interní Python HTTP API -> MariaDB SELECT.
8. Externí data používej z legálních/zdokumentovaných zdrojů, s attribution a timeouty.
9. Malé PR, vysvětlení rizik, testů, výkonu a rollbacku. CI musí projít před merge.
10. Vždy ověř grafickou podobu v desktopu i mobilu a světle/tmavém motivu.
11. Pokud zdroj není dostupný, zaznamenej blocker a pokračuj v bezpečné implementaci bez fabrifikace.

## Závazný tříúrovňový model statistik
- L1: `pocasi-loucka.eu.archive` pro detailní měření a krátkodobé grafy.
- L2: `pocasi-loucka.eu.archive_day_*` pro stávající denní souhrny a rychlé měsíční/roční agregace.
- L3: `loucka_weather_stats` je **pouze navržené volitelné schéma** na tomtéž MariaDB serveru. **MVP bude využívat pouze L1+L2** podle [WEEWX_DAILY_SUMMARIES_AUDIT.md](WEEWX_DAILY_SUMMARIES_AUDIT.md). Neimplementovat L3 bez měřeného přínosu a schválení.
- Webové API má pouze SELECT práva na schválené zdroje. **Případný stats worker** má oddělený účet, který smí po schválení zapisovat pouze do schválených vlastních statistických tabulek; žádné zápisy do originálního archivu, WeeWX denních souhrnů nebo rekonstrukční DB.
- Doplňování historie a rebuild souhrnů řeší WeeWX v samostatném procesu, **nejsou úkolem implementace frontendu**. Bez zvláštního schválení **nevytvářej tabulky, DB účty ani migrace, nespouštěj backfill**. V každém PR odděl přípravu migrací od jejího provedení na produkci.
- Nepředpokládej, že `archive_day_*` jsou očištěné po rekonstrukci; využívej explicitní origin/quality a verzi algoritmu.
- Při změně zdrojových dat nebo pravidel QC invaliduj dotčené odvozené statistiky, přepočti závislé rekordy; zpracování musí být idempotentní, atomické a testované na DB kopii.

## Co nyní neimplementovat
- Neslučovat historické databáze automaticky.
- Nesměšovat `rain` a `rainRate`; ani soilTemp s extraTemp.
- Nespravovat produkční `archive` ze součástí webu.
- Nepřidávat PHP, Rust, Next.js nebo další DB bez samostatného ADR s ověřeným přínosem.

## Převzetí změny
Každý PR uvádí: přesné soubory, důvod, testy včetně výsledků, migrace (pokud žádné, explicitně „žádné“), náklady RAM/CPU v případě relevantních změn, vliv na live databázi, možné selhání a rollback.
