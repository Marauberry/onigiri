import test from 'node:test';
import assert from 'node:assert/strict';
import {durationDisplay} from '../comfyui_h3_prompt_helper/web/canvas-panel.js';

test('duration overflow preserves the actual duration without expanding the slider',()=>{
  assert.deepEqual(durationDisplay(124),{seconds:124/24,sliderSeconds:124/24,overflow:false});
  assert.equal(durationDisplay(481).overflow,false); // The nearest H3-aligned value to 20 seconds.
  for(const frames of [498,719,1441,3592]){
    const view=durationDisplay(frames);
    assert.equal(view.seconds,frames/24);
    assert.equal(view.sliderSeconds,20);
    assert.equal(view.overflow,true);
  }
});
