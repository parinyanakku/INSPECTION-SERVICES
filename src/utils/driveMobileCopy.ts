// Make a separate mobile-readable snapshot. Never mutate the source records.
const PHOTO=/^data:image\/(jpeg|jpg|webp);base64,/i;
async function shrinkPhoto(url:string,signal:AbortSignal){
 if(!PHOTO.test(url)||url.length<170000)return url;
 if(signal.aborted)throw Error('CANCELLED');
 const image=new Image();image.src=url;
 try{await image.decode();}catch{return url;}
 if(signal.aborted)throw Error('CANCELLED');
 const scale=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 try{const ctx=canvas.getContext('2d');if(!ctx)return url;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const out=canvas.toDataURL('image/jpeg',.76);return out.length<url.length&&out.startsWith('data:image/jpeg;')?out:url;}finally{canvas.width=1;canvas.height=1;image.src='';}
}
export async function compactMobileRecords(records:Record<string,string>,signal:AbortSignal,progress:(done:number,total:number)=>void){
 const result={...records};const key='tis_wl_projects_v10';const projects=JSON.parse(records[key]||'[]') as {defects:{beforeImg?:string|null;afterImg?:string|null;photoDataUrl?:string|null}[]}[];
 const total=projects.reduce((n,p)=>n+p.defects.length,0);let done=0;
 for(const p of projects)for(const d of p.defects){
  if(signal.aborted)throw Error('CANCELLED');
  for(const field of ['beforeImg','afterImg','photoDataUrl'] as const){const src=d[field];if(typeof src==='string')d[field]=await shrinkPhoto(src,signal);}
  progress(++done,total);if(done%4===0)await new Promise<void>(r=>setTimeout(r,0));
 }
 result[key]=JSON.stringify(projects);return result;
}

// Transfer only the changes relative to the exact mobile base, preserving full-resolution
// originals when the corresponding compact field was not edited. IDs survive reordering.
function isObject(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function keyed(v:unknown[]):boolean{return v.every(x=>isObject(x)&&typeof x.id==='string')&&new Set(v.map(x=>(x as {id:string}).id)).size===v.length;}
function applyMobile(base:unknown,edited:unknown,original:unknown):unknown{
 if(base===edited)return original;
 if(Array.isArray(base)&&Array.isArray(edited)&&Array.isArray(original)){
  if(keyed(base)&&keyed(edited)&&keyed(original)){
   const b=new Map(base.map(x=>[x.id,x])),o=new Map(original.map(x=>[x.id,x]));
   return edited.map(x=>b.has(x.id)&&o.has(x.id)?applyMobile(b.get(x.id),x,o.get(x.id)):x);
  }
  if(base.length===edited.length&&base.length===original.length)return edited.map((x,i)=>applyMobile(base[i],x,original[i]));
  return edited;
 }
 if(isObject(base)&&isObject(edited)&&isObject(original)){
  const out:Record<string,unknown>=Object.create(null);
  for(const k of Object.keys(edited))out[k]=Object.prototype.hasOwnProperty.call(base,k)&&Object.prototype.hasOwnProperty.call(original,k)?applyMobile(base[k],edited[k],original[k]):edited[k];
  return out;
 }
 return edited;
}
export function applyMobileRecords(base:Record<string,string>,edited:Record<string,string>,original:Record<string,string>){
 const result:Record<string,string>={};
 for(const k of Object.keys(edited)){
  if(base[k]===edited[k]&&original[k]!==undefined){result[k]=original[k];continue;}
  result[k]=base[k]!==undefined&&original[k]!==undefined?JSON.stringify(applyMobile(JSON.parse(base[k]),JSON.parse(edited[k]),JSON.parse(original[k]))):edited[k];
 }
 return result;
}
