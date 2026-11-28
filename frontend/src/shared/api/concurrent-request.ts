interface Pending<T>{
 promise:Promise<T>;
 controller:AbortController;
 subscribers:number;
 finished:boolean;
}
const aborted=()=>new DOMException('Požadavek přerušen','AbortError');

/** Share an in-flight read, not a persistent cache. Each subscriber owns its
 * cancellation; invalidation detaches old work without cancelling its callers.
 * Never reuse completed or abandoned reads, including after an error.
 */
export function createConcurrentRequest<T>(load:(signal:AbortSignal)=>Promise<T>){
 let pending:Pending<T>|undefined;
 const clear=(entry:Pending<T>)=>{if(pending===entry)pending=undefined;};
 function subscribe(entry:Pending<T>,signal?:AbortSignal):Promise<T>{
  entry.subscribers++;
  return new Promise<T>((resolve,reject)=>{
   let completed=false;
   const release=()=>{
    if(completed)return false;
    completed=true;
    signal?.removeEventListener('abort',onAbort);
    entry.subscribers--;
    if(entry.subscribers===0&&!entry.finished){entry.controller.abort();clear(entry);}
    return true;
   };
   const onAbort=()=>{if(release())reject(aborted());};
   if(signal?.aborted){onAbort();return;}
   signal?.addEventListener('abort',onAbort,{once:true});
   entry.promise.then(value=>{if(release())resolve(value);},error=>{if(release())reject(error);});
  });
 }
 function get(signal?:AbortSignal):Promise<T>{
  if(signal?.aborted)return Promise.reject(aborted());
  if(!pending||pending.finished){
   const controller=new AbortController();
   const promise=(async()=>load(controller.signal))();
   const entry:Pending<T>={controller,subscribers:0,finished:false,promise:promise.finally(()=>{
    entry.finished=true;clear(entry);
   })};
   void entry.promise.catch(()=>undefined);
   pending=entry;
  }
  return subscribe(pending,signal);
 }
 return {get,invalidate:()=>{pending=undefined;}};
}
