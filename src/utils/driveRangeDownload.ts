// Drive revisions are immutable. Request one range at a time so a transient
// server error can be retried by the Drive client at the current offset.
import {driveRangeBytes as rangeBytes,type RangeCache} from './driveStageCache';

export async function downloadDriveRevision(
  size: number,
  request: (range?: string) => Promise<Response>,
  signal: AbortSignal,
  cache?: RangeCache,
): Promise<Response> {
  if (!Number.isSafeInteger(size) || size <= rangeBytes) return request();

  const fetchRange = (start: number) => {
    signal.throwIfAborted();
    const end = Math.min(start + rangeBytes, size) - 1;
    return request(`bytes=${start}-${end}`);
  };
  const cached = async(start:number,end:number)=>{
    try{const bytes=await cache?.get(start);return bytes?.length===end-start?bytes:undefined;}catch{return undefined;}
  };
  const firstBytes=await cached(0,rangeBytes);
  const first=firstBytes?undefined:await fetchRange(0);
  // Some servers ignore Range and return the complete file.
  if (first?.status === 200) return first;

  let offset = 0;
  let pending: Response | undefined = first;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const end = Math.min(offset + rangeBytes, size);
      let bytes=offset===0?firstBytes:await cached(offset,end);
      if(!bytes)for(let attempt=0;;attempt++){
        const response=pending??await fetchRange(offset);pending=undefined;
        const contentRange=response.headers.get('Content-Range');
        if(response.status!==206||(contentRange&&contentRange!==`bytes ${offset}-${end-1}/${size}`)){
          await response.body?.cancel();throw Error('Invalid Drive download range');
        }
        try{bytes=new Uint8Array(await response.arrayBuffer());}
        catch(error){signal.throwIfAborted();if(attempt>=2)throw error;continue;}
        signal.throwIfAborted();
        if(bytes.length===end-offset){
          // A storage quota or private-mode failure must not block a normal download.
          try{await cache?.put(offset,bytes);}catch{}
          break;
        }
        if(attempt>=2)throw Error('Incomplete Drive download range');
      }
      signal.throwIfAborted();
      controller.enqueue(bytes!);
      offset = end;
      if (offset === size) controller.close();
    },
  }, { highWaterMark: 0 });
  return new Response(body, { headers: { 'Content-Length': String(size) } });
}
