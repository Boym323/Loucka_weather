# P1 · Sdílené načítání aktuálních měření (19. 11. 2026)

## Problém
Na hlavní stránce současně volaly `getCurrent()` komponenty
CurrentPanel, WindCompass a OverviewReadings. Každá vytvářela
samostatný GET k `/api/v1/current`, přestože potřebují shodnou archivní
odpověď. Veřejné DEV API má limit 5 r/s; souběh s dalšími načteními
může vést k HTTP 429, retry a zdržení prvního zobrazení.

## Řešení
- Pouze **současně probíhající** požadavky jsou sdíleny v API klientovi.
  Záměrně nezavádíme perzistentní ani časovou cache, která by mohla
  zaměnit staré údaje za nové.
- Každá komponenta má vlastní AbortSignal. Abort jedné komponenty
  nepřeruší fetch zbylých klientů; podkladový fetch se ruší až po
  odchodu posledního čekajícího klienta.
- `invalidateCurrentRequest()` odděluje generaci na skutečné změně
  archivu a při přechodu z live na archive. Historická odpověď nesmí
  překrýt novější data (CurrentPanel stále ověřuje request serial).
- Přesná validace odpovědi, zdroj WeeWX vs. GW3000, null/suspect stavy,
  chybová hlášení a retry HTTP 429/503/504 zůstávají beze změny.
- Nic se neukládá do localStorage, Service Worker ani jiné cache.

## Ověření
- `node --test tests/current-coalesce.test.mjs`
- `node scripts/current-coalesce-browser-check.mjs` na izolovaném
  `astro preview`: šířky 320/390/1440; očekává počáteční 1 GET
  napříč třemi panely a po revizi nový 1 GET.
- Původní regresní test failover race a live 503 musí stále projít.
- Responzivní před-PR snímky světlý/tmavý z izolovaných, označených
  testovacích údajů a automatické WCAG kontroly.

## Hranice
Frontend a testy. Bez změny produkce, databáze, historických údajů,
WeeWX, GW3000, Nginx API limitu ani kamerového archivu.
