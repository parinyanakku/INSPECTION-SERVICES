import type { FloorPlan } from '../types/inspection';

const num = (v: number, max = 100) => Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0;
const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c] || c));

/** The same 4:3 coordinate space is used for the editor, pins and report images. */
export function customFloorSvg(floor: FloorPlan): string {
  const rooms = (floor.zones || []).map(z => {
    const x = num(z.x)*8, y = num(z.y)*6, w = num(z.w)*8, h = num(z.h)*6;
    const size = Math.max(8, Math.min(15, h/5, w/Math.max(4, String(z.name).length)*1.5));
    return '<g><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="#ffffff" fill-opacity=".85" stroke="#334155" stroke-width="4"/><text x="'+(x+w/2)+'" y="'+(y+h/2)+'" text-anchor="middle" dominant-baseline="middle" font-family="Sarabun,sans-serif" font-size="'+size+'" fill="#334155">'+esc(z.name)+'</text></g>';
  }).join('');
  const elements = (floor.elements || []).map(e => {
    const x = num(e.x)*8, y = num(e.y)*6, w = Math.max(1,num(e.w)*8), h = Math.max(1,num(e.h)*6);
    const r = [0,90,180,270].includes(e.rotation) ? e.rotation : 0;
    let shape = '';
    if (e.type === 'wall') shape = '<rect width="'+w+'" height="'+h+'" fill="#334155"/>';
    else if (e.type === 'window') shape = '<rect width="'+w+'" height="'+h+'" fill="#dbeafe" stroke="#0284c7" stroke-width="2"/><path d="M0 '+h/2+' H'+w+'" stroke="#0284c7" stroke-width="2"/>';
    else if (e.type === 'door') shape = '<path d="M0 '+h+' H'+w+'" stroke="white" stroke-width="7"/><path d="M0 '+h+' V0 M0 0 Q'+w+' 0 '+w+' '+h+'" fill="none" stroke="#475569" stroke-width="2"/>';
    else if (e.type === 'stairs') shape = '<rect width="'+w+'" height="'+h+'" fill="#f1f5f9" stroke="#475569" stroke-width="2"/>'+Array.from({length:7},(_,i)=>'<path d="M0 '+((i+1)*h/8)+' H'+w+'" stroke="#64748b"/>').join('');
    else if (e.type === 'entrance') shape = '<path d="M0 '+h/2+' H'+w+'" stroke="#0284c7" stroke-width="4" stroke-dasharray="8 4"/><text x="'+w/2+'" y="'+h+'" text-anchor="middle" font-size="12" fill="#334155">'+esc(e.label || '')+'</text>';
    return '<g transform="translate('+x+' '+y+') rotate('+r+' '+w/2+' '+h/2+')">'+shape+'</g>';
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><defs><pattern id="custom-grid" width="20" height="15" patternUnits="userSpaceOnUse"><path d="M20 0H0V15" fill="none" stroke="#e2e8f0" stroke-width=".8"/></pattern></defs><rect width="800" height="600" fill="#f8fafc"/><rect width="800" height="600" fill="url(#custom-grid)"/>'+rooms+elements+'</svg>';
}
export function customFloorDataUrl(floor: FloorPlan): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(customFloorSvg(floor));
}
