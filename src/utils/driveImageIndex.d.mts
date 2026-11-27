export type ImageRange={start:number;end:number};
export function createImageIndexScanner(limit?:number):{feed(bytes:Uint8Array):void;finish():{bytes:Uint8Array;ranges:ImageRange[];total:number}};
