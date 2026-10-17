import {chromium} from 'playwright';
const executablePath=process.env.CHROME_BIN||'/usr/bin/google-chrome';
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
try{
 for(const [width,height] of [[320,700],[390,844],[430,932],[844,390],[1366,768]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:width<600,hasTouch:true});
  page.on('pageerror',e=>errors.push(`${width}x${height}:${e.message}`));
  page.route('**/ai-detector.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:
   "export async function detectFacesNeural(image){return {engine:'Portrait QA Mock',passes:1,faces:Array.from({length:4},(_,i)=>({x:160,y:i*600+130,w:280,h:300,score:2.5}))}}" }));
  await page.goto('http://127.0.0.1:8787/',{waitUntil:'domcontentloaded'});
  const png=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=600;c.height=2400;
   const x=c.getContext('2d');x.fillStyle='#535b60';x.fillRect(0,0,600,2400);
   for(let i=0;i<4;i++){const y=i*600;x.strokeStyle='white';x.lineWidth=16;x.strokeRect(6,y+6,588,588);
    x.fillStyle='#e9bb8f';x.beginPath();x.ellipse(300,y+280,140,160,0,0,Math.PI*2);x.fill();}
   return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#fileInput').setInputFiles({name:'four-cut.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>document.querySelector('#detectedCount')?.textContent==='4',{timeout:45000});
  const geometry=()=>page.evaluate(()=>{
   const canvas=document.querySelector('#photoCanvas').getBoundingClientRect();
   const viewport=document.querySelector('#viewport').getBoundingClientRect();
   const scroller=document.querySelector('#viewport');
   return{imageW:canvas.width,imageH:canvas.height,inside:
    canvas.left>=viewport.left-2&&canvas.right<=viewport.right+2&&
    canvas.top>=viewport.top-2&&canvas.bottom<=viewport.bottom+2,
    scrollTop:scroller.scrollTop,scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,
    scrollWidth:scroller.scrollWidth,clientWidth:scroller.clientWidth};
  });
  const fit=await geometry();
  await page.locator('#actualBtn').click();
  await page.waitForTimeout(120);
  const actual=await geometry();
  await page.locator('#panMode').click();
  const box=await page.locator('#viewport').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height*0.77);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height*0.23,{steps:12});
  await page.mouse.up();
  const panned=await geometry();
  await page.locator('#selectMode').click();
  await page.locator('#faceList .face-pill').last().click();
  const focused=await geometry();
  const keep=await page.locator('#keepCount').innerText();
  const target=await page.evaluate(()=>{
   const b=document.querySelector('#photoCanvas').getBoundingClientRect();
   return{x:b.left+b.width*0.5,y:b.top+b.height*(1930/2400)};
  });
  if(target.y>0&&target.y<height)await page.mouse.click(target.x,target.y);
  const keepAfter=await page.locator('#keepCount').innerText();
  await page.locator('#fitBtn').click();
  await page.waitForTimeout(100);
  const fitReturn=await geometry();
  const result={viewport:`${width}x${height}`,fit,actual,panned,focused,keep,keepAfter,fitReturn,errors};
  console.log('PORTRAIT_QA',JSON.stringify(result));
  if(!fit.inside||!fitReturn.inside||!actual.imageH||Math.abs(actual.imageH-2400)>2||
     panned.scrollTop<=actual.scrollTop+30||focused.scrollTop<panned.scrollTop+20||
     keep!=='1'||keepAfter!=='0'||errors.length)throw Error(`Failed portrait test: ${width}x${height}`);
  await page.close();
 }
}finally{await browser.close()}
