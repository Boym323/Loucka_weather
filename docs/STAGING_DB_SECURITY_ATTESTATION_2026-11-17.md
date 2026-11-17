# DEV LXC – read-only ověření TLS a práv Fastify API

Datum přípravy: 17. 11. 2026. **První provozní ověření proběhlo 17. 11. 2026 v 18:59:09 UTC a potvrdilo tři nálezy:** nešifrované připojení, neověřený TLS certifikát a nadbytečná zápisová práva účtu v jiném schématu. Nový soubor je operátorská čtecí sonda, nikoli automatická změna TLS nebo databázových práv.

## Rozsah

`api/scripts/staging-db-security-attestation.mjs` používá pouze existující konfiguraci API předanou do samostatného procesu `loucka`. Vytvoří jedno krátké DB připojení, čte `CURRENT_USER()`, `CURRENT_ROLE()`, tři metadata výpisy `information_schema.*_PRIVILEGES` a `SHOW SESSION STATUS LIKE 'Ssl_cipher'`. Nenačítá žádný řádek s počasím, neprovádí SQL zápisy a nikdy nevypíše login, heslo, server, grant texty ani obsah ENV.

Ověří, že efektivní identita má nezbytné SELECT pro `archive` a odpovídající denní tabulky; nemá zápisová práva k cílovému schématu ani nadbytečná globální práva; nemá zápisová práva do jiných schémat; nemá aktivní nezohledněnou roli; spojení má aktivní TLS cipher **a** klientská konfigurace vyžaduje ověření serverového certifikátu. Ve výchozím přísném režimu vyžaduje TLS, ale v režimu explicitně přijaté důvěryhodné LAN eviduje nešifrované připojení jako varování, nikoli jako blokaci.

### Bezpečné spuštění **pouze na DEV LXC**

Nejprve samostatně ověřit aktuální commit a úspěšný `readyz`. Vývojový build musí obsahovat `api/dist/src/db-tls.js`. Spustit jako root pouze příkaz systemd-run, který následný Node proces provede jako neprivilegovaný `loucka`. Předaná root-owned konfigurace se nikdy nevypisuje:

```bash
systemd-run --quiet --pipe --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/api.env \
  -- /usr/bin/node /home/loucka/Loucka_weather/api/scripts/staging-db-security-attestation.mjs --trusted-lan
```

V režimu `--trusted-lan` jsou šifrování i ověření certifikátu **nepovinné**, ale skutečné hodnoty `transportEncrypted=false` a `certificateVerified=false` musí zůstat ve výstupu. Výstup `warnings` musí zachovat označení neověřené síťové segmentace. Bez příznaku `--trusted-lan` zůstává výchozí striktní režim: neověřené TLS způsobí FAIL. **Žádné automatické přenastavení účtu, certifikátů, CA, Fastify ani MariaDB.** Fail nepokrývat vypnutím validace certifikátu; `rejectUnauthorized:false` je nepřípustné.

Očekávané nadbytečné zápisové oprávnění do `loucka_reconstruction` (pokud stále existuje) nebrání čtení původního archivu, ale blokuje princip nejmenších práv pro produkční veřejný API účet. V tomto případě vytvořit samostatnou čistě čtecí identitu až v plánovaném, explicitně schváleném DBA kroku. Nikdy neměnit granty automaticky v rámci sondy.

## Release readiness

Výsledek skriptu je jeden auditní bod. Nedokazuje délku certifikačního řetězce, obnovu záloh PBS/Proxmox, síťový firewall, dostupnost kamery ani dlouhodobý paměťový trend. Po úspěchu stále vyžadovat opakované API/UX testy, zálohu a test rollbacku. Produkční verdikt je **NO-GO** do skutečného ověření těchto bran.

Pokud v prostředí není k dispozici LXC shell, stav zůstává `NOT TESTED`, nikoliv `PASS`.

## Rozhodnutí provozovatele: databáze pouze v LAN

Provozovatel potvrdil, že provozní spojení API → MariaDB je výhradně v LAN a šifrování pro tento konkrétní úsek **není požadováno**. To nemění faktický výsledek první sondy: `transportEncrypted=false`, `certificateVerified=false`. Výjimka je **výslovná a jen v auditní politice**, nikdy nemění `WEATHER_DB_TLS_MODE` ani nedeaktivuje případné ověřování certifikátu.

Před produkčním schválením samostatně zkontrolovat firewall pro TCP/3306, přístup pouze ze schválených adres a vyloučit přesměrování portu z WAN. Samotná přítomnost v LAN není automatický důkaz bezpečné segmentace. Po použití `--trusted-lan` je provozní audit stále `ready=false`, dokud má současná API identita nadbytečná práva zápisu k jinému schématu. **Neodstraňovat práva stávajícímu účtu bez ověření jeho dalších uživatelů; preferovat novou čistě čtecí identitu API.**
