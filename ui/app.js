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
  const p=DATA.project, name=p.name!==null?p.name:p.root, where=p.root+(p.branch?' · '+p.branch:'');
  $('#projList').innerHTML=DATA.projects.map((q,i)=>{const n=q.name!==null?q.name:q.root,cur=i===PROJECT&&curView!=='home';
    return `<button class="tile blue${cur?' cur':''}" data-project="${i}" data-tip="${esc(n)}" data-path="${esc(q.root+(q.branch?' · '+q.branch:''))}" aria-label="${esc(n)}"${cur?' aria-current="true"':''}><span aria-hidden="true">${esc(initials(n))}</span></button>`;}).join('');
  $('#curGrp').textContent=name;$('#curGrp').title=p.root;
  $('#curBranch').textContent=p.branch||'';
  $('#subName').textContent=name;$('#subPath').textContent=where;
  $('#footAddr').textContent=location.host;$('#footVer').textContent='v'+p.specpilotVersion;
  document.title=name+' · SpecPilot Local';
}

/* ---------------- views ---------------- */
const homeBtn=$('#homeBtn');
const VIEWS={board:'Tasks',explorer:'Explorer',security:'Security',instructions:'Instructions',commands:'Commands',skills:'Skills',setup:''};
const TITLES={'planning/roadmap.md':'Roadmap','project/requirements.md':'Requirements','architecture/architecture.md':'Architecture','quality/tests.md':'Tests'};
const NAV=[['board'],['file','planning/roadmap.md'],['file','project/requirements.md'],['explorer'],['file','architecture/architecture.md'],['file','quality/tests.md'],['security'],['instructions'],['commands'],['skills']];
let curView='board',curFile='';
function syncNav(){
  $$('.src .srow').forEach(b=>{
    const on=b.dataset.v==='file'?(curView==='file'&&b.dataset.f===curFile):(b.dataset.v===curView);
    b.classList.toggle('on',on);b.setAttribute('aria-current',on?'page':'false');});
  /* the rail: on Home (BL-PM-001) the Home tile is the current one and no project tile is */
  const home=curView==='home';
  [homeBtn,...$$('#projList .tile')].forEach(t=>{const cur=t===homeBtn?home:!home&&+t.dataset.project===PROJECT;
    t.classList.toggle('cur',cur);if(cur)t.setAttribute('aria-current','true');else t.removeAttribute('aria-current');});
}
function go(v,keep,sub){
  if(v==='file'){if(!DATA||!sub)v='board';else curFile=sub;}
  else if(v==='home'){if(!TOKEN)v='board';} // no Home with --read-only: nothing could be listed or opened
  else if(!VIEWS[v]||v==='setup')v='board';
  if(v!=='home'&&DATA&&DATA.project.specs===false)v='setup'; // no .specs/ yet: every route of the project shows the setup view (BL-055)
  curView=v;
  $('#win').classList.toggle('home',v==='home');
  $$('.content>.view').forEach(e=>e.classList.toggle('on',e.id==='v-'+v));
  syncNav();
  $('#title').textContent=v==='home'?'Home':v==='file'?(TITLES[sub]||sub):v==='setup'?'No .specs/ folder in '+DATA.projects[PROJECT].root:VIEWS[v];
  $('#modeSeg').hidden=v!=='board';
  setNav(false);closeInsp();
  if(v!=='file'||sub!==fileNoteFor)clearFileNote();
  if(v==='home')loadRecent();
  if(v==='setup')renderSetup();
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
function setHash(v,sub){const h='#'+(PROJECT&&v!=='home'?PROJECT+'/':'')+v+(sub?'/'+sub:'');if(curHash()===h)return;memHash=h;
  if(!urlOk)return;
  try{history.replaceState(null,'',h);}catch(e){urlOk=false;}}
function route(){
  const r=resolveRoute(curHash(),DATA?DATA.files:{},DATA?DATA.projects.length:1,!!TOKEN);
  if(r.view==='home'){go('home');return;} // Home belongs to no project: the shown one stays loaded behind it
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
function renderAgentFiles(){
  const N=DATA.nav;
  $('#cmdBox').innerHTML=fileRows(N.commands);$('#cmdCnt').textContent=N.commands.length;
  $('#prmBox').innerHTML=fileRows(N.prompts);$('#prmCnt').textContent=N.prompts.length;
  $('#sklBox').innerHTML=fileRows(N.skills);$('#sklCnt').textContent=N.skills.length;
}
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
  if(e.key==='Escape'){hideTip();closeInsp();closePal();closeSheet();setNav(false);return}
  if(inField||mod||e.altKey)return;
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

/* ---------------- guided setup (BL-055) ----------------
   A named folder with no .specs/ yet. The questions, their choices and the detected line come from
   GET /api/setup, which serves the CLI's own text; the page adds only the strings REQ-002.H.17 lists. */
let setupQ=null,setupBusy=false,fileNoteFor=null;
function clearFileNote(){const n=$('#fileNote');n.hidden=true;n.innerHTML='';fileNoteFor=null;}
function setFileNote(path,lines){const n=$('#fileNote');n.innerHTML=lines.map(l=>`<p class="note" translate="no">${esc(l)}</p>`).join('');n.hidden=false;fileNoteFor=path;}
async function renderSetup(){
  const pj=PROJECT,intro=$('#setupIntro'),det=$('#setupDetected'),form=$('#setupForm'),note=$('#setupNote');
  intro.hidden=det.hidden=form.hidden=note.hidden=true;form.innerHTML='';
  if(!TOKEN){note.textContent='Started with --read-only, so nothing can be set up here.';note.hidden=false;return;}
  let r,q=null;
  try{r=await fetch('/api/setup?'+pq(),{cache:'no-store'});if(r.ok)q=await r.json();else if(r.status!==404)q={error:(await r.json().catch(()=>({}))).error||'HTTP '+r.status};}
  catch(e){q={error:'The server did not answer.'};}
  if(PROJECT!==pj||curView!=='setup')return;
  if(!q)return; // 404: not a folder named on the command line, so no form
  if(q.error){note.textContent=q.error;note.hidden=false;return;}
  setupQ=q;intro.hidden=false;
  if(q.detected){det.textContent=q.detected.line;det.hidden=false;}
  form.innerHTML=q.questions.map(qu=>{
    const body=qu.key==='handle'
      ?`<input type="text" name="handle" aria-label="handle" maxlength="39">`
      :qu.choices?qu.choices.map((c,i)=>`<label><input type="radio" name="${esc(qu.key)}" value="${esc(c.value)}"${i===0?' checked':''}>${esc(c.name)}</label>`).join('')
      :'';
    return `<fieldset data-key="${esc(qu.key)}"><legend>${esc(qu.message)}</legend><div class="opts">${body}</div>${qu.key==='ide'?'<div class="keep" id="setupKeep" hidden translate="no"></div>':''}</fieldset>`;
  }).join('')+'<button type="submit" class="go">Create .specs/</button>';
  form.hidden=false;
  const sync=()=>{
    const lang=form.language?form.language.value:null,fw=form.querySelector('fieldset[data-key="framework"]');
    if(fw&&q.frameworks){const list=lang&&q.frameworks[lang]||[];fw.hidden=!list.length;
      fw.querySelector('.opts').innerHTML=list.map((v,i)=>`<label><input type="radio" name="framework" value="${esc(v)}"${i===0?' checked':''}>${esc(v)}</label>`).join('');}
    const ide=form.ide.value,keep=(q.keep&&q.keep[ide])||[],k=$('#setupKeep');
    k.hidden=!keep.length;k.textContent=keep.length?'Already here, will be kept: '+keep.join(', '):'';
  };
  form.onchange=sync;sync();
  form.onsubmit=e=>{e.preventDefault();submitSetup(form);};
}
async function submitSetup(form){
  if(setupBusy)return;setupBusy=true;
  const p=PROJECT,root=DATA.projects[PROJECT].root,btn=form.querySelector('button.go');btn.disabled=true;
  const body={};$$('fieldset[data-key]',form).forEach(f=>{if(f.hidden)return;const k=f.dataset.key;const el=form[k];if(el)body[k]=el.value;});
  let r,res={};
  try{
    r=await fetch('/api/setup?'+pq(),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SpecPilot-Token':TOKEN},body:JSON.stringify(body)});
    res=await r.json().catch(()=>({}));
  }catch(e){setupBusy=false;btn.disabled=false;toast('The server did not answer. Nothing was set up.');return;}
  setupBusy=false;btn.disabled=false;
  if(p!==PROJECT)return;
  if(r.status===200){
    await apply(res.specs,null);
    toast('.specs/ created in '+root);
    go('file',false,'development/onboarding.md');
    const lines=[];
    if(res.kept&&res.kept.length)lines.push('Kept as they were: '+res.kept.join(', ')+'. Run specpilot backfill there to add missing SpecPilot sections to the instruction and command files.');
    if(res.notice)lines.push(res.notice);
    if(lines.length)setFileNote('development/onboarding.md',lines);
  }else{
    if(r.status===409&&res.specs)await apply(res.specs,null);
    toast(res.error||`Nothing was set up (HTTP ${r.status}).`);
  }
}

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
  DATA=d;selected=null;
  renderProject();renderTasks();renderIde();renderAgentFiles();listen();
  if(keepRoute)route();else go('board');
}
$('#projList').addEventListener('click',e=>{const b=e.target.closest('[data-project]');if(!b)return;
  if(+b.dataset.project!==PROJECT)switchProject(+b.dataset.project);else if(curView==='home')go('board');});

/* ---------------- open a project (BL-067) ----------------
   The + tile opens the mockup's sheet (Folder tab only). The list is GET /api/projects; opening is
   POST /api/projects, which serves one more folder and remembers it; Remove from list edits the
   registry only. Nothing here is file content; the strings are the ones REQ-002.H.21 lists. */
const openVeil=$('#openVeil'),addBtn=$('#addBtn'),pathIn=$('#pathIn');
let openBusy=false,sheetFrom=addBtn;
if(TOKEN){addBtn.hidden=false;homeBtn.hidden=false;$('#rail>.logo').remove();} // the Home tile takes the logo's place (BL-PM-001)
function openSheet(from){hideTip();sheetFrom=from;openVeil.classList.add('open');pathIn.value='';loadRecent();setTimeout(()=>pathIn.focus(),50);}
function closeSheet(){if(!openVeil.classList.contains('open'))return;openVeil.classList.remove('open');sheetFrom.focus();}
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
  const o=openOutcome(out.r.status,out.res),wasHome=curView==='home';
  if(o.project===null){toast(o.toast);return;} // refused: the page stays where it is
  closeSheet();
  if(o.specs){PROJECT=o.project;showProject(o.specs,false);}
  else if(o.project!==PROJECT)await switchProject(o.project);
  else if(wasHome)go('board');
  toast(o.toast);
  if(wasHome)$('#content').focus(); // Home is gone from the screen: focus goes to the project's view, not to a hidden control
}
async function removeRecent(path){
  let out;
  try{out=await postPath(path,'/api/projects/remove');}catch(e){toast('The server did not answer.');return;}
  if(out.r.status===200){drawRecent(out.res);if(curView==='home')drawRecent(out.res,true);}else toast(out.res.error||`Nothing was removed (HTTP ${out.r.status}).`);
}
addBtn.onclick=()=>openSheet(addBtn);
homeBtn.onclick=()=>go('home');
$('#homeOpen').onclick=e=>openSheet(e.currentTarget);
$('#homeBox').addEventListener('click',e=>{const row=e.target.closest('[data-path]');if(row)openPath(row.dataset.path);});
$('#openCancel').onclick=closeSheet;
openVeil.onclick=e=>{if(e.target===openVeil)closeSheet();};
$('#openForm').onsubmit=e=>{e.preventDefault();openPath(pathIn.value.trim());};
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
