// Keep AI Users focused on user management. Groups belong to Chats, not Users/Lab.
(() => {
  function cleanup(){
    const battle=document.querySelector('.rv-model-menu [data-battle]');
    if(battle)battle.remove();

    const social=document.querySelector('.rv-social-backdrop');
    if(social){
      social.querySelector('[data-nav-groups]')?.remove();
      const groupsTitle=[...social.querySelectorAll('.rv-social-list-title')].find(el=>el.textContent.trim().toUpperCase()==='GROUPS');
      groupsTitle?.remove();
      social.querySelector('[data-group-list]')?.remove();
    }
  }

  window.addEventListener('DOMContentLoaded',()=>{
    cleanup();
    const observer=new MutationObserver(cleanup);
    observer.observe(document.body,{childList:true,subtree:true});
  });
})();