import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('camera timelapse retains video controls and safe MP4 download fallback',async()=>{
 const component=await read('src/features/camera/CameraArchive.astro');
 assert.match(component,/<video controls preload="none" playsinline data-archive-player/);
 assert.match(component,/data-archive-video-note role="status"/);
 assert.match(component,/data-archive-video-download hidden download/);
 assert.match(component,/player\?\.addEventListener\('error'/);
 assert.match(component,/player\?\.addEventListener\('loadedmetadata'/);
 assert.match(component,/download\.href=url/);
 assert.match(component,/const choose=\(url:string,userSelected=false\)=>/);
 assert.match(component,/player\.src=url/);
 assert.match(component,/if\(userSelected\)player\.load\(\)/);
 assert.match(component,/choose\(videos\[0\]\.url\)/);
 assert.match(component,/choose\(select\.value,true\)/);
 assert.match(component,/videos\.length/);
 assert.match(component,/v\.state==='live'/);
 assert.match(component,/průběžný/);
 assert.match(component,/-v\\d\{10\}/);
 assert.match(component,/Časosběr zatím není připravený/);
});

test('public camera smoke requests actual partial MP4 when a video is listed',async()=>{
 const script=await read('scripts/preview-visual-check.mjs');
 assert.match(script,/CAMERA TIMELAPSE/);
 assert.match(script,/bytes=0-31/);
 assert.match(script,/range\.status!==206/);
 assert.match(script,/camera MP4 byte-range playback failed/);
 assert.match(script,/CAMERA VIDEO PLAYBACK/);
 assert.match(script,/camera MP4 playback did not start in Chromium/);
 assert.match(script,/camera player errored before user started playback/);
});


test('camera tabs point to distinct visible archive and timelapse sections',async()=>{
 const page=await read('src/pages/kamera.astro');
 const archive=await read('src/features/camera/CameraArchive.astro');
 assert.match(page,/href="#camera-archive-title">Archiv snímků/);
 assert.match(page,/href="#camera-timelapse-title">Časosběr/);
 assert.match(archive,/id="camera-archive-title"/);
 assert.match(archive,/id="camera-timelapse-title"/);
 assert.match(archive,/#camera-archive-title,#camera-timelapse-title\{scroll-margin-top:90px\}/);
});

test('manual live video refresh preserves the existing playback unless a new video is selected',async()=>{
 const component=await read('src/features/camera/CameraArchive.astro');
 assert.match(component,/data-archive-video-refresh/);
 assert.match(component,/fetch\('\/api\/v1\/camera\/archive',\{signal:ctrl.signal,cache:'no-store'\}\)/);
 assert.match(component,/const previous=select.disabled\?'':select.value/);
 assert.match(component,/if\(forceLatest&&videos\[0\]\.url===previous\)/);
 assert.match(component,/if\(player.getAttribute\('src'\)!==previous\)choose\(previous\)/);
 assert.match(component,/if\(!previous\)choose\(videos\[0\]\.url\)/);
 assert.doesNotMatch(component,/window\.location\.reload\(/);
 assert.match(component,/function scheduleThumbnail\(\)/);
 assert.match(component,/function enqueueThumbnail\(task:/);
 assert.doesNotMatch(component,/const scheduler=setInterval\(/);
});

test('camera loading error is not hidden by an unrelated archive freshness status',async()=>{
 const page=await read('src/pages/kamera.astro');
 assert.match(page,/data-camera-image-fallback hidden/);
 assert.match(page,/if\(img\)img.hidden=true;if\(fallback\)fallback.hidden=false/);
 assert.match(page,/if\(img\)img.hidden=false;if\(fallback\)fallback.hidden=true/);
 const metadata=page.slice(page.indexOf('void getCameraStatus('),page.indexOf('}).catch(()=>{});')+15);
 assert.doesNotMatch(metadata,/status\.textContent\s*=/);
 assert.match(page,/Poslední archivace/);
});

test('shared clock and status polling clean up work during navigation or hidden tabs',async()=>{
 const layout=await read('src/layouts/BaseLayout.astro');
 const monitor=await read('src/pages/stav.astro');
 assert.match(layout,/const clockTimer=window\.setInterval\(tick,60_000\)/);
 assert.match(layout,/astro:before-swap'.*clearInterval\(clockTimer\)/);
 assert.match(monitor,/document\.visibilityState==='visible'/);
 assert.match(monitor,/document\.addEventListener\('visibilitychange',onVisible\)/);
 assert.match(monitor,/document\.removeEventListener\('visibilitychange',onVisible\)/);
});
