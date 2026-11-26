import React, { useRef, useState } from 'react';
import type { AppLanguage, FloorElement, FloorElementType, FloorPlan, FloorZone } from '../types/inspection';
import { customFloorDataUrl } from '../utils/customFloorSvg';

type Tool = 'select' | 'room' | FloorElementType;
type Rect = { x:number; y:number; w:number; h:number };
type Point = {x:number;y:number};
type Selection = {kind:'room'|'element';id:string};
type Drag = { start:Point; pointer:number; target?:Selection; original?:Rect };
const snap = (v:number) => Math.round(Math.max(0,Math.min(100,v))/2.5)*2.5;
const bound = (v:number, max:number) => Math.max(0,Math.min(max,v));
const id = () => Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
const inside = (r:Rect,p:Point) => p.x>=r.x && p.x<=r.x+r.w && p.y>=r.y && p.y<=r.y+r.h;
const tools: {id:Tool;th:string;en:string}[] = [
 {id:'select',th:'เลือก / ย้าย',en:'Select / move'}, {id:'room',th:'ห้อง / โซน',en:'Room / zone'},
 {id:'wall',th:'ผนัง',en:'Wall'}, {id:'door',th:'ประตู',en:'Door'},
 {id:'window',th:'หน้าต่าง',en:'Window'}, {id:'stairs',th:'บันได',en:'Stairs'},
 {id:'entrance',th:'ทางเข้า',en:'Entrance'},
];

function drawRect(a:Point,b:Point,tool:Tool):Rect {
  let x=Math.min(a.x,b.x), y=Math.min(a.y,b.y), w=Math.abs(a.x-b.x), h=Math.abs(a.y-b.y);
  if(w<2.5 && h<2.5){
    const defaults:Record<string,[number,number]>={room:[25,25],wall:[25,2.5],door:[10,10],window:[15,2.5],stairs:[17.5,15],entrance:[25,5]};
    [w,h]=defaults[tool]||[10,10];
  } else if(tool==='wall'||tool==='window') {
    if(w>=h){h=2.5;y=a.y;}else{w=2.5;x=a.x;}
  } else { w=Math.max(5,w); h=Math.max(5,h); }
  return {x:bound(x,100-w),y:bound(y,100-h),w,h};
}

export const CustomFloorEditor: React.FC<{
 floor:FloorPlan;lang:AppLanguage;onChange:(floor:FloorPlan)=>void;onDone:()=>void;
}> = ({floor,lang,onChange,onDone}) => {
 const en=lang==='en', tr=(th:string,eng:string)=>en?eng:th;
 const [tool,setTool]=useState<Tool>('room');
 const [selected,setSelected]=useState<Selection|null>(null);
 const [preview,setPreview]=useState<Rect|null>(null);
 const drag=useRef<Drag|null>(null);
 const stage=useRef<HTMLDivElement>(null);
 const zones=floor.zones||[], elements=floor.elements||[];
 const chosen=selected?.kind==='room'?zones.find(z=>z.id===selected.id):elements.find(e=>e.id===selected?.id);
 const point=(e:React.PointerEvent):Point=>{
   const r=stage.current!.getBoundingClientRect();
   return {x:snap((e.clientX-r.left)/r.width*100),y:snap((e.clientY-r.top)/r.height*100)};
 };
 const changeRect=(target:Selection,rect:Rect)=>{
   onChange(target.kind==='room'?{...floor,zones:zones.map(z=>z.id===target.id?{...z,...rect}:z)}:{...floor,elements:elements.map(el=>el.id===target.id?{...el,...rect}:el)});
 };
 const down=(e:React.PointerEvent<HTMLDivElement>)=>{
   if(e.button!==0 || drag.current) return;
   e.preventDefault();
   const p=point(e);
   if(tool==='select'){
     const el=[...elements].reverse().find(r=>inside(r,p));
     const room=[...zones].reverse().find(r=>inside(r,p));
     const target:Selection|null=el?{kind:'element',id:el.id}:room?{kind:'room',id:room.id}:null;
     setSelected(target);
     if(!target)return;
     drag.current={start:p,pointer:e.pointerId,target,original:el||room};
   }else{
     setSelected(null);drag.current={start:p,pointer:e.pointerId};
     setPreview(drawRect(p,p,tool));
   }
   e.currentTarget.setPointerCapture(e.pointerId);
 };
 const rectAt=(d:Drag,p:Point):Rect=>d.original?{...d.original,x:bound(d.original.x+p.x-d.start.x,100-d.original.w),y:bound(d.original.y+p.y-d.start.y,100-d.original.h)}:drawRect(d.start,p,tool);
 const move=(e:React.PointerEvent<HTMLDivElement>)=>{
   if(drag.current?.pointer!==e.pointerId)return;
   setPreview(rectAt(drag.current,point(e)));
 };
 const cancel=()=>{drag.current=null;setPreview(null);};
 const up=(e:React.PointerEvent<HTMLDivElement>)=>{
   const d=drag.current;if(!d||d.pointer!==e.pointerId)return;
   const rect=rectAt(d,point(e));cancel();
   if(d.target){changeRect(d.target,rect);return;}
   if(tool==='select')return;
   const key=id();
   if(tool==='room'){
     const z:FloorZone={id:'z_'+key,name:tr('ห้อง '+(zones.length+1),'Room '+(zones.length+1)),...rect,bg:'#dbeafe',border:'#2563eb'};
     onChange({...floor,zones:[...zones,z]});setSelected({kind:'room',id:z.id});
   }else{
     const el:FloorElement={id:'el_'+key,type:tool,...rect,rotation:0,...(tool==='entrance'?{label:tr('ทางเข้า','Entrance')}:{})};
     onChange({...floor,elements:[...elements,el]});setSelected({kind:'element',id:el.id});
   }
 };
 const remove=()=>{
   if(!selected)return;
   if(selected.kind==='room'){
     if(!window.confirm(tr('ลบห้อง / โซนนี้หรือไม่? หมุด Defect เดิมจะไม่ถูกลบ','Delete this room/zone? Existing defect pins will not be deleted.')))return;
     onChange({...floor,zones:zones.filter(z=>z.id!==selected.id)});
   }else onChange({...floor,elements:elements.filter(el=>el.id!==selected.id)});
   setSelected(null);
 };
 const resize=(delta:number)=>{
   if(!selected||!chosen)return;
   const w=bound(chosen.w+delta,100-chosen.x),h=bound(chosen.h+delta,100-chosen.y);
   if(w<2.5||h<2.5)return;changeRect(selected,{...chosen,w,h});
 };
 const rotate=()=>{
   if(!selected||selected.kind!=='element'||!chosen)return;
   // Swap physical width and height when rotating, keeping hit boxes aligned.
   const el=elements.find(e=>e.id===selected.id);if(!el)return;
   const w=Math.min(100,el.h*.75),h=Math.min(100,el.w/ .75);
   onChange({...floor,elements:elements.map(e=>e.id===el.id?{...e,x:bound(e.x,100-w),y:bound(e.y,100-h),w,h,rotation:0}:e)});
 };
 const box=preview||chosen;
 const button='rounded-lg px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40';
 return <div className="space-y-3">
   <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
    <div className="flex items-center justify-between gap-2 mb-2">
     <strong className="text-sm text-blue-900">{tr('สร้างผังแปลนเอง','Draw your floor plan')}</strong>
     <button type="button" className="rounded-lg bg-blue-700 text-white px-3 py-2 text-xs font-bold" onClick={onDone}>{tr('เสร็จ / บันทึก','Done / save')}</button>
    </div>
    <div className="flex flex-wrap gap-1.5">{tools.map(t=><button key={t.id} type="button" aria-pressed={tool===t.id} onClick={()=>{setTool(t.id);setSelected(null);cancel();}} className={button+(tool===t.id?' !bg-blue-700 !text-white !border-blue-700':'')}>{en?t.en:t.th}</button>)}</div>
    <p className="text-xs text-slate-600 mt-2">{tr('เลือกเครื่องมือแล้วลากบนตาราง หรือแตะเพื่อเพิ่มขนาดมาตรฐาน • เลือก / ย้ายเพื่อปรับตำแหน่ง • บันทึกอัตโนมัติ','Choose a tool and drag on the grid, or tap for a preset size. Select / move to reposition. Changes save automatically.')}</p>
    {chosen&&selected&&<div className="flex flex-wrap items-center gap-2 mt-2">
      {selected.kind==='room'&&<input aria-label={tr('ชื่อห้อง','Room name')} className="min-w-0 w-40 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs" value={(chosen as FloorZone).name} onChange={e=>onChange({...floor,zones:zones.map(z=>z.id===selected.id?{...z,name:e.target.value}:z)})}/>}
      <button type="button" className={button} onClick={()=>resize(2.5)}>{tr('ขยาย','Enlarge')}</button>
      <button type="button" className={button} onClick={()=>resize(-2.5)}>{tr('ย่อ','Shrink')}</button>
      {selected.kind==='element'&&['wall','window','stairs'].includes((chosen as FloorElement).type)&&<button type="button" className={button} onClick={rotate}>{tr('สลับแนว','Change orientation')}</button>}
      <button type="button" className={button+' !text-rose-700'} onClick={remove}>{tr('ลบที่เลือก','Delete selected')}</button>
    </div>}
   </div>
   <div ref={stage} className="relative w-full aspect-[4/3] rounded-xl border border-slate-300 overflow-hidden select-none bg-slate-50" style={{touchAction:'none',cursor:tool==='select'?'move':'crosshair'}}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}>
     <img alt={tr('ผังแปลนที่สร้างเอง','Custom floor plan')} className="absolute inset-0 w-full h-full pointer-events-none" draggable={false} src={customFloorDataUrl(floor)}/>
     {box&&<div className="absolute border-2 border-dashed border-blue-600 bg-blue-400/10 pointer-events-none" style={{left:box.x+'%',top:box.y+'%',width:box.w+'%',height:box.h+'%'}}/>}
   </div>
 </div>;
};
