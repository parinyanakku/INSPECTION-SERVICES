export type DriveOAuthResult={access_token?:string;error?:string;scope?:string;expires_in?:number|string};
type Bridge={postMessage:(s:string)=>void;addEventListener:(name:string,fn:(e:{data:unknown})=>void)=>void;removeEventListener:(name:string,fn:(e:{data:unknown})=>void)=>void};
function bridge():Bridge|undefined{return (window as unknown as {chrome?:{webview?:Bridge}}).chrome?.webview;}
export function hasNativeDriveBridge(){const b=bridge();return !!b&&typeof b.postMessage==='function'&&typeof b.addEventListener==='function';}
export type DesktopConfig={client_id:string;client_secret:string};
export function parseDesktopConfig(value:unknown):DesktopConfig{
 const c=value as Partial<DesktopConfig>|null;
 if(!c||typeof c.client_id!=='string'||c.client_id.length>256||!/^386487455938-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(c.client_id)||c.client_id==='386487455938-nda2mj55c5f3cdr8pvqmq4pu4o775fv2.apps.googleusercontent.com'||typeof c.client_secret!=='string'||c.client_secret.length>256||!/^[A-Za-z0-9_-]+$/.test(c.client_secret))throw Error('CONFIG_INVALID');
 return {client_id:c.client_id,client_secret:c.client_secret};
}
export async function fetchDesktopConfig(api:string,publicKey:string,token:string,signal:AbortSignal):Promise<DesktopConfig>{
 if(signal.aborted)throw Error('CANCELLED');
 const request=new AbortController();
 const cancel=()=>request.abort();
 signal.addEventListener('abort',cancel,{once:true});
 const timeout=setTimeout(()=>request.abort(),15000);
 try{
  if(signal.aborted)cancel();
  const r=await fetch(api+'/rest/v1/rpc/inspection_google_desktop_config',{method:'POST',headers:{apikey:publicKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:request.signal});
  if(!r.ok)throw Error('CONFIG_UNAVAILABLE');
  const data=await r.json();
  if(signal.aborted)throw Error('CANCELLED');
  if(request.signal.aborted)throw Error('CONFIG_UNAVAILABLE');
  if(data===null)throw Error('CONFIG_REQUIRED');
  return parseDesktopConfig(data);
 }catch(e){
  if(signal.aborted)throw Error('CANCELLED');
  if(request.signal.aborted)throw Error('CONFIG_UNAVAILABLE');
  if(e instanceof Error&&(e.message==='CONFIG_REQUIRED'||e.message==='CONFIG_INVALID'))throw e;
  throw Error('CONFIG_UNAVAILABLE');
 }finally{
  clearTimeout(timeout);
  signal.removeEventListener('abort',cancel);
 }
}
export async function authorizeNativeDrive(signal:AbortSignal,config:DesktopConfig):Promise<DriveOAuthResult>{
 const encoded=btoa(JSON.stringify(parseDesktopConfig(config))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const b=bridge();if(!b||!hasNativeDriveBridge())throw Error('NATIVE_REQUIRED');
 if(signal.aborted)throw Error('CANCELLED');
 const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
 return new Promise((resolve,reject)=>{
  let timer:ReturnType<typeof setTimeout>,started=false;
  const clear=()=>{clearTimeout(timer);b.removeEventListener('message',listen);signal.removeEventListener('abort',abort);};
  const stop=()=>{if(started)try{b.postMessage('proelite-drive-cancel:'+id);}catch{}};
  const abort=()=>{clear();stop();reject(Error('CANCELLED'));};
  const listen=(e:{data:unknown})=>{
   if(typeof e.data!=='string')return;
   if(e.data==='proelite-drive-pong-v2:'+id&&!started){clearTimeout(timer);started=true;timer=setTimeout(()=>{clear();stop();reject(Error('NATIVE_TIMEOUT'));},195000);try{b.postMessage('proelite-drive-start-v2:'+id+':'+encoded);}catch{clear();reject(Error('FAILED'));}return;}
   const ok='proelite-drive-result:'+id+':',bad='proelite-drive-error:'+id+':';
   if(!started)return;
   if(e.data.startsWith(ok)){clear();try{resolve(JSON.parse(e.data.slice(ok.length)));}catch{reject(Error('FAILED'));}}
   else if(e.data.startsWith(bad)){clear();reject(Error(e.data.slice(bad.length)));}
  };
  timer=setTimeout(()=>{clear();reject(Error('NATIVE_UPDATE_REQUIRED'));},2500);
  b.addEventListener('message',listen);signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted){abort();return;}
  try{b.postMessage('proelite-drive-ping-v2:'+id);}catch(e){clear();reject(e);}
 });
}
