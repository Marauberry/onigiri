import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHomeFolders} from '../public/projects.mjs';
import {speakerToken,validRolePath,referenceRoles} from '../public/role-picker.mjs';

test('Home folder pins preserve empty virtual folders and normalize repeats',()=>{
  assert.deepEqual(normalizeHomeFolders([' Films ','Films','','Empty folder',null,'films']),['Films','Empty folder','films']);
  assert.deepEqual(normalizeHomeFolders(null),[]);
});
test('speaker tokens follow current subject ordering and become unbound after subject removal',()=>{
  const p={subjects:[{id:'a'},{id:'b'}],speakers:[{id:'voice',subjectId:'b'},{id:'narrator',subjectId:null}]};
  assert.equal(speakerToken(p,'voice'),'<Subject 2> (S1)');
  p.subjects.reverse(); assert.equal(speakerToken(p,'voice'),'<Subject 1> (S1)');
  p.subjects=[]; assert.equal(speakerToken(p,'voice'),'(S1)');
  assert.equal(speakerToken(p,'narrator'),'(S2)');
  assert.equal(speakerToken(p,'missing'),'');
});
test('shared role picker retains valid selections and rejects unknown path suffixes',()=>{
  assert.deepEqual(validRolePath(['Character','Expression','Subtle expression']),['Character','Expression','Subtle expression']);
  assert.deepEqual(validRolePath(['Character','Unknown','Other']),['Character']);
  assert.deepEqual(validRolePath('Character'),[]);
  assert.ok(referenceRoles.Character.Identity['One person in a group']);
});
