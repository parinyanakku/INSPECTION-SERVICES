import type {ReportBookData} from '../types/inspection';
export const fields=['coverTitle','propertyCondition','locationText','clientName','inspectionDate','introContent','inspectionSteps','table2Rows','closingSummary'] as const;
export type ImportField=typeof fields[number];
export type ImportValue=string|string[]|{item:string;finding:string}[];
export type Proposal={field:ImportField;value:ImportValue;evidence:string;mode:'append'|'replace'};
const appendable=new Set<ImportField>(['introContent','inspectionSteps','table2Rows','closingSummary']);
export const canAppend=(field:ImportField)=>appendable.has(field);
function clean(v:unknown,max:number){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('INVALID_PROPOSAL');return v.trim();}
export function parseReportProposals(raw:string):Proposal[]{
 const obj=JSON.parse(raw.replace(/^\s*\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60\s*$/,''));
 if(!obj||!Array.isArray(obj.changes)||obj.changes.length>fields.length)throw Error('INVALID_PROPOSAL');
 const seen=new Set();
 return obj.changes.map((c:any)=>{
  if(!c||!fields.includes(c.field)||seen.has(c.field))throw Error('INVALID_PROPOSAL');seen.add(c.field);
  const field=c.field as ImportField;
  let value:ImportValue;
  if(field==='inspectionSteps'){if(!Array.isArray(c.value)||!c.value.length||c.value.length>50)throw Error('INVALID_PROPOSAL');value=c.value.map((x:unknown)=>clean(x,2000));}
  else if(field==='table2Rows'){if(!Array.isArray(c.value)||!c.value.length||c.value.length>100)throw Error('INVALID_PROPOSAL');value=c.value.map((x:any)=>({item:clean(x?.item,2000),finding:clean(x?.finding,4000)}));}
  else value=clean(c.value,field==='introContent'||field==='closingSummary'?20000:2000);
  return {field,value,evidence:typeof c.evidence==='string'?c.evidence.slice(0,500):'',mode:canAppend(field)&&c.mode!=='replace'?'append':'replace'};
 });
}
export function reportText(book:ReportBookData){return Object.fromEntries(fields.map(f=>[f,f==='table2Rows'?book.table2Rows.map(({item,finding})=>({item,finding})):book[f]]));}
export function valueText(v:unknown):string{if(Array.isArray(v))return v.map(x=>typeof x==='string'?x:String(x.item)+' — '+String(x.finding)).join('\n');return String(v??'');}
export function applyReportProposals(book:ReportBookData,baseline:Record<string,unknown>,proposals:Proposal[]):ReportBookData{
 const next={...book};
 const current=reportText(book);
 for(const p of proposals){
  if(JSON.stringify(current[p.field])!==JSON.stringify(baseline[p.field]))throw Error('REPORT_CHANGED');
  const append=p.mode==='append'&&canAppend(p.field);
  if(p.field==='inspectionSteps'){const values=p.value as string[];next.inspectionSteps=append?[...book.inspectionSteps,...values]:values.slice();}
  else if(p.field==='table2Rows'){const values=(p.value as {item:string;finding:string}[]).map(r=>({...r,id:crypto.randomUUID()}));next.table2Rows=append?[...book.table2Rows,...values]:values;}
  else {const value=p.value as string;next[p.field]=append&&book[p.field]?book[p.field]+'\n\n'+value:value;}
 }
 return next;
}
