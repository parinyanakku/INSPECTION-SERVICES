import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const origin='http://127.0.0.1:4173';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
try {
 const context=await browser.newContext();
 const page=await context.newPage();
 await page.goto(origin);
 await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).waitFor();
 const result=await page.evaluate(async({A,B})=>{
   const s=await import('/src/utils/workspaceStorage.ts');
   const check=(x,m)=>{if(!x)throw Error(m)};
   const data=JSON.stringify({name:'SYNTHETIC TEST',image:'x'.repeat(6*1024*1024)});
   await s.openWorkspace(A);
   check(s.workspaceStorage.getItem('test-project')===null,'A was not empty');
   s.workspaceStorage.setItem('test-project',data);
   s.workspaceStorage.setItem('test-report','report A');
   check(await s.flushWorkspace(),'A write failed');
   await s.closeWorkspace();
   await s.openWorkspace(B);
   check(s.workspaceStorage.getItem('test-project')===null,'A data leaked into B');
   check(s.workspaceStorage.getItem('test-report')===null,'A report leaked into B');
   s.workspaceStorage.setItem('test-project','B project');
   check(await s.flushWorkspace(),'B write failed');
   await s.closeWorkspace();
   await s.openWorkspace(A);
   check(s.workspaceStorage.getItem('test-project')===data,'A data lost or overwritten');
   check(s.workspaceStorage.getItem('test-report')==='report A','A report lost');
   await s.closeWorkspace();
   await s.openWorkspace(B);
   check(s.workspaceStorage.getItem('test-project')==='B project','B data lost');
   await s.closeWorkspace();
   return {isolated:true,largeRecord:true,persistence:true};
 },{A,B});
 assert.deepEqual(result,{isolated:true,largeRecord:true,persistence:true});
 console.log('PASS: IndexedDB isolation, 6 MiB record, close and reopen');
 // Auth is mocked for browser UI checks; no production account or credentials are used.
 await context.route('https://geleptwbxjoumxyxbhqa.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(url.pathname==='/auth/v1/token'){
     const email=req.postDataJSON().email;
     const id=email==='a@example.test'?A:B;
     return route.fulfill({status:200,headers,json:{access_token:id,user:{id,email}}});
   }
   if(url.pathname==='/rest/v1/rpc/inspection_has_access')
     return route.fulfill({status:200,headers,json:req.headers().authorization==='Bearer '+A});
   if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers});
   return route.fulfill({status:400,headers,json:{error:'Unexpected test request'}});
 });
 // Separate context with clean workspace avoids fixture data interfering with the app.
 await page.getByLabel('อีเมล',{exact:true}).fill('b@example.test');
 await page.getByLabel('รหัสผ่าน',{exact:true}).fill('synthetic-password');
 await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'บัญชียังไม่ได้รับสิทธิ์'}).waitFor();
 console.log('PASS: denied license stays on login screen (mocked API)');
 await page.getByLabel('อีเมล',{exact:true}).fill('a@example.test');
 await page.getByLabel('รหัสผ่าน',{exact:true}).fill('synthetic-password');
 await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
 await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).waitFor();
 await page.getByText('a@example.test · พื้นที่งานส่วนตัว',{exact:true}).waitFor();
 // Import a synthetic project, then export a real backup through the app's UI.
 const fixture={format:'TIS_HOME_INSPECTION_BACKUP_V10',projects:[{id:'qa-synthetic',name:'QA synthetic inspection',houseNo:'TEST',clientName:'Test customer',address:'Test address',inspectionDate:'2026-01-01',inspectionRound:'1',projectStatus:'ตรวจเสร็จสิ้น',floors:[{id:'qa-floor',name:'ชั้น 1',imageUrl:null,svgPreset:0,zones:[]}],defects:[]}]};
 const chooserPromise=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'นำเข้าข้อมูล (JSON)',exact:true}).click();
 const chooser=await chooserPromise;
 await chooser.setFiles({name:'qa-synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await page.getByRole('button',{name:'นำเข้าข้อมูลทั้งหมด',exact:true}).click();
 await page.getByText('QA synthetic inspection',{exact:true}).waitFor();
 await page.evaluate(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'สำรองข้อมูล (JSON)',exact:true}).click();
 const download=await downloadPromise;
 const saved=JSON.parse(await fs.readFile(await download.path(),'utf8'));
 assert.equal(saved.projects[0].name,'QA synthetic inspection');
 assert.equal(saved.projects[0].id,'qa-synthetic');
 console.log('PASS: import and download synthetic project backup');

 page.once('dialog',d=>d.accept());
 await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).click();
 await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).waitFor({timeout:30000});
 console.log('PASS: approved login and logout runtime reload (mocked API)');
}finally{await browser.close();}
