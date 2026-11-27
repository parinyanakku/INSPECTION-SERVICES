// Spill large downloads to origin-private temporary storage, not an array of JS chunks.
// No user backup is written or removed here. The caller verifies content before restoring.
export async function withDriveDownload<T>(response:Response,parse:(blob:Blob)=>Promise<T>,signal?:AbortSignal,progress?:(received:number,total:number)=>void):Promise<T>{
 const total=Number(response.headers.get('Content-Length'))||0;
 let root:FileSystemDirectoryHandle|undefined,dir:FileSystemDirectoryHandle|undefined,writer:FileSystemWritableFileStream|undefined;
 let name='';
 if(response.body&&navigator.storage?.getDirectory){
  try{
   root=await navigator.storage.getDirectory();
   dir=await root.getDirectoryHandle('tis-drive-download-tmp',{create:true});
   name=crypto.randomUUID()+'.download';
   const handle=await dir.getFileHandle(name,{create:true});
   if(typeof handle.createWritable==='function')writer=await handle.createWritable();
  }catch{/* Unsupported or insufficient temporary storage: use native Blob, not a JS chunk array. */}
 }
 const cleanup=async()=>{if(dir&&name)try{await dir.removeEntry(name);}catch{/* best effort */}};
 if(!writer){
  await cleanup();
  const blob=await response.blob();
  if(signal?.aborted)throw Error('CANCELLED');
  progress?.(blob.size,total||blob.size);
  return parse(blob);
 }
 const reader=response.body!.getReader();
 let received=0,lastUpdate=0,closed=false;
 try{
  for(;;){
   if(signal?.aborted)throw Error('CANCELLED');
   const chunk=await reader.read();
   if(chunk.done)break;
   await writer.write(chunk.value);
   received+=chunk.value.byteLength;
   if(performance.now()-lastUpdate>250){lastUpdate=performance.now();progress?.(received,total);}
  }
  if(signal?.aborted)throw Error('CANCELLED');
  await writer.close();closed=true;
  const handle=await dir!.getFileHandle(name);
  const file=await handle.getFile();
  if(file.size!==received||(total&&received!==total))throw Error('Incomplete Drive download');
  progress?.(received,total||received);
  return await parse(file);
 }finally{
  if(!closed){try{await reader.cancel();}catch{}try{await writer.abort();}catch{}}
  reader.releaseLock();
  await cleanup();
 }
}
