/* SpecPilot Local, read-only (BL-051). Ported from the approved mockup; every string a view
   shows about the project comes from GET /api/specs (readSpecs() output) or GET /api/file
   (the file itself). Views may group and order; they never reword. */
(function(){
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const toastEl=$('#toast');let toastT;
const toast=(m,action)=>{
  toastEl.textContent=m;toastEl.classList.toggle('has-action',!!action);
  if(action){const b=document.createElement('button');b.type='button';b.className='tact';b.textContent=action.label;b.onclick=()=>{toastEl.classList.remove('show');action.fn();};toastEl.appendChild(b);}
  // BL-UI-03: a close button on every toast; it hides the toast early and clears the timer, and never runs the action
  const x=document.createElement('button');x.type='button';x.className='tx';x.setAttribute('aria-label','Dismiss');x.innerHTML='<svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x"/></svg>';x.onclick=()=>{toastEl.classList.remove('show');clearTimeout(toastT);};toastEl.appendChild(x);
  toastEl.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('show'),8000);}; // every toast stays 8 s (D13; 2.6 s for a plain one until 2026-10-21), the × ends it early (BL-UI-03)
/* Task moves (BL-053) are on only when the server put a token in the page (not with --read-only). */
/* A service worker in control is an earlier program's on this origin (BL-142): the token is not used, every
   registration goes, and a page that was served a token reloads once, uncontrolled; a flag stops a second try. */
const SW=navigator.serviceWorker,CONTROLLED=!!(SW&&SW.controller);
const SERVED=(document.querySelector('meta[name="specpilot-token"]')||{}).content||null;
let swReload=false;
try{if(!CONTROLLED)sessionStorage.removeItem('sp-sw-reload');else if(SERVED&&!sessionStorage.getItem('sp-sw-reload')){sessionStorage.setItem('sp-sw-reload','1');swReload=true;}}catch(e){}
if(CONTROLLED)SW.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(()=>{if(swReload)location.reload();},()=>{});
const TOKEN=CONTROLLED?null:SERVED;
/* /mcp is on (BL-PM-007), and whose token it takes: `page` or `env` (SPECPILOT_MCP_TOKEN). */
const MCP=TOKEN&&(document.querySelector('meta[name="specpilot-mcp"]')||{}).content||null;
const ADDABLE={backlog:true,currentSprint:true}; // the sections POST /api/tasks/new writes to (REQ-002.H.29); which lanes move comes from the payload's table (BL-TB-11)
const chev='<svg class="ico chev" aria-hidden="true" focusable="false"><use href="#i-chev"/></svg>';

/* theme: dark by default, light is a per-viewer toggle */
let theme=null;try{theme=localStorage.getItem('sp-theme');}catch(e){}
function setMeta(light){const m=document.querySelector('meta[name=theme-color]');if(m)m.content=light?'#f8fafc':'#0f172a';}
if(theme==='light'){document.documentElement.setAttribute('data-theme','light');setMeta(true);}
$('#themeBtn').onclick=()=>{const light=document.documentElement.getAttribute('data-theme')==='light';if(light)document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme','light');setMeta(!light);try{light?localStorage.removeItem('sp-theme'):localStorage.setItem('sp-theme','light');}catch(e){}toast('Appearance: '+(light?'dark':'light'));};
/* Quit (BL-098): the route `specpilot serve --stop` uses; the server then stops as on Ctrl+C. This page
   closes its stream and says so; other open pages see a dropped stream, as before. */
let stopped=false;
if(TOKEN)$('#quitBtn').hidden=false;
$('#quitBtn').onclick=async()=>{
  if(!confirm('Quit SpecPilot? Open pages stop updating.'))return;
  let r;
  try{r=await fetch('/api/quit',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN},body:'{}'});}
  catch(e){return toast('The server did not answer.');}
  if(r.status!==202){const t=await r.text().catch(()=>'');let m=t;try{m=JSON.parse(t).error||t;}catch(e){}return toast(m.trim()||'The server did not stop.');}
  stopped=true;if(es){es.close();es=null;}
  const p=document.createElement('p');p.className='stopped';p.setAttribute('role','status');p.textContent='SpecPilot has stopped. Run specpilot serve to start it again.';
  document.querySelector('main.pane').replaceChildren(p);
};

/* ---------------- data: fetched, never embedded ---------------- */
let DATA=null;
/* The shown project: its index on the serve command line (BL-054); every /api/ call names it. */
let PROJECT=0;
const pq=()=>'project='+PROJECT;
const fileCache={};
async function getText(p){
  if(p in fileCache)return fileCache[p];
  const pj=PROJECT;
  const r=await fetch('/api/file?project='+pj+'&p='+encodeURIComponent(p),{cache:'no-store'});
  if(!r.ok)throw Object.assign(new Error(p+': HTTP '+r.status),{status:r.status});
  const text=await r.text();
  if(PROJECT===pj)fileCache[p]=text; // never cache one project's file under another's
  return text;
}
function showErr(msg){const e=$('#loadErr');e.textContent=msg;e.hidden=false;}

/* ---------------- projects: one rail tile per served project (BL-054) ---------------- */
function initials(n){const w=String(n).split(/[^A-Za-z0-9]+/).filter(Boolean);
  if(!w.length)return '??';
  if(w.length>1)return (w[0][0]+w[1][0]).toUpperCase();
  return w[0].slice(0,2).toUpperCase();}
function renderProject(){
  $('#footAddr').textContent=$('#homeAddr').textContent=location.host;$('#footVer').textContent=$('#homeVer').textContent='v'+DATA.specpilotVersion;
  const p=DATA.project;
  if(!p){ // no project served (BL-080): an empty rail and top bar; Home is the view
    $('#projList').innerHTML='';$('#curGrp').textContent='';$('#curGrp').title='';$('#curBranch').textContent='';
    $('#subName').textContent='';$('#subPath').textContent='';document.title='SpecPilot Local';return;}
  const name=projectLabel(p), where=p.root+(p.branch?' · '+p.branch:'');
  $('#projList').innerHTML=DATA.projects.map((q,i)=>{const n=projectLabel(q),cur=i===PROJECT&&!NOPROJ.includes(curView);
    return `<button class="tile blue${cur?' cur':''}" data-project="${i}" data-tip="${esc(n)}" data-path="${esc(q.root+(q.branch?' · '+q.branch:''))}" aria-label="${esc(n)}"${cur?' aria-current="true"':''}><span aria-hidden="true">${esc(initials(n))}</span></button>`;}).join('');
  $('#curGrp').textContent=name;$('#curGrp').title=p.root;
  $('#curBranch').textContent=p.branch||'';
  $('#subName').textContent=name;$('#subPath').textContent=where;$('#editorBtn').href=editorUrl(p.root);syncIde();
  document.title=name+' · SpecPilot Local';
}
/* Everything a payload draws; with no project served (BL-080) only the rail, bar and footer. */
function renderAll(){renderProject();if(!DATA.project)return;renderTasks();renderIde();renderAgentFiles();}

/* ---------------- views ---------------- */
const homeBtn=$('#homeBtn');
const VIEWS={board:'Tasks',explorer:'Explorer',security:'Security',instructions:'Instructions',commands:'Commands',skills:'Skills',setup:'',home:'',new:''};
const NOPROJ=['home','new']; // views that belong to no project (BL-PM-001, BL-PM-004)
const TITLES={'planning/roadmap.md':'Roadmap','project/requirements.md':'Requirements','architecture/architecture.md':'Architecture','quality/tests.md':'Tests'};
const NAV=[['board'],['file','planning/roadmap.md'],['file','project/requirements.md'],['explorer'],['file','architecture/architecture.md'],['file','quality/tests.md'],['security'],['instructions'],['commands'],['skills']];
let curView='board',curFile='';
function syncNav(){
  $$('.src .srow').forEach(b=>{
    const on=b.dataset.v==='file'?(curView==='file'&&b.dataset.f===curFile):(b.dataset.v===curView);
    b.classList.toggle('on',on);b.setAttribute('aria-current',on?'page':'false');});
  /* the rail: on Home (BL-PM-001) the Home tile is the current one and no project tile is */
  const home=curView==='home',off=NOPROJ.includes(curView);
  [homeBtn,...$$('#projList .tile')].forEach(t=>{const cur=t===homeBtn?home:!off&&+t.dataset.project===PROJECT;
    t.classList.toggle('cur',cur);if(cur)t.setAttribute('aria-current','true');else t.removeAttribute('aria-current');});
}
function go(v,sub){
  if(v==='file'){if(!DATA||!sub)v='board';else curFile=sub;}
  else if(NOPROJ.includes(v)){if(!TOKEN)v='board';} // no Home and no #new with --read-only
  else if(!VIEWS[v]||v==='setup')v='board';
  if(!NOPROJ.includes(v)&&DATA&&!DATA.project)v='home'; // no project served: Home is the only view (BL-080)
  else if(!NOPROJ.includes(v)&&DATA&&DATA.project.specs===false)v='setup'; // no .specs/ yet: every route of the project shows the setup view (BL-055)
  curView=v;
  $('#win').classList.toggle('home',v==='home');$('#win').classList.toggle('insetup',v==='new'||v==='setup');
  $$('.content>.view').forEach(e=>e.classList.toggle('on',e.id==='v-'+(v==='new'?'setup':v))); // one Setup view for both (BL-103)
  syncNav();
  $('#title').textContent=v==='file'?(TITLES[sub]||sub):VIEWS[v];$('#crumb').hidden=true;
  if(v!=='new'&&browseCtl&&browseBtn&&browseBtn.id==='suBrowse')browseCtl.abort(); // leaving #new closes its folder dialog (BL-097)
  $('#editorBtn').hidden=NOPROJ.includes(v);syncIde();
  setNav(false);closeInsp();closeCardMenu(false);
  if(v==='home')loadRecent();
  if(v==='setup'||v==='new')renderSetup();
  if(v==='file')renderFile(sub);
  if(v==='explorer')renderExplorer();
  if(v==='security')renderSecurity();
  setHash(v,v==='file'?sub:null);
  $('#content').scrollTop=0;
}
/* URL state. Sandboxed frames refuse replaceState with a URL, so fall back to an in-memory hash. */
let urlOk=true,memHash='';
try{history.replaceState(null,'',location.href);}catch(e){urlOk=false;}
try{memHash=location.hash;}catch(e){memHash='';}
function curHash(){if(!urlOk)return memHash;try{return location.hash;}catch(e){return memHash;}}
function setHash(v,sub){const h='#'+(PROJECT&&!NOPROJ.includes(v)?PROJECT+'/':'')+v+(sub?'/'+sub:'');if(curHash()===h)return;memHash=h;
  if(!urlOk)return;
  try{history.replaceState(null,'',h);}catch(e){urlOk=false;}}
function route(){
  const r=resolveRoute(curHash(),DATA?DATA.files:{},DATA?DATA.projects.length:1,!!TOKEN);
  if(NOPROJ.includes(r.view)){go(r.view);return;} // Home and #new belong to no project: the shown one stays loaded behind them
  if(r.project!==PROJECT){switchProject(r.project,true);return;}
  go(r.view,r.sub);
}
if(urlOk)window.addEventListener('hashchange',route);
$$('.src .srow[data-v]').forEach(b=>b.onclick=()=>go(b.dataset.v,b.dataset.f));
function setNav(on){const w=$('#win');w.classList.toggle('nav',on);$('#scrim').hidden=!on;$('#menuBtn').setAttribute('aria-expanded',on?'true':'false');}
$('#menuBtn').onclick=()=>setNav(!$('#win').classList.contains('nav'));
$('#scrim').onclick=()=>setNav(false);

/* ---------------- rail tooltips + rail keys ---------------- */
let tipEl=null,tipFor=null;
function tipNode(){if(!tipEl){tipEl=document.createElement('div');tipEl.className='tip';tipEl.setAttribute('role','presentation');document.body.appendChild(tipEl);}return tipEl;}
function showTip(el){
  if(window.matchMedia('(max-width:900px)').matches)return;
  const label=el.dataset.tip;if(!label)return;
  const t=tipNode();tipFor=el;
  t.innerHTML=esc(label)+(el.dataset.path?`<span class="p">${esc(el.dataset.path)}</span>`:'');
  t.classList.remove('on');t.style.left='-9999px';t.style.top='0px';
  const r=el.getBoundingClientRect(),b=t.getBoundingClientRect();
  let top=Math.round(r.top+r.height/2-b.height/2);
  top=Math.max(8,Math.min(top,window.innerHeight-b.height-8));
  const rail=$('#rail').getBoundingClientRect();
  t.style.left=Math.round(Math.max(r.right,rail.right)+9)+'px';t.style.top=top+'px';
  requestAnimationFrame(()=>t.classList.add('on'));
}
function hideTip(){if(tipEl){tipEl.classList.remove('on');tipEl.style.left='-9999px';}tipFor=null;}
document.addEventListener('mouseover',e=>{const el=e.target.closest&&e.target.closest('#rail [data-tip]');if(el&&el!==tipFor)showTip(el);else if(!el&&tipFor)hideTip();});
document.addEventListener('focusin',e=>{const el=e.target.closest&&e.target.closest('#rail [data-tip]');el?showTip(el):hideTip();});
document.addEventListener('focusout',e=>{if(e.target.closest&&e.target.closest('#rail [data-tip]'))hideTip();});
window.addEventListener('scroll',hideTip,true);window.addEventListener('resize',hideTip);
$('#rail').addEventListener('keydown',e=>{
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp'&&e.key!=='Home'&&e.key!=='End')return;
  const tiles=$$('#rail .tile').filter(t=>!t.hidden);const i=tiles.indexOf(document.activeElement);if(i<0)return;
  e.preventDefault();
  const n=e.key==='Home'?0:e.key==='End'?tiles.length-1:(i+(e.key==='ArrowDown'?1:-1)+tiles.length)%tiles.length;
  tiles[n].focus();
});

/* ---------------- tasks: the rows of planning/tasks.md ---------------- */
/* Cells are readSpecs() output, verbatim. Rows are keyed by section and position, never by
   ID: IDs repeat in real files (two rows can share a # and an ID). */
let selected=null, lastFocus=null;
const insp=$('#insp');
const COLS={currentSprint:'Current Sprint',backlog:'Backlog',review:'Review',completed:'Completed',wontDo:"Won't do"};
const DOT={completed:'green',currentSprint:'orange',backlog:'hollow',review:'violet',wontDo:'gray'};
const PILL={completed:'green',currentSprint:'orange',backlog:'gray',review:'violet',wontDo:'gray'};
/* BL-113: Review's human-in-the-loop pill and its empty text; Won't do is folded to a strip until opened (a page variable, so a reload folds it again). */
const HITL='Human-in-the-loop: you check the agent\'s work here before it counts as done';
let wontDoOpen=false;
/* A lane is drawn when its heading is in the file; the three of BL-TB-04 always, with BL-112's warning when one is missing. */
function laneDrawn(col){const T=DATA&&DATA.tasks;if(!T)return false;return col==='review'||col==='wontDo'?T.headings.found.includes('## '+COLS[col]):true;}
function mdi(t){return md(String(t)).replace(/^<p>/,'').replace(/<\/p>$/,'');}
/* Completed is listed newest first (the file runs oldest first); the others in file order. */
function rowsOf(col){
  const T=DATA.tasks;if(!T)return [];
  const items=T[col].map((t,i)=>({t,i}));
  return col==='completed'?items.reverse():items;
}
/* A card: the row button and, beside it, the ⋯ menu button (BL-TB-11; a button cannot nest in a button). Drag handles for the lanes in the move table. */
function taskRow({t,i},col){
  const mv=TOKEN&&canMove(col,col);
  return `<div class="card"><button type="button" class="row act" data-col="${col}" data-i="${i}"${mv?' draggable="true" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"':''}>
    <span class="st ${DOT[col]}" aria-hidden="true"></span>
    <div class="body"><div class="ttl clamp">${col==='completed'?`<span class="num" translate="no">${esc(t.num)}</span>`:''}<span class="id" translate="no">${mdi(t.id)}</span>${mdi(t.description)}</div></div>
    <div class="trail">${chips(t)}${col==='review'&&t.approved?'<span class="pill green chip">Approved</span>':''}${chev}</div>
  </button><button type="button" class="dots" data-menu="${col}:${i}" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${esc(t.id)}"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-dots"/></svg></button></div>`;
}
function group(col,items){
  // BL-TB-05: the two lanes a row can be added to carry `+ Add` at the right of their header; none with --read-only
  const add=TOKEN&&ADDABLE[col]?`<button type="button" class="add" data-add="${col}" aria-label="Add new task to ${esc(COLS[col])}"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-plus"/></svg>Add</button>`:'';
  // BL-TB-06 (D8): Completed always carries `Archive`, which opens the dialog with the gates; none with --read-only
  const arch=col==='completed'&&TOKEN&&DATA.tasks?`<button type="button" class="arch" data-archive aria-label="Archive the oldest Completed rows to planning/tasks-archive.md"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-archive"/></svg>Archive</button>`:'';
  // BL-113: Review carries the HITL pill; Won't do's title is the button that folds and unfolds its strip
  const title=col==='wontDo'?`<button type="button" class="fold" data-fold aria-expanded="${wontDoOpen}">${esc(COLS[col])} <span class="cnt">${items.length}</span>${chev}</button>`
    :`${esc(COLS[col])}${col==='review'?` <abbr class="hitl" title="${esc(HITL)}" aria-label="${esc(HITL)}">HITL</abbr>`:''} <span class="cnt">${items.length}</span>`;
  const gh=`<div class="gh">${title}${add}${arch}</div>`;
  const empty=col==='review'?'Nothing waiting for you. Agents move finished work here.':'No rows in this section.';
  return gh+`<div class="box"${col==='wontDo'&&!wontDoOpen?' hidden':''}>${items.length?items.map(x=>taskRow(x,col)).join(''):`<div class="empty">${empty}</div>`}</div>`;
}
function renderTasks(){
  closeCardMenu(false); // BL-TB-11: its card is redrawn; focusKey() carries focus back to the card
  const drawn=LANES.filter(laneDrawn);
  $('#boardMode').innerHTML=drawn.map(c=>`<div class="gl${c==='wontDo'&&!wontDoOpen?' fold':''}" data-col="${c}">${group(c,rowsOf(c))}</div>`).join('');
  $('#boardMode').style.setProperty('--cols',drawn.map(c=>c==='wontDo'&&!wontDoOpen?'44px':'minmax(0,1fr)').join(' ')||'none'); // BL-113: one column per drawn lane, a strip for the folded Won't do
  const T=DATA.tasks;
  const bad=T?T.malformed:[];
  $('#gRaw').hidden=!bad.length;
  $('#gRaw').innerHTML=bad.length?`<div class="gh">Rows that could not be parsed <span class="cnt">${bad.length}</span></div><div class="box">${bad.map(l=>`<pre class="raw" translate="no">${esc(l)}</pre>`).join('')}</div>`:'';
  // BL-112 (D10): one Warning per missing heading, one Note per unknown one, from the reader's report; drawn only when the markup changes
  const hm=headingMessages(T);
  $('#gHead').hidden=!hm;
  if(hm!==lastHead){lastHead=hm;$('#gHead').innerHTML=hm;}
  const wasOpen=!!($('#gIntro')&&$('#gIntro').open); // BL-TB-03: the fold keeps its state through a redraw; closed on a fresh load
  $('#gConv').innerHTML=T&&T.intro.trim()?`<details id="gIntro"${wasOpen?' open':''}><summary id="introSum"><span translate="no">planning/tasks.md</span></summary><div class="box"><div class="desc md">${md(T.intro)}</div></div></details>`:
    (T?'':'<div class="box"><div class="empty">No <span class="mono" translate="no">planning/tasks.md</span> in <span class="mono" translate="no">.specs/</span>.</div></div>');
  if(taskVeil.classList.contains('open'))taskHint(); // BL-TB-05: a redraw (a 409, a live reload) refreshes the dialog's next ID
  if(archVeil.classList.contains('open'))drawGates(); // BL-TB-06: and the Archive dialog's gates
  bind();
}
// ---- BL-112 (D10): the Section headings messages. Warnings collapse for the session only; a note hides per project until the unknown set changes.
let warnHidden=false,lastHead='';
const TASKS_FILE='.specs/planning/tasks.md';
const joinAnd=a=>a.length>1?a.slice(0,-1).join(', ')+' and '+a[a.length-1]:a.join('');
const notesKey=()=>'sp-notes-'+DATA.project.root;
function notesStore(){try{const v=JSON.parse(localStorage.getItem(notesKey())||'null');return v&&Array.isArray(v.set)&&Array.isArray(v.hidden)?v:null;}catch(e){return null;}}
function hiddenNotes(cur){const s=notesStore();if(!s)return[];if(JSON.stringify(s.set)===JSON.stringify(cur))return s.hidden;try{localStorage.removeItem(notesKey());}catch(e){}return[];}
function hideNote(h){const cur=DATA.tasks.headings.unknown.slice().sort();const hidden=hiddenNotes(cur);try{localStorage.setItem(notesKey(),JSON.stringify({set:cur,hidden:hidden.includes(h)?hidden:hidden.concat([h])}));}catch(e){}renderTasks();}
function headingMessages(T){
  const H=T&&T.headings;if(!H)return'';
  const q=h=>`"${esc(h)}"`;
  const openBtn=`<a class="btn sm" href="${esc(editorUrl(DATA.project.root+'/'+TASKS_FILE))}">Open tasks.md in VS Code</a>`;
  const x=(attrs,label)=>`<button type="button" class="ib x mx" ${attrs} aria-label="${label}"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x"/></svg></button>`;
  const warns=H.missing.map(h=>{
    const c=H.variants[h]||[],one=c.length===1?c[0]:null,lane=h.slice(3),cols=joinAnd(H.columns[h]||['ID','Description']);
    const col=LANES.find(l=>'## '+COLS[l]===h),shown=col?laneDrawn(col):true; // BL-113: a Review lane is not drawn without its heading
    const prompt=one?`In ${TASKS_FILE}, rename the heading "${one}" to "${h}" so SpecPilot's Tasks board reads the section, and update anything that refers to it.`
      :`In ${TASKS_FILE}, add a "${h}" section (a table with ${cols} columns) so SpecPilot's Tasks board reads it, and update anything that refers to it.`;
    return `<div class="msg warn"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-warn"/></svg><div class="mb"><div class="mt"><span class="mw">Warning</span> The ${esc(lane)} lane is ${shown?'empty':'not shown'}: tasks.md has no ${q(h)} heading</div>`+
      `<p>${one?`The file has ${q(one)} instead, so the rows under it are not shown.`:`The board reads ${joinAnd(REQUIRED.map(l=>q('## '+COLS[l])))}.`}</p>`+
      `<p>Fix: edit <span class="mono" translate="no">${TASKS_FILE}</span> and ${one?`rename ${q(one)} to ${q(h)}`:`add a ${q(h)} section`}, best done by your AI IDE so that anything referring to the section is updated too.</p>`+
      `<div class="actions">${openBtn}<button type="button" class="btn sm" data-prompt="${esc(prompt)}">Copy prompt</button></div></div>${x('data-hidewarn','Hide the warnings for now')}</div>`;
  });
  // BL-116: a known section whose tasks are lines or a list, not a table, which the board cannot read
  const lineWarns=Object.entries(H.untabled||{}).map(([h,n])=>{
    const lane=h.slice(3),cols=joinAnd(H.columns[h]||['ID','Description']);
    const prompt=`In ${TASKS_FILE}, turn the "${h}" section into a markdown table with ${cols} columns, one row per task, keeping every task and its ID, so SpecPilot's Tasks board reads it.`;
    return `<div class="msg warn"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-warn"/></svg><div class="mb"><div class="mt"><span class="mw">Warning</span> The ${esc(lane)} lane shows none of the ${n===1?'1 line':n+' lines'} under ${q(h)}</div>`+
      `<p>They are not table rows. The board reads a markdown table with ${esc(cols)} columns.</p>`+
      `<p>Fix: edit <span class="mono" translate="no">${TASKS_FILE}</span> and turn the section into a table with ${esc(cols)} columns, one row per task, best done by your AI IDE so that every task keeps its ID and references.</p>`+
      `<div class="actions">${openBtn}<button type="button" class="btn sm" data-prompt="${esc(prompt)}">Copy prompt</button></div></div>${x('data-hidewarn','Hide the warnings for now')}</div>`;
  });
  // BL-120: a table whose header has another column count than the lane reads
  // BL-125: for Backlog, Current Sprint and Review the header names neither shape; it is read in the plain one
  const TYPED_COLS='ID, Type, Priority and Description';
  const colWarns=Object.entries(H.columnsFound||{}).map(([h,{columns:n,names:found,unread:k}])=>{
    const lane=h.slice(3),shaped=SHAPED.some(c=>'## '+COLS[c]===h),names=H.columns[h]||['ID','Description'],m=names.length,cols=shaped?TYPED_COLS:joinAnd(names);
    const prompt=shaped?`In ${TASKS_FILE}, turn the "${h}" section into a markdown table with ${TYPED_COLS} columns, one row per task, keeping every task's ID and text; put an existing priority into Priority as P1, P2 or P3 (high, medium, low), and move any status that says more than "open" to the start of the description, so SpecPilot's Tasks board reads it.`
      :`In ${TASKS_FILE}, turn the "${h}" section into a markdown table with ${cols} columns, one row per task${h==='## Completed'?' (numbered from 1 with the oldest entry first)':''}, keeping every task's ID and text, so SpecPilot's Tasks board reads it.`;
    const body=n>m?'The extra columns show inside each row\'s description.':k?`${k===1?'1 row is':k+' rows are'} listed under Rows that could not be parsed.`:'';
    const title=shaped?`it has ${n===1?'1 column':n+' columns'}, ${esc(joinAnd(found||[]))}; the board reads ${TYPED_COLS}, or ID and Description`:`it has ${n===1?'1 column':n+' columns'}, the board reads ${m}`;
    return `<div class="msg warn"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-warn"/></svg><div class="mb"><div class="mt"><span class="mw">Warning</span> The ${esc(lane)} lane cannot read its table: ${title}</div>`+
      (body?`<p>${body}</p>`:'')+
      `<p>Fix: edit <span class="mono" translate="no">${TASKS_FILE}</span> and give the table ${esc(cols)} columns, one row per task, best done by your AI IDE so that every task keeps its ID and text.</p>`+
      `<div class="actions">${openBtn}<button type="button" class="btn sm" data-prompt="${esc(prompt)}">Copy prompt</button></div></div>${x('data-hidewarn','Hide the warnings for now')}</div>`;
  });
  // BL-125: the three lanes do not share one shape, so rows with a Type or Priority cannot move into the plain ones
  const sh=H.shapes||{},plain=SHAPED.filter(c=>sh['## '+COLS[c]]==='plain').map(c=>COLS[c]);
  const shapeWarns=plain.length&&SHAPED.some(c=>sh['## '+COLS[c]]==='typed')?[(()=>{
    const prompt=`In ${TASKS_FILE}, give the ${joinAnd(plain)} table${plain.length===1?'':'s'} ${TYPED_COLS} columns, with empty Type and Priority cells in every row, so SpecPilot's Tasks board can move rows between lanes.`;
    return `<div class="msg warn"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-warn"/></svg><div class="mb"><div class="mt"><span class="mw">Warning</span> Backlog, Current Sprint and Review have different table shapes</div>`+
      `<p>${esc(joinAnd(plain))} ${plain.length===1?'has':'have'} no Type and Priority columns, so a row with a Type or Priority cannot move into ${plain.length===1?'it':'them'}.</p>`+
      `<p>Fix: edit <span class="mono" translate="no">${TASKS_FILE}</span> and give ${plain.length===1?'that table':'those tables'} ${TYPED_COLS} columns, with empty cells in every row, best done by your AI IDE.</p>`+
      `<div class="actions">${openBtn}<button type="button" class="btn sm" data-prompt="${esc(prompt)}">Copy prompt</button></div></div>${x('data-hidewarn','Hide the warnings for now')}</div>`;
  })()]:[];
  warns.push(...lineWarns,...colWarns,...shapeWarns);
  const candidates=new Set([].concat(...Object.values(H.variants)));
  const hidden=hiddenNotes(H.unknown.slice().sort());
  const notes=H.unknown.filter(h=>!candidates.has(h)&&!hidden.includes(h)).map(h=>{
    const n=H.unknownRows[h]||0;
    const title=n===0?`${q(h)} is not a board lane, so its rows would not be shown here (it has no rows)`:`${q(h)} is not a board lane, so its ${n===1?'1 row is':n+' rows are'} not shown here`;
    return `<div class="msg info"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-info"/></svg><div class="mb"><div class="mt"><span class="mw">Note</span> ${title}</div>`+
      `<p>The board shows ${joinAnd(REQUIRED.map(l=>COLS[l]))}. The rows stay in tasks.md.</p><div class="actions">${openBtn}</div></div>${x(`data-hidenote="${esc(h)}"`,'Hide this note')}</div>`;
  });
  // BL-125 (d): every moving lane with a table is plain, so no card has Type or Priority; a note, since nothing is wrong
  if(SHAPED.some(c=>sh['## '+COLS[c]]==='plain')&&!SHAPED.some(c=>sh['## '+COLS[c]]==='typed')&&!hidden.includes(PLAIN_NOTE)){
    const prompt=`In ${TASKS_FILE}, give the Backlog, Current Sprint and Review tables ${TYPED_COLS} columns, with empty Type and Priority cells in every row, keeping every task's ID and text, so SpecPilot's Tasks board can show and set Type and Priority.`;
    notes.push(`<div class="msg info"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-info"/></svg><div class="mb"><div class="mt"><span class="mw">Note</span> Type and Priority are off: Backlog, Current Sprint and Review have no Type and Priority columns</div>`+
      `<p>Add the columns to show Priority and Type on each card and set them in the task details. Rows keep their text; each gets two empty cells.</p><div class="actions">${openBtn}<button type="button" class="btn sm" data-prompt="${esc(prompt)}">Copy prompt</button></div></div>${x(`data-hidenote="${PLAIN_NOTE}"`,'Hide this note')}</div>`);
  }
  const bar=warns.length&&warnHidden?`<div class="msgbar"><span>${warns.length} warning${warns.length===1?'':'s'} about tasks.md</span><button type="button" class="btn sm" data-showwarn>Show</button></div>`:'';
  return (warnHidden?bar:warns.join(''))+notes.join('');
}
$('#gHead').addEventListener('click',e=>{
  const t=e.target.closest('[data-prompt],[data-hidewarn],[data-showwarn],[data-hidenote]');if(!t)return;
  if(t.hasAttribute('data-prompt'))copyText(t.getAttribute('data-prompt'));
  else if(t.hasAttribute('data-hidewarn')){warnHidden=true;renderTasks();const s=$('#gHead [data-showwarn]');if(s)s.focus();}
  else if(t.hasAttribute('data-showwarn')){warnHidden=false;renderTasks();const c=$('#gHead [data-hidewarn]');if(c)c.focus();}
  else hideNote(t.getAttribute('data-hidenote'));
});
let inspOpen=null; // {kind:'task',col,i,id} | {kind:'file',path} | null
function openTask(col,i,quiet){
  const t=DATA.tasks[col][i];if(!t)return;
  if(!quiet)lastFocus=document.activeElement;
  selected=col+':'+i;inspOpen={kind:'task',col,i,id:t.id};
  $$('.row.sel').forEach(r=>r.classList.remove('sel'));
  $$(`#v-board .row[data-col="${col}"][data-i="${i}"]`).forEach(r=>r.classList.add('sel'));
  // BL-113: a Won't do row shows its Reason; a Review row its History and, with a token, the Approve and Send back footer
  const reason=col==='wontDo'?`<div class="gl"><div class="gh">Reason</div><div class="box"><div class="desc md">${md(t.reason)}</div></div></div>`:'';
  const hist=col==='review'&&t.history.length?`<div class="gl"><div class="gh">History <span class="cnt">${t.history.length}</span></div><div class="box">${t.history.map(h=>`<div class="hist"><span class="hd" translate="no">Sent back ${esc(h.date)}</span>${h.note?`<div class="hn">${md(h.note)}</div>`:''}</div>`).join('')}</div></div>`:'';
  // D14: an approved row says what happens next and hands over the one-line prompt for the agent
  const done=t.approved?`<p class="rvdone" id="rvDone">Approved ${esc(t.approved)}. Tell your agent to wrap it up: it writes the Completed entry (number, CD ID, commit) and the row leaves Review.</p><div class="fb"><button type="button" class="btn sm" id="rvCopy">Copy prompt</button></div>`:'';
  const foot=col==='review'&&TOKEN?`<div class="if" id="inspFoot">${done}<div class="fb">${t.approved?'':'<button type="button" class="btn pri" id="rvApprove">Approve</button>'}<button type="button" class="btn" id="rvSend">Send back</button></div>
    <form id="rvForm" autocomplete="off" hidden><label for="rvNote">What needs fixing? (optional)</label><textarea id="rvNote" name="review-note" rows="3" maxlength="200" aria-describedby="rvCount rvErr"></textarea><div class="fc" id="rvCount" aria-live="polite">0/200</div><div class="fb"><button type="submit" class="btn pri" id="rvGo">Send back to Current Sprint</button><button type="button" class="btn" id="rvCancel">Cancel</button></div></form>
    <p class="err" id="rvErr" role="alert" hidden></p></div>`:'';
  insp.innerHTML=`<div class="ih">${col==='completed'?`<span class="id" translate="no">${esc(t.num)}</span>`:''}<span class="id" translate="no">${mdi(t.id)}</span><span class="pill ${PILL[col]}">${esc(COLS[col])}</span>${col==='review'&&t.approved?'<span class="pill green">Approved</span>':''}<button type="button" class="ib x" id="inspX" aria-label="Close Details"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x"/></svg></button></div>
  <div class="ib2">
    <div class="gl"><div class="gh">Description <span class="cnt" translate="no">tasks.md · ## ${esc(COLS[col])}</span></div><div class="box"><div class="desc md">${md(t.description)}</div></div></div>
    ${fieldsBlock(col,t)}${reason}${hist}
    <div class="actions"><a class="btn sm" href="${esc(editorUrl(DATA.project.root+'/.specs/planning/tasks.md',t.line))}">Open tasks.md in VS Code</a></div>
  </div>${foot}`;
  if(foot)bindReview(col,i);
  bindRadios(insp,(key,btn)=>chooseField(col,i,key,btn));
  openInsp(quiet);
}
/* ---------------- Type and Priority (BL-125) ----------------
   A row of a typed Backlog, Current Sprint or Review table carries a Type and a Priority: chips on the card's bottom
   line, two radio groups in the detail panel that write through POST /api/tasks/fields on choice, the same two in
   New Task. A value outside the set is shown as written and checks no radio; a plain table has neither. */
const PRIORITIES=['P1','P2','P3'],TYPES=['feat','bug','chore'],SHAPED=['backlog','currentSprint','review'];
const PLAIN_NOTE='#plain-tables'; // the plain-tables note's key among the hidden notes: no heading starts with #
const shapeOf=col=>((DATA.tasks&&DATA.tasks.headings&&DATA.tasks.headings.shapes)||{})['## '+COLS[col]];
/* A value's colour class, shared by its chip and its chosen radio; none for a value outside the set, which stays muted. */
const tone=v=>[...PRIORITIES,...TYPES].includes(v)?' v-'+v.toLowerCase():'';
function chips(t){
  return (t.priority?`<span class="pill chip pri${tone(t.priority)}" translate="no">${esc(t.priority)}</span>`:'')+(t.type?`<span class="pill chip ty${tone(t.type)}" translate="no">${esc(t.type)}</span>`:'');
}
/* One radio group: `id` names it (its buttons are `<id>-<value>`, `<id>-none`), `key` is the field it sets. */
function radios(id,key,label,vals,cur){
  const all=[...vals,''],on=all.includes(cur||'')?(cur||''):null;
  return `<div class="tfr"><span class="tfl" id="${id}L">${label}</span><div class="seg" role="radiogroup" aria-labelledby="${id}L" id="${id}" data-key="${key}">${all.map(v=>{const c=v===on,first=on===null&&v===all[0];
    return `<button type="button" role="radio" id="${id}-${v||'none'}" data-v="${v}" aria-checked="${c}" tabindex="${c||first?0:-1}" class="${((c?'on':'')+tone(v)).trim()}" translate="no">${v||'None'}</button>`;}).join('')}</div></div>`;
}
function checkRadio(btn){btn.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]').forEach(b=>{const c=b===btn;b.setAttribute('aria-checked',c);b.classList.toggle('on',c);b.tabIndex=c?0:-1;});}
/* Click chooses; arrow keys move and choose, as a radio group does. */
function bindRadios(root,choose){
  root.querySelectorAll('[role="radiogroup"]').forEach(g=>{
    const bs=[...g.querySelectorAll('[role="radio"]')];
    bs.forEach((b,n)=>{
      b.onclick=()=>choose(g.dataset.key,b);
      b.onkeydown=e=>{const d={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(!d||e.altKey||e.metaKey||e.ctrlKey)return;e.preventDefault();e.stopPropagation();const nb=bs[(n+d+bs.length)%bs.length];nb.focus();choose(g.dataset.key,nb);};
    });
  });
}
function fieldsBlock(col,t){
  if(!SHAPED.includes(col))return '';
  if(shapeOf(col)!=='typed')return '<p class="tfnote" id="tfNote">This lane\'s table has no Type and Priority columns. Add them to set Priority and Type here.</p>';
  if(!TOKEN)return `<div class="gl"><div class="gh">Priority and Type</div><div class="box"><p class="tfv" translate="no">Priority ${esc(t.priority||'None')} · Type ${esc(t.type||'None')}</p></div></div>`;
  return `<div class="gl"><div class="gh">Priority and Type</div><div class="box tf" id="tfBox">${radios('tfPri','priority','Priority',PRIORITIES,t.priority)}${radios('tfType','type','Type',TYPES,t.type)}<p class="err" id="tfErr" role="alert" hidden></p></div></div>`;
}
let fielding=false;
async function chooseField(col,i,key,btn){
  const t=DATA.tasks[col]&&DATA.tasks[col][i],p=PROJECT,v=btn.dataset.v;if(!t||fielding||(t[key]||'')===v)return;
  fielding=true;checkRadio(btn);const box=$('#tfBox');if(box)box.setAttribute('aria-busy','true');
  let r,body={};
  try{
    r=await fetch('/api/tasks/fields?'+pq(),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN,'If-Match':DATA.tasks.sha256},body:JSON.stringify({id:t.id,[key]:v})});
    body=await r.json().catch(()=>({}));
  }catch(e){r=null;}
  fielding=false;
  if(p!==PROJECT)return;
  if(r&&r.status===200){wrote(['.specs/planning/tasks.md'],body.specs);await apply(body.specs,['.specs/planning/tasks.md']);return;} // the panel is redrawn from the file; focus stays on the chosen radio
  if(r&&r.status===409&&body.specs)await apply(body.specs,null);
  const k=findRow(col,t.id,i);if(k>=0&&inspOpen&&inspOpen.id===t.id)openTask(col,k,true); // the earlier choice, as the file has it
  const e=$('#tfErr');if(e){e.textContent=!r?'The server did not answer. Nothing was changed.':body.error||`Nothing was changed (HTTP ${r.status}).`;e.hidden=false;}
  const g='#'+(key==='priority'?'tfPri':'tfType'),f=$(`${g} [aria-checked="true"]`)||$(`${g} [role="radio"]`);if(f)f.focus();
}
/* ---------------- review (BL-113) ----------------
   Approve appends ` Approved <date>` to the row; Send back appends ` Sent back <date>: <note>` and moves the row to the
   top of Current Sprint; each toast's Undo sends the inverse action, which removes exactly that marker. One route,
   POST /api/tasks/review, with the move's checks; a refusal shows in the footer with the note kept. */
let reviewing=false;
function rvError(m){const e=$('#rvErr');if(!e)return;e.textContent=m||'';e.hidden=!m;}
function rvCount(){const n=$('#rvNote'),c=$('#rvCount');if(n&&c)c.textContent=[...n.value].length+'/200';}
function openSendBack(text){
  const f=$('#rvForm');if(!f)return;f.hidden=false;$('#rvSend').hidden=true;const a=$('#rvApprove');if(a)a.hidden=true;
  const n=$('#rvNote');n.value=text||'';rvCount();rvError('');n.focus();
  if(document.activeElement!==n)setTimeout(()=>{if(n.isConnected&&!$('#rvForm').hidden)n.focus();},70); // the panel was still sliding in: focus once it is visible, unless the box closed meanwhile
}
function closeSendBack(refocus){
  const f=$('#rvForm');if(!f||f.hidden)return;f.hidden=true;$('#rvSend').hidden=false;const a=$('#rvApprove');if(a)a.hidden=false;rvError('');
  if(refocus)$('#rvSend').focus();
}
/* The sentence an approved row hands to the agent (D14): what the generated Tasks mandate asks of it, with this row's ID. */
const wrapUpPrompt=id=>`${id} is approved in .specs/planning/tasks.md: write its Completed entry with the number, CD ID and commit, and remove the row from ## Review.`;
function bindReview(col,i){
  const a=$('#rvApprove');if(a)a.onclick=()=>review(col,i,'approve',{});
  const c=$('#rvCopy');if(c)c.onclick=()=>copyText(wrapUpPrompt(DATA.tasks[col][i].id));
  $('#rvSend').onclick=()=>openSendBack('');
  $('#rvCancel').onclick=()=>closeSendBack(true);
  $('#rvNote').oninput=rvCount;
  $('#rvNote').onkeydown=e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeSendBack(true);}
    else if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();$('#rvForm').requestSubmit();}
  };
  $('#rvForm').onsubmit=e=>{e.preventDefault();review(col,i,'sendBack',{note:$('#rvNote').value});};
}
/* `col`/`i` locate the row now; `extra` is the action's own fields; the undo of an action is `isUndo`. */
async function review(col,i,action,extra,isUndo){
  const t=DATA.tasks[col]&&DATA.tasks[col][i],p=PROJECT;if(!t||reviewing)return;
  const typed=extra.note;
  reviewing=true;$$('#inspFoot button').forEach(b=>{b.disabled=true;});
  let r,body={};
  try{
    r=await fetch('/api/tasks/review?'+pq(),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN,'If-Match':DATA.tasks.sha256},body:JSON.stringify({id:t.id,action,...extra})});
    body=await r.json().catch(()=>({}));
  }catch(e){r=null;}
  reviewing=false;$$('#inspFoot button').forEach(b=>{b.disabled=false;});
  if(!r){if(action==='sendBack')rvError('The server did not answer. Nothing was changed.');else toast('The server did not answer. Nothing was changed.');return;}
  if(p!==PROJECT)return;
  if(r.status===200){
    const toLane=action==='sendBack'?'currentSprint':'review';
    if(action==='sendBack'||action==='unsendBack'){lastFocus=null;closeInsp();}
    wrote(['.specs/planning/tasks.md'],body.specs);await apply(body.specs,['.specs/planning/tasks.md']);
    const j=DATA.tasks[toLane].findIndex(x=>x.id===t.id);
    if(action==='sendBack'||action==='unsendBack'){const el=$(`#v-board .row[data-col="${toLane}"][data-i="${j}"]`);if(el)el.focus();}
    else{const b=$(action==='approve'?'#rvSend':'#rvApprove')||$('#inspX');if(b&&insp.classList.contains('open'))b.focus();}
    if(action==='approve')toast(`${t.id} approved: marked in planning/tasks.md. Next: tell your agent to wrap it up; it writes the Completed entry.`,isUndo?null:{label:'Undo',fn:()=>{const k=DATA.tasks.review.findIndex(x=>x.id===t.id);if(k>=0)review('review',k,'unapprove',{date:body.date},true);}});
    else if(action==='unapprove')toast(`${t.id} is no longer marked Approved`);
    else if(action==='sendBack')toast(`Sent ${t.id} back to Current Sprint`,isUndo?null:{label:'Undo',fn:()=>{const k=DATA.tasks.currentSprint.findIndex(x=>x.id===t.id);if(k>=0)review('currentSprint',k,'unsendBack',{date:body.date,note:body.note,toIndex:body.fromIndex},true);}});
    else toast(`${t.id} is back in ## Review in planning/tasks.md`);
    return;
  }
  if(r.status===409&&body.specs)await apply(body.specs,null); // the inspector is redrawn on the same row when it is still there
  const msg=body.error||`Nothing was changed (HTTP ${r.status}).`;
  if(action==='sendBack'&&$('#rvForm')){openSendBack(typed);rvError(msg);}
  else if($('#inspFoot'))rvError(msg);
  else toast(msg);
}
function openInsp(quiet){insp.classList.add('open');insp.setAttribute('aria-hidden','false');$('#inspX').onclick=closeInsp;if(!quiet)setTimeout(()=>{if(insp.classList.contains('open')&&!insp.contains(document.activeElement))$('#inspX').focus();},60);} // the close button takes focus unless the panel closed meanwhile or something in it already has focus (the Send back box, BL-113)
function closeInsp(){const was=insp.classList.contains('open');insp.classList.remove('open');insp.setAttribute('aria-hidden','true');selected=null;inspOpen=null;$$('.row.sel').forEach(r=>r.classList.remove('sel'));if(was&&lastFocus&&lastFocus.focus){lastFocus.focus();lastFocus=null;}}
function bind(){
  $$('#v-board .row[data-col]').forEach(r=>{const col=r.dataset.col,i=+r.dataset.i;
    r.onclick=()=>openTask(col,i);
    r.onkeydown=e=>{if((e.shiftKey&&e.key==='F10')||e.key==='ContextMenu'){e.preventDefault();openCardMenu(col,i,menuAnchor(col,i));}else altMove(r,e);};}); // BL-TB-11: the menu key, else Alt+arrows
  $$('#v-board .card').forEach(c=>{const r=$('.row[data-col]',c),col=r.dataset.col,i=+r.dataset.i;
    c.oncontextmenu=e=>{e.preventDefault();openCardMenu(col,i,e.clientX||e.clientY?{x:e.clientX,y:e.clientY}:menuAnchor(col,i));};});
  $$('#v-board [data-menu]').forEach(b=>b.onclick=()=>{const [col,i]=b.dataset.menu.split(':');if(menuOn&&menuOn.col===col&&menuOn.i===+i)closeCardMenu(true);else openCardMenu(col,+i,menuAnchor(col,+i));});
  $$('#v-board [data-add]').forEach(b=>b.onclick=()=>openNewTask(b.dataset.add,`#v-board [data-add="${b.dataset.add}"]`));
  $$('#v-board [data-archive]').forEach(b=>b.onclick=openArchive);
  $$('#v-board [data-fold]').forEach(b=>b.onclick=()=>{wontDoOpen=!wontDoOpen;renderTasks();const f=$('#v-board [data-fold]');if(f)f.focus();}); // BL-113
  if(TOKEN)bindMoves();
}

/* ---------------- any .specs/ file, rendered as written ---------------- */
function metaLine(m){return ['fileID','version','lastUpdated'].filter(k=>m&&m[k]!==undefined).map(k=>`${k}: ${m[k]}`).join(' · ');}
async function renderFile(path){
  let src=null;const pj=PROJECT; // callers below draw only if the page still shows this project (BL-054)
  if(path in DATA.files)try{src=await getText('.specs/'+path);}catch(e){if(e.status!==404){if(PROJECT===pj&&curView==='file'&&curFile===path){$('#fmBox').innerHTML='';$('#fileBody').innerHTML=`<p class="note">${esc(e.message)}</p>`;}return;}}
  if(PROJECT!==pj||curView!=='file'||curFile!==path)return;
  if(src===null){$('#fmBox').innerHTML='';$('#fileBody').innerHTML=gone('.specs/'+path);return;}
  const isYaml=/\.ya?ml$/.test(path);
  const {fm,body}=isYaml?{fm:'',body:src}:splitFm(src);
  const ed=`<a class="more" href="${esc(editorUrl(DATA.project.root+'/.specs/'+path))}">Open in VS Code</a>`; // BL-PM-013
  $('#fmBox').innerHTML=fm?`<div class="gh">Front matter <span class="cnt" translate="no">.specs/${esc(path)}</span>${ed}</div><div class="box"><pre class="raw" translate="no">${esc(fm)}</pre></div>`
    :`<div class="gh"><span class="cnt" translate="no">.specs/${esc(path)}</span>${ed}</div>`;
  $('#fileBody').innerHTML=isYaml?`<pre translate="no">${esc(src)}</pre>`:md(body);
}
const gone=goneHtml; // one definition of the "no longer exists" markup: ui/route.js

/* Explorer: the .specs/ tree, each row carrying that file's own front matter. */
function renderExplorer(){
  const dirs={};
  DATA.nav.specs.forEach(p=>{const ix=p.indexOf('/'),d=ix<0?'':p.slice(0,ix);(dirs[d]=dirs[d]||[]).push(p);});
  $('#exBody').innerHTML=Object.keys(dirs).map(d=>`<div class="gl mb18"><div class="gh" translate="no">${esc(d?d+'/':'.specs/')}</div><div class="box">${dirs[d].map(p=>{
    const line=metaLine(DATA.files[p]);
    return `<button type="button" class="row act" data-file="${esc(p)}"><span class="st hollow" aria-hidden="true"></span><div class="body"><div class="ttl" translate="no">${esc(d?p.slice(d.length+1):p)}</div>${line?`<div class="det" translate="no">${esc(line)}</div>`:''}</div><div class="trail">${chev}</div></button>`;}).join('')}</div></div>`).join('');
  $$('#exBody .row.act').forEach(b=>b.onclick=()=>go('file',b.dataset.file));
  $('#exNote').innerHTML=`${DATA.nav.specs.length} files under <span class="mono" translate="no">.specs/</span>. Every ID, version and date is that file’s own front matter.`;
}
/* Security: both files in security/, each rendered as written. */
const secShown=new Set(); // security files this page has shown, so a deletion can be named
async function renderSecurity(){
  const pj=PROJECT,paths=['security/threat-model.md','security/security-decisions.md'].filter(p=>p in DATA.files||secShown.has(p));
  const parts=await Promise.all(paths.map(p=>!(p in DATA.files)?Promise.resolve(gone('.specs/'+p)):getText('.specs/'+p).then(src=>(PROJECT===pj&&secShown.add(p),
    `<div class="gl"><div class="gh" translate="no">${esc(p)} <span class="cnt" translate="no">${esc(metaLine(DATA.files[p]))}</span></div></div><div class="md doc doc-gap">${md(splitFm(src).body)}</div>`),
    e=>`<p class="note">${esc(e.message)}</p>`)));
  if(PROJECT===pj&&curView==='security')$('#secBody').innerHTML=parts.join('')||'<div class="box"><div class="empty">No files in <span class="mono" translate="no">.specs/security/</span>.</div></div>';
}

/* ---------------- automation: generated files, read as they are ---------------- */
function renderIde(){
  const I=DATA.nav.instructions;
  $('#insBox').innerHTML=I.map(f=>f.exists
    ?`<button type="button" class="row act" data-open="${esc(f.path)}"><span class="st green" aria-hidden="true"></span><div class="body"><div class="ttl"><span class="id" translate="no">${esc(f.path)}</span></div><div class="det">${f.bytes} bytes</div></div><div class="trail">${chev}</div></button>`
    :`<div class="row"><span class="st hollow" aria-hidden="true"></span><div class="body"><div class="ttl"><span class="id" translate="no">${esc(f.path)}</span></div></div><div class="trail"><span class="pill gray">not in this repo</span></div></div>`).join('');
  $('#insMeta').textContent=I.filter(f=>f.exists).length+' of '+I.length;
}
function fileRows(list){
  return list.length?list.map(f=>{const fm=f.frontMatter||{};
    return `<button type="button" class="row act" data-open="${esc(f.path)}"><span class="st hollow" aria-hidden="true"></span><div class="body"><div class="ttl"><span class="id" translate="no">${esc(f.path)}</span>${fm['argument-hint']!==undefined?`<span class="id" translate="no">${esc(fm['argument-hint'])}</span>`:''}</div>${fm.description!==undefined?`<div class="det">${esc(fm.description)}</div>`:''}</div><div class="trail">${fm['allowed-tools']!==undefined?`<span class="pill gray" translate="no">${esc(fm['allowed-tools'])}</span>`:''}${chev}</div></button>`;}).join('')
    :'<div class="empty">No files here.</div>';
}
/* From SpecPilot / Yours (BL-PM-006): the server's `generated` flag decides; rows keep their full path. */
function fileGroup(list,box,cnt,ours){const l=list.filter(f=>!!f.generated===ours);$(box).innerHTML=fileRows(l);$(cnt).textContent=l.length;}
function renderAgentFiles(){
  const N=DATA.nav,cmds=[...N.commands,...N.prompts];
  fileGroup(cmds,'#cmdBox','#cmdSpCnt',true);fileGroup(cmds,'#cmdMine','#cmdYouCnt',false);
  fileGroup(N.skills,'#sklBox','#sklSpCnt',true);fileGroup(N.skills,'#sklMine','#sklYouCnt',false);
}
/* Regenerate All (BL-PM-006): the server runs specpilot backfill's command step; its result lines are shown as sent,
   until the next run or a project switch. */
function setRegenNote(lines){const n=$('#regenNote');n.innerHTML=lines.map(l=>`<p class="note" translate="no">${esc(l)}</p>`).join('');n.hidden=!lines.length;}
async function regenerate(){
  const b=$('#cmdRegen'),p=PROJECT,had=document.activeElement===b;if(b.disabled)return;
  b.disabled=true; // drops focus; given back below
  let r,body={};
  try{
    r=await fetch('/api/commands/regenerate?'+pq(),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN},body:'{}'});
    body=await r.json().catch(()=>({}));
  }catch(e){r=null;}
  b.disabled=false;
  if(p!==PROJECT)return;
  if(!r)setRegenNote(['The server did not answer. Command files may have been partly written.']);
  else if(r.status===200){await apply(body.specs,null);setRegenNote(body.message);}
  else setRegenNote([(body.error||`Regenerate All did not run (HTTP ${r.status}).`)+(r.status===500?' Command files may have been partly written.':'')]);
  if(had&&document.activeElement===document.body)b.focus();
}
$('#cmdRegen').onclick=regenerate;
/* Inspector for a generated file: its front matter raw, its body rendered. */
/* Is this generated file in the latest /api/specs listing? */
function listed(path){const N=DATA.nav;return N.instructions.some(f=>f.exists&&f.path===path)||[N.commands,N.prompts,N.skills].some(l=>l.some(f=>f.path===path));}
async function openFile(path,quiet){
  if(!quiet)lastFocus=document.activeElement;
  let src=null;const pj=PROJECT;
  if(listed(path))try{src=await getText(path);}catch(e){if(e.status!==404){if(!quiet&&PROJECT===pj)toast(e.message);return;}}
  if(PROJECT!==pj)return;
  inspOpen={kind:'file',path};
  const head=`<div class="ih"><span class="id" translate="no">${esc(path)}</span><button type="button" class="ib x" id="inspX" aria-label="Close Details"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x"/></svg></button></div>`;
  if(src===null){insp.innerHTML=head+`<div class="ib2">${gone(path)}</div>`;openInsp(quiet);return;}
  const {fm,body}=splitFm(src);
  insp.innerHTML=head+`<div class="ib2">${fm?`<div class="gl"><div class="gh">Front matter</div><div class="box"><pre class="raw" translate="no">${esc(fm)}</pre></div></div>`:''}<div class="md doc">${md(body)}</div><div class="actions"><a class="btn sm" href="${esc(editorUrl(DATA.project.root+'/'+path))}">Open in VS Code</a></div></div>`;
  openInsp(quiet);
}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-open]');if(b)openFile(b.dataset.open);});

/* Open in AI IDE (BL-PM-010): Cursor by its URL schemes when the project has SpecPilot's Cursor rules
   file (`project.cursor`), and the onboarding prompt while development/onboarding.md exists. */
const ONB='development/onboarding.md',ideBtn=$('#ideBtn'),ideMenu=$('#ideMenu');
const hasOnb=()=>!!DATA&&ONB in DATA.files;
/* On every view switch and redraw: an open menu would hold another view's or project's items. */
function syncIde(){
  closeIde(false);
  $('#ideWrap').hidden=!DATA||NOPROJ.includes(curView)||!(DATA.project.cursor||hasOnb());
}
function closeIde(refocus){
  if(ideMenu.hidden)return;
  ideMenu.hidden=true;ideBtn.setAttribute('aria-expanded','false');
  if(refocus)ideBtn.focus();
}
function copyPrompt(text,note){
  const claude=DATA.nav.instructions.some(f=>f.path==='CLAUDE.md'&&f.exists);
  (navigator.clipboard?navigator.clipboard.writeText(text):Promise.reject())
    .then(()=>toast(note||(claude?`Copied. Paste it into Claude Code started in ${DATA.project.root}, or into your IDE’s chat.`:'Copied. Paste it into your IDE’s chat.')),
      ()=>toast('Could not copy. Open development/onboarding.md and copy it.'));
}
async function openIde(){
  const pj=PROJECT,cur=DATA.project.cursor;let prompt=null;
  if(hasOnb())try{prompt=onboardingPrompt(await getText('.specs/'+ONB));}catch(e){toast(e.message);}
  if(PROJECT!==pj||$('#ideWrap').hidden||!ideMenu.hidden)return; // switched away, or a second click opened it meanwhile
  const item=(tag,attrs,label)=>`<${tag} role="menuitem" ${attrs}>${esc(label)}</${tag}>`;
  const link=prompt!==null&&cur?cursorPromptUrl(prompt):null;
  ideMenu.innerHTML=[
    cur?item('a',`href="${esc(editorUrl(DATA.project.root,0,'cursor'))}"`,'Open in Cursor'):'',
    prompt!==null&&cur?(link?item('a',`href="${esc(link)}"`,'Send onboarding prompt to Cursor'):item('button','type="button" data-copy="long"','Send onboarding prompt to Cursor')):'',
    prompt!==null?item('button','type="button" data-copy="all"','Copy onboarding prompt'):'',
  ].join('');
  if(!ideMenu.children.length)return;
  $$('[role=menuitem]',ideMenu).forEach(m=>m.onclick=()=>{
    if(m.dataset.copy)copyPrompt(prompt,m.dataset.copy==='long'?'The prompt is too long for a Cursor link. Copied; paste it into Cursor’s chat.':'');
    closeIde(false);
  });
  ideMenu.hidden=false;ideBtn.setAttribute('aria-expanded','true');ideMenu.firstElementChild.focus();
}
ideBtn.onclick=()=>ideMenu.hidden?openIde():closeIde(true);
ideMenu.addEventListener('keydown',e=>{
  const it=$$('[role=menuitem]',ideMenu),i=it.indexOf(document.activeElement);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();it[(i+(e.key==='ArrowDown'?1:it.length-1))%it.length].focus();}
});
document.addEventListener('click',e=>{if(!ideMenu.hidden&&!e.target.closest('#ideWrap'))closeIde(false);});

/* ---------------- card menu (BL-TB-11) ----------------
   A task card's actions: the lanes the move table lets it go to, reorder, details, Copy ID.
   Built from DATA.tasks.moves (the server's MOVES), so a new lane is a table entry, not page code. */
const LANES=['backlog','currentSprint','review','completed','wontDo']; // the drawn order (REQ-002.H.47; Review and Won't do since BL-113)
const REQUIRED=LANES.filter(c=>c!=='wontDo'); // the headings the board asks for (BL-112's sentences); Won't do is read when present
const moves=()=>(DATA&&DATA.tasks&&DATA.tasks.moves)||{};
/* An own key, never `in`: an inherited name (__proto__, toString) is not a lane. A lane in the table may reorder itself. */
const canMove=(from,to)=>{const m=moves();return Array.isArray(m[from])&&(from===to||m[from].includes(to));};
/* The nearest lane on that side (dir -1 or 1) of `col` in the drawn order that the table allows, or null. */
function laneBy(col,dir){for(let k=LANES.indexOf(col)+dir;k>=0&&k<LANES.length;k+=dir)if(canMove(col,LANES[k]))return LANES[k];return null;}
const cardMenu=$('#cardMenu');let menuOn=null; // {col,i} while open
const cardRow=(col,i)=>$(`#v-board .row[data-col="${col}"][data-i="${i}"]`);
const dotsBtn=(col,i)=>$(`#v-board .card [data-menu="${col}:${i}"]`);
const KEYS={'Alt+→':'Alt+ArrowRight','Alt+←':'Alt+ArrowLeft','Alt+↑':'Alt+ArrowUp','Alt+↓':'Alt+ArrowDown'};
function menuItems(col,i){
  const t=DATA.tasks[col][i],n=DATA.tasks[col].length,it=[];
  if(TOKEN&&col==='review'){ // BL-113: the reviewed exits first
    if(!t.approved)it.push({label:'Approve',fn:()=>{openTask(col,i);review(col,i,'approve',{});}});
    it.push({label:'Send back…',fn:()=>{openTask(col,i);openSendBack('');}});
  }
  if(TOKEN&&canMove(col,col)){
    const right=laneBy(col,1),left=laneBy(col,-1),to=col==='review'?[]:moves()[col].filter(c=>COLS[c]&&DATA.tasks[c]); // D16: a Review card leaves only by Send back
    if(to.length)it.push({head:'Move to'});
    to.forEach(c=>{it.push({label:COLS[c],hint:c===right?'Alt+→':c===left?'Alt+←':'',fn:()=>move(col,i,c,DATA.tasks[c].length)});it.push({label:COLS[c]+', top',fn:()=>move(col,i,c,0)});});
    if(i>0)it.push({label:'Move up',hint:'Alt+↑',fn:()=>move(col,i,col,i-1)});
    if(i<n-1)it.push({label:'Move down',hint:'Alt+↓',fn:()=>move(col,i,col,i+1)});
  }
  it.push({label:'Open details',fn:()=>openTask(col,i)});
  it.push({label:'Copy ID',fn:()=>copyText(t.id)});
  return it;
}
/* Under the card's ⋯ button, its right edges aligned. */
function menuAnchor(col,i){const r=(dotsBtn(col,i)||cardRow(col,i)).getBoundingClientRect();return {x:r.right,y:r.bottom+4,right:true};}
function openCardMenu(col,i,at){
  if(!DATA||!DATA.tasks||!DATA.tasks[col]||!DATA.tasks[col][i])return;
  closeCardMenu(false);hideTip();
  const items=menuItems(col,i),acts=items.filter(x=>!x.head);
  cardMenu.innerHTML=items.map(x=>x.head?`<div class="mh" role="presentation">${esc(x.head)}</div>`
    :`<button type="button" role="menuitem"${x.hint?` aria-keyshortcuts="${KEYS[x.hint]}"`:''}>${esc(x.label)}${x.hint?`<span class="hint">${esc(x.hint)}</span>`:''}</button>`).join('');
  $$('[role=menuitem]',cardMenu).forEach((b,k)=>b.onclick=()=>{closeCardMenu(true);acts[k].fn();});
  menuOn={col,i};
  const btn=dotsBtn(col,i);if(btn)btn.setAttribute('aria-expanded','true');
  cardMenu.hidden=false;
  const w=cardMenu.offsetWidth,h=cardMenu.offsetHeight,m=8;
  cardMenu.style.left=Math.max(m,Math.min(at.right?at.x-w:at.x,innerWidth-w-m))+'px';
  cardMenu.style.top=Math.max(m,Math.min(at.y,innerHeight-h-m))+'px';
  $('[role=menuitem]',cardMenu).focus();
}
/* Close; `refocus` puts focus back on the card. A redraw closes it too (renderTasks), the card refocused through focusKey(). */
function closeCardMenu(refocus){
  if(cardMenu.hidden)return;
  const was=menuOn;menuOn=null;cardMenu.hidden=true;
  if(cardMenu.contains(document.activeElement))document.activeElement.blur(); // now, not at the next frame: a redraw's refocus() checks for a focus-less page
  const btn=was&&dotsBtn(was.col,was.i);if(btn)btn.setAttribute('aria-expanded','false');
  if(refocus&&was){const r=cardRow(was.col,was.i);if(r)r.focus();}
}
cardMenu.addEventListener('keydown',e=>{
  const it=$$('[role=menuitem]',cardMenu),i=it.indexOf(document.activeElement);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();it[(i+(e.key==='ArrowDown'?1:it.length-1))%it.length].focus();}
  else if(e.key==='Home'||e.key==='End'){e.preventDefault();it[e.key==='Home'?0:it.length-1].focus();}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeCardMenu(true);}
});
cardMenu.addEventListener('mousedown',e=>e.preventDefault()); // a press inside keeps focus in the menu: Safari and Firefox do not focus a pressed button, and a blur would close it before the click
cardMenu.addEventListener('focusout',e=>{if(!cardMenu.contains(e.relatedTarget))closeCardMenu(false);});
document.addEventListener('click',e=>{if(!cardMenu.hidden&&!(e.target.closest&&e.target.closest('#cardMenu,[data-menu]')))closeCardMenu(false);});

/* ---------------- palette + keys ---------------- */
const palVeil=$('#palVeil'),palIn=$('#palIn'),palList=$('#palList');
function items(q){q=q.toLowerCase();
  const T=DATA?DATA.tasks:null;
  const it=[
    ...NAV.map(n=>n[0]==='file'?{l:'.specs/'+n[1],k:'file',go:()=>go('file',n[1])}:{l:VIEWS[n[0]],k:'view',go:()=>go(n[0])}),
    ...(DATA?DATA.nav.specs:[]).filter(p=>!NAV.some(n=>n[1]===p)).map(p=>({l:'.specs/'+p,k:'file',go:()=>go('file',p)})),
    ...(T?['currentSprint','review','backlog','completed','wontDo'].flatMap(c=>(T[c]||[]).map((t,i)=>({l:t.id+'  '+t.description,k:'task',go:()=>{go('board');openTask(c,i)}}))):[])
  ];
  return it.filter(i=>!q||i.l.toLowerCase().includes(q)).slice(0,9);}
function renderPal(){const it=items(palIn.value);palList.innerHTML=it.map((i,n)=>`<li class="${n===0?'on':''}" role="option" aria-selected="${n===0}" tabindex="0"><span class="lbl">${esc(i.l)}</span><span class="k">${esc(i.k)}</span></li>`).join('')||'<li class="empty">No matches</li>';$$('#palList li').forEach((li,n)=>{li.onclick=()=>{it[n]&&it[n].go();closePal();};li.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();li.click()}}});}
function openPal(){palVeil.classList.add('open');palIn.value='';renderPal();palIn.focus();}
function closePal(){palVeil.classList.remove('open');}
$('#palBtn').onclick=openPal;palIn.oninput=renderPal;palVeil.onclick=e=>{if(e.target===palVeil)closePal()};
palIn.onkeydown=e=>{if(e.key==='Enter'){const it=items(palIn.value);it[0]&&it[0].go();closePal();}};
document.addEventListener('keydown',e=>{
  const mod=e.metaKey||e.ctrlKey;const inField=/INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
  if(mod&&e.key.toLowerCase()==='k'){e.preventDefault();palVeil.classList.contains('open')?closePal():openPal();return}
  if(mod&&/^[1-9]$/.test(e.key)){e.preventDefault();const n=NAV[+e.key-1];if(n)go(n[0],n[1]);return}
  if(e.key==='Escape'){if(busyVeil.classList.contains('open')){closeBusy();return}if(!ideMenu.hidden){closeIde(true);return}if(!cardMenu.hidden){closeCardMenu(true);return}hideTip();closeInsp();closePal();closeSheet();closeNewTask();closeArchive();setNav(false);return}
  if(inField||mod||e.altKey||!cardMenu.hidden||taskVeil.classList.contains('open')||archVeil.classList.contains('open')||busyVeil.classList.contains('open'))return;
  if(e.key==='h'&&TOKEN&&!openVeil.classList.contains('open')){go('home');return;}
  if(/^[1-9]$/.test(e.key)){const n=NAV[+e.key-1];if(n)go(n[0],n[1]);}
  if((e.key==='j'||e.key==='k')&&curView==='board'){const rows=$$('#v-board .row[data-col]');if(!rows.length)return;let i=rows.findIndex(r=>r.dataset.col+':'+r.dataset.i===selected);i=e.key==='j'?Math.min(rows.length-1,i+1):Math.max(0,i-1);if(i<0)i=0;openTask(rows[i].dataset.col,+rows[i].dataset.i);rows[i].scrollIntoView({block:'nearest'});rows[i].focus();}
});

/* ---------------- task moves (BL-053) ----------------
   A move is one line of planning/tasks.md cut and pasted unchanged; the server does it and
   answers with the new file hash and the fresh payload. Completed rows never move. */
let dragging=null,moving=false,hinted=false; // hinted: the Completed toast once per drag (D15)
/* D15: why a card cannot go to Completed from the page, said once per gesture instead of a silent refusal. */
const COMPLETED_HINT='Nothing moves to Completed from here. Approve the card in Review, then tell your agent to wrap it up: it writes the Completed entry.';
function bindMoves(){
  $$('#v-board .row[draggable="true"]').forEach(r=>{
    r.ondragstart=e=>{dragging={col:r.dataset.col,i:+r.dataset.i};e.dataTransfer.setData('text/plain',DATA.tasks[dragging.col][dragging.i].id);e.dataTransfer.effectAllowed='move';r.classList.add('drag');hinted=false;};
    r.ondragend=()=>{r.classList.remove('drag');dragging=null;$$('.gl.drop').forEach(g=>g.classList.remove('drop'));};
  });
  // Drop targets (BL-TB-11): every lane; a drop lands only where the move table lets the dragged row go.
  $$('#v-board .gl[data-col]').forEach(g=>{
    g.ondragenter=()=>{if(dragging&&g.dataset.col==='completed'&&!canMove(dragging.col,'completed')&&!hinted){hinted=true;toast(COMPLETED_HINT);}}; // D15
    g.ondragover=e=>{if(!dragging||!canMove(dragging.col,g.dataset.col))return;e.preventDefault();e.dataTransfer.dropEffect='move';g.classList.add('drop');};
    g.ondragleave=e=>{if(!g.contains(e.relatedTarget))g.classList.remove('drop');};
    g.ondrop=e=>{
      if(!dragging||!canMove(dragging.col,g.dataset.col))return;e.preventDefault();g.classList.remove('drop');
      const to=g.dataset.col,src=dragging;dragging=null;
      // Position among the target's rows once the dragged row is out of the way.
      const others=DATA.tasks[to].map((_,j)=>j).filter(j=>!(to===src.col&&j===src.i));
      const card=e.target.closest&&e.target.closest('.card'),over=card&&card.querySelector('.row[data-col]');
      let at=others.length;
      if(over&&over.dataset.col===to){const j=+over.dataset.i,k=others.indexOf(j);if(k>=0){const b=over.getBoundingClientRect();at=k+(e.clientY>b.top+b.height/2?1:0);}}
      if(src.col==='review'&&to!==src.col)review(src.col,src.i,'sendBack',{note:''}); // D16: out of Review only by Send back, so the Approved state ends with a marker
      else move(src.col,src.i,to,at);
    };
  });
}
/* Alt+arrows (BL-053): up/down reorder; left/right go to the end of the nearest lane on that side that the table allows (BL-TB-11). */
function altMove(r,e){
  if(!e.altKey||e.metaKey||e.ctrlKey||!r.draggable)return;
  const col=r.dataset.col,i=+r.dataset.i,n=DATA.tasks[col].length;
  const lane=e.key==='ArrowRight'?laneBy(col,1):e.key==='ArrowLeft'?laneBy(col,-1):null;
  const go2={ArrowUp:i>0&&[col,i-1],ArrowDown:i<n-1&&[col,i+1],ArrowRight:!!lane&&[lane,DATA.tasks[lane].length],ArrowLeft:!!lane&&[lane,DATA.tasks[lane].length]}[e.key];
  if(go2===undefined)return;
  e.preventDefault();
  if(go2&&col==='review'&&go2[0]!==col)review(col,i,'sendBack',{note:''}); // D16
  else if(go2)move(col,i,go2[0],go2[1]);
  else if(e.key==='ArrowRight'&&LANES[LANES.indexOf(col)+1]==='completed')toast(COMPLETED_HINT); // D15: Alt+→ from the lane before Completed
}
async function move(col,i,toSection,toIndex,isUndo,asked){
  const t=DATA.tasks[col][i],p=PROJECT;if(!t||moving)return;
  // BL-127: on a branch or while something else writes .specs/, ask first; an Undo is not asked again
  if(!isUndo&&!asked){const s=busySignals();if(s.length)return askBusy(t,col,s,()=>{
    if(p!==PROJECT)return; // asked for this project only
    const k=DATA.tasks[col].findIndex(x=>x.id===t.id);
    if(k<0){toast(`${t.id} is no longer in ## ${COLS[col]}. Nothing was moved.`);return;}
    move(col,k,toSection,toIndex,false,true);
  });}
  moving=true;
  let r,body={};
  try{
    r=await fetch('/api/tasks/move?'+pq(),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN,'If-Match':DATA.tasks.sha256},body:JSON.stringify({id:t.id,toSection,toIndex})});
    body=await r.json().catch(()=>({}));
  }catch(e){moving=false;toast('The server did not answer. Nothing was moved.');return;}
  moving=false;
  if(p!==PROJECT)return; // the page switched projects while the move was in flight
  if(r.status===200){
    wrote(['.specs/planning/tasks.md'],body.specs);await apply(body.specs,['.specs/planning/tasks.md']);
    const j=DATA.tasks[toSection].findIndex(x=>x.id===t.id);
    const el=$(`#v-board .row[data-col="${toSection}"][data-i="${j}"]`);if(el)el.focus();
    const msg=col===toSection?`${t.id} moved within ## ${COLS[col]} in planning/tasks.md`:`${t.id} moved from ## ${COLS[col]} to ## ${COLS[toSection]} in planning/tasks.md`;
    toast(msg,isUndo?null:{label:'Undo',fn:()=>{const k=DATA.tasks[toSection].findIndex(x=>x.id===t.id);if(k>=0)move(toSection,k,body.from,body.fromIndex,true);}});
  }else if(r.status===409){
    if(body.specs)await apply(body.specs,null);
    toast(body.error||'planning/tasks.md changed on disk since this page loaded. The move was not made.');
  }else toast(body.error||`The move was not made (HTTP ${r.status}).`);
}

/* ---------------- work in progress (BL-127) ----------------
   Two signals before a move or Archive: a branch other than main or master, and a .specs/ change drawn in the last
   120 s that is not the echo of this page's own last write (same paths, the hash that write answered with). Only
   what the page has seen counts; no git is run. */
const BUSY_MS=120000,busyVeil=$('#busyVeil');
let lastWrite=null,activity=null,busyGo=null,busyFrom=null; // activity: {p, at, paths}; busyFrom: the card's lane and ID, for focus
function wrote(paths,d){lastWrite={paths,sha:d&&d.tasks?d.tasks.sha256:null};}
function noteActivity(paths,d){
  const sp=(paths||[]).filter(x=>x.startsWith('.specs/'));if(!sp.length)return;
  if(lastWrite&&d.tasks&&d.tasks.sha256===lastWrite.sha&&sp.every(x=>lastWrite.paths.includes(x)))return; // our own write's echo
  activity={p:PROJECT,at:Date.now(),paths:sp};
}
const branchOff=()=>{const b=DATA&&DATA.project&&DATA.project.branch;return b&&b!=='main'&&b!=='master'?b:null;};
const branchRisk=what=>`${what} is written to this branch's planning/tasks.md, so it is committed with this branch's work, and merging the branch can conflict with tasks.md changes made on the default branch.`;
/* `<file> changed on disk <n> seconds ago, not from this page`, or null outside the window. */
function recentActivity(){
  if(!activity||activity.p!==PROJECT)return null;
  const ms=Date.now()-activity.at;if(ms<0||ms>=BUSY_MS)return null;
  const n=Math.floor(ms/1000),ps=activity.paths,f=ps.includes('.specs/planning/tasks.md')?'.specs/planning/tasks.md':ps[0],k=ps.length-1;
  return `${f}${k?` and ${k} more ${k===1?'file':'files'}`:''} changed on disk ${n} ${n===1?'second':'seconds'} ago, not from this page`;
}
function busySignals(){
  const out=[],b=branchOff(),a=recentActivity();
  if(b)out.push(`You are on branch ${b}, not the default branch. ${branchRisk('The move')}`);
  if(a)out.push(`${a}: an agent or editor may still be working on the specs. If it saves planning/tasks.md from a copy it read before your move, your move is lost; if it edits after, its edit can fail or land on the wrong row because the rows moved under it. Wait until it is done, or ask it to make the move.`);
  return out;
}
function askBusy(t,col,signals,go){
  closeCardMenu(false);hideTip();
  busyGo=go;busyFrom={col,id:t.id};
  $('#busyTitle').textContent=`Move ${t.id} while work is in progress?`;
  $('#busyBody').innerHTML=signals.map(x=>`<div class="gate warn"><span class="st orange" aria-hidden="true"></span><span class="gt">${esc(x)}</span></div>`).join('');
  busyVeil.classList.add('open');
  setTimeout(()=>$('#busyCancel').focus(),50);
}
/* Cancel, Escape or the backdrop: nothing written, focus back on the card. */
function closeBusy(){
  if(!busyVeil.classList.contains('open'))return;
  busyVeil.classList.remove('open');busyGo=null;
  const f=busyFrom;busyFrom=null;
  const k=f&&DATA&&DATA.tasks&&DATA.tasks[f.col]?DATA.tasks[f.col].findIndex(x=>x.id===f.id):-1;
  const el=k>=0&&$(`#v-board .row[data-col="${f.col}"][data-i="${k}"]`);if(el)el.focus();
}
$('#busyCancel').onclick=closeBusy;
busyVeil.onclick=e=>{if(e.target===busyVeil)closeBusy();};
$('#busyGo').onclick=()=>{const go=busyGo;busyGo=null;busyFrom=null;busyVeil.classList.remove('open');if(go)go();};

/* ---------------- new task (BL-PM-005) ----------------
   The server appends one row, `| <ID> | <description> |`, to the chosen section and picks the ID.
   The description goes as typed; a refusal is shown in the form with what was typed kept. */
const taskVeil=$('#taskVeil'),taskIn=$('#taskIn');
let taskSection='backlog',adding=false,taskFrom=null; // taskFrom: the opener, as a selector, since a lane button is redrawn (BL-TB-05)
function taskError(m){const e=$('#taskErr');e.textContent=m||'';e.hidden=!m;}
/* The ID the server would give now, from the last payload; a suggestion, the write picks the ID (BL-TB-05). */
function taskHint(){const n=DATA&&DATA.tasks&&DATA.tasks.nextIds;$('#taskNext').textContent=n?n[taskSection]:'';$('#taskNextWrap').hidden=!n;}
function openNewTask(section,from){if(!TOKEN||!DATA||!DATA.tasks||!ADDABLE[section])return;hideTip();taskIn.value='';taskError('');taskSection=section;taskFrom=from;$('#taskLane').textContent=COLS[section];taskHint();taskFields();taskVeil.classList.add('open');setTimeout(()=>taskIn.focus(),50);}
/* BL-125: Priority and Type, both None, for a typed lane; nothing for a plain one. */
function taskFields(){const f=$('#taskFields'),typed=shapeOf(taskSection)==='typed';f.innerHTML=typed?radios('ntPri','priority','Priority',PRIORITIES,'')+radios('ntType','type','Type',TYPES,''):'';f.hidden=!typed;bindRadios(f,(key,b)=>checkRadio(b));}
const taskValue=id=>{const b=$(`#${id} [aria-checked="true"]`);return b?b.dataset.v:'';};
function focusOpener(){const b=(taskFrom&&$(taskFrom))||$('#v-board [data-add]');if(b)b.focus();}
function closeNewTask(){if(!taskVeil.classList.contains('open')||adding)return;taskVeil.classList.remove('open');focusOpener();}
async function addTask(){
  if(adding)return;
  if(!taskIn.value.trim()){taskError('Type a description for the task.');taskIn.focus();return;}
  const p=PROJECT,section=taskSection;
  adding=true;$('#taskGo').disabled=true;taskError('');
  let r,body={};
  try{
    r=await fetch('/api/tasks/new?'+pq(),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN,'If-Match':DATA.tasks.sha256},body:JSON.stringify({description:taskIn.value,section,...(shapeOf(section)==='typed'?{priority:taskValue('ntPri'),type:taskValue('ntType')}:{})})});
    body=await r.json().catch(()=>({}));
  }catch(e){r=null;}
  adding=false;$('#taskGo').disabled=false;
  if(!r){taskError('The server did not answer. Nothing was added.');return;}
  if(p!==PROJECT)return;
  if(r.status===200){
    taskVeil.classList.remove('open');
    wrote(['.specs/planning/tasks.md'],body.specs);await apply(body.specs,['.specs/planning/tasks.md']);
    focusOpener(); // what closing the inspector returns to
    openTask(section,body.index);
    const el=$(`#v-board .row[data-col="${section}"][data-i="${body.index}"]`);if(el)el.scrollIntoView({block:'nearest'});
    toast(`${body.id} added to ## ${COLS[section]} in planning/tasks.md`);
    return;
  }
  if(r.status===409&&body.specs)await apply(body.specs,null);
  taskError(body.error||`The task was not added (HTTP ${r.status}).`);taskIn.focus();
}
taskIn.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addTask();}}; // a row cannot hold a line break: Enter adds, never breaks the line
$('#taskCancel').onclick=closeNewTask;
taskVeil.onclick=e=>{if(e.target===taskVeil)closeNewTask();};
$('#taskForm').onsubmit=e=>{e.preventDefault();addTask();};

/* ---------------- archive Completed (BL-TB-06, D8) ----------------
   The Completed step of `specpilot archive`, run by the server with the same plan and block as the CLI. The
   dialog says what the action does and lists the gates from the latest payload: the CLI's branch guard and the
   40-line limit, each with a box to tick when it warns; a section within the limit is archived with {force:true}
   once the user ticks that box. Every other answer than 200 is shown in the dialog, as New Task does. */
const archVeil=$('#archVeil');
let archiving=false;
function archGates(){
  const b=DATA.project.branch,a=DATA.tasks.archive,n=DATA.tasks.completed.length,out=[];
  if(!b)out.push({key:'branch',text:'No git branch.'});
  else if(b==='main'||b==='master')out.push({key:'branch',text:`On ${b}.`});
  else out.push({key:'branch:'+b,warn:true,text:`On branch ${b}. Archive is recommended only on the default branch after merging. ${branchRisk('The archive')} Archive on this branch anyway.`});
  if(!a.rows)out.push({key:'none',off:true,text:`Nothing to archive: ## Completed has ${n} ${n===1?'row':'rows'}, and an archive keeps the newest 20.`});
  else if(a.lines>40)out.push({key:'limit',text:`## Completed is ${a.lines} lines, over its 40-line limit: ${a.rows} rows move, the newest 20 stay.`});
  else out.push({key:'force',warn:true,text:`## Completed is ${a.lines} lines, within its 40-line limit. Archive ${a.rows} rows anyway; the newest 20 stay.`});
  const act=recentActivity();
  if(act)out.push({key:'activity',warn:true,text:`${act}: an agent or editor may still be working on the specs. If it saves planning/tasks.md from a copy it read before the archive, the archive is lost; if it edits after, its edit can fail or land on the wrong row because the rows moved under it. Archive anyway.`});
  return out;
}
/* Draw the gates from the latest payload; a tick stays on a gate still shown under the same key (a redraw while open). */
function drawGates(){
  const kept=new Set($$('#archGates input:checked').map(i=>i.dataset.gate));
  $('#archGates').innerHTML=archGates().map(g=>`<div class="gate ${g.off?'off':g.warn?'warn':'ok'}"><span class="st ${g.off?'gray':g.warn?'orange':'green'}" aria-hidden="true"></span>${g.warn?`<label><input type="checkbox" data-gate="${esc(g.key)}"${kept.has(g.key)?' checked':''}><span>${esc(g.text)}</span></label>`:`<span class="gt">${esc(g.text)}</span>`}</div>`).join('');
  $$('#archGates input').forEach(i=>i.onchange=archReady);
  archReady();
}
function archReady(){$('#archGo').disabled=archiving||!DATA.tasks.archive.rows||$$('#archGates input').some(i=>!i.checked);}
function archError(m){const e=$('#archErr');e.textContent=m||'';e.hidden=!m;}
function focusArchive(){const b=$('#v-board [data-archive]');if(b)b.focus();}
function openArchive(){
  if(!TOKEN||!DATA||!DATA.tasks)return;
  hideTip();archError('');$('#archGates').innerHTML='';archVeil.classList.add('open');drawGates(); // every box starts unticked
  setTimeout(()=>{const f=$('#archGates input')||(!$('#archGo').disabled?$('#archGo'):$('#archCancel'));f.focus();},50);
}
function closeArchive(){if(!archVeil.classList.contains('open')||archiving)return;archVeil.classList.remove('open');focusArchive();}
async function archiveCompleted(){
  if(archiving||!TOKEN||!DATA||!DATA.tasks||$('#archGo').disabled)return;
  const p=PROJECT,force=!!$('#archGates input[data-gate="force"]'); // present only when the limit gate warns, and ticked, or the button is disabled
  archiving=true;$('#archGo').disabled=true;archError('');
  let r,body={};
  try{
    r=await fetch('/api/tasks/archive?'+pq(),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN,'If-Match':DATA.tasks.sha256},body:force?'{"force":true}':'{}'});
    body=await r.json().catch(()=>({}));
  }catch(e){r=null;}
  archiving=false;archReady();
  if(!r){archError('The server did not answer. Nothing was archived.');return;}
  if(p!==PROJECT)return;
  if(r.status===200){
    archVeil.classList.remove('open');
    wrote(['.specs/planning/tasks.md','.specs/planning/tasks-archive.md'],body.specs);await apply(body.specs,['.specs/planning/tasks.md','.specs/planning/tasks-archive.md']);
    focusArchive();
    toast(`Moved ${body.linesMoved} rows from ## Completed to planning/tasks-archive.md`);
    return;
  }
  if(r.status===409&&body.specs)await apply(body.specs,null); // renderTasks() redraws the gates while the dialog is open
  archError(body.error||`Nothing was archived (HTTP ${r.status}).`);
}
$('#archCancel').onclick=closeArchive;
archVeil.onclick=e=>{if(e.target===archVeil)closeArchive();};
$('#archForm').onsubmit=e=>{e.preventDefault();archiveCompleted();};

/* ---------------- Setup view (BL-103) ----------------
   A project without .specs/ (Open, Clone, a folder named on the command line) and #new: the user's AI IDE
   sets it up over /mcp, and this view says how. It sends no answers and writes no spec; the only request
   is #new's pending path (POST /api/projects/pending). The Progress rows follow `event: setup`, which the
   server's setup tools send (BL-104): state and counts only, kept in the page, so a reload starts them over. */
const mono=t=>`<span class="mono" translate="no">${esc(t)}</span>`;
const clonedFrom={}; // root → the URL this page cloned it from since it loaded: the Clone lead
const pend={name:'',parent:'',target:null,seq:0}; // #new's fields and its registered target
const ROWS=['read','questions','write','validate'];
const progress={}; // 'p<n>' or 'pending' → {row: {state, data}}
const progressKey=()=>curView==='new'?'pending':'p'+PROJECT;
function rowText(row,d){
  if(row==='read')return `${d.detected} detected`;
  if(row==='questions')return `${d.fromCode} from the code, ${d.fromUser} from you`+(d.fromUser&&d.topics&&d.topics.length?` (${d.topics.join(', ')})`:'');
  if(row==='write')return `${d.files} files`;
  return `${d.errors} errors, ${d.warnings} warnings`;
}
function drawProgress(){
  const p=progress[progressKey()]||{};
  $$('#suProgress li').forEach((li,i)=>{const r=p[ROWS[i]],st=r?r.state:'idle';
    li.className=st==='running'?'run':st==='done'?'done':'wait';
    let d=li.querySelector('.d');if(!d){d=document.createElement('span');d.className='d';li.appendChild(d);}
    d.textContent=st==='done'?rowText(ROWS[i],r.data):'';});
}
/* An `event: setup` from the stream: the row of the folder it names; the last one of a new project opens it. */
function onSetupEvent(raw){
  let d;try{d=JSON.parse(raw);}catch(_){return;}
  if(!d||ROWS.indexOf(d.row)<0)return;
  const key=d.pending?'pending':typeof d.project==='number'?'p'+d.project:null;if(!key)return;
  (progress[key]=progress[key]||{})[d.row]={state:d.state,data:d};
  if((curView==='setup'||curView==='new')&&key===progressKey())drawProgress();
  if(d.pending&&typeof d.project==='number'&&d.row==='validate'&&d.state==='done'){
    delete progress.pending;pend.target=null;pend.name=pend.parent='';
    if(curView==='new')switchProject(d.project);
  }
}
const MCP_ON=!!(TOKEN&&MCP);
function suStatus(){
  const c=DATA&&DATA.mcp&&DATA.mcp.client,el=$('#suStatus');
  el.textContent=!MCP_ON?'':c?(c.name?'Connected · '+c.name:'Connected'):'Waiting for a connection';
  el.classList.toggle('ok',!!c);
}
function suPrompt(){
  const isNew=curView==='new';
  $('#suPrompt').textContent=isNew?`Start a SpecPilot project called ${pend.name} in ${pend.parent}`:'Set up SpecPilot for '+DATA.project.root;
  $('#suPromptCopy').disabled=!MCP_ON||isNew&&!pend.target;
  const c=$('#crumb');c.hidden=isNew&&!pend.target;c.textContent=(isNew?pend.target:DATA.project.root)+' · no specs yet';
}
function renderSetup(){
  const isNew=curView==='new',p=DATA.project,v=$('#v-setup');
  const named=isNew||p.named!==false; // the current-directory default keeps REQ-002.H.17's heading only
  $('#title').textContent=!named?`No .specs/ folder in ${DATA.projects[PROJECT].root}`:isNew?'Start a new project with SpecPilot':'Set up SpecPilot for this project';
  const off=!TOKEN||!named;
  [...v.children].forEach(el=>{if(el.id!=='suNote')el.hidden=off;});
  $('#suNote').hidden=TOKEN||!named;$('#suNote').textContent='Started with --read-only, so nothing can be set up here.';
  if(off){$('#crumb').hidden=!named;if(named)$('#crumb').textContent=p.root+' · no specs yet';return;}
  const name=p?String(p.root).split(/[/\\]/).filter(Boolean).pop()||p.root:'',url=p?clonedFrom[p.root]:null; // #new has no project behind it when none is served (BL-080)
  const tail=' Your AI IDE sets them up: it reads the code, answers what it can, and asks you the rest.';
  $('#suLead').innerHTML=isNew?'Name the project and choose where it goes. Your AI IDE creates it and writes the specs from your answers.'
    :url?`Cloned ${mono(url)}. It has no SpecPilot specs yet.${tail}`:`${mono(name)} has no SpecPilot specs yet.${tail}`;
  $('#suNew').hidden=!isNew;
  if(isNew){$('#suName').value=pend.name;$('#suParent').value=pend.parent;}
  $('#suOff').hidden=MCP_ON;
  $$('#v-setup .step').forEach(el=>{el.classList.toggle('off',!MCP_ON);el.inert=!MCP_ON;});
  $('#suConfigBox').hidden=!MCP_ON;
  if(MCP_ON){const env=MCP==='env',line=mcpConfigLine(location.host,env?'${SPECPILOT_MCP_TOKEN}':TOKEN);
    $('#suConfig').textContent=JSON.stringify(JSON.parse(line),null,2);$('#suConfig').dataset.line=line;$('#suMcpNote').textContent=$('#mcpNote').textContent;}
  else $('#suMcpNote').textContent='';
  $('#suFoot').innerHTML=`Prefer the terminal? ${mono(isNew?'specpilot init':'specpilot add-specs')} in that folder asks the same questions one by one.`;
  suStatus();suPrompt();drawProgress();
}
function copyText(text){(navigator.clipboard?navigator.clipboard.writeText(text):Promise.reject()).then(()=>toast('Copied.'),()=>toast('Could not copy. Select the line and copy it.'));}
$('#suConfigCopy').onclick=()=>copyText($('#suConfig').dataset.line);
$('#suPromptCopy').onclick=()=>copyText($('#suPrompt').textContent);
/* #new: when the name passes init's rule and a parent is typed, register <parent>/<name> as the one pending path. */
async function registerPending(){
  const seq=++pend.seq,body={parent:pend.parent.trim(),name:pend.name};
  let r,res={};
  try{r=await fetch('/api/projects/pending',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN},body:JSON.stringify(body)});res=await r.json().catch(()=>({}));}
  catch(e){r=null;}
  if(seq!==pend.seq)return; // the fields changed meanwhile
  pend.target=r&&r.status===200?res.target:null;
  delete progress.pending; // a new target starts its rows over
  $('#suErr').textContent=!r?'The server did not answer.':r.status===200?'':res.error||`The folder was not accepted (HTTP ${r.status}).`;
  if(curView==='new')suPrompt();
}
/* While typing: the line follows the fields and Copy waits; on `change` (or a Browse… pick) the path is registered (BL-104). */
function fieldsTyped(){
  pend.name=$('#suName').value.trim();pend.parent=$('#suParent').value;pend.target=null;pend.seq++;
  const e=pend.name?projectNameError(pend.name):null;
  $('#suErr').textContent=e?e.message+'.':'';
  suPrompt();
  return !e&&pend.name&&pend.parent.trim();
}
function fieldsChanged(){if(fieldsTyped())registerPending();}
$('#suName').addEventListener('input',fieldsTyped);
$('#suParent').addEventListener('input',fieldsTyped);
$('#suName').addEventListener('change',fieldsChanged);
$('#suParent').addEventListener('change',fieldsChanged);
$('#suBrowse').onclick=()=>browseFolder($('#suBrowse'),()=>curView==='new'?$('#suParent'):null,()=>fieldsChanged());

/* ---------------- live reload (BL-052) ----------------
   On a change event: re-fetch, redraw in place. Route, scroll, open inspector, selected row
   and focus stay where they were. If the server is gone, the last content stays on screen. */
function focusKey(el){
  if(!el||el===document.body)return null;
  const row=el.closest&&el.closest('.row[data-col][data-i]');
  if(menuOn&&cardMenu.contains(el)){const t=DATA.tasks&&DATA.tasks[menuOn.col][menuOn.i];return {row:menuOn.col,id:t?t.id:null,i:menuOn.i};} // BL-TB-11: the open menu's card
  if(row){const t=DATA.tasks&&DATA.tasks[row.dataset.col][+row.dataset.i];return {row:row.dataset.col,id:t?t.id:null,i:+row.dataset.i};}
  for(const a of ['data-open','data-file','data-add','data-archive','data-menu'])if(el.hasAttribute&&el.hasAttribute(a))return {sel:`[${a}="${CSS.escape(el.getAttribute(a))}"]`};
  if(el.id)return {sel:'#'+CSS.escape(el.id)};
  return null;
}
/* Where a row with this ID sits now in that section: the occurrence nearest its old position. */
function findRow(col,id,oldI){
  const rows=DATA.tasks?DATA.tasks[col]:[];let best=-1;
  rows.forEach((t,i)=>{if(t.id===id&&(best<0||Math.abs(i-oldI)<Math.abs(best-oldI)))best=i;});
  return best;
}
function refocus(key){
  if(!key||document.activeElement&&document.activeElement!==document.body)return;
  let el=null;
  if(key.row){const i=findRow(key.row,key.id,key.i);if(i>=0)el=$(`#v-board .row[data-col="${key.row}"][data-i="${i}"]`);}
  else el=$(key.sel);
  if(el)el.focus({preventScroll:true});
}
let refreshing=Promise.resolve();
function refresh(paths){refreshing=refreshing.then(()=>redraw(paths)).catch(()=>{});}
async function redraw(paths){
  let d;const p=PROJECT;
  try{const r=await fetch('/api/specs?'+pq(),{cache:'no-store'});if(!r.ok)return;d=await r.json();}catch(e){return;} // server gone: keep what is shown
  if(p!==PROJECT)return; // switched projects meanwhile
  noteActivity(paths,d);
  // The poller's echo of a move this page just made: same tasks.md hash, nothing to redraw.
  if(paths&&paths.length&&paths.every(p=>p==='.specs/planning/tasks.md')&&DATA&&DATA.tasks&&d.tasks&&d.tasks.sha256===DATA.tasks.sha256)return;
  await apply(d,paths);document.documentElement.dataset.rev=+(document.documentElement.dataset.rev||0)+1; // live reloads drawn: the browser tests wait on it
}
/* Draw a fresh /api/specs payload in place: same route, scroll, inspector, selection and focus. */
async function apply(d,paths){
  (paths||Object.keys(fileCache)).forEach(p=>{delete fileCache[p];});
  const key=focusKey(document.activeElement);
  const scroll=$('#content').scrollTop,ib0=insp.querySelector('.ib2'),inspScroll=ib0?ib0.scrollTop:0;
  const lanes=$$('#boardMode .gl[data-col] .box').map(b=>[b.closest('.gl').dataset.col,b.scrollTop]); // BL-TB-03: each lane's own scroll
  const was=inspOpen;
  const hadSpecs=!(DATA&&DATA.project&&DATA.project.specs===false);
  DATA=d;
  renderAll();
  const to=reloadView(curView,hadSpecs,!d.project||d.project.specs!==false); // .specs/ gone: offer setup; appeared another way: Tasks; Home stays
  if(to){go(to);return;}
  if(curView==='file')await renderFile(curFile);
  if(curView==='explorer')renderExplorer();
  if(curView==='security')await renderSecurity();
  if(was&&was.kind==='task'){
    const i=findRow(was.col,was.id,was.i);
    if(i>=0){openTask(was.col,i,true);$$(`#v-board .row[data-col="${was.col}"][data-i="${i}"]`).forEach(r=>r.classList.add('sel'));}
    else{insp.classList.remove('open');insp.setAttribute('aria-hidden','true');selected=null;inspOpen=null;}
  }
  if(was&&was.kind==='file'&&(!paths||paths.includes(was.path)))await openFile(was.path,true);
  $('#content').scrollTop=scroll;
  lanes.forEach(([c,top])=>{const b=$(`#boardMode .gl[data-col="${c}"] .box`);if(b)b.scrollTop=top;});
  const ib=insp.querySelector('.ib2');if(ib)ib.scrollTop=inspScroll;
  refocus(key);
}
let es=null;
function listen(missed){
  if(stopped||!window.EventSource)return;
  if(es)es.close(); // one stream, for the shown project
  es=new EventSource(DATA&&!DATA.project?'/api/events':'/api/events?'+pq());let dropped=!!missed; // no project served: the server-level stream (BL-080)
  es.addEventListener('clone',e=>onCloneEvent(e.data));
  es.addEventListener('setup',e=>onSetupEvent(e.data));
  es.addEventListener('mcp',e=>{let d=null;try{d=JSON.parse(e.data);}catch(_){}if(d&&DATA){DATA.mcp=d;if(curView==='setup'||curView==='new')suStatus();}});
  es.addEventListener('change',e=>{let paths=null;try{paths=JSON.parse(e.data).paths;}catch(_){}refresh(Array.isArray(paths)?paths:null);});
  const mine=es; // a refusal or a 503 closes it for good: reopen it in 5 s unless it was replaced meanwhile (BL-144)
  es.onerror=()=>{dropped=true;if(mine.readyState===2)setTimeout(()=>{if(es===mine)listen(true);},5000);}; // otherwise EventSource retries by itself
  es.onopen=()=>{if(dropped){dropped=false;refresh(null);}}; // catch up on anything missed
}

/* Show another served project: fresh data, its own event stream, its Tasks view (or the routed view). */
async function switchProject(n,keepRoute){
  const was=PROJECT;PROJECT=n;
  let d;
  try{const r=await fetch('/api/specs?'+pq(),{cache:'no-store'});if(!r.ok)throw new Error('/api/specs: HTTP '+r.status);d=await r.json();}
  catch(e){if(PROJECT===n)PROJECT=was;toast('Could not load the project: '+e.message);return;}
  if(PROJECT!==n)return;
  showProject(d,keepRoute);
}
/* Draw project PROJECT from payload d: the tail of a switch, also used with the payload an open returns (BL-067). */
function showProject(d,keepRoute){
  busyVeil.classList.remove('open');busyGo=null;busyFrom=null; // BL-127: a dialog never outlives its project
  Object.keys(fileCache).forEach(k=>{delete fileCache[k];});secShown.clear();
  DATA=d;selected=null;setRegenNote([]);
  renderAll();listen();
  if(keepRoute)route();else go('board');
}
$('#projList').addEventListener('click',e=>{const b=e.target.closest('[data-project]');if(!b)return;
  if(+b.dataset.project!==PROJECT)switchProject(+b.dataset.project);else if(NOPROJ.includes(curView))go('board');});

/* ---------------- open a project (BL-067) ----------------
   The + tile opens the mockup's sheet on its Folder tab. The list is GET /api/projects; opening is
   POST /api/projects, which serves one more folder and remembers it; Remove from list edits the
   registry only. A new project starts in the Setup view above (BL-103). The Clone tab
   (BL-PM-002) POSTs /api/projects/clone, which runs git clone and opens the folder; closing the sheet
   meanwhile aborts the request, and the server then removes what was downloaded. Nothing here is
   file content; the strings are the ones REQ-002.H.21, H.24 and H.26 list. */
const openVeil=$('#openVeil'),addBtn=$('#addBtn'),pathIn=$('#pathIn');
const TABS=['folder','clone'],GO={folder:'Open',clone:'Clone Repository'};
let openBusy=false,sheetFrom=$('#homeOpen'),sheetTab='folder',cloneCtl=null,browseCtl=null,browseBtn=null,cloneNamed=false,cloneTick=null,cloneT0=0,cloneProg=null;
if(TOKEN){addBtn.hidden=false;homeBtn.hidden=false;$('#cmdRegen').hidden=false;$('#rail>.logo').remove();} // the Home tile takes the logo's place (BL-PM-001)
/* Connect Your AI IDE (BL-PM-007): the config line for this server's /mcp, unless --no-mcp (BL-105). No status here:
   the page cannot know whether an IDE uses it. `env`: the token is SPECPILOT_MCP_TOKEN, so the line names it. */
if(TOKEN&&MCP){
  const env=MCP==='env';
  $('#mcpLine').textContent=mcpConfigLine(location.host,env?'${SPECPILOT_MCP_TOKEN}':TOKEN);
  $('#mcpNote').textContent=env
    ?'Add this to your IDE\u2019s MCP settings or to .mcp.json in your project. Claude Code fills in ${SPECPILOT_MCP_TOKEN} from the environment; for other IDEs, put the token in its place.'
    :'Add this to your IDE\u2019s MCP settings, or to .mcp.json in your project and add .mcp.json to .gitignore. The token changes each time specpilot serve starts.';
  $('#homeMcp').hidden=false;
  $('#mcpCopy').onclick=()=>(navigator.clipboard?navigator.clipboard.writeText($('#mcpLine').textContent):Promise.reject())
    .then(()=>toast('Copied.'),()=>toast('Could not copy. Select the line and copy it.'));
}
function openSheet(from,tab){
  hideTip();sheetFrom=from;openVeil.classList.add('open');
  $$('#openForm .field input').forEach(el=>{el.value='';});cloneNamed=false;
  setTab(tab||'folder');setTimeout(()=>(sheetTab==='clone'?$('#cloneIn'):pathIn).focus(),50);
}
function setTab(t){
  sheetTab=t;
  $$('#openTabs button').forEach(b=>{const on=b.dataset.t===t;b.classList.toggle('on',on);b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1;});
  $('#paneFolder').hidden=t!=='folder';$('#paneClone').hidden=t!=='clone';
  $('#openGo').textContent=GO[t];
  if(t==='folder')loadRecent();
}
function closeSheet(){if(!openVeil.classList.contains('open'))return;if(cloneCtl)cloneCtl.abort();if(browseCtl)browseCtl.abort();openVeil.classList.remove('open');sheetFrom.focus();}
/* The registry as GET /api/projects sends it: in the sheet, or on Home (BL-PM-001), where a row opens
   its folder at once and a served project also shows the branch the rail tooltip shows. */
function drawRecent(reg,home){
  $(home?'#homePath':'#recentPath').textContent=reg.path||'';
  $(home?'#homeBox':'#recentBox').innerHTML=recentHtml(reg,home,DATA?DATA.projects:[],chev);
}
async function loadRecent(){
  let reg;
  try{const r=await fetch('/api/projects',{cache:'no-store'});reg=r.ok?await r.json():{error:'HTTP '+r.status,entries:[]};}
  catch(e){reg={error:'The server did not answer.',entries:[]};}
  if(openVeil.classList.contains('open'))drawRecent(reg);
  if(curView==='home')drawRecent(reg,true);
}
async function postPath(path,url){
  const r=await fetch(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN},body:JSON.stringify({path})});
  return {r,res:await r.json().catch(()=>({}))};
}
/* Open a folder: the sheet's Open, and a row on Home. */
async function openPath(path){
  if(!path||openBusy)return;
  openBusy=true;$('#openGo').disabled=true;
  let out;
  try{out=await postPath(path,'/api/projects');}
  catch(e){openBusy=false;$('#openGo').disabled=false;toast('The server did not answer.');return;}
  openBusy=false;$('#openGo').disabled=false;
  await showOutcome(openOutcome(out.r.status,out.res));
}
/* Act on an answer to an open or a create (openOutcome()): show the project, or stay and say why. */
async function showOutcome(o){
  const wasHome=NOPROJ.includes(curView);
  if(o.project===null){toast(o.toast);return;} // refused: the page stays where it is
  closeSheet();
  if(o.specs){PROJECT=o.project;showProject(o.specs,false);}
  else if(o.project!==PROJECT)await switchProject(o.project);
  else if(wasHome)go('board');
  toast(o.toast);
  if(wasHome)$('#content').focus(); // Home is gone from the screen: focus goes to the project's view, not to a hidden control
}
/* Clone a repository: the Clone tab's Clone Repository. Minutes can pass; only the button says so. */
function setCloning(ctl){
  cloneCtl=ctl;openBusy=!!ctl;
  $('#openGo').disabled=!!ctl;
  $$('#paneClone input, #cloneBrowseBtn, #openTabs button').forEach(el=>{el.disabled=!!ctl;});
  // The time since the click, and an indeterminate bar until git gives a percentage (BL-PM-009).
  clearInterval(cloneTick);cloneTick=null;cloneProg=null;$('#cloneStatus').hidden=!ctl;
  if(!ctl)return;
  cloneT0=Date.now();drawCloning();cloneTick=setInterval(drawCloning,1000);
}
function drawCloning(){
  const bar=$('#cloneStatus .bar'),p=cloneProg;
  $('#cloneTime').textContent=cloneStatus(Math.floor((Date.now()-cloneT0)/1000),p);
  bar.classList.toggle('det',!!p);
  if(p){
    bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-valuenow',String(p.percent));
    bar.setAttribute('aria-valuetext',`${CLONE_STAGES[p.stage]} ${p.percent}%`);bar.style.setProperty('--pct',p.percent+'%');
  }else{['aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext'].forEach(a=>bar.removeAttribute(a));bar.style.removeProperty('--pct');}
}
/* A `clone` event from the stream: only while this page is cloning (not another tab's clone, not after the answer). */
function onCloneEvent(data){
  const p=cloneProgress(data);
  if(!cloneCtl||!p)return;
  cloneProg=p;drawCloning();
}
async function cloneRepo(){
  if(openBusy)return;
  const body={url:$('#cloneIn').value.trim(),parent:$('#cloneParentIn').value.trim(),name:$('#cloneNameIn').value.trim()};
  const ctl=new AbortController();setCloning(ctl);
  let r,res={};
  try{
    r=await fetch('/api/projects/clone',{method:'POST',cache:'no-store',signal:ctl.signal,headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN},body:JSON.stringify(body)});
    res=await r.json().catch(()=>({}));
  }catch(e){setCloning(null);if(!ctl.signal.aborted)toast('The server did not answer.');return;}
  setCloning(null);
  if(ctl.signal.aborted)return; // the sheet was closed: the server removes the clone
  if(r.status===200)clonedFrom[res.specs.project.root]=body.url; // the Setup view's Clone lead (BL-103)
  await showOutcome(openOutcome(r.status,res,'cloned'));
}
/* Browse… (BL-PM-011, BL-097): the server opens the system's folder dialog; the folder picked fills the
   button's field, and nothing is sent until the user does. One dialog at a time for the whole page. */
function setBrowsing(ctl,btn){
  browseCtl=ctl;if(btn)browseBtn=btn;
  const b=browseBtn;b.disabled=!!ctl||(b.id==='cloneBrowseBtn'&&!!cloneCtl); // a running clone keeps its sheet's button off
  if(ctl)b.setAttribute('aria-busy','true');else b.removeAttribute('aria-busy');
}
/* `field()` is looked up after the answer: the view may have changed meanwhile. `pick` also sees the path. */
async function browseFolder(btn,field,pick){
  if(browseCtl)return;
  const ctl=new AbortController();setBrowsing(ctl,btn);
  const back=()=>{if(btn.isConnected)btn.focus();};
  let r,res={};
  try{
    r=await fetch('/api/projects/browse',{method:'POST',cache:'no-store',signal:ctl.signal,headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN},body:'{}'});
    res=await r.json().catch(()=>({}));
  }catch(e){setBrowsing(null);if(!ctl.signal.aborted){toast('The server did not answer.');back();}return;}
  setBrowsing(null);
  if(ctl.signal.aborted)return; // the sheet was closed or #new left: the server closes the dialog
  if(r.status!==200){toast(res.error||`Nothing was chosen (HTTP ${r.status}).`);back();return;}
  const f=res.path&&field();
  if(f){f.value=res.path;if(pick)pick(res.path);f.focus();}else back();
}
async function removeRecent(path){
  let out;
  try{out=await postPath(path,'/api/projects/remove');}catch(e){toast('The server did not answer.');return;}
  if(out.r.status===200){drawRecent(out.res);if(curView==='home')drawRecent(out.res,true);}else toast(out.res.error||`Nothing was removed (HTTP ${out.r.status}).`);
}
addBtn.onclick=()=>{go('home');$('#homeOpen').focus();}; // every new project starts from Home (BL-PM-014); only Home's buttons open the sheet
homeBtn.onclick=()=>go('home');
$('#homeOpen').onclick=e=>openSheet(e.currentTarget);
$('#homeNew').onclick=()=>go('new');
$('#homeClone').onclick=e=>openSheet(e.currentTarget,'clone');
/* Folder name follows the URL (the server's own rule, route.js) until the user types a name. */
$('#cloneIn').addEventListener('input',e=>{if(!cloneNamed)$('#cloneNameIn').value=repoNameFromUrl(e.target.value.trim());});
$('#cloneNameIn').addEventListener('input',()=>{cloneNamed=true;});
$('#openTabs').addEventListener('click',e=>{const b=e.target.closest('[data-t]');if(b&&b.dataset.t!==sheetTab)setTab(b.dataset.t);});
$('#openTabs').addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();const n=TABS.length,i=TABS.indexOf(sheetTab),t=TABS[e.key==='Home'?0:e.key==='End'?n-1:(i+(e.key==='ArrowLeft'?n-1:1))%n];
  setTab(t);$(`#openTabs [data-t="${t}"]`).focus();
});
$('#homeBox').addEventListener('click',e=>{
  const rm=e.target.closest('[data-remove]');if(rm){removeRecent(rm.dataset.remove);return;}
  const row=e.target.closest('[data-path]');if(row)openPath(row.dataset.path);
});
$('#openCancel').onclick=closeSheet;
$('#browseBtn').onclick=()=>browseFolder($('#browseBtn'),()=>pathIn);
$('#cloneBrowseBtn').onclick=()=>browseFolder($('#cloneBrowseBtn'),()=>$('#cloneParentIn'));
openVeil.onclick=e=>{if(e.target===openVeil)closeSheet();};
$('#openForm').onsubmit=e=>{e.preventDefault();if(sheetTab==='clone')cloneRepo();else openPath(pathIn.value.trim());};
$('#recentBox').addEventListener('click',e=>{
  const rm=e.target.closest('[data-remove]');if(rm){removeRecent(rm.dataset.remove);return;}
  const row=e.target.closest('[data-path]');if(row){pathIn.value=row.dataset.path;pathIn.focus();}
});
$('#recentBox').addEventListener('keydown',e=>{const row=e.target.closest&&e.target.closest('[data-path]');if(row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();pathIn.value=row.dataset.path;pathIn.focus();}});

/* boot: the project count is unknown until the first load, so an index past the end falls back to project 0 */
insp.setAttribute('aria-hidden','true');
PROJECT=resolveRoute(curHash(),{},Infinity).project;
const bootQ=()=>PROJECT?'?'+pq():''; // project 0 is asked for without the parameter: with nothing served the server answers the no-project state (BL-080)
fetch('/api/specs'+bootQ(),{cache:'no-store'})
  .then(r=>{if(!r.ok&&PROJECT){PROJECT=0;return fetch('/api/specs'+bootQ(),{cache:'no-store'});}return r;})
  .then(r=>{if(!r.ok)throw new Error('/api/specs: HTTP '+r.status);return r.json();})
  .then(d=>{DATA=d;renderAll();route();listen();})
  .catch(e=>showErr('Could not load the project: '+e.message));
})();
