// AI Lab identity settings now belong to AI users, not the global model dropdown.
(() => {
  function clean(){
    document.querySelectorAll('.rv-model-menu .rv-lab-section').forEach(node=>node.remove());
    document.querySelectorAll('.rv-model-menu [data-ai-users],.rv-model-menu [data-battle]').forEach(node=>node.remove());
  }
  window.addEventListener('DOMContentLoaded',()=>{
    clean();
    let n=0;
    const t=setInterval(()=>{clean();if(++n>30)clearInterval(t);},100);
  });
})();