import { createMariaDbReader } from './db.js';
import { buildApp } from './app.js';
const reader=createMariaDbReader();
const app=buildApp(reader);
app.addHook('onClose',async()=>{await reader.close?.();});
const port=Number(process.env.PORT||3100);
const host=process.env.HOST||'127.0.0.1';
await app.listen({port,host});
