import test from 'node:test';
import assert from 'node:assert/strict';
import {videoInspectionPlan,videoInspectionContext} from '../video-inspection.mjs';

test('video inspection covers the selected trim with bounded preset and custom budgets', () => {
  const reference={duration:20,trimStart:3,trimEnd:15};
  for(const [accuracy,count] of [['low',6],['medium',12],['high',24],['custom',47]]){
    const plan=videoInspectionPlan(reference,{inspectionAccuracy:accuracy,inspectionFrames:47});
    assert.equal(plan.count,count);assert.equal(plan.start,3);assert.equal(plan.end,15);
    assert.ok(Math.abs(plan.interval*count-12)<1e-9);assert.ok(plan.columns*plan.rows>=count);
    assert.ok(plan.columns*plan.tileWidth+(plan.columns-1)*4<=1920);
    assert.match(plan.filter,new RegExp(`trim=end_frame=${count}`));
    assert.match(videoInspectionContext(plan),/not continuous video or audio perception/);
    assert.equal(plan.continuousVideo,false);
  }
  assert.equal(videoInspectionPlan(reference).count,24);
});

test('invalid sampling and trim inputs fail instead of launching an unbounded decode', () => {
  for(const inspectionFrames of [undefined,0,3,49,Infinity,NaN,4.5,'garbage'])assert.throws(()=>videoInspectionPlan({duration:4},{inspectionAccuracy:'custom',inspectionFrames}));
  assert.throws(()=>videoInspectionPlan({duration:4},{inspectionAccuracy:'every-frame'}));
  for(const reference of [{duration:4,trimEnd:0},{duration:4,trimStart:-1},{duration:4,trimEnd:5},{duration:NaN},{duration:4,trimStart:Infinity}])assert.throws(()=>videoInspectionPlan(reference));
  assert.equal(videoInspectionPlan({duration:.1},{inspectionAccuracy:'custom',inspectionFrames:48}).count,48);
});
