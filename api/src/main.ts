import { createMariaDbReader } from './db.js';
import { buildApp } from './app.js';
import { ArchiveObserver,LiveHub } from './live.js';
const reader=createMariaDbReader();
const liveHub=new LiveHub();
const observer=new ArchiveObserver(reader,liveHub);
const app=buildApp(reader,()=>new Date(),liveHub);
app.addHook('onClose',async()=>{observer.stop();await reader.close?.();});
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
 if(!shuttingDown)await app.listen({port,host});
}catch(error){
 observer.stop();
 try{await closeApp();}catch{process.exitCode=1;}
 throw error;
}
