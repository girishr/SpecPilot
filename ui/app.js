/* SpecPilot Local, read-only (BL-051). Ported from the approved mockup; every string a view
   shows about the project comes from GET /api/specs (readSpecs() output) or GET /api/file
   (the file itself). Views may group and order; they never reword. */
(function(){
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const toastEl=$('#toast');let toastT;
const toast=m=>{toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('show'),2600);};
const chev='<svg class="ico chev" aria-hidden="true" focusable="false"><use href="#i-chev"/></svg>';

/* theme: dark by default, light is a per-viewer toggle */
let theme=null;try{theme=localStorage.getItem('sp-theme');}catch(e){}
function setMeta(light){const m=document.querySelector('meta[name=theme-color]');if(m)m.content=light?'#f8fafc':'#0f172a';}
if(theme==='light'){document.documentElement.setAttribute('data-theme','light');setMeta(true);}
$('#themeBtn').onclick=()=>{const light=document.documentElement.getAttribute('data-theme')==='light';if(light)document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme','light');setMeta(!light);try{light?localStorage.removeItem('sp-theme'):localStorage.setItem('sp-theme','light');}catch(e){}toast('Appearance: '+(light?'dark':'light'));};

/* ---------------- data: fetched, never embedded ---------------- */
let DATA=null;
const fileCache={};
async function getText(p){
  if(p in fileCache)return fileCache[p];
  const r=await fetch('/api/file?p='+encodeURIComponent(p),{cache:'no-store'});
  if(!r.ok)throw new Error(p+': HTTP '+r.status);
  return fileCache[p]=await r.text();
}
function showErr(msg){const e=$('#loadErr');e.textContent=msg;e.hidden=false;}

/* ---------------- project: only the one being served ---------------- */
function initials(n){const w=String(n).split(/[^A-Za-z0-9]+/).filter(Boolean);
  if(!w.length)return '??';
  if(w.length>1)return (w[0][0]+w[1][0]).toUpperCase();
  return w[0].slice(0,2).toUpperCase();}
function renderProject(){
  const p=DATA.project, name=p.name!==null?p.name:p.root, where=p.root+(p.branch?' · '+p.branch:'');
  $('#projList').innerHTML=`<button class="tile blue cur" data-tip="${esc(name)}" data-path="${esc(where)}" aria-label="${esc(name)}" aria-current="true"><span aria-hidden="true">${esc(initials(name))}</span></button>`;
  $('#curGrp').textContent=name;$('#curGrp').title=p.root;
  $('#curBranch').textContent=p.branch||'';
  $('#subName').textContent=name;$('#subPath').textContent=where;
  $('#footAddr').textContent=location.host;$('#footVer').textContent='v'+p.specpilotVersion;
  document.title=name+' · SpecPilot Local';
}

/* ---------------- views ---------------- */
const VIEWS={board:'Tasks',explorer:'Explorer',security:'Security',instructions:'Instructions',commands:'Commands',skills:'Skills'};
const TITLES={'planning/roadmap.md':'Roadmap','project/requirements.md':'Requirements','architecture/architecture.md':'Architecture','quality/tests.md':'Tests'};
const NAV=[['board'],['file','planning/roadmap.md'],['file','project/requirements.md'],['explorer'],['file','architecture/architecture.md'],['file','quality/tests.md'],['security'],['instructions'],['commands'],['skills']];
let curView='board',curFile='';
function syncNav(){
  $$('.src .srow').forEach(b=>{
    const on=b.dataset.v==='file'?(curView==='file'&&b.dataset.f===curFile):(b.dataset.v===curView);
    b.classList.toggle('on',on);b.setAttribute('aria-current',on?'page':'false');});
}
function go(v,keep,sub){
  if(v==='file'){if(!DATA||!(sub in DATA.files))v='board';else curFile=sub;}
  else if(!VIEWS[v])v='board';
  curView=v;
  $$('.content>.view').forEach(e=>e.classList.toggle('on',e.id==='v-'+v));
  syncNav();
  $('#title').textContent=v==='file'?(TITLES[sub]||sub):VIEWS[v];
  $('#modeSeg').hidden=v!=='board';
  setNav(false);closeInsp();
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
function setHash(v,sub){const h='#'+v+(sub?'/'+sub:'');if(curHash()===h)return;memHash=h;
  if(!urlOk)return;
  try{history.replaceState(null,'',h);}catch(e){urlOk=false;}}
function route(){const h=curHash().slice(1),ix=h.indexOf('/'),v=ix<0?h:h.slice(0,ix),sub=ix<0?'':decodeURIComponent(h.slice(ix+1));
  if(v==='board'&&sub==='board'){mode='board';$$('#modeSeg button').forEach(x=>x.classList.toggle('on',x.dataset.m==='board'));renderTasks();}
  go(v||'board',true,sub);
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
  const tiles=$$('#rail .tile');const i=tiles.indexOf(document.activeElement);if(i<0)return;
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
  return `<button type="button" class="row act" data-col="${col}" data-i="${i}">
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
function openTask(col,i){
  const t=DATA.tasks[col][i];if(!t)return;
  lastFocus=document.activeElement;selected=col+':'+i;
  $$('.row.sel').forEach(r=>r.classList.remove('sel'));
  $$(`#v-board .row[data-col="${col}"][data-i="${i}"]`).forEach(r=>r.classList.add('sel'));
  insp.innerHTML=`<div class="ih">${col==='completed'?`<span class="id" translate="no">${esc(t.num)}</span>`:''}<span class="id" translate="no">${mdi(t.id)}</span><span class="pill ${col==='completed'?'green':col==='currentSprint'?'orange':'gray'}">${esc(COLS[col])}</span><button type="button" class="ib x" id="inspX" aria-label="Close Details"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x"/></svg></button></div>
  <div class="ib2">
    <div class="gl"><div class="gh">Description <span class="cnt" translate="no">tasks.md · ## ${esc(COLS[col])}</span></div><div class="box"><div class="desc md">${md(t.description)}</div></div></div>
  </div>`;
  openInsp();
}
function openInsp(){insp.classList.add('open');insp.setAttribute('aria-hidden','false');$('#inspX').onclick=closeInsp;setTimeout(()=>$('#inspX').focus(),60);}
function closeInsp(){const was=insp.classList.contains('open');insp.classList.remove('open');insp.setAttribute('aria-hidden','true');selected=null;$$('.row.sel').forEach(r=>r.classList.remove('sel'));if(was&&lastFocus&&lastFocus.focus){lastFocus.focus();lastFocus=null;}}
function bind(){
  $$('#v-board .row[data-col]').forEach(r=>r.onclick=()=>openTask(r.dataset.col,+r.dataset.i));
  $$('[data-more]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(b.dataset.more==='completed')showAllDone=true;else showAllBacklog=true;renderTasks();});
  $$('[data-disc]').forEach(b=>b.onclick=e=>{e.stopPropagation();const g=$('#gDone');g.classList.toggle('closed');b.setAttribute('aria-expanded',!g.classList.contains('closed'));});
}
$$('#modeSeg button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;$$('#modeSeg button').forEach(x=>x.classList.toggle('on',x===b));renderTasks();setHash('board',stateFor('board'));});

/* ---------------- any .specs/ file, rendered as written ---------------- */
function metaLine(m){return ['fileID','version','lastUpdated'].filter(k=>m&&m[k]!==undefined).map(k=>`${k}: ${m[k]}`).join(' · ');}
async function renderFile(path){
  $('#fmBox').innerHTML='';$('#fileBody').innerHTML='';
  let src;try{src=await getText('.specs/'+path);}catch(e){$('#fileBody').innerHTML=`<p class="note">${esc(e.message)}</p>`;return;}
  if(curView!=='file'||curFile!==path)return;
  const isYaml=/\.ya?ml$/.test(path);
  const {fm,body}=isYaml?{fm:'',body:src}:splitFm(src);
  $('#fmBox').innerHTML=fm?`<div class="gh">Front matter <span class="cnt" translate="no">.specs/${esc(path)}</span></div><div class="box"><pre class="raw" translate="no">${esc(fm)}</pre></div>`:'';
  $('#fileBody').innerHTML=isYaml?`<pre translate="no">${esc(src)}</pre>`:md(body);
}

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
async function renderSecurity(){
  const paths=['security/threat-model.md','security/security-decisions.md'].filter(p=>p in DATA.files);
  const parts=await Promise.all(paths.map(p=>getText('.specs/'+p).then(src=>
    `<div class="gl"><div class="gh" translate="no">${esc(p)} <span class="cnt" translate="no">${esc(metaLine(DATA.files[p]))}</span></div></div><div class="md doc doc-gap">${md(splitFm(src).body)}</div>`,
    e=>`<p class="note">${esc(e.message)}</p>`)));
  if(curView==='security')$('#secBody').innerHTML=parts.join('')||'<div class="box"><div class="empty">No files in <span class="mono" translate="no">.specs/security/</span>.</div></div>';
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
async function openFile(path){
  lastFocus=document.activeElement;
  let src;try{src=await getText(path);}catch(e){toast(e.message);return;}
  const {fm,body}=splitFm(src);
  insp.innerHTML=`<div class="ih"><span class="id" translate="no">${esc(path)}</span><button type="button" class="ib x" id="inspX" aria-label="Close Details"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x"/></svg></button></div>
  <div class="ib2">${fm?`<div class="gl"><div class="gh">Front matter</div><div class="box"><pre class="raw" translate="no">${esc(fm)}</pre></div></div>`:''}<div class="md doc">${md(body)}</div></div>`;
  openInsp();
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
  if(e.key==='Escape'){hideTip();closeInsp();closePal();setNav(false);return}
  if(inField||mod||e.altKey)return;
  if(/^[1-9]$/.test(e.key)){const n=NAV[+e.key-1];if(n)go(n[0],false,n[1]);}
  if((e.key==='j'||e.key==='k')&&curView==='board'){const rows=$$((mode==='board'?'#boardMode':'#listMode')+' .row[data-col]');if(!rows.length)return;let i=rows.findIndex(r=>r.dataset.col+':'+r.dataset.i===selected);i=e.key==='j'?Math.min(rows.length-1,i+1):Math.max(0,i-1);if(i<0)i=0;openTask(rows[i].dataset.col,+rows[i].dataset.i);rows[i].scrollIntoView({block:'nearest'});rows[i].focus();}
});

/* boot */
insp.setAttribute('aria-hidden','true');
$('#gDone').classList.add('closed');
fetch('/api/specs',{cache:'no-store'})
  .then(r=>{if(!r.ok)throw new Error('/api/specs: HTTP '+r.status);return r.json();})
  .then(d=>{DATA=d;renderProject();renderTasks();renderIde();renderAgentFiles();route();})
  .catch(e=>showErr('Could not load the project: '+e.message));
})();
