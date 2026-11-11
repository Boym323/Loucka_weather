/** Explicitly opt-in, token protected and UNAPPROVED raw RH preview for dev.
 * Never serves reconstructed data through /api/v1/history or approved dataset.
 */
import type {FastifyInstance} from 'fastify';
import type {ArchiveReader} from './store.js';
import type {DevRhPreview} from './dev-rh-preview.js';

const FROM=1640995200,TO=1672531200;
const RFC3339=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
type Query={from:string;to:string;limit?:string};
function parseEpoch(s:string):number|null{
 if(!RFC3339.test(s))return null;
 const value=Date.parse(s);
 if(!Number.isFinite(value))return null;
 const iso=new Date(value).toISOString();
 // Restrict to canonical UTC to avoid silently normalizing bad dates/DST.
 if(!s.endsWith('Z')||!s.startsWith(iso.slice(0,19)))return null;
 return Math.floor(value/1000);
}
export function registerDevRhPreview(app:FastifyInstance,reader:ArchiveReader,
 preview:DevRhPreview|undefined):void{
 if(!preview)return;
 app.get<{Querystring:Query}>('/api/v1/dev/preview/rh-history',{
  schema:{querystring:{type:'object',additionalProperties:false,
   required:['from','to'],
   properties:{
    from:{type:'string',maxLength:40},
    to:{type:'string',maxLength:40},
    limit:{type:'string',pattern:'^[0-9]{1,4}$'}
   }}}
 },async(req,reply)=>{
  reply.header('Cache-Control','no-store')
   .header('Pragma','no-cache')
   .header('Vary','Authorization')
   .header('X-Robots-Tag','noindex, nofollow');
  if(!preview.authorize(req.headers.authorization))
   return reply.code(401).send({schemaVersion:'1',error:{
    code:'UNAUTHORIZED',message:'Private development RH preview',requestId:req.id}});
  const from=parseEpoch(req.query.from),to=parseEpoch(req.query.to);
  const limit=req.query.limit===undefined?2000:Number(req.query.limit);
  if(from===null||to===null||from<FROM||to>TO||to<=from||
     to-from>7*86400||!Number.isSafeInteger(limit)||limit<1||limit>2000)
   return reply.code(422).send({schemaVersion:'1',error:{
    code:'INVALID_RANGE',message:'Preview requires bounded UTC dates within 2022 (max 7 days, 2000 rows)',requestId:req.id}});
  try{
   const rows=await reader.history('outHumidity',from,to,limit+1);
   if(rows.length>limit)
    return reply.code(422).send({schemaVersion:'1',error:{
     code:'LIMIT_EXCEEDED',message:'Raw RH preview exceeds point limit',requestId:req.id}});
   const points=preview.merge(rows,from,to);
   return {schemaVersion:'1',dataset:'preview_unapproved',
    metric:'outHumidity',unit:'percent',
    range:{from:req.query.from,to:req.query.to,boundary:'(start,end]',timezone:'UTC'},
    packageSha256:preview.packageSha256,recordsSha256:preview.recordsSha256,
    points,count:points.length,approved:false,
    disclaimer:'Historical experimental reconstruction is NOT an original measurement and is NOT validated for production.',
    source:'original_archive_plus_immutable_private_preview_overlay'};
  }catch{
   return reply.code(503).send({schemaVersion:'1',error:{
    code:'PREVIEW_UNAVAILABLE',
    message:'Preview is unavailable or original measurements changed',requestId:req.id}});
  }
 });
}
