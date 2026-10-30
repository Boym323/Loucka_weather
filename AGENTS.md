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

## Co nyní neimplementovat
- Neslučovat historické databáze automaticky.
- Nesměšovat `rain` a `rainRate`; ani soilTemp s extraTemp.
- Nespravovat produkční `archive` ze součástí webu.
- Nepřidávat PHP, Rust, Next.js nebo další DB bez samostatného ADR s ověřeným přínosem.

## Převzetí změny
Každý PR uvádí: přesné soubory, důvod, testy včetně výsledků, migrace (pokud žádné, explicitně „žádné“), náklady RAM/CPU v případě relevantních změn, vliv na live databázi, možné selhání a rollback.
