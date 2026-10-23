import {describe,expect,it} from 'vitest';
import {groupPlaceMarkers} from './placeClusters';

describe('place marker grouping',()=>{
  const project=(item:{x:number;y:number})=>item;
  it('keeps separated markers and all source coordinates unchanged',()=>{
    const items=[{id:'a',x:0,y:0},{id:'b',x:180,y:0}],copy=structuredClone(items);
    expect(groupPlaceMarkers(items,project).map(g=>g.items.length)).toEqual([1,1]);expect(items).toEqual(copy);
    expect(groupPlaceMarkers([],project)).toEqual([]);
  });
  it('groups transitive overlaps, retaining every place exactly once',()=>{
    const items=[{id:'a',x:0,y:0},{id:'b',x:60,y:20},{id:'c',x:120,y:40},{id:'d',x:400,y:0}];
    const groups=groupPlaceMarkers(items,project);
    expect(groups.map(g=>g.items.map(p=>p.id))).toEqual([['a','b','c'],['d']]);
    expect(groups[0].x).toBe(60);expect(groups[0].y).toBe(20);
    expect(groupPlaceMarkers(items.slice().reverse(),project)).toEqual(groups);
  });
  it('handles coincident places and splits them when projected farther apart',()=>{
    const items=[{id:'a',x:-20,y:-20},{id:'b',x:-20,y:-20},{id:'c',x:30,y:30}];
    expect(groupPlaceMarkers(items,project)).toHaveLength(1);
    const enlarged=groupPlaceMarkers(items,p=>({x:p.x*4,y:p.y*4}));
    expect(enlarged.map(g=>g.items.length)).toEqual([2,1]);
  });
  it('merges again if newly formed cluster centres collide',()=>{
    const ring=[[-90,-90],[-30,-90],[30,-90],[90,-90],[90,-30],[90,30],[90,90],[30,90],[-30,90],[-90,90],[-90,30],[-90,-30]];
    const items=[...ring.map(([x,y],i)=>({id:String(i),x,y})),{id:'island',x:0,y:0}];
    const groups=groupPlaceMarkers(items,project);
    expect(groups).toHaveLength(1);expect(groups[0].items).toHaveLength(13);
    for(let a=0;a<groups.length;a++)for(let b=a+1;b<groups.length;b++)expect(Math.abs(groups[a].x-groups[b].x)>=72||Math.abs(groups[a].y-groups[b].y)>=72).toBe(true);
  });
});
