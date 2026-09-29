/* Hash routing for the serve UI, kept free of the DOM so Jest can require it.
   Loaded as /assets/route.js in the browser. */
(function (root) {
const VIEWS=['board','explorer','security','instructions','commands','skills'];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* "#file/quality/tests.md" → {view:'file', sub:'quality/tests.md', missing:false}.
   A file the latest /api/specs does not list stays on the file view with missing:true,
   so the page can say it no longer exists instead of silently showing something else. */
function resolveRoute(hash,files){
  const h=String(hash||'').replace(/^#/,''),ix=h.indexOf('/');
  const view=ix<0?h:h.slice(0,ix);
  let sub=ix<0?'':h.slice(ix+1);
  try{sub=decodeURIComponent(sub);}catch(e){}
  if(view==='file'&&sub)return {view:'file',sub,missing:!Object.prototype.hasOwnProperty.call(files||{},sub)};
  if(VIEWS.includes(view))return {view,sub,missing:false};
  return {view:'board',sub:'',missing:false};
}

/* The whole content of a view whose file is gone: its path, and that it no longer exists. */
function goneHtml(path){return `<p class="note"><span class="mono" translate="no">${esc(path)}</span> no longer exists.</p>`;}

const api={resolveRoute,goneHtml};
if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root,api);
})(this);
