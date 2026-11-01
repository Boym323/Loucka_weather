# Testovací LXC: synchronizace main a HTTPS náhled

**Test only, not production.** Debian 13, Node.js 24, Git, nginx, systemd, user loucka. Nejprve nainstaluj podle níže uvedených kroků.

## Co se děje
- Timer každé cca 2 minuty načte GitHub main pomocí fetch + merge --ff-only. Odmítne přepsat lokálně upravené sledované soubory.
- Před publikováním spustí npm ci, Fastify testy, Astro check, frontend unit testy a Astro build.
- Výstup dist/ kopíruje do release složky označené celým commit SHA. Symlink current se změní až po úspěšném buildu. Předchozí build zůstává.
- Fastify z /api běží jako neprivilegovaná systemd služba na 127.0.0.1:3100. Node --watch pro testovací prostředí restartuje API při změně JS po novém buildu.
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
