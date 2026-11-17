# Kontrola překryvů teplotních intervalů, 25.–26. 7. 2026

**Stav: návrh read-only diagnostiky, nikoli potvrzená oprava.** V historickém auditu #80 jsou oba dny označené jako podezřelé: `archive_day_outTemp.sumtime` je 88 800 s a 88 200 s, tedy delší než místní 24hodinový den. V části řádků jsou časové značky posunuté o 60 sekund vůči pětiminutové síti. Teploty samotné tím ještě nejsou prokázané jako chybné.

## Postup

Z nástroje Navicat nebo jiného read-only MariaDB klienta spustit **pouze** skript `deploy/lxc/qc-outtemp-july-2026-readonly.sql`. Pokud přístup odmítne, neopravovat automaticky granty ani nezkoušet přihlašovací údaje jiné služby. Skript je omezen na původní archivní okno dvou dnů podle Europe/Prague, na primární časový index, a poslední výpis má limit 1 000 řádků.

Skript čtyřmi SELECTy zjistí:
- původní denní `count/sumtime` (beze změny),
- počet existujících a platných raw teplot, offset +60 s, všechny offgrid a neplatné intervaly,
- **sjednocenou délku skutečně pokrytých časových úseků** po odstranění překryvů a oříznutí podle hranic místního kalendářního dne,
- konkrétní offgrid / podezřelé řádky ke kontrole.

Pro místní den 25. 7. používá UTC `(1784930400,1785016800]`, pro 26. 7. `(1785016800,1785103200]`. Python regresní test ověřuje tyto hranice a správné 23/24/25h dny Europe/Prague při letním/zimním čase.

**Vyhodnocení:** je-li `naive_clipped_seconds` vyšší než `distinct_covered_seconds`, časové intervaly se překrývají. Výsledek sám o sobě ještě neurčuje správnost jednotlivých teplot nebo metodiku přepočtu WeeWX souhrnů; 5min kroky s +60s offsetem nemusejí být duplicity. K uzavření konkrétní QC anomálie je potřeba uložit pouze agregované počty, vyjasnit periodu a případně označit souhrn `suspect`. Původní `pocasi-loucka.eu.archive` ani `archive_day_outTemp` se nepřepisují.

## Ochrana

Žádné DML, DDL, změny WeeWX, publikování schválených rekonstrukcí ani přepnutí originálního datasetu. Referenční stanice LuhaMet/WU jsou nezávislé porovnání, nikoliv automatická náhrada lokálního měření. Další roky a měsíce řešit až na základě interpretace těchto dvou omezených dnů.

Souvisí s [issue #80](https://github.com/Boym323/Loucka_weather/issues/80).
