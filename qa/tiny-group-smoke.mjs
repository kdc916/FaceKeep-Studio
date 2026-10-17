import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8787/',{waitUntil:'domcontentloaded'});
 const summary=await page.evaluate(async()=>{
  const lena=new Image();lena.src='/qa/lena.jpg';await lena.decode();
  const c=document.createElement('canvas');c.width=474;c.height=343;
  const ctx=c.getContext('2d');ctx.fillStyle='#bac3ce';ctx.fillRect(0,0,474,343);
  const faces=[];
  for(let i=0;i<7;i++){
   const x=22+i*63,y=70+(i%2)*8,sz=[41,45,37,44,39,43,36][i];
   ctx.save();ctx.translate(x+sz/2,y+sz/2);ctx.rotate((i%3-1)*.045);ctx.filter=i===4?'blur(.5px)':'none';
   ctx.drawImage(lena,180,161,235,235,-sz/2,-sz/2,sz,sz);ctx.restore();
   faces.push({x:x+sz/2,y:y+sz/2,size:sz});
  }
  const {detectFacesNeural}=await import('./ai-detector.js');
  const fast=await detectFacesNeural(c,{detailed:false});
  const detail=await detectFacesNeural(c,{detailed:true});
  const hit=result=>faces.filter(t=>result.faces.some(f=>Math.hypot(f.x+f.w/2-t.x,f.y+f.h/2-t.y)<t.size*.55)).length;
  return{fast:{hits:hit(fast),faces:fast.faces.length,rescued:fast.rescued,scanPasses:fast.passes,rescueScans:fast.rescueScans},
    detailed:{hits:hit(detail),faces:detail.faces.length,rescued:detail.rescued,scanPasses:detail.passes,rescueScans:detail.rescueScans}};
 });
 console.log('TINY_GROUP_QA',JSON.stringify(summary));
 console.log('TINY_GROUP_ERRORS',JSON.stringify(errors));
 if(summary.fast.hits<4||summary.detailed.hits<5||errors.length)process.exitCode=1;
 await page.close();
}finally{await browser.close()}
