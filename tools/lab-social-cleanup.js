// AI Users are first-class sidebar navigation now, not a Lab-menu feature.
(() => {
  function clean(){
    document.querySelectorAll('.rv-model-menu [data-ai-users]').forEach(node=>node.remove());
    const battle=document.querySelector('.rv-model-menu [data-battle]');
    if(battle) battle.textContent='AI Group Chat';
  }
  window.addEventListener('DOMContentLoaded',()=>{clean();let n=0;const t=setInterval(()=>{clean();if(++n>40)clearInterval(t);},100);});
})();