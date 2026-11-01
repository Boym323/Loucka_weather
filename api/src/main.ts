import { createMariaDbReader } from './db.js';
import { buildApp } from './app.js';
import { ArchiveObserver,LiveHub } from './live.js';
import {GatewayObserver} from './gateway.js';
const reader=createMariaDbReader();
const liveHub=new LiveHub();
const observer=new ArchiveObserver(reader,liveHub);
const gateway=new GatewayObserver(liveHub);
const app=buildApp(reader,()=>new Date(),liveHub);
app.addHook('onClose',async()=>{observer.stop();gateway.stop();await reader.close?.();});
const port=Number(process.env.PORT||3100);
const host=process.env.HOST||'127.0.0.1';
let closing:Promise<void>|undefined;
let shuttingDown=false;
const closeApp=()=>closing??=(app.close());
const onShutdown=()=>{shuttingDown=true;void closeApp().catch(()=>{process.exitCode=1;});};
process.once('SIGINT',onShutdown);
process.once('SIGTERM',onShutdown);
try{
 await observer.start();
 if(process.env.GW3000_LIVE_ENABLED==='YES')gateway.start();
 if(!shuttingDown)await app.listen({port,host});
}catch(error){
 observer.stop();gateway.stop();
 try{await closeApp();}catch{process.exitCode=1;}
 throw error;
}
