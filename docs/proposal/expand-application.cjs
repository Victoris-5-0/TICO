const fs = require('fs');
const path = require('path');
const file = path.join(__dirname,'technical-proposal.html');
let html = fs.readFileSync(file,'utf8');
const start = html.indexOf('<section class="page">\n<div class="section-top"><span>TICO · Technical Proposal</span><span>03 / Application');
const end = html.indexOf('<section class="page">',start+1);
if(start<0||end<0) throw new Error('Application section not found');
const content = `<section class="page">
<div class="section-top"><span>TICO · Technical Proposal</span><span>03 / Frontend</span></div>
<h2>Frontend</h2>
<p>The frontend is the learner’s main environment: it connects story exploration, Python coding, feedback, and progress in one browser experience. Next.js 16, React 19, and TypeScript provide the foundation, while Tailwind CSS, CSS Modules, and Motion for React support consistent layouts and animation.</p>
<h3>Main User Experiences</h3>
<table><tr><th>Experience</th><th>Frontend responsibility</th></tr>
<tr><td>Landing & account entry</td><td>Introduce TICO, explain the learning experience, and guide users toward sign-in and onboarding.</td></tr>
<tr><td>Learning map</td><td>Present available learning stops and connect each selected lesson to its intended mission.</td></tr>
<tr><td>Mission player</td><td>Coordinate the six learning phases, character dialogue, clickable scene elements, and visible outcomes.</td></tr>
<tr><td>Coding workspace</td><td>Combine CodeMirror’s Python editor with run controls, execution feedback, examples, and guided coding.</td></tr>
<tr><td>TICO companion</td><td>Present contextual support and progressive hints without separating the learner from the mission.</td></tr>
<tr><td>Analysis dashboard</td><td>Present learning progress and feedback, making continued practice easier to understand.</td></tr></table>
<h3>Component and State Structure</h3>
<p>The App Router organizes pages and server-rendered application reads. Interactive React components handle the editor, scene controls, animations, and companion interface. The repository separates these concerns into mission-player, bakery, mission-ui, and analysis component areas, supporting focused development and reuse.</p>
<p>Editor state and browser execution are coordinated through the runner integration. Pyodide runs in a dedicated worker, keeping Python execution away from the main interface thread. The frontend receives execution results and connects them to feedback and mission-specific scene consequences.</p>
<h3>Localization and Accessibility</h3>
<p>The platform supports Egyptian Arabic and English. Interface direction follows the selected language, while Python source and output stay left-to-right. Responsive layouts must accommodate longer code and dialogue, and motion should respect reduced-motion preferences. Keyboard access and clear feedback remain important validation goals for the learning experience.</p>
<div class="note"><b>Proposal value.</b> A web-based interface gives learners access to coding and simulation without installing a desktop game engine. The integrated workspace makes the relationship between a coding decision and its story consequence visible.</div>
</section>
<section class="page">
<div class="section-top"><span>TICO · Technical Proposal</span><span>03 / Backend</span></div>
<h2>Backend</h2>
<p>TICO divides backend responsibilities between the Next.js application backend and a dedicated Python AI service. This keeps identity, application data, and progression close to the web application, while AI orchestration remains independently organized and deployable.</p>
<h3>Application Backend — Next.js</h3>
<p>The application backend handles authenticated application operations, mission access, submissions, and learner progress. Server Components support application reads; Server Actions handle authenticated mutations. Route Handlers provide boundaries such as authentication callbacks and streaming integration.</p>
<table><tr><th>Responsibility</th><th>Technical approach</th></tr>
<tr><td>Identity and access</td><td>Better Auth sessions identify the user; server-side checks protect data access and mutations.</td></tr>
<tr><td>Mission access</td><td>Resolve the selected learning stop and obtain the appropriate reviewed or adaptive mission.</td></tr>
<tr><td>Submission handling</td><td>Validate identity and submitted metadata, then persist learning evidence through Prisma.</td></tr>
<tr><td>Progression</td><td>Coordinate accepted progress updates and use transactions when related changes must succeed together.</td></tr>
<tr><td>AI integration</td><td>A shared server-side client handles authentication, timeouts, request IDs, response envelopes, and service errors.</td></tr></table>
<h3>AI Backend — FastAPI</h3>
<p>The Python service owns companion support, error analysis, mastery refresh, path planning, adaptive composition, and constrained mission generation. FastAPI routers expose the HTTP boundary, service modules coordinate use cases, and dedicated rules, queries, schemas, and AI modules separate deterministic logic from model calls.</p>
<p>Pydantic validates structured content, while OpenAPI defines the executable service contract. Generated TypeScript types and contract checks help keep the application and AI service aligned. SQLAlchemy accesses shared PostgreSQL records without owning schema migrations.</p>
<h3>Reliability and Deployment</h3>
<p>The client is deployed on Vercel; the AI service baseline uses AWS EC2 behind Nginx and Gunicorn/Uvicorn. Authenticated HTTPS connects the services. Reviewed mission content and authored hints provide fallback support when AI is unavailable, while nonessential mastery refresh can happen asynchronously after accepted completion.</p>
<div class="note"><b>Execution boundary.</b> Neither backend runs learner Python. Browser-side execution supplies formative evidence; deterministic rules and validation govern results rather than language-model judgments.</div>
</section>
<section class="page">
<div class="section-top"><span>TICO · Technical Proposal</span><span>03 / Database & User Management</span></div>
<h2>Database</h2>
<p>Supabase-hosted PostgreSQL is TICO’s shared persistent data layer. It connects account identity, curriculum, mission attempts, progress, and the evidence needed for AI-supported adaptation. Both services use the same database while retaining explicit ownership boundaries.</p>
<h3>Data Organization</h3>
<table><tr><th>Data area</th><th>Purpose</th></tr>
<tr><td>Identity and learner profiles</td><td>Store users, linked Google accounts, sessions, and onboarding preferences.</td></tr>
<tr><td>Curriculum and content</td><td>Represent tracks/worlds, lessons, exercises/learner-facing missions, and related published content.</td></tr>
<tr><td>Submissions and progression</td><td>Preserve mission attempts and progress so learning can continue across sessions.</td></tr>
<tr><td>Companion and AI evidence</td><td>Support contextual companion exchanges and learner-state services used for analysis and adaptation.</td></tr></table>
<h3>Schema Ownership and Service Access</h3>
<p>The Prisma schema and migration history in the client project are the authoritative definition of application tables. The Next.js backend uses a shared Prisma client; the Python service uses SQLAlchemy mappings to the same tables. The AI service does not create tables or run its own migrations.</p>
<p>This arrangement prevents two independently evolving schemas from creating incompatible field names or data structures. Mapping checks and API contract checks help detect divergence before it reaches the learning experience.</p>
<h3>Consistency and Learning Continuity</h3>
<p>Transactions support related updates that must succeed together, such as saving a submission and updating accepted progress. Identity, version, and duplicate-request handling are important safeguards for progression. Persisted evidence supports the learner dashboard and later mastery refresh without requiring the learner to repeat completed work.</p>
<h3>Authentication & User Management</h3>
<p>Better Auth provides Google OAuth sign-in and opaque sessions stored in PostgreSQL. The browser receives an HTTP-only cookie. The AI service validates bearer sessions against the shared database and independently checks ownership of requested learner data.</p>
<p>Localized onboarding records learner preferences. Student, teacher, and administrator roles are part of the authorization architecture; role-specific actions require server-side checks. This describes the access model rather than claiming that every planned staff interface is complete.</p>
<div class="note"><b>Privacy and future readiness.</b> Credentials remain server-side, and AI context should minimize personal information. Broader deployment will require validated account lifecycle controls, backup and recovery procedures, and appropriate safeguards for children’s learning records.</div>
</section>
`;
html = html.slice(0,start)+content+html.slice(end);
fs.writeFileSync(file,html);
