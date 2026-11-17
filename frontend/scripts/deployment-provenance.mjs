/** Deployment provenance gate for CI's public DEV visual smoke.
 * Only the exact expected commit or its GitHub-verified descendant is accepted.
 * Never treats an unrelated / older deployment as equivalent. No write actions.
 */
const SHA=/^[0-9a-f]{40}$/;
const REPOSITORY='Boym323/Loucka_weather';

export async function deploymentRelation(expected,published,{fetchImpl=fetch}={}){
 if(typeof published!=='string'||!SHA.test(published))return 'invalid';
 if(!expected)return 'unconstrained'; // manual/scheduled smoke
 if(typeof expected!=='string'||!SHA.test(expected))return 'invalid';
 if(expected===published)return 'exact';
 try{
  const url='https://api.github.com/repos/'+REPOSITORY+'/compare/'+expected+'...'+published;
  const response=await fetchImpl(url,{
   headers:{Accept:'application/vnd.github+json'},
   signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)return 'mismatch';
  const info=await response.json();
  return info?.status==='ahead'&&Number.isInteger(info.ahead_by)&&info.ahead_by>0
   ?'superseding':'mismatch';
 }catch{return 'mismatch';}
}
