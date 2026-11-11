# Soukromý interaktivní přehled kvality historie (read-only)

Stav: připravený zdrojový kód pro **manuální spuštění na testovacím LXC**;
GitHub merge sám report negeneruje ani nezveřejňuje.

## Co report ukazuje

- UTC roky 2009–2026 a 215 kalendářních měsíců (listopad 2026 jen do 10. 11. 00:00 UTC).
- Přesný počet očekávaných 5min slotů, existujících archivních řádků,
  unikátních přesně zarovnaných 5min slotů, samostatně dostupné teploty
  a vlhkosti; `NULL` se nepovažuje za měření.
- Podíl dostupných slotů pro zvolený ukazatel, interaktivní heatmapu,
  výběr roku a měsíce, roční graf a CSV.
- Zabezpečené výsledky 932 již existujících QC JSON:
  odmítnuté originální záznamy a příznaky, týdenní kandidáty,
  zkrácené výpisy, referenční překryv a reliability LuhaMet / ILOUKA4.
- Transparentně odděluje **dostupnost měření** od **platnosti QC**.

## Důležitá omezení

- QC pracovalo v sedmidenních UTC oknech, nikoli v kalendářních měsících.
  Počty QC příznaků, kandidátů a referencí v měsíčním detailu jsou
  přiřazeny **podle data začátku týdne**, nejsou přesným měsíčním měřením.
  Součty za celou historii zůstávají přesné dle uložených QC reportů.
- Dostupnost teploty/vlhkosti z SQL představuje **nenulovou existenci
  hodnoty (non-NULL)** v původním řádku na přesném 5min časovém slotu.
  Nepředstírá nezpochybnitelnou kvalitu čidla. Pozorování mimo síť a
  duplicity se do pokrytí slotů nezapočítají vícekrát.
- 58 QC oken má `candidates.truncated=true`; samostatné detaily přes
  první stovku návrhů **nebyly v původním screeningu uloženy**.
  Report ukazuje přesný celkový počet návrhů, počet zveřejněných
  položek a rozdíl; nevyplňuje skryté položky smyšlenými daty.
- Původní režim nezařazoval `outHumidity=NULL` automaticky mezi
  odmítnuté teplotní QC řádky. Proto je zobrazení vlhkosti zvláštní metrika.
- Měsíce bez originálu i bez referencí mají 0 % pokrytí, **ne „bez chyby“**.
- Report je **soukromý HTML soubor**, nikoli veřejná Astro stránka či HTTP API.
  Výstup se nevkládá do `/srv/loucka-preview`, repozitáře ani veřejného webu.

## Spuštění na LXC

Předpoklady: lokálně aktualizovaná větev `main` se skriptem
`api/scripts/qc-quality-overview.mjs`, ukončený historický QC scan,
932 validovaných soukromých JSON `0600` v adresáři `/var/lib/loucka-qc`
vlastněném `loucka` s právy `0700`, existující root-owned
`/etc/loucka-weather/qc.env` s `WEATHER_STAGING_ENABLED=YES`,
`WEATHER_QC_READ_ONLY=YES` a výhradně čtecím účtem `loucka_web_ro`.

Spustit jako root (před spuštěním ověřit `git rev-parse HEAD`):

```bash
systemctl is-active loucka-qc-catchup.service || true
systemctl is-active loucka-qc-batch.timer || true
test ! -e /var/lib/loucka-qc/.qc-batch.lock
test "$(stat -c '%U:%G %a' /var/lib/loucka-qc)" = "loucka:loucka 700"
test "$(stat -c '%U:%G %a' /etc/loucka-weather/qc.env)" = "root:root 600"

systemd-run --wait --pipe --collect   -p User=loucka -p Group=loucka   -p WorkingDirectory=/home/loucka/Loucka_weather/api   -p EnvironmentFile=/etc/loucka-weather/qc.env   -p NoNewPrivileges=yes -p ProtectSystem=strict   -p ProtectHome=read-only   -p ReadWritePaths=/var/lib/loucka-qc   -p PrivateTmp=yes -p PrivateDevices=yes   -p RestrictAddressFamilies="AF_UNIX AF_INET AF_INET6"   -p MemoryMax=256M -p CPUQuota=50%   -p TimeoutStartSec=600s   /usr/bin/node   /home/loucka/Loucka_weather/api/scripts/qc-quality-overview.mjs   --reports-dir /var/lib/loucka-qc

stat -c '%U:%G %a %s %n' /var/lib/loucka-qc/qc-quality-overview.html
```

Obsah `qc.env`, hesla ani syrové SQL řádky se nesmějí tisknout. Výstup
`status=screening_only`, `processedWindows=932`, 215 měsíců,
`databaseWrites=0`. Soubor HTML má práva `0600`, obsahuje pouze
agregované výsledky, inline HTML/CSS/JS a nepotřebuje internet.

## Otevření na Macu

V samostatném terminálu Macu, v domácí síti:

```bash
scp root@192.168.0.131:/var/lib/loucka-qc/qc-quality-overview.html ~/Downloads/
open ~/Downloads/qc-quality-overview.html
```

Otevřený soubor funguje lokálně a **nekontaktuje žádný server**.
CSV se exportuje v prohlížeči z dat uložených uvnitř HTML.

## Ověření bez zásahu do produkce

```bash
cd /home/loucka/Loucka_weather/api
npm test
```

Syntetické testy potvrzují dokončení 932 QC oken, přepočty
215 měsíců, invarianty zamítnutí nevalidních/neschválených reportů,
časové hranice a nezávislost dostupnosti jednotlivých čidel.
Samostatné SELECT-dotazy měsíčních agregací používají pevně
vymezenou původní tabulku a časové hranice s indexem `dateTime`;
`SHOW GRANTS` odmítá zápisová práva a širší než explicitně povolené
read-only schéma. Není zaveden žádný nový veřejný endpoint.

Další etapa: přesnější přiřazení týdenních QC příznaků na kalendářní
měsíce a úplný uchovaný detail 58 zkrácených QC oken, po samostatném
posouzení verzování již existujících privátních reportů. Žádná
automatická rekonstrukce.
