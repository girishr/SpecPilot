// @ts-check
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
   (BL-PM-001) when `home` says the page has one, and "#new" the new-project chat (BL-PM-004) on the
   same terms: both belong to no project, so an index before them and anything after is ignored;
   without `home` they are unknown views. */
function resolveRoute(hash,files,count,home){
  let h=String(hash||'').replace(/^#/,''),project=0;
  const m=/^(\d+)\/(.*)$/.exec(h);
  const top=/^(home|new)(\/|$)/.exec(m?m[2]:h);
  if(home&&top)return {project:0,view:top[1],sub:'',missing:false};
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
  return isNaN(d.getTime())?iso:`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* The vscode://file/ link for an absolute folder path (BL-PM-008): `\` as `/`, each segment
   percent-encoded, but a drive's `:` (`C:`) kept, so `C:\a b` gives `vscode://file/C:/a%20b`.
   With a `line`, `:<line>` is appended as is, so VS Code opens the file at that line. */
function editorUrl(path,line){
  const segs=String(path).replace(/\\/g,'/').split('/').map((s,i)=>i===0&&/^[A-Za-z]:$/.test(s)?s:encodeURIComponent(s));
  return 'vscode://file'+(segs[0]===''?'':'/')+segs.join('/')+(line?':'+line:'');
}
const EDITOR_ICON='<svg class="ico" aria-hidden="true" focusable="false"><use href="#i-ext"/></svg>';
const REMOVE_ICON='<svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x"/></svg>';

/* The registry as GET /api/projects sends it (BL-067): the rows of the sheet's list, or of Home's
   (BL-PM-001), where a row is one button that opens its folder, and a project that
   is open also shows the branch /api/specs gives for it (`projects`, as the rail tooltip does);
   beside the button, a row whose folder exists has the Open in VS Code link (BL-PM-008), and
   every row a Remove icon (BL-PM-014). */
function recentHtml(reg,home,projects,chev){
  if(reg.error)return `<p class="note">${esc(reg.error)}</p>`;
  if(!reg.entries.length)return '<div class="empty">No projects remembered yet.</div>';
  return reg.entries.map(e=>{
    const det=[when(e.lastOpened)];
    if(e.project!==null)det.push('open as project '+e.project);
    if(!e.exists)det.push('folder not found');
    if(home){const q=e.project!==null&&projects?projects[e.project]:null;
      return `<div class="row hrow"><button type="button" class="act" data-path="${esc(e.path)}"><div class="body"><div class="ttl" translate="no">${esc(e.root+(q&&q.branch?' · '+q.branch:''))}</div><div class="det">${esc(det.join(' · '))}</div></div><div class="trail">${chev||''}</div></button>`
        +(e.exists?`<a class="ib" href="${esc(editorUrl(e.path))}" aria-label="${esc(`Open ${e.root} in VS Code`)}" title="Open in VS Code">${EDITOR_ICON}</a>`:'')
        +`<button type="button" class="ib" data-remove="${esc(e.path)}" aria-label="${esc(`Remove ${e.root} from list`)}" title="Remove from list">${REMOVE_ICON}</button></div>`;}
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
   appeared while the setup view was shown. Home and the new-project chat belong to no project, so they never move. */
function reloadView(curView,hadSpecs,hasSpecs){
  if(!hasSpecs&&curView!=='setup'&&curView!=='home'&&curView!=='new')return 'setup';
  if(!hadSpecs&&hasSpecs&&curView==='setup')return 'board';
  return null;
}

/* The folder git clone makes for a repository URL: its last path segment without `.git`. The one copy
   of the rule: the Clone tab fills Folder name with it and the server uses it for an empty name (BL-PM-002). */
function repoNameFromUrl(url){return String(url).replace(/\/+$/,'').replace(/\.git$/,'').split(/[/:]/).pop()||'';}

/* The name a project is shown under: the one in its project.yaml, else its folder's own name (the last
   segment of its root), never the whole path, which stays in the tooltip and the sub-line. */
function projectLabel(p){return p.name!==null&&p.name!==undefined?p.name:String(p.root).split(/[/\\]/).filter(Boolean).pop()||p.root;}

/* ---- the setup chat (BL-PM-004): one question at a time over GET /api/setup or /api/projects/new ---- */

/* What is wrong with a project name, in `specpilot init`'s words (`hint` is the terminal's extra line), or
   null. The one copy of the rule: init and the server load it from here, the page checks with it. */
const MAX_PROJECT_NAME_LENGTH=214; // npm limit
const PROJECT_NAME_PATTERN=/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
function projectNameError(name){
  if(!name)return {message:'Project name is required and cannot be empty',hint:'💡 Usage: specpilot init <project-name>'};
  if(name.length>MAX_PROJECT_NAME_LENGTH)return {message:`Project name must be ${MAX_PROJECT_NAME_LENGTH} characters or fewer`};
  if(!PROJECT_NAME_PATTERN.test(name))return {message:'Project name must start with a letter or number and contain only letters, numbers, dots, hyphens, and underscores',hint:'💡 Example: my-project, app_v2, project.name'};
  return null;
}

/* What is wrong with a handle sent over HTTP, or null. Trimmed first, and an empty one is fine: the OS
   username is used then. The one copy, as above. */
const HANDLE_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._-]{0,38}$/;
function handleError(handle){
  const h=String(handle).trim();
  return h&&!HANDLE_PATTERN.test(h)?'The handle must be 1 to 39 characters of letters, digits, dots, underscores and hyphens, starting with a letter or digit.':null;
}

/* The answer a question has now: the one given, else the first choice (the one that comes pressed), else empty. */
function flowValue(qu,answers){
  const v=answers[qu.key];
  if(qu.choices)return qu.choices.some(c=>c.value===v)?v:qu.choices[0].value;
  return v===undefined?'':v;
}

/* Whether a question has been answered: its key is there and, for a choice, the answer is one of the
   choices now offered (a framework kept from another language is asked again). An empty optional answer counts. */
function answered(qu,answers){
  if(typeof qu.answered==='boolean')return qu.answered; // a question from the chat core (BL-PM-004b) knows
  if(!(qu.key in answers))return false;
  return !qu.choices||qu.choices.some(c=>c.value===answers[qu.key]);
}

/* The questions to ask for the answers so far, in the chat's order (`order`, which groups them by step):
   `first` (the page's own parent question of a new project) before the server's; the framework question with
   the selected language's choices, left out when that language has none; a question with `when` only while
   those answers are selected. */
function flowQuestions(q,answers,first){
  const all=[...(first||[]),...q.questions],byKey=k=>all.find(x=>x.key===k),out=[];
  const now=k=>{const x=byKey(k);return x?flowValue(x,answers):undefined;};
  for(const qu of all){
    if(qu.when&&!Object.keys(qu.when).every(k=>now(k)===qu.when[k]))continue;
    if(qu.key==='framework'&&!qu.choices){
      const list=q.frameworks&&q.frameworks[now('language')]||[];
      if(list.length)out.push({...qu,choices:list.map(v=>({name:v,value:v}))});
    }else out.push(qu);
  }
  return out.sort((a,b)=>(a.order??-1)-(b.order??-1));
}

/* The question the composer shows: the one being edited, else the first asked question without an answer,
   else null, which means the recap. */
function nextQuestion(list,answers,editing){
  if(editing){const qu=list.find(x=>x.key===editing);if(qu)return qu;}
  return list.find(x=>!answered(x,answers))||null;
}

/* What Continue shows under the answer, or null: a required text left empty, a project name or a handle
   the server would refuse (its own message; never the terminal's hint). */
function answerError(qu,value){
  const v=String(value).trim();
  if(qu.choices)return null;
  if(!v)return qu.required?'This one is required.':null;
  if(qu.key==='name'){const e=projectNameError(v);return e?e.message+'.':null;}
  return qu.key==='handle'?handleError(v):null;
}

/* The bot bubble's line: `chat` with `{name}` and `{language}` filled. `ctx` is {name, language}: the project
   name (the folder's label in guided setup) and the language choice's text, or the detected language. */
function chatText(qu,ctx){return String(qu.chat||'').replace(/\{name\}/g,ctx.name||'').replace(/\{language\}/g,ctx.language||'');}

/* The answer as a bubble or a recap row shows it: the choice's own text up to its " — " part (the chips
   keep the whole), the typed text, or Skipped. */
function answerText(qu,answers){
  if(typeof qu.text==='string')return qu.text; // the chat core's own (BL-PM-004b)
  const v=answers[qu.key];
  if(qu.choices){const c=qu.choices.find(x=>x.value===v);return c?c.name.split(' — ')[0]:'';}
  return String(v===undefined?'':v).trim()||'Skipped';
}

/* The thread up to the current question: the name bubble (a new project only: `named`), a divider per step,
   the skip notes before a question (BL-PM-004b), a bot row per asked question (with its file caption) and an
   answer row per answered one, then the note after it; after the last answer a Review divider. */
function threadRows(q,list,answers,cur,ctx,named){
  const steps=[...new Set(list.map(x=>x.step))],rows=[];
  if(named)rows.push({kind:'user',key:'name',text:ctx.name,mono:true,skipped:false});
  let last=null;
  for(const qu of list){
    if(qu.step!==last){rows.push({kind:'divider',text:`Step ${steps.indexOf(qu.step)+1} · ${qu.step}`});last=qu.step;}
    for(const n of qu.notesBefore||[])rows.push({kind:'note',text:n});
    rows.push({kind:'bot',key:qu.key,text:chatText(qu,ctx),cli:qu.message,caption:qu.caption||''});
    if(cur&&qu.key===cur.key)break;
    if(answered(qu,answers)){
      const text=answerText(qu,answers);
      rows.push({kind:'user',key:qu.key,text,mono:qu.key==='parent'||qu.key==='handle',skipped:text==='Skipped'||text==='None'&&!qu.choices});
      if(qu.noteAfter)rows.push({kind:'note',text:qu.noteAfter});
    }
  }
  if(!cur)rows.push({kind:'divider',text:'Review'});
  return rows;
}

/* The recap: one card per step in use, one row per asked question. */
function recapCards(list,answers){
  const steps=[...new Set(list.map(x=>x.step))];
  return steps.map(step=>({title:step,rows:list.filter(x=>x.step===step).map(qu=>({key:qu.key,label:qu.label,value:answerText(qu,answers)}))}));
}

/* The POST body: the answer of every question asked, text trimmed. */
function flowBody(list,answers){
  const body={};
  for(const qu of list)body[qu.key]=qu.choices?flowValue(qu,answers):String(flowValue(qu,answers)).trim();
  return body;
}

/* The files that will be written for the answers so far: .specs/ for the API paradigm, then the files
   outside it for the IDE; `kept` marks one that is already in the folder (guided setup's `keep`). */
function previewFiles(q,answers){
  const pick=k=>{const x=q.questions.find(y=>y.key===k);return x?flowValue(x,answers):undefined;};
  const ide=pick('ide'),keep=q.keep&&q.keep[ide]||[];
  return [...(q.files.specs[pick('apiParadigm')]||[]),...(q.files.outside[ide]||[])].map(path=>({path,kept:keep.includes(path)}));
}

/* ---- the full chat (BL-PM-004b): one renderer for every option, tabs, and the saved setups ---- */

/* One option as a chip, or a card when it has a description: emoji, label, a Recommended or Check this badge,
   the description and a warning line. `pressed` is its state; `data-v` its value. */
function optionHtml(o,pressed){
  const badge=o.badge==='recommended'?'<span class="bdg">Recommended</span>':o.badge==='flagged'?'<span class="bdg fl">Check this</span>':'';
  return `<button type="button" class="chip${o.description?' card':''}${o.todo?' todo':''}" aria-pressed="${!!pressed}" data-v="${esc(o.id)}"><b>${o.emoji?`<span class="em" aria-hidden="true">${esc(o.emoji)}</span>`:''}${esc(o.label)}${badge}</b>${o.description?`<small>${esc(o.description)}</small>`:''}${o.warning?`<small class="wn">⚠ ${esc(o.warning)}</small>`:''}</button>`;
}

/* A tab strip: `tabs` as [{id, label, count}], the active one selected. */
function tabsHtml(tabs,active){
  return `<div class="ctabs" role="tablist">${tabs.map(t=>`<button type="button" role="tab" class="tab" aria-selected="${t.id===active}" data-tab="${esc(t.id)}">${esc(t.label)}${t.count?` <span class="cnt">${t.count}</span>`:''}</button>`).join('')}</div>`;
}

/* A CLI question's choices as options: the text up to " — " as the label, the rest as the description,
   with the chat core's badges. */
function choiceOptions(qu){
  return (qu.choices||[]).map(c=>{const [label,description]=c.name.split(' — ');return {id:c.value,label,description,badge:qu.badges&&qu.badges[c.value]};});
}

/* Saved setups (REQ-002.H.28), kept by the page in localStorage under sp-setups: the list as stored, newest first. */
const SETUPS_KEY='sp-setups',MAX_SETUPS=50;
function setupsLoad(raw){
  let v;try{v=JSON.parse(raw||'[]');}catch(e){return [];}
  if(!Array.isArray(v))return [];
  return v.filter(e=>e&&typeof e==='object'&&typeof e.id==='string'&&(e.kind==='new'||e.kind==='setup')&&e.answers&&typeof e.answers==='object')
    .sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
}
/* The list with `entry` saved (replaced by id, else added), newest first, at most 50. */
function setupsPut(list,entry){return [entry,...list.filter(e=>e.id!==entry.id)].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,MAX_SETUPS);}
function setupsRemove(list,id){return list.filter(e=>e.id!==id);}
/* What is stored for a setup: never the token, only what the chat needs to resume. */
function setupRecord(st){
  return {id:st.id,kind:st.kind,root:st.root,name:st.kind==='new'?String(st.answers.name||''):st.name||'',answers:st.answers,editing:null,started:!!st.started,
    seeded:st.seeded||{},updatedAt:st.updatedAt||0,finished:!!st.finished,preview:st.preview||{done:false,changed:false}};
}
/* A row of the list: its title, `In progress` or `Ready to create`. */
function setupTitle(e){return e.kind==='setup'?(e.name||String(e.root||'').split(/[/\\]/).filter(Boolean).pop()||'Untitled setup'):(e.name||'Untitled setup');}
function setupStatus(e){return e.finished?'Ready to create':'In progress';}

/* The one line an IDE's MCP settings take (BL-PM-007); serve.ts prints the same line. */
function mcpConfigLine(host,token){
  return JSON.stringify({mcpServers:{'specpilot-local':{type:'http',url:`http://${host}/mcp`,headers:{'X-SpecPilot-Token':token}}}});
}

const api={mcpConfigLine,resolveRoute,goneHtml,when,editorUrl,recentHtml,openOutcome,reloadView,repoNameFromUrl,projectLabel,
  projectNameError,handleError,HANDLE_PATTERN,flowValue,answered,flowQuestions,nextQuestion,answerError,chatText,answerText,threadRows,recapCards,flowBody,previewFiles,
  optionHtml,tabsHtml,choiceOptions,SETUPS_KEY,setupsLoad,setupsPut,setupsRemove,setupRecord,setupTitle,setupStatus};
if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root,api);
})(this);
