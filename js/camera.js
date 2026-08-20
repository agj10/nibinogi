/* =========================================================
   camera.js — 스프링 기반 카메라 (pan + zoom)

   x, y 는 월드 좌표, zoom 은 로그 공간에서 스프링을 건다.
   목표값만 바꾸면 가감속이 자동으로 생기고,
   이동과 줌이 서로 다른 속도로 동시에 진행된다.
   ========================================================= */

function Camera(){
  this.x = 0;  this.y = 0;  this.lz = 0;      // lz = log(zoom)
  this.tx = 0; this.ty = 0; this.tlz = 0;
  this.vx = 0; this.vy = 0; this.vz = 0;

  this.stiff = 46;      // 위치 스프링
  this.damp  = 2 * Math.sqrt(46);
  this.zStiff = 40;     // 줌 스프링
  this.zDamp  = 2 * Math.sqrt(40);
}

Object.defineProperty(Camera.prototype, 'zoom', {
  get: function(){ return Math.exp(this.lz); }
});

/* opt: { stiff, zStiff }  — 없으면 기본값 유지 */
Camera.prototype.moveTo = function(x, y, zoom, opt){
  this.tx = x; this.ty = y;
  this.tlz = Math.log(zoom);
  if (opt){
    if (opt.stiff){  this.stiff  = opt.stiff;  this.damp  = 2 * Math.sqrt(opt.stiff); }
    if (opt.zStiff){ this.zStiff = opt.zStiff; this.zDamp = 2 * Math.sqrt(opt.zStiff); }
  }
};

/* 트랜지션 없이 즉시 스냅 */
Camera.prototype.snapTo = function(x, y, zoom){
  this.moveTo(x, y, zoom);
  this.x = x; this.y = y; this.lz = Math.log(zoom);
  this.vx = this.vy = this.vz = 0;
};

Camera.prototype.update = function(dt){
  // 큰 dt 에서 스프링이 발산하지 않도록 서브스텝
  var steps = Math.max(1, Math.ceil(dt / 0.016));
  var h = dt / steps;
  for (var i = 0; i < steps; i++){
    var ax = this.stiff * (this.tx - this.x) - this.damp * this.vx;
    var ay = this.stiff * (this.ty - this.y) - this.damp * this.vy;
    var az = this.zStiff * (this.tlz - this.lz) - this.zDamp * this.vz;
    this.vx += ax * h;  this.x  += this.vx * h;
    this.vy += ay * h;  this.y  += this.vy * h;
    this.vz += az * h;  this.lz += this.vz * h;
  }
};

/* 목표 지점에 사실상 도달했는지 */
Camera.prototype.settled = function(posTol, zoomTol){
  posTol = posTol || 6; zoomTol = zoomTol || 0.01;
  return Math.abs(this.tx - this.x) < posTol
      && Math.abs(this.ty - this.y) < posTol
      && Math.abs(this.tlz - this.lz) < zoomTol;
};

Camera.prototype.apply = function(ctx, w, h){
  var z = this.zoom;
  ctx.translate(w / 2, h / 2);
  ctx.scale(z, z);
  ctx.translate(-this.x, -this.y);
};

Camera.prototype.screenToWorld = function(sx, sy, w, h){
  var z = this.zoom;
  return { x: (sx - w / 2) / z + this.x,
           y: (sy - h / 2) / z + this.y };
};

Camera.prototype.worldToScreen = function(wx, wy, w, h){
  var z = this.zoom;
  return { x: (wx - this.x) * z + w / 2,
           y: (wy - this.y) * z + h / 2 };
};

/* 화면에 보이는 월드 영역 */
Camera.prototype.viewBounds = function(w, h){
  var z = this.zoom;
  var hw = w / 2 / z, hh = h / 2 / z;
  return { x0: this.x - hw, x1: this.x + hw, y0: this.y - hh, y1: this.y + hh };
};
