# Loučka Weather

Nový meteorologický portál pro https://pocasi-loucka.eu/ – **návrhová fáze**.

Tento repozitář se inicializuje dokumentací; zatím **neobsahuje běžící web** ani automatizované změny produkce.

## Směr projektu
- Ecowitt GW3000 a stávající WeeWX zůstávají sběrnou vrstvou.
- Stávající MariaDB s historickými daty zůstává; původní archiv je bez zásahů.
- Web: Astro + TypeScript; grafy ECharts; statický build mimo produkci.
- Oddělená read-only datová vrstva (první varianta Python), případně Rust až po benchmarku.
- Tři vrstvy statistik: přímé čtení `archive` (L1), existující `archive_day_*` WeeWX (L2), a **teprve po dalším schválení** volitelné vlastní agregace v odděleném schématu `loucka_weather_stats` na stejné MariaDB (L3). Webové API vždy používá účet pouze pro čtení; případný odvozený výpočetní worker bude samostatný.
- Tři LXC: stávající WeeWX, MariaDB a nový frontend + datová vrstva.
- Nový web nejprve pouze na stagingu. Produkční Belchertown zůstává dostupný.

Rozpracovaná specifikace bude ve větvi `docs/frontend-audit-v1`. Rozhodnutí s otevřenými variantami je třeba odsouhlasit před implementací.

## Zásadní bezpečnostní pravidla
- Žádné zápisy do produkčních databází ani změny WeeWX bez výslovného schválení.
- Nevystavovat přihlašovací údaje, interní adresy ani kamerová URL.
- Nepokládat chybějící měření za 0, nevydávat rekonstruované hodnoty za původní.
