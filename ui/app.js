/* SpecPilot Local, read-only (BL-051). Ported from the approved mockup; every string a view
   shows about the project comes from GET /api/specs (readSpecs() output) or GET /api/file
   (the file itself). Views may group and order; they never reword. */
(function(){
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const toastEl=$('#toast');let toastT;
const toast=(m,action)=>{
  toastEl.textContent=m;toastEl.classList.toggle('has-action',!!action);
  if(action){const b=document.createElement('button');b.type='button';b.className='tact';b.textContent=action.label;b.onclick=()=>{toastEl.classList.remove('show');action.fn();};toastEl.appendChild(b);}
  toastEl.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('show'),action?8000:2600);};
/* Task moves (BL-053) are on only when the server put a token in the page (not with --read-only). */
const TOKEN=(document.querySelector('meta[name="specpilot-token"]')||{}).content||null;
/* /mcp is on (BL-PM-007), and whose token it takes: `page` or `env` (SPECPILOT_MCP_TOKEN). */
const MCP=(document.querySelector('meta[name="specpilot-mcp"]')||{}).content||null;
const MOVABLE={backlog:true,currentSprint:true};
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
function go(v,keep,sub){
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
  $('#modeSeg').hidden=v!=='board';$('#newTask').hidden=!(TOKEN&&v==='board');$('#editorBtn').hidden=NOPROJ.includes(v);syncIde();
  setNav(false);closeInsp();
  if(v==='home')loadRecent();
  if(v==='setup'||v==='new')renderSetup();
  if(v==='file')renderFile(sub);
  if(v==='explorer')renderExplorer();
  if(v==='security')renderSecurity();
  setHash(v,v==='file'?sub:(keep?stateFor(v):null));
  $('#content').scrollTop=0;
}
function stateFor(v){return v==='board'?(mode==='board'?'board':null):null}
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
  if(r.view==='board'&&r.sub==='board'){mode='board';$$('#modeSeg button').forEach(x=>x.classList.toggle('on',x.dataset.m==='board'));renderTasks();}
  go(r.view,true,r.sub);
}
if(urlOk)window.addEventListener('hashchange',route);
$$('.src .srow[data-v]').forEach(b=>b.onclick=()=>go(b.dataset.v,false,b.dataset.f));
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
let mode='list', selected=null, lastFocus=null, showAllBacklog=false, showAllDone=false;
const insp=$('#insp');
const COLS={currentSprint:'Current Sprint',backlog:'Backlog',completed:'Completed'};
const DOT={completed:'green',currentSprint:'orange',backlog:'hollow'};
function mdi(t){return md(String(t)).replace(/^<p>/,'').replace(/<\/p>$/,'');}
/* Completed is listed newest first (the file runs oldest first); the others in file order. */
function rowsOf(col){
  const T=DATA.tasks;if(!T)return [];
  const items=T[col].map((t,i)=>({t,i}));
  return col==='completed'?items.reverse():items;
}
function taskRow({t,i},col){
  const mv=TOKEN&&MOVABLE[col];
  return `<button type="button" class="row act" data-col="${col}" data-i="${i}"${mv?' draggable="true" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"':''}>
    <span class="st ${DOT[col]}" aria-hidden="true"></span>
    <div class="body"><div class="ttl clamp">${col==='completed'?`<span class="num" translate="no">${esc(t.num)}</span>`:''}<span class="id" translate="no">${mdi(t.id)}</span>${mdi(t.description)}</div></div>
    <div class="trail">${chev}</div>
  </button>`;
}
function group(col,items,opt){
  opt=opt||{};
  const shown=opt.limit&&!opt.all?items.slice(0,opt.limit):items;
  const more=opt.limit&&!opt.all&&items.length>opt.limit?`<button type="button" class="more" data-more="${col}">Show All ${items.length}</button>`:'';
  const gh=opt.disc
    ?`<div class="gh"><button type="button" class="disc" data-disc="${col}" aria-expanded="${!opt.closed}" aria-label="Toggle ${esc(COLS[col])}"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-chev"/></svg></button>${esc(COLS[col])} <span class="cnt">${items.length}</span>${more}</div>`
    :`<div class="gh">${esc(COLS[col])} <span class="cnt">${items.length}</span>${more}</div>`;
  return gh+`<div class="box">${shown.length?shown.map(x=>taskRow(x,col)).join(''):'<div class="empty">No rows in this section.</div>'}</div>`;
}
function renderTasks(){
  const S=rowsOf('currentSprint'),B=rowsOf('backlog'),D=rowsOf('completed');
  $('#gSprint').innerHTML=group('currentSprint',S,{});
  $('#gBacklog').innerHTML=group('backlog',B,{limit:6,all:showAllBacklog});
  $('#gDone').innerHTML=group('completed',D,{disc:true,closed:$('#gDone').classList.contains('closed'),limit:8,all:showAllDone});
  $('#boardMode').innerHTML=[['currentSprint',S,{}],['backlog',B,{}],['completed',D,{limit:8,all:showAllDone}]].map(([c,items,o])=>`<div class="gl" data-col="${c}">${group(c,items,o)}</div>`).join('');
  $('#listMode').hidden=mode!=='list';$('#boardMode').hidden=mode!=='board';
  const T=DATA.tasks;
  const bad=T?T.malformed:[];
  $('#gRaw').hidden=!bad.length;
  $('#gRaw').innerHTML=bad.length?`<div class="gh">Rows that could not be parsed <span class="cnt">${bad.length}</span></div><div class="box">${bad.map(l=>`<pre class="raw" translate="no">${esc(l)}</pre>`).join('')}</div>`:'';
  $('#gConv').innerHTML=T&&T.intro.trim()?`<div class="gh"><span translate="no">planning/tasks.md</span></div><div class="box"><div class="desc md">${md(T.intro)}</div></div>`:
    (T?'':'<div class="box"><div class="empty">No <span class="mono" translate="no">planning/tasks.md</span> in <span class="mono" translate="no">.specs/</span>.</div></div>');
  bind();
}
let inspOpen=null; // {kind:'task',col,i,id} | {kind:'file',path} | null
function openTask(col,i,quiet){
  const t=DATA.tasks[col][i];if(!t)return;
  if(!quiet)lastFocus=document.activeElement;
  selected=col+':'+i;inspOpen={kind:'task',col,i,id:t.id};
  $$('.row.sel').forEach(r=>r.classList.remove('sel'));
  $$(`#v-board .row[data-col="${col}"][data-i="${i}"]`).forEach(r=>r.classList.add('sel'));
  insp.innerHTML=`<div class="ih">${col==='completed'?`<span class="id" translate="no">${esc(t.num)}</span>`:''}<span class="id" translate="no">${mdi(t.id)}</span><span class="pill ${col==='completed'?'green':col==='currentSprint'?'orange':'gray'}">${esc(COLS[col])}</span><button type="button" class="ib x" id="inspX" aria-label="Close Details"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x"/></svg></button></div>
  <div class="ib2">
    <div class="gl"><div class="gh">Description <span class="cnt" translate="no">tasks.md · ## ${esc(COLS[col])}</span></div><div class="box"><div class="desc md">${md(t.description)}</div></div></div>
    <div class="actions"><a class="btn sm" href="${esc(editorUrl(DATA.project.root+'/.specs/planning/tasks.md',t.line))}">Open tasks.md in VS Code</a></div>
  </div>`;
  openInsp(quiet);
}
function openInsp(quiet){insp.classList.add('open');insp.setAttribute('aria-hidden','false');$('#inspX').onclick=closeInsp;if(!quiet)setTimeout(()=>$('#inspX').focus(),60);}
function closeInsp(){const was=insp.classList.contains('open');insp.classList.remove('open');insp.setAttribute('aria-hidden','true');selected=null;inspOpen=null;$$('.row.sel').forEach(r=>r.classList.remove('sel'));if(was&&lastFocus&&lastFocus.focus){lastFocus.focus();lastFocus=null;}}
function bind(){
  $$('#v-board .row[data-col]').forEach(r=>r.onclick=()=>openTask(r.dataset.col,+r.dataset.i));
  if(TOKEN)bindMoves();
  $$('[data-more]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(b.dataset.more==='completed')showAllDone=true;else showAllBacklog=true;renderTasks();});
  $$('[data-disc]').forEach(b=>b.onclick=e=>{e.stopPropagation();const g=$('#gDone');g.classList.toggle('closed');b.setAttribute('aria-expanded',!g.classList.contains('closed'));});
}
$$('#modeSeg button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;$$('#modeSeg button').forEach(x=>x.classList.toggle('on',x===b));renderTasks();setHash('board',stateFor('board'));});

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
  $$('#exBody .row.act').forEach(b=>b.onclick=()=>go('file',false,b.dataset.file));
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

/* ---------------- palette + keys ---------------- */
const palVeil=$('#palVeil'),palIn=$('#palIn'),palList=$('#palList');
function items(q){q=q.toLowerCase();
  const T=DATA?DATA.tasks:null;
  const it=[
    ...NAV.map(n=>n[0]==='file'?{l:'.specs/'+n[1],k:'file',go:()=>go('file',false,n[1])}:{l:VIEWS[n[0]],k:'view',go:()=>go(n[0])}),
    ...(DATA?DATA.nav.specs:[]).filter(p=>!NAV.some(n=>n[1]===p)).map(p=>({l:'.specs/'+p,k:'file',go:()=>go('file',false,p)})),
    ...(T?['currentSprint','backlog','completed'].flatMap(c=>T[c].map((t,i)=>({l:t.id+'  '+t.description,k:'task',go:()=>{go('board');openTask(c,i)}}))):[])
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
  if(mod&&/^[1-9]$/.test(e.key)){e.preventDefault();const n=NAV[+e.key-1];if(n)go(n[0],false,n[1]);return}
  if(e.key==='Escape'){if(!ideMenu.hidden){closeIde(true);return}hideTip();closeInsp();closePal();closeSheet();closeNewTask();setNav(false);return}
  if(inField||mod||e.altKey||taskVeil.classList.contains('open'))return;
  if(e.key==='h'&&TOKEN&&!openVeil.classList.contains('open')){go('home');return;}
  if(/^[1-9]$/.test(e.key)){const n=NAV[+e.key-1];if(n)go(n[0],false,n[1]);}
  if((e.key==='j'||e.key==='k')&&curView==='board'){const rows=$$((mode==='board'?'#boardMode':'#listMode')+' .row[data-col]');if(!rows.length)return;let i=rows.findIndex(r=>r.dataset.col+':'+r.dataset.i===selected);i=e.key==='j'?Math.min(rows.length-1,i+1):Math.max(0,i-1);if(i<0)i=0;openTask(rows[i].dataset.col,+rows[i].dataset.i);rows[i].scrollIntoView({block:'nearest'});rows[i].focus();}
});

/* ---------------- task moves (BL-053) ----------------
   A move is one line of planning/tasks.md cut and pasted unchanged; the server does it and
   answers with the new file hash and the fresh payload. Completed rows never move. */
let dragging=null,moving=false;
function bindMoves(){
  $$('#v-board .row[draggable="true"]').forEach(r=>{
    r.ondragstart=e=>{dragging={col:r.dataset.col,i:+r.dataset.i};e.dataTransfer.setData('text/plain',DATA.tasks[dragging.col][dragging.i].id);e.dataTransfer.effectAllowed='move';r.classList.add('drag');};
    r.ondragend=()=>{r.classList.remove('drag');dragging=null;$$('.gl.drop').forEach(g=>g.classList.remove('drop'));};
    r.onkeydown=e=>{
      if(!e.altKey||e.metaKey||e.ctrlKey)return;
      const col=r.dataset.col,i=+r.dataset.i,n=DATA.tasks[col].length;
      const go2={ArrowUp:i>0&&[col,i-1],ArrowDown:i<n-1&&[col,i+1],ArrowRight:col==='backlog'&&['currentSprint',DATA.tasks.currentSprint.length],ArrowLeft:col==='currentSprint'&&['backlog',DATA.tasks.backlog.length]}[e.key];
      if(go2===undefined)return;
      e.preventDefault();
      if(go2)move(col,i,go2[0],go2[1]);
    };
  });
  $$('#v-board .gl[data-col="backlog"],#v-board .gl[data-col="currentSprint"]').forEach(g=>{
    g.ondragover=e=>{if(!dragging)return;e.preventDefault();e.dataTransfer.dropEffect='move';g.classList.add('drop');};
    g.ondragleave=e=>{if(!g.contains(e.relatedTarget))g.classList.remove('drop');};
    g.ondrop=e=>{
      if(!dragging)return;e.preventDefault();g.classList.remove('drop');
      const to=g.dataset.col,src=dragging;dragging=null;
      // Position among the target's rows once the dragged row is out of the way.
      const others=DATA.tasks[to].map((_,j)=>j).filter(j=>!(to===src.col&&j===src.i));
      const over=e.target.closest&&e.target.closest('.row[data-col]');
      let at=others.length;
      if(over&&over.dataset.col===to){const j=+over.dataset.i,k=others.indexOf(j);if(k>=0){const b=over.getBoundingClientRect();at=k+(e.clientY>b.top+b.height/2?1:0);}}
      move(src.col,src.i,to,at);
    };
  });
}
async function move(col,i,toSection,toIndex,isUndo){
  const t=DATA.tasks[col][i],p=PROJECT;if(!t||moving)return;
  moving=true;
  let r,body={};
  try{
    r=await fetch('/api/tasks/move?'+pq(),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN,'If-Match':DATA.tasks.sha256},body:JSON.stringify({id:t.id,toSection,toIndex})});
    body=await r.json().catch(()=>({}));
  }catch(e){moving=false;toast('The server did not answer. Nothing was moved.');return;}
  moving=false;
  if(p!==PROJECT)return; // the page switched projects while the move was in flight
  if(r.status===200){
    if(toSection==='backlog'&&toIndex>=6)showAllBacklog=true;
    await apply(body.specs,['.specs/planning/tasks.md']);
    const j=DATA.tasks[toSection].findIndex(x=>x.id===t.id);
    const el=$(`${mode==='board'?'#boardMode':'#listMode'} .row[data-col="${toSection}"][data-i="${j}"]`);if(el)el.focus();
    const msg=col===toSection?`${t.id} moved within ## ${COLS[col]} in planning/tasks.md`:`${t.id} moved from ## ${COLS[col]} to ## ${COLS[toSection]} in planning/tasks.md`;
    toast(msg,isUndo?null:{label:'Undo',fn:()=>{const k=DATA.tasks[toSection].findIndex(x=>x.id===t.id);if(k>=0)move(toSection,k,body.from,body.fromIndex,true);}});
  }else if(r.status===409){
    if(body.specs)await apply(body.specs,null);
    toast(body.error||'planning/tasks.md changed on disk since this page loaded. The move was not made.');
  }else toast(body.error||`The move was not made (HTTP ${r.status}).`);
}

/* ---------------- new task (BL-PM-005) ----------------
   The server appends one row, `| <ID> | <description> |`, to the chosen section and picks the ID.
   The description goes as typed; a refusal is shown in the form with what was typed kept. */
const taskVeil=$('#taskVeil'),taskIn=$('#taskIn');
let taskSection='backlog',adding=false;
function setTaskSection(s){taskSection=s;$$('#taskSec button').forEach(b=>{const on=b.dataset.s===s;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});}
function taskError(m){const e=$('#taskErr');e.textContent=m||'';e.hidden=!m;}
function openNewTask(){if(!TOKEN||!DATA||!DATA.tasks)return;hideTip();taskIn.value='';taskError('');setTaskSection('backlog');taskVeil.classList.add('open');setTimeout(()=>taskIn.focus(),50);}
function closeNewTask(){if(!taskVeil.classList.contains('open')||adding)return;taskVeil.classList.remove('open');$('#newTask').focus();}
async function addTask(){
  if(adding)return;
  if(!taskIn.value.trim()){taskError('Type a description for the task.');taskIn.focus();return;}
  const p=PROJECT,section=taskSection;
  adding=true;$('#taskGo').disabled=true;taskError('');
  let r,body={};
  try{
    r=await fetch('/api/tasks/new?'+pq(),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN,'If-Match':DATA.tasks.sha256},body:JSON.stringify({description:taskIn.value,section})});
    body=await r.json().catch(()=>({}));
  }catch(e){r=null;}
  adding=false;$('#taskGo').disabled=false;
  if(!r){taskError('The server did not answer. Nothing was added.');return;}
  if(p!==PROJECT)return;
  if(r.status===200){
    if(section==='backlog'&&body.index>=6)showAllBacklog=true;
    taskVeil.classList.remove('open');
    await apply(body.specs,['.specs/planning/tasks.md']);
    $('#newTask').focus(); // what closing the inspector returns to
    openTask(section,body.index);
    const el=$(`${mode==='board'?'#boardMode':'#listMode'} .row[data-col="${section}"][data-i="${body.index}"]`);if(el)el.scrollIntoView({block:'nearest'});
    toast(`${body.id} added to ## ${COLS[section]} in planning/tasks.md`);
    return;
  }
  if(r.status===409&&body.specs)await apply(body.specs,null);
  taskError(body.error||`The task was not added (HTTP ${r.status}).`);taskIn.focus();
}
$('#newTask').onclick=openNewTask;
$$('#taskSec button').forEach(b=>b.onclick=()=>setTaskSection(b.dataset.s));
$('#taskCancel').onclick=closeNewTask;
taskVeil.onclick=e=>{if(e.target===taskVeil)closeNewTask();};
$('#taskForm').onsubmit=e=>{e.preventDefault();addTask();};

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
  if(row){const t=DATA.tasks&&DATA.tasks[row.dataset.col][+row.dataset.i];return {row:row.dataset.col,id:t?t.id:null,i:+row.dataset.i,board:!!row.closest('#boardMode')};}
  for(const a of ['data-open','data-file','data-more','data-disc'])if(el.hasAttribute&&el.hasAttribute(a))return {sel:`[${a}="${CSS.escape(el.getAttribute(a))}"]`};
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
  if(key.row){const i=findRow(key.row,key.id,key.i);if(i>=0)el=$(`${key.board?'#boardMode':'#listMode'} .row[data-col="${key.row}"][data-i="${i}"]`);}
  else el=$(key.sel);
  if(el)el.focus({preventScroll:true});
}
let refreshing=Promise.resolve();
function refresh(paths){refreshing=refreshing.then(()=>redraw(paths)).catch(()=>{});}
async function redraw(paths){
  let d;const p=PROJECT;
  try{const r=await fetch('/api/specs?'+pq(),{cache:'no-store'});if(!r.ok)return;d=await r.json();}catch(e){return;} // server gone: keep what is shown
  if(p!==PROJECT)return; // switched projects meanwhile
  // The poller's echo of a move this page just made: same tasks.md hash, nothing to redraw.
  if(paths&&paths.length&&paths.every(p=>p==='.specs/planning/tasks.md')&&DATA&&DATA.tasks&&d.tasks&&d.tasks.sha256===DATA.tasks.sha256)return;
  await apply(d,paths);document.documentElement.dataset.rev=+(document.documentElement.dataset.rev||0)+1; // live reloads drawn: the browser tests wait on it
}
/* Draw a fresh /api/specs payload in place: same route, scroll, inspector, selection and focus. */
async function apply(d,paths){
  (paths||Object.keys(fileCache)).forEach(p=>{delete fileCache[p];});
  const key=focusKey(document.activeElement);
  const scroll=$('#content').scrollTop,ib0=insp.querySelector('.ib2'),inspScroll=ib0?ib0.scrollTop:0;
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
  const ib=insp.querySelector('.ib2');if(ib)ib.scrollTop=inspScroll;
  refocus(key);
}
let es=null;
function listen(){
  if(stopped||!window.EventSource)return;
  if(es)es.close(); // one stream, for the shown project
  es=new EventSource(DATA&&!DATA.project?'/api/events':'/api/events?'+pq());let dropped=false; // no project served: the server-level stream (BL-080)
  es.addEventListener('clone',e=>onCloneEvent(e.data));
  es.addEventListener('setup',e=>onSetupEvent(e.data));
  es.addEventListener('mcp',e=>{let d=null;try{d=JSON.parse(e.data);}catch(_){}if(d&&DATA){DATA.mcp=d;if(curView==='setup'||curView==='new')suStatus();}});
  es.addEventListener('change',e=>{let paths=null;try{paths=JSON.parse(e.data).paths;}catch(_){}refresh(Array.isArray(paths)?paths:null);});
  es.onerror=()=>{dropped=true;};          // EventSource retries by itself
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
$('#gDone').classList.add('closed');
PROJECT=resolveRoute(curHash(),{},Infinity).project;
const bootQ=()=>PROJECT?'?'+pq():''; // project 0 is asked for without the parameter: with nothing served the server answers the no-project state (BL-080)
fetch('/api/specs'+bootQ(),{cache:'no-store'})
  .then(r=>{if(!r.ok&&PROJECT){PROJECT=0;return fetch('/api/specs'+bootQ(),{cache:'no-store'});}return r;})
  .then(r=>{if(!r.ok)throw new Error('/api/specs: HTTP '+r.status);return r.json();})
  .then(d=>{DATA=d;renderAll();route();listen();})
  .catch(e=>showErr('Could not load the project: '+e.message));
})();
