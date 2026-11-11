# RH 2022: izolovaný operátorský náhled přes SSH tunel

**Stav 11. 11. 2026:** Operátor na dev LXC ověřil skutečnou instalaci soukromého sidecaru na 127.0.0.1:3101: health/ready/UI HTTP 200, neautorizovaná data HTTP 401 a původní API 3100 HTTP 200. Autorizovaný test jednoho historického měření proti ověřenému balíčku prošel. Nejde o nezávislé schválení RH odhadů. Oddělený read-only audit časové mřížky, nevyplněných NULL a orientačních skoků je v [RH_2022_READONLY_QC_RUNBOOK.md](RH_2022_READONLY_QC_RUNBOOK.md); výsledky z LXC dosud nejsou ověřeny. Veřejný dev web zůstává v režimu `original`; WeeWX/Belchertown a produkční databáze se nemění.

## Princip

```
originální MariaDB archive (SELECT only)
             |
       Fastify sidecar:127.0.0.1:3101
             |          (bez LiveHub, archivačního polleru a GatewayObserver)
   neměnný privátní SHA-256 JSON
   /var/lib/loucka-qc/ (user loucka, mode 0700/0600)
             |
   oddělený bearer chráněný endpoint
             |
      HTML/JS rozhraní (stejný origin)
             |
   SSH localhost tunel z operátorova PC
```

Konstrukce úmyslně **nevyužívá Nginx** a nerozšiřuje veřejné `/api/v1` ani Astro: nové soubory `api/src/dev-rh-preview-main.ts`, `api/src/dev-rh-preview-entry.ts` a `api/src/dev-rh-preview-web.ts` se používají výhradně v samostatně aktivované systemd službě. Původní `api/src/main.ts` nepodstupuje žádné změny.

Služba odmítne start, pokud:
- zdrojové DB schéma není přesně `pocasi-loucka.eu`;
- `HOST` není `127.0.0.1` nebo `PORT` není `3101`;
- není zapnuta `WEATHER_STAGING_ENABLED=YES`, `WEATHER_DEV_PREVIEW_ENABLED=YES` a `WEATHER_DEV_PREVIEW_MODE=isolated_dev_only`;
- privátní JSON není v `/var/lib/loucka-qc`, má nesprávné vlastnictví/práva/rozsah nebo neodpovídá SHA-256 a přesným auditním počtům;
- nepoužívá databázového `SELECT-only` čtenáře; první `readyz` ověří funkčnost DB.

### Ověřený experimentální balíček 11. 11. 2026

Z předané diagnostiky na LXC je potvrzeno, že balíček obsahuje **5 153 změn** a má správné hash hodnoty i soukromá práva:

```text
/var/lib/loucka-qc/qc-rh-2022-dev-preview-c296d7dd830f733f.json
sha256(JSON.stringify(package)):
c296d7dd830f733f2b5563395fd6b33aafa76854ae1dc91b47746d297a267540
sha256(JSON.stringify(records)):
d2c48daa4cb22f53f16bc9c839cf4d51859dace525fc32669cd05b3c2f867e2f
```

Typy změn jsou původně chybějící RH → experimentální hodnota (2 874), podezřelá historická RH → jiná experimentální hodnota (2 194), a historicky zneplatněná RH → NULL (85). **Tyto rozdíly nejsou nezávisle meteorologicky ověřeny** a zůstávají `approved:false`.

## Jednorázové spuštění sidecaru

Na dev LXC jako root, až se nová větev po schválených CI testech objeví v `main`:

```bash
# Pokud automatický preview-sync ještě nestihl synchronizovat main:
runuser -u loucka -- git -C /home/loucka/Loucka_weather pull --ff-only origin main

# Kompilovat samostatnou vstupní jednotku; nevytváří žádný DB zápis.
runuser -u loucka -- sh -c 'cd /home/loucka/Loucka_weather/api && npm run build'

# Instalace je OPT-IN: přidá jen novou samostatnou unit a root-owned
# /etc/loucka-weather/rh-preview.env. Nevypisuje přístupový token.
bash /home/loucka/Loucka_weather/deploy/lxc/install-loucka-rh-preview.sh
```

Instalátor ověří hash balíčku, existenci přeloženého vstupu, schéma původního archivu, volný port 3101, vytvoří náhodný 64hex přístupový token (root-only env), instaluje separátní `loucka-rh-preview.service`, otestuje `/healthz`, `/readyz`, HTML UI a HTTP 401 bez tokenu a souběžně ověří původní API HTTP 200 na 3100.

`/etc/loucka-weather/api.env` **se nemění**; samostatný `rh-preview.env` při opakovaném spuštění není přepsán a token zůstane stejný. V případě selhání smoke-testů instalátor zastaví pouze novou sidecar službu.

Služba pouze čte originální archiv přes stávající `WEATHER_DB_USER` s již zavedeným SELECT-only privilege gate. Exportní účet pro `loucka_reconstruction` a jeho heslo **se při čtení API nepoužívají**; rekonstrukční hodnoty jsou už ve verzovaném souboru.

### Přístup z operátorova počítače

Na **svém počítači** otevři nové terminálové okno a spusť (zástupný hostitel nahraď adresou LXC v soukromé síti):

```bash
ssh -N -L 3101:127.0.0.1:3101 root@<ADRESA_DEV_LXC>
```

Potom v prohlížeči na svém počítači otevři:

```text
http://127.0.0.1:3101/dev/rh-preview
```

Operátor potřebuje soukromý token z root-only konfigurace. Na **LXC**, v terminálu, který nikdo nesdílí, zobraz pouze vlastní token:

```bash
sed -n 's/^WEATHER_DEV_PREVIEW_TOKEN=//p' /etc/loucka-weather/rh-preview.env
```

Zkopíruj ho pouze přímo do pole „Přístupový token“ v lokálním prohlížeči, **nikdy ho neodesílej do chatu nebo GitHubu**. Web UI jej drží jen v proměnné stránky; neukládá do `localStorage`, `sessionStorage`, cookies ani do URL. Při volbě „Odpojit“ jsou token a zobrazená data odstraněny z UI. HTTP odpovědi mají `Cache-Control: no-store`, CSP same-origin a `noindex`.

### Graf a tabulka

- Původní vs. experimentální relativní vlhkost, přepínání řad a datum v UTC.
- Délky výběru: 1/3/5 dnů, do 2 000 skutečných archivních bodů; `null` ani chybějící časové sloty se **nenahrazují nulami**.
- Rozlišení původního záznamu a auditně rekonstruované změny; explicitní historická invalidace.
- Přehled počtů a tabulka prvních 100 změn v intervalu s původní hodnotou, novou hodnotou a původní auditní dávkou.
- Zobrazené špičky, průměry a grafy nejsou klimatologické statistiky; jde jen o původní raw intervalové hodnoty v aktuálním výřezu.

**Omezení:** Používá pouze existující 5 153 změn relativní vlhkosti 2022, nikoli další metriky či nové datové rekonstrukce. Zdrojové časové značky představují konec pětiminutového intervalu `(start,end]`. Oprávněný operátor může pouze číst, nic schvalovat či opravovat přes HTTP.

## Ověření a rollback

Z LXC (bez tokenu):

```bash
systemctl is-active loucka-rh-preview.service
curl -i http://127.0.0.1:3101/dev/rh-preview/healthz
curl -i http://127.0.0.1:3101/dev/rh-preview/readyz
curl -i 'http://127.0.0.1:3101/api/v1/dev/preview/rh-history?from=2022-04-25T23:55:00Z&to=2022-04-26T00:00:00Z'
curl -i http://127.0.0.1:3100/api/v1/healthz
```

Očekává se 200, 200, **401**, 200. Privátní data netestovat logováním tokenu.

Při jakémkoli problému nebo po skončení operátorského testu lze **zastavit pouze oddělenou službu**:

```bash
systemctl disable --now loucka-rh-preview.service
```

Není potřeba vracet žádné DB změny, protože žádné nevznikají. Původní port 3100, systemd unit i Nginx konfigurace zůstanou nedotčené.

V budoucnu lze odděleně schválit autentizované propojení s Astro dev UI, ale pro první reálné ověření se úmyslně vyhýbáme veřejnému Nginx proxy. **Nikdy nedávat token do veřejného JavaScriptu.**
