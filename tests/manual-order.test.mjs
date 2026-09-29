import test from 'node:test';
import assert from 'node:assert/strict';
import {applySidebarOrder,readSidebarOrder,writeSidebarOrder,orderKey,SIDEBAR_ORDER_KEYS} from '../public/sidebar-gestures.mjs';
import {referenceMap,changeReferences} from '../public/domain.mjs';

const memoryStorage=()=>{const store=new Map();return {getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value))};};

test('manual order keeps ranked items first, leaves new ones last and survives bad storage',()=>{
 assert.deepEqual(applySidebarOrder(['a','b','c'],['c','a']),['c','a','b']);
 assert.deepEqual(applySidebarOrder(['a','b'],[]),['a','b']);
 assert.deepEqual(applySidebarOrder(['a','b'],['gone','b']),['b','a']);
 const storage=memoryStorage();
 writeSidebarOrder(SIDEBAR_ORDER_KEYS.folders,['Beach','Beach','','Short'],storage);
 assert.deepEqual(readSidebarOrder(SIDEBAR_ORDER_KEYS.folders,storage),['Beach','','Short']);
 storage.setItem(SIDEBAR_ORDER_KEYS.folders,'{');
 assert.deepEqual(readSidebarOrder(SIDEBAR_ORDER_KEYS.folders,storage),[]);
 storage.setItem(SIDEBAR_ORDER_KEYS.folders,JSON.stringify(['ok',7,null]));
 assert.deepEqual(readSidebarOrder(SIDEBAR_ORDER_KEYS.folders,storage),['ok']);
});

test('scene order is remembered per group so groups reorder independently',()=>{
 const beach=orderKey('Beach'),unfiled=orderKey('');
 assert.notEqual(beach,unfiled);
 const storage=memoryStorage();
 writeSidebarOrder(beach,['one','two'],storage);writeSidebarOrder(unfiled,['three'],storage);
 assert.deepEqual(readSidebarOrder(beach,storage),['one','two']);
 assert.deepEqual(readSidebarOrder(unfiled,storage),['three']);
});

test('dropping an already-present file appends a duplicate without renumbering earlier mentions',()=>{
 const first={id:'a',type:'image'},second={id:'b',type:'image'},duplicate={id:'c',type:'image'};
 const project={id:'p',references:[first,second],subjects:[],speakers:[],prompt:'subject_definitions:\n<Picture 1> is a cat.\n\nsummary:\n<Picture 2> runs.'};
 const next=changeReferences(project,[first,second,duplicate]);
 assert.equal(next.prompt,'subject_definitions:\n<Picture 1> is a cat.\n\nsummary:\n<Picture 2> runs.');
 assert.deepEqual(referenceMap(next.references),{a:'<Picture 1>',b:'<Picture 2>',c:'<Picture 3>'});
 const trimmed=changeReferences(next,[first,second]);
 assert.deepEqual(referenceMap(trimmed.references),{a:'<Picture 1>',b:'<Picture 2>'});
 assert.equal(trimmed.prompt,'subject_definitions:\n<Picture 1> is a cat.\n\nsummary:\n<Picture 2> runs.');
});
