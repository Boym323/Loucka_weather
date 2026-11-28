import Fastify from 'fastify';
import {registerDevRhPreview} from './dev-rh-preview-route.js';
import type {DevRhPreview} from './dev-rh-preview.js';
import {registerExtras} from './extras.js';
import type {ExtraSourceFiles} from './extras.js';
import type {ArchiveReader} from './store.js';

import {errorBody} from './http-contract.js';
import type {LiveHub} from './live.js';
import {registerObservationRoutes} from './observation-routes.js';
import {registerClimateRoutes} from './climate-routes.js';
import {registerStationRoutes} from './station-routes.js';
import {registerStatisticsRoutes} from './statistics-routes.js';
import {registerHistoryRoute} from './history-route.js';

export function buildApp(reader:ArchiveReader,now:()=>Date=()=>new Date(),liveHub?:LiveHub,
 sourceFiles:ExtraSourceFiles={},devRhPreview?:DevRhPreview){
 const app=Fastify({logger:false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
 const metadataCheckedAt=now().toISOString();
 app.setErrorHandler((err,req,reply)=>{
  const invalid=Boolean((err as {validation?:unknown}).validation);
  void reply.code(invalid?400:500).send(errorBody(invalid?'BAD_REQUEST':'INTERNAL_ERROR',
   invalid?'Invalid API query':'Internal API failure',req.id));
 });
 app.setNotFoundHandler((req,reply)=>{
  void reply.code(404).send(errorBody('NOT_FOUND','Unknown endpoint',req.id));
 });
 registerStationRoutes(app,reader,now,liveHub,sourceFiles,metadataCheckedAt);
 registerClimateRoutes(app,reader,now);
 registerStatisticsRoutes(app,reader);
 registerObservationRoutes(app,reader,now,liveHub);
 registerHistoryRoute(app,reader,liveHub);
 registerExtras(app,reader,sourceFiles);
 registerDevRhPreview(app,reader,devRhPreview);
 return app;
}
