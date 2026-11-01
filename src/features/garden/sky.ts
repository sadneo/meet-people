// The finalized prototype's sky, cloud silhouettes and overview camera.
// Background islands are illustrations, not other users' saved gardens.
export function gardenProjection(width: number, height: number, camera: {x:number;y:number;zoom:number}, bottomInset = 0) {
  if (bottomInset) {
    const top = 100, available = Math.max(100, height - bottomInset - top)
    const scale = Math.max(.08, Math.min((width - 36) / 1320, available / 1015, .85))
    return { scale, x: width / 2 - 724 * scale, y: top + (available - 1015 * scale) / 2 }
  }
  const scale = Math.max(.16, Math.min((width-36)/1320, Math.max(180,height-240)/820, .85)) * camera.zoom
  return {scale, x:width/2-724*scale+camera.x, y:height*.47-590*scale+camera.y}
}

export function drawGardenSky(ctx: CanvasRenderingContext2D, width: number, height: number, ratio: number, time: number, camera: {x:number;y:number}, island: HTMLImageElement | null) {
  ctx.setTransform(ratio,0,0,ratio,0,0)
  ctx.fillStyle='#e8efed';ctx.fillRect(0,0,width,height);ctx.imageSmoothingEnabled=false
  if(island?.complete && island.naturalWidth) {
    ctx.save();ctx.globalAlpha=.65
    for(const [i,[x,y,size]] of [[.17,.22,90],[.81,.29,76],[.54,.15,62]].entries()) {
      ctx.drawImage(island,Math.round(x*width-camera.x*.13-size/2),Math.round(y*height-camera.y*.08+Math.sin(time*.55+i*2)*3-size*.79/2),size,Math.round(size*.79))
    }
    ctx.restore()
  }
  const clouds=[[-.15,.16,1.5],[.58,.12,1.1],[.18,.31,.75],[.88,.43,1.3],[-.2,.65,1.4],[.5,.8,1.05],[.04,.94,.7]]
  for(const [i,[x,y,size]] of clouds.entries()) {
    const margin=180*size,travel=width+margin*2
    const px=((x*width+time*(1.4+i*.22)-camera.x*.055+margin)%travel+travel)%travel-margin
    ctx.save();ctx.translate(Math.round(px),Math.round(y*height-camera.y*.04));ctx.scale(size,size)
    ctx.globalAlpha=.9;ctx.fillStyle='#fffdf7'
    ctx.fill(new Path2D('M0 18H12V8H27V0H47V-10H72V0H91V9H112V18H132V34H0Z'))
    ctx.fillStyle='#dce6dd';ctx.globalAlpha=.6;ctx.fillRect(12,29,108,5);ctx.fillRect(0,25,12,9);ctx.fillRect(120,25,12,9);ctx.restore()
  }
}
