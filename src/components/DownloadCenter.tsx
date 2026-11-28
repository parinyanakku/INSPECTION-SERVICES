import {useEffect, useRef, useState} from 'react';
import {appRoot, canPrompt, installApp} from '../utils/installApp';
import type {AppLanguage} from '../types/inspection';

const packages = ['ProElite-Inspection.msi', 'ProElite-Inspection.apk'] as const;
const buttonStyle = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50';
type Props = {lang:AppLanguage; api:string; publicKey:string; token:string; onClose:()=>void};

export function DownloadCenter({lang, api, publicKey, token, onClose}: Props) {
  const tr = (th:string, en:string) => lang === 'en' ? en : th;
  const dialog = useRef<HTMLDialogElement>(null);
  const [available, setAvailable] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(false);
  const [prompt, setPrompt] = useState(canPrompt);
  const download = useRef<AbortController | null>(null);
  const storage = api + '/storage/v1/object/';
  const headers = {apikey: publicKey, Authorization: 'Bearer ' + token};
  useEffect(() => {
    dialog.current?.showModal();
    const change = () => setPrompt(canPrompt());
    window.addEventListener('proelite-install-change', change);
    return () => window.removeEventListener('proelite-install-change', change);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false); setAvailable(null); setBusy('');
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
  async function save(name:typeof packages[number]) {
    if (download.current) return;
    const controller = new AbortController();
    download.current = controller; setBusy(name); setError(false);
    try {
      const res = await fetch(storage + 'authenticated/proelite-installers/approved/' + name,
        {headers, cache:'no-store', signal:AbortSignal.any([controller.signal, AbortSignal.timeout(120000)])});
      if (!res.ok) throw Error();
      const file = await res.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = name;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (download.current === controller) { download.current = null; setBusy(''); } }
  }
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="downloads-title" className="m-auto max-h-[90dvh] w-[min(94vw,30rem)] overflow-auto rounded-2xl p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/60">
    <header className="flex items-center gap-3">
      <img width="48" height="48" className="rounded-xl" src={new URL('product-icons/home-192.png',appRoot).href} alt="" />
      <div><p className="text-xs font-semibold text-blue-800">ProElite Inspection</p><h2 id="downloads-title" className="text-xl font-bold">{tr('ติดตั้งและดาวน์โหลด','Install & download')}</h2></div>
    </header>
    <section className="my-5 space-y-2 text-sm">
      <h3 className="font-bold">{tr('ติดตั้งเว็บแอป','Install the web app')}</h3>
      <p>{tr('iPhone / iPad: เปิดใน Safari แตะแชร์ แล้วเลือกเพิ่มไปยังหน้าจอโฮม เปิดเป็นเว็บแอปหากมีตัวเลือก','iPhone / iPad: Open in Safari, tap Share, then Add to Home Screen. Enable Open as Web App if offered.')}</p>
      <p>{tr('Android / Windows: เปิดเมนู Chrome หรือ Edge แล้วเลือกติดตั้งแอป หรือเพิ่มไปยังหน้าจอหลัก','Android / Windows: Open the Chrome or Edge menu and choose Install app or Add to Home screen.')}</p>
      {prompt && <button type="button" className={buttonStyle} onClick={() => void installApp().catch(() => setError(true))}>{tr('ติดตั้ง ProElite','Install ProElite')}</button>}
      <p className="text-slate-600">{tr('เปิดแอปขณะออนไลน์เพื่อเข้าสู่ระบบ หากเปลี่ยนเครื่องหรือโปรไฟล์ ให้ซิงก์ Google Drive ด้วยบัญชีเดิม เลือกรุ่นใหม่ได้จากเมนูอัปเดต','Open the app online to sign in. When changing devices or browser profiles, sync Google Drive with the same accounts. Use the update menu to switch releases.')}</p>
    </section>
    <section className="space-y-2 border-t pt-4 text-sm"><h3 className="font-bold">{tr('ไฟล์ติดตั้งสำหรับผู้ซื้อ','Buyer installers')}</h3>
      {failed ? <p role="alert">{tr('โหลดรายการไม่ได้','Could not load packages.')} <button className={buttonStyle} onClick={() => setAttempt(n=>n+1)}>{tr('ลองอีกครั้ง','Retry')}</button></p>
      : packages.map((file,i) => <div key={file} className="flex items-center justify-between gap-2">
        <span>{i === 0 ? 'Windows · MSI' : 'Android · APK'}</span>
        {available?.includes(file) ? <button type="button" className={buttonStyle} disabled={!!busy} onClick={() => void save(file)}>{busy===file?tr('กำลังดาวน์โหลด…','Downloading…'):tr('ดาวน์โหลด','Download')}</button>
        : <span className="text-slate-600">{available ? tr('ยังไม่เปิดดาวน์โหลด','Not released yet') : tr('กำลังตรวจสอบ…','Checking…')}</span>}
      </div>)}
    </section>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{tr('ดำเนินการไม่สำเร็จ กรุณาตรวจการเชื่อมต่อและสิทธิ์บัญชีแล้วลองอีกครั้ง','Could not complete the request. Check your connection and account access, then try again.')}</p>}
    <button type="button" autoFocus className={buttonStyle+' mt-5'} onClick={onClose}>{tr('ปิด','Close')}</button>
  </dialog>;
}
