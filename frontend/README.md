# Počasí Loučka – modulární Astro frontend

První nezávislá vývojová implementace. Nejde o produkční nasazení, žádné demo číslo se nepředstírá jako skutečné měření. Zdroj měření je výhradně samostatné API v1 podle OpenAPI v kořeni repozitáře.

## Lokální start (Node.js 24)

Přepni Git na větev feat/astro-frontend-modular-scaffold, přejdi do frontend/, spusť npm install a poté npm run dev. Astro poslouchá jen na 127.0.0.1:4321. Prohlížeč připoj přes VS Code Remote SSH port forwarding na port 4321. Vývojové změny se aktualizují přes HMR bez build.

Příkazy:
- npm install – první instalace závislostí (vygeneruje package-lock.json, nutno commitnout před definitivním merge)
- npm run dev – vývojový server na 127.0.0.1:4321
- npm run check – typová kontrola
- npm test – doménové testy
- npm run build – produkční statický výstup do dist/

## API

Development proxy /api/v1 -> http://127.0.0.1:3100 je nakonfigurovaná v astro.config.mjs. Backend PR #5 není součástí této větve ani main. Pokud neběží, stránka korektně píše, že data nejsou dostupná, a zobrazí prázdné hodnoty. Žádná přihlašovací hesla ani interní IP adresy nejsou v klientovi.

Pro pozdější staging/prod: Nginx poskytuje statický dist/ a /api/v1 reverse-proxy na Fastify, oba na stejném původu. Frontend nemá přímé SQL spojení.

## Architektura

- src/pages/ – tenké Astro stránky
- src/features/current – samostatné měření
- src/features/history – samostatná tabulka historie, graf ECharts následuje po ověření
- src/shared/api – jediný typed klient vůči /api/v1
- src/shared/domain – model čtení metrik, čas a formátování
- src/shared/ui – generické znovupoužitelné komponenty
- src/styles – společné design tokeny

Modul senzorů zatím nezobrazuje vymyšlená metadata; /senzory je pouze výslovně označená stránka bez ověřeného registru. Produkce WeeWX/MariaDB/MCP není upravena.

## Co tato verze neslibuje

Nemá živé SSE, QC integraci fyzických senzorů, ECharts agregace, archiv kamery, produkční CI/CD release, reálnou databázi ani hotový dlouhodobý frontend. Následující PR doplní lockfile, generování DTO z OpenAPI, ECharts graf a E2E.
