# Soukromý náhled historického staničního tlaku (2026-11-24)

Stav: ověřený soukromý DEV preview na loopbacku LXC; nejde o veřejnou funkci. Navazuje na [Meteo_audit PR #99](https://github.com/Boym323/Meteo_audit/pull/99), merge `2116f753c1b37e09c47998b10292f3772f38ccc7`.

Zdroj: `pressure-layers-three-way-v1.csv.gz`, 1 697 621 timestampů, SHA-256 `2c111a5f4e597ba1bc7133cfab62b394294eff903368ecd02cd9808f481b9122`. Jednotka hPa, UTC konce intervalů WeeWX. Jde o immutable snapshot, nikoli živá data. Jeho hodnoty nejsou uloženy do tohoto veřejného repozitáře.

## Soukromá architektura

- Jednorázový streaming import do nového lokálního adresáře: ověří gzip SHA, přesnou hlavičku, pořadí a unikátnost timestampů, počet řádků, Q1 2018, zdroj a časovou podporu; každý den má vlastní SHA-256. Při chybě se nepublikuje neúplný index. Import nemění vstup.
- Samostatný proces Python 3.11+ na `127.0.0.1:3102`, explicitní opt-in, token alespoň 32 znaků; pouze pevně definované HTML/JS/CSS a GET `/dev/pressure-preview/data?from=YYYY-MM-DD&days=1..7`. Denní JSON soubory ověřuje před odesláním; žádné DB připojení. Token pouze v paměti stránky, žádná URL, storage ani cookies. Žádné automatické spuštění, Nginx změny, veřejný API kontrakt ani frontendová publikace.
- Graf má tři nezávislé přepínače, UTC výběr, dostupnou tabulku, NULL mezery a zřetelný zdroj. Regionální reference je dostupná i na časech s původní hodnotou; samostatně se počítají odhady chybějících hodnot. Historický archiv není certifikovaně kalibrovaný; interpolace ČHMÚ není lokální měření. Superseded legacy V3 se nepoužívá. Žádné agregace pro oficiální rekordy.
- Rozsah 1 až 7 UTC dní; očekávané 5min záznamy, hodinové ERA5 pouze na přesných hodinách. Mezery se nespojují a známý zlom 2019-04-26T14:45Z se vizuálně nepřemosťuje.

## Manuální ověření na původním DEV LXC

V čistém checkoutu této větve, bez zveřejnění datového adresáře:

```sh
python3 -m unittest discover -s deploy/lxc/tests -p test_pressure_preview.py
python3 deploy/lxc/pressure_preview.py prepare \
  --catalog /CESTA/K/OVERENEMU/pressure-layers-three-way-v1.csv.gz \
  --out /var/lib/loucka-pressure-preview/release-v1
```

Vytvoř adresář pod existujícím oprávněným neprivilegovaným účtem s dostatkem volného místa; použij skutečnou cestu ke zdroji a soukromá oprávnění. Nespouštěj import na produkčním WeeWX. Pokud výpočet SHA neodpovídá pinovanému release, zastav se, nevypínej kontrolu.

V shellu nepoužívej token v příkazové historii; načti jej interaktivně do prostředí:

```sh
read -rs WEATHER_PRESSURE_PREVIEW_TOKEN
export WEATHER_PRESSURE_PREVIEW_TOKEN
export WEATHER_PRESSURE_PREVIEW_ENABLED=YES
python3 deploy/lxc/pressure_preview.py serve --index /var/lib/loucka-pressure-preview/release-v1
```

Přístup pouze přes zabezpečený SSH tunel nebo existující soukromý DEV proxy s vlastní autentizací (konfigurace proxy NENÍ součástí tohoto PR). Na klientovi otevři `http://127.0.0.1:3102/dev/pressure-preview` po přesměrování portu na DEV LXC. Nikdy nevystavuj endpoint přímo na veřejnou doménu bez samostatného schválení.

Smoke test: 2018-10-01 porovnej rozdíl mezi archivem a referencí, Q1 2018 nesmí obsahovat odhady, 2019-04-26 nesmí spojovat zdrojový zlom, 2026 nesmí zobrazit regionální reference. Chybějící a neplatný token musí dát 401, rozsah >7 dní 422, neexistující nebo změněný denní soubor 503. Ověř UI na mobilním viewportu, přepínače, prázdné dny a přístupnost. Zastavení procesu je rollback; původní API a web zůstanou nedotčené.

## Ověření na DEV LXC (2026-11-24)

- SHA-256 skutečného `pressure-layers-three-way-v1.csv.gz` v `final-layers-v1/final-three-layers`: `2c111a5f4e597ba1bc7133cfab62b394294eff903368ecd02cd9808f481b9122`; odpovídá pinu. Streaming import vytvořil 1 697 621 řádků a 6 157 denních JSON balíčků. Index i balíčky jsou v `/var/lib/loucka-pressure-preview/release-v1`, vlastník `loucka`, režim adresáře 0700; surový soubor nebyl kopírován do webového rootu ani repozitáře.
- Preview běží odděleně pod účtem `loucka` na `127.0.0.1:3102`. Nezměnil se Nginx, API, WeeWX, databáze ani produkční web. Přístup vyžaduje soukromý bearer token; neposílat jej v URL, PR ani logu. Prohlížeč se připojuje jen přes lokální loopback / schválený soukromý tunel. Není přidána veřejná proxy cesta.
- Kontroly skutečných dat: 2018-01-01 až 07 obsahuje 2 016 časů a nula odhadů ve všech chráněných vrstvách; 2018-10-01 obsahuje 155 původních bodů, 133 rekonstrukcí, 288 regionálních referencí a 133 oddělených regionálních odhadů; 2026-11-24 nemá regionální referenci. U 2019-04-26 je zdokumentovaná hranice 14:45 UTC: původní tlak je před hranicí NULL a od 14:45 jsou hodnoty přítomné; vykreslení hranici nepřemosťuje.
- Provedeny čtyři regresní testy. Headless Chromium ověřilo skutečný načtený graf a tabulku při 1365×900 i 390×844, všechny tři vrstvy, 288 řádků, SHA v UI, nulové horizontální přetečení a nulové chyby JavaScriptu. Neplatný token vrací 401 a rozsah 8 dní 422.

Diagnostické hodnoty stále nejsou schválené pro databázovou náhradu, veřejné měření ani oficiální statistiky. Zastavení soukromé preview služby je rollback.
