import * as THREE from 'three';
import { createChaseAssets, createMotorcycle } from './chase-assets';
import { chasePoint, createChaseMotion } from './chase-motion.mjs';
import { chasePressure, chasePursuitFrame, chaseRiderPoint } from './chase-camera.mjs';

export function createChaseScene(host, readState, onError) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  host.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-hidden','true');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(52,1,.1,240);
  scene.fog = new THREE.FogExp2('#607783',.006);
  scene.add(new THREE.HemisphereLight('#c5e4f8','#264a54',2.25));
  const sun = new THREE.DirectionalLight('#ffcc92',3.3); sun.position.set(-28,32,-20); scene.add(sun);
  const rim = new THREE.DirectionalLight('#6fc7ff',1.8); rim.position.set(24,18,20); scene.add(rim);
  const assets = createChaseAssets(), { p, geo, box, plain, cylinder, sphere, cone } = assets;
  const extra = [], motion = createChaseMotion(), temporary = new THREE.Object3D(), groups = new Map(), foregroundLamps = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf, disposed=false, width=1,height=1,previous=performance.now(),statsAt=previous,frames=0,quality='auto',ratio=1.2,slow=0,lastRound,lastFinished;

  function part(shape,mat,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0,tag='') {
    const key=`${shape.uuid}:${mat.uuid}:${tag}`; if (!groups.has(key)) groups.set(key,{shape,mat,tag,matrices:[]});
    temporary.position.set(x,y,z); temporary.scale.set(sx,sy,sz); temporary.rotation.set(rx,ry,rz); temporary.updateMatrix(); groups.get(key).matrices.push(temporary.matrix.clone());
  }
  function ribbon(offset,halfWidth,material,y) {
    const vertices=[],uvs=[],indices=[];
    for(let i=0;i<=256;i++) {
      const point=chasePoint(i/256*520),nx=point.tz,nz=-point.tx;
      for(const side of [-1,1]) { vertices.push(point.x+nx*(offset+side*halfWidth),y,point.z+nz*(offset+side*halfWidth)); uvs.push((side+1)/2,i/256*26); }
      if(i<256){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
    const geometry=geo(new THREE.BufferGeometry()); geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material); scene.add(mesh); return mesh;
  }
  ribbon(0,3.4,p.road,.23); ribbon(-3.75,.35,p.paving,.21); ribbon(3.75,.35,p.paving,.21);
  ribbon(-3.35,.07,p.white,.245); ribbon(3.35,.07,p.white,.245);
  ribbon(-4.03,.035,p.cyan,.24); ribbon(4.03,.035,p.amber,.24);
  for(let i=0;i<72;i++) {
    const point=chasePoint(i/72*520),yaw=Math.atan2(point.tx,point.tz);
    if(i%2===0)part(plain,p.white,point.x,.245,point.z,.09,.025,1.15,0,yaw);
    for(const side of [-1,1]) {
      const x=point.x+point.tz*4.02*side,z=point.z-point.tx*4.02*side;
      if(i%3===0){part(box,p.navy,x,.65,z,.13,1.0,.13);part(sphere,side<0?p.cyan:p.amber,x,1.20,z,.08,.08,.08);}
      if(i%9===0){const lx=point.x+point.tz*4.7*side,lz=point.z-point.tx*4.7*side,tag=side>0?'foreground-lamp':'';part(cylinder,p.navy,lx,2.1,lz,.08,4.1,.08,0,0,0,tag);part(box,p.navy,lx,4.2,lz,.65,.12,.3,0,yaw,0,tag);part(sphere,p.light,lx,4.1,lz,.21,.12,.18,0,0,0,tag);}
    }
  }
  const starting=chasePoint(0),nx=starting.tz,nz=-starting.tx,yaw=Math.atan2(starting.tx,starting.tz);
  for(let row=0;row<2;row++)for(let col=0;col<10;col++)part(plain,(row+col)%2?p.dark:p.white,starting.x+nx*(col-4.5)*.66+starting.tx*(row-.5)*.5,.253,starting.z+nz*(col-4.5)*.66+starting.tz*(row-.5)*.5,.66,.026,.5,0,yaw);
  const island = new THREE.Mesh(cylinder,p.wall); island.scale.set(21,2,13);island.position.y=-1;scene.add(island);
  const islandTop = new THREE.Mesh(cylinder,p.paving);islandTop.scale.set(20.8,.1,12.8);scene.add(islandTop);
  const lawn = new THREE.Mesh(cylinder,p.foliage);lawn.scale.set(10.5,.18,8);lawn.position.set(0,.09,0);scene.add(lawn);
  for(let index=0;index<10;index++) {
    const angle=index/10*Math.PI*2, x=Math.cos(angle)*13, z=Math.sin(angle)*7.8, tall=2.8+index%3*1.1;
    const wall=index%3===0?p.teal:p.wall;
    part(box,wall,x,tall/2+.1,z,3.8,tall,2.5);part(box,p.roof,x,tall+.28,z,4.05,.5,2.8);
    for(let row=0;row<2;row++)for(let col=0;col<3;col++){part(plain,p.windows,x+(col-1)*.88,1+row*1.05,z+1.27,.40,.58,.035);part(plain,p.windows,x+(col-1)*.88,1+row*1.05,z-1.27,.40,.58,.035);}
    part(box,p.navy,x,.85,z+1.28,.56,1.35,.045);
    for(const side of [-1,1]){
      part(box,p.paving,x,tall-.12,z+side*1.31,3.9,.12,.14);
      part(box,index%2?p.orange:p.teal,x,1.94,z+side*1.55,3.2,.12,.6,.12*side);
      for(const col of [-1,0,1]){part(plain,p.navy,x+col*.88,1.53,z+side*1.295,.05,.62,.04);part(plain,p.navy,x+col*.88,1.53,z+side*1.3,.42,.05,.04);}
    }
    part(box,p.navy,x+.8,tall+.7,z-.35,.48,.6,.48);part(box,p.chrome,x+.8,tall+1.04,z-.35,.6,.12,.6);
    part(box,p.trunk,x-1.85,.33,z+1.8,.55,.62,.65);part(box,p.trunk,x-2.15,.23,z+2.2,.42,.42,.48);
    if(index%2===0){part(cylinder,p.trunk,x+2.5,1.85,z,.17,3.6,.17);for(let n=0;n<4;n++)part(sphere,n%2?p.foliage:p.leaves,x+2.5+Math.cos(n)*.35,3.5,z+Math.sin(n)*.35,1.1,.65,1.1);}
  }
  // Landmark and small port details are real geometry, with merged repeated parts.
  part(cylinder,p.wall,0,3.4,-1,1.05,6.8,1.05);part(cylinder,p.navy,0,4.1,-1,1.08,.25,1.08);
  part(cylinder,p.windows,0,7.2,-1,.95,.9,.95);part(cone,p.roof,0,8.04,-1,1.36,.7,1.36);
  for(const x of [-4,4]){part(box,p.wall,x,1.1,-1,2.7,2.1,3.4);part(box,p.roof,x,2.4,-1,3.0,.5,3.7);}
  for(let i=0;i<8;i++){part(box,p.teal,-9+i*1.2,.48,2,1,.9,1.5);part(box,p.orange,-9+i*1.2,.45,4.5,1,.8,1.4);}
  for(let i=0;i<12;i++){const angle=i/12*Math.PI*2;part(sphere,p.foliage,Math.cos(angle)*18,.35,Math.sin(angle)*11,1.4,.45,.7);}
  for(let i=0;i<8;i++){
    const point=chasePoint(i/8*520),x=point.x-point.tz*5.8,z=point.z+point.tx*5.8;
    part(cylinder,p.trunk,x,1.55,z,.16,2.9,.16);
    for(let level=0;level<3;level++)part(sphere,level%2?p.leaves:p.foliage,x,2.9+level*.5,z,1.2-level*.2,.65,1.1-level*.18);
    part(box,p.paving,x,.16,z,1.5,.3,1.4);part(sphere,p.foliage,x,.37,z,.72,.25,.62);
  }
  for(let i=0;i<8;i++){const x=-31+i*8;part(plain,p.navy,x,-.1,-33,3.0,.32,8);part(box,p.wall,x,.65,-36,.15,1.4,.15);part(box,p.wall,x,.65,-30,.15,1.4,.15);}
  for(const {shape,mat,tag,matrices}of groups.values()){const mesh=new THREE.InstancedMesh(shape,mat,matrices.length);matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));scene.add(mesh);if(tag==='foreground-lamp')foregroundLamps.push(mesh);}
  const water = new THREE.Mesh(geo(new THREE.PlaneGeometry(240,240)),p.water);water.rotation.x=-Math.PI/2;water.position.y=-.75;scene.add(water);
  const backdropMaterial=new THREE.MeshBasicMaterial({color:'#587487',fog:false,toneMapped:false});extra.push(backdropMaterial);
  const backdrop=new THREE.Mesh(geo(new THREE.PlaneGeometry(260,146)),backdropMaterial);scene.add(backdrop);
  assets.loadImage('/assets/chase/harbor-blue-hour-v2.png',map=>{backdropMaterial.map=map;backdropMaterial.color.set('#ffffff');backdropMaterial.needsUpdate=true;});

  const bikes=Object.fromEntries(['police','thief'].map(role=>{
    const bike=createMotorcycle(assets,role);scene.add(bike.root);
    const label=document.createElement('span');label.className=`chase-scene-label ${role}`;label.setAttribute('aria-hidden','true');host.appendChild(label);
    const positions=new Float32Array(18*6),uvs=[],indices=[];
    for(let i=0;i<18;i++){uvs.push(0,i/17,1,i/17);if(i<17){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}
    const geometry=geo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=128;const context=canvas.getContext('2d');
    for(let y=0;y<128;y++)for(let x=0;x<32;x++){const alpha=Math.max(0,1-Math.abs(x-15.5)/16)**2*(1-y/128);context.fillStyle=`rgba(255,255,255,${alpha})`;context.fillRect(x,y,1,1);}
    const material=new THREE.MeshBasicMaterial({map:assets.tex(canvas),color:role==='police'?'#58dfff':'#ff9c50',transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});extra.push(material);
    const trail=new THREE.Mesh(geometry,material);trail.frustumCulled=false;scene.add(trail);
    return[role,{...bike,label,positions,trail,trailMaterial:material,lastMove:0}];
  }));
  const siren=new THREE.PointLight('#58dfff',1.8,9,2);scene.add(siren);
  const ringMaterial=new THREE.MeshBasicMaterial({color:'#89eaff',transparent:true,opacity:0,depthWrite:false});extra.push(ringMaterial);
  const ring=new THREE.Mesh(geo(new THREE.TorusGeometry(1,.035,4,48)),ringMaterial);ring.rotation.x=-Math.PI/2;scene.add(ring);let contactAt=0;
  const distanceOverlay=document.createElement('div');distanceOverlay.className='chase-distance-overlay';distanceOverlay.setAttribute('aria-hidden','true');host.appendChild(distanceOverlay);
  const svgElement=name=>document.createElementNS('http://www.w3.org/2000/svg',name);
  const distanceSvg=svgElement('svg'),defs=svgElement('defs'),gradient=svgElement('linearGradient');
  const gradientId=`chase-gap-${Math.random().toString(36).slice(2)}`;gradient.id=gradientId;gradient.setAttribute('gradientUnits','userSpaceOnUse');
  for(const [offset,color] of [['0%','#7ae7ff'],['100%','#ffbd79']]){const stop=svgElement('stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',color);gradient.appendChild(stop);}
  defs.appendChild(gradient);distanceSvg.appendChild(defs);
  const distanceGlow=svgElement('path'),distancePath=svgElement('path');distanceGlow.classList.add('distance-glow');distancePath.classList.add('distance-path');
  for(const path of [distanceGlow,distancePath]){path.setAttribute('stroke',`url(#${gradientId})`);distanceSvg.appendChild(path);}
  const distanceDots=['police','thief'].map(role=>{const dot=svgElement('circle');dot.setAttribute('r','4');dot.classList.add(role);distanceSvg.appendChild(dot);return dot;});
  distanceOverlay.appendChild(distanceSvg);const distanceLabel=document.createElement('span');distanceLabel.className='chase-distance-label';distanceOverlay.appendChild(distanceLabel);
  const look=new THREE.Vector3(),smoothLook=new THREE.Vector3(),desired=new THREE.Vector3(),marker=new THREE.Vector3(),horizontal=new THREE.Vector3();
  const forward=new THREE.Vector3(),right=new THREE.Vector3(),cameraUp=new THREE.Vector3(),relative=new THREE.Vector3(),worldUp=new THREE.Vector3(0,1,0);
  function resize(){const rect=host.getBoundingClientRect();if(!rect.width||!rect.height)return;width=rect.width;height=rect.height;updateSize();}
  function updateSize(){const budget=quality==='high'?2600000:quality==='smooth'?950000:1600000;const dpr=quality==='smooth'?1:quality==='high'?Math.min(1.7,devicePixelRatio||1):Math.min(ratio,devicePixelRatio||1);renderer.setPixelRatio(Math.max(.65,Math.min(dpr,Math.sqrt(budget/(width*height)))));renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  function frame(time){
    if(disposed)return;const delta=Math.max(0,Math.min(.05,(time-previous)/1000));previous=time;
    const view=readState(),state=view.state||{phase:'lobby'},track=state.trackMeters||520;
    // Street lamps on the camera side would cover riders in the low side view.
    for(const lamp of foregroundLamps)lamp.visible=view.camera!=='pursuit';
    const preview=[{id:'preview-police',role:'police',position:0,name:'警察'},{id:'preview-thief',role:'thief',position:16,name:'小偷'}];
    const display=motion.step({...state,players:state.players?.length?state.players:preview},delta);
    const police=display.find(player=>player.role==='police')||preview[0],thief=display.find(player=>player.role==='thief')||preview[1];
    const points={police:chasePoint(police.position,track),thief:chasePoint(thief.position,track)};
    for(const role of ['police','thief']){
      const player=role==='police'?police:thief,point=chaseRiderPoint(player.position,role,track),bike=bikes[role],active=state.phase==='running'&&Math.abs(player.moved||0)>.002;
      const parking = state.phase === 'finished' && state.result?.outcome === 'caught' && !state.result?.left ? (role === 'police' ? -.7 : .7) : 0;
      const lateral = bike.lateral || 0; bike.lateral = lateral + (parking-lateral)*(1-Math.exp(-delta*10));
      bike.root.position.set(point.x+point.tz*bike.lateral,.25,point.z-point.tx*bike.lateral);bike.root.rotation.y=Math.atan2(-point.tx,-point.tz);
      const tilt=active&&!reducedMotion?-.15:0;bike.lean.rotation.z+=(tilt-bike.lean.rotation.z)*(1-Math.exp(-delta*10));
      bike.lean.position.y=active&&!reducedMotion?Math.sin(time*.014)*.022:0;
      for(const wheel of bike.wheels)wheel.rotation.x-=(player.moved||0)*.245/.39;
      if(active)bike.lastMove=time;const fade=Math.max(0,1-(time-bike.lastMove)/500);bike.trail.visible=state.phase==='running'&&fade>0;
      if(bike.trail.visible){for(let i=0;i<18;i++){const tail=chaseRiderPoint(player.position-7-i*.9,role,track);for(let side=0;side<2;side++){const index=i*6+side*3,offset=(side-.5)*.44;bike.positions[index]=tail.x+tail.tz*offset;bike.positions[index+1]=.268;bike.positions[index+2]=tail.z-tail.tx*offset;}}bike.trail.geometry.attributes.position.needsUpdate=true;bike.trailMaterial.opacity=fade*.7;}
      bike.label.textContent=`${role==='police'?'警察':'小偷'} · ${player.id===view.userId?'你':player.bot?'电脑':player.name===role||player.id.toString().startsWith('preview')?'待命':player.name}`;
      bike.label.dataset.position=player.position.toFixed(2);
    }
    const centerX=(points.police.x+points.thief.x)/2,centerZ=(points.police.z+points.thief.z)/2,spread=Math.hypot(points.thief.x-points.police.x,points.thief.z-points.police.z);
    if(view.camera==='pursuit') {const framing=chasePursuitFrame(police.position,thief.position,width/height,track);desired.set(framing.position.x,framing.position.y,framing.position.z);look.set(framing.look.x,framing.look.y,framing.look.z);}
    else if(view.camera==='overview') {const vertical=height/width;desired.set(0,vertical>1?89:62,vertical>1?65:48);look.set(0,0,0);}
    else {const distance=17+Math.min(10,spread*.35);desired.set(centerX-points.police.tx*distance,5.6+Math.min(5,spread*.16),centerZ-points.police.tz*distance);look.set(centerX+points.police.tx*3,1.2,centerZ+points.police.tz*3);if(width<height){desired.y+=3;desired.x-=points.police.tx*5;desired.z-=points.police.tz*5;}}
    if(lastRound!==state.round||camera.position.length()<1){camera.position.copy(desired);smoothLook.copy(look);lastRound=state.round;}else {const blend=1-Math.exp(-delta*(reducedMotion?20:5));camera.position.lerp(desired,blend);smoothLook.lerp(look,blend);}
    camera.lookAt(smoothLook);
    if(view.camera==='pursuit'){
      // Keep both full silhouettes inside the frame during camera easing and viewport changes as well.
      forward.copy(smoothLook).sub(camera.position).normalize();right.copy(forward).cross(worldUp).normalize();cameraUp.copy(right).cross(forward).normalize();
      const tanVertical=Math.tan(camera.fov*Math.PI/360),tanHorizontal=tanVertical*camera.aspect;let correction=0;
      for(const role of ['police','thief']){relative.copy(bikes[role].root.position);relative.y=1.75;relative.sub(camera.position);const required=Math.max((Math.abs(relative.dot(right))+1.75)/(tanHorizontal*.82),(Math.abs(relative.dot(cameraUp))+1.75)/(tanVertical*.72));correction=Math.max(correction,required-relative.dot(forward));}
      if(correction>0){camera.position.addScaledVector(forward,-correction);camera.lookAt(smoothLook);}
    }
    camera.updateMatrixWorld();
    camera.getWorldDirection(horizontal);horizontal.y=0;horizontal.normalize();
    // Align the painted horizon with the distant water, rather than showing only the image's lower edge.
    backdrop.position.set(centerX+horizontal.x*115,-22,centerZ+horizontal.z*115);backdrop.lookAt(camera.position.x,-22,camera.position.z);
    assets.waterMap.offset.x=time*.000002;assets.waterMap.offset.y=Math.sin(time*.0002)*.006;
    siren.position.set(bikes.police.root.position.x,1.6,bikes.police.root.position.z);siren.intensity=reducedMotion?1.2:1.1+Math.sin(time*.008)*.7;
    if(state.phase==='finished'&&state.result?.outcome==='caught'&&!state.result?.left&&lastFinished!==state.round){contactAt=time;lastFinished=state.round;ring.position.set(points.thief.x,.29,points.thief.z);}
    const age=(time-contactAt)/1000;ring.visible=contactAt>0&&age<1.1;ring.scale.setScalar(.4+age*3);ringMaterial.opacity=Math.max(0,1-age/1.1)*.75;
    for(const role of ['police','thief']){const bike=bikes[role];marker.set(bike.root.position.x,3.45,bike.root.position.z).project(camera);bike.label.style.transform=`translate(-50%,-100%) translate(${(marker.x*.5+.5)*width}px,${(-marker.y*.5+.5)*height}px)`;bike.label.style.visibility=marker.z>1||Math.abs(marker.x)>1.1||Math.abs(marker.y)>1.1?'hidden':'visible';}
    const authoritativePolice=state.players?.find(player=>player.role==='police'),authoritativeThief=state.players?.find(player=>player.role==='thief');
    const gap=authoritativePolice&&authoritativeThief?Math.max(0,authoritativeThief.position-authoritativePolice.position):16;
    distanceOverlay.hidden=view.camera!=='pursuit'||state.phase==='finished'||gap>=track/4;
    host.dataset.camera=view.camera;host.dataset.gap=String(gap);
    if(!distanceOverlay.hidden){
      distanceSvg.setAttribute('viewBox',`0 0 ${width} ${height}`);const samples=[];
      for(let i=0;i<=24;i++){const point=chasePoint(police.position+(thief.position-police.position)*i/24,track);marker.set(point.x,.32,point.z).project(camera);samples.push({x:(marker.x*.5+.5)*width,y:(-marker.y*.5+.5)*height});}
      const path=samples.map((point,i)=>`${i?'L':'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');distanceGlow.setAttribute('d',path);distancePath.setAttribute('d',path);
      const start=samples[0],end=samples.at(-1);gradient.setAttribute('x1',start.x);gradient.setAttribute('y1',start.y);gradient.setAttribute('x2',end.x);gradient.setAttribute('y2',end.y);
      [start,end].forEach((point,index)=>{distanceDots[index].setAttribute('cx',point.x);distanceDots[index].setAttribute('cy',point.y);});
      const pressure=chasePressure(gap,track);distanceOverlay.dataset.level=state.phase==='running'?pressure.level:'normal';
      distanceLabel.textContent=`${pressure.label} m`;distanceLabel.style.display=height<240?'none':'';distanceLabel.style.transform=`translate(-50%,0) translate(${Math.max(45,Math.min(width-45,(start.x+end.x)/2))}px,${Math.min(height-84,Math.max(start.y,end.y)+24)}px)`;
    }
    renderer.render(scene,camera);frames++;
    if(time-statsAt>1000){const fps=frames*1000/(time-statsAt);host.dataset.fps=fps.toFixed(1);host.dataset.drawCalls=String(renderer.info.render.calls);host.dataset.quality=quality;frames=0;statsAt=time;slow=fps<42?slow+1:0;if(quality==='auto'&&slow>=3&&ratio>.7){ratio=Math.max(.7,ratio-.15);slow=0;updateSize();}}
    raf=requestAnimationFrame(frame);
  }
  const lost=event=>{event.preventDefault();onError('3D 场景暂时不可用，可以继续打字比赛。');};renderer.domElement.addEventListener('webglcontextlost',lost);raf=requestAnimationFrame(frame);
  return {setQuality(value){quality=value;slow=0;updateSize();},dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',lost);distanceOverlay.remove();Object.values(bikes).forEach(bike=>bike.label.remove());scene.traverse(item=>{if(item.isInstancedMesh)item.dispose();});extra.forEach(material=>material.dispose());assets.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}
