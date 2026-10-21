// Layout QA using real Chromium. Run: npm i --no-save playwright-core && node tests/layout.cjs
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'));
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser']
 .find(p=>fs.existsSync(p));
if(!chrome)throw Error('Chrome/Chromium missing on runner');
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.setHeader('Cache-Control','no-store');
 res.end(html);
});
const run=async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 fs.mkdirSync(path.resolve(__dirname,'../artifacts'),{recursive:true});
 const diagnostics=[];
 try{
 for(const width of [320,360,390,768,1280]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'load'});
  await page.locator('#date').fill('2026-10-21');
  assert.equal(await page.locator('#weekday').innerText(),'Ср');
  assert.ok(await page.locator('#exercises .exercise').count()>0);
  const scan=async scenario=>{
    const report=await page.evaluate(()=>{
      const W=window.innerWidth;
      const clipped=[];
      for(const node of document.querySelectorAll('body *')){
        if(node.classList?.contains('visually-hidden')||node.matches('input[type="hidden"]'))continue;
        const style=getComputedStyle(node),rect=node.getBoundingClientRect();
        if(style.display==='none'||style.visibility==='hidden'||rect.height<1||rect.width<1)continue;
        if(rect.left < -2 || rect.right > W+2)clipped.push({
          element:node.tagName.toLowerCase(),id:node.id||'',className:typeof node.className==='string'?node.className.slice(0,60):'',
          left:Math.round(rect.left),right:Math.round(rect.right)
        });
      }
      const rowOverlaps=[...document.querySelectorAll('.set-row')].some(row=>{
       const children=[...row.children].map(n=>n.getBoundingClientRect());
       return children.some((r,i)=>children.slice(i+1).some(s=>r.right>s.left+3&&s.right>r.left+3&&r.bottom>s.top+3&&s.bottom>r.top+3));
      });
      return {width:W,docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,clipped:clipped.slice(0,12),rowOverlaps};
    });
    diagnostics.push({width,scenario,...report});
    assert.ok(report.docWidth<=width+1,'Document horizontal overflow at '+width+' '+scenario+': '+JSON.stringify(report));
    assert.deepEqual(report.clipped,[],'Clipped elements at '+width+' '+scenario+': '+JSON.stringify(report.clipped));
    assert.equal(report.rowOverlaps,false,'Inputs overlap at '+width+' '+scenario);
  };
  await scan('overview');
  if(width===390){
    const file=path.resolve(__dirname,'../artifacts/ui-overview-390.jpg');
    await page.screenshot({path:file,type:'jpeg',quality:65,fullPage:false});
    if(process.env.CAPTURE_UI==='1')console.log('UI_OVERVIEW_JPEG_BASE64='+fs.readFileSync(file).toString('base64'));
  }
  await page.locator('#makeReplacement').click();
  await page.locator('#replacement .set-row').first().waitFor();
  await scan('replacement');
  await page.locator('#replacement .exercise-info').first().click();
  await scan('open-technique');
  if(width===390){
    await page.locator('#replacement').scrollIntoViewIfNeeded();
    const file=path.resolve(__dirname,'../artifacts/ui-replacement-390.jpg');
    await page.screenshot({path:file,type:'jpeg',quality:65,fullPage:false});
    if(process.env.CAPTURE_UI==='1')console.log('UI_REPLACEMENT_JPEG_BASE64='+fs.readFileSync(file).toString('base64'));
  }
  const longTexts=['Усталость, 1–10','Техника и ошибки','Замена борьбы','Сохранить ОФП'];
  for(const s of longTexts)assert.ok((await page.locator('body').innerText()).includes(s),'Missing text: '+s);
  assert.deepEqual(errors,[],'Browser errors at '+width+': '+errors.join(';'));
  await page.close();
 }
 console.log('RESPONSIVE_LAYOUT_REPORT='+JSON.stringify(diagnostics));
 console.log('Real-browser responsive checks passed at 320, 360, 390, 768, 1280 px.');
 }finally{
  await browser.close();
  server.close();
 }
};
run().catch(e=>{console.error(e.stack||e);server.close();process.exitCode=1;});
