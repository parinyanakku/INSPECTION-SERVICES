// Read-only recovery: retry one failed stage, never a restore or upload.
export function isTransientReadError(error){
 const message=error instanceof Error?error.message:String(error);
 return error instanceof TypeError||/Google Drive HTTP (429|500|502|503|504)\b|Incomplete Drive download range|Incomplete original JSON|network connection was lost|load failed|networkerror|failed to fetch/i.test(message);
}
export async function retryReadStage(read,{signal,wait,onRetry,allowMissing=false}){
 for(let attempt=0;;attempt++){
  if(signal?.aborted)throw Error('CANCELLED');
  try{
   const result=await read();
   if(signal?.aborted)throw Error('CANCELLED');
   if(result!=null||!allowMissing||attempt>=1)return result;
  }catch(error){
   if(signal?.aborted)throw Error('CANCELLED');
   if(attempt>=1||!isTransientReadError(error))throw error;
  }
  onRetry?.();await wait(800);
 }
}
