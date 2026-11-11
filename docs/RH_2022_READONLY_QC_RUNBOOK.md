# RH 2022 – autonomní jednorázový read-only audit privátního náhledu

**Stav 11. 11. 2026:** Operátor na dev LXC potvrdil běh sidecaru (port 3101): healthz, readyz a UI HTTP 200, bez tokenu HTTP 401, původní API 3100 stále HTTP 200. Autorizovaný test původního záznamu proti pinovanému balíčku rovněž prošel. Dodané PDF grafu pro 26.–30. 4. 2022 zobrazuje 1 438 existujících archivních řádků, 1 272 experimentálních odhadů, 0 platných původních RH a 1 438 původních NULL. Tyto počty samy neprokazují, proč 166 řádků zůstává bez RH ani zda přesně dva časové sloty skutečně chybějí.

## Spuštění na dev LXC

Po sloučení do main jako root:

    runuser -u loucka -- git -C /home/loucka/Loucka_weather pull --ff-only origin main
    python3 /home/loucka/Loucka_weather/deploy/lxc/audit-rh-preview.py --start 2022-04-26 --days 5

Volitelná délka je --days 1, 3 nebo 5. Každý běh provede právě jeden omezený HTTP GET proti localhost-only tokenem chráněnému sidecaru a zpracuje nejvýše 2000 archivních řádků. Nevyžaduje žádnou Python knihovnu mimo standardní distribuci. Bez cron/timer spouštění a bez skenování celého roku.

**Bezpečnost:** Skript nikdy nemění konfiguraci, nespouští systemd restart, nečte QC DB credentials, neotevírá síť mimo 127.0.0.1:3101, nevykonává SQL a nemění produkční ani rekonstrukční databázi. Přístupový token přečte jen lokálně z root-only sidecar env a nikdy jej nevypíše. Proxy a HTTP redirecty odmítá.

## Souhrn a soukromá zpráva

Na stdout se vypisují pouze počty a cesta k reportu. JSON je uložen pod /var/lib/loucka-qc/rh-preview-audit-reports/ s právy 0700 pro složku, 0600 pro soubor a vlastníkem root. Úplný JSON ani soukromý export neukládat do veřejného repozitáře. Do chatu lze poslat bezpečný stdout souhrn.

Report rozlišuje:
- expected_grid_slots: teoretická pětiminutová UTC mřížka s hranicemi (from,to];
- original_archive_rows: počet skutečně existujících archivních řádků;
- missing_entire_grid_slots: chybějící celé sloty (nikoliv jen NULL v existujícím řádku);
- offgrid_archive_rows: časové značky mimo pětiminutovou mřížku;
- unfilled_original_missing: existující řádky s původní RH NULL a stále NULL v náhledu;
- missing_to_estimate, suspect_to_estimate a historically_invalidated: odlišné typy experimentálních změn;
- denní součty, auditní dávky, nejdelší sekvence nevyplněných existujících RH a skoky náhledu o 20 a více procentních bodů v bezprostředně sousedních 5min slotech.

**Omezení:** Sidecar neposkytuje důvod chybějícího odhadu ani surové časově spárované reference LuhaMet/ILOUKA4. Nelze z něj vypočítat nezávislou kvalitu odhadů, jejich RMSE ani meteorologické schválení. Skok 20 p. b. je pouze signál k revizi. UTC není lokální kalendář Europe/Prague. U 1. 1. 2022 je první 00:00 slot mimo povolený levý kraj dotazovacího API, takže takový jednodenní požadavek má pouze 287 očekávaných slotů.

## Offline testy

    python3 -m unittest discover -s /home/loucka/Loucka_weather/deploy/lxc/tests -p 'test_rh_preview_readonly_audit.py' -v

Testy používají syntetické údaje bez HTTP, systemd či DB. Samotné testy neprokazují provoz na LXC.

## Navazující kontrola

Po běhu případně prošetřit nevyplněné RH a chybějící časové sloty samostatným omezeným SELECT-only auditem v QC tabulkách a až poté porovnat časově zarovnané reference s filtrací anomálií. **Žádný automatický souhlas s rekonstrukcí, žádné přepsání originálního archivu ani publikace na veřejný web.**
