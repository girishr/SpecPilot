/* Hash routing for the serve UI, kept free of the DOM so Jest can require it.
   Loaded as /assets/route.js in the browser. */
(function (root) {
const VIEWS=['board','explorer','security','instructions','commands','skills'];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* "#file/quality/tests.md" → {project:0, view:'file', sub:'quality/tests.md', missing:false}.
   A file the latest /api/specs does not list stays on the file view with missing:true,
   so the page can say it no longer exists instead of silently showing something else.
   "#2/board" is project 2 of `count` (BL-054); no index, or "#0/", is project 0; an index
   that names no served project goes to project 0's Tasks view. */
function resolveRoute(hash,files,count){
  let h=String(hash||'').replace(/^#/,''),project=0;
  const m=/^(\d+)\/(.*)$/.exec(h);
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

const api={resolveRoute,goneHtml};
if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root,api);
})(this);
