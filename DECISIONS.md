# DECISIONS – rozhodnutí, varianty a otevřené otázky

Datum: 2026-10-30. Dokument stanovuje stav návrhu. „Doporučení“ není potvrzení uživatele.

## Potvrzený směr z konverzace
- Tři LXC celkem: stávající WeeWX, stávající MariaDB, nový Loučka Weather.
- Nejprve staging a paralelní provoz se současným Belchertownem.
- Astro + TypeScript + ECharts pro frontend, Nginx servíruje statický build; bez produkčního buildování Next.js.
- **POTVRZENO:** backend webu přímo čte produkční databázi, do které zapisuje WeeWX; žádný pravidelný JSON export jako hlavní datová vrstva. Prohlížeč volá HTTP API, ne SQL. DB pro web je read-only; původní data zachovat.
- **POTVRZENO:** tříúrovňová statistická vrstva: L1 originální `archive`, L2 WeeWX `archive_day_*`, L3 volitelné samostatné schéma na **stejné MariaDB** s nákladnými předpočtenými agregacemi. Nevytvářet kopii všech historických měření.
- Tmavý vizuální koncept, podpora mobilu, světlý motiv; české popisky.
- Celý vývoj má být testovatelný a udržovatelný AI, s dokumentací a malými PR.

## Rozhodnutí k odsouhlasení
### Q1 – Z jakých dat má veřejná klimatologie standardně počítat?
- **A: Pouze originální `pocasi-loucka.eu.archive`** s QC a upozorněními. Plus: zřejmý původ. Minus: známé chyby / mezery zůstanou.
- **B: Validovaná rekonstrukce `loucka_reconstruction.archive`, kde je doložená, jinak originál (s metadaty)**. Plus: lepší historické statistiky. Minus: nutnost kvalitní provenance a revizí.
- **C: Oba pohledy se přepínají, výchozí originál**. Plus: transparentní, minus: složitější UI.
**Výchozí volba po potvrzení přímé práce s WeeWX DB: A (originální `pocasi-loucka.eu`).** Po ověření provenience lze doplnit možnost B nebo C, ale není automaticky schválena. Toto nebrání statickým ani dynamickým statistikám.

### Q2 – Výchozí motiv?
- A tmavý pro všechny; B automaticky podle systému (uživatel může ručně vybrat); C světlý.
**Doporučení: B.** Tmavý je vizuální reference, světlý musí být plnohodnotný.

### Q3 – Jaká úroveň živosti dat?
- A kontrola každých cca 20 s nad skutečným LOOP/GW3000 výstupem; B pouze 5min archiv; C WebSocket/SSE.
**Doporučení: A**, pouze pokud ověření současné konfigurace potvrdí zdroj živých dat. B jako fallback; C později pro konkrétní potřebu.

### Q4 – Kamera a dlouhodobá retence?
- A pouze aktuální snímek; B 5min archiv 30 dní + 1h náhledy dlouhodobě + denní timelapse; C bezlimitní archiv.
**Doporučení: B**, podle velikosti a volného disku. Před schválením nutno zjistit zdroj a soukromí záběru.

### Q5 – Předpověď a další zdroje
- A Open-Meteo + oficiální výstrahy ČHMÚ + existující mapový widget;
- B navíc archiv predikcí, modelové srovnání a vlastní radarový pipeline ihned.
**Doporučení: A pro MVP, B v další fázi**, po licenčním a provozním auditu.

### Q6 – Jazyk API nad MariaDB 11.8
- **A: Go** (`net/http` + `database/sql` + `go-sql-driver/mysql`) – doporučená první volba pro read-only API nad `archive` a `archive_day_*`.
- **B: Rust** (Axum + SQLx) – výkonná alternativa s přísnější typovou bezpečností, ale vyšší kompilační a vývojovou náročností.
- **C: Python** (FastAPI + ovladač MariaDB/MySQL) – vhodná alternativa, pokud převáží potřeba vědeckých datových knihoven.
**Výsledek auditu: doporučit A – Go. Finální volba pro implementaci je ještě k potvrzení.** Nejde o naměřený výkonový benchmark implementací. Podklad: [BACKEND_TECHNOLOGY_AUDIT.md](BACKEND_TECHNOLOGY_AUDIT.md).

### Q7 – Kdy zprovoznit vlastní předpočtené statistiky L3?
- **A: Nejprve pouze L1+L2** a změřit výkon/platnost denních souhrnů; L3 vytvořit až pro skutečně potřebné ukazatele.
- **B: Ihned vytvořit nové `loucka_weather_stats`** včetně backfillu historie a povolit separátní účet pro výpočty.
**Rozhodnuto pro první verzi: A – pouze L1 + L2.** Read-only audit potvrdil přínos stávajících WeeWX souhrnů. L3 schéma, migrace, DB role a první zápis vyžadují až samostatné schválení po benchmarku. Podrobnosti: [WEEWX_DAILY_SUMMARIES_AUDIT.md](WEEWX_DAILY_SUMMARIES_AUDIT.md).

## Překážky / neověřené skutečnosti
1. Skutečné LXC ID/umístění, CPU a paměť, síťové porty, současný způsob publikace Belchertownu.
2. WeeWX verze, ovladač Ecowitt, konkrétní zdroj 10–20s živých dat.
3. Přesné mapování půdních sond na hloubky a časové epochy, včetně přeznačení při migraci.
4. Schema a auditní provenance `loucka_reconstruction`; aktuální stav dokončených oprav, zejména vlhkost a srážky.
5. Zdroj URL kamery, autentizace, retention, disková kvóta a soukromí záběru.
6. Identifikátor relevantní územní jednotky ČHMÚ pro Loučku a skutečný CAP parser/aktualizační režim.
7. Licenční podmínky a přístup k radarovým vrstvám, LuhaMet a ILOUKA4.
8. Jednotlivé vizuální obrázky z předchozí konverzace nebyly přeneseny do repozitáře. Pro přesnější design je třeba přidat schválené reference.
9. Výkonnostní benchmark Astro CI/staging a test obnovy/rollbacku nebyly provedeny.
10. Provést v samostatné etapě přepočet souhrnů ve WeeWX a poté opakovat konzistenční kontrolu. **Doplňování ani historické rekonstrukce nyní nejsou součástí auditního úkolu.** L3 backfill a write-role zatím nejsou potřeba.

## Podmínka uzavření návrhového auditu
- Odsouhlasená politika Q1 (rekonstrukce).
- Fyzicky ověřené zdroje kamery a živých dat (neblokuje tvorbu prototypu).
- Uložení referenčního designu a kontrola alespoň tří reprezentativních stránek na desktopu/mobilu.
- Měřitelná kritéria akceptace; testy jednotek, DST a historických intervalů.
- Po uzavření rozhodnutí vytvořit ADR, aktualizovat všechny 3 SPEC a až pak implementovat na větvích.

## Další PR plán
PR-A: tento dokumentační návrh; bez deploy.
PR-B: metadata databází, OpenAPI/JSON Schemas, golden fixtures a **read-only dynamické API** přímo nad `pocasi-loucka.eu`.
PR-C: design systém + Astro přehled/graf/senzory s reálnými voláními `/api/v1/*`.
PR-D: staging CI/deploy, měření výkonu.
PR-E: klimatologie primárně z ověřených L2 souhrnů; **volitelné L3 pouze pokud konkrétní funkce/benchmark prokáže nutnost**, v odděleném pozdějším PR s DDL, testy, zálohou, rollbackem a schválením. Externí zdroje a kamera samostatně.
