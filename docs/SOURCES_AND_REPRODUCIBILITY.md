# Loučka Weather – zdroje, metodika, reprodukovatelnost, soukromí

**Aktualizace 31. 10. 2026.** Rozlišuj: *primární podklady*, *vypočtené agregáty*, *heuristické odhady* a *pracovní doporučení*.

## Primární podklady
- **Nginx Proxy Manager**: uživatelem nahraný soubor `pocasi-loucka-logs.tar.gz` se soubory `proxy-host-9_access.log`, `proxy-host-9_access.log.1.gz` až `.4.gz`. Originální archiv **není a nebude publikován** do veřejného GitHubu (IP adresy, user-agenty, referery, dotazovací URL). SHA256 originálního TAR.GZ: `9b782dfa06e80cb71268eae26ee72eae57ac7f1f233547c049f89f1ab0ed3d10`. Kontrolní součet slouží jen k identifikaci nahraného zdroje, nikoli k jeho zpřístupnění.
- **Matomo site ID 1, `pocasi-loucka.eu`, časová zóna `Europe/Prague`**: agregace načtené read-only přes připojený Matomo konektor v konverzaci 31. 10. 2026. Dotazy `VisitsSummary.get`, `Actions.getPageUrls`, `Actions.get`, `DevicesDetection.getType`, `Referrers.getReferrerType`, `VisitFrequency.get`, `VisitTime.getVisitInformationPerServerTime`, `Live.getCounters`. Bez exportu osobních identifikátorů návštěv.
- **WeeWX/MariaDB**: read-only Weather MCP `execute_sql` s `database_name=""`. Ověření posledního 24h okna podle MAX(`dateTime`) mělo 288 řádků, všechny `interval=5`. Není to důkaz neměnnosti tohoto intervalu v celé historii.
- **Výkonnostní testy na testovacím Debian 13 LXC**: primární souhrny ve větvi `bench/go-rust-python`. HTTP 3 plné běhy mají tři JSON benchmarky, podle dřívější zprávy uložené na GitHubu jako analytické reporty; originální JSON je potřeba zachovat mimo veřejný projekt, pokud může obsahovat údaje o infrastruktuře. Offline benchmark: výsledky ze stdout uživatele; původní tři JSON reporty zatím **nejsou** v tomto repozitáři.

## Kontrola Nginx – algoritmus
1. Rozbalit TAR, interní `.gz` dekomprimovat, číst `UTF-8` s náhradou chybných bajtů, regulárním výrazem parsovat datum, status, metodu, host, URL, IP, délku, HTTP upstream status a user-agent.
2. **Počítat i 21 nestandardních záznamů HTTP 400** se znakem `-` místo HTTP metody a prázdným `[Sent-to ]`. Ostatních 54 945 řádků odpovídá běžnému formátu. Celkem 54 966/54 966 parse PASS.
3. Zohlednit explicitní `+0100` a `+0200` v logu pro časové řady a hranice DST; špičky v reportu vyjádřeny v místním čase podle offsetu z logu. Počítat statusy **proxy odpovědi**, nikoli upstream odpovědi, které mohou být `-` při přesměrování.
4. Počet unikátních IP počítat **jen jako kardinalitu**, nepublikovat seznam, hash nebo per-IP časové řady.
5. Rozlišovat GET/HEAD od 101 upgrade na WebSocket, 301 redirect na proxy, 499 client abort a 404. `101` není chyba ani délka spojení.
6. Data denních agregátů v [CSV](data/traffic_daily_2026-09-27_2026-10-31.csv) včetně krajních částečných dnů. Medián za **33 vnitřních dní** = 1 476 požadavků; nejde o plnou kalendářní návštěvnost.
7. **Nededuplikovat stejné HTTP požadavky** jen podle stejné IP/URL/sekundy – legitimně může jít o více oddělených requestů. Logy jednotlivých rotací ověřit podle linek a časové posloupnosti; logický součet 5 souborů tvoří 54 966 událostí.
8. Rozdělení na skenery/roboty/lidi je **heuristika**, nikoliv ověřená identita. Dřívější přibližné rozdělení 31 638 „skenování“, 8 567 „roboti“, 4 570 „monitoring“, 10 191 „ostatní“ je podle předchozí konverzační heuristiky bez zveřejněného reprodukovatelného klasifikátoru; použij je jen jako **orientační odhad**, nikoli auditovanou absolutní pravdu. Pevně ověřená jsou HTTP statusy, časové špičky, výskyt konkrétních deklarovaných agentů a endpointů.

## Ochrana soukromí a bezpečnosti
- Repo je **veřejné**. Neposílat do něj originální NPM access logy, IP adresy (včetně interních), cookies, hlavičky Authorization, e-mailové adresy, konkrétní identifikátory návštěvníků, ukázky exploit payloadů ani tajné URL.
- Pro reprodukci auditů se interně zachovává originální TAR.GZ a může být znovu předán do zabezpečeného pracovního prostředí. Pro dalšího AI postačují tyto Markdown reporty a agregované CSV bez IP.
- K bezpečnostnímu rozhodnutí nestačí absence odpovědí `200` na známé citlivé cesty. Případný skutečný incident ověřovat samostatně proti serverovým logům a konfiguraci Nginx/WeeWX.
- Výkonový benchmark proti produkční DB **neopakovat**. Stávající benchmark v JSON nesprávně označil `isolated_copy=true`; realita byla živá produkční MariaDB. Následující výkonnostní testy jen izolovaný snapshot, vstupy stabilní, zátěž DB writeru změřená.

## Kde najít další údaje
[Kontext projektu](PROJECT_CONTEXT.md) · [Nginx audit](TRAFFIC_AUDIT_2026-10-31.md) · [Matomo audit](MATOMO_AUDIT_2026-10-31.md) · [Syntéza benchmarků](BENCHMARK_SYNTHESIS_2026-10-31.md) · [ADR](ARCHITECTURE_DECISION_2026-10-31.md).
