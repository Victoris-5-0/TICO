const path = require('path');
const {pathToFileURL} = require('url');
const {chromium} = require(require.resolve('playwright', {paths: [path.resolve(__dirname, '../../client')]}));
(async () => {
  const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
  const page = await browser.newPage({viewport: {width: 680, height: 1000}});
  const fs = require('fs');
  if (!fs.existsSync(path.join(__dirname, 'mission-request-flow.png'))) {
    const diagrams = JSON.parse(fs.readFileSync(path.join(__dirname, 'readme-diagrams.json'), 'utf8'));
    await page.goto('about:blank');
    await page.addScriptTag({url:'https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js'});
    await page.evaluate(() => mermaid.initialize({startOnLoad:false,theme:'default',securityLevel:'strict'}));
    for (let i=0;i<diagrams.length;i++) {
      const svg = await page.evaluate(async ({source,id}) => (await mermaid.render(id,source)).svg, {source:diagrams[i],id:'readmeDiagram'+i});
      const name = i===0?'implemented-service-architecture':'mission-request-flow';
      fs.writeFileSync(path.join(__dirname,name+'.svg'),svg);
      await page.evaluate(svg => {document.body.innerHTML=svg; document.body.style.margin='12px'; const el=document.querySelector('svg'); el.style.maxWidth='none'; el.style.width='1400px';}, svg);
      await page.setViewportSize({width:1450,height:1200});
      await page.locator('svg').screenshot({path:path.join(__dirname,name+'.png')});
    }
    await page.setViewportSize({width:680,height:1000});
  }
  await page.goto(pathToFileURL(path.join(__dirname, 'technical-proposal.html')).href);
  await page.evaluate(() => document.fonts.ready);
  console.log('Images:', await page.evaluate(() => Array.from(document.images).map(i => ({src:i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0}))));
  console.log('Section heights:', await page.evaluate(() => Array.from(document.querySelectorAll('.page')).map(s => ({height:s.getBoundingClientRect().height, content:s.lastElementChild.getBoundingClientRect().bottom-s.getBoundingClientRect().top}))));
  await page.pdf({path:path.join(__dirname, 'TICO-Technical-Proposal.pdf'), printBackground:true, preferCSSPageSize:true, displayHeaderFooter:true, headerTemplate:'<span></span>', footerTemplate:'<div style="font-family:Arial;font-size:8px;width:100%;text-align:center;color:#636363">Technical part &nbsp; | &nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
  await page.screenshot({path:path.join(__dirname, 'preview.png'), fullPage:true});
  await browser.close();
})().catch(e => {console.error(e);process.exit(1)});
