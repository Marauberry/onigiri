import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceMap,remapReferences,changeReferences,validate,suggestions,newProject} from '../public/domain.mjs';
import {cleanOutput,selectionOutput} from '../worker.mjs';
import {renumberShots} from '../public/domain.mjs';
test('selection improvement extracts an exact contextual echo and rejects rewritten sections',()=>{
 const project={prompt:'detailed_description:\n[Shot 1] River. At 00:07.000, a bird lands. Sound continues.'},input={selection:'At 00:07.000, a bird lands.'};const raw=project.prompt.replace('00:07.000','00:03.000');assert.equal(selectionOutput(raw,project,input),'At 00:03.000, a bird lands.');assert.throws(()=>selectionOutput(raw.replace('River.','Mountain.'),project,input),/surrounding sections/);assert.equal(selectionOutput('At 00:02.000, a bird lands.',project,input),'At 00:02.000, a bird lands.');
});

test('new scenes have a roughly five-second canvas and shot insertion can renumber in reading order',()=>{
 const p=newProject();assert.equal(p.length,124);assert.equal(p.targetMegapixels,.4);assert.equal(renumberShots('[Shot 1] start [Shot 1] inserted [Shot 2] end'),'[Shot 1] start [Shot 2] inserted [Shot 3] end');
 p.subjects=[{id:'reze',name:'Reze'}];assert.equal(suggestions(p,'(')[0].subjectId,'reze');assert.equal(suggestions(p,'/no dialogue').length,0);
});

test('video soundtracks take audio ordinals before standalone audio',()=>{
  const refs=[{id:'voice',type:'audio'},{id:'img',type:'image'},{id:'movie',type:'video',withAudio:true}];
  assert.deepEqual(referenceMap(refs),{img:'<Picture 1>',movie:'<Video 1>','movie:audio':'<Audio 1>',voice:'<Audio 2>'});
});
test('reordering updates mentions simultaneously without swapping identities',()=>{
  const before=[{id:'a',type:'image'},{id:'b',type:'image'}],after=[...before].reverse();
  assert.equal(remapReferences('<Picture 1> follows <Picture 2>.',before,after),'<Picture 2> follows <Picture 1>.');
});
test('removing a referenced asset leaves an explicit unresolved mention',()=>{
  const before=[{id:'a',type:'image'},{id:'b',type:'image'}];
  assert.equal(remapReferences('<Picture 1>, <Picture 2>',before,[before[1]]),'<Missing reference a>, <Picture 1>');
});
test('adding video audio renumbers standalone audio in notes and prompt',()=>{
  const p={...newProject(),prompt:'<Audio 1>',brief:'Use <Audio 1>',references:[{id:'a',type:'audio',description:'This is <Audio 1>'},{id:'v',type:'video'}]};
  const next=changeReferences(p,p.references.map(r=>r.id==='v'?{...r,withAudio:true}:r));
  assert.equal(next.prompt,'<Audio 2>');assert.equal(next.references[0].description,'This is <Audio 2>');assert.equal(next.brief,'Use <Audio 2>');
});
test('validator rejects undefined references, bad dialogue and frame geometry',()=>{
  const p={...newProject(),prompt:'<Picture 1> <d>hello<\\d>',width:767,length:120};
  const errors=validate(p).errors.join(' ');
  for(const text of ['no matching','Dialogue','multiples','frame count']) assert.ok(errors.toLowerCase().includes(text.toLowerCase()));
});
test('completion offers actual references, subjects, paired dialogue and next shot',()=>{
  const p={...newProject(),prompt:'[Shot 1]',subjects:[{name:'Mara'}]};
  assert.deepEqual(suggestions(p,'[Shot').map(x=>x.value),['[Shot 1]','[Shot 2]']);
  assert.ok(suggestions(p,'<').some(x=>x.value==='<Subject 1>'));
  assert.ok(!suggestions(p,'<').some(x=>x.value==='<Picture 1>'));
  assert.equal(suggestions(p,'<d')[0].value,'<d>[English] </d>');
});
test('response parser removes echoed prompt and runtime statistics',()=>{
  assert.equal(cleanOutput('Loading...\n> One\nTwo\nanswer\n[ Prompt: 42 t/s ]\nExiting...','One\nTwo'),'answer');
  assert.throws(()=>cleanOutput('unexpected format','hello'),/response format changed/);
  assert.equal(cleanOutput('> '+('x'.repeat(100))+' ... (truncated)\nanswer\n[ Prompt: 42 t/s ]','x'.repeat(600)),'answer');
  assert.equal(cleanOutput('internal reasoning</think>\nA red field.','',true),'A red field.');
});

test('long H3 scenes accept aligned frames and retain a bounded native limit',()=>{const p=newProject();for(const length of [719,957,3592]){p.length=length;assert.ok(!validate(p).errors.some(e=>/Frame count/.test(e)));}for(const length of [720,3609]){p.length=length;assert.ok(validate(p).errors.some(e=>/Frame count/.test(e)));}});


test('runtime echo parsing accepts CRLF prompt files',()=>{const prompt='Line one\r\nLine two';assert.equal(cleanOutput('> '+prompt+'\r\nAn answer.\r\n[ Prompt: 1 t/s ]',prompt),'An answer.');});

