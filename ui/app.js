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
const MOVABLE={backlog:true,currentSprint:true};
const chev='<svg class="ico chev" aria-hidden="true" focusable="false"><use href="#i-chev"/></svg>';

/* theme: dark by default, light is a per-viewer toggle */
let theme=null;try{theme=localStorage.getItem('sp-theme');}catch(e){}
function setMeta(light){const m=document.querySelector('meta[name=theme-color]');if(m)m.content=light?'#f8fafc':'#0f172a';}
if(theme==='light'){document.documentElement.setAttribute('data-theme','light');setMeta(true);}
$('#themeBtn').onclick=()=>{const light=document.documentElement.getAttribute('data-theme')==='light';if(light)document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme','light');setMeta(!light);try{light?localStorage.removeItem('sp-theme'):localStorage.setItem('sp-theme','light');}catch(e){}toast('Appearance: '+(light?'dark':'light'));};

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
  const p=DATA.project, name=projectLabel(p), where=p.root+(p.branch?' · '+p.branch:'');
  $('#projList').innerHTML=DATA.projects.map((q,i)=>{const n=projectLabel(q),cur=i===PROJECT&&!NOPROJ.includes(curView);
    return `<button class="tile blue${cur?' cur':''}" data-project="${i}" data-tip="${esc(n)}" data-path="${esc(q.root+(q.branch?' · '+q.branch:''))}" aria-label="${esc(n)}"${cur?' aria-current="true"':''}><span aria-hidden="true">${esc(initials(n))}</span></button>`;}).join('');
  $('#curGrp').textContent=name;$('#curGrp').title=p.root;
  $('#curBranch').textContent=p.branch||'';
  $('#subName').textContent=name;$('#subPath').textContent=where;
  $('#footAddr').textContent=$('#homeAddr').textContent=location.host;$('#footVer').textContent=$('#homeVer').textContent='v'+p.specpilotVersion;
  document.title=name+' · SpecPilot Local';
}

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
  else if(NOPROJ.includes(v)){if(!TOKEN)v='board';} // no Home and no new-project chat with --read-only
  else if(!VIEWS[v]||v==='setup')v='board';
  if(!NOPROJ.includes(v)&&DATA&&DATA.project.specs===false)v='setup'; // no .specs/ yet: every route of the project shows the setup view (BL-055)
  curView=v;
  $('#win').classList.toggle('home',v==='home');$('#win').classList.toggle('inchat',v==='new'||v==='setup'); // not `chat`: the chat's own rules are `.chat .x` and must not reach the rail
  $$('.content>.view').forEach(e=>e.classList.toggle('on',e.id==='v-'+(v==='new'||v==='setup'?'chat':v))); // one chat section for both flows (BL-PM-004)
  syncNav();
  $('#title').textContent=v==='file'?(TITLES[sub]||sub):v==='setup'?projectLabel(DATA.projects[PROJECT]):v==='new'?'New project':VIEWS[v];
  $('#chatSub').hidden=!(v==='new'||v==='setup');if(v!=='new'&&v!=='setup'){$('#chatRestart').hidden=$('#chatClose').hidden=$('#chatSetups').hidden=true;chat=null;}
  $('#modeSeg').hidden=v!=='board';$('#newTask').hidden=!(TOKEN&&v==='board');
  setNav(false);closeInsp();
  if(v!=='file'||sub!==fileNoteFor)clearFileNote();
  if(v==='home')loadRecent();
  if(v==='setup')renderChat(false);
  if(v==='new')renderChat(true);
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
  if(NOPROJ.includes(r.view)){go(r.view);return;} // Home and the new-project chat belong to no project: the shown one stays loaded behind them
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
  $('#fmBox').innerHTML=fm?`<div class="gh">Front matter <span class="cnt" translate="no">.specs/${esc(path)}</span></div><div class="box"><pre class="raw" translate="no">${esc(fm)}</pre></div>`:'';
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
  insp.innerHTML=head+`<div class="ib2">${fm?`<div class="gl"><div class="gh">Front matter</div><div class="box"><pre class="raw" translate="no">${esc(fm)}</pre></div></div>`:''}<div class="md doc">${md(body)}</div></div>`;
  openInsp(quiet);
}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-open]');if(b)openFile(b.dataset.open);});

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
  if(e.key==='Escape'){hideTip();closeInsp();closePal();closeSheet();closeNewTask();if(chat&&chat.st.editing&&!chatBusy){chat.st.editing=null;comp=null;drawChat();}setNav(false);return}
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

/* ---------------- setup chat (BL-055, BL-PM-004) ----------------
   The init.specpilot.dev chat over the CLI's own questions: for a new project (#new) and for a named
   folder with no .specs/ yet (its setup view). The questions, their chat lines, choices, steps and file
   lists come from GET /api/setup or GET /api/projects/new; the page adds only the strings REQ-002.H.17
   and H.27 list, and its own parent-folder question. What can be decided without the DOM is in route.js. */
let fileNoteFor=null;
function clearFileNote(){const n=$('#fileNote');n.hidden=true;n.innerHTML='';fileNoteFor=null;}
function setFileNote(path,lines){const n=$('#fileNote');n.innerHTML=lines.map(l=>`<p class="note" translate="no">${esc(l)}</p>`).join('');n.hidden=false;fileNoteFor=path;}
/* Above onboarding.md after a setup or a create: what was kept, and the Codex notice. */
function noteCreated(res){
  go('file',false,'development/onboarding.md');
  const lines=[];
  if(res.kept&&res.kept.length)lines.push('Kept as they were: '+res.kept.join(', ')+'. Run specpilot backfill there to add missing SpecPilot sections to the instruction and command files.');
  if(res.notice)lines.push(res.notice);
  if(lines.length)setFileNote('development/onboarding.md',lines);
}
async function getQuestions(url){
  try{const r=await fetch(url,{cache:'no-store'});if(r.ok)return await r.json();return r.status===404?null:{error:(await r.json().catch(()=>({}))).error||'HTTP '+r.status};}
  catch(e){return {error:'The server did not answer.'};}
}
/* The page's own question of a new project; every other one is the server's or the chat core's. */
const PARENT_Q={key:'parent',message:'Parent folder',label:'Folder',required:true,chat:"Nice, {name}. Where should it live? I'll create {name}/ inside this folder.",placeholder:'~/dev'};
const CC=window.SpecPilotChat; // the chat core (BL-PM-004b): src/core/chatFlow.ts, served as /assets/chat-core.js
/* Saved setups (BL-PM-004b): every setup the chat has started, kept in this browser under sp-setups. */
let storeOk=true,setups=[];
try{setups=setupsLoad(localStorage.getItem(SETUPS_KEY));}catch(e){storeOk=false;}
function storeSetups(){try{localStorage.setItem(SETUPS_KEY,JSON.stringify(setups));}catch(e){storeOk=false;}}
function saveSetup(st){if(!st.started)return;st.updatedAt=Date.now();setups=setupsPut(setups,setupRecord(st));storeSetups();}
function dropSetup(id){setups=setupsRemove(setups,id);storeSetups();}
const freshSetup=(kind,root,id)=>({id:id||(kind==='setup'?'s:'+root:'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)),kind,root,answers:{},editing:null,started:false,seeded:{},preview:{done:false,changed:false},finished:false});
const restoreSetup=e=>({...JSON.parse(JSON.stringify(e)),editing:null});
const live={}; // the setups open in this page, by id
let curNew=null; // the new-project setup #new shows
let chat=null,chatBusy=false,comp=null;
/* Shown by go(): the chat for a new project, or for the project without .specs/. */
async function renderChat(isNew){
  const pj=PROJECT,note=$('#chatNote');
  $('#intro').hidden=$('#thread').hidden=$('#composer').hidden=note.hidden=true;$('#chatRestart').hidden=$('#chatClose').hidden=$('#chatSetups').hidden=true;$('#cbody').hidden=true;
  chat=null;comp=null;
  if(!TOKEN){note.textContent='Started with --read-only, so nothing can be set up here.';note.hidden=false;return;}
  const q=await getQuestions(isNew?'/api/projects/new':'/api/setup?project='+pj);
  if(PROJECT!==pj||curView!==(isNew?'new':'setup'))return;
  if(!q)return; // 404: not a folder named on the command line, so nothing to set up
  if(q.error){note.textContent=q.error;note.hidden=false;return;}
  let st;
  if(isNew){
    if(!curNew||!live[curNew]){const rec=curNew&&setups.find(e=>e.id===curNew);st=rec?restoreSetup(rec):freshSetup('new');curNew=st.id;live[st.id]=st;}
    st=live[curNew];
  }else{
    const root=DATA.projects[pj].root,id='s:'+root,rec=setups.find(e=>e.id===id);
    st=live[id]||(live[id]=rec?restoreSetup(rec):freshSetup('setup',root));
  }
  chat={id:st.id,isNew,project:pj,q,st};
  $('#cbody').hidden=false;
  drawChat();
}
/* The questions to ask now: the server's (the CLI's) through flowQuestions(), placed and completed by the chat core. */
function chatAsk(){
  const st=chat.st,first=chat.isNew?[{...PARENT_Q,step:chat.q.steps[0]}]:[];
  return CC.chatQuestions([...first,...chat.q.questions],flowQuestions(chat.q,st.answers,first),st.answers,chat.isNew?'new':'setup',chat.q.files.outside);
}
/* What fills {name} and {language} in the bot lines. */
function chatCtx(){
  const a=chat.st.answers,lq=chat.q.questions.find(x=>x.key==='language'),c=lq&&lq.choices.find(x=>x.value===a.language);
  return {name:chat.isNew?a.name:projectLabel(DATA.projects[chat.project]),language:c?c.name:(chat.q.detected?chat.q.detected.language:'')};
}
/* The list of saved setups beside the thread. */
function drawSetups(){
  const el=$('#setupList');
  if(!storeOk){el.innerHTML='<p class="note">Setups cannot be saved in this browser.</p>';return;}
  const served=root=>DATA.projects.findIndex(p=>p.root===root);
  el.innerHTML=setups.length?setups.map(e=>{
    const off=e.kind==='setup'&&served(e.root)<0,t=setupTitle(e);
    return `<div class="srow2${chat&&chat.st.id===e.id?' cur':''}"><button type="button" class="go" data-setup="${esc(e.id)}"${off?' disabled':''}><span class="t" translate="no">${esc(t)}</span><span class="d">${esc(off?`Open ${e.root} to resume`:`${setupStatus(e)} · ${when(new Date(e.updatedAt).toISOString())}`)}</span></button><button type="button" class="rm" data-rm-setup="${esc(e.id)}" aria-label="Remove ${esc(t)}">Remove</button></div>`;
  }).join(''):'<p class="note">No saved setups yet.</p>';
}
function drawChat(){
  const st=chat.st,isNew=chat.isNew,ctx=chatCtx();
  $('#chatRestart').hidden=!st.started;$('#chatClose').hidden=!isNew;$('#chatSetups').hidden=false;
  $('#title').textContent=isNew?(st.answers.name||'New project'):projectLabel(DATA.projects[chat.project]);
  drawSetups();
  if(!st.started){ // the intro
    $('#intro').hidden=false;$('#thread').hidden=$('#composer').hidden=true;$('#chatSub').textContent='';$('#barI').style.width='0';$('#v-chat .bar').setAttribute('aria-valuenow','0');
    const mono=t=>`<span class="mono" translate="no">${esc(t)}</span>`;
    $('#introH').textContent=isNew?"Hey, I'm SpecPilot 👋":"Hey, I'm SpecPilot";
    $('#introText').innerHTML=isNew?'I turn your project requirements into a complete, structured spec suite - requirements, architecture, tests - and keep it in sync as you build.'
      :`There is no ${mono('.specs/')} folder in ${mono(DATA.projects[chat.project].root)} yet. I'll ask the same questions as ${mono('specpilot add-specs')}, one at a time, then write it and the files for your AI IDE. Existing files are never changed.`;
    $('#introText2').hidden=!isNew;$('#introText2').innerHTML=`I write your ${mono('.specs/')} folder, filled in from your answers, plus the files that keep your AI IDE following it.`;
    const det=$('#introDetected');det.hidden=!(chat.q.detected);det.textContent=chat.q.detected?chat.q.detected.line:'';
    $('#nameLbl').hidden=$('#nameIn').parentElement.hidden=!isNew;$('#setupStart').hidden=isNew;$('#nameErr').textContent='';
    if(isNew){$('#nameIn').value=st.answers.name||'';$('#nameGo').disabled=!$('#nameIn').value.trim();}
    setTimeout(()=>{if(chat&&!chat.st.started)(isNew?$('#nameIn'):$('#setupStart')).focus();},50);
    return;
  }
  $('#intro').hidden=true;$('#thread').hidden=$('#composer').hidden=false;
  const list=chatAsk(),cur=nextQuestion(list,st.answers,st.editing),steps=[...new Set(list.map(x=>x.step))],done=list.filter(x=>answered(x,st.answers)).length;
  if(st.finished!==!cur){st.finished=!cur;saveSetup(st);drawSetups();}
  const bar=$('#v-chat .bar'),pct=Math.round(done/list.length*100);$('#barI').style.width=pct+'%';bar.setAttribute('aria-valuenow',pct);
  $('#chatSub').textContent=cur?`Step ${steps.indexOf(cur.step)+1} of ${steps.length} · ${cur.step}`:'Review';
  let html=threadRows(chat.q,list,st.answers,cur,ctx,isNew).map(r=>
    r.kind==='divider'?`<div class="divider"><span>${esc(r.text)}</span></div>`
    :r.kind==='note'?`<p class="cnote">${esc(r.text)}</p>`
    :r.kind==='bot'?`<div class="bot"><svg class="logo" aria-hidden="true" focusable="false"><use href="#logo"/></svg><div class="msg">${esc(r.text)}${r.cli?`<span class="cli" translate="no">${esc(r.cli)}</span>`:''}${r.caption?`<span class="cap" translate="no">${esc(r.caption)}</span>`:''}</div></div>`
    :`<div class="me${r.skipped?' skipped':''}"><button type="button" class="b${r.mono?' mono':''}" data-k="${esc(r.key)}" aria-label="Your answer: ${esc(r.text)}. Edit">${esc(r.text)}</button><span class="ed" aria-hidden="true">✎ tap to edit</span></div>`).join('');
  if(!cur){
    const files=previewFiles(chat.q,st.answers),pv=st.preview,again=pv.done&&pv.changed;
    html+=`<div class="recap"><svg class="logo" aria-hidden="true" focusable="false"><use href="#logo"/></svg><div class="card">That's everything I need. Here's a quick recap:<div class="pen">✎ Click any answer to change it. You come straight back here.</div><div class="grid">${recapCards(list,st.answers).map(c=>`<div class="rc"><div class="t">${esc(c.title)}</div>${c.rows.map(r=>`<button type="button" class="l" data-k="${esc(r.key)}"><span>${esc(r.label)}</span><span translate="no">${esc(r.value)}</span></button>`).join('')}</div>`).join('')}</div>${again?'<p class="chg">Answers changed since the last preview. Preview again to see the new files.</p>':''}<details id="pv"><summary>${again?'Preview again':'Preview files'} (${files.length})</summary><ul translate="no" id="pvList">${files.map(f=>`<li>${esc(f.path)}${f.kept?' <span class="kept">Already here, will be kept</span>':''}</li>`).join('')}</ul></details><button type="button" class="btn pri" id="chatCreate">${isNew?'Create Project':'Create .specs/'}</button><p class="err" id="chatErr" role="alert"></p></div></div>`;
  }
  $('#msgs').innerHTML=html;
  const pvEl=$('#pv');if(pvEl)pvEl.addEventListener('toggle',()=>{if(pvEl.open)loadPreview();});
  drawComposer(cur);
  const th=$('#thread');th.scrollTop=th.scrollHeight;
}
/* The request body of a create or a preview: the CLI's answers, the optional fields and the folded context answers. */
function chatBody(){
  const asked=chatAsk(),st=chat.st;
  const body={...flowBody(asked.filter(x=>!x.core),st.answers),...CC.requestFields(asked,st.answers,chat.isNew?'new':'setup')};
  if(chat.isNew)body.name=st.answers.name;
  return body;
}
/* The recap's preview: POST /api/preview with the create body, each file then shown as render() gives it. */
async function loadPreview(){
  const c=chat,body=chatBody(),list=$('#pvList');if(!list)return;
  if(c.isNew)delete body.parent;
  let r,res={};
  try{r=await fetch(c.isNew?'/api/preview':'/api/preview?project='+c.project,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN},body:JSON.stringify(body)});res=await r.json().catch(()=>({}));}
  catch(e){r=null;}
  if(chat!==c||!$('#pvList'))return;
  if(!r||r.status!==200){$('#pvList').insertAdjacentHTML('beforebegin',`<p class="err">${esc(r?res.error||`The preview could not be made (HTTP ${r.status}).`:'The server did not answer.')}</p>`);return;}
  const kept=new Set(res.kept||[]);
  $('#pvList').outerHTML=`<div class="pvl" id="pvList" translate="no">${res.files.map(f=>`<details class="pf"><summary>${esc(f.path)}${kept.has(f.path)?' <span class="kept">Already here, will be kept</span>':''}</summary>${kept.has(f.path)?'':/\.md$/.test(f.path)?`<div class="md">${md(f.content)}</div>`:`<pre>${esc(f.content)}</pre>`}</details>`).join('')}</div>`;
  if(c.st.preview.changed||!c.st.preview.done){c.st.preview={done:true,changed:false};saveSetup(c.st);}
  const chg=$('#msgs .chg');if(chg)chg.remove();const sum=$('#pv summary');if(sum)sum.textContent=`Preview files (${res.files.length})`;
}

/* ---- the composer: one state per shown question (`comp`), drawn from the question and redrawn on every change */
const isMulti=t=>t==='multi'||t==='grouped-multi'||t==='platform-grid';
function initComp(cur){
  const a=chat.st.answers,stored=cur.answered?a[cur.key]:undefined,seed=stored===undefined?cur.seed:stored;
  const c={key:cur.key,tab:null,custom:'',showCustom:false};
  if(cur.type==='categorized')c.v=JSON.parse(JSON.stringify(seed||{}));
  else if(isMulti(cur.type))c.v=Array.isArray(seed)?[...seed]:[];
  else if(cur.type==='text'||cur.type==='tabbed-chips')c.v=typeof stored==='string'&&stored!==cur.todo?stored:'';
  else{c.v=typeof seed==='string'?seed:'';const ids=compOptions(cur).map(o=>o.id);if(cur.custom&&c.v&&!ids.includes(c.v)){c.custom=c.v;c.showCustom=true;c.v='';}}
  const opts=compOptions(cur),sel=Array.isArray(c.v)?c.v:[c.v];
  const withSel=opts.find(o=>o.group&&sel.includes(o.id))||opts.find(o=>o.group&&o.badge==='recommended')||opts.find(o=>o.group);
  c.tab=cur.type==='categorized'?(cur.categories[0]&&cur.categories[0].id):withSel?withSel.group:null;
  if(cur.type==='platform-grid'){const tabs=CC.platformGridGroups(a.projectCategory||null,c.v);c.tab=tabs.find(t=>c.v.some(id=>CC.PLATFORM_GROUPS.find(g=>g.group===t).items.some(i=>i.id===id)))||tabs[0];}
  return c;
}
const compOptions=cur=>cur.core?(cur.options||[]):choiceOptions(cur);
function drawComposer(cur){
  const st=chat.st,c=$('#comp'),editing=!!st.editing;
  if(!cur){comp=null;c.innerHTML=`<div class="act"><span class="hint">All answered. Review above, then ${chat.isNew?'Create Project':'Create .specs/'}.</span></div>`;return;}
  if(!comp||comp.key!==cur.key)comp=initComp(cur);
  const label=esc(cur.message||cur.chat||cur.label),k=comp,acts=(extra,ok)=>`<div class="act"><span class="hint">${editing?'Changing an earlier answer':''}</span><span class="err" id="compErr" role="alert"></span>${editing?'<button type="button" class="btn" id="chatCancel">Cancel</button>':''}${extra||''}<button type="submit" class="btn pri" id="chatGo"${ok?'':' disabled'}>${isMulti(cur.type)&&k.v.length?`Continue (${k.v.length+(k.custom.trim()?1:0)})`:'Continue'}</button></div>`;
  const skip=cur.required?'':'<button type="button" class="btn" id="chatSkip">Skip</button>';
  const other=cur.custom?`<button type="button" class="chip other" id="chatOther" aria-pressed="${k.showCustom}"><b>${cur.type==='grouped-multi'?'Add custom user type':'Other: ___'}</b></button>`:'';
  const customIn=k.showCustom?`<div class="crow"><input type="text" id="chatCustom" maxlength="100" placeholder="Type your own" aria-label="Your own answer" value="${esc(k.custom)}"></div>`:'';
  const note=cur.note?`<p class="cnote">${esc(cur.note)}</p>`:'';
  let h='';
  if(cur.type==='text'){
    const max=cur.key==='parent'?4096:cur.key==='handle'?39:cur.key==='nonGoals'?870:1000;
    h=`<div class="crow"><input type="text" id="chatIn" class="${cur.key==='parent'||cur.key==='handle'?'mono':''}" placeholder="${esc(cur.placeholder||'')}" aria-label="${label}" aria-describedby="compErr" maxlength="${max}"${cur.required?' aria-required="true"':''} value="${esc(k.v)}"></div>`
      +acts((cur.todo?'<button type="button" class="btn" id="chatTodo">Not sure - skip for now</button>':'')+skip,true);
  }else if(cur.type==='tabbed-chips'){
    const groups=[...new Set(cur.options.map(o=>o.group))],tab=k.tab||groups[0];
    h=`<p class="lbl">Pick a starter project type from below</p>${tabsHtml(groups.map(g=>({id:g,label:g})),tab)}<div class="chips" role="group" aria-label="${label}">${cur.options.filter(o=>o.group===tab).map(o=>optionHtml(o,k.v===o.id)).join('')}</div><p class="lbl">Or describe your project idea in plain words below</p><div class="crow"><input type="text" id="chatIn" placeholder="${esc(cur.placeholder||'')}" aria-label="${label}" aria-describedby="compErr" maxlength="1000" aria-required="true" value="${esc(k.v)}"></div>`+acts('',true);
  }else if(cur.type==='platform-grid'){
    const tabs=CC.platformGridGroups(st.answers.projectCategory||null,k.v),tab=tabs.includes(k.tab)?k.tab:tabs[0],g=CC.PLATFORM_GROUPS.find(x=>x.group===tab);
    const line=CC.bundleLine(k.v);
    h=tabsHtml(tabs.map(t=>{const grp=CC.PLATFORM_GROUPS.find(x=>x.group===t);return {id:t,label:`${grp.emoji} ${t}`,count:k.v.filter(id=>grp.items.some(i=>i.id===id)).length};}),tab)
      +`<div class="chips grid2" role="group" aria-label="${label}">${g?g.items.map(i=>optionHtml({id:i.id,label:i.label,emoji:i.emoji,description:`[${i.lang}]`},k.v.includes(i.id))).join(''):''}</div>${line?`<p class="cnote">${esc(line)}</p>`:''}`+acts('',k.v.length>0);
  }else if(cur.type==='categorized'){
    const cats=cur.categories,tab=cats.some(x=>x.id===k.tab)?k.tab:cats[0]&&cats[0].id,cat=cats.find(x=>x.id===tab);
    h=tabsHtml(cats.map(x=>({id:x.id,label:`${x.emoji} ${x.label}`,count:(k.v[x.id]||[]).length})),tab)
      +`<div class="chips" role="group" aria-label="${label}">${cat?cat.options.map(o=>optionHtml({id:o,label:o,emoji:o==='None'?'➖':''},(k.v[cat.id]||[]).includes(o))).join(''):''}</div>`+acts('<button type="button" class="btn" id="chatNone">None of these apply →</button>',true);
  }else{
    const opts=compOptions(cur),sel=isMulti(cur.type)?k.v:[k.v],extra=isMulti(cur.type)?k.v.filter(v=>!opts.some(o=>o.id===v)).map(v=>({id:v,label:v})):[];
    const grouped=cur.type!=='grouped-multi'&&opts.some(o=>o.group),groups=[...new Set(opts.filter(o=>o.group).map(o=>o.group))],tab=groups.includes(k.tab)?k.tab:groups[0];
    let body;
    if(cur.type==='grouped-multi')body=groups.map(g=>`<p class="lbl">${esc(g)}</p><div class="chips">${opts.filter(o=>o.group===g).map(o=>optionHtml(o,sel.includes(o.id))).join('')}</div>`).join('')
      +`<div class="chips">${[...opts.filter(o=>!o.group),...extra].map(o=>optionHtml(o,sel.includes(o.id))).join('')}${other}</div>`;
    else body=(grouped?tabsHtml(groups.map(g=>({id:g,label:g,count:opts.filter(o=>o.group===g&&sel.includes(o.id)).length})),tab):'')
      +`<div class="chips${cur.type==='cards'||opts.some(o=>o.description)?' grid2':''}" role="group" aria-label="${label}">${opts.filter(o=>!grouped||o.group===tab).map(o=>optionHtml(o,sel.includes(o.id))).join('')}</div>`
      +`<div class="chips">${(grouped?opts.filter(o=>!o.group):[]).concat(extra).map(o=>optionHtml(o,sel.includes(o.id))).join('')}${other}</div>`;
    const any=isMulti(cur.type)?k.v.length>0||!!k.custom.trim():!!k.v||!!(k.showCustom&&k.custom.trim());
    h=note+body+customIn+acts(isMulti(cur.type)?'':skip,any||isMulti(cur.type)&&!cur.required);
  }
  c.innerHTML=h;
}
/* An answer: stored, stale seeds replaced, the preview marked out of date, the setup saved, and the chat moves on. */
function chatAnswer(cur,value){
  const st=chat.st;
  Object.assign(st.answers,cur.core?CC.answerPatch(cur.key,value,st.answers):{[cur.key]:value});
  if(cur.seed!==undefined&&JSON.stringify(value)===JSON.stringify(cur.seed))st.seeded[cur.key]=value;else delete st.seeded[cur.key];
  const r=CC.reseed(chatAsk(),st.answers,st.seeded);st.answers=r.answers;st.seeded=r.seeded;
  if(st.preview.done)st.preview.changed=true;
  st.editing=null;comp=null;saveSetup(st);drawChat();
}
function chatEdit(key){
  if(chatBusy)return;
  comp=null;
  if(key==='name'){chat.st.started=false;drawChat();return;}
  chat.st.editing=key;drawChat();
}
/* The same POST the forms sent: /api/setup for a folder without .specs/, /api/projects/new for a new project. */
async function chatCreate(){
  if(chatBusy)return;
  const c=chat,root=DATA.projects[c.project].root,btn=$('#chatCreate'),err=$('#chatErr');
  chatBusy=true;btn.disabled=true;err.textContent='';
  const body=chatBody();
  let r,res={};
  try{
    r=await fetch(c.isNew?'/api/projects/new':'/api/setup?project='+c.project,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN},body:JSON.stringify(body)});
    res=await r.json().catch(()=>({}));
  }catch(e){r=null;}
  chatBusy=false;
  if(chat!==c)return; // the view changed meanwhile
  btn.disabled=false;
  if(!r){err.textContent=c.isNew?'The server did not answer.':'The server did not answer. Nothing was set up.';return;}
  const done=()=>{dropSetup(c.st.id);delete live[c.st.id];if(curNew===c.st.id)curNew=null;};
  if(c.isNew){
    const o=openOutcome(r.status,res,true);
    if(o.project===null){err.textContent=r.status===413?'The answers are too long to send. Shorten the longest ones and try again.':o.toast;return;}
    if(r.status===200)done();
    await showOutcome(o);
    if(r.status===200)noteCreated(res);
    return;
  }
  if(r.status!==200&&!(r.status===409&&res.specs)){err.textContent=res.error||`Nothing was set up (HTTP ${r.status}).`;return;}
  done();
  if(PROJECT!==c.project)return;
  await apply(res.specs,null);
  if(r.status!==200){toast(res.error||`Nothing was set up (HTTP ${r.status}).`);return;}
  toast('.specs/ created in '+root);
  noteCreated(res);
  $('#content').focus();
}
$('#introForm').onsubmit=e=>{
  e.preventDefault();if(!chat)return;
  if(chat.isNew){
    const v=$('#nameIn').value.trim(),problem=answerError({key:'name',required:true},v);
    if(problem){$('#nameErr').textContent=problem;$('#nameIn').focus();return;}
    chat.st.answers.name=v;
  }
  chat.st.started=true;chat.st.editing=null;saveSetup(chat.st);drawChat();
};
$('#nameIn').addEventListener('input',()=>{$('#nameGo').disabled=!$('#nameIn').value.trim();$('#nameErr').textContent='';});
$('#setupStart').onclick=()=>$('#introForm').requestSubmit();
const curQuestion=()=>chat&&nextQuestion(chatAsk(),chat.st.answers,chat.st.editing);
$('#comp').onsubmit=e=>{
  e.preventDefault();if(!chat||chatBusy||!comp)return;
  const cur=curQuestion();if(!cur||cur.key!==comp.key)return;
  const fail=m=>{$('#compErr').textContent=m;const i=$('#chatIn');if(i){i.setAttribute('aria-invalid','true');i.focus();}};
  if(cur.type==='text'||cur.type==='tabbed-chips'){
    const v=$('#chatIn').value,problem=answerError(cur,v);
    if(problem)return fail(problem);
    return chatAnswer(cur,v.trim());
  }
  const custom=comp.custom.trim();
  if(cur.type==='categorized')return chatAnswer(cur,comp.v);
  if(isMulti(cur.type)){
    const v=custom&&!comp.v.includes(custom)?[...comp.v,custom]:comp.v;
    if(cur.required&&!v.length)return;
    return chatAnswer(cur,v);
  }
  const v=comp.showCustom&&custom?custom:comp.v;
  if(v)chatAnswer(cur,v);
};
$('#comp').addEventListener('click',e=>{
  if(!chat||!comp)return;
  const cur=curQuestion();if(!cur)return;
  const t=e.target.closest('button');if(!t)return;
  const redraw=sel=>{drawComposer(cur);const el=sel&&$(`#comp ${sel}`);if(el)el.focus();};
  if(t.dataset.tab!==undefined){comp.tab=t.dataset.tab;return redraw(`.tab[data-tab="${CSS.escape(t.dataset.tab)}"]`);}
  if(t.id==='chatOther'){comp.showCustom=!comp.showCustom;if(!isMulti(cur.type)&&comp.showCustom)comp.v='';return redraw(comp.showCustom?'#chatCustom':'#chatOther');}
  if(t.id==='chatSkip'){if(!cur.required)chatAnswer(cur,isMulti(cur.type)?[]:'');return;}
  if(t.id==='chatTodo'){chatAnswer(cur,cur.todo);return;}
  if(t.id==='chatNone'){chatAnswer(cur,CC.noneOfThese(comp.v,CC.visibleCategories(chat.st.answers.projectCategory||null,CC.hasMobilePlatform(chat.st.answers.platforms||[]))));return;}
  if(t.id==='chatCancel'){const k=chat.st.editing;chat.st.editing=null;comp=null;drawChat();const b=$(`#msgs [data-k="${k}"]`);if(b)b.focus();return;}
  const v=t.dataset.v;if(v===undefined)return;
  if(cur.type==='tabbed-chips'){comp.v=v;$('#chatIn').value=v;}
  else if(cur.type==='platform-grid')comp.v=CC.togglePlatform(comp.v,v);
  else if(cur.type==='categorized')comp.v=CC.toggleIntegration(comp.v,comp.tab||cur.categories[0].id,v);
  else if(isMulti(cur.type))comp.v=comp.v.includes(v)?comp.v.filter(x=>x!==v):[...comp.v,v];
  else{comp.v=v;comp.showCustom=false;}
  redraw(`.chip[data-v="${CSS.escape(v)}"]`);
});
$('#comp').addEventListener('input',e=>{
  if(!comp)return;
  if(e.target.id==='chatIn'){$('#compErr').textContent='';e.target.removeAttribute('aria-invalid');comp.v=e.target.value;}
  if(e.target.id==='chatCustom'){comp.custom=e.target.value;const go=$('#chatGo');if(go&&comp.custom.trim())go.disabled=false;}
});
$('#msgs').addEventListener('click',e=>{
  if(e.target.id==='chatCreate'){chatCreate();return;}
  const b=e.target.closest('[data-k]');if(b)chatEdit(b.dataset.k);
});
$('#setupList').addEventListener('click',e=>{
  if(chatBusy)return;
  const rm=e.target.closest('[data-rm-setup]');
  if(rm){
    if(!confirm('Remove this setup?'))return;
    const id=rm.dataset.rmSetup;dropSetup(id);delete live[id];
    if(chat&&chat.st.id===id){if(curNew===id)curNew=null;renderChat(chat.isNew);}else drawSetups();
    return;
  }
  const b=e.target.closest('[data-setup]');if(!b)return;
  const s=setups.find(x=>x.id===b.dataset.setup);if(!s)return;
  $('#cbody').classList.remove('lst');
  if(s.kind==='new'){curNew=s.id;if(curView==='new')renderChat(true);else go('new');return;}
  const i=DATA.projects.findIndex(p=>p.root===s.root);if(i>=0)location.hash='#'+i+'/board';
});
$('#setupNew').onclick=()=>{if(chatBusy)return;curNew=null;$('#cbody').classList.remove('lst');if(curView==='new')renderChat(true);else go('new');};
$('#chatSetups').onclick=()=>$('#cbody').classList.toggle('lst');
$('#chatRestart').onclick=()=>{if(!chat||chatBusy)return;dropSetup(chat.st.id);chat.st=live[chat.st.id]=freshSetup(chat.st.kind,chat.st.root,chat.st.id);comp=null;drawChat();};
$('#chatClose').onclick=()=>{if(!chatBusy)go('home');};

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
  await apply(d,paths);
}
/* Draw a fresh /api/specs payload in place: same route, scroll, inspector, selection and focus. */
async function apply(d,paths){
  (paths||Object.keys(fileCache)).forEach(p=>{delete fileCache[p];});
  const key=focusKey(document.activeElement);
  const scroll=$('#content').scrollTop,ib0=insp.querySelector('.ib2'),inspScroll=ib0?ib0.scrollTop:0;
  const was=inspOpen;
  const hadSpecs=!(DATA&&DATA.project.specs===false);
  DATA=d;
  renderProject();renderTasks();renderIde();renderAgentFiles();
  const to=reloadView(curView,hadSpecs,d.project.specs!==false); // .specs/ gone: offer setup; appeared another way: Tasks; Home stays
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
  if(!window.EventSource)return;
  if(es)es.close(); // one stream, for the shown project
  es=new EventSource('/api/events?'+pq());let dropped=false;
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
  renderProject();renderTasks();renderIde();renderAgentFiles();listen();
  if(keepRoute)route();else go('board');
}
$('#projList').addEventListener('click',e=>{const b=e.target.closest('[data-project]');if(!b)return;
  if(+b.dataset.project!==PROJECT)switchProject(+b.dataset.project);else if(NOPROJ.includes(curView))go('board');});

/* ---------------- open a project (BL-067) ----------------
   The + tile opens the mockup's sheet on its Folder tab. The list is GET /api/projects; opening is
   POST /api/projects, which serves one more folder and remembers it; Remove from list edits the
   registry only. A new project (BL-PM-003) starts in the setup chat above since BL-PM-004. The Clone tab
   (BL-PM-002) POSTs /api/projects/clone, which runs git clone and opens the folder; closing the sheet
   meanwhile aborts the request, and the server then removes what was downloaded. Nothing here is
   file content; the strings are the ones REQ-002.H.21, H.24 and H.26 list. */
const openVeil=$('#openVeil'),addBtn=$('#addBtn'),pathIn=$('#pathIn');
const TABS=['folder','clone'],GO={folder:'Open',clone:'Clone Repository'};
let openBusy=false,sheetFrom=addBtn,sheetTab='folder',cloneCtl=null,cloneNamed=false,cloneTick=null;
if(TOKEN){addBtn.hidden=false;homeBtn.hidden=false;$('#cmdRegen').hidden=false;$('#rail>.logo').remove();} // the Home tile takes the logo's place (BL-PM-001)
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
function closeSheet(){if(!openVeil.classList.contains('open'))return;if(cloneCtl)cloneCtl.abort();openVeil.classList.remove('open');sheetFrom.focus();}
/* The registry as GET /api/projects sends it: in the sheet, or on Home (BL-PM-001), where a row opens
   its folder at once, has no Remove, and a served project also shows the branch the rail tooltip shows. */
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
  $$('#paneClone input, #openTabs button').forEach(el=>{el.disabled=!!ctl;});
  // An indeterminate bar and the time since the click: the page knows nothing else about a running clone.
  clearInterval(cloneTick);cloneTick=null;$('#cloneStatus').hidden=!ctl;
  if(!ctl)return;
  const t0=Date.now(),tick=()=>{const s=Math.floor((Date.now()-t0)/1000);$('#cloneTime').textContent=`Cloning… ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
  tick();cloneTick=setInterval(tick,1000);
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
  await showOutcome(openOutcome(r.status,res,'cloned'));
}
async function removeRecent(path){
  let out;
  try{out=await postPath(path,'/api/projects/remove');}catch(e){toast('The server did not answer.');return;}
  if(out.r.status===200){drawRecent(out.res);if(curView==='home')drawRecent(out.res,true);}else toast(out.res.error||`Nothing was removed (HTTP ${out.r.status}).`);
}
addBtn.onclick=()=>openSheet(addBtn);
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
$('#homeBox').addEventListener('click',e=>{const row=e.target.closest('[data-path]');if(row)openPath(row.dataset.path);});
$('#openCancel').onclick=closeSheet;
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
fetch('/api/specs?'+pq(),{cache:'no-store'})
  .then(r=>{if(!r.ok&&PROJECT){PROJECT=0;return fetch('/api/specs?'+pq(),{cache:'no-store'});}return r;})
  .then(r=>{if(!r.ok)throw new Error('/api/specs: HTTP '+r.status);return r.json();})
  .then(d=>{DATA=d;renderProject();renderTasks();renderIde();renderAgentFiles();route();listen();})
  .catch(e=>showErr('Could not load the project: '+e.message));
})();
