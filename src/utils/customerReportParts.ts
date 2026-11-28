// Encrypted report parts, never image transformation. A single short-link key
// authenticates the manifest and every numbered part with AES-GCM.
export const PART_SIZE=4*1024*1024;
export const MAX_REPORT_BYTES=512*1024*1024;
export const SINGLE_LIMIT=45*1024*1024;
export const MAX_PARTS=MAX_REPORT_BYTES/PART_SIZE;
export const MANIFEST_PREFIX='TIS-REPORT-PARTS-V1\n';
export function partPath(path:string,index:number){
 if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.bin$/.test(path)||!Number.isInteger(index)||index<0||index>=MAX_PARTS)throw Error('Invalid report part');
 return path.slice(0,-4)+'.part-'+String(index).padStart(3,'0')+'.bin';
}
export function partAAD(path:string,index:number){return new TextEncoder().encode('TIS-REPORT-PART-V1:'+path+':'+index);}
export async function encryptPayload(blob:Blob,aes:CryptoKey,aad?:Uint8Array){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,...(aad?{additionalData:aad as BufferSource}:{})},aes,await blob.arrayBuffer());
 return new Blob([iv,encrypted],{type:'application/octet-stream'});
}
export async function publishReportParts(blob:Blob,path:string,aes:CryptoKey,upload:(path:string,payload:Blob)=>Promise<void>,progress:(sent:number,total:number)=>void){
 if(!blob.size||blob.size>MAX_REPORT_BYTES)throw Error('รายงานเกิน 512 MiB หรือหน่วยความจำไม่เพียงพอ กรุณาแบ่งโครงการโดยไม่ลดคุณภาพรูป');
 if(blob.size+28<=SINGLE_LIMIT){await upload(path,await encryptPayload(blob,aes));progress(blob.size,blob.size);return 0;}
 const count=Math.ceil(blob.size/PART_SIZE);
 for(let i=0;i<count;i++){
  const end=Math.min((i+1)*PART_SIZE,blob.size);
  await upload(partPath(path,i),await encryptPayload(blob.slice(i*PART_SIZE,end),aes,partAAD(path,i)));progress(end,blob.size);
 }
 // Publish manifest last, so a partial upload cannot be opened.
 await upload(path,await encryptPayload(new Blob([MANIFEST_PREFIX+JSON.stringify({v:1,count,bytes:blob.size,partSize:PART_SIZE})]),aes));
 return count;
}
