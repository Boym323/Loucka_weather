import {createHash} from 'node:crypto';
import type {FastifyReply,FastifyRequest} from 'fastify';
import {aggregationPolicy} from './aggregation.js';
import type {Aggregation} from './aggregation.js';
import type {Metric} from './metrics.js';

/** Shared HTTP response and query contract. Registration order remains in app.ts. */
export const commonQuery={
 type:'object',additionalProperties:false,
 properties:{
  units:{type:'string',enum:['us','metric','metricwx']},
  dataset:{type:'string',enum:['original','approved']}
 }
} as const;
function responseEtag(body:unknown):string {
 return '"'+createHash('sha256').update(JSON.stringify(body)).digest('hex')+'"';
}
export function historyPolicy(metric:Metric):{aggregation:Aggregation;enabled:boolean}{
 const policy=aggregationPolicy[metric] as {default:Aggregation;statsEnabled:boolean};
 return {aggregation:policy.default,enabled:policy.statsEnabled};
}
export const errorBody=(code:string,message:string,requestId:string)=>({
 schemaVersion:'1',error:{code,message,requestId}
});
export const bad=(reply:FastifyReply,reqId:string,code:string,message:string,status=400)=>
 reply.code(status).send(errorBody(code,message,reqId));
export const conditional=(req:FastifyRequest,reply:FastifyReply,body:unknown,cacheControl='no-cache')=>{
 const etag=responseEtag(body);
 reply.header('ETag',etag).header('Cache-Control',cacheControl);
 const supplied=req.headers['if-none-match'];
 const candidates=typeof supplied==='string'?supplied.split(',').map((tag:string)=>tag.trim()):[];
 const matches=candidates.includes('*')||candidates.includes(etag)||candidates.includes(`W/${etag}`);
 return matches?reply.code(304).send():body;
};
