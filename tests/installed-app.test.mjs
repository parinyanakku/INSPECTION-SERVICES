import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const manifest = JSON.parse(readFileSync('public/proelite.webmanifest', 'utf8'));
test('all installed platforms launch the stable site and use permanent product icons', () => {
  const root = new URL('https://teaminspectionproelite.github.io/INSPECTION-SERVICES/');
  for (const key of ['id','start_url','scope']) assert.equal(new URL(manifest[key],root).href,root.href);
  for (const file of ['native/android/Launcher.java','native/windows/Launcher.cs']) {
    assert.ok(readFileSync(file,'utf8').includes('"'+root.href+'"'));
  }
  for (const icon of manifest.icons) {
    const png=readFileSync('public/'+icon.src);
    assert.equal(png.readUInt32BE(16)+'x'+png.readUInt32BE(20),icon.sizes);
  }
});
test('offline handling stays within the workspace entry points', async () => {
  const scope='https://example.test/INSPECTION-SERVICES/';
  let handler;
  vm.runInNewContext(readFileSync('public/proelite-worker.js','utf8'), {
    self:{registration:{scope},addEventListener:(_,cb)=>{handler=cb;}},URL,Response,fetch:async()=>{throw Error('offline');}
  });
  function dispatch(url,mode='navigate') {
    let response;
    handler({request:{url:new URL(url,scope).href,method:'GET',mode},respondWith:r=>{response=r;}});
    return response;
  }
  for (const entry of ['./','versions/v1.0.24/']) assert.equal((await dispatch(entry)).status,503);
  for (const other of ['r.html#share','versions/v1.0.24/customer-report.html','reset-password.html','release-index.json','https://api.example.test/']) {
    assert.equal(dispatch(other),undefined);
  }
  assert.equal(dispatch('./','cors'),undefined);
});
test('archive publication preserves version pins, stable install identity and customer report entries', () => {
  const cwd=mkdtempSync(path.join(tmpdir(),'proelite-archive-'));
  const archive=path.join(cwd,'archive');
  const git=execFileSync('git',['rev-parse','--absolute-git-dir'],{encoding:'utf8'}).trim();
  try {
    mkdirSync(path.join(cwd,'scripts'));
    const launcher=readFileSync('scripts/pages-launcher.html','utf8');
    writeFileSync(path.join(cwd,'scripts/pages-launcher.html'),launcher);
    for (const build of ['1','2']) {
      const dist=path.join(cwd,'dist');
      rmSync(dist,{recursive:true,force:true}); mkdirSync(dist);
      writeFileSync(path.join(dist,'index.html'),'<link rel="manifest" href="./proelite.webmanifest">');
      for (const name of ['r.html','customer-report.html']) writeFileSync(path.join(dist,name),'viewer'+build);
      execFileSync(process.execPath,[path.resolve('scripts/archive-pages.mjs')],{cwd,env:{...process.env,ARCHIVE_DIR:archive,GIT_DIR:git,GITHUB_RUN_NUMBER:build}});
    }
    const read=name=>readFileSync(path.join(cwd,'dist',name),'utf8');
    assert.equal(read('index.html'),launcher);
    assert.equal(JSON.parse(read('release-index.json')).latest,'v1.0.2');
    for (const release of ['v1.0.1','v1.0.2']) {
      assert.match(read('versions/'+release+'/index.html'),/href="\.\.\/\.\.\/proelite.webmanifest"/);
      assert.equal(read('versions/'+release+'/r.html'),'viewer2');
    }
    assert.ok(existsSync(path.join(archive,'versions/v1.0.1/index.html')));
  } finally { rmSync(cwd,{recursive:true,force:true}); }
});

test('installer distribution is admin-only and native pilot has no external browser workspace fallback',()=>{
 const sql=readFileSync('supabase/migrations/20261128092459_proelite_admin_only_installer_download.sql','utf8');
 assert.match(sql,/select public\.inspection_is_admin\(\)/);
 const account=readFileSync('src/components/AccountWorkspace.tsx','utf8');
 assert.match(account,/isAdmin&&canDownload&&!blocked&&<button type="button" data-tour="downloads"/);
 assert.match(account,/isAdmin&&canDownload&&!blocked&&!busy&&downloadsOpen/);
 const windows=readFileSync('native/windows/Launcher.cs','utf8'),android=readFileSync('native/android/Launcher.java','utf8');
 assert.match(windows,/CoreWebView2/);assert.doesNotMatch(windows,/Process\.Start|msedge\.exe/);
 assert.match(android,/new WebView\(this\)/);assert.doesNotMatch(android,/Intent\.ACTION_VIEW|startActivity\(browser\)/);
});

test('admin installer dialog closes its native modal before releasing React state',()=>{
 const source=readFileSync('src/components/DownloadCenter.tsx','utf8');
 const body=source.slice(source.indexOf('  function dismiss() {'),source.indexOf('  useEffect(() => {',source.indexOf('  function dismiss() {')));
 assert.ok(body.includes('dialog.current.close()'));
 const calls=[],element={open:true,close(){calls.push('native-close');this.open=false;}};
 const context={closing:{current:false},download:{current:{abort(){calls.push('abort');}}},dialog:{current:element},onClose(){calls.push('react-close');}};
 vm.runInNewContext(body+'\ndismiss();dismiss();',context);
 assert.deepEqual(calls,['abort','native-close','react-close']);
 assert.equal(element.open,false);
 assert.match(source,/onCancel=\{event=>\{event.preventDefault\(\);dismiss\(\);\}\}/);
 assert.equal((source.match(/event.stopPropagation\(\);dismiss\(\);/g)||[]).length,2);
});

test('test packages are staged privately and are not approved releases',()=>{
 const edge=readFileSync('supabase/functions/proelite-test-installers/index.ts','utf8');
 const workflow=readFileSync('.github/workflows/native-packages.yml','utf8');
 assert.match(edge,/ROOT='candidates\/test\/'/);
 assert.match(edge,/crypto\.subtle\.verify/);
 assert.match(edge,/c\.repository_id==='1472573866'/);
 assert.match(edge,/rest\/v1\/rpc\/inspection_can_download/);
 assert.match(workflow,/id-token: write/);
 assert.match(workflow,/stage-test\.mjs windows/);
 assert.match(workflow,/stage-test\.mjs android/);
 assert.doesNotMatch(workflow,/upload-artifact/);
});

test('Android private test staging uses the actual test build filename, not the release APK',()=>{
 const build=readFileSync('native/android/build.ps1','utf8');
 const workflow=readFileSync('.github/workflows/native-packages.yml','utf8');
 const match=build.match(/else \{[\s\S]*?\$outputName='(ProElite-Inspection-test\.apk)'/);
 assert.ok(match);
 assert.ok(workflow.includes('node native/stage-test.mjs android build/native/android/'+match[1]));
 assert.ok(workflow.includes('node native/stage.mjs android build/native/android/ProElite-Inspection.apk'));
});

test('iOS is visible but unsigned pilot is not offered as a device IPA',()=>{
 const ui=readFileSync('src/components/DownloadCenter.tsx','utf8');
 assert.match(ui,/iPhone \/ iPad · IPA/);
 assert.match(ui,/Apple signing required/);
 assert.match(ui,/No installable IPA yet/);
 assert.match(ui,/Temporary free iPhone test \(PWA\)/);
 assert.match(readFileSync('native/ios/Launcher.swift','utf8'),/WKWebView/);
 assert.match(readFileSync('native/ios/build-simulator.sh','utf8'),/apple-ios15\.0-simulator/);
 assert.doesNotMatch(readFileSync('.github/workflows/ios-pilot.yml','utf8'),/upload-artifact|stage-test/);
});
