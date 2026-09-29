import test from 'node:test';
import assert from 'node:assert/strict';
import {readSidebarPayload,orderedSelection,reorderSidebarItems} from '../public/sidebar-gestures.mjs';
test('sidebar drag payload validates kind, IDs and duplicate entries',()=>{
 assert.equal(readSidebarPayload('{','subject'),null);
 assert.equal(readSidebarPayload('{"kind":"speaker","ids":["a"]}','subject'),null);
 assert.equal(readSidebarPayload('{"kind":"subject","ids":[1]}','subject'),null);
 assert.deepEqual(readSidebarPayload('{"kind":"subject","ids":["b","a","b"]}','subject'),{kind:'subject',ids:['b','a']});
});
test('multiple selection and moves retain source ordering and ignore removed IDs',()=>{
 const items=['a','b','c','d'].map(id=>({id}));
 assert.deepEqual(orderedSelection(items,new Set(['d','b','removed'])),['b','d']);
 assert.deepEqual(reorderSidebarItems(items,['d','b'],0).map(x=>x.id),['b','d','a','c']);
 assert.deepEqual(reorderSidebarItems(items,['a','b'],3).map(x=>x.id),['c','d','a','b']);
 assert.deepEqual(items.map(x=>x.id),['a','b','c','d']);
});
