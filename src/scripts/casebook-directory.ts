const directory=document.querySelector<HTMLDetailsElement>('#cb-directory');
if(directory){
 directory.classList.add('cb-directory-fit');
 const links=[...directory.querySelectorAll<HTMLAnchorElement>('[data-cb-directory-id]')];
 const requested=new URLSearchParams(location.search).get('directory');
 const returned=links.find(link=>link.dataset.cbDirectoryId===requested);
 directory.open=Boolean(returned)||!matchMedia('(max-width:640px)').matches;
 function fitNames(){
  if(!directory!.open)return;
  for(const link of links)link.style.removeProperty('font-size');
  const sizes=links.map(link=>{
   const style=getComputedStyle(link);
   const available=link.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
   const range=document.createRange();range.selectNodeContents(link);
   const width=range.getBoundingClientRect().width;
   const base=parseFloat(style.fontSize);
   return available>0&&width>available?Math.max(12,Math.floor(base*(available-1)/width*100)/100):null;
  });
  links.forEach((link,i)=>{if(sizes[i]!==null)link.style.fontSize=`${sizes[i]}px`;});
 }
 let fitFrame=0;
 function scheduleFit(){cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(fitNames);}
 directory.addEventListener('toggle',scheduleFit);
 const nameList=directory.querySelector<HTMLElement>('.cb-directory-list')!;
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(scheduleFit).observe(nameList);
 else window.addEventListener('resize',scheduleFit);
 document.fonts.ready.then(scheduleFit);
 scheduleFit();
 // Native links keep working without JavaScript; this adds a return to this name.
 for(const link of links){
  link.addEventListener('click',()=>{
   const state=new URLSearchParams(location.search);
   state.delete('focus');state.set('directory',link.dataset.cbDirectoryId!);
   const back='/casebooks/?'+state.toString();
   link.href=`/casebooks/${encodeURIComponent(link.dataset.cbDirectoryId!)}/?from=${encodeURIComponent(back)}#application`;
  });
 }
 if(returned)requestAnimationFrame(()=>{
  const header=document.querySelector<HTMLElement>('.site-header');
  const offset=header?Math.max(0,header.getBoundingClientRect().bottom):0;
  returned.focus({preventScroll:true});
  window.scrollTo({top:Math.max(0,window.scrollY+returned.getBoundingClientRect().top-offset-18),left:0,behavior:'instant'});
 });
}
export {};
