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
 assert.match(component,/žádné časosběrné MP4/);
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
