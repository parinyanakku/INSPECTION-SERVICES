import { configureReportFrame, reportDocument, waitForReportFonts } from './reportLayout';
import type ExcelJS from 'exceljs';

type Page={id:string;html:string;orientation?:'portrait'|'landscape'};
const GRID=10; // 10 CSS px / 7.5 pt per grid row
const sectionNames=[
 ['page-cover','หน้าปก','Cover'],['page-toc','สารบัญ','Contents'],
 ['page-sec1','บทนำ','Introduction'],['page-sec2','การดำเนินการ','Operations'],
 ['page-sec3','รายการ Defect','Defect Report'],['page-sec4','สรุปและข้อเสนอแนะ','Summary'],
];
function color(value:string):string|undefined{
 if(!value||value==='transparent')return;
 const m=value.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/);
 if(m){if(m[4]!==undefined&&Number(m[4])===0)return;return 'FF'+m.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join('').toUpperCase();}
 if(/^#[0-9a-f]{6}$/i.test(value))return 'FF'+value.slice(1).toUpperCase();
}
function colName(n:number){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
function groupKey(page:Page){return sectionNames.find(([id])=>page.id===id||page.id.startsWith(id+'-'))?.[0]||page.id;}
function getImageData(img:HTMLImageElement):{base64:string;extension:'png'|'jpeg'}{
 const raw=img.getAttribute('src')||'';
 if(/^data:image\/png;base64,/i.test(raw))return {base64:raw,extension:'png'};
 if(/^data:image\/jpeg;base64,/i.test(raw)){
   try{if(!atob(raw.split(',')[1].slice(0,88000)).includes('Exif\x00\x00'))return {base64:raw,extension:'jpeg'};}catch{}
 }
 if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>24000000)throw Error('Report image cannot be converted');
 const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
 try{const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image conversion unavailable');ctx.drawImage(img,0,0);return {base64:canvas.toDataURL('image/png'),extension:'png'};}
 finally{canvas.width=0;canvas.height=0;}
}
export async function appendPrintableExcelReport(workbook:ExcelJS.Workbook,pages:Page[],lang:'th'|'en',signal?:AbortSignal){
 signal?.throwIfAborted();
 if(!pages.length)throw Error('No report pages');
 const iframe=document.createElement('iframe');
 configureReportFrame(iframe);
 document.body.appendChild(iframe);
 try{
 const doc=iframe.contentDocument,win=iframe.contentWindow;if(!doc||!win)throw Error('Report layout unavailable');
 doc.open();doc.write(reportDocument(''));doc.close();
 await waitForReportFonts(doc);
 const groups=new Map<string,{sheet:ExcelJS.Worksheet;count:number;cols:number;rows:number}>();
 const imageIds=new Map<string,number>();
 const pageCounts=new Map<string,number>();
 for(const page of pages){const key=groupKey(page);pageCounts.set(key,(pageCounts.get(key)||0)+1);}
 for(let pi=0;pi<pages.length;pi++){
 signal?.throwIfAborted();
 const page=pages[pi],landscape=page.orientation==='landscape';
 doc.body.innerHTML=page.html;
 const root=doc.querySelector<HTMLElement>('.report-page');
 if(!root)throw Error('Missing Excel report page '+(pi+1));
 for(const img of Array.from(root.querySelectorAll('img'))){
   try{await img.decode();}catch{if(!img.complete||!img.naturalWidth)throw Error('Report image failed to load on page '+(pi+1));}
 }
 const W=landscape?1123:794,H=landscape?794:1123;
 const cols=Math.ceil(W/GRID),rows=Math.ceil(H/GRID);
 const key=groupKey(page);
 let group=groups.get(key);
 if(!group){
   const names=sectionNames.find(n=>n[0]===key);
   const name=(names?.[lang==='en'?2:1]||'Report').slice(0,31);
   const singlePage=pageCounts.get(key)===1;
   // Excel's printer font metrics can make the real grid wider than the CSS
   // grid. Fit single-page sections on both axes. For multipage sections,
   // retain manual horizontal breaks (Excel may ignore them in fit-to-page
   // mode) and leave a conservative margin for printer/Normal font variation.
   const sheet=workbook.addWorksheet(name,{
    views:[{state:'normal',style:'pageBreakPreview',showGridLines:false,zoomScale:75,zoomScaleNormal:100}],
    pageSetup:{
      paperSize:9,orientation:landscape?'landscape':'portrait',
      ...(singlePage?{fitToPage:true,fitToWidth:1,fitToHeight:1}:{fitToPage:false,scale:78}),
      horizontalCentered:true,verticalCentered:singlePage,
      margins:{left:0.25,right:0.25,top:0.25,bottom:0.25,header:0,footer:0},pageOrder:'downThenOver'
    },
   });
   // OOXML column width is measured in maximum digit widths, not CSS pixels.
   // Calibri 11 (Excel's default) has a 7px digit; 1.43 units is ~10px.
   for(let c=1;c<=cols;c++)sheet.getColumn(c).width=1.43;
   sheet.properties.defaultRowHeight=7.5;
   group={sheet,count:0,cols,rows};groups.set(key,group);
 }
 const ws=group.sheet,offset=group.count*rows;group.count++;
 const origin=root.getBoundingClientRect();
 for(let r=1;r<=rows;r++)ws.getRow(offset+r).height=7.5;
 type Rect={r1:number;c1:number;r2:number;c2:number};
 function bounds(el:Element):Rect|null{
   const r=el.getBoundingClientRect();
   if(r.width<=0||r.height<=0)return null;
   const c1=Math.max(1,Math.min(cols,Math.round((r.left-origin.left)/GRID)+1));
   const c2=Math.max(c1,Math.min(cols,Math.round((r.right-origin.left)/GRID)));
   const r1=Math.max(1,Math.min(rows,Math.round((r.top-origin.top)/GRID)+1));
   const r2=Math.max(r1,Math.min(rows,Math.round((r.bottom-origin.top)/GRID)));
   return {r1:offset+r1,r2:offset+r2,c1,c2};
 }
 function decorate(el:HTMLElement,b:Rect){
   const st=win!.getComputedStyle(el),fill=color(st.backgroundColor);
   const sides=['top','bottom','left','right'] as const;
   const edges=sides.filter(side=>parseFloat(st.getPropertyValue('border-'+side+'-width'))>0&&st.getPropertyValue('border-'+side+'-style')!=='none');
   if(fill&&(fill!=='FFFFFFFF'||!!el.closest('table[data-report-status]'))){
     for(let r=b.r1;r<=b.r2;r++)for(let c=b.c1;c<=b.c2;c++)ws.getCell(r,c).fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
   }
   for(const side of edges){
    const argb=color(st.getPropertyValue('border-'+side+'-color'))||'FFCBD5E1';
    const paint=(r:number,c:number)=>{const cell=ws.getCell(r,c);cell.border={...cell.border,[side]:{style:parseFloat(st.getPropertyValue('border-'+side+'-width'))>=2?'medium':'thin',color:{argb}}};};
    if(side==='top'||side==='bottom')for(let c=b.c1;c<=b.c2;c++)paint(side==='top'?b.r1:b.r2,c);
    else for(let r=b.r1;r<=b.r2;r++)paint(r,side==='left'?b.c1:b.c2);
   }
 }
 // Paint outer panels and cell boundaries before merging the editable text.
 for(const el of Array.from(root.querySelectorAll<HTMLElement>('div,table,td,th,h1,h2,h3,span'))){
   if(key==='page-cover'&&el!==root.firstElementChild)continue;
   const b=bounds(el);if(b)decorate(el,b);
 }
 const occupied=new Set<string>();
 function writeText(el:HTMLElement,b:Rect,content:string){
   const st=win!.getComputedStyle(el);
   if(!content.trim())return;
   // Adjacent layout boxes can round to the same grid line. Keep them disjoint.
   let r1=b.r1,r2=b.r2,c1=b.c1,c2=b.c2;
   const free=(r:number,c:number)=>!occupied.has(r+':'+c);
   const allFree=()=>{for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++)if(!free(r,c))return false;return true;};
   while(!allFree()&&r1<r2)r1++;
   while(!allFree()&&c1<c2)c1++;
   if(!allFree()){
     // Preserve content rather than silently dropping text in a tiny rounded box.
     const old=ws.getCell(b.r1,b.c1);const cell=old.isMerged?old.master:old;
     cell.value=[String(cell.value??''),content].filter(Boolean).join('\n');cell.alignment={...cell.alignment,wrapText:true};return;
   }
   const edge=(r:number,c:number)=>ws.getCell(r,c).border||{};
   const border={top:edge(r1,c1).top,bottom:edge(r2,c1).bottom,left:edge(r1,c1).left,right:edge(r1,c2).right};
   if(r1!==r2||c1!==c2)ws.mergeCells(r1,c1,r2,c2);
   for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++)occupied.add(r+':'+c);
   const cell=ws.getCell(r1,c1);cell.value=content;
   const desired=Math.max(9,Math.min(26,Math.round(parseFloat(st.fontSize)*0.75)));
   const size=Math.max(8,Math.min(desired,Math.floor((r2-r1+1)*7.5/1.15)));
   // Use a bounded font for short merged boxes; Excel cannot autofit merged rows.
   const bold=Number(st.fontWeight)>=600||st.fontWeight==='bold';
   cell.font={name:'TH Sarabun New',size,bold,color:{argb:color(st.color)||'FF0F172A'}};
   const align=st.textAlign==='center'?'center':st.textAlign==='right'?'right':'left';
   cell.alignment={horizontal:align,vertical:st.verticalAlign==='top'?'top':'middle',wrapText:true,shrinkToFit:false,indent:0};
   cell.border=border;
 }
 function visit(el:HTMLElement){
   const tag=el.tagName;if(tag==='IMG'||tag==='COLGROUP'||tag==='COL'||tag==='BR')return;
   const children=Array.from(el.children) as HTMLElement[];
   const hasImage=!!el.querySelector('img'),hasTable=!!el.querySelector('table');
   const isCell=tag==='TD'||tag==='TH';
   const blockChild=children.some(ch=>/^(DIV|P|H[1-6]|TABLE|SECTION|UL|OL|LI|THEAD|TBODY|TR|TD|TH)$/.test(ch.tagName));
   if(!hasImage&&!hasTable&&(isCell||!blockChild)){
     const content=el.innerText?.trim();const b=bounds(el);
     if(content&&b){writeText(el,b,content);return;}
   }
   for(const child of children)visit(child);
 }
 function putImage(img:HTMLImageElement,left:number,top:number,right:number,bottom:number){
   if(!img.naturalWidth||!img.naturalHeight)throw Error('Missing report photo');
   // Use integer two-cell anchors. This prevents images escaping the cell box
   // when Excel uses a slightly different digit width on another machine.
   const c0=Math.max(0,Math.ceil(left/GRID)),c1=Math.min(cols,Math.floor(right/GRID));
   const r0=Math.max(0,Math.ceil(top/GRID)),r1=Math.min(rows,Math.floor(bottom/GRID));
   if(c1<=c0||r1<=r0)return;
   const ratio=Math.min((c1-c0)*GRID/img.naturalWidth,(r1-r0)*GRID/img.naturalHeight);
   const cw=Math.max(1,Math.min(c1-c0,Math.floor(img.naturalWidth*ratio/GRID)));
   const rh=Math.max(1,Math.min(r1-r0,Math.floor(img.naturalHeight*ratio/GRID)));
   const c=c0+Math.floor((c1-c0-cw)/2),r=r0+Math.floor((r1-r0-rh)/2);
   const raw=img.getAttribute('src')||'';
   let id=imageIds.get(raw);if(id===undefined){id=workbook.addImage(getImageData(img));imageIds.set(raw,id);}
   ws.addImage(id,{tl:{col:c,row:offset+r},br:{col:c+cw,row:offset+r+rh},editAs:'twoCell'});
 }
 if(key==='page-cover'){
   // Cover is a dedicated editable layout: do not infer its text rows from
   // the flexible HTML cover, which may collapse in Excel.
   const cover=root.firstElementChild as HTMLElement;
   const [header,main,footer]=Array.from(cover.children) as HTMLElement[];
   const logo=header.querySelector('img');
   const headerText=Array.from(header.children).filter(el=>!el.querySelector('img')) as HTMLElement[];
   const mainText=Array.from(main.children).filter(el=>!el.querySelector('img')&&el.tagName!=='TABLE') as HTMLElement[];
   const photo=main.querySelector('img');
   const footText=Array.from(footer.children) as HTMLElement[];
   const textAt=(el:HTMLElement|undefined,from:number,to:number,c1=8,c2=cols-7)=>{
     if(el&&el.innerText.trim())writeText(el,{r1:offset+from,r2:offset+to,c1,c2},el.innerText.trim());
   };
   if(logo)putImage(logo,340,60,460,170);
   textAt(headerText[0],19,24);
   textAt(headerText[1],25,28);
   textAt(headerText[2],29,32);
   if(photo)putImage(photo,145,365,650,660);
   const titleRow=photo?68:51;
   textAt(mainText[0],titleRow,titleRow+5);
   textAt(mainText[1],titleRow+6,titleRow+9,23,cols-22);
   const table=main.querySelector('table');
   if(table){
     let rr=titleRow+12;
     Array.from(table.rows).forEach((tr,index)=>{
       const lines=Array.from(tr.cells).reduce((n,c)=>Math.max(n,c.innerText.trim().split(/\n/).length),1);
       const extra=index===1?Math.min(7,Math.max(0,lines-1)*2):0;
       const height=5+extra;
       Array.from(tr.cells).forEach((cell,i)=>{
         const b={r1:offset+rr,r2:offset+rr+height-1,c1:i===0?8:30,c2:i===0?29:cols-7};
         decorate(cell,b);writeText(cell,b,cell.innerText.trim());
       });
       rr+=height;
     });
   }
   textAt(footText[0],103,106);
   textAt(footText[1],107,110);
 }else{
 for(const ch of Array.from(root.children))visit(ch as HTMLElement);
 for(const img of Array.from(root.querySelectorAll<HTMLImageElement>('img'))){
   if(!img.naturalWidth||!img.naturalHeight)throw Error('Missing report photo');
   const r=img.getBoundingClientRect();
   let left=Math.max(0,r.left-origin.left),top=Math.max(0,r.top-origin.top),right=Math.min(W,r.right-origin.left),bottom=Math.min(H,r.bottom-origin.top);
   const cell=img.closest('td,th');
   if(cell){const b=cell.getBoundingClientRect();left=Math.max(left,b.left-origin.left+3);right=Math.min(right,b.right-origin.left-3);top=Math.max(top,b.top-origin.top+3);bottom=Math.min(bottom,b.bottom-origin.top-3);}
   putImage(img,left,top,right,bottom);
 }
 }

 // Explicit break at the end of each report page in the same section.
 if(pi+1<pages.length&&groupKey(pages[pi+1])===key)ws.getRow(offset+rows).addPageBreak(0,cols-1);
 ws.pageSetup.printArea='A1:'+colName(cols)+(offset+rows);
 doc.body.replaceChildren();
 if(pi%2===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 }finally{iframe.remove();}
}
