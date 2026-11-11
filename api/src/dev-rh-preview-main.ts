/** Explicitly opt-in sidecar, not the existing staging API and not the public web.
 * This process does not start archive/live observers or gateway collectors.
 */
import Fastify from 'fastify';
import {createMariaDbReader} from './db.js';
import {loadDevRhPreviewFromEnv} from './dev-rh-preview.js';
import {registerDevRhPreview} from './dev-rh-preview-route.js';
import {registerRhPreviewOperatorUi} from './dev-rh-preview-web.js';

export function validateRhPreviewSidecarEnv(env:NodeJS.ProcessEnv):void{
 if(env.WEATHER_DB_SCHEMA!=='pocasi-loucka.eu'||
    env.WEATHER_STAGING_ENABLED!=='YES'||
    env.WEATHER_DEV_PREVIEW_ENABLED!=='YES'||
    env.WEATHER_DEV_PREVIEW_MODE!=='isolated_dev_only'||
    (env.HOST??'127.0.0.1')!=='127.0.0.1'||
    Number(env.PORT)!==3101)
  throw Error('RH preview must use the original SELECT-only DB in an isolated loopback sidecar on port 3101');
}
export async function runRhPreviewSidecar(env:NodeJS.ProcessEnv=process.env):Promise<void>{
 validateRhPreviewSidecarEnv(env);
 // Do not instantiate any additional live data observers or background pollers.
 const preview=loadDevRhPreviewFromEnv(env);
 if(!preview)throw Error('Pinned unapproved RH package is required for preview sidecar');
 const reader=createMariaDbReader();
 const app=Fastify({logger:false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
 app.addHook('onClose',async()=>{await reader.close?.();});
 registerDevRhPreview(app,reader,preview);
 registerRhPreviewOperatorUi(app);
 app.get('/dev/rh-preview/healthz',async()=>({status:'ok',preview:'loaded',dataset:'preview_unapproved'}));
 app.get('/dev/rh-preview/readyz',async(_req,reply)=>{
  try{await reader.ping();return {ready:true,preview:'loaded',source:'original_read_only'};}
  catch{return reply.code(503).send({ready:false,reason:'archive_unavailable'});}
 });
 let stopping:Promise<void>|undefined;
 const shutdown=()=>{stopping??=app.close();void stopping.catch(()=>{process.exitCode=1;});};
 process.once('SIGTERM',shutdown);
 process.once('SIGINT',shutdown);
 try{await app.listen({host:'127.0.0.1',port:3101});}
 catch(error){await app.close();throw error;}
}
