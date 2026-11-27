import type {ProjectFile} from '../types/inspection';
// A short-lived handoff of an exact, verified project record. No persistent
// data-format change. Release references on consume, failure or account close.
let prepared:{raw:string;projects:ProjectFile[]}|null=null;
export function prepareProjects(raw:string):ProjectFile[]{
 if(prepared?.raw===raw)return prepared.projects;
 const projects=JSON.parse(raw);
 if(!Array.isArray(projects)||projects.some(p=>!p||typeof p.id!=='string'||!Array.isArray(p.floors)||!Array.isArray(p.defects))||new Set(projects.map(p=>p.id)).size!==projects.length)throw Error('Invalid projects');
 prepared={raw,projects};
 return projects;
}
export function consumePreparedProjects(raw:string):ProjectFile[]{
 const current=prepareProjects(raw);prepared=null;return current;
}
export function clearPreparedProjects(){prepared=null;}
