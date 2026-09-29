import test from 'node:test';
import assert from 'node:assert/strict';
import {draftIssues,parseDraft,normalizeDraft} from '../prompt-quality.mjs';
const project={brief:'<Subject 1> waves.',subjects:[{name:'Mira'}]};
const draft={subject_definitions:'<Subject 1> is Mira from <Picture 1>.',summary:'[reference generation] A wave.',retention_analysis:'<Subject 1>: partially_preserved - keep identity, change action.',detailed_description:'Natural light. [Shot 1] <Subject 1> raises a hand and waves.',overall_soundscape:'Room tone.',non_diegetic_music:'N/A'};
test('no-reference drafts cannot claim reference generation or retention',()=>{
 const p={brief:'A ball on a table.',subjects:[],references:[]};
 const d={...draft,subject_definitions:'N/A',detailed_description:'[Shot 1] A ball rests on a table.',retention_analysis:'ball: fully_preserved'};
 assert.equal(draftIssues(d,p).length,2);
 assert.deepEqual(draftIssues({...d,summary:'[text generation] A ball rests on a table.',retention_analysis:'N/A'},p),[]);
});
test('native H3 sections parse losslessly while commentary, duplicate fields and truncated JSON fail',()=>{
 const text=Object.entries(draft).map(([k,v])=>k+':\n'+v).join('\n\n');
 assert.deepEqual(parseDraft(text),draft);assert.deepEqual(parseDraft(JSON.stringify(draft)),draft);
 assert.throws(()=>parseDraft('Here you go:\n'+text));assert.throws(()=>parseDraft(text+'\nsummary: duplicate'));assert.throws(()=>parseDraft('{"summary":"cut off'));
});
test('syntax cleanup preserves action timing and dialogue, and only removes zero-time shot openings',()=>{
 const input={...draft,detailed_description:'[Shot 1] At 00:00.000, <Subject 1> (Mira) waves. At 00:02.000, a pause. At 00:03.000, cut to [Shot 2] <Subject 1> (S1) says <d>[English] Mira.</d>'};
 const output=normalizeDraft(input,project).detailed_description;
 assert.equal(output,'[Shot 1] <Subject 1> waves. At 00:02.000, a pause. [Shot 2] At 00:03.000, <Subject 1> (S1) says <d>[English] Mira.</d>');
 assert.equal(normalizeDraft({...draft,detailed_description:'[Shot 1] At 00:02.000, a wave.'},project).detailed_description,'[Shot 1] At 00:02.000, a wave.');
 assert.ok(input.detailed_description.includes('(Mira)'));
});
test('quality checks reject observed formatting failures without rejecting valid action cues or speaker IDs',()=>{
 assert.deepEqual(draftIssues(draft,project),[]);
 assert.deepEqual(draftIssues({...draft,detailed_description:draft.detailed_description+' At 00:02.000, <Subject 1> (S1) says <d>[English] Hello.</d>. [Shot 2] At 00:03.000, a close-up shows the reaction.'},project),[]);
 assert.ok(draftIssues({...draft,detailed_description:'[Shot 1] At 00:00.000, <Subject 1> (Mira) waves. At 00:03.000 cut to [Shot 2] a close-up.'},project).length===3);
 assert.ok(draftIssues({...draft,subject_definitions:'Mira is a woman.'},project).some(s=>s.includes('Define <Subject 1>')));
 assert.ok(draftIssues({...draft,retention_analysis:'<Picture 1>: fully_copy'},project).some(s=>s.includes('Visual retention')));
 assert.ok(draftIssues({...draft,detailed_description:'[Shot 1] A wave. [Shot 3] At 00:03.000, a reaction.'},project).some(s=>s.includes('consecutively')));
});
test('explicit shot count and preserved speech omissions fail without interpreting a two-shot composition as two cuts',()=>{
 assert.ok(draftIssues(draft,{...project,brief:'Exactly two shots. <Subject 1> says exactly 「こんにちは。」.',dialogueMode:'preserve'}).some(s=>s.includes('exactly 2 shots')));
 assert.ok(draftIssues(draft,{...project,brief:'<Subject 1> says "Hello".'}).some(s=>s.includes('spoken line')));
 assert.ok(draftIssues({...draft,detailed_description:draft.detailed_description+' <d>Hello</d>'},project).some(s=>s.includes('actual language')));
 assert.deepEqual(draftIssues(draft,{...project,brief:'One continuous medium two-shot.'}),[]);
});

test('latest client shot-count correction overrides older brief without treating assistant ideas as decisions',()=>{const p={...project,brief:'Exactly two shots.',directorMessages:[{role:'user',text:'Change that to exactly one shot.'},{role:'assistant',text:'Could use exactly three shots.'}]};assert.ok(!draftIssues(draft,p).some(s=>s.includes('shots;')));});
