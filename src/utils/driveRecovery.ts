// Account-scoped recovery and conservative three-way workspace merge.
type Records=Record<string,string>;
type Project={id:string;name?:string;floors:unknown[];defects:unknown[];[k:string]:unknown};
const PROJECTS='tis_wl_projects_v10',BRAND='tis_wl_brand_v10',REPORT='tis_report_book_v1_';
const API='https://www.googleapis.com/drive/v3/files';
function projects(records:Records):Project[]{
 const p=JSON.parse(records[PROJECTS]||'null');
 if(!Array.isArray(p)||p.some(x=>!x||typeof x.id!=='string'||!x.id||!Array.isArray(x.floors)||!Array.isArray(x.defects))||new Set(p.map(x=>x.id)).size!==p.length)throw Error('Invalid cloud projects');
 return p;
}
export function validateDriveRecords(input:unknown):Records{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid workspace');
 const records=input as Records;projects(records);
 for(const [k,v] of Object.entries(records)){
  if((k!==PROJECTS&&k!==BRAND&&!k.startsWith(REPORT))||typeof v!=='string')throw Error('Invalid workspace record');
  if(k!==PROJECTS){const parsed=JSON.parse(v);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid report or brand');}
 }
 return records;
}
function same(a:unknown,b:unknown){return JSON.stringify(a)===JSON.stringify(b);}
type Bundle={project:Project;report?:string};
function bundles(r:Records){return new Map(projects(r).map(p=>[p.id,{project:p,report:r[REPORT+p.id]}] as [string,Bundle]));}
export function mergeDriveRecords(local:Records,remote:Records,base:Records|null){
 const l=bundles(local),r=bundles(remote),b=base?bundles(base):null;
 const result=new Map(l);const conflicts:string[]=[];
 for(const id of new Set([...l.keys(),...r.keys(),...(b?[...b.keys()]:[])])){
  const left=l.get(id),right=r.get(id),before=b?.get(id);
  if(same(left,right))continue;
  if(b){
   if(same(left,before)){if(right)result.set(id,right);else result.delete(id);continue;}
   if(same(right,before))continue;
  }else if(!left&&right){result.set(id,right);continue;}
  else if(left&&!right)continue;
  conflicts.push(left?.project.name||right?.project.name||id);
 }
 const out:Records={...local,[PROJECTS]:JSON.stringify([...result.values()].map(x=>x.project))};
 for(const key of Object.keys(out))if(key.startsWith(REPORT)&&!result.has(key.slice(REPORT.length)))delete out[key];
 for(const [id,value] of result){if(value.report!==undefined)out[REPORT+id]=value.report;else delete out[REPORT+id];}
 // Keep independently edited branding; only adopt cloud branding when local is unchanged.
 if(base&&local[BRAND]===base[BRAND]){if(remote[BRAND]!==undefined)out[BRAND]=remote[BRAND];else delete out[BRAND];}
 else if(!local[BRAND]&&remote[BRAND])out[BRAND]=remote[BRAND];
 else if(base&&remote[BRAND]!==base[BRAND]&&local[BRAND]!==remote[BRAND])conflicts.push('Company settings / ข้อมูลบริษัท');
 return {records:out,conflicts};
}
export function recoverVisibleRecords(local:Records,remote:Records,includeConflictingCopies:boolean){
 const l=bundles(local),r=bundles(remote),out={...local};const recovered:Project[]=[],conflicts:string[]=[];
 for(const [id,bundle] of r){
  const current=l.get(id);
  if(current&&same(current,bundle))continue;
  if(current){conflicts.push(bundle.project.name||id);if(!includeConflictingCopies)continue;}
  const newId=current?'recovered_'+crypto.randomUUID():id;
  const p=current?{...bundle.project,id:newId,name:(bundle.project.name||id)+' (Drive backup)'}:bundle.project;
  recovered.push(p);
  if(bundle.report!==undefined)out[REPORT+newId]=bundle.report;
 }
 out[PROJECTS]=JSON.stringify([...l.values()].map(x=>x.project).concat(recovered));
 return {records:out,recovered,conflicts};
}
async function sha(v:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function readVisibleWorkspace(token:string,userId:string,signal:AbortSignal){
 if(!/^[0-9a-f-]{36}$/i.test(userId))throw Error('Invalid account');
 const prefix=(await sha('workspace')).slice(0,20);
 const headers={Authorization:'Bearer '+token};
 const q=new URLSearchParams({spaces:'drive',q:"trashed = false and mimeType = 'application/json' and appProperties has { key='tisOwner' and value='"+userId+"' } and name contains 'Workspace - '",fields:'nextPageToken,files(id,name,createdTime,appProperties)',orderBy:'createdTime desc',pageSize:'100'});
 const res=await fetch(API+'?'+q,{headers,signal,cache:'no-store'});
 if(!res.ok)throw Error('Google Drive HTTP '+res.status);
 const list=await res.json();
 const matches=(list.files||[]).filter((f:{appProperties?:Record<string,string>})=>f.appProperties?.tisOwner===userId&&f.appProperties?.tisCopy?.startsWith(prefix));
 if(!matches.length)return null;
 // The newest whole-workspace backup is the only recovery source. Never mix old image copies.
 const f=matches[0];
 const body=await fetch(API+'/'+encodeURIComponent(f.id)+'?alt=media',{headers,signal,cache:'no-store'});
 if(!body.ok)throw Error('Google Drive HTTP '+body.status);
 const raw=await body.text();
 if(f.appProperties.tisCopy!==prefix+(await sha(raw)).slice(0,40))throw Error('Backup integrity check failed');
 const data=JSON.parse(raw);
 if(data.format!=='TIS_DRIVE_V1'||data.userId!==userId)throw Error('Backup account mismatch');
 return {records:validateDriveRecords(data.records),date:f.createdTime as string,id:f.id as string};
}

export type DriveRecoverySource={id:string;name:string;date:string;kind:'workspace'|'project';copy:string};
export async function listRecoverySources(token:string,userId:string,signal:AbortSignal):Promise<DriveRecoverySource[]>{
 if(!/^[0-9a-f-]{36}$/i.test(userId))throw Error('Invalid account');
 const prefixes={workspace:(await sha('workspace')).slice(0,20),project:(await sha('project')).slice(0,20)};
 const headers={Authorization:'Bearer '+token};const found:DriveRecoverySource[]=[];let page='';
 do{
 const q=new URLSearchParams({spaces:'drive',q:"trashed = false and mimeType = 'application/json' and appProperties has { key='tisOwner' and value='"+userId+"' } and (name contains 'Workspace - ' or name contains 'ข้อมูลโครงการ - ')",fields:'nextPageToken,files(id,name,createdTime,appProperties)',orderBy:'createdTime desc',pageSize:'100'});
 if(page)q.set('pageToken',page);
 const res=await fetch(API+'?'+q,{headers,signal,cache:'no-store'});
 if(!res.ok)throw Error('Google Drive HTTP '+res.status);
 const data=await res.json();
 for(const f of data.files||[]){
 const copy=f.appProperties?.tisCopy||'';
 const kind=copy.startsWith(prefixes.workspace)?'workspace':copy.startsWith(prefixes.project)?'project':null;
 if(kind&&f.appProperties?.tisOwner===userId&&typeof f.id==='string'&&/^[a-f0-9]{60}$/.test(copy))found.push({id:f.id,name:f.name,date:f.createdTime,kind,copy});
 }
 page=data.nextPageToken||'';
 }while(page&&found.length<200);
 return found;
}
export async function readRecoverySource(token:string,userId:string,source:DriveRecoverySource,signal:AbortSignal):Promise<Records>{
 const headers={Authorization:'Bearer '+token};
 const meta=await fetch(API+'/'+encodeURIComponent(source.id)+'?fields=id,appProperties,trashed',{headers,signal,cache:'no-store'});
 if(!meta.ok)throw Error('Google Drive HTTP '+meta.status);
 const m=await meta.json();
 if(m.trashed||m.appProperties?.tisOwner!==userId||m.appProperties?.tisCopy!==source.copy)throw Error('Backup account mismatch');
 const res=await fetch(API+'/'+encodeURIComponent(source.id)+'?alt=media',{headers,signal,cache:'no-store'});
 if(!res.ok)throw Error('Google Drive HTTP '+res.status);
 const raw=await res.text(),prefix=(await sha(source.kind==='workspace'?'workspace':'project')).slice(0,20);
 if(source.copy!==prefix+(await sha(raw)).slice(0,40))throw Error('Backup integrity check failed');
 const data=JSON.parse(raw);
 if(source.kind==='workspace'){
  if(data.format!=='TIS_DRIVE_V1'||data.userId!==userId)throw Error('Backup account mismatch');
  return validateDriveRecords(data.records);
 }
 return validateDriveRecords({[PROJECTS]:JSON.stringify([data])});
}
export function recoveryPreview(local:Records,remote:Records){
 const l=bundles(local);
 return projects(remote).map(p=>({id:p.id,name:p.name||p.id,cloudCount:p.defects.length,localCount:l.get(p.id)?.project.defects.length??null,identical:same(l.get(p.id),bundles(remote).get(p.id))}));
}
export function restoreSelectedProject(local:Records,remote:Records,id:string,mode:'copy'|'replace'){
 const source=bundles(remote).get(id);if(!source)throw Error('Project not found');
 const existing=bundles(local),current=existing.get(id);
 if(same(current,source))return {records:local,name:source.project.name||id,count:source.project.defects.length};
 const next={...local};
 // Copy is the default for an existing project: never silently overwrite.
 const dest=current&&mode==='copy'?'recovered_'+crypto.randomUUID():id;
 const p={...source.project,id:dest,...(dest!==id?{name:(source.project.name||id)+' (Drive)'}:{})};
 const all=projects(local);next[PROJECTS]=JSON.stringify(dest===id&&current?all.map(x=>x.id===id?p:x):[p,...all]);
 if(source.report!==undefined)next[REPORT+dest]=source.report;
 else if(dest===id&&current)delete next[REPORT+dest];
 return {records:next,name:p.name||dest,count:p.defects.length};
}
