export function videoInspectionPlan(reference, profile = {}) {
  const accuracy = profile.inspectionAccuracy ?? 'high';
  if (!['low', 'medium', 'high', 'custom'].includes(accuracy)) throw new Error('Choose low, medium, high, or custom video inspection.');
  const count = accuracy === 'custom' ? Number(profile.inspectionFrames) : {low: 6, medium: 12, high: 24}[accuracy];
  if (!Number.isInteger(count) || count < 4 || count > 48) throw new Error('Custom video inspection requires 4–48 frames.');
  const start = Number(reference.trimStart ?? 0), end = Number(reference.trimEnd ?? reference.duration), duration = end - start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(Number(reference.duration)) || duration <= 0 || start < 0 || end > Number(reference.duration) + .001) throw new Error('Choose a valid video range before describing it.');
  const columns = count <= 6 ? 3 : count <= 12 ? 4 : 6, rows = Math.ceil(count / columns);
  const tileWidth = count > 24 ? 240 : 312, tileHeight = count > 24 ? 180 : 234;
  const interval = duration / count;
  // fps samples across the whole trim; padding ensures the final short bin can be
  // filled. Decoded frames may repeat for short/low-fps sources. Blank grid cells
  // after count are padding, never additional observations.
  const filter = `setpts=PTS-STARTPTS,fps=${count}/${duration}:start_time=0,tpad=stop_mode=clone:stop_duration=${interval * 2},trim=end_frame=${count},scale=${tileWidth}:${tileHeight}:force_original_aspect_ratio=decrease,pad=${tileWidth}:${tileHeight}:(ow-iw)/2:(oh-ih)/2,tile=${columns}x${rows}:nb_frames=${count}:padding=4`;
  return {kind:'sampled-frames',accuracy,count,start,end,interval,columns,rows,tileWidth,tileHeight,audio:false,coverage:'selected-trim',continuousVideo:false,filter};
}

export function videoInspectionContext(plan) {
  return `This is a contact sheet of ${plan.count} chronological video samples in ${plan.columns} columns, read left-to-right then top-to-bottom. Only the first ${plan.count} cells contain samples; ignore any remaining blank cells. Samples are distributed across the entire selected ${plan.start.toFixed(2)}–${plan.end.toFixed(2)} second range, approximately ${plan.interval.toFixed(3)} seconds apart. Short or low-frame-rate sources can repeat frames. Summarize the main visible activity and recurring subjects, not a timeline or a list of cells. Describe only visible changes across samples when movement is requested; do not infer the connecting motion. The grid is an inspection layout, not an object or split-screen in the original video. Do not describe the video as a grid or montage of samples. This is sampled frame inspection, not continuous video or audio perception: brief events and transitions between samples can be missed. Do not claim you watched every frame or invent unseen transitions. Small faces or expressions may be unresolved at thumbnail resolution.`;
}
