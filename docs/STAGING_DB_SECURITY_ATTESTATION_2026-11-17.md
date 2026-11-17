# DEV LXC – read-only ověření TLS a práv Fastify API

Datum přípravy: 17. 11. 2026. **Provozní ověření zatím nebylo provedeno**. Nový soubor je operátorská čtecí sonda, nikoli automatická změna TLS nebo databázových práv.

## Rozsah

`api/scripts/staging-db-security-attestation.mjs` používá pouze existující konfiguraci API předanou do samostatného procesu `loucka`. Vytvoří jedno krátké DB připojení, čte `CURRENT_USER()`, `CURRENT_ROLE()`, tři metadata výpisy `information_schema.*_PRIVILEGES` a `SHOW SESSION STATUS LIKE 'Ssl_cipher'`. Nenačítá žádný řádek s počasím, neprovádí SQL zápisy a nikdy nevypíše login, heslo, server, grant texty ani obsah ENV.

Ověří, že efektivní identita má nezbytné SELECT pro `archive` a odpovídající denní tabulky; nemá zápisová práva k cílovému schématu ani nadbytečná globální práva; nemá zápisová práva do jiných schémat; nemá aktivní nezohledněnou roli; spojení má aktivní TLS cipher **a** klientská konfigurace vyžaduje ověření serverového certifikátu.

### Bezpečné spuštění **pouze na DEV LXC**

Nejprve samostatně ověřit aktuální commit a úspěšný `readyz`. Vývojový build musí obsahovat `api/dist/src/db-tls.js`. Spustit jako root pouze příkaz systemd-run, který následný Node proces provede jako neprivilegovaný `loucka`. Předaná root-owned konfigurace se nikdy nevypisuje:

```bash
systemd-run --quiet --pipe --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/api.env \
  -- /usr/bin/node /home/loucka/Loucka_weather/api/scripts/staging-db-security-attestation.mjs
```

Nesouhlas připraveného SQL účtu s produkčním schématem, nezapnutý `WEATHER_DB_TLS_MODE=verify` nebo prázdný `Ssl_cipher` vrátí FAIL. **Žádné automatické přenastavení účtu, certifikátů, CA, Fastify ani MariaDB.** Fail nepokrývat vypnutím validace certifikátu; `rejectUnauthorized:false` je nepřípustné.

Očekávané nadbytečné zápisové oprávnění do `loucka_reconstruction` (pokud stále existuje) nebrání čtení původního archivu, ale blokuje princip nejmenších práv pro produkční veřejný API účet. V tomto případě vytvořit samostatnou čistě čtecí identitu až v plánovaném, explicitně schváleném DBA kroku. Nikdy neměnit granty automaticky v rámci sondy.

## Release readiness

Výsledek skriptu je jeden auditní bod. Nedokazuje délku certifikačního řetězce, obnovu záloh PBS/Proxmox, síťový firewall, dostupnost kamery ani dlouhodobý paměťový trend. Po úspěchu stále vyžadovat opakované API/UX testy, zálohu a test rollbacku. Produkční verdikt je **NO-GO** do skutečného ověření těchto bran.

Pokud v prostředí není k dispozici LXC shell, stav zůstává `NOT TESTED`, nikoliv `PASS`.
