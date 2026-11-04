const directory=document.querySelector<HTMLDetailsElement>('#cb-directory');
if(directory){
 const links=[...directory.querySelectorAll<HTMLAnchorElement>('[data-cb-directory-id]')];
 const requested=new URLSearchParams(location.search).get('directory');
 const returned=links.find(link=>link.dataset.cbDirectoryId===requested);
 directory.open=Boolean(returned)||!matchMedia('(max-width:640px)').matches;
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
