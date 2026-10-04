/* Hash routing for the serve UI, kept free of the DOM so Jest can require it.
   Loaded as /assets/route.js in the browser. */
(function (root) {
const VIEWS=['board','explorer','security','instructions','commands','skills'];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* "#file/quality/tests.md" → {project:0, view:'file', sub:'quality/tests.md', missing:false}.
   A file the latest /api/specs does not list stays on the file view with missing:true,
   so the page can say it no longer exists instead of silently showing something else.
   "#2/board" is project 2 of `count` (BL-054); no index, or "#0/", is project 0; an index
   that names no served project goes to project 0's Tasks view. "#home" is the Home screen
   (BL-PM-001) when `home` says the page has one: it belongs to no project, so an index before
   it and anything after it are ignored; without `home` it is an unknown view. */
function resolveRoute(hash,files,count,home){
  let h=String(hash||'').replace(/^#/,''),project=0;
  const m=/^(\d+)\/(.*)$/.exec(h);
  if(home&&/^home(\/|$)/.test(m?m[2]:h))return {project:0,view:'home',sub:'',missing:false};
  if(m){
    if(!/^(0|[1-9][0-9]*)$/.test(m[1])||Number(m[1])>=(count||1))return {project:0,view:'board',sub:'',missing:false};
    project=Number(m[1]);h=m[2];
  }
  const ix=h.indexOf('/');
  const view=ix<0?h:h.slice(0,ix);
  let sub=ix<0?'':h.slice(ix+1);
  try{sub=decodeURIComponent(sub);}catch(e){}
  if(view==='file'&&sub)return {project,view:'file',sub,missing:!Object.prototype.hasOwnProperty.call(files||{},sub)};
  if(VIEWS.includes(view))return {project,view,sub,missing:false};
  return {project,view:'board',sub:'',missing:false};
}

/* The whole content of a view whose file is gone: its path, and that it no longer exists. */
function goneHtml(path){return `<p class="note"><span class="mono" translate="no">${esc(path)}</span> no longer exists.</p>`;}

/* A time as "4 Oct 2026, 07:08", local, the same in every locale; what Date cannot parse is shown as it is. */
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function when(iso){
  const d=new Date(iso),p=n=>String(n).padStart(2,'0');
  return isNaN(d)?iso:`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* The registry as GET /api/projects sends it (BL-067): the rows of the sheet's list, or of Home's
   (BL-PM-001), where a row is one button that opens its folder, has no Remove, and a project that
   is open also shows the branch /api/specs gives for it (`projects`, as the rail tooltip does). */
function recentHtml(reg,home,projects,chev){
  if(reg.error)return `<p class="note">${esc(reg.error)}</p>`;
  if(!reg.entries.length)return '<div class="empty">No projects remembered yet.</div>';
  return reg.entries.map(e=>{
    const det=[when(e.lastOpened)];
    if(e.project!==null)det.push('open as project '+e.project);
    if(!e.exists)det.push('folder not found');
    if(home){const q=e.project!==null&&projects?projects[e.project]:null;
      return `<button type="button" class="row act" data-path="${esc(e.path)}"><div class="body"><div class="ttl" translate="no">${esc(e.root+(q&&q.branch?' · '+q.branch:''))}</div><div class="det">${esc(det.join(' · '))}</div></div><div class="trail">${chev||''}</div></button>`;}
    return `<div class="row recent"><div class="body" data-path="${esc(e.path)}" role="button" tabindex="0"><div class="ttl" translate="no">${esc(e.root)}</div><div class="det">${esc(det.join(' · '))}</div></div><button type="button" class="btn sm" data-remove="${esc(e.path)}">Remove from list</button></div>`;
  }).join('');
}

/* What the page does with the answer to POST /api/projects, from the sheet or a row on Home:
   `project` is the one to show (null: nothing was opened, the page stays where it is), `specs` its
   payload when the answer carries one, `toast` the message, the server's own when it sent one.
   `created` says the answer is POST /api/projects/new's (BL-PM-003), or with 'cloned' POST
   /api/projects/clone's (BL-PM-002): only the two texts differ. */
function openOutcome(status,res,created){
  const did=created==='cloned'?'cloned':created?'created':'opened';
  if(status===200)return {project:res.project,specs:res.specs,toast:`${res.specs.projects[res.project].root} ${did==='opened'?did:did+' and opened'} as project ${res.project}`+(res.registry&&res.registry.error?'. '+res.registry.error:'')};
  if(status===409&&typeof res.project==='number')return {project:res.project,specs:null,toast:res.error||`Already open as project ${res.project}`};
  return {project:null,specs:null,toast:res.error||`Nothing was ${did} (HTTP ${status}).`};
}

/* The view a live-reload payload forces, or null to stay: setup when .specs/ is gone, Tasks when it
   appeared while the setup view was shown. Home belongs to no project, so it never moves. */
function reloadView(curView,hadSpecs,hasSpecs){
  if(!hasSpecs&&curView!=='setup'&&curView!=='home')return 'setup';
  if(!hadSpecs&&hasSpecs&&curView==='setup')return 'board';
  return null;
}

/* The folder git clone makes for a repository URL: its last path segment without `.git`. The one copy
   of the rule: the Clone tab fills Folder name with it and the server uses it for an empty name (BL-PM-002). */
function repoNameFromUrl(url){return String(url).replace(/\/+$/,'').replace(/\.git$/,'').split(/[/:]/).pop()||'';}

/* The name a project is shown under: the one in its project.yaml, else its folder's own name (the last
   segment of its root), never the whole path, which stays in the tooltip and the sub-line. */
function projectLabel(p){return p.name!==null&&p.name!==undefined?p.name:String(p.root).split(/[/\\]/).filter(Boolean).pop()||p.root;}

const api={resolveRoute,goneHtml,recentHtml,openOutcome,reloadView,repoNameFromUrl,projectLabel};
if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root,api);
})(this);
