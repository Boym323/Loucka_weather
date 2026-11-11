# Testovací LXC: synchronizace main a HTTPS náhled

**Test only, not production.** Debian 13, Node.js 24, Git, nginx, systemd, user loucka. Nejprve nainstaluj podle níže uvedených kroků.

## Co se děje
- Timer každé cca 2 minuty načte GitHub main pomocí fetch + merge --ff-only. Odmítne přepsat lokálně upravené sledované soubory.
- Před publikováním spustí npm ci, Fastify testy, Astro check, frontend unit testy a Astro build.
- Výstup dist/ kopíruje do release složky označené celým commit SHA a uloží kandidáta `.pending-commit`. **Symlink `current` se změní až po úspěšném sestavení a kontrole `/healthz` + `/readyz` API**. Při selhání API zůstane dosavadní frontend zveřejněný.
- Fastify z /api běží jako neprivilegovaná systemd služba na 127.0.0.1:3100. Node běží **bez `--watch`**. Po sestavení nového commitu root-owned helper aktivuje API, ověří `/healthz` a `/readyz`, jako uživatel `loucka` publikuje připravený frontend a uloží poslední aktivovaný commit. Zdravé API se stejným obsahem `api/` se nerestartuje. **Toto je gating publikace HTML, nikoliv plnohodnotný blue/green rollback backendu:** při chybném restartu API musí operátor obnovit také jeho předchozí binární verzi.
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

## Obnovení timeru po ručním zastavení / `active (elapsed)`

Timer se nesmí spoléhat jen na `OnBootSec`: při opětovném zapnutí dlouho po
startu systému může zůstat `active (elapsed)`, `Trigger: n/a`,
`NextElapseUSecMonotonic=infinity`, i když `enabled` / `active` vypadá dobře.
Proto `OnActiveSec=45s` naplánuje první běh relativně k aktivaci timeru;
`OnUnitInactiveSec=2min` pak plánuje další kontrolu až po dokončení
předchozího synchronizačního běhu (s `RandomizedDelaySec=10s` a
`AccuracySec=10s`). Nejde o pevnou minutovou hranici.

**Po sloučení opravy a s ověřeným root-owned helperem** se nový obsah unit
musí ručně nainstalovat na staging LXC. Git pull nemění již nainstalovaný
`/etc/systemd/system/loucka-preview-sync.timer`:

```bash
systemctl stop loucka-preview-sync.timer
runuser -u loucka -- git -C /home/loucka/Loucka_weather pull --ff-only origin main
install -o root -g root -m 0644 \
  /home/loucka/Loucka_weather/deploy/lxc/loucka-preview-sync.timer \
  /etc/systemd/system/loucka-preview-sync.timer
systemctl daemon-reload
systemctl start loucka-preview-sync.timer
systemctl show loucka-preview-sync.timer \
  -p ActiveState -p SubState -p NextElapseUSecMonotonic
systemctl list-timers --all loucka-preview-sync.timer
```

Musí se objevit `active (waiting)` a budoucí `NEXT` (ne `-`). Po prvním
aktivování služby ověřit v `journalctl -u loucka-preview-sync.service`
záznam `No changes since …` nebo úspěšný staged publish a následný nový
budoucí termín. Pokud se znovu objeví `active (elapsed)`, neoznačovat
pravidelný provoz za dokončený. Tento postup nemění produkční MariaDB,
GW3000 ani WeeWX.

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

## Povinný bezpečný přechod na staged publish (issue #69 / PR #58)

**NEPROVÁDĚT jen na základě zeleného CI.** Kód v tomto PR je připravený
pro review, ale GitHub Actions **nemůže ověřit**, jaký root-owned helper
se skutečně nachází v běžícím LXC ani jakou IP má Nginx Proxy Manager.
PR #58 ponech jako **draft** do dokončení bodů níže. Nejde o full
blue/green deployment: při neúspěšném restartu API může být nutné ručně
obnovit předchozí backend, i když `current` stále směřuje na starý
frontend.

### A. Zjistit výchozí stav – pouze čtení, stále běžící provoz

Na staging LXC (bez zobrazování `/etc/loucka-weather/api.env`):

```bash
systemctl cat loucka-preview-sync.service
systemctl is-enabled loucka-preview-sync.timer || true
systemctl is-active loucka-preview-sync.timer || true
systemctl show loucka-preview-sync.service -p ActiveState -p SubState
stat -Lc '%U:%G %a %n' /usr/local/libexec/loucka-preview-api-activate.sh
sha256sum /usr/local/libexec/loucka-preview-api-activate.sh
readlink -f /srv/loucka-preview/current
cat /srv/loucka-preview/current/.source-commit
curl -fsS --max-time 5 http://127.0.0.1:3100/api/v1/healthz
curl -fsS --max-time 5 http://127.0.0.1:3100/api/v1/readyz
curl -fsS --max-time 10 https://dev.pocasi-loucka.eu/deployment.json
```

Výstup `systemctl cat` ověř proti skutečné instalaci: `ExecStartPost`
musí používat **`+/usr/local/libexec/loucka-preview-api-activate.sh`**;
nesmí být namířen na repozitář zapisovatelný účtem `loucka`.
Pokud má `current` jiné SHA než veřejný web, neprováděj změny a zjisti proč.

### B. Instalace nového helperu PŘED sloučením PR #58

**Jako root na staging LXC**, teprve po ověření A a schválení konkrétní
revize PR. Nejdřív zastavit timer, nedovolit souběh synchronizační služby.
Neslučovat PR a neprovádět `git pull main` s novým auto-deploy skriptem,
dokud není nový helper instalován mimo repozitář.

```bash
systemctl disable --now loucka-preview-sync.timer
systemctl show loucka-preview-sync.service -p ActiveState -p SubState
systemctl list-jobs --no-pager | grep loucka-preview-sync || true
# Pokračuj teprve, když neběží žádný synchronizační job.
# Zkontroluj přesný SHA PR #58 na GitHubu a stáhni jen jeho obsah:
runuser -u loucka -- git -C /home/loucka/Loucka_weather fetch origin refs/pull/58/head
PR_HEAD="$(runuser -u loucka -- git -C /home/loucka/Loucka_weather rev-parse FETCH_HEAD)"
printf 'Kontrolovaná revize PR #58: %s\n' "$PR_HEAD"
runuser -u loucka -- git -C /home/loucka/Loucka_weather \
  show "$PR_HEAD:deploy/lxc/loucka-preview-api-activate.sh" \
  > /root/loucka-preview-api-activate.candidate.sh
chmod 0600 /root/loucka-preview-api-activate.candidate.sh
bash -n /root/loucka-preview-api-activate.candidate.sh
sha256sum /root/loucka-preview-api-activate.candidate.sh
# Ručně porovnej obsah a SHA s právě schváleným PR. Záloha mimo conf.d a repo:
install -m 0700 -o root -g root \
  /usr/local/libexec/loucka-preview-api-activate.sh \
  /root/loucka-preview-api-activate.backup.sh
install -D -o root -g root -m 0755 \
  /root/loucka-preview-api-activate.candidate.sh \
  /usr/local/libexec/loucka-preview-api-activate.sh
stat -Lc '%U:%G %a %n' /usr/local/libexec/loucka-preview-api-activate.sh
cmp -s /root/loucka-preview-api-activate.candidate.sh \
  /usr/local/libexec/loucka-preview-api-activate.sh
```

**Zde zastav a potvrď instalaci; PR zůstává draft.**
Neinstaluj helper z `main` před sloučením: tam je ještě stará verze.
Zvlášť ověř, že nepoužíváš helper z libovolného checkoutu nebo neověřené
větve. Root neprovádí žádný `bash` z účtem `loucka` zapisovatelné cesty.

### C. Teprve po potvrzení helperu sloučit PR a ručně nasadit

Až když je nový helper aktivně nainstalovaný, provést squash merge PR #58
na GitHubu. Potom na LXC, **timer stále vypnutý**:

```bash
runuser -u loucka -- git -C /home/loucka/Loucka_weather switch main
runuser -u loucka -- git -C /home/loucka/Loucka_weather pull --ff-only origin main
systemctl daemon-reload
systemctl start loucka-preview-sync.service
systemctl status loucka-preview-sync.service --no-pager -l
journalctl -u loucka-preview-sync.service -n 80 --no-pager
readlink -f /srv/loucka-preview/current
cat /srv/loucka-preview/current/.source-commit
cat /srv/loucka-preview/current/deployment.json
curl -fsS --max-time 5 http://127.0.0.1:3100/api/v1/healthz
curl -fsS --max-time 5 http://127.0.0.1:3100/api/v1/readyz
curl -fsS --max-time 10 https://dev.pocasi-loucka.eu/deployment.json
```

Ověř, že publikované SHA odpovídá schválenému merge commitu a že
`deployedAt` vzniklo až při skutečném přepnutí `current`.
Při selhání **timer nezapínej** a ponech poslední frontend.
Je-li API po restartu nefunkční, obnov předchozí verzi API podle
ověřeného release/backup postupu; samotný návrat symlinku `current`
nevrací API. Nejdřív ověř `healthz`/`readyz` a případný neúspěch
rozebírej přes `journalctl -u loucka-weather-api.service`.

### D. Nginx Proxy Manager – pouze přesná ověřená proxy IP

Po úspěchu C jako root:

```bash
install -d -o root -g root -m 0755 /etc/nginx/loucka-trusted-proxy
# Nejdřív si mimo GitHub bezpečně ověř IP NPM, kterou vidí staging LXC.
# Do souboru 10-npm.conf zapiš jediný 'set_real_ip_from X.X.X.X;'
# s konkrétní ověřenou adresou. Nekopíruj ukázkovou IP 192.0.2.10.
cp -a /etc/nginx/conf.d/loucka-preview.conf /root/loucka-preview-nginx.backup.conf
install -o root -g root -m 0644 \
  /home/loucka/Loucka_weather/deploy/lxc/nginx-preview.conf \
  /etc/nginx/conf.d/loucka-preview.conf
nginx -t && systemctl reload nginx
```

Bez ověřeného `set_real_ip_from` zůstává společný fail-closed limit;
**neotvírej** rozsahy `0.0.0.0/0`, privátní LAN ani celý subnet. Zkontroluj
síťový firewall, skutečné rozlišení IP klientů a HTTPS hlavičky přes NPM.
Pokud `nginx -t` neprojde, obnov zálohu z `/root/`, oprav konfiguraci
a nový reload neprováděj. CSP zatím maximálně v report-only režimu.

### E. Teprve po ověření end-to-end vrátit timer

```bash
systemctl enable --now loucka-preview-sync.timer
systemctl list-timers --all | grep loucka-preview-sync
journalctl -u loucka-preview-sync.service -n 30 --no-pager
```

Zatěžovací, failover a rollback simulace prováděj až při plánovaném
servisním okně. Neodpojovat reálnou DB, GW3000 nebo produkční WeeWX.
`/etc/loucka-weather/api.env` ani soukromé tokeny neposílej do chatu
nebo repozitáře.

## Bezpečnostní hlavičky testovacího webu

Interní Nginx nastavuje na HTML odpovědích `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff` a `Referrer-Policy: strict-origin-when-cross-origin`. U fingerprintovaných assetů, API a `deployment.json` přidává `nosniff` přímo v odpovídajících `location`, protože `add_header` se při přepsání uvnitř `location` z nadřazené úrovně automaticky nedědí. Stav ověř pomocí `curl -I` na skutečné veřejné HTTPS doméně; vnější NPM může hlavičky změnit.

`HSTS` musí konfigurovat vnější HTTPS proxy, nikoli interní HTTP na portu 8080. Přísnou `Content-Security-Policy` nasazuj až po ověření kamerových zdrojů, map, ECharts a browser konzole v report-only režimu. **Zákaz indexace platí pouze pro staging Nginx config** a nesmí se přenést bez úprav na finální produkční web.

## IP adresy klientů za Nginx Proxy Managerem

Ve výchozím stavu je místní limit `5r/s` vztažen na `$remote_addr`; pokud LXC vidí jen IP NPM, **limitují se všichni návštěvníci dohromady**. Konfigurace nyní podporuje bezpečné přepsání skutečné IP prostřednictvím `X-Forwarded-For`, ale **jen když je přesná IP důvěryhodného NPM explicitně povolena** na stagingu:

    install -d -o root -g root -m 0755 /etc/nginx/loucka-trusted-proxy
    # Nahraď dokumentační IP skutečnou adresou NPM, kterou vidí LXC:
    printf 'set_real_ip_from %s;\n' '192.0.2.10' > /etc/nginx/loucka-trusted-proxy/10-npm.conf
    nginx -t && systemctl reload nginx

Adresa `192.0.2.10` je výhradně dokumentační příklad; **nikdy ji slepě nekopíruj do reálného prostředí**. Důvěryhodnou adresu zjisti z vlastní konfigurace NPM a přístupu k síti LXC. **Nikdy** nenastavuj `set_real_ip_from 0.0.0.0/0`, celou privátní síť nebo náhodné rozsahy. Zajisti, aby TCP 8080 bylo dostupné pouze od NPM/důvěryhodné LAN; jinak by přímé požadavky mohly obcházet proxy. NPM musí do `X-Forwarded-For` korektně přidávat skutečného klienta. Na LXC ověř výstup `nginx -T` a že účinná `$remote_addr` rozlišuje různé klienty; neloguj jejich IP do veřejného repozitáře. Opravu nelze označit za kompletní bez tohoto provozního kroku.

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

### Pokud kamera selže s `unconverted data remains: .jpg` (1. 11. 2026)

Chyba byla ve vytváření indexu, nikoli ve stažení fotografie. Opravená verze používá při parsování názvu `f.stem`. Jako root na staging LXC po merge:

```bash
runuser -u loucka -- git -C /home/loucka/Loucka_weather pull --ff-only origin main
install -D -o root -g root -m 0755 /home/loucka/Loucka_weather/deploy/lxc/loucka-data-collector.py /usr/local/libexec/loucka-data-collector.py
python3 -m py_compile /usr/local/libexec/loucka-data-collector.py
systemctl reset-failed loucka-camera-collect.service
systemctl start loucka-camera-collect.service
systemctl status loucka-camera-collect.service --no-pager -l
curl -fsS http://127.0.0.1:3100/api/v1/camera/archive | jq .
curl -fsS http://127.0.0.1:3100/api/v1/camera/status | jq .
```

Nevypínej funkční ČHMÚ timer. Pokud fotografie již před chybou existuje, nový běh ji zachová; při shodném snímku nevytvoří duplicitu, pouze opraví index. Po prvním úspěchu nemá smysl očekávat nové MP4, dokud nejsou nasbírány aspoň šest snímků z předchozího dne.

## Read-only produkční připravenost a MP4

Než se vývojová verze publikuje na hlavní doménu, spusť na staging LXC jako root (jen READ-ONLY):

```bash
bash /home/loucka/Loucka_weather/deploy/lxc/site-readiness-audit.sh
```

Audit používá pouze GET na lokální a veřejné API a systémové diagnostické příkazy. Revizi Git repozitáře zjišťuje při spuštění jako root bezpečně pod účtem `loucka` (`runuser`), takže není nutné měnit `git safe.directory` ani vlastnictví. Současně kontroluje, zda nasazený `deployment.json` odpovídá revizi lokálního repozitáře. **Nemění GW3000, WeeWX, MariaDB, ani systemd**, neprovádí zápis nebo obnovu ze zálohy. Ověřuje verzi nasazení, veřejné a lokální API, časovače, aktuálnost zdrojů, MP4 a FFmpeg, místo na disku, paměť a neočekávané vystavení portu 3102.

Zjištění `FFmpeg not installed` znamená, že časosběrné MP4 zatím nemůže vznikat, i když JPEG archiv běží. Nesnaž se to řešit změnou stanice. V případě přítomnosti FFmpeg zkontroluj logy `journalctl -u loucka-camera-collect.service --no-pager -n 70` a integritu již vytvořeného MP4 `ffprobe`, pokud je dostupné. Nedotýkej se archivních snímků ani je nemaž při auditu.

Úspěch této kontroly **není důkazem zálohování**. Proxmox/PBS snapshoty, test obnovy LXC, pravidla NPM a firewall a zátěž musí být nezávisle doloženy na hostiteli. Do žádné produkční DB se při této kontrole nezapisuje. Přímý port GW3000 není potřeba.


## Ověření výkonu bez zátěže (2. 11. 2026)

Na staging LXC spustit `python3 /home/loucka/Loucka_weather/deploy/lxc/preview-performance-check.py`.
Skript provádí pouze 32 postupných GET na **127.0.0.1:3100** přibližně 3,3 požadavku/s, nemá žádný přístup ke GW3000, WeeWX ani databázovému zápisu. Reportuje p50/p95 lokálního API, chyby, cache ETag a HTTP 304 u kanálů.
**Není to skutečný souběžný zátěžový test ani důkaz dlouhodobé stability**; tu už monitoruje lokální systemd timer. Archivní 7denní hodinové dotazy mohou kvůli historickým překryvům vracet 503; přehled půdy používá přímo sedmidenní denní souhrny. Výsledek reportu lze bezpečně předat k dalšímu ladění.

## Cache statického Astro webu

Nginx vrací `Cache-Control: public, max-age=31536000, immutable` jen pro verzované soubory v `/_astro/`, kde Astro používá fingerprint v názvu. HTML používá `no-cache` (umožňuje 304, ale kontroluje novou verzi) a `/deployment.json` používá `no-store`, aby verze nebyla zpožděná. API a živá data zůstávají pod samostatnými pravidly.

Po automatickém nasazení ověřit:
```bash
curl -sSI https://dev.pocasi-loucka.eu/deployment.json | grep -i cache-control
curl -sSI https://dev.pocasi-loucka.eu/ | grep -i cache-control
# pro konkrétní fingerprintovaný soubor z HTML:
ASSET="$(curl -fsS https://dev.pocasi-loucka.eu/ | grep -oE '/_astro/[^"]+\\.(css|js)' | head -1)"
[ -n "$ASSET" ] && curl -sSI "https://dev.pocasi-loucka.eu$ASSET" | grep -i cache-control
```
Uživatelé nesmí dostat dlouhou cache na HTML, API nebo obsah generovaný v `/deployment.json`. Nginx stále blokuje přístup k tečkovým souborům. Cache sama neprokazuje p95 ani dlouhodobou stabilitu.

## Soukromý náhled rekonstruované RH 2022 – volitelná izolovaná služba

Volitelný operátorský graf není součástí veřejného Astro ani Nginx. K dispozici je samostatná služba `deploy/lxc/loucka-rh-preview.service` pro `127.0.0.1:3101`, která čte pouze originální MariaDB a předem ověřený soukromý SHA256 JSON. Služba se **nevytváří a neaktivuje merge commitem**. Nenahrazuje Fastify na 3100 a nespouští další observer.

Po synchronizaci `main`, kompilaci API a ověření lokálního balíčku správce explicitně spustí `bash deploy/lxc/install-loucka-rh-preview.sh`. Instalátor generuje nové root-only `/etc/loucka-weather/rh-preview.env` s přístupovým tokenem (pokud dosud neexistuje), instalačně se nedotýká `api.env`, Nginx ani databází; provede stavové/401 smoke testy a při chybě vypne jen sidecar.

**Zabezpečení:** nginx/NPManager nesmí směrovat 3101. Port nikdy nevystavovat do LAN/WAN; přístup pouze přes SSH localhost forwarding, bez tokenu se privátní data vrací 401. Token nikdy neposílat do chatu či logu. Celý postup, konkrétní SHA-256, kontrola dat a rollback jsou v `docs/RH_2022_PRIVATE_COMPARE_SIDECAR.md`.
