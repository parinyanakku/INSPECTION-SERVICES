// Retry safe read requests only; caller must never wrap mutations.
export function isRetryableDriveStatus(status){return [429,500,502,503,504].includes(status);}
export async function retryDriveRead(request,wait,signal,maxAttempts=4){
 for(let attempt=0;;attempt++){
  if(signal?.aborted)throw Error('CANCELLED');
  let response;
  try{response=await request();}
  catch(e){
   if(signal?.aborted)throw Error('CANCELLED');
   if(!(e instanceof TypeError)||attempt+1>=maxAttempts)throw e;
   await wait(1000*2**attempt);continue;
  }
  if(!isRetryableDriveStatus(response.status)||attempt+1>=maxAttempts)return response;
  try{await response.body?.cancel();}catch{}
  await wait(1000*2**attempt);
 }
}
