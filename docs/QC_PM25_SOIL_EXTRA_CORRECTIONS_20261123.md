# Vyloučení neověřených špiček PM2.5, půdních a doplňkových teplot

**Provedeno 23. 11. 2026.** Týká se historických veřejných dat `pocasi-loucka.eu` a pracovního archivu `loucka_reconstruction`.

## 1. Samostatné auditované opravy v pracovní rekonstrukci

Nástrojem `Weather_MCP.reconstruction_apply_corrections` po úspěšném dry-run, s ověřením očekávaných původních hodnot a automatickým zápisem do `reconstruction_changes`, provedeno:

| Batch (applied, verified) | Pole | Počet změn | Nová hodnota |
|---|---|---:|---|
| `qc-extra-temp-outliers-20261123-v1` | `extraTemp2` (14), `extraTemp1` (2) | **16** | `NULL` |
| `qc-soil-negative-outliers-20261123-v1` | `soilTemp1` (13), `soilTemp5` (10), `soilTemp6` (21) | **44** | `NULL` |

Zasažena je epizoda 2024-02-17 u doplňkových teplot, 2 izolované `soilTemp1` v roce 2022 a 42 dalších půdních outlierů z roku 2026.

**Nepřidávaná náhradní teplota:** bez nezávislého zdroje by šlo o fiktivní měření. `NULL` znamená vadné/neznámé měření, nikoli 0 °C. Přesné původní hodnoty jsou dále v nezměněném produkčním `archive` a v auditních `old_value`. V produkční DB žádné SQL DML ani přepočet `archive_day_*` neproběhly.

Kontrolní dotaz:
```sql
SELECT batch_key,variable,COUNT(*) n,SUM(new_value IS NULL) nulled
FROM loucka_reconstruction.reconstruction_changes
WHERE batch_key IN ('qc-extra-temp-outliers-20261123-v1',
 'qc-soil-negative-outliers-20261123-v1') AND state='applied'
GROUP BY batch_key,variable;
```

Kontrola po zásahu potvrdila, že v pracovní rekonstrukci už nezůstalo žádné `extraTemp1>80` nebo `extraTemp2>100` z roku 2024 a žádné `soilTemp1<-20` / `soilTemp5/6<-40` mezi 2022–2026. Původní databáze nadále obsahovala 14 problematických časových řádků doplňkových teplot a 44 problémových půdních časových řádků.

## 2. Webové API: bezpečný publikační filtr

`api/src/sensor-publication-qc.ts` má omezenou historii, nikoli globální přepis:

- **PM2.5 2024:** číselné hodnoty `pm25_1 >= 500 µg/m³` se ze zobrazovaných zdrojových křivek vyřadí jako **`UNVERIFIED` / SUSPECT_PM25_SENSOR_SATURATION**, nikoli automaticky `SENSOR_ERROR`. Celý rok 2024 má 2 128 takových intervalů (většina září/říjen), ze kterých 1 401 je přesně na ~999,9. Originální archiv a forenzní `measurementValue` zůstanou zachovány; publikační `displayValue=null`.
- **`extraTemp2` 2022-09-02 až 09-08:** nejasná identita/epocha čidla; čísla ponechat v originálu, na webu `UNVERIFIED_2022_EXTRA_TEMP2_CHANNEL` bez zveřejnění jako teplotní rekord. Zatím není prokázáno, že všech 1 765 hodnot bylo skutečně vadných.
- **`extraTemp2>100`, `extraTemp1>80`:** zjevné hodnoty mimo přijatelný rozsah teploty označit `SENSOR_ERROR`, `displayValue=null`.
- **`soilTemp1<-20`, `soilTemp5/6<-40`:** `SENSOR_ERROR` u výrazných odlehlých hodnot. V letech 2022/2026 jsou uvedené jednotlivé chyby už opravené v pracovní rekonstrukci, ale **produkční zdroj** je má stále — proto je filtrování nutné.
- **`soilTemp5/6<-10` mezi 2026-03-08 a 2026-11-23:** další neověřené, ale nikoli jednoznačně vadné záporné hodnoty označit `UNVERIFIED` a na veřejnosti číslo zadržet. V roce 2026 bylo v původní DB 1 301 takových `soilTemp5` a 1 635 `soilTemp6`; 31 výrazných pod −40 je podmnožina. Tyto další tisíce hodnot nejsou přepsané v rekonstrukci.
- **Jiné senzory zůstávají beze změny.** `GW1000.soilTemp1` není totožný s produkčním `soilTemp1`; potvrzené mapování GW1→produkční soil3 atd. Nepřepisovat cizím senzorem.

`/api/v1/current`, `/api/v1/history` ve `raw` a `hourly` a `/api/v1/quality/observations` používají časově a hodnotově omezené pravidlo. Při retenčním QC zůstává původní číslo pro kontrolu v `measurementValue`, ale není vykreslováno jako validní hodnota.

**DŮLEŽITÉ:** Veřejné `archive_day_*` je stále vypočteno z *původních* historických hodnot. Proto `/api/v1/statistics/{daily,monthly,yearly}`, `/api/v1/climate/annual-matrix` a `history?resolution=daily` pro zasahující kohorty vracejí **503 HISTORICAL_QC_HOLD**, místo aby předstíraly správné maximum/průměr. Jde o vyřazení již nesprávně agregovaného čísla z publikace, nikoli plošné mazání denních statistik jiných meteorologických veličin.

## 3. Co zbývá k certifikaci

- Věrohodné nezávislé PM2.5 z jiného čidla / veřejné referenční stanice, příp. původní raw packet a limit senzoru.
- Identita a konfigurace `extraTemp2` v roce 2022 a proměna mapování v březnu 2026.
- Per-field QC evidence pro `soilTemp5/6` v širokém pásmu −10…−40 a rozhodnutí, zda zůstane pouze `UNVERIFIED`, nebo existuje přímý důkaz `SENSOR_ERROR`.
- Konzistentní záloha a izolovaný restore celé `loucka_reconstruction` pro budoucí hromadné zásahy; nynější 60 kusových auditovaných oprav ji nenahrazuje.
- Opětovné vytvoření a ověření denních agregací z opravených dat; do té doby je historie rizikových veličin na webu zadržena.

Toto je reálná ochrana proti falešným rekordům a 60 fyzických oprav v pracovní rekonstrukci. **Není** to důkaz úplné fyzikální certifikace všech PM2.5/soil/extraTemp dat.
