// Server-only account creation. Never ship service-role key to the browser.
const origin='https://teaminspectionproelite.github.io';
Deno.serve(async(req:Request)=>{
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply(403,{error:'Origin not allowed'});
 const auth=req.headers.get('authorization')||'';
 if(!/^Bearer [^\s]+$/i.test(auth))return reply(401,{error:'Authentication required'});
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service)return reply(503,{error:'Server configuration unavailable'});
 const caller={apikey:anon,Authorization:auth,'Content-Type':'application/json'};
 try{
   const user=await fetch(url+'/auth/v1/user',{headers:caller,signal:AbortSignal.timeout(8000)});
   if(!user.ok)return reply(401,{error:'Authentication required'});
   const identity=await user.json();
   if(!identity.id)return reply(401,{error:'Authentication required'});
   const check=await fetch(url+'/rest/v1/rpc/inspection_is_admin',{method:'POST',headers:caller,body:'{}',signal:AbortSignal.timeout(8000)});
   if(!check.ok||await check.json()!==true)return reply(403,{error:'Administrator access required'});
   const raw=await req.text();if(raw.length>4096)return reply(400,{error:'Request too large'});
   let data;try{data=JSON.parse(raw);}catch{return reply(400,{error:'Invalid request'});}
   const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
   const name=typeof data.display_name==='string'?data.display_name.trim():'';
   const password=typeof data.password==='string'?data.password:'';
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>150||password.length<12||password.length>128||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return reply(400,{error:'Invalid name, email or password (12+ characters including letters and numbers)'});
   const result=await fetch(url+'/auth/v1/admin/users',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{display_name:name}}),signal:AbortSignal.timeout(10000)});
   if(!result.ok){
     const e=await result.json().catch(()=>({}));
     if(result.status===422||result.status===409||e.code==='email_exists')return reply(409,{error:'Email already exists or account details are invalid'});
     return reply(502,{error:'Could not create account; refresh the account list before retrying'});
   }
   const created=await result.json();const uid=created.id||created.user?.id;
   if(!uid)return reply(502,{error:'Refresh account list to verify creation'});
   // Start inactive; the normal license RPC independently rechecks administrator access.
   let initialized=false;
   try{const r=await fetch(url+'/rest/v1/rpc/inspection_admin_set_license',{method:'POST',headers:caller,body:JSON.stringify({p_user_id:uid,p_display_name:name,p_plan:'trial',p_active:false,p_expires_at:new Date().toISOString()}),signal:AbortSignal.timeout(8000)});initialized=r.ok;}catch{}
   return reply(201,{user_id:uid,email,license_initialized:initialized});
 }catch{return reply(502,{error:'Request failed; refresh the account list before retrying'});}
});