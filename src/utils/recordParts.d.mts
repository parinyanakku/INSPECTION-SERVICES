export const PART_SIZE:number;
export function attachParts(records:Record<string,string>,key:string,parts:readonly string[]):void;
export function getParts(records:Record<string,string>,key:string):readonly string[]|undefined;
export function splitString(value:string,size?:number):string[];
export function joinParts(parts:readonly string[],start?:number,end?:number):string;
export function parseParts(parts:readonly string[]):any;
export function escapedParts(parts:readonly string[]):IterableIterator<string>;
export function recordMapParts(records:Record<string,string>):string[];
export function serializeParts(value:unknown):string[];
