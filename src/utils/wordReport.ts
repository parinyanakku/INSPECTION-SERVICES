import JSZip from 'jszip';

type Page={html:string;orientation?:'portrait'|'landscape';isCover?:boolean;pageLabel?:string};
type TextStyle={size:number;bold:boolean;color:string;align:string;line:number};
const NS='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const xml=(s:unknown)=>String(s??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const px=(v:string)=>/^[\d.]+px$/.test(v)?Number.parseFloat(v):0;
const width=(v:string,available:number)=>v.endsWith('%')?available*Number.parseFloat(v)/100:px(v)*15;
const tw=(n:number)=>Math.max(0,Math.round(n));
const hex=(v:string,fallback='0F172A')=>{
 if(/^#[0-9a-f]{6}$/i.test(v))return v.slice(1).toUpperCase();
 const m=v.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
 return m?m.slice(1).map(x=>Number(x).toString(16).padStart(2,'0')).join('').toUpperCase():fallback;
};
const base:TextStyle={size:26,bold:false,color:'0F172A',align:'left',line:260};
function style(el:HTMLElement,parent:TextStyle):TextStyle{
 const css=el.style;const font=px(css.fontSize);
 const weight=css.fontWeight;
 return {size:font?Math.max(20,Math.round(font*1.5)):parent.size,
 bold:weight?weight==='bold'||Number(weight)>=600:parent.bold||/^(B|STRONG|TH|H[1-6])$/.test(el.tagName),
 color:css.color?hex(css.color,parent.color):parent.color,
 align:css.textAlign==='center'||css.textAlign==='right'?css.textAlign:css.textAlign==='left'||css.textAlign==='justify'?'left':parent.align,
 line:css.lineHeight&&Number.isFinite(Number(css.lineHeight))?Math.round(Math.max(1.12,Math.min(1.5,Number(css.lineHeight)))*240):parent.line};
}
function run(text:string,s:TextStyle){
 const props='<w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:eastAsia="TH Sarabun New" w:cs="TH Sarabun New"/>'+ (s.bold?'<w:b/><w:bCs/>':'')+'<w:color w:val="'+s.color+'"/><w:sz w:val="'+s.size+'"/><w:szCs w:val="'+s.size+'"/></w:rPr>';
 return text.split(/\r?\n/).map((part,i)=>'<w:r>'+props+(i?'<w:br/>':'')+'<w:t xml:space="preserve">'+xml(part)+'</w:t></w:r>').join('');
}
function para(runs:string,s:TextStyle,after=35,before=0,keep=false){
 return '<w:p><w:pPr><w:spacing w:before="'+tw(before)+'" w:after="'+tw(after)+'" w:line="'+s.line+'" w:lineRule="auto"/><w:jc w:val="'+s.align+'"/>'+(keep?'<w:keepNext/>':'')+'</w:pPr>'+runs+'</w:p>';
}
const empty='<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>';
const blockTags=new Set(['DIV','P','H1','H2','H3','H4','TABLE','SECTION','ARTICLE','UL','OL','LI','HR']);
function decodeImage(src:string):Promise<HTMLImageElement>{
 return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Cannot load report image'));im.src=src;});
}
export async function downloadNativeWordReport(pages:Page[],filename:string){
 if(!pages.length)throw Error('No report pages');
 const zip=new JSZip();const rels:string[]=[];const mediaTypes=new Set<string>();let imageId=0,footerId=0;
 const rel=(id:string,type:string,target:string)=>'<Relationship Id="'+id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'+type+'" Target="'+target+'"/>';
 async function drawing(el:HTMLImageElement,available:number,maxHeight:number){
  let src=el.getAttribute('src')||'';
  if(!/^data:image\/(jpeg|png|webp|gif|bmp|svg\+xml);/i.test(src))throw Error('Unsupported report image source');
  const im=await decodeImage(src);if(!im.naturalWidth||!im.naturalHeight)throw Error('Invalid report image');
  let ext=/^data:image\/jpeg;base64,/i.test(src)?'jpg':/^data:image\/png;base64,/i.test(src)?'png':'';
  if(ext==='jpg'){
   try{if(atob(src.split(',')[1].slice(0,88000)).includes('Exif\x00\x00'))ext='';}catch{ext='';}
  }
  if(!ext){
   if(im.naturalWidth*im.naturalHeight>24000000)throw Error('Image too large for Word conversion');
   const canvas=document.createElement('canvas');canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image conversion unavailable');
   try{ctx.drawImage(im,0,0);src=canvas.toDataURL('image/png');ext='png';}finally{canvas.width=0;canvas.height=0;}
  }
  const css=el.style;
  const specifiedW=px(css.width)||px(css.maxWidth)||(!css.width?Number(el.getAttribute('width')):0);
  const specifiedH=px(css.height)||px(css.maxHeight)||(!css.height?Number(el.getAttribute('height')):0);
  const wLimit=Math.min(available, specifiedW?specifiedW*15:available);
  const hLimit=Math.min(maxHeight,specifiedH?specifiedH*15:maxHeight);
  const ratio=Math.min(wLimit/im.naturalWidth,hLimit/im.naturalHeight,15);
  const cx=Math.max(1,Math.round(im.naturalWidth*ratio*635)),cy=Math.max(1,Math.round(im.naturalHeight*ratio*635));
  const id=++imageId,rid='rIdImage'+id,name='image'+id+'.'+ext;
  mediaTypes.add(ext);zip.file('word/media/'+name,src.split(',')[1],{base64:true});rels.push(rel(rid,'image','media/'+name));
  return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:docPr id="'+id+'" name="Report photo '+id+'"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="'+id+'" name="'+name+'"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+rid+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
 }
 async function inline(node:Node,s:TextStyle,w:number,h:number):Promise<string>{
  if(node.nodeType===3){
   const v=(node.textContent||'').replace(/\s+/g,' ');return v.trim()?run(v,s):'';
  }
  if(node.nodeType!==1)return '';
  const el=node as HTMLElement,st=style(el,s);
  if(el.tagName==='IMG')return drawing(el as HTMLImageElement,w,h);
  if(el.tagName==='BR')return '<w:r><w:br/></w:r>';
  let out='';for(const child of Array.from(el.childNodes))out+=await inline(child,st,w,h);return out;
 }
 async function children(el:HTMLElement,s:TextStyle,w:number,h:number):Promise<string>{
  let result='',pending='';
  const flush=()=>{if(pending){result+=para(pending,s,30);pending='';}};
  for(const n of Array.from(el.childNodes)){
   if(n.nodeType===1&&blockTags.has((n as HTMLElement).tagName)){flush();result+=await block(n as HTMLElement,s,w,h);}
   else if(n.nodeType===3&&el.style.whiteSpace==='pre-line'&&n.textContent?.trim()){
    pending+=run(n.textContent.trim(),s);
   }else pending+=await inline(n,s,w,h);
  }
  flush();return result;
 }
 async function table(el:HTMLTableElement,s:TextStyle,available:number,h:number){
  const total=tw(Math.min(available,width(el.style.width,available)||available));
  const rows=Array.from(el.rows);const count=Math.max(1,...rows.map(r=>Array.from(r.cells).reduce((sum,c)=>sum+c.colSpan,0)));
  const cols=Array.from(el.querySelectorAll(':scope > colgroup > col')) as HTMLElement[];
  const first=rows[0]?Array.from(rows[0].cells):[];
  let sizes=Array.from({length:count},(_,i)=>width(cols[i]?.style.width||'',total)||(first.length===count?width(first[i].style.width||first[i].getAttribute('width')||'',total):0)||total/count);
  const sum=sizes.reduce((a,b)=>a+b,0);sizes=sizes.map(x=>tw(x/sum*total));sizes[count-1]+=total-sizes.reduce((a,b)=>a+b,0);
  const bordered=rows.some(r=>Array.from(r.cells).some(c=>!!c.style.border||!!c.style.borderBottom));
  const edge=(name:string)=>'<w:'+name+' w:val="single" w:sz="5" w:color="CBD5E1"/>';
  const borders=bordered?'<w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(edge).join('')+'</w:tblBorders>':'';
  let out='<w:tbl><w:tblPr><w:tblW w:w="'+total+'" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/>'+borders+'<w:tblCellMar><w:top w:w="65" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="65" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+sizes.map(x=>'<w:gridCol w:w="'+x+'"/>').join('')+'</w:tblGrid>';
  for(const row of rows){
   const header=row.parentElement?.tagName==='THEAD';
   out+='<w:tr><w:trPr><w:cantSplit/>'+(header?'<w:tblHeader/>':'')+'</w:trPr>';let col=0;
   for(const cell of Array.from(row.cells)){
    const span=cell.colSpan||1,cellWidth=sizes.slice(col,col+span).reduce((a,b)=>a+b,0);col+=span;
    const st=style(cell,s),bg=cell.style.backgroundColor||row.style.backgroundColor;
    const pad=bordered?100:35;
    let body=await children(cell,st,Math.max(100,cellWidth-pad*2),h);
    if(!body||body.endsWith('</w:tbl>'))body+=empty;
    out+='<w:tc><w:tcPr><w:tcW w:w="'+cellWidth+'" w:type="dxa"/>'+(span>1?'<w:gridSpan w:val="'+span+'"/>':'')+(bg?'<w:shd w:val="clear" w:fill="'+hex(bg,'FFFFFF')+'"/>':'')+'<w:tcMar><w:top w:w="55" w:type="dxa"/><w:left w:w="'+pad+'" w:type="dxa"/><w:bottom w:w="55" w:type="dxa"/><w:right w:w="'+pad+'" w:type="dxa"/></w:tcMar><w:vAlign w:val="'+(cell.style.verticalAlign==='top'?'top':'center')+'"/></w:tcPr>'+body+'</w:tc>';
   }
   out+='</w:tr>';
  }
  return out+'</w:tbl>';
 }
 async function block(el:HTMLElement,parent:TextStyle,w:number,h:number):Promise<string>{
  const st=style(el,parent);
  if(el.tagName==='TABLE')return table(el as HTMLTableElement,st,w,h);
  const boxH=px(el.style.height);const imgH=boxH?Math.min(h,boxH*15-50):h;
  const pad=px(el.style.paddingLeft)+px(el.style.paddingRight);
  const innerW=Math.max(100,w-Math.min(w*0.15,pad*15));
  const hasBlock=Array.from(el.children).some(c=>blockTags.has(c.tagName));
  if(hasBlock)return children(el,st,innerW,imgH);
  let out='';
  if(el.style.whiteSpace==='pre-line'&&el.childElementCount===0)out=run((el.textContent||'').trim(),st);
  else for(const n of Array.from(el.childNodes))out+=await inline(n,st,innerW,imgH);
  if(!out)return '';
  const isHeading=/^H[1-6]$/.test(el.tagName);
  const after=isHeading?90:Math.max(20,Math.min(120,px(el.style.marginBottom)*12));
  return para(out,st,after,isHeading?45:0,isHeading);
 }
 const section=(landscape:boolean,footer?:string,next=false)=>{
  const w=landscape?16838:11906,h=landscape?11906:16838;
  return '<w:sectPr>'+(footer?'<w:footerReference w:type="default" r:id="'+footer+'"/>':'')+(next?'<w:type w:val="nextPage"/>':'')+'<w:pgSz w:w="'+w+'" w:h="'+h+'"'+(landscape?' w:orient="landscape"':'')+'/><w:pgMar w:top="650" w:right="650" w:bottom="850" w:left="650" w:header="220" w:footer="300" w:gutter="0"/></w:sectPr>';
 };
 let body='';
 for(let i=0;i<pages.length;i++){
  const page=pages[i],landscape=page.orientation==='landscape',w=(landscape?16838:11906)-1300;
  const root=new DOMParser().parseFromString(page.html,'text/html').body.firstElementChild as HTMLElement|null;
  if(!root)throw Error('Invalid report page');
  let footer:string|undefined;
  if(!page.isCover&&root.children.length>1){
   const footerEl=root.lastElementChild as HTMLElement;
   const foot=await block(footerEl,{...base,size:20},w,600);
   const n=++footerId;footer='rIdFooter'+n;
   zip.file('word/footer'+n+'.xml',declaration+'<w:ftr '+NS+'>'+foot+'</w:ftr>');rels.push(rel(footer,'footer','footer'+n+'.xml'));footerEl.remove();
  }
  // Three landscape records fit with bounded image height and compact native cell margins.
  // Word may flow unusually long descriptions rather than clip them at a fixed page boundary.
  body+=await children(root,base,w,landscape?2100:4400);
  const props=section(landscape,footer,i<pages.length-1);
  body+=i<pages.length-1?'<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>'+props+'</w:pPr></w:p>':props;
 }
 zip.file('word/document.xml',declaration+'<w:document '+NS+'><w:body>'+body+'</w:body></w:document>');
 zip.file('word/styles.xml',declaration+'<w:styles '+NS+'><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:eastAsia="TH Sarabun New" w:cs="TH Sarabun New"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="35" w:line="260" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>');rels.push(rel('rIdStyles','styles','styles.xml'));
 const relationships=(items:string[])=>declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+items.join('')+'</Relationships>';
 zip.file('_rels/.rels',relationships([rel('rId1','officeDocument','word/document.xml')]));
 zip.file('word/_rels/document.xml.rels',relationships(rels));
 zip.file('[Content_Types].xml',declaration+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+Array.from(mediaTypes).map(ext=>'<Default Extension="'+ext+'" ContentType="image/'+(ext==='jpg'?'jpeg':ext)+'"/>').join('')+'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'+Array.from({length:footerId},(_,i)=>'<Override PartName="/word/footer'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>').join('')+'</Types>');
 const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'STORE'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
