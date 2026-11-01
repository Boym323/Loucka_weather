# Changelog

Průběžný záznam změn projektu Počasí Loučka. Data jsou uvedena v místním kalendáři; commit v `main` automaticky neznamená, že je už nasazen na testovacím webu.

## 2026-11-01

### Dokumentace

- Založen tento changelog a aktualizovány hlavní rozcestníky, stav frontendu a pravidlo průběžného vedení dokumentace.
- Opraveny zastaralé výroky o neexistujícím stagingu; rozlišena implementace v GitHubu, výsledek CI a ověření nasazení.

### Frontend a staging

### Vizuální redesign, reálné externí moduly a prohlížečový audit

- Úvodní dashboard: skutečná západní fotografie, kompaktní tmavý layout, předpověď Open-Meteo na 6 dní a radarová historie RainViewer s ovladači a uvedením zdrojů.
- Detail aktuálních údajů: graf nárazů větru, větrná růžice, doplňkové archivní kanály a informace o neověřeném fyzickém mapování.
- Historie: graf intervalových srážek, rozšířené veličiny ECharts; jednotky podle metrického katalogu a explicitní prázdná měření.
- Kamera: bohatší stránka s informacemi a výslovně chybějícím archivem; klimatologie stále čeká na skutečné validované agregace.
- Zavedeno automatické vizuální ověřování skutečného HTTPS dev webu v Chromium Playwright na desktopu 1440×900 a mobilu 390×844 včetně 16 screenshotů z osmi stránek.
- 1. 11. 2026 ověřena dostupná modelová předpověď a radar na desktopu i mobilu. Opravena nevhodná šířka předpovědi a formát hashovaných názvů radarových snímků RainViewer.
- Současný [stav a omezení](frontend/README.md).


- Stránka kamery: přidán panel s informacemi, ruční obnova snímku a stav načtení či chyby; čas pořízení zůstává neznámý.

- `62e8917`: integrace informace o nasazené verzi do patičky a stránky projektu a publikování metadat deploy skriptem; nasazení a metadata je třeba ověřit na webu.
- `65691ea`: připraven parser metadat nasazeného releasu a komponenta s unit testy.
- `a6a1aef`: přepracována stránka O projektu, doplněny informační karty a responzivní rozložení.
- `b68c178`: do přehledu a stránky kamery přidána adresa západního snímku poskytnutá uživatelem; čas snímku, archiv a zpracování výpadku vyžadují ověření.
- `6148ce2`: zhuštěno rozložení úvodního dashboardu.
- `952f124`: klimatologie přepracována do panelů; data a volba období čekají na API.
- `74ee53f`: zesvětlen ilustrační krajinný banner.

### Otevřené

Vizuální a funkční shoda všech stránek s předlohou, mobilní kontrola, víceřadové a dlouhodobé grafy, denní statistiky v API, ověření DB oprávnění, dostupnost a aktualizace kamery, radar, výstrahy, předpověď, registr senzorů a ověření informace o nasazené verzi. Viz [stav frontendu](frontend/README.md).
