import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareProjects,consumePreparedProjects,clearPreparedProjects} from './verifiedProjects.ts';
test('large record is parsed once and handed off without altering any image',()=>{const photo='data:image/jpeg;base64,'+'A'.repeat(8*1024*1024);const raw=JSON.stringify([{id:'a',floors:[],defects:[{photo}]}]);const p=prepareProjects(raw);assert.equal(prepareProjects(raw),p);assert.equal(consumePreparedProjects(raw),p);assert.equal(JSON.stringify(p),raw);assert.notEqual(prepareProjects(raw),p);clearPreparedProjects();});
test('new record or account never receives stale prepared projects',()=>{const raw=JSON.stringify([{id:'a',floors:[],defects:[]}]);const p=prepareProjects(raw);clearPreparedProjects();assert.notEqual(prepareProjects(raw),p);assert.deepEqual(consumePreparedProjects('[]'),[]);});
test('invalid or duplicate projects fail instead of becoming empty',()=>{for(const raw of ['null','{}','[{"id":"a"}]','[{"id":"a","floors":[],"defects":[]},{"id":"a","floors":[],"defects":[]}]'])assert.throws(()=>prepareProjects(raw),/Invalid projects/);clearPreparedProjects();});
