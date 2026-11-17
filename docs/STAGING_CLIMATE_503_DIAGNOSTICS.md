# DEV klimatologie: izolace HTTP 503 bez změny dat (#133)

**Problém potvrzen:** Veřejný browser smoke [#44160846437](https://github.com/Boym323/Loucka_weather/actions/runs/44160846437) pro přesný nasazený commit `cef7f507` potvrdil `readyz=true`, ale `statistics/yearly` a klimatologie 2025 vracely `503 UPSTREAM_UNAVAILABLE / Daily summaries unavailable`.

`readyz` kontroluje základní primární `archive` SELECT, **negarantuje dostupnost `archive_day_outTemp`, `archive_day_rain` ani `archive_day_wind`**. Veřejný text 503 záměrně neukazuje interní chybový kód, aby neunikla struktura DB. Příčina (oprávnění, chybějící tabulka, chybný dotaz, saturace poolu, stale API) zatím není známá.

## Jediný bezpečný operátorský krok

Po synchronizaci tohoto PR do DEV LXC spustit jako root. **Nekopírovat obsah EnvironmentFile ani hesla do chatu.**

```bash
systemd-run --quiet --pipe --wait --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/api.env \
  -- /usr/bin/node \
  /home/loucka/Loucka_weather/api/scripts/staging-climate-db-probe.mjs
```

Skript používá `createMariaDbReader()` ze stejného zkompilovaného `api/dist` a stejné `api.env` jako systémová Fastify služba, ale v **odděleném krátkodobém procesu/poolu**. Proto PASS dokládá schopnost získat data pod stejnou identitou, nikoli že právě běžící Fastify pool není zahlcený. Probe nevolá produkční web ani samotné GW3000.

Zpracuje maximálně 367 denních souhrnů z roku **2025** na metriku (skutečných dní je 365), jednou sekvenčně a jednou ve třech souběžných čtecích dotazech (tj. nanejvýš šest malých indexovaných SELECT dotazů). `pool` má maximálně dvě spojení a akviziční timeout 5 sekund. Vypisuje jen stavy `pass/fail`, počet vrácených řádků, latence a sanitzovaný `driver.code`/`errno`/`sqlState` – **žádné naměřené hodnoty, SQL, hesla, IP ani názvy DB účtů**.

### Interpretace

- `ping: pass`, `outTemp: fail` s `ER_TABLEACCESS_DENIED_ERROR` nebo obdobným kódem → ověřit efektivní SELECT na konkrétní denní tabulce. Nevydávat nové GRANT bez samostatného rozhodnutí provozovatele.
- `ER_NO_SUCH_TABLE` → ověřit přesný název tabulky a konfiguraci WeeWX; nezakládat fiktivní tabulky ani nemigrovat originál.
- Sekvenční `pass`, souběžné `fail` (např. pool timeout) → přiměřeně vyšetřit pool/současné API požadavky a časování, ne automaticky navyšovat limit, RAM nebo load.
- Vše `pass`, ale web stále 503 → porovnat nasazené `api/` tree SHA a skutečnou binárku Fastify; teprve potom zkoumat běžící pool a API logy. **Nenutit restart**, pokud není naplánovaný servisní test.
- `ping: fail` → problém s DB konektivitou/právy je širší než klimatologie.

Po opravě skutečné příčiny teprve opakovat veřejný browser smoke: klimatologie 2025 12/12 měsíců, roční statistika HTTP 200, a bez přebytečných retry. Bez dobrých výsledků nelze vydat DEV PASS ani produkční GO.

**Přísné hranice:** nástroj nedělá žádný zápis do `pocasi-loucka.eu.archive`, `loucka_reconstruction`, žádné vytváření přihlašovacích identit, žádný `GRANT`, `systemctl restart` či úpravy TLS. Bez automatického uvolnění produkce.