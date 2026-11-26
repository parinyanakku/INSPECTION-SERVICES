// Decode camera DNG locally, in a lazily loaded Web Worker.
// Never upload the source RAW file or replace it on disk.
export function isDngFile(file:File){
  return /\.dng$/i.test(file.name)||/^(image\/(x-)?adobe-dng|image\/dng|image\/x-dng)$/i.test(file.type);
}
export function imageUploadError(file:File,lang:'th'|'en',fallback:string){
  if(!isDngFile(file))return fallback;
  return lang==='en'?'Unable to decode this DNG. It may be damaged, too large, or use an unsupported RAW format. Export the original as JPEG/PNG and try again.':'ไม่สามารถถอดรหัสไฟล์ DNG นี้ได้ ไฟล์อาจเสียหาย มีขนาดใหญ่ หรือใช้ RAW ที่ไม่รองรับ กรุณาส่งออกต้นฉบับเป็น JPEG/PNG แล้วลองใหม่';
}
export async function decodeDngToJpeg(file:File,maxDimension=2560,quality=0.95):Promise<string>{
  if(file.size>160*1024*1024)throw Error('DNG exceeds 160 MB limit');
  const {createWorkerPool}=await import('flashraw/worker');
  const pool=createWorkerPool({size:1});
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),90000);
  try{
    const raw=await pool.open(file);
    try{
      const count=raw.metadata.width*raw.metadata.height;
      if(!Number.isFinite(count)||count<=0||count>60_000_000)throw Error('Unsupported DNG dimensions');
      // Large 48MP photos can exhaust mobile memory; request a half-size
      // development when the sensor supports it. Smaller photos keep full detail.
      const frame=await raw.decode({output:'rgba8',demosaic:count>24_000_000?'half-size':'auto',previewFallback:true,signal:controller.signal});
      const sw=frame.width,sh=frame.height;
      if(!Number.isSafeInteger(sw)||!Number.isSafeInteger(sh)||sw<=0||sh<=0||sw*sh>60_000_000||frame.data.length!==sw*sh*4)throw Error('Invalid decoded DNG');
      if(frame.source==='preview'&&Math.max(sw,sh)<1600)throw Error('Embedded preview too small for inspection');
      const scale=Math.min(1,(maxDimension>0?maxDimension:4096)/Math.max(sw,sh));
      const w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
      // Limit intermediate canvases to stripes to avoid Safari's large-canvas limit.
      const pixels=new Uint8ClampedArray(frame.data.buffer,frame.data.byteOffset,frame.data.byteLength);
      const strip=document.createElement('canvas');strip.width=sw;strip.height=Math.min(sh,256);
      const sc=strip.getContext('2d');if(!sc)throw Error('Canvas unavailable');
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
      for(let y=0;y<sh;y+=256){
        const rows=Math.min(256,sh-y);
        const block=new Uint8ClampedArray(pixels.subarray(y*sw*4,(y+rows)*sw*4));
        sc.putImageData(new ImageData(block,sw,rows),0,0);
        const top=Math.round(y*h/sh),bottom=Math.round((y+rows)*h/sh);
        if(bottom>top)ctx.drawImage(strip,0,0,sw,rows,0,top,w,bottom-top);
      }
      strip.width=1;strip.height=1;
      const jpeg=canvas.toDataURL('image/jpeg',quality);canvas.width=1;canvas.height=1;
      if(!jpeg.startsWith('data:image/jpeg;'))throw Error('DNG conversion failed');
      return jpeg;
    }finally{if(!controller.signal.aborted)await raw.close().catch(()=>{});}
  }finally{window.clearTimeout(timeout);pool.terminate();}
}
