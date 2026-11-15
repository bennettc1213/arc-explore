import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const browser = await chromium.launch({executablePath:'C:/Users/benne/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1.5,colorScheme:'dark'});
for (const [name,url] of [['home','https://instela.org'],['explore','https://instela.org/explore'],['scholarships','https://instela.org/explore?kind=scholarship'],['scout','https://instela.org/scout']]) {
 try {
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(3000);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:new URL(`assets/${name}.png`,import.meta.url).pathname.replace(/^\/(.:)/,'$1')});
  const txt = await page.locator('body').innerText();
  await fs.writeFile(new URL(`assets/${name}-text.txt`,import.meta.url),txt);
  console.log(name,txt.slice(0,700));
 }catch(e){console.log(name,e.message)}
}
await browser.close();
