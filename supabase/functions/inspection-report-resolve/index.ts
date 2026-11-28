const cors={'Access-Control-Allow-Origin':'https://teaminspectionproelite.github.io','Access-Control-Allow-Headers':'content-type,apikey,authorization','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json','Referrer-Policy':'no-referrer'};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
 try{
  const input=await req.text();if(input.length>200)return reply(400,{error:'Invalid request'});
  const {hash,part}=JSON.parse(input);
  if(part!==undefined&&(!Number.isInteger(part)||part<0||part>=128))return reply(400,{error:'Invalid part'});
  if(typeof hash!=='string'||! /^[a-f0-9]{64}$/.test(hash))return reply(400,{error:'Invalid code'});
  const api=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const q=new URLSearchParams({select:'object_path,expires_at',token_hash:'eq.'+hash,limit:'1'});
  const res=await fetch(api+'/rest/v1/inspection_report_short_links?'+q,{headers,signal:AbortSignal.timeout(10000)});
  if(!res.ok)return reply(503,{error:'Unavailable'});
  const row=(await res.json())[0],remaining=row?Math.floor((Date.parse(row.expires_at)-Date.now())/1000):0;
  if(!row||remaining<1||! /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.bin$/.test(row.object_path))return reply(404,{error:'Link unavailable'});
  const objectPath=part===undefined?row.object_path:row.object_path.slice(0,-4)+'.part-'+String(part).padStart(3,'0')+'.bin';
  const r=await fetch(api+'/storage/v1/object/sign/inspection-client-reports/'+objectPath,{method:'POST',headers,body:JSON.stringify({expiresIn:Math.min(60,remaining)}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)return reply(404,{error:'Link unavailable'});
  const data=await r.json(),raw=data.signedURL||data.signedUrl;
  if(typeof raw!=='string')return reply(503,{error:'Unavailable'});
  const url=new URL(raw.startsWith('/object/')?'/storage/v1'+raw:raw,api);
  if(url.origin!==new URL(api).origin||url.pathname!=='/storage/v1/object/sign/inspection-client-reports/'+objectPath)return reply(503,{error:'Unavailable'});
  return reply(200,{url:url.href});
 }catch{return reply(400,{error:'Link unavailable'});}
});