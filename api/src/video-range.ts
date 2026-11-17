/** A single RFC 7233 byte range for browser MP4 playback and seeking.
 * No multipart or arbitrary resource handling; caller validates file path.
 */
export type VideoRange={start:number;end:number};
export function parseVideoRange(raw:string|undefined,size:number):VideoRange|'invalid'|null{
 if(raw===undefined)return null;
 if(!Number.isSafeInteger(size)||size<1)return 'invalid';
 const parts=/^bytes=(\d*)-(\d*)$/.exec(raw.trim());
 if(!parts||(!parts[1]&&!parts[2]))return 'invalid';
 const [first='',last='']=[parts[1],parts[2]];
 const a=first?Number(first):null,b=last?Number(last):null;
 if(a!==null&&(!Number.isSafeInteger(a)||a<0))return 'invalid';
 if(b!==null&&(!Number.isSafeInteger(b)||b<0))return 'invalid';
 if(a===null){
  // bytes=-N requests the final N bytes; a zero-length suffix is invalid.
  if(b===null||b===0)return 'invalid';
  return {start:Math.max(0,size-b),end:size-1};
 }
 if(a>=size)return 'invalid';
 const end=b===null?size-1:Math.min(b,size-1);
 if(end<a)return 'invalid';
 return {start:a,end};
}
