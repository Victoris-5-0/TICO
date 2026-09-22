const fs = require('fs');
const path = require('path');
const base = __dirname;
const readme = fs.readFileSync(path.join(base, '../../README.md'), 'utf8');
const blocks = [...readme.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)].map(m => m[1].trim());
fs.writeFileSync(path.join(base, 'readme-diagrams.json'), JSON.stringify(blocks, null, 2));
let html = fs.readFileSync(path.join(base, 'technical-proposal.html'), 'utf8');
html = html.replace(/<svg viewBox="0 0 720 335"[\s\S]*?<\/svg>/, '<img src="implemented-service-architecture.png" alt="Implemented service architecture rendered directly from README Mermaid source" style="width:100%;margin:5mm 0">');
html = html.replace('Figure 2. Service boundaries adapted from the README’s implemented architecture diagram. Reviewed static assets support the browser scene renderer.', 'Figure 2. Implemented service architecture, rendered from the exact Mermaid diagram in the README.');
const addition = `<section class="page">
<div class="section-top"><span>TICO · Technical Proposal</span><span>Gameplay & Learning Design</span></div>
<h2>Gameplay and Learning Design</h2>
<p>Each mission follows six authored learning phases while the setting, cast, and props provide variety:</p>
<table><tr><th>Phase</th><th>Learning experience</th></tr>
<tr><td>1. Encounter</td><td>A character introduces a concrete problem in the scene.</td></tr>
<tr><td>2. Explore</td><td>The learner predicts what should happen.</td></tr>
<tr><td>3. Discover</td><td>TICO introduces the Python concept in plain language.</td></tr>
<tr><td>4. Understand</td><td>The learner runs and reads a complete example.</td></tr>
<tr><td>5. Guided coding</td><td>Two or more small coding steps change the world.</td></tr>
<tr><td>6. Remix</td><td>A new requirement asks the learner to adapt their code.</td></tr></table>
<p>The current authored El Forn path contains two variable missions and two conditional missions: <span lang="ar" dir="rtl">رسالة الفتح</span>, <span lang="ar" dir="rtl">عدّ الصواني</span>, <span lang="ar" dir="rtl">ظلي العيلة</span>, and <span lang="ar" dir="rtl">النصيب العادي</span>. Each includes multiple scene interactions and three meaningful gameplay beats.</p>
<p>Python runs locally in a sandboxed Pyodide Web Worker. This gives immediate feedback and keeps untrusted learner code away from the Next.js and AI servers. AI output never decides whether code passed: deterministic tests, schemas, manifests, and progression rules make that decision.</p>
<img src="../images/map.webp" alt="Learning map reproduced from README" style="max-height:75mm;margin-top:7mm;object-fit:contain">
<p class="caption">Learning map from the README. Learning phase descriptions are reproduced from its gameplay and learning design section.</p>
</section>
<section class="page">
<div class="section-top"><span>TICO · Technical Proposal</span><span>Mission Request Flow</span></div>
<h2>Mission Request Flow</h2>
<img src="mission-request-flow.png" alt="Exact README mission request sequence diagram" style="width:100%;max-height:205mm;object-fit:contain;margin-top:8mm">
<p class="caption">Mission request flow, rendered from the exact Mermaid diagram in the README.</p>
<p>The diagram follows the mission from lesson selection to Python execution, saved progress, and asynchronous mastery refresh.</p>
</section>`;
html = html.replace('<section class="page">\n<div class="section-top"><span>TICO · Technical Proposal</span><span>07 / Development', addition + '\n<section class="page">\n<div class="section-top"><span>TICO · Technical Proposal</span><span>07 / Development');
html = html.replace('Figure 2 is adapted from its implemented service architecture.', 'Figure 2 and the mission request flow are rendered directly from the README Mermaid sources. The gameplay section follows the README learning design.');
fs.writeFileSync(path.join(base, 'technical-proposal.html'), html);
