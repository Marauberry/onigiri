import test from 'node:test';import assert from 'node:assert/strict';
import {newProject,dimensions,template,suggestions} from '../public/domain.mjs';
test('canvas rejects nonfinite sizes and templates include linked soundtracks',()=>{
  for(const value of [NaN,Infinity,0,-1,5])assert.throws(()=>dimensions('16:9',value));
  const p={...newProject(),references:[{id:'v',type:'video',name:'Dance',withAudio:true},{id:'a',type:'audio',name:'Music'}]};
  assert.match(template(p),/<Audio 1>: Soundtrack from <Video 1>/);assert.match(template(p),/<Audio 2>: Music/);
  assert.equal(suggestions(p,'At 0')[0].value,'At 00:00.000, ');assert.equal(suggestions(p,'/motion').length,0);assert.equal(suggestions(p,'At 900').length,0);
});
