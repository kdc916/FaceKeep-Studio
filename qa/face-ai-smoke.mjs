import {chromium} from 'playwright';
const exe=process.env.CHROME_BIN||'/usr/bin/google-chrome';
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl']});
const page=await browser.newPage({viewport:{width:1366,height:768}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',msg=>{if(msg.type()==='error')console.log('browser-error:',msg.text().slice(0,400))});
try{
 await page.goto('http://127.0.0.1:8787/',{waitUntil:'domcontentloaded'});
 const outcome=await page.evaluate(async()=>{
  const img=new Image();img.src='/qa/lena.jpg';await img.decode();
  const {detectFacesNeural}=await import('./ai-detector.js');
  const single=await detectFacesNeural(img,{detailed:false,status:()=>{}});
  const c=document.createElement('canvas');c.width=1536;c.height=1536;
  const ctx=c.getContext('2d');
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)ctx.drawImage(img,x*512,y*512,512,512);
  const group=await detectFacesNeural(c,{detailed:true,status:()=>{}});
  const tilt=document.createElement('canvas');tilt.width=512;tilt.height=512;
  const tc=tilt.getContext('2d');tc.fillStyle='white';tc.fillRect(0,0,512,512);
  tc.translate(256,256);tc.rotate(20*Math.PI/180);tc.drawImage(img,-256,-256,512,512);
  const rotated=await detectFacesNeural(tilt,{detailed:true,status:()=>{}});
  const fuzzy=document.createElement('canvas');fuzzy.width=512;fuzzy.height=512;
  const fc=fuzzy.getContext('2d');fc.filter='blur(2px)';fc.drawImage(img,0,0,512,512);fc.filter='none';
  const blurred=await detectFacesNeural(fuzzy,{detailed:false,status:()=>{}});
  const detected=group.faces.sort((a,b)=>b.score-a.score);
  const dedup=[];
  const overlaps=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),w=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-x),h=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-y);const ins=w*h;return ins/(a.w*a.h+b.w*b.h-ins)>.28||ins/Math.min(a.w*a.h,b.w*b.h)>.58};
  for(const f of detected)if(!dedup.some(a=>overlaps(a,f)))dedup.push(f);
  return {engine:single.engine,singleFaces:single.faces.length,rotatedFaces:rotated.faces.length,blurredFaces:blurred.faces.length,montageRaw:group.faces.length,montageUnique:dedup.length,
    groupBoxes:dedup.map(b=>({x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.w),h:Math.round(b.h)}))};
 });
 console.log('FACEKEEP_QA',JSON.stringify(outcome));
 console.log('PAGE_ERRORS',JSON.stringify(errors));
 if(outcome.singleFaces<1||outcome.rotatedFaces<1||outcome.blurredFaces<1||outcome.montageUnique<8||errors.length)process.exitCode=1;
}finally{await browser.close()}
