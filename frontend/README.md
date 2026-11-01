# Počasí Loučka – Astro frontend (vizuální staging PR #7)

První spustitelná implementace schváleného devítidílného tmavého meteorologického dashboardu. **Není to veřejná produkce.** Astro 7.4.4, TypeScript 6.0.3, Apache ECharts 6.1.0, Node.js 24.

## Spuštění na testovacím LXC

Jako uživatel `loucka`:
```bash
cd ~/Loucka_weather
git fetch origin
git switch feat/astro-frontend-modular-scaffold
git pull --ff-only
cd frontend
npm ci
npm run dev -- --host 0.0.0.0
```
V prohlížeči v **důvěryhodné LAN**: `http://192.168.0.131:4321/`. Nezveřejňovat dev server do internetu. Standardní bind bez `--host` je pouze `127.0.0.1` a vyžaduje SSH port forwarding.

Hot Module Replacement (HMR) je aktivní. Vývojové změny jsou patrné po uložení bez buildu; produkční build se vytváří až pro release/CI.

## Backend a data

Fastify API z PR #5 běží jako **samostatný** proces na `127.0.0.1:3100`, proxy ve `astro.config.mjs` přesměruje `/api/v1`. Při nedostupném API frontend zobrazuje výslovný stav offline a prázdné hodnoty. Browser se nepřipojuje k MariaDB, tajné klíče nikdy nejsou ve frontendu. Aktuální měření využívá `/api/v1/current`; ECharts a detailní tabulka čtou `/api/v1/history` s limity 6/24/72 hodin.

Schéma meteorologických veličin a jednotek je v `../schemas/metrics.json` a `../openapi.yaml`. Tento první slice obsahuje pouze vybrané veřejné veličiny, v dalších krocích generujeme typy automaticky ze schématu.

## Funkce připravené vizuálně

- **/**: tmavý dashboard, hero grafika (označená ilustrace), aktuální hodnoty, skutečný archivní ECharts graf, transparentně nedostupné panely předpovědi/ČHMÚ/radaru/kamery.
- **/aktualne/**: detailní měření a větrná růžice napojená na `windDir`.
- **/grafy/**: interaktivní ECharts graf, přepínání teplota/vlhkost/tlak/vítr/intenzita srážek a 6/24/72 h, tabulka archivních bodů na vyžádání.
- **/klimatologie/, /kamera/, /mapy/, /senzory/**: připravené responzivní obrazovky se správně označenými nedostupnými daty, **zatím bez skutečných zdrojů**.
- **/o-stanici/**: informace o architektuře a meteo metodice.
- **Mobilní menu, dark default, volitelný light theme** přes tlačítko v hlavičce.

Grafy používají pouze uložené hodnoty, nedopočítávají imaginární body; `null` a `suspect` tvoří mezery. Časy jsou formátovány pro Europe/Prague. Minimální a maximální hodnoty v grafu jsou pouze za **vybraný klouzavý interval**, nikoliv automaticky kalendářní den.

Kamera/radar/předpověď/ČHMÚ nejsou připojeny, protože jejich aktuální zdroj a licenci teprve ověříme. Ilustrační vektor v `public/landscape.svg` **není skutečný snímek Loučky**. Nezobrazujeme demo data jako reálná měření.

## Testy

```bash
npm ci
npm run check
npm test
npm run build
```

Před sloučením PR provést také reálnou prohlížečovou kontrolu na desktopu/mobilu a porovnání s uživatelským devítipanelovým vizuálním návrhem. CI zatím ověřuje typy, unit testy a statický build, nikoliv pixelovou shodu nebo přístupnost v browseru.

## Další návaznosti

Pro hloubkovou klimatologii jsou nutné kvalitní agregace (API PR #5 nyní vrací pro hourly/daily 422). Senzory vyžadují ověřené fyzické mapování. Kamera, radar, předpověď a výstrahy vyžadují schválení jednotlivých zdrojů. Produkční CI/CD release a automatický rollback na LXC ještě nejsou hotové.
