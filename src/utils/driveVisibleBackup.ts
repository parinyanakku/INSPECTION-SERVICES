// Visible, non-authoritative backup. Never deletes or overwrites files.
import type {ProjectFile,ReportBookData} from '../types/inspection';
const API='https://www.googleapis.com/drive/v3/files';
const UPLOAD='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
type Records=Record<string,string>;
type Entry={id:string;appProperties?:Record<string,string>};
const folderMime='application/vnd.google-apps.folder';
async function digest(value:string){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
const clean=(name:string)=>name.replace(/[\u0000-\u001f/\\:*?"<>|]/g,'_').trim().slice(0,100)||'Project';
export async function mirrorWorkspace(token:string,userId:string,records:Records,active:()=>boolean,progress:(done:number,total:number)=>void){
 if(!/^[a-f0-9-]{36}$/i.test(userId))throw Error('Invalid workspace ID');
 async function req(url:string,init:RequestInit={}){
  if(!active())throw Error('Cancelled');
  const res=await fetch(url,{...init,headers:{...init.headers,Authorization:'Bearer '+token}});
  if(!res.ok)throw Error('Google Drive HTTP '+res.status);
  return res.json();
 }
 async function list(q:string){
  const all:Entry[]=[];let page='';
  do{
   const params=new URLSearchParams({spaces:'drive',q:'trashed = false and '+q,fields:'nextPageToken,files(id,appProperties)',pageSize:'100'});
   if(page)params.set('pageToken',page);
   const result=await req(API+'?'+params);all.push(...(result.files||[]));page=result.nextPageToken||'';
  }while(page);
  return all;
 }
 async function folder(name:string,key:string,parent?:string){
  const matches=await list("mimeType = '"+folderMime+"' and appProperties has { key='tisOwner' and value='"+userId+"' } and appProperties has { key='tisFolder' and value='"+key+"' }"+(parent?" and '"+parent+"' in parents":''));
  if(matches.length)return matches[0].id;
  const value=await req(API+'?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:folderMime,...(parent?{parents:[parent]}:{}),appProperties:{tisOwner:userId,tisFolder:key}})});
  if(!value.id)throw Error('Folder creation not confirmed');return value.id as string;
 }
 const root=await folder('TEAM INSPECTION PRO ELITE','root');
 const backup=await folder('ข้อมูลสำรอง - Workspace backups','backup',root);
 const projectRoot=await folder('แฟ้มโครงการ - Projects','projects',root);
 const projects=JSON.parse(records.tis_wl_projects_v10||'[]') as ProjectFile[];
 if(!Array.isArray(projects))throw Error('Invalid projects');
 type Job={parent:string;name:string;key:string;value:string;image?:boolean};
 const jobs:Job[]=[];
 jobs.push({parent:backup,name:'Workspace',key:'workspace',value:JSON.stringify({format:'TIS_DRIVE_V1',userId,records},null,2)});
 for(const project of projects){
  if(!project||typeof project.id!=='string'||!Array.isArray(project.floors)||!Array.isArray(project.defects))throw Error('Invalid project');
  const key=(await digest(project.id)).slice(0,32);
  const dir=await folder(clean(project.name||project.id),'p'+key,projectRoot);
  const defects=await folder('รูปภาพ Defect','d'+key,dir);
  const plans=await folder('รูปแปลนบ้าน','f'+key,dir);
  const reports=await folder('ข้อมูลรายงาน','r'+key,dir);
  jobs.push({parent:dir,name:'ข้อมูลโครงการ',key:'project',value:JSON.stringify(project,null,2)});
  function photo(parent:string,name:string,key:string,value:unknown){
   if(typeof value==='string'&&/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(value))jobs.push({parent,name:clean(name),key,value,image:true});
  }
  for(const floor of project.floors)photo(plans,floor.name||'Floor','floor-'+floor.id,floor.imageUrl);
  for(const d of project.defects){photo(defects,'Defect '+d.number+' - Before','before-'+d.id,d.beforeImg||d.photoDataUrl);photo(defects,'Defect '+d.number+' - After','after-'+d.id,d.afterImg);}
  const raw=records['tis_report_book_v1_'+project.id];
  if(raw){
   const report=JSON.parse(raw) as ReportBookData;
   jobs.push({parent:reports,name:'ข้อมูลเล่มรายงาน',key:'report',value:JSON.stringify(report,null,2)});
   photo(reports,'แผนที่','map',report.locationMapImg);photo(reports,'หน้าบ้าน','front',report.frontHouseImg);photo(reports,'หน้าปก','cover',report.coverCustomImg);
   (report.extraZonePlanImgs||[]).forEach((v,i)=>photo(reports,'Zone '+(i+1),'zone-'+i,v));
  }
 }
 const byFolder=new Map<string,Set<string>>();
 for(const parent of new Set(jobs.map(j=>j.parent))){
  const existing=await list("'"+parent+"' in parents and appProperties has { key='tisOwner' and value='"+userId+"' }");
  byFolder.set(parent,new Set(existing.map(e=>e.appProperties?.tisCopy||'').filter(Boolean)));
 }
 let done=0;progress(done,jobs.length);
 // Content-addressed copies are immutable, so a concurrent or interrupted sync
 // cannot overwrite a newer copy. Old copies are retained in the user's Drive.
 for(const job of jobs){
  const hash=await digest(job.value),keyHash=await digest(job.key);
  const copy=keyHash.slice(0,20)+hash.slice(0,40),known=byFolder.get(job.parent)!;
  if(!known.has(copy)){
   let mime='application/json',ext='json',data:Blob|string=job.value;
   if(job.image){const m=job.value.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.*)$/is);if(!m)throw Error('Invalid image');ext=m[1].toLowerCase().replace('jpeg','jpg');mime='image/'+(ext==='jpg'?'jpeg':ext);const binary=atob(m[2]);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);data=new Blob([bytes],{type:mime});}
   const meta={name:job.name+' - '+hash.slice(0,10)+'.'+ext,mimeType:mime,parents:[job.parent],appProperties:{tisOwner:userId,tisCopy:copy}};
   const boundary='tis_'+crypto.randomUUID().replace(/-/g,'');
   const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify(meta),'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n',data,'\r\n--'+boundary+'--\r\n']);
   const saved=await req(UPLOAD,{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
   if(!saved.id)throw Error('Visible backup upload not confirmed');known.add(copy);
  }
  progress(++done,jobs.length);
 }
 return root;
}
