/**
 * Local static Astro accessibility audit, independent of the real meteorological
 * API. Axe detects automatable WCAG failures, not full WCAG conformance.
 * Nothing writes to production, staging or the source database.
 */
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.LOCAL_PREVIEW_URL || 'http://127.0.0.1:4321/';
const routes = [
  '/', '/aktualne/', '/grafy/', '/klimatologie/', '/kamera/', '/mapy/',
  '/senzory/', '/rekordy/', '/puda-ovzdusi/', '/stav/', '/o-stanici/',
  '/klimatologie/extremy/', '/klimatologie/trendy/',
  '/klimatologie/sezony/', '/klimatologie/rocenka/'
];
const viewports = [
  { name: 'mobil', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 }
];
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axeSource = await readFile(
  new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8'
);
const checks = [];
const errors = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1
    });
    for (const theme of ['light', 'dark']) {
    for (const path of routes) {
      const page = await context.newPage();
      await page.addInitScript(mode => {
        try { localStorage.setItem('loucka-theme', mode); } catch {}
      }, theme);
      try {
        const response = await page.goto(new URL(path.replace(/^\//, ''), origin).href, {
          waitUntil: 'domcontentloaded', timeout: 25000
        });
        if (response?.status() !== 200) {
          throw new Error('HTTP ' + (response?.status() ?? 'no response'));
        }
        const activeTheme = await page.locator('html').getAttribute('data-theme');
        if (activeTheme !== theme) {
          throw new Error('Theme mismatch: expected ' + theme + ', received ' + activeTheme);
        }
        if (path === '/klimatologie/' && viewport.name === 'mobil') {
          // Scan a revealed menu too, not just the hidden default state.
          const summary = page.locator('[data-climate-quick-nav] summary');
          await summary.click();
        }
        await page.addScriptTag({ content: axeSource });
        const result = await page.evaluate(async (runTags) => {
          const axe = window.axe;
          return axe.run(document, { runOnly: { type: 'tag', values: runTags } });
        }, tags);
        const violations = result.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.help,
          nodes: v.nodes.map(n => ({
            target: n.target,
            failureSummary: n.failureSummary
          }))
        }));
        checks.push({
          route: path, viewport: viewport.name, width: viewport.width, theme,
          violations, incomplete: result.incomplete.map(v => v.id),
          passedRules: result.passes.length
        });
        for (const violation of violations) {
          const target = JSON.stringify(violation.nodes.slice(0, 3).map(n => n.target));
          console.error('A11Y', viewport.name, theme, path, violation.impact,
            violation.id, target);
          if (violation.impact === 'critical' || violation.impact === 'serious') {
            errors.push(viewport.name + ' ' + theme + ' ' + path + ': ' + violation.id);
          }
        }
        console.log('A11Y CHECK', viewport.name, theme, path,
          'violations=' + violations.length, 'passed=' + result.passes.length);
      } catch (error) {
        errors.push(viewport.name + ' ' + theme + ' ' + path + ': ' + String(error));
      } finally {
        await page.close();
      }
    }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await mkdir('test-results/accessibility', { recursive: true });
await writeFile('test-results/accessibility/axe-wcag.json', JSON.stringify({
  inspectedAt: new Date().toISOString(),
  scope: 'local Astro preview, browser fallback when meteorological API unavailable',
  standards: tags, checks, blockers: errors
}, null, 2) + '\n');
const flagged = checks.reduce((sum, check) => sum + check.violations.length, 0);
console.log('WCAG AUTOMATED AUDIT', checks.length, 'page/viewport checks;',
  flagged, 'total rule violations;', errors.length, 'serious/critical or runtime failures');
if (errors.length) {
  console.error('Automated WCAG audit blockers:\n' + errors.join('\n'));
  process.exitCode = 1;
}
