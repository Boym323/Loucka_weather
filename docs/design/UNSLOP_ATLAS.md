# Unslop revize Atlas Minimal — 2. 11. 2026

## Kontext a směr

Metodika: **unslop**, Damir Sokolovsky ([heydamir/unslop](https://github.com/heydamir/unslop)), licence CC BY 4.0. Tento dokument při použití principů a terminologie uvádí autora. Neinstaluje se cizí runtime kód.

- **Produkt:** osobní meteostanice v Loučce se skutečnými daty GW3000 / WeeWX a historickým archivem od roku 2009.
- **Charakter:** klidný, přesný, místně zakotvený.
- **Prostředí:** meteorologický deník, mapa údolí, měřící přístroj. Přírodní metafory podporují orientaci, nesmějí přebít čísla.
- **Výrazný prvek:** skutečná aktuální teplota a graf vývoje naměřených hodnot. Kamera a radar jsou samostatné skutečné zdroje.
- **Podpis projektu:** přesně označený původ a čas měření, zejména jasné rozlišení GW3000, archiv WeeWX, model a nedostupnost.

## Výchozí audit (ověřeno v repozitáři, ne jen podle obrázku)

| Nález | Původní místo | Řešení |
|---|---|---|
| Dekorativní barevná krajina a maskující gradient soupeřily s číselným měřením | `index.astro`, `atlas-minimal.css`, `atlas-hills.svg` | Ilustrace a překryv odstraněny; primární plochu tvoří měření |
| Barevně tónované pozadí, tvrdé stíny a pilulková navigace | `atlas-minimal.css` | Neutrální světelná/stmavená paleta, jemná linka, malý stín jen u plovoucího menu |
| Slabá typografická hierarchie a mnoho váhy 700–800 | sdílené styly a hero | Střídmé 400/500/600, rozlišení spíš velikostí, lepší velikosti popisků |
| Emoji ve dnech modelové předpovědi | `ForecastPanel.astro` | Sedm SVG meteorologických piktogramů se sémantickým popisem pro čtečky |
| Směs glyphů v titulcích a navigaci | CurrentPanel, HistoryChart, RadarPanel, LocalWarnings, OverviewReadings, Přehled a BaseLayout | Jednotné čárové SVG `SiteIcon.astro` |
| Příliš malé a barevné předpovědní karty | `atlas-minimal.css` | Sjednocené dny v klidné tabulce s oddělovači a dostatečným místem pro SVG |
| Hlavní teplota a denní souhrn různé materiály | `atlas-minimal.css` | Jedna klidná plocha pro aktuální měření a lehce odsazený dnešní souhrn |
| Chybové a neověřené hodnoty | napojení na API | Beze změny datové logiky; neplatné hodnoty zůstávají `—` a stavy se zobrazují |

## Implementace po průchodech

1. **Spacing:** sjednocení hlavních mezisekčních rozestupů a karet na modul 4 px, úprava kompozice hero a hlavních analytických panelů.
2. **Color:** významově neutrální povrchy; jeden modrozelený akcent pro odkazy a aktivní stav; barvy měření pouze ve skutečných grafech.
3. **Icons:** společný `SiteIcon.astro`, ikonografie předpovědi bez emoji.
4. **Copy:** stručnější označení zdrojů, bez dekorativní hvězdičky a symbolu hodin v titulcích.
5. **Type:** větší druhotné popisky a lehčí nadpisy; jednotné tabulkové číslice.
6. **Layout:** velká hodnota a odborný graf; systém 11 samostatných stránek i všechny odkazy zůstávají.
7. **Details:** jemné oddělovače, méně stínů, srovnatelné rozměry navigačních prvků.
8. **Visuals:** odstraněna neužitečná krajinná ilustrace; zachována skutečná kamera/radar, výslovně označený čas snímku.
9. **Motion:** přechody pouze u smysluplných stavů; respekt k `prefers-reduced-motion`.

## Nezměněno a záměrně zachováno

- Živá data jen z ověřených GW3000 eventů, jinak archivní WeeWX fallback.
- Zdroj a kvalita jednotlivých měření, neznámé hodnoty nikoli jako nula.
- Předpověď Open-Meteo oddělená od skutečných pozorování.
- API, MariaDB a rekonstrukce historických dat beze změny.
- Všech 11 URL a jejich existující funkce zachovány.

## Validační kritéria

- Astro typecheck, unit testy, statické sestavení.
- Veřejný Playwright test všech 11 stránek desktop/mobil, žádné přetékání nebo runtime chyby.
- Hero bez zbytečné dekorativní ilustrace.
- Předpověď bez emoji, s jednotnými čárovými SVG ikonami; chybějící odpověď modelu nepředstírá předpověď.
- Světlý výchozí motiv, čitelný tmavý režim a původ měření.
- Dále vizuálně prověřit barevný kontrast všech sekundárních modulů a skutečné čtečky obrazovky; CI není úplný certifikát WCAG 2.2 AA.

## Technický dluh k samostatnému očištění

Historické CSS zůstává v `global.css` a `refinement.css`; výsledná hlavní podoba je v `atlas-minimal.css`. Při následném refaktoringu budou duplicitní pravidla nahrazena jedinou definicí design tokenů a přizpůsobeny starší specializované moduly. Mechanické sloučení těchto souborů bez vizuálního testu by nyní mohlo způsobit regresi.

---

Podklady: [Unslop skill](https://github.com/heydamir/unslop/tree/main/skills/unslop) a [Signs of slop](https://github.com/heydamir/unslop/blob/main/skills/unslop/references/signs.md). © Damir Sokolovsky, CC BY 4.0.
