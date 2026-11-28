import type {AppLanguage,ProjectFile,BrandConfig,ReportBookData} from '../types/inspection';
import {buildSharedReportPages,prepareSharedReportAssets,escapeHtml,type BuiltReportPage} from './imageUtils';
import {reportDocument,waitForReportFonts,configureReportFrame} from './reportLayout';
import {buildNativeWordReport} from './wordReport';
import {appendPrintableExcelReport} from './excelReport';
import {safeRaster,type TemplatePlan,type Values,type Field} from './reportStudioModel';
const esc=escapeHtml;
function customBody(body:string,fields:Field[],values:Values){
 let out='',cursor=0;
 for(const m of body.matchAll(/\{\{([^{}\r\n]{1,120})\}\}/gu)){
  out+=esc(body.slice(cursor,m.index)).replace(/\r?\n/g,'<br/>');
  const key=m[1].trim(),f=fields.find(x=>x.key===key),value=Object.hasOwn(values,key)?values[key]:'';
  if(f?.type==='image'){if(value&&!safeRaster(value))throw Error('UNSUPPORTED_IMAGE');out+=value?'<div style="margin:8px 0;text-align:center"><img data-pdf-photo="true" src="'+esc(value)+'" style="width:100%;height:270px;object-fit:contain"/></div>':'<span style="color:#9f1239">[ '+esc(f.label)+' ]</span>';}
  else out+=value?esc(value).replace(/\r?\n/g,'<br/>'):'<span style="color:#9f1239">[ '+esc(f?.label||key)+' ]</span>';
  cursor=m.index!+m[0].length;
 }
 return out+esc(body.slice(cursor)).replace(/\r?\n/g,'<br/>');
}
export async function buildStudioPages(project:ProjectFile,brand:BrandConfig,book:ReportBookData,lang:AppLanguage,plan:TemplatePlan,values:Values,signal?:AbortSignal):Promise<BuiltReportPage[]>{
 const assets=await prepareSharedReportAssets(project,brand,signal);
 const rb={...book,customExport:{...book.customExport!,includeCover:true,includeToc:false,includeIntro:true,includeStepsAndZones:true,includeDefectTable:true,includeSummaryTable2:true,defectStatusFilter:'all' as const,defectSeverityFilter:'all' as const,defectSelectionMode:'filter' as const,selectedDefectIds:[]}};
 const original=buildSharedReportPages(project,brand,lang,assets,rb);
 const prefix={cover:'page-cover',intro:'page-sec1',plans:'page-sec2',defects:'page-sec3',summary:'page-sec4'};
 const out:BuiltReportPage[]=[];
 for(const s of plan.sections){
  if(s.kind!=='custom'){
   const match=original.filter(p=>p.id===prefix[s.kind]||p.id.startsWith(prefix[s.kind]+'-'));
   out.push(...match.map(p=>({...p,id:s.id+'-'+p.id})));continue;
  }
  const html='<div class="report-page report-a4-page" data-orientation="portrait" style="width:794px;height:1123px;box-sizing:border-box;background:#fff;color:#0f172a;padding:44px;font-family:TH Sarabun New,Tahoma,sans-serif;display:flex;flex-direction:column"><div style="font-size:18px;font-weight:700;border-bottom:2px solid #334155;padding-bottom:10px">'+esc(brand.companyName)+'</div><div data-studio-content="true" style="flex:1;min-height:0;overflow-wrap:anywhere"><h1 style="font-size:27px;margin:20px 0;text-align:left">'+esc(s.title)+'</h1><div style="font-size:19px;line-height:1.45">'+customBody(s.body,plan.fields,values)+'</div></div><div style="font-size:15px;border-top:1px solid #94a3b8;padding-top:10px">'+esc(brand.inspectorName)+'</div></div>';
  out.push({id:s.id,html,orientation:'portrait',pageLabel:String(out.length+1)});
 }
 if(!out.length)throw Error('NO_PAGES');return out;
}
async function mountPage(doc:Document,page:BuiltReportPage){
 doc.body.innerHTML=page.html;
 const root=doc.querySelector<HTMLElement>('.report-page');if(!root)throw Error('INVALID_PAGE');
 for(const img of Array.from(root.querySelectorAll('img'))){try{await img.decode();}catch{if(!img.complete||!img.naturalWidth)throw Error('IMAGE_LOAD_FAILED');}}
 const content=root.querySelector<HTMLElement>('[data-studio-content]');if(content&&content.scrollHeight>content.clientHeight+2)throw Error('PAGE_OVERFLOW');
 return root;
}
export async function buildStudioFile(pages:BuiltReportPage[],format:'pdf'|'docx'|'xlsx',lang:AppLanguage,signal?:AbortSignal,onProgress?:(n:number,total:number)=>void):Promise<Blob>{
 if(!pages.length)throw Error('NO_PAGES');const iframe=document.createElement('iframe');configureReportFrame(iframe);document.body.appendChild(iframe);
 try{
 const doc=iframe.contentDocument;if(!doc)throw Error('PREVIEW_UNAVAILABLE');doc.open();doc.write(reportDocument(''));doc.close();await waitForReportFonts(doc);
 // Verify custom pages fit before every format export.
 for(const page of pages){signal?.throwIfAborted();if(page.html.includes('data-studio-content'))await mountPage(doc,page);}
 if(format==='docx')return await buildNativeWordReport(pages,signal);
 if(format==='xlsx'){const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();await appendPrintableExcelReport(book,pages,lang,signal);return new Blob([await book.xlsx.writeBuffer() as any],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
 const pdf=new jsPDF({format:'a4',unit:'mm',orientation:pages[0].orientation||'portrait',compress:true});
 for(let i=0;i<pages.length;i++){
  signal?.throwIfAborted();onProgress?.(i,pages.length);
  const page=pages[i],landscape=page.orientation==='landscape',w=landscape?1123:794,h=landscape?794:1123,wm=landscape?297:210,hm=landscape?210:297;
  const node=await mountPage(doc,page);const bounds=node.getBoundingClientRect();
  const canvas=await html2canvas(node,{scale:2.5,backgroundColor:'#fff',width:w,height:h,windowWidth:1123,windowHeight:1123,useCORS:true,imageTimeout:15000});
  try{
   if(i)pdf.addPage('a4',landscape?'landscape':'portrait');
   const raster=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PDF_RENDER_FAILED')),'image/png'));
   pdf.addImage(new Uint8Array(await raster.arrayBuffer()),'PNG',0,0,wm,hm);
   // Overlay supported original evidence photo bytes at their measured contain position.
   for(const img of Array.from(node.querySelectorAll<HTMLImageElement>('img[data-pdf-photo]'))){
    const src=img.getAttribute('src')||'';if(!safeRaster(src)||!img.naturalWidth||!img.naturalHeight)continue;
    if(/^data:image\/jpeg/i.test(src)){try{if(atob(src.split(',')[1].slice(0,88000)).includes('Exif\x00\x00'))continue;}catch{continue;}}
    const r=img.getBoundingClientRect(),ratio=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight),iw=img.naturalWidth*ratio,ih=img.naturalHeight*ratio,x=r.left-bounds.left+(r.width-iw)/2,y=r.top-bounds.top+(r.height-ih)/2;
    if(iw>0&&ih>0&&x>=0&&y>=0&&x+iw<=w+.5&&y+ih<=h+.5)pdf.addImage(src,/^data:image\/png/i.test(src)?'PNG':'JPEG',x/w*wm,y/h*hm,iw/w*wm,ih/h*hm);
   }
  }finally{canvas.width=0;canvas.height=0;doc.body.replaceChildren();}
  signal?.throwIfAborted();onProgress?.(i+1,pages.length);await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 return pdf.output('blob');
 }finally{iframe.remove();}
}
export function downloadStudio(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
