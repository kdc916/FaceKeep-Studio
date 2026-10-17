// FaceKeep Studio AI Detector, MediaPipe Tasks Vision; runs locally in the browser.
// No photographs are uploaded. The optional CDN downloads code/model only.
const PACKAGE_VERSION='0.10.35';
const BASE=new URL('./',import.meta.url);
const REMOTE_WASM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${PACKAGE_VERSION}/wasm`;
const LANDMARKER_MODEL='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MODELS={
 full:'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite',
 short:'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
};
let cached=null;
const tick=()=>new Promise(r=>setTimeout(r,0));
async function exists(url){try{const r=await fetch(url,{method:'HEAD',cache:'force-cache'});return r.ok}catch{return false}}
async function loadVisionModule(){
 const paths=[new URL('./vendor/vision_bundle.mjs',BASE).href,
   `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${PACKAGE_VERSION}/vision_bundle.mjs`,
   `https://unpkg.com/@mediapipe/tasks-vision@${PACKAGE_VERSION}/vision_bundle.mjs`];
 let last;
 for(const path of paths){try{const mod=await import(/* @vite-ignore */path);if(mod.FaceDetector&&mod.FilesetResolver)return mod;last=Error('얼굴 감지 API 없음')}catch(e){last=e}}
 throw Error(`AI 감지 모듈 로딩 실패: ${last?.message||last}`);
}
async function createDetector(mod,wasm,modelURL,minConfidence){
 return await mod.FaceDetector.createFromOptions(wasm,{
  baseOptions:{modelAssetPath:modelURL,delegate:'CPU'},
  runningMode:'IMAGE',minDetectionConfidence:minConfidence,minSuppressionThreshold:0.28
 });
}
async function initialize(status){
 status('MediaPipe AI 얼굴 감지 엔진 준비 중…');
 const mod=await loadVisionModule();
 const localWasm=new URL('./vendor/wasm/',BASE).href;
 const localModels={full:new URL('./vendor/models/full_range.tflite',BASE).href,
 short:new URL('./vendor/models/short_range.tflite',BASE).href};
 const hasWasm=await exists(localWasm+'vision_wasm_internal.wasm');
 const hasModels=hasWasm && await exists(localModels.full);
 const wasmCandidates=hasWasm?[localWasm,REMOTE_WASM]:[REMOTE_WASM];
 let last=null;
 for(const wasmURL of wasmCandidates){
  try{
   const wasm=await mod.FilesetResolver.forVisionTasks(wasmURL);
   const primaryURL=hasModels?localModels.full:MODELS.full;
   status('BlazeFace 전체 범위 얼굴 감지 모델 로딩 중…');
   const full=await createDetector(mod,wasm,primaryURL,0.28);
   let short=null;
   try{
    const shortURL=(hasModels&&await exists(localModels.short))?localModels.short:MODELS.short;
    short=await createDetector(mod,wasm,shortURL,0.33);
   }catch(e){console.warn('FaceKeep: short-range model unavailable',e)}
   return {full,short,mod,wasm,verifierPromise:null,scannerPromise:null,engine:hasModels&&wasmURL===localWasm?'내장 MediaPipe BlazeFace':'MediaPipe BlazeFace (온라인 모델)'};
  }catch(e){last=e;console.warn('FaceKeep: AI init candidate failed',wasmURL,e)}
 }
 throw Error(`AI 모델 초기화 실패: ${last?.message||last}`);
}
async function ready(status){if(!cached){cached=initialize(status).catch(e=>{cached=null;throw e})}return cached}
function canvasRegion(im,r,maxSide=1400){
 const scale=Math.min(1,maxSide/Math.max(r.w,r.h));const w=Math.max(24,Math.round(r.w*scale)),h=Math.max(24,Math.round(r.h*scale));
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const ctx=c.getContext('2d',{alpha:false});ctx.drawImage(im,r.x,r.y,r.w,r.h,0,0,w,h);
 return{canvas:c,sx:r.w/w,sy:r.h/h};
}
function results(detector,canvas,r,sx,sy,tag){
 const detection=detector.detect(canvas).detections||[];
 return detection.map(d=>{
  const b=d.boundingBox||{};const score=d.categories?.[0]?.score??0.5;
  return {x:r.x+(b.originX||0)*sx,y:r.y+(b.originY||0)*sy,
   w:(b.width||0)*sx,h:(b.height||0)*sy,score:2+Math.min(0.3,score*0.3),source:tag,confidence:score};
 }).filter(b=>b.w>=11&&b.h>=11&&b.w<r.w*0.92&&b.h<r.h*0.94&&b.x>=-15&&b.y>=-15);
}
// Dense, overlapping pixel-space regions: panoramic school/group photographs
// can contain many 20-50px faces lost by long-axis downsampling.
function axisStarts(length,windowSize,overlap=.27){
 if(length<=windowSize)return[0];
 const n=Math.ceil((length-windowSize)/(windowSize*(1-overlap)))+1;
 const out=[];for(let i=0;i<n;i++)out.push(Math.round(i*(length-windowSize)/(n-1)));
 return [...new Set(out)];
}
function tilesFor(W,H,{detailed=false,dense=false,targetOverride=null,limitOverride=null}={}){
 const wide=W/H>=1.8,tall=H/W>=2;
 const smallInput=Math.min(W,H)<550;
 const target=targetOverride||(dense?(smallInput?(detailed?215:270):(detailed?360:420)):(detailed?850:1100));
 const limit=limitOverride||(dense?(detailed?42:30):18);
 // Keep FULL image coverage. Sampling every Nth tile creates undetected gaps.
 let tileW,tileH,regions=[];
 for(let attempt=0;attempt<16;attempt++){
  const t=target*Math.pow(1.10,attempt);
  tileW=Math.min(W,t);tileH=Math.min(H,t*(wide?.9:1));
  if(tall){tileW=Math.min(W,t*.88);tileH=Math.min(H,t)}
  const xs=axisStarts(W,tileW,dense?.33:.27);
  const ys=axisStarts(H,tileH,dense?.33:.27);
  regions=[];for(const y of ys)for(const x of xs)regions.push({x,y,w:tileW,h:tileH});
  if(regions.length<=limit)break;
 }
 return regions;
}
function rotatedPass(detector,im,angle,W,H){
 const original=canvasRegion(im,{x:0,y:0,w:W,h:H},1200);
 const base=original.canvas,t=angle*Math.PI/180,co=Math.cos(t),si=Math.sin(t);
 const w=Math.ceil(Math.abs(base.width*co)+Math.abs(base.height*si)),h=Math.ceil(Math.abs(base.width*si)+Math.abs(base.height*co));
 const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');
 ctx.translate(w/2,h/2);ctx.rotate(t);ctx.drawImage(base,-base.width/2,-base.height/2);
 const out=[];
 for(const d of (detector.detect(c).detections||[])){
  const b=d.boundingBox;if(!b)continue;
  const mx=b.originX+b.width/2-w/2,my=b.originY+b.height/2-h/2;
  const cx=(mx*co+my*si+base.width/2)*original.sx;
  const cy=(-mx*si+my*co+base.height/2)*original.sy;
  const side=Math.max(b.width,b.height)*Math.max(original.sx,original.sy)*1.04;
  out.push({x:cx-side/2,y:cy-side/2,w:side,h:side,score:2.18,source:`회전 ${angle}°`,confidence:d.categories?.[0]?.score||0.5});
 }
 return out.filter(b=>b.x>=-15&&b.y>=-15&&b.x+b.w<=W+15&&b.y+b.h<=H+15);
}

function matching(a,b){
 const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);
 const w=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-x),h=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-y);
 const inter=w*h;if(!inter)return false;
 const iou=inter/(a.w*a.h+b.w*b.h-inter),contained=inter/Math.min(a.w*a.h,b.w*b.h);
 const cx=Math.abs((a.x+a.w/2)-(b.x+b.w/2)),cy=Math.abs((a.y+a.h/2)-(b.y+b.h/2));
 return iou>0.27||(contained>0.63&&cx<Math.min(a.w,b.w)*0.40&&cy<Math.min(a.h,b.h)*0.40);
}
function clusterCandidates(boxes){
 const groups=[];
 for(const b of [...boxes].sort((a,b)=>(b.confidence||0)-(a.confidence||0))){
  const g=groups.find(g=>matching(g.best,b));
  if(g){g.hits++;g.sources.add(b.source||'unknown');g.confidence=Math.max(g.confidence,b.confidence||0)}
  else groups.push({best:b,hits:1,sources:new Set([b.source||'unknown']),confidence:b.confidence||0});
 }
 return groups;
}
async function verifierReady(ai){
 if(ai.verifierPromise)return ai.verifierPromise;
 ai.verifierPromise=(async()=>{
  const local=new URL('./vendor/models/face_landmarker.task',BASE).href;
  const model=(await exists(local))?local:LANDMARKER_MODEL;
  const landmarker=await ai.mod.FaceLandmarker.createFromOptions(ai.wasm,{
   baseOptions:{modelAssetPath:model,delegate:'CPU'},
   runningMode:'IMAGE',numFaces:1,minFaceDetectionConfidence:0.48,minFacePresenceConfidence:0.52,
   outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false
  });
  return landmarker;
 })().catch(e=>{console.warn('FaceKeep face landmark verifier unavailable:',e);return null});
 return ai.verifierPromise;
}
// Independent face discovery: FaceLandmarker also contains a face detector.
// It can recover faces that BlazeFace never proposed.
async function scannerReady(ai){
 if(ai.scannerPromise)return ai.scannerPromise;
 ai.scannerPromise=(async()=>{
  const local=new URL('./vendor/models/face_landmarker.task',BASE).href;
  const model=(await exists(local))?local:LANDMARKER_MODEL;
  return ai.mod.FaceLandmarker.createFromOptions(ai.wasm,{
   baseOptions:{modelAssetPath:model,delegate:'CPU'},runningMode:'IMAGE',numFaces:12,
   minFaceDetectionConfidence:.32,minFacePresenceConfidence:.38,
   outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false
  });
 })().catch(e=>{console.warn('FaceKeep independent landmarker scan unavailable',e);return null});
 return ai.scannerPromise;
}
function boxFromLandmarks(landmarks,r,W,H,source='랜드마크 보강'){
 if(!landmarks||landmarks.length<450)return null;
 const ids=[10,152,234,454,33,263,1,4,61,291];
 if(ids.some(i=>!landmarks[i]||!Number.isFinite(landmarks[i].x)||!Number.isFinite(landmarks[i].y)))return null;
 const xx=[10,152,234,454,33,263].map(i=>landmarks[i].x),yy=[10,152,234,454,33,263].map(i=>landmarks[i].y);
 const mnx=Math.min(...xx),mxx=Math.max(...xx),mny=Math.min(...yy),mxy=Math.max(...yy);
 let w=(mxx-mnx)*r.w*1.20,h=(mxy-mny)*r.h*1.22;
 if(w<9||h<9||w>r.w*.92||h>r.h*.93)return null;
 const cx=r.x+(mnx+mxx)/2*r.w,cy=r.y+(mny+mxy)/2*r.h;
 const x=Math.max(0,cx-w/2),y=Math.max(0,cy-h/2);
 w=Math.min(w,W-x);h=Math.min(h,H-y);
 if(w<9||h<9)return null;
 return{x,y,w,h,score:2.8,confidence:1,source,verified:true};
}
async function rescueFaces(ai,image,{detailed=false,status=()=>{},cancelled=()=>false}={}){
 const scanner=await scannerReady(ai);
 if(!scanner)return{faces:[],scans:0};
 const W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
 const small=Math.min(W,H)<550;
 const target=small?(detailed?175:200):(detailed?430:650);
 const regions=[{x:0,y:0,w:W,h:H},...tilesFor(W,H,{dense:true,detailed,targetOverride:target,limitOverride:detailed?38:22})];
 const faces=[];
 for(let i=0;i<regions.length;i++){
  if(cancelled())return{faces:[],scans:i,cancelled:true};
  const r=regions[i];status(`누락 얼굴 추가 탐색 ${i+1}/${regions.length}`);
  const {canvas}=canvasRegion(image,r,1100);
  try{
   const found=scanner.detect(canvas).faceLandmarks||[];
   for(const landmarks of found){
    const box=boxFromLandmarks(landmarks,r,W,H);
    if(box)faces.push(box);
   }
  }catch(e){console.warn('FaceKeep additional face scan failed',e)}
  if(i%3===2)await tick();
 }
 return{faces,scans:regions.length};
}
function cropCandidate(image,b){
 const W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
 const cx=b.x+b.w/2,cy=b.y+b.h/2;
 const rw=Math.min(W,Math.max(80,b.w*1.7)),rh=Math.min(H,Math.max(80,b.h*1.7));
 const x=Math.max(0,Math.min(W-rw,cx-rw/2)),y=Math.max(0,Math.min(H-rh,cy-rh/2));
 const size=384,c=document.createElement('canvas');c.width=size;c.height=size;
 const ctx=c.getContext('2d',{alpha:false});
 ctx.fillStyle='#666';ctx.fillRect(0,0,size,size);ctx.drawImage(image,x,y,rw,rh,0,0,size,size);
 return {canvas:c,x,y,w:rw,h:rh};
}
function geometryVerified(landmarks,crop,b){
 if(!landmarks||landmarks.length<300)return false;
 const keyIds=[1,4,10,33,61,152,168,263,291];
 const valid=keyIds.map(i=>landmarks[i]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
 if(valid.length<8)return false;
 const nose=landmarks[1];
 const nx=crop.x+nose.x*crop.w,ny=crop.y+nose.y*crop.h;
 const cx=b.x+b.w/2,cy=b.y+b.h/2;
 const nearX=Math.abs(nx-cx)<b.w*0.58,nearY=Math.abs(ny-cy)<b.h*0.58;
 const eyeL=landmarks[33],eyeR=landmarks[263],chin=landmarks[152],brow=landmarks[10];
 const eyeSep=Math.hypot((eyeL.x-eyeR.x)*crop.w,(eyeL.y-eyeR.y)*crop.h);
 const vertical=Math.hypot((chin.x-brow.x)*crop.w,(chin.y-brow.y)*crop.h);
 return nearX&&nearY&&eyeSep>b.w*0.11&&vertical>b.h*0.20;
}
async function verifyClusters(ai,image,boxes,{status=()=>{},cancelled=()=>false}={}){
 const grouped=clusterCandidates(boxes);
 const verifier=await verifierReady(ai);
 const accepted=[],rejected=[];
 if(!verifier){
  for(const g of grouped){
   if(g.sources.size>=2&&g.hits>=2&&g.confidence>=.65)accepted.push(g.best);
   else rejected.push(g.best);
  }
  return{faces:accepted,rejected:rejected.length,landmarksAvailable:false};
 }
 for(let i=0;i<grouped.length;i++){
  if(cancelled())break;
  const g=grouped[i];status(`얼굴 특징점 검증 ${i+1}/${grouped.length}`);
  const crop=cropCandidate(image,g.best);
  let improved=null;
  try{
   const answer=verifier.detect(crop.canvas);
   for(const lm of answer.faceLandmarks||[]){
    if(!geometryVerified(lm,crop,g.best))continue;
    const refined=boxFromLandmarks(lm,crop,image.naturalWidth||image.width,image.naturalHeight||image.height,'특징점 검증');
    if(refined && (!improved || matching(refined,g.best)))improved=refined;
   }
  }catch(e){console.warn('Face landmark candidate verification error',e)}
  if(improved)accepted.push({...improved,score:2.8,verified:true});
  else rejected.push(g.best);
  if(i%3===2)await tick();
 }
 return{faces:accepted,rejected:rejected.length,landmarksAvailable:true};
}
export async function verifyExtraCandidates(image,boxes,{status=()=>{},cancelled=()=>false}={}){
 const ai=await ready(status);
 return verifyClusters(ai,image,boxes,{status,cancelled});
}
export async function detectFacesNeural(image,{detailed=false,status=()=>{},cancelled=()=>false}={}){
 const ai=await ready(status),W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
 const passes=[{r:{x:0,y:0,w:W,h:H},maxSide:1400,detector:ai.full,tag:'전체 AI'}];
 if(ai.short)passes.push({r:{x:0,y:0,w:W,h:H},maxSide:1400,detector:ai.short,tag:'근거리 AI'});
 if(Math.max(W,H)>=1200||detailed){
  const coarse=tilesFor(W,H,{detailed,dense:false});
  for(const [i,r] of coarse.entries()){
   passes.push({r,maxSide:1200,detector:ai.full,tag:`확대 AI ${i+1}`});
   if(ai.short&&detailed)passes.push({r,maxSide:1200,detector:ai.short,tag:`근거리 확대 ${i+1}`});
  }
 }
 // Wide team/school photos need a finer scan even when "Auto" is selected.
 const groupLike=(W>=400&&W/H>=1.25)||(H>=750&&H/W>=1.6);
 if(detailed||groupLike){
  const dense=tilesFor(W,H,{detailed,dense:true});
  for(const [i,r] of dense.entries()){
   passes.push({r,maxSide:1150,detector:ai.full,tag:`작은 얼굴 정밀 ${i+1}/${dense.length}`});
   if(ai.short)passes.push({r,maxSide:1150,detector:ai.short,tag:`작은 얼굴 보조 ${i+1}/${dense.length}`});
  }
 }
 const found=[];
 for(let i=0;i<passes.length;i++){
  if(cancelled())return{faces:[],engine:ai.engine,passes:i,cancelled:true};
  const p=passes[i];status(`${p.tag} (${i+1}/${passes.length}) · AI 분석 중`);
  const {canvas,sx,sy}=canvasRegion(image,p.r,p.maxSide);
  found.push(...results(p.detector,canvas,p.r,sx,sy,p.tag));
  await tick();
 }
 if(detailed&&ai.short){
  for(const angle of [-20,20]){
   if(cancelled())break;
   status(`기울어진 얼굴 ${angle}° 보강 탐지 중`);
   found.push(...rotatedPass(ai.short,image,angle,W,H));await tick();
  }
 }
 const verified=await verifyClusters(ai,image,found,{status,cancelled});
 const rescued=await rescueFaces(ai,image,{detailed,status,cancelled});
 if(cancelled())return{faces:[],cancelled:true,passes:passes.length};
 const final=clusterCandidates([...verified.faces,...rescued.faces]).map(g=>g.best);
 return{faces:final,rejected:verified.rejected,landmarksAvailable:verified.landmarksAvailable,
  rescued:final.filter(b=>b.source==='랜드마크 보강').length,rescueScans:rescued.scans,
  engine:ai.engine+(verified.landmarksAvailable?' + 얼굴 특징점 검증·독립 탐색':' (검증기 미사용)'),passes:passes.length,primary:found.length};
}
