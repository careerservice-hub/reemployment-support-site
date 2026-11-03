const form=document.querySelector<HTMLFormElement>('#cb-search');
if(form){
 const q=document.querySelector<HTMLInputElement>('#cb-q')!;
 const industry=document.querySelector<HTMLSelectElement>('#cb-industry')!;
 const size=document.querySelector<HTMLSelectElement>('#cb-size')!;
 const year=document.querySelector<HTMLSelectElement>('#cb-year')!;
 const topic=document.querySelector<HTMLSelectElement>('#cb-topic-select')!;
 const sort=document.querySelector<HTMLSelectElement>('#cb-sort')!;
 const count=document.querySelector<HTMLElement>('#cb-count')!;
 const range=document.querySelector<HTMLElement>('#cb-range')!;
 const list=document.querySelector<HTMLElement>('#cb-case-list')!;
 const selected=document.querySelector<HTMLElement>('#cb-selected')!;
 const pagination=document.querySelector<HTMLElement>('#cb-pagination')!;
 const pageSelect=document.querySelector<HTMLSelectElement>('#cb-result-page')!;
 const previous=document.querySelector<HTMLButtonElement>('#cb-page-prev')!;
 const next=document.querySelector<HTMLButtonElement>('#cb-page-next')!;
 const topicButtons=[...document.querySelectorAll<HTMLButtonElement>('[data-topic]')];
 const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,'');
 const collator=new Intl.Collator('ko',{numeric:true});
 const pool=[...list.querySelectorAll<HTMLElement>('[data-case]')].map((node,position)=>({node,position,id:node.dataset.case||'',company:node.dataset.company||'',year:Number(node.dataset.year)||0,industry:node.dataset.industry||'',size:node.dataset.size||'',topics:JSON.parse(node.dataset.topics||'[]') as string[],text:normalize(node.dataset.search||'')}));
 const pageSize=10;
 let currentPage=1;
 let resultPages=1;
 topicButtons.forEach((button,i)=>button.hidden=i>=6);
 const topicDetails=document.querySelector<HTMLDetailsElement>('.cb-all-topics')!;
 topicDetails.hidden=topic.options.length<=7;
 document.querySelector('#cb-topic-total')!.textContent=`${topic.options.length-1}개`;
 function params(){
  const result=new URLSearchParams();
  for(const field of [q,industry,size,year,topic])if(field.value.trim())result.set(field.name,field.value.trim());
  if(sort.value!=='latest')result.set('sort',sort.value);
  if(currentPage>1)result.set('page',String(currentPage));
  return result;
 }
 function focusResults(target:HTMLElement=count,scrollTarget:HTMLElement=target){
  const header=document.querySelector<HTMLElement>('.site-header');
  const offset=header?Math.max(0,header.getBoundingClientRect().bottom):0;
  target.focus({preventScroll:true});
  window.scrollTo({top:Math.max(0,window.scrollY+scrollTarget.getBoundingClientRect().top-offset-18),left:0,behavior:'instant'});
 }
 function selectedConditions(){
  selected.replaceChildren();
  const definitions:[[HTMLInputElement|HTMLSelectElement,string],...Array<[HTMLInputElement|HTMLSelectElement,string]>]=[[q,'키워드'],[industry,'업종'],[size,'규모'],[year,'연도'],[topic,'과제']];
  for(const [field,label] of definitions){
   if(!field.value.trim())continue;
   const chip=document.createElement('button');chip.type='button';chip.className='cb-condition';
   const value=field instanceof HTMLSelectElement?field.selectedOptions[0].textContent:field.value.trim();
   chip.textContent=`${label}: ${value} ×`;chip.setAttribute('aria-label',`${label} 조건 해제: ${value}`);
   chip.addEventListener('click',()=>{field.value='';currentPage=1;render();(field.getClientRects().length?field:q).focus({preventScroll:true});});
   selected.append(chip);
  }
  selected.hidden=!selected.childElementCount;
 }
 function render(updateUrl=true){
  const terms=q.value.trim().split(/\s+/).filter(Boolean).map(normalize);
  const matches=pool.filter(c=>terms.every(term=>c.text.includes(term))&&(!industry.value||c.industry===industry.value)&&(!size.value||c.size===size.value)&&(!year.value||String(c.year)===year.value)&&(!topic.value||c.topics.includes(topic.value)));
  matches.sort((a,b)=>sort.value==='company'?collator.compare(a.company,b.company)||b.year-a.year||a.position-b.position:b.year-a.year||collator.compare(a.company,b.company)||a.position-b.position);
  resultPages=Math.max(1,Math.ceil(matches.length/pageSize));currentPage=Math.min(resultPages,Math.max(1,currentPage));
  const start=(currentPage-1)*pageSize;const shown=matches.slice(start,start+pageSize);
  list.replaceChildren(...shown.map(c=>c.node));
  count.textContent=`검색 결과 ${matches.length}건`;
  range.textContent=`${matches.length?start+1:0}–${Math.min(start+pageSize,matches.length)}건 표시 · ${currentPage} / ${resultPages}페이지`;
  range.hidden=matches.length<=pageSize;
  (document.querySelector('#cb-empty') as HTMLElement).hidden=matches.length!==0;
  pagination.hidden=matches.length<=pageSize;
  pageSelect.replaceChildren(...Array.from({length:resultPages},(_,i)=>new Option(`${i+1} / ${resultPages} 페이지`,String(i+1))));
  pageSelect.value=String(currentPage);previous.disabled=currentPage===1;next.disabled=currentPage===resultPages;
  topicButtons.forEach(b=>b.setAttribute('aria-pressed',String(Boolean(topic.value)&&b.dataset.topic===topic.value)));
  selectedConditions();
  const state=params();
  for(const c of shown){
   const from=new URLSearchParams(state);from.set('focus',c.id);
   const returnPath='/casebooks/?'+from.toString();
   for(const link of c.node.querySelectorAll<HTMLAnchorElement>('.cb-detail-link')){
    const hash=new URL(link.href,location.origin).hash;
    link.href=`/casebooks/${encodeURIComponent(c.id)}/?from=${encodeURIComponent(returnPath)}${hash}`;
   }
  }
  if(updateUrl)history.replaceState(null,'',location.pathname+(state.size?'?'+state.toString():''));
 }
 function restore(){
  const state=new URLSearchParams(location.search);q.value=(state.get('q')||'').slice(0,100);
  for(const field of [industry,size,year,topic,sort]){
   const value=state.get(field.name)||(field===sort?'latest':'');
   field.value=[...field.options].some(o=>o.value===value)?value:(field===sort?'latest':'');
  }
  const requested=Number(state.get('page')||'1');currentPage=Number.isInteger(requested)&&requested>0?requested:1;
  render(false);
  const focused=pool.find(c=>c.id===state.get('focus'));
  if(focused&&list.contains(focused.node))requestAnimationFrame(()=>focusResults(focused.node.querySelector<HTMLAnchorElement>('h3 a')!));
 }
 function reset(){form!.reset();sort.value='latest';currentPage=1;topicDetails.open=false;render();focusResults(q,form!);}
 function change(){currentPage=1;render();}
 q.addEventListener('input',event=>{if(!(event as InputEvent).isComposing)change();});
 q.addEventListener('compositionend',change);
 for(const field of [industry,size,year,topic,sort])field.addEventListener('change',change);
 topicButtons.forEach(b=>b.addEventListener('click',()=>{topic.value=topic.value===b.dataset.topic?'':b.dataset.topic||'';change();}));
 form.addEventListener('submit',event=>{event.preventDefault();render();focusResults();});
 document.querySelector('#cb-show-results')!.addEventListener('click',()=>{render();focusResults();});
 previous.addEventListener('click',()=>{currentPage=Math.max(1,currentPage-1);render();focusResults();});
 next.addEventListener('click',()=>{currentPage=Math.min(resultPages,currentPage+1);render();focusResults();});
 pageSelect.addEventListener('change',()=>{currentPage=Number(pageSelect.value);render();focusResults();});
 document.querySelector('#cb-reset')!.addEventListener('click',reset);
 document.querySelector('#cb-empty-reset')!.addEventListener('click',reset);
 window.addEventListener('popstate',restore);restore();
}
export {};
