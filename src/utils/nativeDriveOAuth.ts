export type DriveOAuthResult={access_token?:string;error?:string;scope?:string;expires_in?:number|string};
type Bridge={postMessage:(s:string)=>void;addEventListener:(name:string,fn:(e:{data:unknown})=>void)=>void;removeEventListener:(name:string,fn:(e:{data:unknown})=>void)=>void};
function bridge():Bridge|undefined{return (window as unknown as {chrome?:{webview?:Bridge}}).chrome?.webview;}
export function hasNativeDriveBridge(){const b=bridge();return !!b&&typeof b.postMessage==='function'&&typeof b.addEventListener==='function';}
export async function authorizeNativeDrive(signal:AbortSignal):Promise<DriveOAuthResult>{
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
   if(e.data==='proelite-drive-pong:'+id&&!started){clearTimeout(timer);started=true;timer=setTimeout(()=>{clear();stop();reject(Error('NATIVE_TIMEOUT'));},195000);try{b.postMessage('proelite-drive-start:'+id);}catch{clear();reject(Error('FAILED'));}return;}
   const ok='proelite-drive-result:'+id+':',bad='proelite-drive-error:'+id+':';
   if(!started)return;
   if(e.data.startsWith(ok)){clear();try{resolve(JSON.parse(e.data.slice(ok.length)));}catch{reject(Error('FAILED'));}}
   else if(e.data.startsWith(bad)){clear();reject(Error(e.data.slice(bad.length)));}
  };
  timer=setTimeout(()=>{clear();reject(Error('NATIVE_UPDATE_REQUIRED'));},2500);
  b.addEventListener('message',listen);signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted){abort();return;}
  try{b.postMessage('proelite-drive-ping:'+id);}catch(e){clear();reject(e);}
 });
}
