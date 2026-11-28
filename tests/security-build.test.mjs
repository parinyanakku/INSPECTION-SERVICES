import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {legacyPrototypePaths,removeLegacyPrototypes,removePublishedMaps,secretFindings,scanPublished} from '../scripts/security-build.mjs';
test('production security rules distinguish credentials and public client identifiers',()=>{
 assert.deepEqual(secretFindings('sb_publishable_example_public_identifier'),[]);
 assert.deepEqual(secretFindings('GEMINI_API_KEY="MY_GEMINI_API_KEY"'),[]);
 assert.ok(secretFindings('sb_secret_'+'A'.repeat(32)).includes('supabase-secret'));
 const token=Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from('{"role":"service_role"}').toString('base64url')+'.'+'B'.repeat(40);
 assert.ok(secretFindings(token).includes('service-role-jwt'));
});
test('remove only obsolete public prototypes and map files, preserve reports and other assets',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'security-gate-'));
 try{
  for(const p of [...legacyPrototypePaths,'assets/aistudio/keep.png','r.html','assets/app.js','assets/app.js.map']){
   const full=path.join(root,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,'sample');
  }
  assert.equal(scanPublished(root).filter(x=>x.reason==='legacy-prototype').length,2);
  assert.ok(scanPublished(root).some(x=>x.reason==='source-map'));
  removeLegacyPrototypes(root);removePublishedMaps(root);
  assert.deepEqual(scanPublished(root),[]);
  assert.ok(fs.existsSync(path.join(root,'r.html')));
  assert.ok(fs.existsSync(path.join(root,'assets/aistudio/keep.png')));
  fs.writeFileSync(path.join(root,'assets/app.js'),'console.log(1);\n//# sourceMappingURL=x.map');
  assert.ok(scanPublished(root).some(x=>x.reason==='source-map-directive'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
