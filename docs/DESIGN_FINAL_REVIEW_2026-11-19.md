# Počasí Loučka · závěrečná designová revize (19. 11. 2026)

## Základ a provedené kontroly

Referenční vizuální důkaz: úspěšný veřejný DEV screenshot workflow
[GitHub Actions #44517083575](https://github.com/Boym323/Loucka_weather/actions/runs/44517083575)
na commitu `f9d315133`. Archiv obsahuje **15 tras** při šířkách **390 px a 1440 px**, včetně
úvodu, měření, grafů, klimatologie, kamery, rekordů, map a stránky o stanici.
Tyto snímky dokládají layout v daném čase, nikoli kvalitu všech počasových měření nebo chování iOS.

Na snímcích zůstává rozpoznatelná a sjednocená identita **Atlas / Evergreen**: světlé
a tmavé variace, zelenomodrá akcentní barva, skutečná fotografie Loučky,
přehledová karta měření, větrná růžice, klimatologický atlas a přehledná navigace.
Do designu nebyl zaveden nový grafický koncept ani generické ilustrace nahrazující měření.

## Uzavření implementačního vizuálu v PR #164

- **Typografie:** sjednocené velké nadpisy stránek, maximální délka úvodních odstavců,
  čitelné popisky se správným řádkováním, vyvážené sekční titulky a statusové štítky.
- **Mobil:** méně drobný text u měření, původu dat, rychlých odkazů, předpovědi a klimatologického úvodu.
  Žádné přepsání naměřených hodnot ani odstranění důkazů o chybějícím měření.
- **Dotyk a klávesnice:** minimálně 44 px u zvolených ovládacích prvků grafů,
  kamery a rozbalovacích panelů. Čitelný `focus-visible` ve stávajících barevných tokenech.
- **Testy:** izolovaný Chromium design audit na pěti trasách × 320/390/1440 px × světlo/tma
  (30 kombinací), horizontální přetečení, nadpisy, dotykové cíle,
  syntetický **root font-size 200 %** stress test; screenshoty homepage a kamery.
  Nejde o certifikaci skutečného systémového text-only zoomu.
- **Provozní QA:** nahrazení `npx playwright install --with-deps chromium` instalací pouze Chromia.
  Důvodem je chybný Ubuntu mirror vracející HTTP 503 dne 19. 11.; případné chybějící systémové
  knihovny nebo chyba browser CDN nadále znamenají FAIL a vyžadují nápravu, ne přeskočení kontroly.

## Co designová revize **neuzavírá**

- **Uživatelský výběr mobilní varianty:** `/?mobile=compact` je dobrovolný prototyp.
  Bez krátkého uživatelského ověření jej nepřepínat jako výchozí.
- **Skutečná zařízení:** fyzický iPhone Safari, VoiceOver, TalkBack, nativní 200% text-only zoom,
  kontrast při systémovém zvýšeném kontrastu, motorická ovladatelnost.
  Automatické Axe PASS samo o sobě neprokazuje WCAG 2.2 AA.
- **Přehrávání videa:** issue #143 vyžaduje reálný play/pause/seek/fullscreen v Safari.
- **Produkční readiness:** firewall/ACL, DB grants, bezpečnostní závislosti, zálohy a rollback
  jsou oddělené provozní brány. Pořád platí **NO-GO pro produkční přepnutí**.

## Akceptace při slučování

Požaduje se aktuální zelené Astro check / unit / build, Chromium responsive & axe /
history / kamera / failover bez oslabení testů a následný veřejný DEV smoke
potvrzující přesný `deployment.json` SHA.

Žádné změny Fastify API, živého GW3000, MariaDB, WeeWX, originálního archivu
ani nasazení původní produkční verze.
