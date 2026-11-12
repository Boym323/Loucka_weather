# Evidence meteorologických rekordů Počasí Loučka

Veřejný endpoint /api/v1/climate/records používá pouze původní denní souhrnné tabulky WeeWX pro teplotu, srážky a nárazy větru. Výsledky jsou předběžné a neprošly dokončenou forenzní kontrolou let 2009–2026. Fyzikální meze jsou pouze ochranou před zjevně nemožnými hodnotami a nenahrazují audit původních dat.

Mrazový den: minimum pod 0 °C. Ledový den: maximum pod 0 °C. Letní den: maximum alespoň 25 °C. Tropický den: maximum alespoň 30 °C. K započtení je potřeba platné minimum i maximum stejného kalendářního dne. Chybějící dny nejsou počítány jako dny bez jevu.

Pokrytí času platnými teplotními měřeními v roční statistice se počítá z WeeWX day_outTemp.sumtime v sekundách a skutečné délky místního kalendářního roku (CET/CEST). Publikuje se jen při konzistentních hodnotách. Nejde o certifikát kvality měření, pokrytí srážek ani stav historické rekonstrukce.

Fyzický inventář čidel zůstává neověřený. Lokální GW3000 potvrzuje půdní vlhkost kanálu 1, nikoliv hloubku nebo kalibrační historii senzoru. Proto neodvozujeme historickou půdní vlhkost z jiných veličin.

Endpoint je pouze GET, čte existující read-only ArchiveReader.dailySummaries, maximálně 7500 dní, cache 20 minut. Nikdy nemění původní ani rekonstruovaná data.

Pro definitivní rekordy je nutné dokončit kontrolu historických mezer, původu, jednotek a problémových srážek a schválené publikování opravených dat. Zatím není dovoleno označit výstup jako ověřené historické rekordy.

## Nový audit 2. 11. 2026

Aktuální evidence rekonstrukce a seznam povinných podmínek jsou v repozitáři Meteo_audit: `reports/2026-11-02-publication-readiness.md`, `reports/data/2026-11-02-reconstruction-evidence.json`. Přístup Weather MCP v tomto běhu umožnil read-only pracovní rekonstrukci, ale odmítl názvy dalších produkčních DB s tečkami/pomlčkami. Nejde tedy o novou kompletní certifikaci. Veřejné historické rekordy nadále musí být označeny za **předběžné** a nepřepínáme dataset na approved bez skutečné revize a QC.

## Nový read-only audit 12. 11. 2026

V [RAIN_ARCHIVE_IMPACT_2026-11-12.md](RAIN_ARCHIVE_IMPACT_2026-11-12.md) je přímé porovnání 18 ročních oken originálu a pracovní rekonstrukce do stejného cutoff. Známé původní srážkové anomálie mění pořadí ročních a denních rekordů. V atlasu zůstávají původní souhrny a předběžný stav; známý problém dne se označuje, nikoli nahrazuje pracovním maximem. Srážkový sklon vyžaduje časové pokrytí ≥90 % a vylučuje známá zásadní rizika. Žádná certifikace ani automatické přepnutí datasetu.
