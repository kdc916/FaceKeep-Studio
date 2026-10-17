// FaceKeep Studio AI Detector, MediaPipe Tasks Vision; runs locally in the browser.
// No photographs are uploaded. The optional CDN downloads code/model only.
const PACKAGE_VERSION='0.10.35';
const BASE=new URL('./',import.meta.url);
const REMOTE_WASM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${PACKAGE_VERSION}/wasm`;
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
   return {full,short,engine:hasModels&&wasmURL===localWasm?'내장 MediaPipe BlazeFace':'MediaPipe BlazeFace (온라인 모델)'};
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
function tilesFor(W,H){
 const large=Math.max(W,H)>3000,cols=large?3:2,rows=large&&H>2600?3:2;
 const out=[];
 for(let iy=0;iy<rows;iy++)for(let ix=0;ix<cols;ix++){
  const w=Math.min(W,W/cols*1.24),h=Math.min(H,H/rows*1.24);
  out.push({x:Math.max(0,Math.min(W-w,W*(ix+0.5)/cols-w/2)),
   y:Math.max(0,Math.min(H-h,H*(iy+0.5)/rows-h/2)),w,h});
 }
 return out;
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
export async function detectFacesNeural(image,{detailed=false,status=()=>{},cancelled=()=>false}={}){
 const ai=await ready(status),W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
 const passes=[{r:{x:0,y:0,w:W,h:H},maxSide:1400,detector:ai.full,tag:'전체 AI'}];
 if(ai.short)passes.push({r:{x:0,y:0,w:W,h:H},maxSide:1400,detector:ai.short,tag:'근거리 AI'});
 if(Math.max(W,H)>=1500||detailed){
  for(const [i,r] of tilesFor(W,H).entries()){
   passes.push({r,maxSide:1200,detector:ai.full,tag:`확대 AI ${i+1}`});
   if(ai.short&&detailed)passes.push({r,maxSide:1200,detector:ai.short,tag:`근거리 확대 ${i+1}`});
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
 return{faces:found,engine:ai.engine,passes:passes.length,primary:found.length};
}
