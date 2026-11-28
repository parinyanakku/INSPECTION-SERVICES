import {useEffect, useRef, useState} from 'react';
import {appRoot} from '../utils/installApp';
import {verifyInstallerDigest} from '../utils/installerIntegrity';
import {hasWindowsProofBridge,verifyWindowsDevice} from '../utils/nativeDeviceProof';
import type {AppLanguage} from '../types/inspection';

const packages = ['ProElite-Inspection.msi', 'ProElite-Inspection.apk'] as const;
const testPackages = ['ProElite-Inspection-TEST.msi', 'ProElite-Inspection-TEST.apk'] as const;
type PackageName = typeof packages[number] | typeof testPackages[number];
const buttonStyle = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50';
type Props = {lang:AppLanguage; api:string; publicKey:string; token:string; onClose:()=>void};

export function DownloadCenter({lang, api, publicKey, token, onClose}: Props) {
  const tr = (th:string, en:string) => lang === 'en' ? en : th;
  const dialog = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const [available, setAvailable] = useState<string[] | null>(null);
  const [testAvailable,setTestAvailable]=useState<string[]|null>(null);
  const [testFailed,setTestFailed]=useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(false);
  const [ready,setReady] = useState<File|null>(null);
  const [integrity,setIntegrity]=useState<{sha256:string;commit:string}|null>(null);
  const [integrityError,setIntegrityError]=useState(false);
  const [proofBusy,setProofBusy]=useState(false),[proof,setProof]=useState(''),[proofError,setProofError]=useState(false);
  const [shareError,setShareError] = useState(false);
  const download = useRef<AbortController | null>(null);
  const storage = api + '/storage/v1/object/';
  const headers = {apikey: publicKey, Authorization: 'Bearer ' + token};
  const testEndpoint=api+'/functions/v1/proelite-test-installers';
  useEffect(() => {
    const element = dialog.current;
    closing.current = false;
    if (element && !element.open) element.showModal();
    return () => {
      closing.current = true;
      download.current?.abort();
      if (element?.open) element.close();
    };
  }, []);
  function dismiss() {
    if (closing.current) return;
    closing.current = true;
    download.current?.abort();
    // Close the native top-layer modal before unmounting the React component.
    try { if (dialog.current?.open) dialog.current.close(); }
    finally { onClose(); }
  }
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false); setAvailable(null); setBusy(''); setReady(null); setShareError(false); setIntegrity(null); setIntegrityError(false);
    async function list() {
      const res = await fetch(storage + 'list/proelite-installers', {
        method:'POST', headers:{apikey:publicKey, Authorization:'Bearer ' + token, 'Content-Type':'application/json'},
        cache:'no-store', signal:AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        body:JSON.stringify({prefix:'approved', limit:10})
      });
      if (!res.ok) throw Error();
      const files = await res.json() as {name:string}[];
      if (!controller.signal.aborted) setAvailable(files.map(f => f.name));
    }
    void list().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); download.current?.abort(); download.current = null; };
  }, [storage, publicKey, token, attempt]);
  useEffect(()=>{
    const controller=new AbortController();
    setTestAvailable(null);setTestFailed(false);
    void (async()=>{
      const r=await fetch(testEndpoint,{headers:{apikey:publicKey,Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(!r.ok)throw Error();const list=await r.json() as {name:string}[];
      if(!controller.signal.aborted)setTestAvailable(list.map(f=>f.name));
    })().catch(()=>{if(!controller.signal.aborted)setTestFailed(true);});
    return ()=>controller.abort();
  },[testEndpoint,publicKey,token,attempt]);
  async function save(name:PackageName) {
    if (download.current) return;
    const controller = new AbortController();
    download.current = controller; setBusy(name); setError(false); setReady(null); setShareError(false); setIntegrity(null); setIntegrityError(false);
    try {
      const url=name.includes('-TEST.')?testEndpoint+'?platform='+(name.endsWith('.msi')?'windows':'android'):storage+'authenticated/proelite-installers/approved/'+name;
      const res = await fetch(url,
        {headers, cache:'no-store', signal:AbortSignal.any([controller.signal, AbortSignal.timeout(120000)])});
      if (!res.ok) {if(res.status===409&&name.includes('-TEST.'))throw Error('INTEGRITY');throw Error();}
      const file = await res.blob();
      if (controller.signal.aborted) return;
      const magic = new Uint8Array(await file.slice(0,8).arrayBuffer());
      const expected = name.endsWith('.msi') ? [208,207,17,224,161,177,26,225] : [80,75,3,4];
      if (!expected.every((b,i)=>magic[i]===b)) throw Error('INTEGRITY');
      if(name.includes('-TEST.')){
        const sha256=res.headers.get('x-proelite-sha256')||'',commit=res.headers.get('x-proelite-build-commit')||'';
        if(!/^[a-f0-9]{40}$/.test(commit)||!await verifyInstallerDigest(file,sha256))throw Error('INTEGRITY');
        if(controller.signal.aborted)return;
        setIntegrity({sha256,commit});
      }
      if (controller.signal.aborted) return;
      setReady(new File([file],name,{type:'application/octet-stream'}));
    } catch(e) { if (!controller.signal.aborted) {if(e instanceof Error&&e.message==='INTEGRITY')setIntegrityError(true);else setError(true);} }
    finally { if (download.current === controller) { download.current = null; setBusy(''); } }
  }
  function saveReady(){
    if(!ready)return;const url=URL.createObjectURL(ready);const link=document.createElement('a');
    link.href=url;link.download=ready.name;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function shareReady(){
    if(!ready)return;setShareError(false);
    try{if(!navigator.share||!navigator.canShare?.({files:[ready]}))throw Error();await navigator.share({files:[ready],title:'ProElite Inspection'});}
    catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setShareError(true);}
  }
  async function testDevice(){
    if(proofBusy)return;setProofBusy(true);setProof('');setProofError(false);
    try{const result=await verifyWindowsDevice(api,publicKey,token);if(!closing.current)setProof(result);}
    catch{if(!closing.current)setProofError(true);}finally{if(!closing.current)setProofBusy(false);}
  }
  return <dialog ref={dialog} onClose={dismiss} onCancel={event=>{event.preventDefault();dismiss();}} aria-labelledby="downloads-title" className="m-auto max-h-[90dvh] w-[min(94vw,30rem)] overflow-auto rounded-2xl p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/60">
    <header className="flex items-center gap-3">
      <img width="48" height="48" className="rounded-xl" src={new URL('product-icons/home-192.png',appRoot).href} alt="" />
      <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-blue-800">ProElite Inspection</p><h2 id="downloads-title" className="text-xl font-bold">{tr('ไฟล์ติดตั้งสำหรับผู้ดูแล','Admin installers')}</h2></div>
      <button type="button" aria-label={tr('ปิดหน้าต่าง','Close dialog')} className="shrink-0 cursor-pointer min-w-11 min-h-11 rounded-lg border border-slate-300 text-xl" onClick={event=>{event.stopPropagation();dismiss();}}>×</button>
    </header>
    <section className="my-5 space-y-2 text-sm">
      <p className="font-semibold text-blue-900">{tr('เฉพาะ Admin — ผู้ซื้อดาวน์โหลดเองไม่ได้','Admin only — buyers cannot download installers')}</p>
      <p>{tr('เลือกไฟล์ที่อนุมัติแล้ว จากนั้นบันทึกลงเครื่องหรือแชร์ไฟล์จากโทรศัพท์ด้วยตนเอง ระบบจะไม่ส่งให้ลูกค้าอัตโนมัติ','Prepare an approved package, then save it or share the file manually from your phone. Nothing is sent to customers automatically.')}</p>
      <p className="text-slate-600">{tr('รุ่นทดสอบอยู่ในส่วนแยกสำหรับผู้ดูแลเท่านั้น การปิดสิทธิ์เข้าเว็บเดิมจะทำหลังจากทดสอบแอปใหม่ครบ รวมถึง iOS','Test packages are separate for administrators only. The old browser workspace remains enabled until native clients, including iOS, are verified.')}</p>
    </section>
    <section className="space-y-2 border-t pt-4 text-sm"><h3 className="font-bold">{tr('ไฟล์ติดตั้งที่อนุมัติแล้ว','Approved installer files')}</h3>
      {failed ? <p role="alert">{tr('โหลดรายการไม่ได้','Could not load packages.')} <button className={buttonStyle} onClick={() => setAttempt(n=>n+1)}>{tr('ลองอีกครั้ง','Retry')}</button></p>
      : packages.map((file,i) => <div key={file} className="flex items-center justify-between gap-2">
        <span>{i === 0 ? 'Windows · MSI' : 'Android · APK'}</span>
        {available?.includes(file) ? <button type="button" className={buttonStyle} disabled={!!busy} onClick={() => void save(file)}>{busy===file?tr('กำลังเตรียมไฟล์…','Preparing file…'):tr('เตรียมไฟล์','Prepare file')}</button>
        : <span className="text-slate-600">{available ? tr('ยังไม่เปิดดาวน์โหลด','Not released yet') : tr('กำลังตรวจสอบ…','Checking…')}</span>}
      </div>)}
      <div className="flex items-center justify-between gap-2"><span>iPhone / iPad · IPA</span><span className="text-xs text-right">{tr('รอลงนาม Apple','Apple signing required')}</span></div>
    </section>
    <section className="mt-4 space-y-2 border-t pt-4 text-sm">
      <h3 className="font-bold">{tr('ไฟล์รุ่นทดสอบ — เฉพาะ Admin','Test installers — admin only')}</h3>
      <p className="text-xs">{tr('สำหรับทดสอบเองเท่านั้น Windows ยังไม่เซ็นรับรอง Android ใช้กุญแจทดสอบที่เปลี่ยนได้ ไม่ควรแจกผู้ซื้อ','For your own tests only. Windows is unsigned; Android uses a temporary test key. Do not distribute to buyers.')}</p>
      {testFailed?<p role="alert">{tr('ตรวจรายการทดสอบไม่ได้','Cannot check test files')} <button type="button" className={buttonStyle} onClick={()=>setAttempt(n=>n+1)}>{tr('ลองอีกครั้ง','Retry')}</button></p>:testPackages.map((file,i)=><div key={file} className="flex items-center justify-between gap-2"><span>{i===0?'Windows · TEST MSI':'Android · TEST APK'}</span>{testAvailable?.includes(file)?<button type="button" disabled={!!busy} className={buttonStyle} onClick={()=>void save(file)}>{busy===file?tr('กำลังเตรียม…','Preparing…'):tr('ดาวน์โหลดรุ่นทดสอบ','Download test')}</button>:<span className="text-xs">{testAvailable?tr('ยังไม่มีไฟล์','Not built yet'):tr('กำลังตรวจสอบ…','Checking…')}</span>}</div>)}
      <div className="rounded-lg border p-3 space-y-1">
        <div className="flex items-center justify-between gap-2"><span className="font-semibold">iPhone / iPad</span><span className="text-xs">{tr('ยังไม่มี IPA พร้อมติดตั้ง','No installable IPA yet')}</span></div>
        <p className="text-xs">{tr('กำลังเตรียมแอป iOS แบบหน้าต่างในตัวโปรแกรม ต้องมีการลงนามและสิทธิ์ติดตั้งจาก Apple ก่อนเปิดไฟล์ดาวน์โหลด','The embedded iOS app pilot requires Apple signing and device distribution approval before downloads can be enabled.')}</p>
        <details className="text-xs"><summary className="cursor-pointer font-semibold">{tr('ทดลองบน iPhone ฟรีชั่วคราว (PWA)','Temporary free iPhone test (PWA)')}</summary><p className="mt-2">{tr('เปิดโปรแกรมเดิมใน Safari กดแชร์ → เพิ่มไปยังหน้าจอโฮม วิธีนี้ยังเป็นเว็บแอป ไม่ใช่ IPA และยังไม่จำกัดการเข้าผ่านเบราว์เซอร์','Open the existing workspace in Safari, then Share → Add to Home Screen. This is a web app, not an IPA, and does not restrict browser access.')}</p></details>
      </div>
      <button type="button" className={buttonStyle} disabled={!!busy} onClick={()=>setAttempt(n=>n+1)}>{tr('ตรวจไฟล์ล่าสุด','Refresh files')}</button>
    </section>
    {hasWindowsProofBridge()&&<section className="mt-4 border-t pt-4 text-sm space-y-2">
      <h3 className="font-bold">{tr('ทดสอบยืนยันกุญแจเครื่อง Windows','Windows device key pilot')}</h3>
      <p className="text-xs">{tr('ทดสอบเฉพาะ Admin ไม่ได้บังคับสิทธิ์ผู้ซื้อหรือยืนยันว่าโปรแกรมไม่ถูกดัดแปลง','Admin test only. Does not enforce buyer device access or attest an unmodified app.')}</p>
      <button type="button" className={buttonStyle} disabled={proofBusy} onClick={()=>void testDevice()}>{proofBusy?tr('กำลังตรวจ…','Verifying…'):tr('ทดสอบยืนยันเครื่อง','Test device proof')}</button>
      {proof&&<p role="status" className="break-all">{tr('เซิร์ฟเวอร์ยืนยันลายเซ็นแล้ว','Server verified signature')} · {proof.slice(0,16)}</p>}
      {proofError&&<p role="alert">{tr('ยืนยันไม่สำเร็จ ตรวจว่าใช้ MSI รุ่นล่าสุดและลองใหม่','Verification failed. Check that you installed the latest MSI and retry.')}</p>}
    </section>}
    {ready&&<div className="mt-3 rounded-lg border p-3 text-sm space-y-2"><p className="font-semibold break-all">{ready.name}</p><p>{ready.size<1048576? (ready.size/1024).toFixed(1)+' KiB':(ready.size/1048576).toFixed(2)+' MiB'}</p>{integrity&&<div className="rounded border border-green-500/50 p-2 text-xs"><p className="font-semibold">{tr('SHA-256 ตรงกับไฟล์ที่ Build','SHA-256 matches CI build')}</p><p className="break-all font-mono">{integrity.sha256}</p><p>Commit: {integrity.commit.slice(0,12)}</p><p>{tr('ตรวจความถูกต้องของไฟล์เท่านั้น ไม่ใช่ลายเซ็นดิจิทัล','File integrity only, not a digital signature')}</p></div>}<div className="flex flex-wrap gap-2"><button type="button" className={buttonStyle} onClick={saveReady}>{tr('บันทึกลงเครื่อง','Save file')}</button>{!ready.name.includes('-TEST.')&&<button type="button" className={buttonStyle} onClick={()=>void shareReady()}>{tr('แชร์ไฟล์จากมือถือ','Share file')}</button>}</div>{shareError&&<p role="status">{tr('เครื่องนี้แชร์ไฟล์โดยตรงไม่ได้ ให้บันทึกลงเครื่องแล้วแนบไฟล์ใน LINE หรือแอปส่งไฟล์เอง','Direct file sharing is unavailable on this device. Save the file and attach it manually in your messaging app.')}</p>}</div>}
    {integrityError&&<p role="alert" className="mt-3 text-sm text-red-700">{tr('ไฟล์ยังไม่มีข้อมูลยืนยันจาก Build หรือค่า SHA-256 ไม่ตรง ระบบไม่อนุญาตให้บันทึก กรุณาตรวจไฟล์ล่าสุด','Missing build verification or mismatched SHA-256. Saving is blocked. Refresh files.')}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{tr('ดำเนินการไม่สำเร็จ กรุณาตรวจการเชื่อมต่อและสิทธิ์บัญชีแล้วลองอีกครั้ง','Could not complete the request. Check your connection and account access, then try again.')}</p>}
    <button type="button" autoFocus className={buttonStyle+' mt-5 min-h-11 w-full cursor-pointer'} onClick={event=>{event.stopPropagation();dismiss();}}>{tr('ปิด','Close')}</button>
  </dialog>;
}
