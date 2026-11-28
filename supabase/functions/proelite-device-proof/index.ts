// Admin-only proof-of-possession pilot; not platform attestation.
const origin='https://teaminspectionproelite.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
function reply(status:number,data:unknown){return new Response(JSON.stringify(data),{status,headers});}
function hex(b:Uint8Array){return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
function decode(s:unknown){if(typeof s!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(s))throw Error('encoding');const b=Uint8Array.from(atob(s),x=>x.charCodeAt(0));if(b.length!==64)throw Error('size');return b;}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'METHOD'});
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply(403,{error:'ORIGIN'});
 const api=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const auth=req.headers.get('Authorization')||'';
 if(!api||!anon||!service)return reply(503,{error:'CONFIG'});
 if(!/^Bearer [A-Za-z0-9_.-]{1,16000}$/.test(auth))return reply(401,{error:'AUTH'});
 try{
  const caller={apikey:anon,Authorization:auth,'Content-Type':'application/json'};
  const user=await fetch(api+'/auth/v1/user',{headers:caller,signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!user.ok)return reply(401,{error:'AUTH'});
  const uid=(await user.json()).id;if(typeof uid!=='string'||!/^[a-f0-9-]{36}$/.test(uid))return reply(401,{error:'AUTH'});
  const admin=await fetch(api+'/rest/v1/rpc/inspection_is_admin',{method:'POST',headers:caller,body:'{}',signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!admin.ok||await admin.json()!==true)return reply(403,{error:'ADMIN'});
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'BODY'});
  let raw='',n=0;const dec=new TextDecoder();
  try{for(;;){const p=await reader.read();if(p.done)break;n+=p.value.length;if(n>2048){await reader.cancel();return reply(413,{error:'SIZE'});}raw+=dec.decode(p.value,{stream:true});}raw+=dec.decode();}finally{reader.releaseLock();}
  let b;try{b=JSON.parse(raw);}catch{return reply(400,{error:'BODY'});}
  const rpc=async(name:string,body:object)=>{
   const r=await fetch(api+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!r.ok)throw Error('database');return await r.json()===true;
  };
  if(b?.action==='challenge'){
   const nonce=hex(crypto.getRandomValues(new Uint8Array(32)));
   if(!await rpc('inspection_native_challenge',{p_uid:uid,p_nonce:nonce}))return reply(429,{error:'RETRY'});
   return reply(200,{nonce});
  }
  if(b?.action!=='verify'||typeof b.nonce!=='string'||!/^[a-f0-9]{64}$/.test(b.nonce))return reply(400,{error:'BODY'});
  let xy:Uint8Array,sig:Uint8Array;
  try{xy=decode(b.publicKey);sig=decode(b.signature);}catch{return reply(400,{error:'KEY'});}
  const point=new Uint8Array(65);point[0]=4;point.set(xy,1);
  let valid=false;
  try{
   const key=await crypto.subtle.importKey('raw',point,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
   valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,sig,new TextEncoder().encode('proelite-device-v1:'+b.nonce));
  }catch{}
  if(!valid)return reply(403,{error:'PROOF'});
  const fingerprint=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',point)));
  if(!await rpc('inspection_native_record_proof',{p_uid:uid,p_nonce:b.nonce,p_fingerprint:fingerprint}))return reply(409,{error:'EXPIRED_OR_USED'});
  return reply(200,{fingerprint});
 }catch{return reply(503,{error:'UNAVAILABLE'});}
});
