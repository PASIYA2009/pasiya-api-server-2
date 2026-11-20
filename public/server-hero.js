/* Scroll reveal for the API dashboard (ported from OFC pasiya-fx.js). Cards are re-rendered by the app, so it re-scans. */
(function(){
  var D=document,reduce=false;try{reduce=matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
  if(reduce||!('IntersectionObserver' in window))return;
  var SPEC=[['.srv-hero .srv-float','zoom'],['.welcome > div'],['.live'],['.stats .stat, .stats > *','pop'],['.panel','zoom'],['.api-grid > *','pop']];
  var io=new IntersectionObserver(function(es){es.forEach(function(en){var el=en.target;
    if(en.isIntersecting){if(!el.classList.contains('in')){el.style.setProperty('--d',(Math.min(el.__i||0,6)*.07).toFixed(2)+'s');el.classList.add('in')}}
    else el.classList.remove('in')})},{threshold:[0,.12],rootMargin:'0px 0px -4% 0px'});
  function prep(){SPEC.forEach(function(s){D.querySelectorAll(s[0]).forEach(function(el,i){
    if(el.dataset.psFx)return;el.dataset.psFx='1';el.__i=i%8;el.classList.add('ps-anim');if(s[1])el.classList.add(s[1]);io.observe(el)})})}
  function start(){prep();setInterval(prep,1500)}
  var l=D.getElementById('ps-loader');
  if(!l||l.classList.contains('ps-hide'))return start();
  var mo=new MutationObserver(function(){if(l.classList.contains('ps-hide')){mo.disconnect();setTimeout(start,120)}});
  mo.observe(l,{attributes:true,attributeFilter:['class']});setTimeout(start,8000);
})();
