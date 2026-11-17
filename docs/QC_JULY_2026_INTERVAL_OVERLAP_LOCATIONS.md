# Červenec 2026: lokalizace překryvů a nepokrytých intervalů (pouze čtení)

Dřívější [bounded audit](../deploy/lxc/qc-outtemp-july-2026-readonly.sql) 17. 11. 2026 v Navicatu odhalil:

| Den (Europe/Prague) | Raw platných teplot | Off-grid +60 s | Součet intervalů | Unikátní pokrytí | Překryv | Nepokrytý čas |
|---|---:|---:|---:|---:|---:|---:|
| 2026-07-25 | 296 | 11 | 88 800 s | 85 680 s | 3 120 s | 720 s |
| 2026-07-26 | 294 z 295 raw | 11 (jeden NULL) | 88 200 s | 86 400 s | 1 800 s | 0 s |

`archive_day_outTemp.sumtime` odpovídá prostému součtu 5min intervalů a překračuje 86 400 s. Dne 25. 7. současně existuje 720 s nepokrytého času: **nelze** tedy jen odečíst 2400 s a tvrdit, že to odstranilo všech 3120 s překryvů. Dne 26. 7. se unikátní pokrytí rovná 24 hodinám, ale je 1800 s duplicit. Průběžné off-grid intervaly 26. 7. v 21:31, 21:36, 21:41, 21:46 a 21:51 CEST dokládají posunutou pětiminutovou mřížku. **Nedokládají příčinu posunu ani chybnou teplotu.**

## Jediný následující krok v Navicatu

Otevřít [`deploy/lxc/qc-july-2026-interval-overlap-locations-readonly.sql`](../deploy/lxc/qc-july-2026-interval-overlap-locations-readonly.sql) v read-only SQL spojení a spustit **oba SELECTy**, až budou součástí `main`. Dotazy jsou striktně omezené na dvě 24hodinová okna a čtou původní `archive` bez výpisu naměřených teplot.

1. První výsledek vrací pouze intervaly s `gap_before_seconds>0` nebo `overlap_seconds>0`, jejich časové značky jako **Unix epoch** (časové pásmo DB serveru je tudíž irelevantní) a vzdálenost od pětiminutové mřížky. První `gap_before_seconds` obsahuje i případnou mezeru na začátku dne.
2. Druhý výsledek validuje součty: `total_missing_seconds=720/0`, `overlap_seconds=3120/1800`, `unique_covered_seconds=85680/86400`. Pokud se součty liší, dál nic neodvozovat a nejdříve prověřit SQL výsledek/změnu zdroje. `end_gap_seconds` odděluje díru na konci dne od interních mezer.

Při interpretaci měření jde o **časovou délku intervalů** `[dateTime-interval*60,dateTime]`. Stejné okamžiky mohou mít více naměřených hodnot; deduplikace času sama neurčuje, která pozorování zachovat nebo jak přepočítat vážené `wsum`, denní průměr, min/max. Nezavádět algoritmus pro výběr „lepšího“ měření bez provenience.

**Žádné zásahy:** `pocasi-loucka.eu.archive`, `archive_day_outTemp`, `loucka_reconstruction.archive`, produkční WeeWX, GW3000, DB uživatelé/granty ani schvalování `approved` se nemění. Evidence patří do issue [#80](https://github.com/Boym323/Loucka_weather/issues/80).
