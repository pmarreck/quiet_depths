export function lossPresentation(s,elapsed=0,station='scope'){
 const active=s.status==='lost';return{active,station,red:active?.4+.15*Math.exp(-Math.max(0,elapsed)*.5):0,cracks:active,bubbles:active?36:0};
}
