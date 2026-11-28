import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {removeLegacyPrototypes,removePublishedMaps} from './security-build.mjs';
const archive=process.env.ARCHIVE_DIR;
const build=Number(process.env.GITHUB_RUN_NUMBER);
if(!archive||!Number.isSafeInteger(build)||build<1)throw Error('Missing release settings');
const version='v1.0.'+build;
const versions=path.join(archive,'versions');
const index=path.join(archive,'release-index.json');
fs.mkdirSync(versions,{recursive:true});
const releases=fs.existsSync(index)?JSON.parse(fs.readFileSync(index,'utf8')).releases:[];
const dest=path.join(versions,version);
const commitBody=execFileSync('git',['log','-1','--format=%b'],{encoding:'utf8'});
const notesTh=commitBody.match(/^Notes-TH:\s*(.+)$/m)?.[1]?.trim();
const notesEn=commitBody.match(/^Notes-EN:\s*(.+)$/m)?.[1]?.trim();
if(!fs.existsSync(dest)){
 fs.cpSync('dist',dest,{recursive:true});
 // Each immutable release points to the same app identity and install scope.
 const entry=path.join(dest,'index.html');
 fs.writeFileSync(entry,fs.readFileSync(entry,'utf8').replace(/href="\.\/(proelite\.webmanifest|product-icons\/home-(?:180|32)\.png)"/g,'href="../../$1"'));
 releases.push({version,build,storageSchema:2,date:new Date().toISOString(),notes:execFileSync('git',['log','-1','--format=%s'],{encoding:'utf8'}).trim(),commit:process.env.GITHUB_SHA,...(notesTh?{notesTh}: {}),...(notesEn?{notesEn}: {})});
}
for(const release of releases){if(release.version==='v1.0.37'&&!release.notesTh)release.notesTh='แก้กรอบรายงาน Excel ขนาด A4 ถูกตัดด้านขวา โดยปรับให้พอดีกระดาษและกำหนดสเกลพิมพ์';}
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
// Security exception: remove the two accidentally published, unauthenticated
// prototypes and debugging maps from historical snapshots too. The app entry,
// data storage schema, version metadata and report viewers remain unchanged.
for(const release of releases){
 const releaseDir=path.join(versions,release.version);
 if(fs.existsSync(releaseDir)){removeLegacyPrototypes(releaseDir);removePublishedMaps(releaseDir);}
}
removeLegacyPrototypes('dist');removePublishedMaps('dist');
for(const release of compatible)fs.cpSync(path.join(versions,release.version),path.join('dist/versions',release.version),{recursive:true});
// Retain old unauthenticated builds in the archive, not the public Pages site.
for(const release of releases.filter(r=>r.storageSchema!==2)){
 const oldPath=path.join('dist/versions',release.version);fs.mkdirSync(oldPath,{recursive:true});
 fs.writeFileSync(path.join(oldPath,'index.html'),'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=../../"><p>กรุณาเข้าสู่ระบบผ่าน <a href="../../">เว็บไซต์หลัก</a></p>');
}
fs.writeFileSync('dist/release-index.json',JSON.stringify({latest:manifest.latest,releases:compatible},null,2)+'\n');
fs.copyFileSync('scripts/pages-launcher.html','dist/index.html');
// Customer links are separate from immutable application builds. Serve the current
// hardened viewer at existing paths too, retaining each URL fragment and expiry.
for(const release of compatible){for(const viewer of ['r.html','customer-report.html'])fs.copyFileSync(path.join('dist',viewer),path.join('dist/versions',release.version,viewer));}
