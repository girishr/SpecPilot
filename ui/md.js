/* Markdown renderer, ported from the approved mockup. Renders the file as written: no
   summarising, no reordering, no text substitution beyond escaping and inline emphasis.
   Every piece of file text passes through esc() before any tag is added, so raw HTML in
   a spec file is shown as text, never parsed. Loaded as /assets/md.js in the browser and
   required directly by the Jest tests. */
(function (root) {
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ANCHOR=/\[((?:REQ|ARCH|TASKS|ROADMAP|TESTS|SEC|CTX|PROMPT|API|PROJ|FIX|ADR|BL|CS|CD)-[A-Za-z0-9.\-]+)\]/g;
function inline(t){
  let h=esc(t);
  h=h.replace(/`([^`]+)`/g,(m,c)=>'<code translate="no">'+c+'</code>');
  h=h.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  h=h.replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g,'$1<em>$2</em>');
  h=h.replace(/\[([^\]\[]+)\]\((https?:[^)\s]+|[^)\s]+\.md[^)\s]*)\)/g,'<span class="lk">$1</span>');
  h=h.replace(ANCHOR,m=>'<span class="ref" translate="no">'+m+'</span>');
  return h;
}
/* Split a table row into n cells on the first n-1 pipes only; the last cell keeps the rest,
   so a `|` inside backticks in a description survives (same rule as specReader.ts). */
function cells(line,n){
  let rest=line.trim().replace(/^\|/,'').replace(/\|$/,'');
  if(!n)return rest.split('|').map(c=>c.trim());
  const out=[];
  for(let k=0;k<n-1;k++){const p=rest.indexOf('|');if(p<0)break;out.push(rest.slice(0,p).trim());rest=rest.slice(p+1);}
  out.push(rest.trim());
  return out;
}
function md(src){
  const L=String(src).replace(/\r/g,'').split('\n');
  const o=[];let i=0;
  const close=()=>{while(st.length)o.push(st.pop());};
  let st=[];
  while(i<L.length){
    let l=L[i];
    if(/^\s*$/.test(l)){close();i++;continue;}
    let m;
    if(m=l.match(/^(#{1,6})\s+(.*)$/)){close();const n=Math.min(6,m[1].length+1);o.push('<h'+n+'>'+inline(m[2])+'</h'+n+'>');i++;continue;}
    if(/^\s*(---|\*\*\*|___)\s*$/.test(l)){close();o.push('<hr>');i++;continue;}
    if(/^```/.test(l)){close();i++;const b=[];while(i<L.length&&!/^```/.test(L[i])){b.push(L[i]);i++;}i++;o.push('<pre translate="no">'+esc(b.join('\n'))+'</pre>');continue;}
    if(/^>\s?/.test(l)){close();const b=[];while(i<L.length&&/^>\s?/.test(L[i])){b.push(L[i].replace(/^>\s?/,''));i++;}o.push('<blockquote>'+md(b.join('\n'))+'</blockquote>');continue;}
    if(/^\s*\|/.test(l)&&i+1<L.length&&/^\s*\|[\s:|-]+\|?\s*$/.test(L[i+1])){
      close();const head=cells(l);i+=2;const rows=[];
      while(i<L.length&&/^\s*\|/.test(L[i])){rows.push(cells(L[i],head.length));i++;}
      o.push('<div class="tw"><table><thead><tr>'+head.map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+
        rows.map(r=>'<tr>'+r.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');
      continue;}
    if(m=l.match(/^(\s*)([-*+])\s+(.*)$/)){
      close();const items=[];
      while(i<L.length){
        const mm=L[i].match(/^(\s*)([-*+])\s+(.*)$/);
        if(!mm)  {if(/^\s+\S/.test(L[i])&&items.length){items[items.length-1]+=' '+L[i].trim();i++;continue;} break;}
        items.push(mm[3]);i++;
      }
      o.push('<ul>'+items.map(t=>{
        const cb=t.match(/^\[([ xX])\]\s*(.*)$/);
        if(cb)return '<li class="cb '+(cb[1]===' '?'off':'on')+'">'+inline(cb[2])+'</li>';
        return '<li>'+inline(t)+'</li>';}).join('')+'</ul>');
      continue;}
    if(m=l.match(/^(\s*)(\d+)\.\s+(.*)$/)){
      close();const items=[];const start=m[2];
      /* Each item keeps the number written in the file (value=), so gaps and repeats show as written. */
      while(i<L.length){const mm=L[i].match(/^(\s*)(\d+)\.\s+(.*)$/);if(!mm)break;items.push([mm[2],mm[3]]);i++;}
      o.push('<ol start="'+start+'">'+items.map(([n,t])=>'<li value="'+n+'">'+inline(t)+'</li>').join('')+'</ol>');
      continue;}
    {const b=[];while(i<L.length&&!/^\s*$/.test(L[i])&&!/^(#{1,6}\s|\s*\||>\s?|```|\s*[-*+]\s|\s*\d+\.\s)/.test(L[i])){b.push(L[i]);i++;}
     if(b.length)o.push('<p>'+inline(b.join(' '))+'</p>');else i++;}
  }
  close();
  return o.join('');
}
/* Front matter is metadata, not prose: split it off so a view can show it as a table. */
function splitFm(src){
  const t=String(src).replace(/\r/g,'');
  if(!t.startsWith('---\n'))return {fm:'',body:t};
  const e=t.indexOf('\n---\n',3);
  if(e<0)return {fm:'',body:t};
  return {fm:t.slice(4,e),body:t.slice(e+5)};
}
const api={md,splitFm,esc};
if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root,api);
})(this);
