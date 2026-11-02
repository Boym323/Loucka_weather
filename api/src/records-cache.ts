/** A bounded in-process cache for completed local calendar days.
 * Dedupe concurrent cold refreshes; serve the last verified response only
 * within its own calendar day and within the bounded stale window.
 * No background timer, DB writes or publication approvals.
 */
export class DayScopedCache<T> {
 private cached:{key:string;at:number;value:T}|null=null;
 private readonly pending=new Map<string,Promise<T>>();
 private newestRequestedKey:string|null=null;
 constructor(private readonly ttlMs:number,private readonly maxStaleMs:number){
  if(!(ttlMs>0&&maxStaleMs>=ttlMs))throw new Error('Invalid cache lifetimes');
 }
 get(key:string,nowMs:number,load:()=>Promise<T>):Promise<T>{
  this.newestRequestedKey=key;
  const cached=this.cached;
  const age=cached?.key===key?nowMs-cached.at:Infinity;
  if(cached?.key===key&&age>=0&&age<this.ttlMs)
   return Promise.resolve(cached.value);
  let work=this.pending.get(key);
  if(!work){
   work=Promise.resolve().then(load).then(value=>{
    // A slow refresh for yesterday may never replace today's response.
    if(this.newestRequestedKey===key)this.cached={key,at:nowMs,value};
    return value;
   }).finally(()=>{
    if(this.pending.get(key)===work)this.pending.delete(key);
   });
   this.pending.set(key,work);
  }
  if(cached?.key===key&&age>=this.ttlMs&&age<=this.maxStaleMs){
   // A background error cannot become an unhandled promise rejection.
   void work.catch(()=>{});
   return Promise.resolve(cached.value);
  }
  return work;
 }
}
