// Lossless mobile snapshots preserve every original image and report field.
// Kept as a separate helper so legacy reduced-photo baselines can still be merged safely.
export async function compactMobileRecords(records:Record<string,string>,signal:AbortSignal,progress:(done:number,total:number)=>void){
 if(signal.aborted)throw Error('CANCELLED');
 progress(1,1);
 return {...records};
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
