// Read the canonical visible full backup in small UTF-8 chunks. Avoid constructing
// a second complete JSON object plus a second complete serialized copy of its photos.
// The caller checks the original content hash before committing any local records.
type Records=Record<string,string>;
export function originalBackupBlob(records:Records,userId:string,exportedAt:string,contentHash:string){
 const metadata={format:'TIS_HOME_INSPECTION_BACKUP_V10',exportedAt,userId,contentHash};
 // Records already contain JSON. Preserve their exact bytes for verification
 // and avoid parsing and serializing all embedded photos again for upload.
 const parts:BlobPart[]=[JSON.stringify(metadata).slice(0,-1)];
 if(records.tis_wl_brand_v10)parts.push(',"brand":',records.tis_wl_brand_v10);
 parts.push(',"projects":',records.tis_wl_projects_v10,',"reportBooks":{');
 const prefix='tis_report_book_v1_';
 let separator='';
 for(const [key,value] of Object.entries(records)){
  if(!key.startsWith(prefix))continue;
  parts.push(separator,JSON.stringify(key.slice(prefix.length)),':',value);
  separator=',';
 }
 parts.push('}}');
 return new Blob(parts,{type:'application/json'});
}

export async function streamOriginal(response:Response,signal?:AbortSignal,progress?:(received:number,total:number)=>void){
 if(!response.body)throw Error('Streaming download not supported; update Safari');
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 const total=Number(response.headers.get('Content-Length'))||0;
 let received=0,buffer='',at=0,done=false,lastUpdate=0;
 async function more(){
  if(at<buffer.length)return true;
  while(!done){
   if(signal?.aborted)throw Error('CANCELLED');
   const chunk=await reader.read();
   if(chunk.done){done=true;buffer=decoder.decode();at=0;progress?.(received,total||received);return buffer.length>0;}
   received+=chunk.value.byteLength;buffer=decoder.decode(chunk.value,{stream:true});at=0;
   if(performance.now()-lastUpdate>=200){lastUpdate=performance.now();progress?.(received,total);}
   if(buffer.length)return true;
  }
  return false;
 }
 async function skip(){
  while(await more()){while(at<buffer.length&&/\s/.test(buffer[at]))at++;if(at<buffer.length)return true;}return false;
 }
 async function take(c:string){if(!await skip()||buffer[at++]!==c)throw Error('Invalid original JSON structure');}
 async function raw(){
  if(!await skip())throw Error('Incomplete original JSON');
  const first=buffer[at],parts:string[]=[];
  let inString=false,escaped=false,depth=0,started=false;
  const compound=first==='{'||first==='[',quoted=first==='"';
  while(await more()){
   const start=at;
   while(at<buffer.length){
    const c=buffer[at];
    if(!inString&&started&&!compound&&!quoted&&(c===','||c==='}'||c===']'||/\s/.test(c))){if(at>start)parts.push(buffer.slice(start,at));return parts.join('');}
    at++;started=true;
    if(inString){
     if(escaped){escaped=false;continue;}
     if(c==='\\'){escaped=true;continue;}
     if(c==='"'){inString=false;if(quoted){parts.push(buffer.slice(start,at));return parts.join('');}}
    }else if(c==='"'){inString=true;}
    else if(c==='{'||c==='['){depth++;}
    else if(c==='}'||c===']'){depth--;if(compound&&depth===0){parts.push(buffer.slice(start,at));return parts.join('');}}
   }
   if(at>start)parts.push(buffer.slice(start,at));
  }
  if(started&&!inString&&!compound&&!quoted)return parts.join('');
  throw Error('Incomplete original JSON value');
 }
 async function object(each:(key:string)=>Promise<void>){
  await take('{');
  if(!await skip())throw Error('Incomplete object');
  if(buffer[at]==='}'){at++;return;}
  const seen=new Set<string>();
  for(;;){
   const key=JSON.parse(await raw());
   if(typeof key!=='string'||seen.has(key))throw Error('Invalid or duplicate JSON key');
   seen.add(key);await take(':');await each(key);
   if(!await skip())throw Error('Incomplete object');
   const c=buffer[at++];if(c==='}')return;if(c!==',')throw Error('Invalid JSON separator');
  }
 }
 const records:Records=Object.create(null);
 let format='',userId='',contentHash='',hasReports=false;
 try{
  await object(async key=>{
   if(key==='reportBooks'){
    hasReports=true;
    await object(async id=>{const value=await raw();if(!value.startsWith('{'))throw Error('Invalid report');records['tis_report_book_v1_'+id]=value;});
    return;
   }
   const value=await raw();
   if(key==='projects'){if(!value.startsWith('['))throw Error('Invalid projects');records.tis_wl_projects_v10=value;}
   else if(key==='brand'){if(value!=='null'){if(!value.startsWith('{'))throw Error('Invalid brand');records.tis_wl_brand_v10=value;}}
   else if(key==='format')format=JSON.parse(value);
   else if(key==='userId')userId=JSON.parse(value);
   else if(key==='contentHash')contentHash=JSON.parse(value);
  });
  if(await skip())throw Error('Unexpected trailing JSON data');
  if(format!=='TIS_HOME_INSPECTION_BACKUP_V10'||typeof userId!=='string'||!records.tis_wl_projects_v10||!hasReports||typeof contentHash!=='string')throw Error('Invalid original JSON format');
  return {userId,contentHash,records};
 }finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}
