type Bridge={postMessage:(s:string)=>void;addEventListener:(name:string,fn:(e:{data:unknown})=>void)=>void;removeEventListener:(name:string,fn:(e:{data:unknown})=>void)=>void};
function bridge():Bridge|undefined{return (window as unknown as {chrome?:{webview?:Bridge}}).chrome?.webview;}
export function hasWindowsProofBridge(){const b=bridge();return !!b&&typeof b.postMessage==='function'&&typeof b.addEventListener==='function';}
export async function verifyWindowsDevice(api:string,publicKey:string,token:string):Promise<string>{
 const b=bridge();if(!b||!hasWindowsProofBridge())throw Error('NATIVE_REQUIRED');
 const rpc=async(body:object)=>{
  const r=await fetch(api+'/functions/v1/proelite-device-proof',{method:'POST',headers:{apikey:publicKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('PROOF_FAILED');return await r.json();
 };
 const {nonce}=await rpc({action:'challenge'});
 if(typeof nonce!=='string'||!/^[a-f0-9]{64}$/.test(nonce))throw Error('CHALLENGE');
 const proof=await new Promise<{publicKey:string;signature:string}>((resolve,reject)=>{
  const clear=()=>{clearTimeout(timer);b.removeEventListener('message',listen);};
  const listen=(e:{data:unknown})=>{
   if(typeof e.data!=='string')return;
   if(e.data==='proelite-device-error'){clear();reject(Error('NATIVE_ERROR'));return;}
   const parts=e.data.split(':');if(parts.length!==4||parts[0]!=='proelite-device-result'||parts[1]!==nonce)return;
   clear();resolve({publicKey:parts[2],signature:parts[3]});
  };
  const timer=setTimeout(()=>{clear();reject(Error('NATIVE_TIMEOUT'));},15000);
  b.addEventListener('message',listen);
  try{b.postMessage('proelite-device-v1:'+nonce);}catch(e){clear();reject(e);}
 });
 const result=await rpc({action:'verify',nonce,...proof});
 if(typeof result.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(result.fingerprint))throw Error('PROOF_FAILED');
 return result.fingerprint;
}
