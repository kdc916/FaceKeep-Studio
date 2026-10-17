import {chromium} from 'playwright';
const executablePath=process.env.CHROME_BIN||'/usr/bin/google-chrome';
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl']});
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 const problems=[];page.on('pageerror',e=>problems.push(e.message));
 await page.goto('http://127.0.0.1:8787/',{waitUntil:'domcontentloaded'});
 const summary=await page.evaluate(async()=>{
  const lena=new Image();lena.src='/qa/lena.jpg';await lena.decode();
  const c=document.createElement('canvas');c.width=2048;c.height=819;const ctx=c.getContext('2d');
  ctx.fillStyle='#fafafa';ctx.fillRect(0,0,c.width,c.height);
  const reference=[];
  for(let row=0;row<2;row++)for(let col=0;col<10;col++){
   const i=row*10+col,side=[78,84,95,70,90][(row*3+col)%5];
   const px=39+col*196,py=125+row*310;
   ctx.save();ctx.translate(px+side/2,py+side/2);ctx.rotate((i%3-1)*Math.PI/48);
   if(i%7===2)ctx.filter='blur(0.65px)';
   ctx.drawImage(lena,180,161,235,235,-side/2,-side/2,side,side);
   ctx.restore();
   reference.push({x:px+side/2,y:py+side/2,w:side,h:side});
  }
  const {detectFacesNeural}=await import('./ai-detector.js');
  const fast=await detectFacesNeural(c,{detailed:false,status:()=>{}});
  const precise=await detectFacesNeural(c,{detailed:true,status:()=>{}});
  const score=result=>{
   let tp=0;for(const t of reference){if(result.faces.some(f=>{
    const cx=f.x+f.w/2,cy=f.y+f.h/2;
    return Math.hypot(cx-t.x,cy-t.y)<t.w*.5;
   }))tp++}
   return {hits:tp,total:reference.length,candidates:result.primary,verified:result.faces.length,rejected:result.rejected,passes:result.passes};
  };
  return {dimensions:[c.width,c.height],fast:score(fast),detailed:score(precise),
    engine:precise.engine,
    uncovered:reference.filter(t=>!precise.faces.some(f=>Math.hypot(f.x+f.w/2-t.x,f.y+f.h/2-t.y)<t.w*.5))};
 });
 console.log('PANORAMA_QA',JSON.stringify(summary));
 console.log('PANORAMA_PAGE_ERRORS',JSON.stringify(problems));
 if(problems.length||summary.fast.hits<14||summary.detailed.hits<18)process.exitCode=1;
 await page.close();
}finally{await browser.close()}
