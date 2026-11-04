const from=new URLSearchParams(location.search).get('from');
if(from){
 try{
  const candidate=new URL(from,location.origin);
  if(candidate.origin===location.origin&&candidate.pathname==='/casebooks/'&&!candidate.username&&!candidate.password){
   for(const link of document.querySelectorAll<HTMLAnchorElement>('.cb-return')){
    link.href=candidate.pathname+candidate.search;
    link.textContent='검색 결과로 돌아가기';
   }
  }
 }catch{/* Invalid or external return targets keep the default full-list link. */}
}
const reader=document.querySelector<HTMLElement>('.cb-reader');
if(reader){
 const select=document.querySelector<HTMLSelectElement>('#cb-page')!;
 const options=[...select.options];
 const image=document.querySelector<HTMLImageElement>('#cb-page-image')!;
 const caption=document.querySelector<HTMLElement>('#cb-page-caption')!;
 const previous=document.querySelector<HTMLButtonElement>('#cb-prev')!;
 const next=document.querySelector<HTMLButtonElement>('#cb-next')!;
 const enlarge=document.querySelector<HTMLAnchorElement>('#cb-enlarge')!;
 let index=0;
 function show(requested:number){
  index=Math.max(0,Math.min(options.length-1,Number.isFinite(requested)?requested:0));
  const option=options[index];const printed=option.dataset.printed||'';
  image.src=option.dataset.image!;image.alt=`${reader!.dataset.company} 사례 원문 p.${printed}`;
  select.value=String(index);previous.disabled=index===0;next.disabled=index===options.length-1;
  caption.textContent=`원문 p.${printed} · 발췌본 ${index+1} / ${options.length}쪽`;
  enlarge.href=option.dataset.image!;
 }
 select.addEventListener('change',()=>show(Number(select.value)));
 previous.addEventListener('click',()=>show(index-1));next.addEventListener('click',()=>show(index+1));
 for(const link of document.querySelectorAll<HTMLAnchorElement>('[data-cb-source-page]')){
  link.addEventListener('click',event=>{
   const requested=options.findIndex(option=>option.dataset.printed===link.dataset.cbSourcePage);
   if(requested<0)return;
   event.preventDefault();show(requested);
   const target=document.querySelector<HTMLElement>('#original')!;
   const header=document.querySelector<HTMLElement>('.site-header');
   const offset=header?Math.max(0,header.getBoundingClientRect().bottom):0;
   window.scrollTo({top:Math.max(0,window.scrollY+target.getBoundingClientRect().top-offset-18),left:0,behavior:'instant'});
   select.focus({preventScroll:true});
  });
 }
 document.querySelector('.cb-file-view')?.addEventListener('toggle',event=>{
  const detail=event.currentTarget as HTMLDetailsElement;const iframe=detail.querySelector<HTMLIFrameElement>('iframe')!;
  if(detail.open&&!iframe.hasAttribute('src'))iframe.src=iframe.dataset.pdfSrc!;
 });
 show(0);
}
export {};
