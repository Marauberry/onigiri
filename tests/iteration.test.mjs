import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,changeSubjects,compileDraft,dialogueIssues,SECTIONS,dimensions,validate} from '../public/domain.mjs';
test('subject deletion remaps surviving identities and flags removed mentions',()=>{const p={...newProject(),subjects:[{id:'a'},{id:'b'}],prompt:'<Subject 1> sees <Subject 2>'};const next=changeSubjects(p,[p.subjects[1]]);assert.equal(next.prompt,'<Subject 1> sees <Subject 1>');assert.ok(validate(next).errors.some(x=>x.includes('missing')));});
test('structured drafts compile sections and normalize first speaker appearance',()=>{const fields=Object.fromEntries(SECTIONS.map(s=>[s,'N/A']));fields.detailed_description='[Shot 1] (S2) speaks, then (S1).';assert.ok(compileDraft(fields).includes('[Shot 1] (S1) speaks, then (S2).'));assert.throws(()=>compileDraft({}));assert.equal(dialogueIssues('<d>[Japanese] very delicious</d>').length,1);assert.equal(dialogueIssues('<d>[Japanese] とてもおいしい。</d>').length,0);assert.equal(validate({...newProject(),prompt:'[Shot 1] Quiet.'}).errors.length,0);assert.equal(dimensions('16:9',.21).width%32,0);});

