// Delete a customer only after current admin authorization and exact account confirmation.
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
 let prepared=false;
 try{
   const user=await fetch(url+'/auth/v1/user',{headers:caller,signal:AbortSignal.timeout(8000)});
   if(!user.ok)return reply(401,{error:'Authentication required'});
   const identity=await user.json();
   if(!identity.id)return reply(401,{error:'Authentication required'});
   const check=await fetch(url+'/rest/v1/rpc/inspection_is_admin',{method:'POST',headers:caller,body:'{}',signal:AbortSignal.timeout(8000)});
   if(!check.ok||await check.json()!==true)return reply(403,{error:'Administrator access required'});
   const raw=await req.text();if(raw.length>4096)return reply(400,{error:'Request too large'});
   let data;try{data=JSON.parse(raw);}catch{return reply(400,{error:'Invalid request'});}
   const target=typeof data?.user_id==='string'?data.user_id:'';
   const email=typeof data?.confirm_email==='string'?data.confirm_email.trim():'';
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)||!email||email.length>254)return reply(400,{error:'Invalid account confirmation'});
   if(target.toLowerCase()===identity.id.toLowerCase())return reply(403,{error:'Cannot delete administrator'});
   const pre=await fetch(url+'/rest/v1/rpc/inspection_admin_prepare_delete',{method:'POST',headers:caller,body:JSON.stringify({p_user_id:target,p_confirm_email:email}),signal:AbortSignal.timeout(8000)});
   if(!pre.ok||await pre.json()!==true)return reply(pre.status===403?403:409,{error:'Account confirmation or permission check failed'});
   prepared=true;
   // The service key is used only for the Auth Admin deletion after the database revokes access.
   const result=await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(target),{method:'DELETE',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({should_soft_delete:false}),signal:AbortSignal.timeout(12000)});
   if(!result.ok)return reply(502,{error:'Access revoked; deletion not confirmed. Refresh the account list before retrying.',access_revoked:true});
   return reply(200,{deleted:true,user_id:target});
 }catch{return reply(502,{error:'Deletion not confirmed. Refresh the account list before retrying.',access_revoked:prepared});}
});