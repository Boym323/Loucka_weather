# GW3000 skutečně živá data a monitoring

Stav: implementace připravená, ale provoz fyzického GW3000 není aktivován, dokud uživatel nezprovozní vlastní HTTP upload na LAN.

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
