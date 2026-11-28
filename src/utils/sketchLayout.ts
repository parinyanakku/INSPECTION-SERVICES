import type {FloorZone,FloorElement,FloorElementType} from '../types/inspection';
export type SketchLayout={zones:FloorZone[];elements:FloorElement[]};
const allowed:FloorElementType[]=['wall','door','window','stairs','entrance'];
const makeId=()=>Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
// Coordinates always refer to the entire padded reference. Never clamp an
// out-of-range origin to the bottom-right corner.
export function parseSketchLayout(raw:string,en:boolean,newId=makeId):SketchLayout{
 const obj=JSON.parse(raw.replace(/^\s*\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60\s*$/,''));
 if(!obj||!Array.isArray(obj.rooms)||!Array.isArray(obj.elements)||!obj.rooms.length||obj.rooms.length>80||obj.elements.length>240)throw Error('INVALID_SKETCH_GEOMETRY');
 const scales=obj.coordinateSpace==='normalized_1000'?[1000,1000]:obj.coordinateSpace==='normalized_100'?[100,100]:obj.coordinateSpace==='pixels_1600x1200'?[1600,1200]:null;
 if(!scales)throw Error('INVALID_SKETCH_COORDINATES');
 const [sx,sy]=scales;
 function rect(q:any,room:boolean){
  if(!q||![q.x,q.y,q.w,q.h].every(n=>typeof n==='number'&&Number.isFinite(n)))throw Error('INVALID_SKETCH_GEOMETRY');
  const {x,y,w,h}=q;
  if(x<0||y<0||w<=0||h<=0||x+w>sx+1e-6||y+h>sy+1e-6)throw Error('INVALID_SKETCH_COORDINATES');
  const r={x:x/sx*100,y:y/sy*100,w:w/sx*100,h:h/sy*100};
  if(room&&(r.w<1||r.h<1||r.w*r.h<4))throw Error('INVALID_SKETCH_GEOMETRY');
  if(!room&&(r.w<.05||r.h<.05))throw Error('INVALID_SKETCH_GEOMETRY');
  return r;
 }
 const zones:FloorZone[]=[],elements:FloorElement[]=[];
 const names=new Set<string>();
 for(const item of obj.rooms){
  const r=rect(item,true);
  if(zones.some(z=>{const iw=Math.max(0,Math.min(z.x+z.w,r.x+r.w)-Math.max(z.x,r.x)),ih=Math.max(0,Math.min(z.y+z.h,r.y+r.h)-Math.max(z.y,r.y));const a=iw*ih;return a/(z.w*z.h+r.w*r.h-a)>.85;}))throw Error('INVALID_SKETCH_GEOMETRY');
  const name=typeof item.name==='string'&&item.name.trim()?item.name.trim().slice(0,70):(en?'Zone ':'โซน ')+(zones.length+1);
  let unique=name,n=2;while(names.has(unique))unique=name+' '+n++;
  names.add(unique);zones.push({...r,id:'z_'+newId(),name:unique,bg:'#dbeafe',border:'#2563eb'});
 }
 for(const item of obj.elements){
  if(!item||!allowed.includes(item.type))throw Error('INVALID_SKETCH_GEOMETRY');
  const r=rect(item,false);
  const rotation:FloorElement['rotation']=item.rotation===90?90:item.rotation===180?180:item.rotation===270?270:0;
  elements.push({...r,id:'el_'+newId(),type:item.type,rotation,...(item.type==='entrance'?{label:en?'Entrance':'ทางเข้า'}:{})});
 }
 if(Math.max(...zones.map(z=>z.x+z.w))-Math.min(...zones.map(z=>z.x))<3||Math.max(...zones.map(z=>z.y+z.h))-Math.min(...zones.map(z=>z.y))<3)throw Error('INVALID_SKETCH_GEOMETRY');
 return {zones,elements};
}
