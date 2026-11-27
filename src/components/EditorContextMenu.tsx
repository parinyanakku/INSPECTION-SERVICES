import React,{useEffect,useRef,useState,useLayoutEffect} from 'react';
import {createPortal} from 'react-dom';

export type MenuPoint={x:number;y:number;target:Element|null};
export type MenuAction={label:string;run:()=>void;shortcut?:string;disabled?:boolean;danger?:boolean};

// Touch uses a stationary hold. Moving more than 4 CSS pixels cancels it,
// so a drawing stroke, pin drag or scroll is never committed as a menu action.
export function useEditorMenu(onOpen:(point:MenuPoint)=>void){
 const [point,setPoint]=useState<MenuPoint|null>(null);
 const callback=useRef(onOpen);callback.current=onOpen;
 const pending=useRef<{id:number;x:number;y:number;target:Element|null;timer:number}|null>(null);
 const consumed=useRef(false);
 const lastHold=useRef(0);
 const stop=()=>{if(pending.current){window.clearTimeout(pending.current.timer);pending.current=null;}};
 const show=(p:MenuPoint)=>{callback.current(p);setPoint(p);};
 useEffect(()=>{
   const move=(e:PointerEvent)=>{const p=pending.current;if(p&&e.pointerId===p.id&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>4)stop();};
   const end=(e:PointerEvent)=>{if(pending.current?.id===e.pointerId)stop();};
   const blur=()=>stop();
   window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',end,true);window.addEventListener('pointercancel',end,true);window.addEventListener('blur',blur);
   return()=>{stop();window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',end,true);window.removeEventListener('pointercancel',end,true);window.removeEventListener('blur',blur);};
 },[]);
 return {
   point,close:()=>setPoint(null),
   bind:{
     onPointerDownCapture:(e:React.PointerEvent<HTMLElement>)=>{
       stop();consumed.current=false;
       if(e.pointerType!=='touch'||!e.isPrimary||e.button!==0)return;
       const p={x:e.clientX,y:e.clientY,target:e.target instanceof Element?e.target:null};
       const id=e.pointerId;
       const timer=window.setTimeout(()=>{pending.current=null;consumed.current=true;lastHold.current=Date.now();show(p);},600);
       pending.current={...p,id,timer};
     },
     onContextMenu:(e:React.MouseEvent<HTMLElement>)=>{
       e.preventDefault();e.stopPropagation();stop();
       if(Date.now()-lastHold.current<1000)return;
       consumed.current=true;
       show({x:e.clientX,y:e.clientY,target:e.target instanceof Element?e.target:null});
     },
     onClickCapture:(e:React.MouseEvent<HTMLElement>)=>{
       if(consumed.current){consumed.current=false;e.preventDefault();e.stopPropagation();}
     },
   },
 };
}

export function EditorContextMenu({point,actions,onClose,closeLabel}:{point:MenuPoint|null;actions:MenuAction[];onClose:()=>void;closeLabel:string}){
 const menu=useRef<HTMLDivElement>(null);
 const prior=useRef<HTMLElement|null>(null);
 const close=useRef(onClose);close.current=onClose;
 useLayoutEffect(()=>{
   if(!point||!menu.current)return;
   const el=menu.current;
   prior.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
   el.style.left=Math.max(8,Math.min(point.x,window.innerWidth-el.offsetWidth-8))+'px';
   el.style.top=Math.max(8,Math.min(point.y,window.innerHeight-el.offsetHeight-8))+'px';
   el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
 },[point]);
 useEffect(()=>{
   if(!point)return;
   const outside=(e:PointerEvent)=>{if(!menu.current?.contains(e.target as Node))close.current();};
   const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close.current();prior.current?.focus({preventScroll:true});}};
   const dismiss=()=>close.current();
   window.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',escape,true);
   window.addEventListener('resize',dismiss);window.addEventListener('blur',dismiss);
   return()=>{window.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',escape,true);window.removeEventListener('resize',dismiss);window.removeEventListener('blur',dismiss);};
 },[point]);
 if(!point)return null;
 return createPortal(<div ref={menu} role="menu" aria-label={closeLabel} className="fixed z-[9997] w-64 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-2xl"
 style={{left:8,top:8,touchAction:'pan-y'}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onContextMenu={e=>{e.preventDefault();e.stopPropagation();}}
 onKeyDown={e=>{e.stopPropagation();if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);const i=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:e.key==='ArrowDown'?(i+1)%buttons.length:(i-1+buttons.length)%buttons.length;buttons[next]?.focus();}}>
 {actions.map((a,i)=><button key={i} role="menuitem" type="button" disabled={a.disabled} onClick={()=>{onClose();prior.current?.focus({preventScroll:true});a.run();}} className={'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold hover:bg-slate-100 focus:bg-slate-100 disabled:opacity-35 '+(a.danger?'text-rose-700':'text-slate-700')}><span>{a.label}</span>{a.shortcut&&<span className="text-[10px] font-normal text-slate-400 whitespace-nowrap">{a.shortcut}</span>}</button>)}
 <button role="menuitem" type="button" onClick={()=>{onClose();prior.current?.focus({preventScroll:true});}} className="mt-1 w-full border-t border-slate-200 px-3 py-2.5 text-left text-xs text-slate-500">{closeLabel} · Esc</button>
 </div>,document.body);
}
