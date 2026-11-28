import type {AppLanguage,BrandConfig,ProjectFile,ReportBookData} from '../types/inspection';
export const sources=['projectName','houseNo','owner','address','inspectionDate','inspectionRound','projectStatus','companyName','inspectorName','licenseNo','contactInfo','coverTitle','propertyCondition','introContent','inspectionSteps','closingSummary','defectCount','urgentCount','fixedCount','defectList','summaryTable','coverImage','frontHouseImage','locationMap','logo'] as const;
export type Source=typeof sources[number];
export type Field={key:string;label:string;type:'text'|'number'|'date'|'image';source:Source|''};
export type SectionKind='cover'|'intro'|'plans'|'defects'|'summary'|'custom';
export type Section={id:string;kind:SectionKind;title:string;body:string};
export type TemplatePlan={fields:Field[];sections:Section[]};
export type Values=Record<string,string>;
export const kinds:SectionKind[]=['cover','intro','plans','defects','summary','custom'];
export const imageSources:Source[]=['coverImage','frontHouseImage','locationMap','logo'];
const validKey=(key:string)=>typeof key==='string'&&/^[\p{L}\p{M}\p{N}_ .:/-]{1,120}$/u.test(key)&&!['__proto__','constructor','prototype'].includes(key);
export const keysInText=(s:string)=>[...new Set(Array.from(s.matchAll(/\{\{([^{}\r\n]{1,120})\}\}/gu),m=>m[1].trim()).filter(validKey))];
export function defaultPlan(lang:AppLanguage,keys:string[]=[]):TemplatePlan{
 const en=lang==='en';
 const labels=en?['Cover','Introduction','Inspection steps and plans','Defect records','Summary']:['หน้าปก','บทนำ','ขั้นตอนตรวจและแปลน','รายการ Defect','สรุปผล'];
 const fields=Array.from(new Set(keys)).filter(validKey).slice(0,100).map(key=>({key,label:key,type:'text' as const,source:sources.includes(key as Source)?key as Source:'' as const})).map(f=>({...f,type:imageSources.includes(f.source as Source)?'image' as const:f.type}));
 const sections:Section[]=kinds.filter(k=>k!=='custom').map((kind,i)=>({id:'s'+i,kind,title:labels[i],body:''}));
 if(fields.length)sections.push({id:'extra',kind:'custom',title:en?'Additional information':'ข้อมูลเพิ่มเติม',body:fields.map(f=>f.label+': {{'+f.key+'}}').join('\n')});
 return {fields,sections};
}
export function normalizePlan(value:unknown,lang:AppLanguage,requiredKeys:string[]=[]):TemplatePlan{
 if(!value||typeof value!=='object')throw Error('INVALID_TEMPLATE_PLAN');
 const p=value as any;
 if(!Array.isArray(p.fields)||p.fields.length>100||!Array.isArray(p.sections)||p.sections.length>60||!p.sections.length)throw Error('INVALID_TEMPLATE_PLAN');
 const fields:Field[]=[],seen=new Set<string>();
 for(const f of p.fields){
  if(!f||typeof f.key!=='string'||!validKey(f.key.trim())||seen.has(f.key.trim())||typeof f.label!=='string'||!f.label.trim())throw Error('INVALID_TEMPLATE_PLAN');
  const key=f.key.trim();seen.add(key);
  const source=sources.includes(f.source)?f.source as Source:'';
  const type=imageSources.includes(source as Source)?'image':(['text','number','date','image'].includes(f.type)?f.type:'text') as Field['type'];
  fields.push({key,label:f.label.trim().slice(0,150),type,source:source&&((type==='image')===imageSources.includes(source as Source))?source:''});
 }
 for(const key of requiredKeys){if(!seen.has(key)&&validKey(key)){const f=defaultPlan(lang,[key]).fields[0];if(f){fields.push(f);seen.add(key);}}}
 const sections:Section[]=p.sections.map((s:any,i:number)=>{
  if(!s||!kinds.includes(s.kind)||typeof s.title!=='string'||!s.title.trim()||typeof s.body!=='string'||s.body.length>10000)throw Error('INVALID_TEMPLATE_PLAN');
  return {id:'s'+i,kind:s.kind,title:s.title.trim().slice(0,160),body:s.kind==='custom'?s.body:''};
 });
 for(const s of sections){for(const key of keysInText(s.body)){if(!seen.has(key)){fields.push({key,label:key,type:'text',source:''});seen.add(key);}}}
 // Standard project evidence is included unless the user explicitly removes pages.
 for(const base of defaultPlan(lang).sections){if(!sections.some(s=>s.kind===base.kind))sections.push({...base,id:'required-'+base.kind});}
 if(fields.length>100)throw Error('INVALID_TEMPLATE_PLAN');
 const referenced=new Set(sections.flatMap(s=>keysInText(s.body)));
 const remaining=fields.filter(f=>!referenced.has(f.key));
 for(let i=0;i<remaining.length;i+=8)sections.push({id:'fields-'+i,kind:'custom',title:lang==='en'?'Additional information':'ข้อมูลเพิ่มเติม',body:remaining.slice(i,i+8).map(f=>f.label+': {{'+f.key+'}}').join('\n')});
 return {fields,sections};
}
export function parsePlan(raw:string,lang:AppLanguage,requiredKeys:string[]=[]){return normalizePlan(JSON.parse(raw.replace(/^\s*\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60\s*$/,'')),lang,requiredKeys);}
export function projectValues(p:ProjectFile,b:BrandConfig,r:ReportBookData):Record<Source,string>{
 return {projectName:p.name,houseNo:p.houseNo,owner:r.clientName||p.clientName,address:r.locationText||p.address,inspectionDate:r.inspectionDate||p.inspectionDate,inspectionRound:p.inspectionRound,projectStatus:p.projectStatus,companyName:b.companyName,inspectorName:b.inspectorName,licenseNo:b.licenseNo,contactInfo:b.contactInfo,coverTitle:r.coverTitle,propertyCondition:r.propertyCondition,introContent:r.introContent,inspectionSteps:r.inspectionSteps.join('\n'),closingSummary:r.closingSummary,defectCount:String(p.defects.length),urgentCount:String(p.defects.filter(d=>d.severity==='เร่งด่วน').length),fixedCount:String(p.defects.filter(d=>d.status==='แก้ไขแล้ว').length),defectList:p.defects.map(d=>[d.number,d.zone,d.title,d.status,!d.hideCause?d.cause:'',!d.hideSolution?d.solution:''].filter(Boolean).join(' | ')).join('\n'),summaryTable:r.table2Rows.map(x=>x.item+' — '+x.finding).join('\n'),coverImage:r.coverImageMode==='none'?'':r.coverImageMode==='custom'?r.coverCustomImg||'':r.frontHouseImg||'',frontHouseImage:r.frontHouseImg||'',locationMap:r.locationMapImg||'',logo:b.customLogoDataUrl||''};
}
export function fieldValues(fields:Field[],data:Record<Source,string>,manual:Values):Values{
 return Object.fromEntries(fields.map(f=>[f.key,Object.hasOwn(manual,f.key)?manual[f.key]:f.source?data[f.source]||'':'']));
}
export function missingFields(fields:Field[],values:Values){return fields.filter(f=>!String(values[f.key]||'').trim());}
export function replaceMarkers(text:string,values:Values){return text.replace(/\{\{([^{}\r\n]{1,120})\}\}/gu,(all,key)=>Object.hasOwn(values,key.trim())?values[key.trim()]:all);}
export function safeRaster(src:string){return /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=\r\n]+$/i.test(src);}
export function sourceLabel(source:Source,lang:AppLanguage){const th=['ชื่อโครงการ','บ้านเลขที่','เจ้าของบ้าน','ที่ตั้ง','วันที่ตรวจ','รอบตรวจ','สถานะโครงการ','บริษัท','ผู้ตรวจสอบ','ใบอนุญาต','ติดต่อ','หัวข้อรายงาน','สภาพบ้าน','บทนำ','ขั้นตอนตรวจ','สรุป','จำนวน Defect','จำนวนเร่งด่วน','จำนวนแก้ไขแล้ว','รายละเอียด Defect','ตารางสรุป','รูปหน้าปก','รูปหน้าบ้าน','แผนที่','โลโก้'];return lang==='th'?th[sources.indexOf(source)]:source;}
export function moved<T>(a:T[],from:number,to:number){if(from<0||to<0||from>=a.length||to>=a.length)return a;const copy=a.slice();copy.splice(to,0,copy.splice(from,1)[0]);return copy;}

export type StudioDraft={plan:TemplatePlan;manual:Values;order:string[];removed:string[];sourceName:string; savedAt:string};
export function validateStudioDraft(value:unknown):StudioDraft|undefined{
 try{
 const d=value as StudioDraft;
 if(!d||typeof d!=='object'||!d.plan||!Array.isArray(d.plan.fields)||d.plan.fields.length>100||!Array.isArray(d.plan.sections)||!d.plan.sections.length||d.plan.sections.length>150)throw Error('INVALID_DRAFT');
 const seen=new Set<string>(),ids=new Set<string>();
 const fields=d.plan.fields.map(f=>{if(!f||!validKey(f.key)||seen.has(f.key)||typeof f.label!=='string'||f.label.length>150||!['text','number','date','image'].includes(f.type)||!(f.source===''||sources.includes(f.source))||(f.source!==''&&(f.type==='image')!==imageSources.includes(f.source)))throw Error('INVALID_DRAFT');seen.add(f.key);return {key:f.key,label:f.label,type:f.type,source:f.source};});
 const sections=d.plan.sections.map(s=>{if(!s||typeof s.id!=='string'||!s.id||s.id.length>120||ids.has(s.id)||!kinds.includes(s.kind)||typeof s.title!=='string'||s.title.length>160||typeof s.body!=='string'||s.body.length>10000)throw Error('INVALID_DRAFT');ids.add(s.id);return {id:s.id,kind:s.kind,title:s.title,body:s.kind==='custom'?s.body:''};});
 if(!d.manual||typeof d.manual!=='object'||Array.isArray(d.manual))throw Error('INVALID_DRAFT');
 const entries:[string,string][]=[];let size=0;
 for(const f of fields){if(!Object.hasOwn(d.manual,f.key))continue;const v=d.manual[f.key];if(typeof v!=='string'||(f.type==='image'?v!==''&&!safeRaster(v):v.length>20000))throw Error('INVALID_DRAFT');size+=v.length;if(size>35*1024*1024)throw Error('DRAFT_TOO_LARGE');entries.push([f.key,v]);}
 const pageIds=(v:unknown)=>Array.isArray(v)&&v.length<=2000&&v.every(x=>typeof x==='string'&&x.length<=180)?[...new Set(v as string[])]:[];
 return {plan:{fields,sections},manual:Object.fromEntries(entries),order:pageIds(d.order),removed:pageIds(d.removed),sourceName:typeof d.sourceName==='string'?d.sourceName.slice(0,255):'',savedAt:typeof d.savedAt==='string'?d.savedAt.slice(0,40):''};
 }catch{return undefined;}
}
