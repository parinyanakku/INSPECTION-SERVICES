import {workspaceStorage,writeWorkspaceBatch} from './workspaceStorage';
import {STORAGE_KEY_PROJECTS,STORAGE_KEY_BRAND,migrateProject} from '../data/defaultData';
import type {ProjectFile} from '../types/inspection';
const OWNER='a4e38d13-f481-4552-98ee-d90cac72fc9b';
const MARKER='tis_legacy_admin_import_v1';
const REPORT='tis_report_book_v1_';
function parseProjects(raw:string):ProjectFile[]{
 const parsed=JSON.parse(raw);
 if(!Array.isArray(parsed)||parsed.some(p=>!p||typeof p.id!=='string'||typeof p.name!=='string'||!Array.isArray(p.floors)||!Array.isArray(p.defects)))throw Error('Invalid project data');
 return parsed.map(migrateProject);
}
export async function importLegacyAdminProjects(userId:string,isAdmin:boolean):Promise<number>{
 // Only the original verified owner may automatically claim unscoped local data.
 if(!isAdmin||userId!==OWNER||workspaceStorage.getItem(MARKER))return 0;
 const raw=localStorage.getItem(STORAGE_KEY_PROJECTS);
 if(!raw)return 0;
 const old=parseProjects(raw),current=parseProjects(workspaceStorage.getItem(STORAGE_KEY_PROJECTS)||'[]');
 const next=[...current],records:Record<string,string>={};
 let count=0;
 for(const p of old){
   const sameId=next.find(x=>x.id===p.id);
   const oldReport=localStorage.getItem(REPORT+p.id);
   const newReport=workspaceStorage.getItem(REPORT+p.id);
   if(sameId&&JSON.stringify(sameId)===JSON.stringify(p)&&(!oldReport||oldReport===newReport)){
     continue;
   }
   if(sameId&&JSON.stringify(sameId)===JSON.stringify(p)&&oldReport&&!newReport){
     records[REPORT+p.id]=oldReport;continue;
   }
   // Preserve both copies if a project ID conflicts; never overwrite current work.
   const copy=sameId?{...p,id:'legacy_'+crypto.randomUUID()}:p;
   next.push(copy);count++;
   if(oldReport)records[REPORT+copy.id]=oldReport;
 }
 if(!workspaceStorage.getItem(STORAGE_KEY_BRAND)){
   const brand=localStorage.getItem(STORAGE_KEY_BRAND);
   if(brand){JSON.parse(brand);records[STORAGE_KEY_BRAND]=brand;}
 }
 records[STORAGE_KEY_PROJECTS]=JSON.stringify(next);
 records[MARKER]=new Date().toISOString();
 await writeWorkspaceBatch(records);
 // Keep original localStorage intact for backup/recovery.
 return count;
}
