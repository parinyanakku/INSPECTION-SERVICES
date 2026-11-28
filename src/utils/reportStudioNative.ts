import {keysInText,safeRaster,type Values} from './reportStudioModel';
export type Format='pdf'|'docx'|'xlsx';
export type NativeInfo={format:Format;keys:string[];pageCount:number};
export function formatOf(name:string):Format{const s=name.split('.').pop()?.toLowerCase();if(s==='pdf'||s==='docx'||s==='xlsx')return s;throw Error('UNSUPPORTED_FILE');}
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document',XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function openZip(file:Blob){const {default:JSZip}=await import('jszip');return JSZip.loadAsync(await file.arrayBuffer());}
function wordParts(zip:any):string[]{return Object.keys(zip.files).filter(k=>/^word\/(?:document|header\d*|footer\d*)\.xml$/.test(k));}
async function xmlDoc(zip:any,path:string):Promise<Document>{const entry=zip.file(path);if(!entry)throw Error('INVALID_TEMPLATE');if(entry._data?.uncompressedSize>16*1024*1024)throw Error('TEMPLATE_TOO_LARGE');const raw=await entry.async('string');if(raw.length>16*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(raw))throw Error('INVALID_TEMPLATE');const doc=new DOMParser().parseFromString(raw,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('INVALID_TEMPLATE');return doc;}
function wordParagraphs(doc:Document){return Array.from(doc.getElementsByTagNameNS(W,'p')).map(p=>Array.from(p.getElementsByTagNameNS(W,'t')).filter(n=>{let parent=n.parentElement;while(parent&&parent.localName!=='p')parent=parent.parentElement;return parent===p;}));}
function plain(s:string){return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/\r?\n/g,' ');}
export type TextEdit={find:string;replace:string};
export type PdfOverlay={page:number;x:number;y:number;w:number;h:number;value:string;type:'text'|'image'};
export function textEdits(text:string,values:Values,edits:TextEdit[]){
 const changes:{start:number;end:number;value:string}[]=[];
 for(const m of text.matchAll(/\{\{([^{}\r\n]{1,120})\}\}/gu)){const key=m[1].trim();if(Object.hasOwn(values,key))changes.push({start:m.index!,end:m.index!+m[0].length,value:plain(values[key])});}
 for(const e of edits){if(!e.find)continue;let pos=0;while((pos=text.indexOf(e.find,pos))!==-1){const end=pos+e.find.length;if(!changes.some(c=>pos<c.end&&end>c.start))changes.push({start:pos,end,value:plain(e.replace)});pos=end;}}
 return changes.sort((a,b)=>b.start-a.start);
}
function patchNodes(nodes:Element[],values:Values,edits:TextEdit[]){
 const texts=nodes.map(n=>n.textContent||''),original=texts.join('');
 const offsets=texts.map((_,i)=>texts.slice(0,i).reduce((n,t)=>n+t.length,0));
 const changes=textEdits(original,values,edits);
 for(const c of changes){
  const first=offsets.findIndex((o,i)=>o<=c.start&&c.start<o+texts[i].length);
  const last=offsets.findIndex((o,i)=>o<c.end&&c.end<=o+texts[i].length);
  if(first<0||last<0)continue;
  const a=c.start-offsets[first],b=c.end-offsets[last];
  if(first===last)texts[first]=texts[first].slice(0,a)+c.value+texts[first].slice(b);
  else{const suffix=texts[last].slice(b);texts[first]=texts[first].slice(0,a)+c.value;for(let i=first+1;i<last;i++)texts[i]='';texts[last]=suffix;}
 }
 if(changes.length)nodes.forEach((n,i)=>{n.textContent=texts[i];n.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');});
 return changes.length;
}

const REL='http://schemas.openxmlformats.org/package/2006/relationships',CT='http://schemas.openxmlformats.org/package/2006/content-types';
const IMAGE_REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
function imageMarker(text:string,images:Values){const m=text.trim().match(/^\{\{([^{}\r\n]{1,120})\}\}$/u),key=m?.[1].trim()||'';return key&&Object.hasOwn(images,key)&&safeRaster(images[key])?images[key]:'';}
async function imageDimensions(src:string){return await new Promise<{w:number;h:number}>((resolve,reject)=>{const im=new Image();im.onload=()=>im.naturalWidth&&im.naturalHeight?resolve({w:im.naturalWidth,h:im.naturalHeight}):reject(Error('IMAGE_LOAD_FAILED'));im.onerror=()=>reject(Error('IMAGE_LOAD_FAILED'));im.src=src;});}
async function putWordImage(zip:any,path:string,doc:Document,nodes:Element[],src:string){
 const p=nodes[0]?.closest('p')||(()=>{let x=nodes[0]?.parentElement;while(x&&x.localName!=='p')x=x.parentElement;return x;})();
 if(!p||p.namespaceURI!==W||Array.from(p.children).some(n=>!['pPr','r'].includes(n.localName))||Array.from(p.children).filter(n=>n.localName==='r').some(r=>Array.from(r.children).some(n=>!['rPr','t'].includes(n.localName))))throw Error('IMAGE_MARKER_NEEDS_OWN_PARAGRAPH');
 const dims=await imageDimensions(src),ratio=Math.min(5.5*914400/dims.w,3*914400/dims.h),cx=Math.round(dims.w*ratio),cy=Math.round(dims.h*ratio);
 const unique=crypto.randomUUID().replace(/-/g,''),ext=/^data:image\/png/i.test(src)?'png':'jpg',media='tis_'+unique+'.'+ext,rid='rIdTis'+unique;
 zip.file('word/media/'+media,src.split(',')[1],{base64:true});
 const relPath=path.replace(/\/([^/]+)$/,'/_rels/$1.rels'),parser=new DOMParser(),ser=new XMLSerializer();
 const relDoc=zip.file(relPath)?await xmlDoc(zip,relPath):parser.parseFromString('<Relationships xmlns="'+REL+'"/>','application/xml');
 const rel=relDoc.createElementNS(REL,'Relationship');rel.setAttribute('Id',rid);rel.setAttribute('Type',IMAGE_REL);rel.setAttribute('Target','media/'+media);relDoc.documentElement.appendChild(rel);zip.file(relPath,ser.serializeToString(relDoc));
 const content=await xmlDoc(zip,'[Content_Types].xml');if(!Array.from(content.getElementsByTagNameNS(CT,'Default')).some(n=>n.getAttribute('Extension')?.toLowerCase()===ext)){const el=content.createElementNS(CT,'Default');el.setAttribute('Extension',ext);el.setAttribute('ContentType',ext==='png'?'image/png':'image/jpeg');content.documentElement.appendChild(el);zip.file('[Content_Types].xml',ser.serializeToString(content));}
 const drawingId=String(100000000+Math.floor(Math.random()*1900000000));
 const xml='<w:r xmlns:w="'+W+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:docPr id="'+drawingId+'" name="Report image"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="'+media+'"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+rid+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
 const run=parser.parseFromString(xml,'application/xml').documentElement;if(run.localName!=='r')throw Error('INVALID_TEMPLATE');
 for(const child of Array.from(p.children))if(child.localName==='r')child.remove();p.appendChild(doc.importNode(run,true));
}

async function openExcel(file:Blob){const {default:ExcelJS}=await import('exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await file.arrayBuffer() as any);if(workbook.worksheets.length>20)throw Error('TOO_MANY_SHEETS');return workbook;}
export async function inspectNative(file:File):Promise<NativeInfo>{
 const format=formatOf(file.name);
 if(format==='pdf'){const {PDFDocument,PDFTextField}=await import('pdf-lib');const pdf=await PDFDocument.load(await file.arrayBuffer(),{updateMetadata:false});if(pdf.getPageCount()>100)throw Error('TOO_MANY_PAGES');return {format,pageCount:pdf.getPageCount(),keys:pdf.getForm().getFields().filter(f=>f instanceof PDFTextField).map(f=>f.getName()).slice(0,100)};}
 if(format==='docx'){const zip=await openZip(file);const parts=wordParts(zip);if(!parts.includes('word/document.xml'))throw Error('INVALID_TEMPLATE');const keys=new Set<string>();for(const path of parts){const doc=await xmlDoc(zip,path);for(const nodes of wordParagraphs(doc))for(const k of keysInText(nodes.map(n=>n.textContent||'').join('')))keys.add(k);}return {format,pageCount:0,keys:[...keys].slice(0,100)};}
 const book=await openExcel(file),keys=new Set<string>();for(const s of book.worksheets){if(s.rowCount>2000||s.columnCount>100)throw Error('SOURCE_TOO_LONG');s.eachRow(r=>r.eachCell(c=>{if(typeof c.value==='string'||(c.value&&typeof c.value==='object'&&'richText'in c.value))for(const k of keysInText(c.text))keys.add(k);}));}return {format,pageCount:0,keys:[...keys].slice(0,100)};
}
export async function editNative(file:File,info:NativeInfo,values:Values,edits:TextEdit[],pdfOrder:number[],overlays:PdfOverlay[]=[],imageValues:Values={}):Promise<{blob:Blob;changes:number}>{
 if(info.format==='docx'){
  const zip=await openZip(file);let changes=0;
  for(const path of wordParts(zip)){const doc=await xmlDoc(zip,path);let count=0;for(const nodes of wordParagraphs(doc)){const img=imageMarker(nodes.map(n=>n.textContent||'').join(''),imageValues);if(img){await putWordImage(zip,path,doc,nodes,img);count++;}else count+=patchNodes(nodes,values,edits);}if(count)zip.file(path,new XMLSerializer().serializeToString(doc));changes+=count;}
  if(!changes)throw Error('NO_NATIVE_CHANGES');
  return {blob:await zip.generateAsync({type:'blob',mimeType:DOCX,compression:'DEFLATE'}),changes};
 }
 if(info.format==='xlsx'){
  const book=await openExcel(file);let changes=0;const imageCells:{sheet:any;cell:any;src:string}[]=[];
  for(const s of book.worksheets){if(s.rowCount>2000||s.columnCount>100)throw Error('SOURCE_TOO_LONG');s.eachRow(r=>r.eachCell(c=>{
   if(typeof c.value!=='string'&&!(c.value&&typeof c.value==='object'&&'richText'in c.value))return;
   const original=c.text,img=imageMarker(original,imageValues);if(img){imageCells.push({sheet:s,cell:c,src:img});return;}const patches=textEdits(original,values,edits);if(!patches.length)return;
   let next=original;for(const p of patches)next=next.slice(0,p.start)+p.value+next.slice(p.end);
   // Keep cell style and formulas in untouched cells. Edited rich-text cells become plain strings.
   c.value=next;changes+=patches.length;
  }));}
  for(const {sheet,cell,src} of imageCells){const d=await imageDimensions(src),w=Math.max(1,(sheet.getColumn(cell.col).width||8.43)*7),h=Math.max(1,(sheet.getRow(cell.row).height||15)*96/72),ratio=Math.min(w/d.w,h/d.h),id=book.addImage({base64:src,extension:/^data:image\/png/i.test(src)?'png':'jpeg'});cell.value='';sheet.addImage(id,{tl:{col:cell.col-1,row:cell.row-1},ext:{width:Math.max(1,d.w*ratio),height:Math.max(1,d.h*ratio)},editAs:'oneCell'});changes++;}
  if(!changes)throw Error('NO_NATIVE_CHANGES');
  return {blob:new Blob([await book.xlsx.writeBuffer() as any],{type:XLSX}),changes};
 }
 const {PDFDocument,PDFTextField,StandardFonts}=await import('pdf-lib');
 const pdf=await PDFDocument.load(await file.arrayBuffer(),{updateMetadata:false});
 const form=pdf.getForm();let changes=0;const fields=form.getFields().filter(f=>f instanceof PDFTextField&&Object.hasOwn(values,f.getName()));
 if(fields.length){
  let font=await pdf.embedFont(StandardFonts.Helvetica);
  if(fields.some(f=>/[^\x00-\x7f]/.test(values[f.getName()]))){
   const {default:fontkit}=await import('@pdf-lib/fontkit');pdf.registerFontkit(fontkit);
   const url='https://cdn.jsdelivr.net/gh/Phonbopit/sarabun-webfont@8d6f2f4223d025670b70aa344462971678516216/fonts/thsarabunnew-webfont.woff';
   const r=await fetch(url,{credentials:'omit',cache:'force-cache'});if(!r.ok)throw Error('FONT_LOAD_FAILED');font=await pdf.embedFont(await r.arrayBuffer(),{subset:true});
  }
  for(const field of fields){(field as InstanceType<typeof PDFTextField>).setText(values[field.getName()]);(field as InstanceType<typeof PDFTextField>).updateAppearances(font);changes++;}
 }
 const original=pdf.getPageCount();
 if(overlays.length>100)throw Error('INVALID_OVERLAY');
 for(const o of overlays){
  if(!o.value)continue;
  if(!Number.isInteger(o.page)||o.page<0||o.page>=original||![o.x,o.y,o.w,o.h].every(Number.isFinite)||o.x<0||o.y<0||o.w<1||o.h<1||o.x+o.w>100.001||o.y+o.h>100.001)throw Error('INVALID_OVERLAY');
  const page=pdf.getPage(o.page);if(page.getRotation().angle%360!==0)throw Error('INVALID_OVERLAY');
  const crop=page.getCropBox(),w=crop.width*o.w/100,h=crop.height*o.h/100,x=crop.x+crop.width*o.x/100,y=crop.y+crop.height*(1-o.y/100)-h;
  if(o.type==='image'){
   if(!safeRaster(o.value))throw Error('UNSUPPORTED_IMAGE');
   const image=await (/^data:image\/png/i.test(o.value)?pdf.embedPng(o.value):pdf.embedJpg(o.value));
   const ratio=Math.min(w/image.width,h/image.height),iw=image.width*ratio,ih=image.height*ratio;
   page.drawImage(image,{x:x+(w-iw)/2,y:y+(h-ih)/2,width:iw,height:ih});
  }else{
   // Shape Thai text using the browser canvas, not a WinAnsi PDF font.
   if(o.value.length>20000||w*h>1000000)throw Error('INVALID_OVERLAY');
   const {prepareReportCanvasFonts}=await import('./reportLayout');await prepareReportCanvasFonts();
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(w*3);canvas.height=Math.ceil(h*3);
   try{const c=canvas.getContext('2d');if(!c)throw Error('PREVIEW_UNAVAILABLE');c.scale(3,3);c.font='16px "TIS Report Sarabun", Tahoma, sans-serif';c.fillStyle='#172033';c.textBaseline='top';const lineHeight=19,lines:string[]=[];
    for(const paragraph of o.value.split(/\r?\n/)){let line='';const parts=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(paragraph),s=>s.segment):Array.from(paragraph);
     for(const ch of parts){if(c.measureText(line+ch).width>w-3&&line){lines.push(line);line='';}line+=ch;}lines.push(line);}
    if(lines.length*lineHeight+2>h||lines.some(l=>c.measureText(l).width>w-3))throw Error('OVERLAY_OVERFLOW');lines.forEach((l,i)=>c.fillText(l,1,1+i*lineHeight));
    const image=await pdf.embedPng(canvas.toDataURL('image/png'));page.drawImage(image,{x,y,width:w,height:h});
   }finally{canvas.width=0;canvas.height=0;}
  }
  changes++;
 }
 if(!pdfOrder.length||pdfOrder.length>120||pdfOrder.some(n=>!Number.isInteger(n)||n< -1||n>=original)||new Set(pdfOrder.filter(n=>n>=0)).size!==pdfOrder.filter(n=>n>=0).length)throw Error('INVALID_PAGE_ORDER');
 const same=pdfOrder.length===original&&pdfOrder.every((p,i)=>p===i);
 if(same){if(!changes)throw Error('NO_NATIVE_CHANGES');return {blob:new Blob([await pdf.save({updateFieldAppearances:false}) as any],{type:'application/pdf'}),changes};}
 // Flatten form appearances before copying pages; preserve original page content.
 if(form.getFields().length)form.flatten({updateFieldAppearances:false});
 const out=await PDFDocument.create();const indices=pdfOrder.filter(n=>n>=0),copies=await out.copyPages(pdf,indices);let j=0;
 for(const n of pdfOrder){if(n===-1)out.addPage([595.28,841.89]);else out.addPage(copies[j++]);}
 return {blob:new Blob([await out.save() as any],{type:'application/pdf'}),changes:changes+1};
}
