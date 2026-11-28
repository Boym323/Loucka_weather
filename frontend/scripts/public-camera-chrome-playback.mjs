/** Read-only, bounded check of one completed public DEV video in branded Chrome.
 * No screenshots, media artifacts, credentials, source changes or bulk downloads.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const origin='https://dev.pocasi-loucka.eu';
const deployment=async()=>{
 const response=await fetch(origin+'/deployment.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,200,'DEV deployment unavailable');
 const {commit}=await response.json();
 assert.match(commit,/^[a-f0-9]{40}$/,'invalid DEV revision');
 return commit;
};
const before=await deployment();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 // Playback alone is under test. Suppress photo and external requests.
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==origin||req.resourceType()==='image')return route.abort();
  return route.continue();
 });
 const response=await page.goto(origin+'/kamera/',{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(response?.status(),200);
 const select=page.locator('[data-archive-video]');
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-archive-video] option')].some(
  o=>o.textContent?.includes('dokončený')&&/^\/api\/v1\/camera\/timelapse\/\d{4}-\d{2}-\d{2}\.mp4$/.test(o.value)),
  null,{timeout:20000});
 const selected=await select.evaluate(el=>[...el.options].find(o=>o.textContent?.includes('dokončený')&&
  /^\/api\/v1\/camera\/timelapse\/\d{4}-\d{2}-\d{2}\.mp4$/.test(o.value)).value);
 const player=page.locator('[data-archive-player]');
 assert.ok(await player.evaluate(v=>v.canPlayType('video/mp4; codecs="avc1.42E01E"')),
  'This runner does not advertise H.264; do not mark playback successful');
 await select.selectOption(selected);
 await player.evaluate(async v=>{
  v.muted=true;
  let timeout;
  try{await Promise.race([v.play(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Play timeout')),15000);})]);}
  finally{clearTimeout(timeout);}
 });
 await page.waitForFunction(()=>{
  const v=document.querySelector('[data-archive-player]');
  return v&&!v.error&&v.readyState>=2&&v.videoWidth>0&&v.videoHeight>0&&v.currentTime>.05&&
   v.getVideoPlaybackQuality().totalVideoFrames>0;
 },null,{timeout:15000});
 const decoded=await player.evaluate(v=>{
  v.pause();
  const info={duration:v.duration,width:v.videoWidth,height:v.videoHeight,frames:v.getVideoPlaybackQuality().totalVideoFrames,
   currentTime:v.currentTime,error:v.error?.code??null};
  return info;
 });
 assert.equal(decoded.error,null);
 assert.ok(Number.isFinite(decoded.duration)&&decoded.duration>.25,'video must have finite duration');
 const target=decoded.duration*.6;
 await player.evaluate((v,target)=>{v.currentTime=target;},target);
 await page.waitForFunction(target=>{
  const v=document.querySelector('[data-archive-player]');
  return v&&!v.error&&!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-target)<.15;
 },target,{timeout:15000});
 const seek=await player.evaluate(v=>({time:v.currentTime,readyState:v.readyState,error:v.error?.code??null}));
 assert.equal(seek.error,null);
 // Avoid retaining the media in a browser or uploading images.
 await player.evaluate(v=>{v.pause();v.removeAttribute('src');v.load();});
 await page.close();
 const after=await deployment();
 assert.equal(after,before,'DEV changed during playback; repeat before claiming evidence');
 console.log('CHROME H264 PLAYBACK AND SEEK PASS',JSON.stringify({deployedCommit:before,browser:browser.version(),decoded,seek}));
}finally{await browser.close();}
