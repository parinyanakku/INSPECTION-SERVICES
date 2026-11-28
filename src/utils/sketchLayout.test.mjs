import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSketchLayout} from './sketchLayout.ts';
import {customFloorSvg} from './customFloorSvg.ts';
const layout=(space,rooms,elements=[])=>JSON.stringify({coordinateSpace:space,rooms,elements});
const room=(x,y,w,h,name='ห้องนอน')=>({x,y,w,h,name});
test('1000-unit trace retains reference positions and native room zones with no openings',()=>{
 const d=parseSketchLayout(layout('normalized_1000',[room(260,150,150,200),room(410,150,170,200),room(260,350,320,220,'โถง')]),false);
 assert.deepEqual(d.zones.map(({x,y,w,h})=>[x,y,w,h]),[[26,15,15,20],[41,15,17,20],[26,35,32,22]]);
 assert.equal(d.elements.length,0);assert.equal(d.zones[1].name,'ห้องนอน 2');
 const svg=customFloorSvg({id:'f',name:'Floor',imageUrl:null,svgPreset:0,zones:d.zones,elements:d.elements});
 assert.match(svg,/<rect x="208" y="90" width="120" height="120"[^>]*stroke="#334155"/);assert.match(svg,/ห้องนอน/);assert.match(svg,/โถง/);
});
test('declared pixel and percent coordinates map to the same reference',()=>{
 const a=parseSketchLayout(layout('pixels_1600x1200',[room(400,240,480,360)],[{type:'wall',x:400,y:240,w:480,h:6,rotation:0}]),true);
 const b=parseSketchLayout(layout('normalized_100',[room(25,20,30,30)],[{type:'wall',x:25,y:20,w:30,h:.5,rotation:0}]),true);
 for(const key of ['zones','elements'])assert.deepEqual(a[key].map(({id,...rest})=>rest),b[key].map(({id,...rest})=>rest));
});
test('wrong units, duplicates, empty, tiny and invalid boxes are rejected',()=>{
 for(const raw of [JSON.stringify({rooms:[room(260,150,150,200)],elements:[]}),layout('normalized_100',[room(260,150,150,200)]),layout('normalized_1000',[room(995,995,5,5)]),layout('normalized_1000',[room(100,100,200,200),room(101,101,200,200)]),layout('normalized_1000',[]),layout('normalized_1000',[room('10',100,200,200)]),layout('normalized_1000',[room(900,100,200,200)])])assert.throws(()=>parseSketchLayout(raw,false),/INVALID_SKETCH/);
});
test('eleven rooms retain distinct bounds rather than collapsing into the corner',()=>{
 const rooms=Array.from({length:11},(_,i)=>room(180+(i%3)*140,140+Math.floor(i/3)*160,140,160,'Zone '+(i+1)));
 const d=parseSketchLayout(layout('normalized_1000',rooms),true);
 assert.equal(d.zones.length,11);assert.equal(new Set(d.zones.map(z=>z.x+','+z.y)).size,11);assert.ok(d.zones.every(z=>z.w>=14&&z.h>=16&&z.x+z.w<=100&&z.y+z.h<=100));
});
