# Testovací LXC: synchronizace main a HTTPS náhled

**Test only, not production.** Debian 13, Node.js 24, Git, nginx, systemd, user loucka. Nejprve nainstaluj podle níže uvedených kroků.

## Co se děje
- Timer každé cca 2 minuty načte GitHub main pomocí fetch + merge --ff-only. Odmítne přepsat lokálně upravené sledované soubory.
- Před publikováním spustí npm ci, Fastify testy, Astro check, frontend unit testy a Astro build.
- Výstup dist/ kopíruje do release složky označené celým commit SHA. Symlink current se změní až po úspěšném buildu. Předchozí build zůstává.
- Fastify z /api běží jako neprivilegovaná systemd služba na 127.0.0.1:3100. Produkční proces Node běží **bez `--watch`**: při pádu jej restartuje systemd. Po úspěšném sestavení a zveřejnění nového commitu root-owned aktivační helper restartuje API, počká na `/healthz` a `/readyz` a uloží poslední úspěšně aktivovaný commit. Při každém běhu timeru zdravé API se stejným commitem nerestartuje.
- nginx na TCP 8080 obsluhuje statický web a proxy /api/v1 na localhost 3100. Vnější TLS + Access List nastav v již existujícím Nginx Proxy Manageru. **Nesmí být otevřený přímo do internetu port 8080, 3100 nebo 4321.**

## Jednorázová instalace

Jako uživatel loucka v terminálu, kde neběží Astro, ověř čisté Git změny a přepni větev:

    cd ~/Loucka_weather
    git status --short
    git switch main
    git pull --ff-only origin main

Jako root:

    apt update && apt install -y nginx util-linux
    install -d -o loucka -g www-data -m 2755 /srv/loucka-preview /srv/loucka-preview/releases
    install -d -o root -g root -m 0700 /etc/loucka-weather
    install -D -o root -g root -m 0755 /home/loucka/Loucka_weather/deploy/lxc/loucka-preview-api-activate.sh /usr/local/libexec/loucka-preview-api-activate.sh
    install -o root -g root -m 0644 /home/loucka/Loucka_weather/deploy/lxc/loucka-preview-sync.service /etc/systemd/system/
    install -o root -g root -m 0644 /home/loucka/Loucka_weather/deploy/lxc/loucka-preview-sync.timer /etc/systemd/system/
    install -o root -g root -m 0644 /home/loucka/Loucka_weather/deploy/lxc/loucka-weather-api.service /etc/systemd/system/
    install -o root -g root -m 0644 /home/loucka/Loucka_weather/deploy/lxc/nginx-preview.conf /etc/nginx/conf.d/loucka-preview.conf

Vytvoř root-owned /etc/loucka-weather/api.env (nano, nikdy necommitovat) v syntaxi systemd EnvironmentFile:

    WEATHER_STAGING_ENABLED=YES
    WEATHER_DB_HOST=ADRESA_DB
    WEATHER_DB_PORT=3306
    WEATHER_DB_SCHEMA=pocasi-loucka.eu
    WEATHER_DB_USER=loucka_web_ro
    WEATHER_DB_PASSWORD=TAJNE_HESLO
    HOST=127.0.0.1
    PORT=3100

Použij pouze MariaDB účet s čistým SELECT. Heslo s whitespace nebo speciálními znaky správně zapiš podle syntaxe systemd EnvironmentFile (v případě pochybností použij uvozovky). Nastav chown root:root a chmod 600.

Ukonči ručně spuštěné API na portu 3100 (Ctrl+C), pak root:

    systemctl daemon-reload
    systemctl start loucka-preview-sync.service
    systemctl status loucka-preview-sync.service --no-pager
    readlink -f /srv/loucka-preview/current
    systemctl enable --now loucka-weather-api.service
    nginx -t && systemctl enable --now nginx && systemctl reload nginx
    systemctl enable --now loucka-preview-sync.timer

## Test

    curl -I http://127.0.0.1:8080/
    curl -sS http://127.0.0.1:3100/api/v1/healthz
    curl -sS http://127.0.0.1:3100/api/v1/readyz
    curl -i http://127.0.0.1:8080/api/v1/readyz
    systemctl list-timers --all | grep loucka
    journalctl -u loucka-preview-sync.service -n 50 --no-pager

Pro ruční spuštění kontroly:

    systemctl start loucka-preview-sync.service

Pro sledování:

    journalctl -fu loucka-preview-sync.service

Původní Astro HMR vývoj zůstává oddělený: v důvěryhodné LAN jako loucka můžeš spustit cd ~/Loucka_weather/frontend && npm run dev -- --host 0.0.0.0. Synchronizace stejné pracovní kopie přes Git automaticky projeví změny v běžícím Vite.

## NPM a přístup
Nastav v NPM Proxy Host pro vlastní testovací subdoménu (například dev.pocasi-loucka.eu *pouze pokud ji vlastníš a DNS správně směruje*), Forward Hostname/IP = IP testovacího LXC, Forward Port = 8080, SSL certifikát/Force SSL a Access List omezující návštěvníky. Nepovoluj 8080 na routeru směrem z internetu; NPM se k němu připojí po LAN. Vnější testovací web **nepatří do veřejného provozu**: backend není produkčně hardenovaný.

Pro vizuální kontrolu sdílej PDF/screenshot, nebo použij připojený prohlížeč v ChatGPT Work. Pouhé veřejné URL negarantuje interaktivní kontrolu obrazovky v textovém chatu.

## Obnova
Staré release se nemažou automaticky; sleduj disk. Před ručním rollbackem zastav timer, pak jako uživatel loucka přepni current atomicky na existující release SHA. Backend drží proces na portu 3100 a loguje journalctl -u loucka-weather-api.service. Pro přerušení automatických aktualizací:

    systemctl disable --now loucka-preview-sync.timer


## Informace o zveřejněné verzi
Po úspěšném sestavení se do statického release uloží soubor
/deployment.json se schemaVersion=1, branch=main, celým SHA commitu
a timestampem deployedAt v UTC. Teprve potom se atomicky změní
symlink current. Každá stránka má v patičce krátké SHA s odkazem
na GitHub commit a čas nasazení v časovém pásmu Europe/Prague.
Totéž je v sekci O projektu. Nejde o poslední commit na GitHubu
ani o změnu ve zdrojové databázi, ale o skutečně vydanou verzi HTML.

Ověření z Macu:

    curl -sS https://dev.pocasi-loucka.eu/deployment.json

Ověření na LXC:

    readlink -f /srv/loucka-preview/current
    cat /srv/loucka-preview/current/deployment.json

Frontend načítá metadata bez cache (včetně query parametru).
Během lokálního Astro HMR (bez vydaného release) se zobrazí
informace o místním vývoji, nikoliv smyšlené číslo verze.
Neukládej do deployment.json žádné přístupové údaje ani interní adresy.

## Aktualizace běžící instalace (oprava 502 z listopadu 2026)

Po sloučení opravy aktualizuj obě systemd jednotky **i** root-owned aktivační helper společně. Starou službu `node --watch` nesmíš nechat běžet společně s novou konfigurací. Jako root:

```bash
cd /home/loucka/Loucka_weather
# Pokud git pull nemá práva v účtu root, proveď jej pod uživatelem loucka:
runuser -u loucka -- git -C /home/loucka/Loucka_weather pull --ff-only origin main
install -D -o root -g root -m 0755 deploy/lxc/loucka-preview-api-activate.sh /usr/local/libexec/loucka-preview-api-activate.sh
install -o root -g root -m 0644 deploy/lxc/loucka-weather-api.service /etc/systemd/system/loucka-weather-api.service
install -o root -g root -m 0644 deploy/lxc/loucka-preview-sync.service /etc/systemd/system/loucka-preview-sync.service
systemctl daemon-reload
systemctl restart loucka-weather-api.service
systemctl start loucka-preview-sync.service
systemctl status loucka-weather-api.service loucka-preview-sync.service --no-pager -l
curl --fail --silent --show-error http://127.0.0.1:3100/api/v1/healthz
curl --fail --silent --show-error http://127.0.0.1:3100/api/v1/readyz
curl -i http://127.0.0.1:8080/api/v1/readyz
```

Aktivační helper musí být root-owned právě v `/usr/local/libexec/`: systemd ho spouští s vyššími právy přes `ExecStartPost=+`. Nikdy nespouštěj skript přímo z uživatelem `loucka` upravitelného pracovního repozitáře s root právy. API restartuje pouze po nové úspěšné publikaci nebo při nefunkční službě; při selhání readiness se poslední úspěšný stav nepotvrdí a systemd sync označí jako neúspěšný.

Pokud `/healthz` odpovídá 200, ale `/readyz` 503, není to už chyba proxy: ověř `WEATHER_DB_HOST`, spojení k MariaDB, účet se skutečně pouze `SELECT` a přístup k `archive`. Pokud roční klimatologie přesto selže, ověř existenci tabulek WeeWX `archive_day_*` a práva `SELECT` také k nim. Diagnostické výstupy a hesla neukládej do repozitáře.


## Bezvýpadkové změny statického frontendu

Aktivační helper porovnává Git strom `api/` mezi posledním aktivovaným commitem a aktuálním release. Pokud se změnil pouze `frontend/` nebo dokumentace a `healthz` + `readyz` vracejí zdravý stav, Fastify se **nerestartuje**. Poslední aktivovaný commit se přesto bezpečně aktualizuje. Pokud API není zdravé nebo se změnil strom `api/`, restart a health gate zůstávají povinné. Při skutečném nasazení nového API může stále vzniknout krátký výpadek; modro-zelené nasazení API zatím neexistuje.

Veřejný Playwright smoke čeká na správný `deployment.json` a dvě po sobě jdoucí připravené odpovědi `/api/v1/readyz`, aby nevyhodnocoval běžné přechodné 502 během aktivace jako dlouhodobou chybu.


## Doplnění sběru kamery a výstrah ČHMÚ (volitelné, jednorázové zapnutí)

Fastify stále pouze **čte** meteorologickou produkční databázi. Samostatné Python služby běží s uživatelem `loucka`, stahují veřejný JPEG a oficiální CAP XML a zapisují výhradně do dedikovaných lokálních adresářů ve staging LXC. **Nenabíhat na produkční WeeWX LXC**; na testovacím LXC archivace začne až zapnutím časovače. Od minulosti nelze zpětně dopočítat záznamy kamerového JPEG.

Ověř první, zda je správně použita veřejná a případně již anonymizovaná fotografie. Jednou jako root na **testovacím LXC** po aktualizaci main:

```bash
apt update && apt install -y python3 ffmpeg
install -D -o root -g root -m 0755 /home/loucka/Loucka_weather/deploy/lxc/loucka-data-collector.py /usr/local/libexec/loucka-data-collector.py
for unit in loucka-camera-collect.service loucka-camera-collect.timer loucka-alerts-collect.service loucka-alerts-collect.timer; do
  install -o root -g root -m 0644 "/home/loucka/Loucka_weather/deploy/lxc/$unit" "/etc/systemd/system/$unit"
done
systemctl daemon-reload
systemctl start loucka-camera-collect.service loucka-alerts-collect.service
systemctl enable --now loucka-camera-collect.timer loucka-alerts-collect.timer
journalctl -u loucka-camera-collect.service -u loucka-alerts-collect.service -n 40 --no-pager
curl -fsS http://127.0.0.1:3100/api/v1/camera/archive | jq .
curl -fsS http://127.0.0.1:3100/api/v1/alerts/local | jq .
```

Služby používají `StateDirectory` s `/var/lib/loucka-camera` a `/var/lib/loucka-alerts`. Není potřeba měnit nginx konfiguraci ani práva v MariaDB. Stávající Fastify API si při novém commitu samo obnoví backend; při uvádění do provozu případně `systemctl restart loucka-weather-api.service`. Pokud některý externí zdroj nebude dostupný, zůstane status `unavailable`; žádná automaticky domyšlená výstraha ani snímek se nevytvoří. CAP parser přímo ověřuje kód ORP 7209 (Loučka, okres Zlín). Pokud oficiální XML změní podobu nebo kódování oblasti, parser **odmítne** potvrdit stav „bez výstrahy“.

**Kamera:** snímky každých 10 minut; kontrola JPEG, opakovaný identický snímek se nearchivuje; retence 35 dní. Z uložených obrázků vzniká denní MP4 pro předchozí UTC den, pokud má alespoň šest snímků a FFmpeg je dostupný. Pro přehled API publikuje nejvýše 120 posledních JPEG a 45 MP4. Čas u souboru = čas stažení z veřejné adresy, není to EXIF/capture timestamp. Výkon a spotřebu úložiště kontroluj přes `du -sh /var/lib/loucka-camera`. Důležité: samotná veřejná fotografie může obsahovat osoby nebo jiný osobní obsah; archivaci zapínej pouze při schválených zásadách soukromí a případném maskování obrazu.

**ČHMÚ:** kontrola CAP po 10 minutách, TTL 45 minut, ukazuje jen ORP Valašské Klobouky, kód 7209. Při výpadku se nehlásí „bez výstrahy“. Není to oficiální varovný systém.

Pořadí: nejprve sloučit a nasadit API i statický web, pak jednorázově nainstalovat root-owned collector a systemd jednotky. `git pull` samo o sobě **neaktualizuje** root-owned soubor v /usr/local/libexec. Zápisová práva k `/var/lib/loucka-*` nikdy nepřidávej uživateli nginx ani veřejným HTTP cestám.

### Ověření nových archivních a klimatologických API

```bash
curl -fsS http://127.0.0.1:3100/api/v1/diagnostics/sensors | jq .
curl -fsS 'http://127.0.0.1:3100/api/v1/climate/solar?year=2025' | jq .
curl -fsS http://127.0.0.1:3100/api/v1/camera/status | jq .
curl -fsS http://127.0.0.1:3100/api/v1/camera/archive | jq .
curl -fsS http://127.0.0.1:3100/api/v1/alerts/local | jq .
```

Pokud diagnostika v produkčním archivu nevrátí žádnou telemetrii, je to důvod ověřit názvy existujících sloupců a jejich aktuální naplňování. Vývoj nepřevádí staré signálové stupnice na dBm ani napětí na procenta bez ověřené definice. Odvozená sluneční energie z globálního záření není měřená doba slunečního svitu. Počet mrazových dnů není počet dnů se sněhem.
