/* Shape-preserving cubic interpolation shared by the static and responsive plots. */
(function(root, factory) {
  const api=factory();
  if (typeof module === 'object' && module.exports) module.exports=api;
  else root.LRCitationCurve=api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const round=value => +value.toFixed(3);
  const position=p => round(p.x)+','+round(p.y);
  function endpoint(h0,h1,d0,d1) {
    let slope=((2*h0+h1)*d0-h0*d1)/(h0+h1);
    if (Math.sign(slope)!==Math.sign(d0)) slope=0;
    else if (Math.sign(d0)!==Math.sign(d1) && Math.abs(slope)>3*Math.abs(d0)) slope=3*d0;
    return slope;
  }
  function segments(points) {
    if (points.length<2) return [];
    const h=[], delta=[], tangent=[];
    for (let i=0;i<points.length-1;i++) {
      const distance=points[i+1].x-points[i].x;
      if (!(distance>0)) throw new RangeError('Citation dates must increase');
      h.push(distance);delta.push((points[i+1].y-points[i].y)/distance);
    }
    const n=points.length;
    if (n===2) tangent.push(delta[0],delta[0]);
    else {
      tangent[0]=endpoint(h[0],h[1],delta[0],delta[1]);
      for (let i=1;i<n-1;i++) {
        if (delta[i-1]===0 || delta[i]===0 || Math.sign(delta[i-1])!==Math.sign(delta[i])) tangent[i]=0;
        else {
          const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];
          tangent[i]=(w1+w2)/(w1/delta[i-1]+w2/delta[i]);
        }
      }
      tangent[n-1]=endpoint(h[n-2],h[n-3],delta[n-2],delta[n-3]);
    }
    return h.map((distance,i) => ({
      from:points[i],to:points[i+1],
      c1:{x:points[i].x+distance/3,y:points[i].y+tangent[i]*distance/3},
      c2:{x:points[i+1].x-distance/3,y:points[i+1].y-tangent[i+1]*distance/3}
    }));
  }
  function paths(points,firstRecorded=0) {
    if (!points.length) return {line:'',history:'',recorded:''};
    const curves=segments(points);
    const path=(start,end) => 'M'+position(points[start])+curves.slice(start,end).map(s =>
      ' C'+position(s.c1)+' '+position(s.c2)+' '+position(s.to)).join('');
    const split=Math.max(0,Math.min(points.length-1,firstRecorded));
    // Split one interpolated path so the slope stays continuous at the source boundary.
    return {line:path(0,points.length-1),history:split ? path(0,split) : '',recorded:path(split,points.length-1)};
  }
  function steps(points) {
    if (!points.length) return '';
    return 'M'+position(points[0])+points.slice(1).map((point,i) => {
      if (!(point.x>points[i].x)) throw new RangeError('Citation dates must increase');
      if (point.y!==points[i].y) return ' H'+round(point.x)+' V'+round(point.y);
      return i===points.length-2 ? ' H'+round(point.x) : '';
    }).join('');
  }
  function timeTicks(start,end,width) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end<start) return [];
    const yearly=end-start>730*86400000,span=Math.max(1,end-start);
    const cursor=new Date(start),ticks=[];
    cursor.setUTCHours(0,0,0,0);
    cursor.setUTCDate(1);
    if (yearly) cursor.setUTCMonth(0);
    const advance=()=>yearly ? cursor.setUTCFullYear(cursor.getUTCFullYear()+1) : cursor.setUTCMonth(cursor.getUTCMonth()+1);
    if (+cursor<start) advance();
    let previous=-Infinity;
    for (;+cursor<=end;advance()) {
      const position=(+cursor-start)/span*width;
      if (position-previous<(yearly ? 48 : 64)) continue;
      ticks.push({time:+cursor,label:cursor.toISOString().slice(0,yearly ? 4 : 7)});
      previous=position;
    }
    return ticks.length ? ticks : [{time:start,label:new Date(start).toISOString().slice(0,10)}];
  }
  return {segments,paths,steps,timeTicks};
});
