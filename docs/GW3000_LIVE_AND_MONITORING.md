# GW3000 skutečně živá data a monitoring

Stav: čtení z existujícího LAN HTTP API připravené; stačí zapnout read-only poller na LXC po potvrzení IP a dostupnosti. Nastavení GW3000 se nemění.

## Doporučená varianta: bez zásahu do GW3000 (read-only)

Tato varianta je doporučená. **Na stanici se nic nenastavuje, žádný Customized server se nemění, WeeWX se nerestartuje.** Staging LXC pouze odešle pravidelný HTTP `GET /get_livedata_info?` na již existující lokální API brány, přijme odpověď a uloží poslední živý snímek do vlastního souboru. Nevydává žádné příkazy `set_*`, neotevírá veřejné porty a nevyužívá Ecowitt cloud.

### Nejdříve pouze ověř síťovou dostupnost (bez změn)

Získání IP stanice z DHCP nebo stávající konfigurace WeeWX není změna GW3000. Na staging LXC nastav dočasně skutečnou IP brány:

```bash
GW_IP=192.168.1.X      # dosaď známou existující IP, nikoliv novou
curl --max-time 5 -fsS "http://${GW_IP}/get_livedata_info?" | jq '{common_list: (.common_list // [])[0:5],rain: (.rain // [])[0:2]}'
```

Tento požadavek je **pouze GET**. Pokud skončí timeoutem, 404, nebo nevrátí `common_list`, nic na GW3000 nepřepínej. Může být potřeba povolit spojení LXC → GW3000 TCP/80 v routeru nebo číst stávající WeeWX LOOP data, ale nejprve ověř bezpečný postup.

### Aktivace výhradně na staging LXC

1. Aktualizuj `main` a nainstaluj root-owned skript a dvě systemd jednotky. Žádné nové zařízení ani port 3102 se nenastavuje:

```bash
runuser -u loucka -- git -C /home/loucka/Loucka_weather pull --ff-only origin main
install -D -o root -g root -m 0755 /home/loucka/Loucka_weather/deploy/lxc/loucka-gw3000-http-pull.py /usr/local/libexec/loucka-gw3000-http-pull.py
for unit in loucka-gw3000-http-pull.service loucka-gw3000-http-pull.timer; do
 install -o root -g root -m 0644 "/home/loucka/Loucka_weather/deploy/lxc/$unit" "/etc/systemd/system/$unit"
done
```

2. Vytvoř root-only soubor `/etc/loucka-weather/gw3000-pull.env` s jediným řádkem `LOUCKA_GW3000_HTTP_IP=<skutečná LAN IPv4 stanice>` (bez `http://`, bez veřejné IP). Přístup `chmod 600`.

3. Neaktivuj původní push přijímač `loucka-gw3000-live.service` současně s novým pull časovačem; oba zapisují do stejného souboru. Pokud je již zapnutý, nejprve jej vypni, aniž bys měnil GW3000.

4. Spusť testovací jednorázové čtení a teprve poté timer:

```bash
systemctl daemon-reload
systemctl start loucka-gw3000-http-pull.service
systemctl status loucka-gw3000-http-pull.service --no-pager -l
systemctl enable --now loucka-gw3000-http-pull.timer
```

5. V existujícím `/etc/loucka-weather/api.env` přidej `GW3000_LIVE_ENABLED=YES` a restartuj pouze `loucka-weather-api.service`. WeeWX, gateway, MariaDB ani NPM se nerestartují. Ověř:

```bash
curl -fsS http://127.0.0.1:3100/api/v1/live/current | jq '{source,state,observedAt,timestampMeaning,readings}'
curl -fsS http://127.0.0.1:3100/api/v1/monitor/status | jq '.components.gw3000'
journalctl -u loucka-gw3000-http-pull.service -n 20 --no-pager
```

Samotný odposlech serveru není nutný: každý běh polleru po 20 s provede **jediný GET** na privátní IPv4 a případně zapíše nový lokální snapshot. Výsledný `observedAt` znamená čas přečtení odpovědi, **nikoli potvrzený čas jednotlivého měření senzoru**. Přijímač nepřepisuje databázi a po 120 s bez nových platných odpovědí API opět upřednostní archivní režim.

Lokální API může vracet jednotky zvolené na GW3000. Poller proto převádí pouze rozpoznané `°C/°F`, `m/s`, `km/h`, `mph`, `inHg`, `hPa`, `mm/h` a `in/h`. Veličiny bez jednoznačné jednotky vynechá, `lux` nevydává za `W/m²` a denní srážku nevydává za intervalový úhrn.

**Alternativa níže s Customized POST je pouze pro jinou instalaci, kde uživatel výslovně chce změnit nastavení gateway. Pro Počasí Loučka ji nepoužívat.**

---

## Starší volitelná varianta: Customized PUSH (nedoporučená zde)

## Architektura

GW3000 Customized Ecowitt HTTP POST (LAN pouze) -> samostatná root-owned Python služba (uživatel loucka) -> jediný atomický JSON /var/lib/loucka-live/latest.json -> Fastify gateway observer 2,5 sekundy -> GET /api/v1/live/current a SSE /api/v1/live -> zobrazení na Astro webu.

Nedochází k přímému zápisu do produkční MariaDB ani WeeWX. Nikdy se nesmí vydávat pětiminutový archivní záznam za live. Živý vzorek expiroval po 120 s, další hodnoty zůstávají z archivu explicitně označené.

## DŮLEŽITÉ před konfigurací brány

GW3000 může mít pouze jedno Customized odesílání. Pokud už tato volba slouží WeeWX nebo jiné službě, NEMĚNIT a nejprve připravit rozdělení stávajícího uploadu nebo jiný existující MQTT/LOOP adaptér. Změnou nelze přerušit původní meteorologický sběr.

Zvol dvě soukromé LAN IPv4: staging LXC a GW3000. Port 3102 není přístupný přes NPM ani z internetu. Firewall musí povolovat TCP 3102 pouze z GW3000 IP. Nepoužívej port-forward.

## Instalace staging LXC jako root

1. Aktualizovat main: runuser -u loucka -- git -C /home/loucka/Loucka_weather pull --ff-only origin main
2. Nainstalovat root-owned Python /home/loucka/Loucka_weather/deploy/lxc/loucka-gw3000-live.py do /usr/local/libexec/loucka-gw3000-live.py s mode 0755.
3. Nainstalovat root-owned /home/loucka/Loucka_weather/deploy/lxc/loucka-monitor.py do /usr/local/libexec/loucka-monitor.py s mode 0755.
4. Nainstalovat systémové jednotky loucka-gw3000-live.service, loucka-monitor.service a loucka-monitor.timer do /etc/systemd/system/ s mode 0644.
5. Vytvořit root-owned /etc/loucka-weather/gw3000.env (mode 0600) s hodnotami:
    LOUCKA_GW3000_BIND=LAN_IP_STAGING_LXC
    LOUCKA_GW3000_ALLOWED_IP=LAN_IP_GW3000
    LOUCKA_GW3000_TOKEN=TAJNY_NAHODNY_HEX_TOKEN_32_ZNAKU
    LOUCKA_GW3000_PORT=3102
   Použij 128bitový náhodný token (openssl rand -hex 16, tedy 32 hex znaků). U některých firmware může součet délek hostitele, portu a cesty přesáhnout limit 64 znaků; před uložením to ověř. Token nikdy nevkládej do GitHubu ani veřejného logu.
6. systemctl daemon-reload; systemctl enable --now loucka-gw3000-live.service; systemctl enable --now loucka-monitor.timer.
7. Do stávajícího /etc/loucka-weather/api.env přidat GW3000_LIVE_ENABLED=YES, pak systemctl restart loucka-weather-api.service.
8. Na GW3000 jen je-li volné Customized: Enable, Protocol Same As Ecowitt, Host LAN_IP_STAGING_LXC, Port 3102, Path /gw3000/TAJNY_TOKEN, Upload Interval 30 nebo 60 sekund.
9. Ověřit místní GET http://127.0.0.1:3100/api/v1/live/current a GET http://127.0.0.1:3100/api/v1/monitor/status a journalctl -u loucka-gw3000-live.service; pak web /stav/.

## Monitoring a degradace

API monitor zvlášť vyhodnocuje stáří archivu >15 min, GW3000 >120 s, JPEG kamery >20 min a oficiální ČHMÚ CAP >45 min. Zobrazuje časy a stav disabled/missing/fresh/stale. Systemd watchdog loucka-monitor.timer kontroluje každých cca pět minut, vypíše problém do journalctl -u loucka-monitor.service a selže s nenulovým kódem. Neodesílá automaticky e-mail ani SMS.

API readiness archivu a healthz nezávisí na dostupnosti kamery či GW3000. Při výpadku živých paketů web přejde na archivní hodnoty a nezobrazuje staré živé měření.

## Zdrojová data a jednotky

Ecowitt POST používá tempf/°F, windspeedmph/mph, baromrelin/inHg, rainratein/in/h a další klíče. Listener explicitně převádí na °C, m/s, hPa, mm/h a odmítá neplatné rozsahy. Kumulativní dailyrainin není intervalový déšť a do live hodnoty rain se nezapisuje.

## Bezpečnost

Listener se odmítne spustit bez přesně určené LAN IP, allowlistu IP brány a tajného tokenu alespoň 32 hex znaků. Není kompatibilní s veřejným přístupem, nepodporuje TLS; proto pouze v důvěryhodné síti. GW PASSKEY slouží k identifikaci a není bezpečným tajemstvím. Token je oddělený a přenos se neprotokoluje. Diagnostické endpointy nevracejí interní IP adresy, tokeny ani celé surové příchozí pakety.

## Zdroj

Ecowitt GW3000 manual (Weather Services -> Customized), příklady Ecowitt HTTP POST a datová dokumentace; skutečný paket z konkrétní instalace musí být ještě ověřen. CI využívá syntetické testovací pakety pouze pro protokol, nikoli jako reálná meteorologická měření.
