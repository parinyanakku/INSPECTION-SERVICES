// Experimental lossless transport layer. No Drive writes or workspace migration.
// Input: UTF-8 JSON chunks. Output: ordered text/image segments; image strings
// are stored byte-for-byte, including quotes and escapes. Never resize/decode images.
export async function splitImageSegments(chunks, {putImage, putText, signal}) {
  const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM:true});
  const encoder = new TextEncoder();
  let text = '', token = '', quoted = false, escaped = false, images = 0;
  const segments = [];
  const check = () => { if (signal?.aborted) throw new Error('CANCELLED'); };
  async function flushText() {
    if (!text) return;
    check();
    const bytes = encoder.encode(text);
    segments.push({kind:'text', id:await putText(bytes), bytes:bytes.length});
    text = '';
  }
  async function finishToken() {
    // Match the canonical JSON.stringify representation, including SVG data URLs.
    if (/^"data:image\/[a-z0-9.+-]+[;,]/i.test(token)) {
      await flushText();
      const bytes = encoder.encode(token);
      segments.push({kind:'image',id:await putImage(bytes),bytes:bytes.length});
      images++;
    } else text += token;
    token = '';
  }
  async function consume(chunk) {
    let start = 0;
    for (let i=0; i<chunk.length; i++) {
      const c = chunk[i];
      if (quoted) {
        if (escaped) {escaped=false; continue;}
        if (c==='\\') {escaped=true; continue;}
        if (c==='"') {
          token += chunk.slice(start,i+1); start=i+1; quoted=false;
          await finishToken();
        }
      } else if (c==='"') {
        text += chunk.slice(start,i); start=i; quoted=true;
        if (text.length>=262144) await flushText();
      }
    }
    if (quoted) token += chunk.slice(start); else text += chunk.slice(start);
    if (text.length>=262144) await flushText();
  }
  for await (const chunk of chunks) {check();await consume(decoder.decode(chunk,{stream:true}));}
  await consume(decoder.decode());
  if (quoted||escaped) throw new Error('Incomplete JSON string');
  await flushText();check();
  return {format:'TIS_IMAGE_SEGMENTS_EXPERIMENT_1',segments,images};
}
// Reads one stored segment at a time. Sink must be transactional and verify the
// authoritative snapshot hash before making a restored workspace visible.
export async function* joinImageSegments(manifest, getSegment, signal) {
  if(manifest.format!=='TIS_IMAGE_SEGMENTS_EXPERIMENT_1')throw new Error('Invalid manifest');
  for(const segment of manifest.segments){
    if(signal?.aborted)throw new Error('CANCELLED');
    if(!['text','image'].includes(segment.kind))throw new Error('Invalid segment');
    const bytes=await getSegment(segment.kind,segment.id);
    if(!(bytes instanceof Uint8Array)||bytes.length!==segment.bytes)throw new Error('Incomplete segment');
    yield bytes;
  }
}
