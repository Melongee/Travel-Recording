export interface ScreenPoint {x:number;y:number}
export interface PlaceCluster<T> extends ScreenPoint {items:T[]}

// Repeat after merging: a group's new centre can overlap an otherwise separate marker.
// All distances are screen pixels, so zooming and resizing naturally split groups again.
export function groupPlaceMarkers<T extends {id:string}>(items:T[],project:(item:T)=>ScreenPoint,distance=72):PlaceCluster<T>[] {
  let groups=items.slice().sort((a,b)=>a.id.localeCompare(b.id)).map(item=>({...project(item),items:[item]}));
  while(groups.length>1) {
    const parents=groups.map((_,index)=>index);
    const root=(index:number):number=>{while(parents[index]!==index){parents[index]=parents[parents[index]];index=parents[index];}return index;};
    for(let a=0;a<groups.length;a++)for(let b=a+1;b<groups.length;b++) {
      if(Math.abs(groups[a].x-groups[b].x)<distance&&Math.abs(groups[a].y-groups[b].y)<distance)parents[root(b)]=root(a);
    }
    const merged=new Map<number,PlaceCluster<T>>();
    groups.forEach((group,index)=>{
      const key=root(index),previous=merged.get(key);
      if(!previous){merged.set(key,{...group});return;}
      const count=previous.items.length+group.items.length;
      merged.set(key,{x:(previous.x*previous.items.length+group.x*group.items.length)/count,y:(previous.y*previous.items.length+group.y*group.items.length)/count,items:[...previous.items,...group.items]});
    });
    if(merged.size===groups.length)break;
    groups=[...merged.values()];
  }
  return groups;
}
