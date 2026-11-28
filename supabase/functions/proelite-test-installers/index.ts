// Private test packages only. No production approval or license changes.
const ORIGIN='https://teaminspectionproelite.github.io';
const ISS='https://token.actions.githubusercontent.com', AUD='proelite-private-test-installers-v1';
const ROOT='candidates/test/', BUCKET='proelite-installers', LIMIT=20*1024*1024;
const files={windows:'ProElite-Inspection-TEST.msi',android:'ProElite-Inspection-TEST.apk'} as const;
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-proelite-sha256','Access-Control-Expose-Headers':'x-proelite-sha256, x-proelite-build-commit','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
function json(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});}
function bytes(s:string){if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('token');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));}
function obj(s:string){return JSON.parse(new TextDecoder().decode(bytes(s)));}
function allowedClaims(c:any,now:number){
 return c.iss===ISS&&c.aud===AUD&&c.repository_id==='1472573866'&&c.repository_owner_id==='361373211'&&
 c.repository==='teaminspectionproelite/INSPECTION-SERVICES'&&c.ref==='refs/heads/main'&&
 c.workflow_ref==='teaminspectionproelite/INSPECTION-SERVICES/.github/workflows/native-packages.yml@refs/heads/main'&&
 c.runner_environment==='github-hosted'&&['push','workflow_dispatch'].includes(c.event_name)&&
 /^[a-f0-9]{40}$/.test(c.sha||'')&&c.workflow_sha===c.sha&&
 Number.isInteger(c.exp)&&c.exp>now&&c.exp<=now+600&&Number.isInteger(c.nbf)&&c.nbf<=now+30&&
 Number.isInteger(c.iat)&&c.iat<=now+30&&c.iat>=now-600;
}
async function digest(body:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body)),b=>b.toString(16).padStart(2,'0')).join('');}
async function verifyCI(token:string){
 try{
  const p=token.split('.');if(p.length!==3)return false;const h=obj(p[0]),c=obj(p[1]);
  if(h.alg!=='RS256'||typeof h.kid!=='string'||!allowedClaims(c,Math.floor(Date.now()/1000)))return false;
  const r=await fetch(ISS+'/.well-known/jwks',{redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)return false;
  const jwk=(await r.json()).keys.find((k:any)=>k.kid===h.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256'));
  if(!jwk)return false;const k=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',k,bytes(p[2]),new TextEncoder().encode(p[0]+'.'+p[1]));
 }catch{return false;}
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(!['GET','POST'].includes(req.method))return json(405,{error:'Method'});
 try{
  const api=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
  if(!api||!service||!anon)return json(503,{error:'Unavailable'});
  const token=req.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_.-]{1,16000})$/)?.[1];
  if(!token)return json(401,{error:'Unauthorized'});
  const platform=new URL(req.url).searchParams.get('platform')||'';
  const name=Object.hasOwn(files,platform)?files[platform as keyof typeof files]:undefined;
  const secret={apikey:service,Authorization:'Bearer '+service};
  const storage=api+'/storage/v1/object/';
  if(req.method==='POST'){
   if(!name||!await verifyCI(token))return json(403,{error:'Forbidden'});
   const n=Number(req.headers.get('Content-Length'));
   if(!Number.isSafeInteger(n)||n<8||n>LIMIT||req.headers.get('Content-Type')!=='application/octet-stream')return json(413,{error:'Size or type'});
   const body=new Uint8Array(await req.arrayBuffer());
   if(body.length!==n)return json(400,{error:'Size mismatch'});
   const valid=platform==='windows'?[208,207,17,224,161,177,26,225].every((x,i)=>body[i]===x):body[0]===80&&body[1]===75&&body[2]===3&&body[3]===4;
   if(!valid)return json(400,{error:'Invalid package'});
   const sha256=await digest(body);
   if(req.headers.get('x-proelite-sha256')!==sha256)return json(400,{error:'Checksum mismatch'});
   const commit=obj(token.split('.')[1]).sha;
   const res=await fetch(storage+BUCKET+'/'+ROOT+name,{method:'POST',headers:{...secret,'Content-Type':'application/octet-stream','x-upsert':'true','cache-control':'no-store'},body,redirect:'error',signal:AbortSignal.timeout(45000)});
   if(!res.ok)return json(502,{error:'Private upload failed'});
   // Store trusted CI provenance separately; a mismatched or missing manifest
   // is never treated as a verified download. A failed upload can be retried.
   const manifest=await fetch(storage+BUCKET+'/'+ROOT+name+'.manifest.json',{method:'POST',headers:{...secret,'Content-Type':'application/json','x-upsert':'true','cache-control':'no-store'},body:JSON.stringify({sha256,bytes:n,commit}),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!manifest.ok)return json(502,{error:'Private manifest upload failed'});
   return json(200,{stored:name,bytes:n,sha256,commit});
  }
  // The caller's JWT is checked by PostgREST, not decoded or trusted locally.
  const check=await fetch(api+'/rest/v1/rpc/inspection_can_download',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!check.ok||await check.json()!==true)return json(403,{error:'Admin required'});
  if(!platform){
   const r=await fetch(storage+'list/'+BUCKET,{method:'POST',headers:{...secret,'Content-Type':'application/json'},body:JSON.stringify({prefix:ROOT.slice(0,-1),limit:10}),signal:AbortSignal.timeout(10000)});
   if(!r.ok)return json(502,{error:'List unavailable'});
   const list=await r.json();return json(200,Array.isArray(list)?list.filter(f=>Object.values(files).includes(f.name)).map(f=>({name:f.name,bytes:f.metadata?.size??null,updated:f.updated_at??null})):[]);
  }
  if(!name)return json(400,{error:'Platform'});
  const r=await fetch(storage+'authenticated/'+BUCKET+'/'+ROOT+name,{headers:secret,redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!r.ok)return json(r.status===404?404:502,{error:'Package unavailable'});
  const manifest=await fetch(storage+'authenticated/'+BUCKET+'/'+ROOT+name+'.manifest.json',{headers:secret,redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!manifest.ok){await r.body?.cancel();return json(409,{error:'Verified build required'});}
  const m=await manifest.json();
  if(!/^[a-f0-9]{64}$/.test(m.sha256||'')||!/^[a-f0-9]{40}$/.test(m.commit||'')||!Number.isSafeInteger(m.bytes)||m.bytes<8||m.bytes>LIMIT){await r.body?.cancel();return json(409,{error:'Invalid build manifest'});}
  const contentLength=Number(r.headers.get('Content-Length'));
  if(contentLength&&contentLength!==m.bytes){await r.body?.cancel();return json(409,{error:'Package size mismatch'});}
  const reader=r.body?.getReader();if(!reader)return json(409,{error:'Empty package'});
  const chunks:Uint8Array[]=[];let total=0;
  try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>LIMIT||total>m.bytes){await reader.cancel();return json(409,{error:'Package size mismatch'});}chunks.push(part.value);}}finally{reader.releaseLock();}
  const body=new Uint8Array(total);let at=0;for(const chunk of chunks){body.set(chunk,at);at+=chunk.length;}
  if(total!==m.bytes||await digest(body)!==m.sha256)return json(409,{error:'Package checksum mismatch'});
  return new Response(body,{headers:{...cors,'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+name+'"','x-proelite-sha256':m.sha256,'x-proelite-build-commit':m.commit}});
 }catch{return json(503,{error:'Unavailable'});}
});
