(function(){
  function cleanMissingMinuteText(){
    document.querySelectorAll('.goalMinute').forEach(function(el){
      var text=(el.textContent||'').trim();
      if(text === 'minut mangler') el.remove();
      else if(text.indexOf('minut mangler · ') === 0) el.textContent = text.replace('minut mangler · ', '');
    });
  }
  function start(){
    cleanMissingMinuteText();
    var obs = new MutationObserver(cleanMissingMinuteText);
    obs.observe(document.body, {childList:true, subtree:true});
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
