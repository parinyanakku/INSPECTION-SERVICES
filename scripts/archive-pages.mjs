import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const archive=process.env.ARCHIVE_DIR;
const build=Number(process.env.GITHUB_RUN_NUMBER);
if(!archive||!Number.isSafeInteger(build)||build<1)throw Error('Missing release settings');
const version='v1.0.'+build;
const versions=path.join(archive,'versions');
const index=path.join(archive,'release-index.json');
fs.mkdirSync(versions,{recursive:true});
const releases=fs.existsSync(index)?JSON.parse(fs.readFileSync(index,'utf8')).releases:[];
const dest=path.join(versions,version);
if(!fs.existsSync(dest)){
 fs.cpSync('dist',dest,{recursive:true});
 releases.push({version,build,storageSchema:2,date:new Date().toISOString(),notes:execFileSync('git',['log','-1','--format=%s'],{encoding:'utf8'}).trim(),commit:process.env.GITHUB_SHA});
}
releases.sort((a,b)=>b.build-a.build);
if(!releases.length)throw Error('No releases');
const compatible=releases.filter(r=>r.storageSchema===2);
if(!compatible.length)throw Error('No authenticated releases');
const manifest={latest:compatible[0].version,releases};
fs.writeFileSync(index,JSON.stringify(manifest,null,2)+'\n');
// Root is a launcher; all program builds remain available at their version-specific paths.
fs.rmSync('dist',{recursive:true,force:true});
fs.cpSync(path.join(versions,manifest.latest),'dist',{recursive:true});
fs.mkdirSync('dist/versions',{recursive:true});
for(const release of compatible)fs.cpSync(path.join(versions,release.version),path.join('dist/versions',release.version),{recursive:true});
// Retain old unauthenticated builds in the archive, not the public Pages site.
for(const release of releases.filter(r=>r.storageSchema!==2)){
 const oldPath=path.join('dist/versions',release.version);fs.mkdirSync(oldPath,{recursive:true});
 fs.writeFileSync(path.join(oldPath,'index.html'),'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=../../"><p>กรุณาเข้าสู่ระบบผ่าน <a href="../../">เว็บไซต์หลัก</a></p>');
}
fs.writeFileSync('dist/release-index.json',JSON.stringify({latest:manifest.latest,releases:compatible},null,2)+'\\n');
fs.copyFileSync('scripts/pages-launcher.html','dist/index.html');
