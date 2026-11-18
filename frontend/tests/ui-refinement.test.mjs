import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('mobile homepage has independent but connected real-data instrument surfaces',async()=>{
 const home=await read('src/pages/index.astro');
 const css=await read('src/styles/ui-refinement.css');
 const base=await read('src/layouts/BaseLayout.astro');
 assert.match(base,/import '\.\.\/styles\/ui-refinement\.css'/);
 for(const element of ['CurrentPanel','DailySummaryStrip','WindCompass','HistoryChart'])
  assert.ok(home.includes('<'+element));
 for(const area of ['evergreen-core','evergreen-daily','evergreen-wind','evergreen-chart'])
  assert.ok(css.includes('.evergreen-hero>.'+area));
 assert.match(css,/grid-template-areas:"core" "quick" "daily" "wind" "chart"/);
 assert.match(css,/backdrop-filter:none/);
 assert.match(css,/\.evergreen-scene \.evergreen-hero>\.evergreen-quick-access/);
 assert.match(css,/height:145px!important/);
});

test('camera gives immediate access to live image, timelapse and photographs',async()=>{
 const page=await read('src/pages/kamera.astro');
 const archive=await read('src/features/camera/CameraArchive.astro');
 for(const id of ['camera-current','camera-photos','camera-timelapse-title']){
  assert.ok(page.includes('href="#'+id+'"'),'missing navigation link '+id);
  assert.ok((page+archive).includes('id="'+id+'"'),'missing navigable anchor '+id);
 }
 assert.match(page,/class="camera-view-navigation"/);
 assert.match(page,/<details class="section camera-direction camera-technical-note">/);
 assert.ok(page.indexOf('<CameraArchive />')<page.indexOf('<aside class="camera-sidebar">'),
  'on mobile, video and photos must precede secondary sidebar information');
 const styles=await read('src/styles/ui-refinement.css');
 assert.match(styles,/grid-template-areas:"camera sidebar" "archive archive"/);
 assert.match(styles,/grid-template-areas:"camera" "archive" "sidebar"/);
 assert.ok(styles.includes('display:grid!important;'));
 assert.match(page,/<summary>Odkud kamera snímá\?<\/summary>/);
 const video=archive.indexOf('data-archive-player');
 const frames=archive.indexOf('data-archive-frames');
 assert.ok(video>=0&&frames>video,'video should be prominent, before photo thumbnails');
 assert.match(archive,/camera-photos-block camera-mode-surface/);
 assert.match(archive,/<video controls preload="none" playsinline data-archive-player hidden/);
});

test('camera behavioral integration contracts and genuine data provenance are unchanged',async()=>{
 const archive=await read('src/features/camera/CameraArchive.astro');
 const page=await read('src/pages/kamera.astro');
 for(const hook of [
  'data-archive-status','data-archive-frames','data-archive-date',
  'data-archive-day-frames','data-archive-page-controls',
  'data-archive-video','data-archive-video-refresh','data-archive-player',
  'data-archive-video-note','data-archive-video-download'
 ])assert.ok(archive.includes(hook),'missing camera behavior hook '+hook);
 assert.match(archive,/\/api\/v1\/camera\/archive/);
 assert.match(archive,/validVideo=/);
 assert.match(page,/getCameraStatus/);
 assert.match(page,/Čas pořízení snímku není dostupný/);
 assert.match(page,/data-camera-auto aria-describedby="camera-auto-hint" aria-pressed="false"/);
 assert.match(page,/id="camera-auto-hint" class="sr-only"/);
 assert.doesNotMatch(page,/data-camera-auto aria-label=/);
 assert.match(archive,/nikoli přesně ověřený okamžik pořízení/);
});

test('data graphs use consistent readable controls without hiding missing measurements',async()=>{
 const styles=await read('src/styles/ui-refinement.css');
 const graph=await read('src/features/history/HistoryChart.astro');
 assert.match(styles,/\[data-history-chart\],\.advanced-history,\[data-rain-detail\]/);
 assert.match(styles,/min-height:40px/);
 assert.match(styles,/font-size:12px/);
 assert.match(graph,/fontSize:compact\?11:12/);
 assert.match(graph,/point\.value===null\|\|point\.quality==='missing'/);
 assert.match(graph,/connectNulls:false/);
 assert.match(graph,/data-chart-retry hidden/);
});

test('mobile and reduced motion design preserve responsive and accessible controls',async()=>{
 const css=await read('src/styles/ui-refinement.css');
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/\.camera-view-navigation a/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/focus-visible/);
 assert.match(css,/var\(--panel\)/);
 assert.match(css,/var\(--line\)/);
});
