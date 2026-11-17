# Počasí Loučka – připravenost přechodu a návratu na původní web

**Stav dokumentu:** pracovní plán a seznam důkazů, nikoliv schválení produkčního nasazení. Datum: 17. 11. 2026.

## Co se mění a co nesmí změnit

Nový Astro + Fastify web je vyvíjen na `dev.pocasi-loucka.eu` v Debian 13 LXC. Současný veřejný web `pocasi-loucka.eu` s WeeWX/Belchertown zůstává aktivní. **V této etapě nic nepřepínat a neodstavovat WeeWX.**

- Produkční `pocasi-loucka.eu.archive` a jeho denní souhrny jsou zdroj, výhradně `SELECT`; rekonstrukční `loucka_reconstruction.archive` není zdrojem pro web.
- DEV automatizace pracuje s `main`, sestavuje statické frontendové release podle SHA a publikuje je až po `healthz` + `readyz` API; toto **není hotový blue/green rollback backendu**.
- Živé hodnoty z GW3000 a archivní hodnoty WeeWX jsou vždy explicitně odlišeny. Výpadek živého zdroje nesmí znamenat dosazení nuly ani vytvoření smyšlených měření.
- Změny účtů DB, grantů a TLS jsou na výslovný pokyn provozovatele **odložené**. V deníku rizik zaznamenat stávající stav, ale v této práci do DB konfigurace nezasahovat.

## Důkazy, které lze bezpečně získat už nyní

Na **DEV LXC**, se stávajícími oprávněními operátora:

```bash
bash /home/loucka/Loucka_weather/deploy/lxc/preview-operations-check.sh
bash /home/loucka/Loucka_weather/deploy/lxc/site-readiness-audit.sh
python3 /home/loucka/Loucka_weather/deploy/lxc/preview-performance-check.py
```

Každý skript provádí jen čtení konfigurace, metadat a omezené GET/SELECT operace, **nikoli zátěžový test, zálohování, restart, přepnutí proxy nebo obnovu**. Při předávání výsledků nešířit interní adresy, soukromé logy, přístupové údaje nebo konkrétní meteorologické záznamy mimo důvěryhodné prostředí.

Z GitHub Actions zaznamenat **aktuální** SHA `main`, výsledek `Astro frontend`, `Fastify API` (pokud se API změnilo), veřejný DEV smoke, počet požadavků na klimatologii a skutečný `deployment.json.commit`. Uživatel vidí 15 veřejných tras, ale některý log workflow může mít stále historický popis kroku „11 routes“. Důležitý je skutečný seznam testovaných tras.

Orientační cíle pro přípravu: 15 veřejných tras na desktopu/mobilu, klimatologie maximálně 20 fetchů (ověřený vzorek 10), jeden souhrnný GET, zobrazení živých GW3000 hodnot i návratu na archiv, nulové hodnoty odlišné od chybějících, DST ve `Europe/Prague`. Tyto kontroly prokazují funkčnost v jednom laboratorním běhu, **nikoliv dlouhodobý výkon, zálohy nebo reálnou obnovitelnost**.

## Neověřené body mimo DEV LXC

Provozovatel před samotným přechodem na **Proxmox hostu / zálohovací infrastruktuře** zaznamená:

| Oblast | Požadovaný důkaz | Stav |
|---|---|---|
| Stávající produkční WeeWX | Konkrétní existující instance, veřejná cesta a její aktuální stav | NEOVĚŘENO |
| Záloha WeeWX / databáze | Existující zálohovací úloha, poslední úspěšný běh, retenční politika | NEOVĚŘENO |
| Obnova | Zkušební obnovení poslední zálohy do **odděleného izolovaného LXC** a ověření dat; nikdy přes produkční CT | NEOVĚŘENO |
| Nové DEV API | Dvě stabilní `readyz`, evidovaný restart a vyhodnocení RSS/heap z více okamžiků | DOPLNIT AKTUÁLNÍ BĚH |
| Přístupové cesty | NPM / reverse proxy / DNS: skutečné vstupní cíle, hranice LAN/WAN a omezení přímého přístupu | NEOVĚŘENO |
| Návrat | Uložené původní nastavení cíle proxy a otestované přepnutí pouze ve zkušebním prostředí | NEOVĚŘENO |
| Výkonnost | Opakovaná měření API, zejména studený a ohřátý klimatologický dashboard; bez agresivní zátěže MariaDB | NEOVĚŘENO |

Nenahrazovat kontrolu Proxmox backupu výpisem z DEV LXC. Neuvádět identifikátor kontejneru, úložiště nebo IP, které nebyly přímo ověřeny.

## Budoucí produkční přechod: až po výslovném schválení

1. Nejdřív odsouhlasit servisní okno, hranice rollbacku a vlastníka zásahu. Vyfotit či bezpečně exportovat **skutečný původní stav** Nginx Proxy Manageru/DNS (bez hesel). Ponechat původní WeeWX plně funkční.
2. Ověřit zálohy a **izolovaný restore test** mimo produkční CT. Neměnit data historického archivu ani provozní schéma, neopravovat meteo měření v rámci release.
3. Ověřit SHA nového frontendového releasu, běh odpovídajícího Fastify API, `readyz`, veřejné grafy/klimatologii, zdroj živých dat a datumové hranice. Připravit kontrolní odpovědi po přepnutí.
4. V plánovaném okně přesměrovat pouze existující veřejnou webovou cestu přes **skutečně používané** NPM/DNS nastavení; adresu upstreamu nepředpokládat. Na první provozní změnu nepřevádět obsluhu původní databáze ani přenos GW3000.
5. Po změně nezávisle zkontrolovat veřejnou homepage, historii, aktuální a archivní stavy, kameru, HTTP chyby a interní Fastify readiness. Pokud pravidla rollbacku nastanou, bez prodlevy obnovit uložené původní směrování na WeeWX.

### Návrat zpět – princip, nikoliv příkaz pro okamžité provedení

- **Příčina na novém webu** (API 503, nefunkční grafy, neověřené zdroje): vrátit původní cílový web v NPM/DNS. Původní WeeWX musí zůstat stále v provozu; jeho MariaDB **neobnovovat ani nepřepisovat** pouze kvůli chybě frontendu.
- **Příčina uvnitř DEV release**: samotná změna symlinku `/srv/loucka-preview/current` vrací jen statický frontend. Pokud se změnilo i API, je nutné zvlášť vrátit odpovídající Fastify artefakt a ověřit kompatibilitu a `readyz`. Aktivační helper nemá plný blue/green rollback.
- Pokud vznikne chybný či neznámý stav, rozhoduje zachování původního produkčního WeeWX. Do DB a rekonstruovaných oprav nezasahovat.

## Co tímto dokumentem **není** potvrzeno

Není potvrzená existence ani úspěšná obnova konkrétní zálohy, síťové ACL, trvalá stabilita paměti, akceptovatelné RPO/RTO, účinnost návratu přes NPM ani povolení k produkčnímu nasazení. Výsledek **NO-GO pro automatický produkční cutover** zůstává, dokud tyto důkazy nejsou zdokumentovány a provozovatel změnu výslovně neschválí.
