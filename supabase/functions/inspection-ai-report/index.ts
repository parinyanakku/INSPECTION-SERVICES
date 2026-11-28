// Authenticated BYOK report text gateway. No key storage, logs, arbitrary endpoints or service-role key.
const origin='https://teaminspectionproelite.github.io';
const urls:Record<string,string>={openai:'https://api.openai.com/v1',claude:'https://api.anthropic.com/v1',deepseek:'https://api.deepseek.com/v1',grok:'https://api.x.ai/v1',openrouter:'https://openrouter.ai/api/v1'};
Deno.serve(async(req:Request)=>{
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply(403,{error:'ORIGIN'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'METHOD'});
 const auth=req.headers.get('authorization')||'';
 if(!/^Bearer [^\s]+$/i.test(auth))return reply(401,{error:'AUTH'});
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!anon)return reply(503,{error:'CONFIG'});
 const caller={apikey:anon,Authorization:auth,'Content-Type':'application/json'};
 try{
  const user=await fetch(url+'/auth/v1/user',{headers:caller,signal:AbortSignal.timeout(8000)});
  if(!user.ok||!(await user.json()).id)return reply(401,{error:'AUTH'});
  const license=await fetch(url+'/rest/v1/rpc/inspection_has_access',{method:'POST',headers:caller,body:'{}',signal:AbortSignal.timeout(8000)});
  if(!license.ok||await license.json()!==true)return reply(403,{error:'LICENSE'});
  // Bound streaming body before allocation; no document images or files through this endpoint.
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'BODY'});
  const decoder=new TextDecoder();let raw='',n=0;
  try{for(;;){const part=await reader.read();if(part.done)break;n+=part.value.byteLength;if(n>700000){await reader.cancel();return reply(413,{error:'SIZE'});}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}
  let b;try{b=JSON.parse(raw);}catch{return reply(400,{error:'BODY'});}
  const provider=b?.provider;if(typeof provider!=='string'||!Object.hasOwn(urls,provider))return reply(400,{error:'PROVIDER'});
  const key=b.key;if(typeof key!=='string'||!key.trim()||key.length>2048||/[\r\n]/.test(key))return reply(400,{error:'KEY'});
  const base=urls[provider],claude=provider==='claude';
  const h:Record<string,string>=claude?{'x-api-key':key,'anthropic-version':'2023-06-01','Content-Type':'application/json'}:{Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const call=(path:string,init:RequestInit={})=>fetch(base+path,{...init,headers:h,redirect:'error',signal:AbortSignal.timeout(60000)});
  const failure=(status:number)=>reply([400,401,403,404,429].includes(status)?status:502,{error:'UPSTREAM_'+status});
  if(b.action==='models'){
   if(provider==='openrouter'){const valid=await call('/key');if(!valid.ok)return failure(valid.status);}
   const r=await call('/models');if(!r.ok)return failure(r.status);const j=await r.json();
   return reply(200,{models:(Array.isArray(j.data)?j.data:[]).map((m:any)=>m.id).filter((m:unknown)=>typeof m==='string').slice(0,2000)});
  }
  if(b.action!=='generate'||typeof b.prompt!=='string'||!b.prompt.trim()||b.prompt.length>160000||typeof b.model!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(b.model)||/(^|\/)auto($|:)|^openrouter\/|embedding|realtime|moderation|image-generation|multi-agent/i.test(b.model))return reply(400,{error:'REQUEST'});
  const body=claude?{model:b.model,max_tokens:8192,messages:[{role:'user',content:b.prompt}]}:{model:b.model,messages:[{role:'user',content:b.prompt}],...(provider==='openai'?{max_completion_tokens:8192,store:false}:{max_tokens:8192}),...(provider==='openrouter'?{provider:{allow_fallbacks:false},response_format:{type:'json_object'}}:provider==='grok'?{}:{response_format:{type:'json_object'}})};
  const r=await call(claude?'/messages':'/chat/completions',{method:'POST',body:JSON.stringify(body)});
  if(!r.ok)return failure(r.status);
  const j=await r.json(),text=claude?j.content?.filter((x:any)=>x.type==='text').map((x:any)=>x.text).join(''):j.choices?.[0]?.message?.content;
  if(typeof text!=='string'||!text.trim()||text.length>100000)return reply(502,{error:'INVALID_OUTPUT'});
  return reply(200,{text,inputTokens:claude?j.usage?.input_tokens:j.usage?.prompt_tokens,outputTokens:claude?j.usage?.output_tokens:j.usage?.completion_tokens});
 }catch{return reply(502,{error:'REQUEST_FAILED'});}
});
