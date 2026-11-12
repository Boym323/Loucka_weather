# Atlas – dostupnost historické relativní vlhkosti

## Stav a účel (12. 11. 2026)

Nová sekce na `/klimatologie/trendy/#vlhkost-archiv` a odkaz na přehledu atlasu. Nejde o nový rekonstrukční dataset ani o další audit databáze. Cílem je zpřístupnit návštěvníkům srozumitelný přehled dostupnosti **původních denních souhrnů RH**, aniž by byl vývoj atlasu blokován nevyřešenými historickými výpadky.

Rok 2022 má podle dokončeného samostatného read-only auditu 104 142 archivních řádků, z nich 44 516 původních RH NULL. 5 153 historických změn v odděleném experimentálním náhledu zůstává neschválených; nejsou zdrojem této sekce. Dubnové známé dlouhé konstantní RH hodnoty jsou výslovně vysvětleny, nikoli zamlčeny. Dostupný denní souhrn není odborně potvrzené měření.

## Rozhraní a interpretace

- Výběr dokončeného roku od 2009 (výchozí 2022, pokud je dostupný ve výběru). Načítání až po odeslání formuláře, bez automatické laviny dotazů.
- Jeden existující `GET /api/v1/history?metric=outHumidity&resolution=daily&units=metricwx&dataset=original&limit=1000` s lokálními hranicemi 1. 1. až 1. 1. dalšího roku, Europe/Prague. Žádné raw roční skenování.
- Dny s použitelným původním souhrnem (RH 1–100 %, původní denní zdroj, ne missing/suspect), chybějící denní hodnota a podezřelý/neplatný souhrn se počítají odděleně. Nepřítomný kalendářní den zůstává bez hodnoty. Duplicitní datum, nesprávné hranice, rekonstruovaná nebo cizí data se odmítají. Přestupné roky a CET/CEST se odvozují z místního kalendáře.
- Měsíční tabulka a vizuální poměr dostupných dnů. Nejde o podíl pětiminutových archivních záznamů; nulová nebo chybějící RH se nevykresluje jako meteorologické měření.
- Časové pokrytí je **samostatný** údaj existujícího `GET /api/v1/climate/annual-matrix?metric=outHumidity&units=metricwx&dataset=original` (serverová cache). Frontend načte roční matici nejvýše jednou za úspěšnou otevřenou stránku. Pokud není dostupná či má neznámé pokrytí, zobrazí „Nezjištěno“ a přitom zachová denní tabulku.
- Údaje z obou endpointů pocházejí z denních souhrnů originálu. Jejich pokrytí není totéž co úplnost surových pětiminutových intervalů ani validace čidla. Oddělené requesty nemusejí být stejná revize.
- Speciální poznámka k roku 2022 upozorňuje na hlavní výpadky a dubnové zamrzlé čidlo. Neoznačuje jednotlivé dny automaticky za prověřené, pokud stávající API takový důkaz neposkytuje.

## Co je stále mimo rozsah

Neexistuje schválená rekonstrukční vrstva. Soukromý sidecar 3101, immutable balíčky, tokeny, reference a odhady se do veřejného frontend buildu ani endpointů nepřidávají. Nemění se API, MariaDB, denní souhrny, WeeWX, systemd ani Nginx.

Dubnová metoda Magnus (přepočet tlaku vodní páry obou referencí podle místní teploty) má v dokončené retrospektivní kontrole MAE 2,17 p. b. na 4752 původních kontrolních vzorcích z 22 dnů mimo známé frozen úseky. Tento výsledek je podkladem pro samostatný experiment, ne povolením publikovat odhady. Viz issue #107. Budoucí samostatná experimentální vrstva musí mít metodiku, nejistotu, provenienci a výslovné schválení, než se stane veřejným datasetem.

## Testy a nasazení

- `frontend/tests/humidity-coverage.test.mjs`: původ hodnoty, NULL, RH 0/mimo rozsah, duplicitní/nesprávné hranice, přestupný rok a 23/25hodinové místní dny.
- `frontend/scripts/climate-atlas-browser-check.mjs`: skutečná interakce s výběrem roku, syntetická chybějící a podezřelá RH, roční časové pokrytí, změna 2022 → 2024 a zobrazení poznámky; existující mobil/desktop a světlý/tmavý motiv.
- Standardní Astro typecheck, testy a build v CI. Živý stav dev nasazení vyžaduje samostatný smoke; merge není důkaz nasazení.
