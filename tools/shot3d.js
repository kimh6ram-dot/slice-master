/* 3D 장면 확인용 스크린샷 — node tools/shot3d.js  (screenshot/3d_*.png) */
'use strict';
const path=require('path');const ROOT=path.join(__dirname,'..');
const pw=require(path.join(ROOT,'..','..','260624','build','node_modules','playwright-core'));
(async()=>{
  const b=await pw.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERR',e));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('CONSOLE',m.text())});
  await p.goto('file:///'+ROOT.split(path.sep).join('/')+'/index.html');
  await p.click('#btn-start');await p.click('.ing-cell[data-id="tamago"]');
  await p.screenshot({path:path.join(ROOT,'screenshot','3d_select.png')});
  await p.click('#btn-play');await p.waitForTimeout(300);
  await p.screenshot({path:path.join(ROOT,'screenshot','3d_play0.png')});
  const cutAt=async(x,wait)=>{await p.evaluate(x=>{SL_DEBUG.setKnife(x);SL_DEBUG.cut()},x);await p.waitForTimeout(wait)};
  await p.evaluate(()=>SL_DEBUG.setKnife(100));await p.waitForTimeout(100);
  await p.screenshot({path:path.join(ROOT,'screenshot','3d_play_aim.png')});
  await cutAt(100,60);await p.screenshot({path:path.join(ROOT,'screenshot','3d_play1_early.png')});
  await p.waitForTimeout(400);await p.screenshot({path:path.join(ROOT,'screenshot','3d_play1.png')});
  for(let k=2;k<=5;k++)await cutAt(k*100,300);
  await p.screenshot({path:path.join(ROOT,'screenshot','3d_play5.png')});
  for(let k=6;k<=9;k++)await cutAt(k*100,300);
  await p.waitForTimeout(500);await p.screenshot({path:path.join(ROOT,'screenshot','3d_play9.png')});
  await p.waitForFunction(()=>SL_DEBUG.state().screen==='result',null,{timeout:4000});await p.waitForTimeout(200);
  await p.screenshot({path:path.join(ROOT,'screenshot','3d_result.png')});
  await b.close();
})();
