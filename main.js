/* ============================================================
 * 秋山客栈 · 3D 沙盘  v2
 * 骨架：方形院墙 + 两层门制 + 四合院 + 长条棱线山体 + 门外土路/码头
 * 中轴(南→北)：河/桥/码头 → 东西土路 → 围墙小门楼 → 前院(石灯甬道)
 *              → 客栈门屋(4扇钉门) → 四合院主院 → 主楼(嵌山)
 * ============================================================ */
'use strict';

/* ---------------- 基础 ---------------- */
const BASE_R = 30;               // 沙盘圆盘半径 v4.80c 26→30：南桥不再超盘，山体截切自动重算
const WX = 10, WZS = 8.6, WZN = -10;  // 方形院墙：x±WX / 南z=WZS / 北z=WZN
const rand = mulberry32(20261027);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rr = (a, b) => a + rand() * (b - a);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 500);
const CAM0 = new THREE.Vector3(21.5, 16, 30);
const TGT0 = new THREE.Vector3(0, 2.5, 0);
camera.position.copy(CAM0);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });   /* 允许页内 toDataURL 取证 */
} catch (e) {
  const el = document.getElementById('loading');
  if (el) el.innerHTML = '⚠️ 浏览器 WebGL 不可用（硬件加速被关了）<br>' +
    '<span style="font-size:13px;opacity:.85">① 地址栏开 chrome://settings/system 打开「硬件加速」并重启浏览器<br>' +
    '② 或开 chrome://gpu 点 Reset / Restart<br>③ 彻底退出 Chrome 再重开本页面</span>';
  throw e;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;   /* v5.16 节流：静态盘+动物慢移动，3 帧一刷（原每帧全量重建 2048² 阴影图） */
renderer.outputEncoding = THREE.sRGBEncoding;
const EXP = { day: 0.63, night: 0.95 };   /* v4.33 白天再压暗一点出昏黄味 */   /* ACES 曝光：白天比原 0.95 降约 30%，夜景保持已批准亮度 */
renderer.toneMappingExposure = EXP.day;
document.getElementById('app').appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.copy(TGT0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.7;
controls.minDistance = 8;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.49;

/* v5.14 map:null 占位 Sprite（炊烟/烛焰）参与射线会炸（r147 Sprite.raycast 内部依赖渲染期缓存），全场无 Sprite 拾取需求 → 直接禁掉 */
THREE.Sprite.prototype.raycast = function () {};
/* ---------------- v5.07 A 方案：X 光幽灵屋顶（射线判定遮挡 → 整栋淡出 18%，V 键开关） ---------------- */
window.__xray = { on: true };
{
  const XRAY = window.__xray;
  XRAY.groups = [];
  const reg = (g, name) => { if (g) { g.userData.xrName = name; XRAY.groups.push(g); } };
  XRAY.register = function () {   /* v5.07 惰性：建筑 group 要等主脚本跑完才在 window 上 */
    if (XRAY.groups.length) return;
    reg(window.__shellInn, '主楼'); reg(window.__shellWingE, '东厢'); reg(window.__shellWingW, '西厢');
  };
  const box3 = new THREE.Box3(), tv = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  ray.far = 200;
  let acc = 0;   /* v635 0.3s→0.5s；AABB 缓存 4s（原每跳 setFromObject 全顶点遍历=周期卡顿源） */
  const boxCache = new Map();   // group -> {b:Box3, t:performance.now()}
  const state = new Map();   // group -> {cur, want, mats:Map(orig→ghost)}
  const camDir = new THREE.Vector3();
  XRAY.tick = function (dt) {
    if (typeof animals === 'undefined') return;   /* 主脚本未跑完：跳过（const TDZ） */
    window.__xray.ready = 1;
    XRAY.register();
    acc += dt;
    if (acc < 0.5) return;   /* v635 0.3→0.5s 判定间隔 */
    acc = 0;
    let tgt = null;
    if (window.__pel && btnPelOn()) {
      tgt = tv.copy(window.__pel.pos);
      if (tgt.distanceTo(camera.position) > 40) {   /* 鹈鹕传送在远处：相机正对楼内小动物时仍按动物判 */
        const fwdv = new THREE.Vector3(); camera.getWorldDirection(fwdv);
        let bd = 13;
        for (const a of animals) {
          const p = a.obj.position; const d = p.distanceTo(camera.position);
          if (d < bd) { const to = p.clone().sub(camera.position).normalize(); if (to.dot(fwdv) > 0.94) { bd = d; tgt = tv.copy(p); } }
        }
        if (bd === 13) tgt = null;
      }
    } else {
      const fwdv = new THREE.Vector3(); camera.getWorldDirection(fwdv);
      let bd = 13;
      for (const a of animals) {
        const p = a.obj.position; const d = p.distanceTo(camera.position);
        if (d < bd) { const to = p.clone().sub(camera.position).normalize(); if (to.dot(fwdv) > 0.9) { bd = d; tgt = tv.copy(p); } }   /* 只认画面正前方的目标 */
      }
    }
    const wantG = new Set();
    if (XRAY.on && tgt && !(window.__cine && window.__cine.on)) {   /* 电影运镜保持建筑完整 */
      for (const g of XRAY.groups) {
        let cb = boxCache.get(g);
        if (!cb || performance.now() - cb.t > 4000) { cb = { b: new THREE.Box3().setFromObject(g), t: performance.now() }; boxCache.set(g, cb); }
        box3.copy(cb.b);
        const tIn = box3.containsPoint(tgt);
        if (!tIn) continue;
        box3.expandByScalar(0.8);
        const cIn = box3.containsPoint(camera.position);
        if (cIn) continue;                          /* 相机在楼内：顶是"自家的"，不淡 */
        let hits = [];
        try { hits = ray.intersectObjects(g.children, true); } catch (e) { continue; }   /* 门铰链组偶发 null 矩阵 */
        if (hits.length) wantG.add(g);              /* 射线被这栋楼拦下且目标在楼内 → 幽灵化 */
      }
    }
    for (const g of XRAY.groups) {
      let s = state.get(g);
      if (!s) { s = { cur: 1, want: 1, mats: new Map() }; state.set(g, s); }
      s.want = wantG.has(g) ? 0.18 : 1;
    }
  };
  function ghostMat(o, orig, s) {
    let gm = s.mats.get(orig);
    if (!gm) {
      gm = orig.clone();
      gm.userData.base = { t: orig.transparent, o: orig.opacity, d: orig.depthWrite };
      gm.name = orig.name + '_xr';
      s.mats.set(orig, gm);
    }
    const b = gm.userData.base;
    gm.transparent = b.t || s.cur < 0.985;
    gm.opacity = b.o * s.cur;
    gm.depthWrite = s.cur > 0.92 ? b.d : false;
    o.userData.xrGhost = gm;
    return gm;
  }
  XRAY.matLerp = function (dt) {
    if (!window.__xray.ready) return;
    for (const [g, s] of state) {
      if (s.cur === s.want) continue;
      s.cur += (s.want - s.cur) * Math.min(1, dt * 6.5);
      if (Math.abs(s.cur - s.want) < 0.004) s.cur = s.want;
      applyGroup(g, s);
    }
  };
  function isUpFacing(o) {   /* v5.16 屋面判定：坡面法线(y>0.35 且带水平分量)顶点占比——瓦/脊/披檐的斜面独有；墙竖面 0、水平顶面 (0,1,0) 也不算 */
    const n = o.geometry.attributes.normal;
    if (!n) return false;
    let slope = 0; const st = n.count > 240 ? Math.max(1, (n.count / 240) | 0) : 1;
    let tot = 0;
    for (let i = 0; i < n.count; i += st) {
      const ny = n.getY(i);
      if (ny > 0.35 && (Math.abs(n.getX(i)) > 0.15 || Math.abs(n.getZ(i)) > 0.15)) slope++;
      tot++;
    }
    return slope / tot > 0.1;
  }
  function applyGroup(g, s) {
    g.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      if (o.userData.xrUp === undefined) o.userData.xrUp = isUpFacing(o);
      if (!o.userData.xrUp) return;
      if (!o.userData.xrOrig) o.userData.xrOrig = o.material;
      const orig = o.userData.xrOrig;
      if (s.cur === 1 && o.userData.xrGhost && !o.material.transparent) o.material = orig;
      else o.material = ghostMat(o, orig, s);
    });
  }
  /* 首帧由 animate 驱动（此处立即调用会撞 animals 的 TDZ） */
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyV' && !e.repeat) {
      XRAY.on = !XRAY.on;
      const h = document.getElementById('hint');
      if (h) { h.style.display = 'block'; h.textContent = XRAY.on ? 'X 光屋顶：开（遮挡自动淡出）' : 'X 光屋顶：关'; clearTimeout(XRAY._t); XRAY._t = setTimeout(() => { h.style.display = 'none'; }, 1600); }
    }
  });
  function btnPelOn() { const b = document.getElementById('btnPel'); return b && b.classList.contains('on'); }
}

const dayNight = {
  sun: null, hemi: null,
  windows: [], lanternMats: [], lanternLights: [],
  water: null, leaves: null,
  isNight: false,
};

/* ---------------- 天空 / 光照 ---------------- */
const SKY_DAY = new THREE.Color('#e6ae5e');   /* v4.33 昏黄：更沉的琥珀昏黄 */
const SKY_NIGHT = new THREE.Color('#0b101a');
const SKY_MORN = new THREE.Color('#cfe7f6');   /* v4.81b 上午：浅天蓝（盘外底色同浅蓝） */
const SKY_DEEP = new THREE.Color('#05070e');    /* v4.81 下半夜：更黑 */
scene.background = SKY_DAY.clone();
scene.fog = new THREE.Fog(SKY_DAY.clone(), 80, 180);

const hemi = new THREE.HemisphereLight('#e0a758', '#463317', 0.25);
scene.add(hemi);

const sun = new THREE.DirectionalLight('#ffb45e', 1.35);
sun.position.set(20, 18, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);   /* v635 性能建议：2048² 软阴影 1/4 面积，配 autoUpdate 节流肉眼无感 */
sun.shadow.camera.left = -37; sun.shadow.camera.right = 37;
sun.shadow.camera.top = 37; sun.shadow.camera.bottom = -37;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 100;
sun.shadow.bias = -0.0006;
scene.add(sun);
dayNight.sun = sun; dayNight.hemi = hemi;
/* v638 补光系统（外部建议#8）：边缘天光+地面回弹+月光，全部不投影零阴影税 */
const rimL = new THREE.DirectionalLight('#a8c8e8', 0.2);
rimL.position.set(-18, 12, -16); scene.add(rimL);
const bounceL = new THREE.DirectionalLight('#d4a574', 0.13);
bounceL.position.set(2, -8, 4); bounceL.target.position.set(0, 8, 0); scene.add(bounceL, bounceL.target);
const moonL = new THREE.DirectionalLight('#b8c8e0', 0);
moonL.position.set(-24, 28, 12); scene.add(moonL);
window.__fillAdj = function (n) { rimL.intensity = 0.2 * (1 - n) + 0.06 * n; bounceL.intensity = 0.13 * (1 - n); moonL.intensity = 0.08 * n; if (window.__bloomSet) window.__bloomSet(n); };   /* v639b 亮度计终审：夜=rim0.06+月0.08（月0.16 实测仍比参考版亮 6/100） */

/* ---------------- 材质 / 基础件 ---------------- */
function mat(color, opts) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0.0 }, opts));
}
/* v641 做旧墙面 + 窗框老木纹纹理工厂（前置定义供全文件引用） */
const AGING_CANVAS = (function () {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#f4efe4'; x.fillRect(0, 0, 512, 512);   /* v643 底色提亮 */
  for (let i = 0; i < 26; i++) {   /* 云状灰渍 */
    const px = Math.random() * 512, py = Math.random() * 512, r = 60 + Math.random() * 140;
    const g = x.createRadialGradient(px, py, 6, px, py, r);
    g.addColorStop(0, 'rgba(122,106,80,0.055)'); g.addColorStop(1, 'rgba(122,106,80,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  for (let i = 0; i < 30; i++) {   /* 雨水流挂痕（v641b 减密减浓：厢房小墙面上 46 道太像划痕） */
    const px = Math.random() * 512, pw = 3 + Math.random() * 8, ph = 40 + Math.random() * 170, py = Math.random() * 260;
    const g = x.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, 'rgba(96,84,62,0.065)'); g.addColorStop(0.3, 'rgba(96,84,62,0.04)'); g.addColorStop(1, 'rgba(96,84,62,0)');
    x.fillStyle = g; x.fillRect(px, py, pw, ph);
    if (Math.random() < 0.5) { const g2 = x.createLinearGradient(0, py, 0, py + ph * 0.6); g2.addColorStop(0, 'rgba(88,78,58,0.05)'); g2.addColorStop(1, 'rgba(88,78,58,0)'); x.fillStyle = g2; x.fillRect(px + pw + 2 + Math.random() * 10, py + 10, pw * 0.6, ph * 0.6); }
  }
  const gb = x.createLinearGradient(0, 396, 0, 512);   /* 墙根青苔带 */
  gb.addColorStop(0, 'rgba(88,102,72,0)'); gb.addColorStop(1, 'rgba(88,102,72,0.16)');   /* v643 苔痕减半 */
  x.fillStyle = gb; x.fillRect(0, 396, 512, 116);
  for (let i = 0; i < 320; i++) {   /* 霉点脏粒 */
    const dark = Math.random() < 0.6;
    x.fillStyle = dark ? 'rgba(70,60,45,' + (0.03 + Math.random() * 0.07).toFixed(2) + ')' : 'rgba(250,246,232,' + (0.08 + Math.random() * 0.14).toFixed(2) + ')';
    const px = Math.random() * 512, py = Math.random() * 512, s = 1 + Math.random() * 3;
    x.fillRect(px, py, s, s * (py > 400 ? 0.6 : 1));
  }
  for (let i = 0; i < 5; i++) {   /* 发丝细裂 */
    x.strokeStyle = 'rgba(80,70,55,0.16)'; x.lineWidth = 0.8; x.beginPath();
    let px = Math.random() * 512, py = Math.random() * 380; x.moveTo(px, py);
    for (let j = 0; j < 6; j++) { px += (Math.random() - 0.5) * 26; py += 14 + Math.random() * 26; x.lineTo(px, py); }
    x.stroke();
  }
  return c;
})();
const WINW_CANVAS = (function () {   /* 老窗框木纹：竖板缝+细纹+节疤+磨白 */
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#7c5c36'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) { const v = 112 + ((Math.random() * 46 - 23) | 0); x.fillStyle = 'rgba(' + v + ',' + (v * 0.78 | 0) + ',' + (v * 0.52 | 0) + ',0.15)'; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 2); }
  for (let px = 32; px < 256; px += 64) {   /* 板缝 */
    x.fillStyle = 'rgba(38,26,14,0.65)'; x.fillRect(px, 0, 2, 256);
    x.fillStyle = 'rgba(226,206,170,0.18)'; x.fillRect(px + 2, 0, 1.4, 256);
  }
  for (let i = 0; i < 5; i++) {   /* 节疤 */
    const px = Math.random() * 256, py = Math.random() * 256;
    const g = x.createRadialGradient(px, py, 1, px, py, 6 + Math.random() * 5);
    g.addColorStop(0, 'rgba(46,32,18,0.7)'); g.addColorStop(1, 'rgba(46,32,18,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, 12, 0, 7); x.fill();
  }
  x.fillStyle = 'rgba(230,212,178,0.10)'; x.fillRect(0, 0, 256, 14); x.fillRect(0, 242, 256, 14);   /* 磨白边 */
  return c;
})();
function winWoodTex(rx, ry) {
  const t = new THREE.CanvasTexture(WINW_CANVAS);
  t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  return t;
}

const M = {
  grass:    mat('#847734'),
  grassDry: mat('#7d672c'),
  dirt:     mat('#8f7038'),
  path:     mat('#9c7f4f'),
  road:     mat('#c99a52'),
  woodDark: mat('#4a3526'),
  wood:     mat('#7a5a3e'),
  doorWood: mat('#ffffff', { map: (() => {   /* v5.02 老木门：程序木纹（板缝+细纹+节疤+磨损斑块+根部水渍） */
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#6e5136'; x.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 2400; i++) { const v = 96 + (Math.random() * 44 - 22) | 0; x.fillStyle = 'rgba(' + v + ',' + (v * 0.75 | 0) + ',' + (v * 0.5 | 0) + ',0.16)'; x.fillRect(Math.random() * 256, Math.random() * 512, 2 + Math.random() * 5, 1 + Math.random() * 2); }
    const planks = [0, 64, 128, 192, 256];
    for (let p2 = 0; p2 < planks.length - 1; p2++) {
      for (let k = 0; k < 11; k++) {
        x.strokeStyle = 'rgba(' + (52 + Math.random() * 26 | 0) + ',' + (38 + Math.random() * 18 | 0) + ',24,' + (0.14 + Math.random() * 0.2).toFixed(2) + ')';
        x.lineWidth = 0.8 + Math.random() * 1.4; x.beginPath();
        let px = planks[p2] + 6 + Math.random() * 52, py = 0; x.moveTo(px, py);
        while (py < 512) { py += 14 + Math.random() * 22; px += Math.random() * 6 - 3; x.lineTo(px, py); }
        x.stroke();
      }
      if (p2 > 0) { x.fillStyle = 'rgba(30,20,12,0.55)'; x.fillRect(planks[p2] - 1.5, 0, 3, 512); x.fillStyle = 'rgba(150,118,82,0.25)'; x.fillRect(planks[p2] + 1.5, 0, 1.5, 512); }
    }
    for (let k = 0; k < 5; k++) {   /* 节疤 */
      const kx = 30 + Math.random() * 196, ky = 40 + Math.random() * 420;
      for (let r2 = 9; r2 > 1; r2 -= 2) { x.strokeStyle = 'rgba(46,32,18,' + (0.22 + (9 - r2) * 0.05) + ')'; x.lineWidth = 1.4; x.beginPath(); x.ellipse(kx, ky, r2, r2 * 1.5, 0, 0, 6.29); x.stroke(); }
    }
    for (let k = 0; k < 16; k++) {   /* 褪色磨白 */
      x.fillStyle = 'rgba(' + (178 + Math.random() * 40 | 0) + ',' + (150 + Math.random() * 30 | 0) + ',' + (110 + Math.random() * 30 | 0) + ',' + (0.05 + Math.random() * 0.09).toFixed(2) + ')';
      x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 512, 12 + Math.random() * 30, 20 + Math.random() * 60, Math.random() * 0.6, 0, 6.29); x.fill();
    }
    const gd = x.createLinearGradient(0, 0, 0, 132); gd.addColorStop(0, 'rgba(24,16,8,0.5)'); gd.addColorStop(1, 'rgba(24,16,8,0)');
    x.fillStyle = gd; x.fillRect(0, 0, 256, 132);
    for (let k = 0; k < 7; k++) {   /* 根部水渍垂流（canvas 顶=门底，UV 翻转） */
      x.fillStyle = 'rgba(30,22,10,' + (0.1 + Math.random() * 0.16).toFixed(2) + ')';
      const wx = Math.random() * 256; x.fillRect(wx, 52 + Math.random() * 60, 2 + Math.random() * 4, 60 + Math.random() * 110);
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  })(), roughness: 0.92 }),
  woodRed:  mat('#9c3b2c'),
  wall:     mat('#dcd3c0'),
  wallBase: mat('#61656b', { roughness: 0.95 }),   // 徽派石砌墙基
  tile:     mat('#4c525e'),
  roofTile: mat('#3d434f'),
  eaveDark: mat('#333945'),
  stone:    mat('#8f8a7a'),
  rock:     mat('#83715b', { flatShading: true }),
  mountain: mat('#ffffff', { flatShading: true, vertexColors: true }),
  cream:    mat('#e3cfa4'),
  trunk:    mat('#6e4f33'),
  bamboo:   mat('#7d8b52'),
  cloth:    mat('#c4a982'),
};
function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
/* 组合墙板：W×H 立面（局部 x 横向/y 竖向/z 厚度），holes=[{cx,cy,hw,hh}] 真实开洞 */
function wallPanel(w, h, t, material, holes) {
  const g = new THREE.Group();
  const hs = (holes || []).slice().sort((p, q) => (p.cx - p.hw) - (q.cx - q.hw));
  const bs = [-w / 2];
  for (const p of hs) { bs.push(p.cx - p.hw, p.cx + p.hw); }
  bs.push(w / 2);
  for (let i = 0; i < bs.length - 1; i++) {
    const x0 = bs[i], x1 = bs[i + 1];
    if (x1 - x0 < 0.005) { continue; }
    const mid = (x0 + x1) / 2;
    const hole = hs.find((p) => p.cx - p.hw < mid && p.cx + p.hw > mid);
    if (!hole) {
      const seg = box(x1 - x0, h, t, material); seg.position.set(mid, h / 2, 0); g.add(seg);
    } else {
      const lo = hole.cy - hole.hh, hi = hole.cy + hole.hh;
      if (lo > 0.012) { const dn = box(x1 - x0, lo, t, material); dn.position.set(mid, lo / 2, 0); g.add(dn); }
      if (h - hi > 0.012) { const up = box(x1 - x0, h - hi, t, material); up.position.set(mid, (h + hi) / 2, 0); g.add(up); }
    }
  }
  return g;
}
function cyl(rt, rb, h, seg, material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
/* 中式四坡屋顶 */
function roofPyramid(hx, h, hz, material) {
  const g = new THREE.CylinderGeometry(0.06, 1, h, 4);
  const m = new THREE.Mesh(g, material);
  m.rotation.y = Math.PI / 4;
  m.scale.set(hx / 0.7071, 1, hz / 0.7071);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
/* 外露椽子：檐口下一排伸出的木条 */
function rafters(parent, hx, hz, y) {
  const g = new THREE.CylinderGeometry(0.045, 0.045, 0.45, 5);
  for (const s of [-1, 1]) {
    const n = Math.max(3, Math.round(hx / 0.9));
    for (let i = 0; i < n; i++) {
      const x = -hx + 0.4 + i * (2 * hx - 0.8) / (n - 1);
      const r = new THREE.Mesh(g, M.wood);
      r.rotation.x = Math.PI / 2;
      r.position.set(x, y, s * (hz + 0.10));
      parent.add(r);
    }
    const m = Math.max(3, Math.round(hz / 0.9));
    for (let i = 0; i < m; i++) {
      const z = -hz + 0.4 + i * (2 * hz - 0.8) / (m - 1);
      const r = new THREE.Mesh(g, M.wood);
      r.rotation.z = Math.PI / 2;
      r.position.set(s * (hx + 0.10), y, z);
      parent.add(r);
    }
  }
}
/* 屋顶正脊 + 鸱尾收头（半嵌入锥顶，不悬空） */
function roofFinial(parent, hx, h, yTop) {
  const m = mat('#2f3540');
  const sink = h * 0.18;
  const len = 2 * hx * sink / h + 0.26;
  const bar = box(len, 0.22, 0.24, m);
  bar.position.y = yTop - sink;
  parent.add(bar);
  for (const s of [-1, 1]) {
    const tail = box(0.16, 0.4, 0.3, m);
    tail.position.set(s * len / 2, yTop - sink + 0.22, 0);
    parent.add(tail);
  }
}
/* 带门钉 + 门环的木板门扇 */
function plankDoor(w, h) {
  const g = new THREE.Group();
  const d = box(w, h, 0.12, M.doorWood);
  g.add(d);
  const stud = new THREE.CylinderGeometry(0.045, 0.045, 0.07, 6);
  const cols = Math.max(2, Math.round(w / 0.28));
  const rows = Math.max(3, Math.round(h / 0.42));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const s = new THREE.Mesh(stud, mat('#3a2c1c'));
      s.rotation.x = Math.PI / 2;
      s.position.set(-w / 2 + (i + 0.5) * w / cols, -h / 2 + (j + 0.6) * h / (rows + 0.6), 0.08);
      g.add(s);
    }
  }
  return g;
}
function doorRing(x, y) {
  const r = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12), mat('#7a7a72'));
  r.position.set(x, y, 0.12);
  return r;
}

/* ---------------- 沙盘底座 ---------------- */
{
  const plinth = cyl(BASE_R - 0.2, BASE_R - 1.0, 2.2, 64, M.woodDark);
  plinth.position.y = -1.1;
  scene.add(plinth);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(BASE_R, 0.32, 10, 96), M.wood);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.08;
  rim.castShadow = true;
  scene.add(rim);
  /* v5.64 自然地表：程序化秋日草甸噪波贴图（橄榄黄主调+枯黄斑+褐土斑+浅绿点缀），单张 canvas 零开销 */
  const GRASS_TEX = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const x = cv.getContext('2d');
    x.fillStyle = '#9a8a4c'; x.fillRect(0, 0, 512, 512);
    /* v5.73 用户点名"墙色"：大块柔边草绿斑块与泥土黄交融（就是那面墙的颜色分布） */
    const bigG = ['#75863f', '#66793a', '#83914b', '#5d7138'];
    for (let i = 0; i < 26; i++) {
      const px = Math.random() * 512, py = Math.random() * 512, rr = 34 + Math.random() * 64;
      const gr2 = x.createRadialGradient(px, py, rr * 0.15, px, py, rr);
      const cc = bigG[(Math.random() * bigG.length) | 0];
      gr2.addColorStop(0, cc + 'aa'); gr2.addColorStop(0.7, cc + '55'); gr2.addColorStop(1, cc + '00');
      x.globalAlpha = 1; x.fillStyle = gr2;
      x.beginPath(); x.ellipse(px, py, rr, rr * (0.6 + Math.random() * 0.6), Math.random() * 3.14, 0, 6.29); x.fill();
    }
    const dirtB = ['#a3854e', '#8f7038', '#b09a58'];
    for (let i = 0; i < 18; i++) {
      const px = Math.random() * 512, py = Math.random() * 512, rr = 26 + Math.random() * 52;
      const gr3 = x.createRadialGradient(px, py, rr * 0.2, px, py, rr);
      const cc = dirtB[(Math.random() * dirtB.length) | 0];
      gr3.addColorStop(0, cc + '99'); gr3.addColorStop(1, cc + '00');
      x.fillStyle = gr3;
      x.beginPath(); x.ellipse(px, py, rr, rr * (0.5 + Math.random() * 0.7), Math.random() * 3.14, 0, 6.29); x.fill();
    }
    const cols = ['#b3a05a', '#8a9a52', '#8a7a3c', '#7d8a44'];
    for (let i = 0; i < 500; i++) {
      x.globalAlpha = 0.10 + Math.random() * 0.20;
      x.fillStyle = cols[(Math.random() * cols.length) | 0];
      const px = Math.random() * 512, py = Math.random() * 512, r2 = 2 + Math.random() * 10;
      x.beginPath(); x.ellipse(px, py, r2, r2 * (0.5 + Math.random() * 0.8), Math.random() * 3.14, 0, 6.29); x.fill();
    }
    x.globalAlpha = 0.07; x.fillStyle = '#0e0c06';
    for (let i = 0; i < 500; i++) x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    x.globalAlpha = 1;
    const tx = new THREE.CanvasTexture(cv);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(7, 7);
    tx.anisotropy = 4;
    return tx;
  })();
  M.grass.map = GRASS_TEX; M.grass.color.set('#f2e8cf'); M.grass.needsUpdate = true;   /* 底色提亮，色相交给贴图，避免乘法压暗 */
  const gGeo2 = new THREE.CircleGeometry(BASE_R, 64);
  gGeo2.rotateX(-Math.PI / 2);
  {
    const pa = gGeo2.attributes.position, uvs = gGeo2.attributes.uv;
    for (let i = 0; i < pa.count; i++) uvs.setXY(i, (pa.getX(i) / BASE_R + 1) / 2, (pa.getZ(i) / BASE_R + 1) / 2);
  }
  const ground = new THREE.Mesh(gGeo2, M.grass);
  /* v5.73 修"巨墙"：v5.64 已在几何体内 rotateX(-90°)，此处再转一次=盘面立起成 60m 草皮墙 */
  ground.position.y = 0.02;
  ground.receiveShadow = true;
  scene.add(ground);
  const tableMat = mat('#5a4a38', { roughness: 1 });
  dayNight.tableMat = tableMat; dayNight.tableBase = new THREE.Color('#5a4a38');
  const table = new THREE.Mesh(new THREE.CircleGeometry(300, 32), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.position.y = -2.21;
  table.receiveShadow = true;
  scene.add(table);
}

window.__prof = (window.__prof || []);
window.__mark = function (nm) { window.__prof.push([nm, Math.round(performance.now())]); };
window.__mark('山体地形');
window.__bootStage = Math.max(window.__bootStage || 0, 1);
/* ---------------- 山体：长条棱线，不再是馒头 ---------------- */
const mountainCones = [
  { cx: -3,    cz: -17,   R: 12,   H: 14,   seg: 7 },
  { cx: -14,   cz: -19.5, R: 9.5,  H: 10.5, seg: 6 },
  { cx: 10.5,  cz: -13.5, R: 8,    H: 8.2,  seg: 6 },
  { cx: -20.5, cz: -13,   R: 6,    H: 5.2,  seg: 5 },
  { cx: 15.5,  cz: -6.9,  R: 6,    H: 5.6,  seg: 6 },
  /* 两面后崖：山体前压到主楼阳台一线，主楼后半深嵌山中（V1 式嵌入·加大） */
  { cx: -1.8,  cz: -10.5, R: 6.2,  H: 11.5, seg: 6 },
  { cx: 2.2,   cz: -10.8, R: 6.4,  H: 12.5, seg: 6 },
];
/* v5.05 移植 holooooo/webgl-seascape-video(江南集) 的噪声库：值噪声 FBM + 脊状（ridged）分形——
   脊状噪声 (1-|n|)² 逐倍加权迭代，天然生成山脊棱线，是那座"特别自然"的山的全部秘密 */
function nzHash2i(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function nzVnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = nzHash2i(xi, yi), b = nzHash2i(xi + 1, yi), c = nzHash2i(xi, yi + 1), d = nzHash2i(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function nzFbm(x, y, o) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < (o || 4); i++) { s += a * nzVnoise(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function nzRidged(x, y, o) {
  let s = 0, a = 0.5, f = 1, n = 0, w = 1;
  for (let i = 0; i < (o || 5); i++) {
    let v = 1 - Math.abs(nzVnoise(x * f + i * 31.7, y * f + i * 11.3));
    v *= v; v *= w; w = Math.max(0, Math.min(1, v * 1.7));
    s += v * a; n += a; a *= 0.5; f *= 2.07;
  }
  return s / n;
}
/* 山体表面色：棕岩底色，噪声场随机混入橄榄绿，山顶附近退化为裸岩 */
const MNT_BROWN = new THREE.Color('#46582e');   /* v5.09 原土黄底改深绿（带土黄调），与浅橄榄绿坡面自然衔接 */
const MNT_GREEN1 = new THREE.Color('#66793c');
const MNT_GREEN2 = new THREE.Color('#4f6330');
const MNT_ROCKC = new THREE.Color('#7c7263');
function mountainColor(x, y, z, hRef) {
  const g = Math.sin(x * 0.29 + 1.7) * Math.cos(z * 0.25 - 2.3)
    + 0.5 * Math.sin(x * 0.66 - 4.1) * Math.cos(z * 0.58 + 0.9);
  const gm = Math.max(0, Math.min(1, g / 1.5 * 0.5 + 0.5));
  let mix = gm > 0.34 ? Math.min(1, (gm - 0.34) / 0.14) : 0;
  mix *= Math.max(0, 1 - Math.max(0, y - hRef * 0.66) / (hRef * 0.3));
  const gc = Math.sin(x * 1.1 + z * 0.9) > 0 ? MNT_GREEN1 : MNT_GREEN2;
  const col = MNT_BROWN.clone().lerp(gc, mix);
  const rk = Math.sin(x * 2.2 + z * 1.7 + 3.1) * Math.cos(z * 2.6 - x * 1.2);
  if (rk > 0.55 && y > hRef * 0.42 && y < hRef * 0.82) col.lerp(MNT_ROCKC, Math.min(1, (rk - 0.55) / 0.3) * 0.85);
  return col;
}
/* 山体剖面：内 34% 半径是平顶（平顶高度=原山顶高），外坡 1.15 次幂陡落——
   平顶桌状山，没有退化尖顶，不再有破面 */
function surfaceY(c, u) {
  const u0 = 0.34;
  return c.H * (u <= u0 ? 1 : Math.pow((1 - u) / (1 - u0), 1.15));
}
/* 极坐标高度场（世界坐标烘焙）。每条射线在盘缘处截断，
   截断处垂到盘底成裙墙——没有钉扎折叠，所以不再有缺口 */
function jaggedCone(c, seedOff) {
  const CL = BASE_R - 0.03;
  const seg = Math.max(18, c.seg * 4), rings = 10, row = rings + 2;  /* v4.78 加密坡面 */
  const pos = [], vc = [], idx = [];
  for (let a = 0; a <= seg; a++) {
    const th = (a / seg) * Math.PI * 2;
    const dx = Math.cos(th), dz = Math.sin(th);
    const A = c.R * c.R;
    const B = 2 * (c.cx * dx + c.cz * dz) * c.R;
    const Cq = c.cx * c.cx + c.cz * c.cz - CL * CL;
    let uMax = 1;
    if (Cq > 0) uMax = 0;
    else if (A + B + Cq > 0) {
      const dd = B * B - 4 * A * Cq;
      uMax = Math.min(1, Math.max(0, (-B + Math.sqrt(Math.max(0, dd))) / (2 * A)));
    }
    if (uMax < 0.02) uMax = 0;
    for (let ri = 0; ri <= rings + 1; ri++) {
      let u = (ri / rings) * uMax;
      const skirt = ri > rings;
      if (skirt) u = uMax;
      const x = c.cx + dx * c.R * u, z = c.cz + dz * c.R * u;
      let y = surfaceY(c, u);
      const n = Math.sin(x * (1.7 + seedOff) + z * 2.1 + seedOff) * Math.cos(z * 1.3 - seedOff * 0.7);
      const n2 = Math.sin(x * 3.7 + z * 2.9 + seedOff * 2) * Math.cos(z * 4.1 - x * 2.3);
      if (u > 0 && u < 1) y += (n * 0.34 + n2 * 0.14) * (1 - u * 0.5);
      if (skirt) y = -0.08;
      pos.push(x, y, z);
      const col = mountainColor(x, skirt ? 0 : y, z, c.H);
      if (skirt) col.lerp(MNT_BROWN, 0.35);
      vc.push(col.r, col.g, col.b);
    }
  }
  for (let a = 0; a < seg; a++) for (let ri = 0; ri < row - 1; ri++) {
    const p0 = a * row + ri, p1 = p0 + 1, p2 = p0 + row, p3 = p2 + 1;
    idx.push(p0, p2, p1, p1, p2, p3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, M.mountain);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
mountainCones.forEach((c, i) => scene.add(jaggedCone(c, i * 1.7 + 0.6)));
/* v4.78 山坡裸岩实体：十二面体噪声石块（Math.random 不占 rand 序列） */
{
  const rockMatM = mat('#86795f', { roughness: 1 });
  window.__mtnRockMat = rockMatM;
  const geos = [];
  for (let k = 0; k < 4; k++) {
    const g0 = new THREE.DodecahedronGeometry(1, 0);
    const pa = g0.attributes.position;
    for (let i2 = 0; i2 < pa.count; i2++) {
      const sc = 0.82 + Math.random() * 0.36;
      pa.setXYZ(i2, pa.getX(i2) * sc, pa.getY(i2) * sc * 0.75, pa.getZ(i2) * sc);
    }
    g0.computeVertexNormals(); geos.push(g0);
  }
  for (const c of mountainCones) {
    const nr = Math.max(9, Math.round(c.R * 1.2));
    for (let i = 0; i < nr; i++) {
      const a2 = Math.random() * Math.PI * 2;
      const u = 0.18 + Math.random() * 0.66;
      const x = c.cx + Math.cos(a2) * u * c.R, z = c.cz + Math.sin(a2) * u * c.R;
      if (Math.hypot(x, z) > BASE_R - 0.9) continue;
      const y = surfaceY(c, u);
      if (y < 0.3) continue;
      if (x > -5.2 && x < 5.2 && z > -12.8 && z < -3.0) continue;   /* v615 主楼开挖区不摆山石（石头悬在梯厅头顶=巨大石头） */
      const rm = new THREE.Mesh(geos[Math.floor(Math.random() * 4)], rockMatM);
      const sc = 0.42 + Math.random() * 1.0;
      rm.scale.set(sc, sc * (0.5 + Math.random() * 0.45), sc);
      rm.position.set(x, y - sc * 0.16, z);
      rm.rotation.set(Math.random() * 0.5, Math.random() * 6.3, Math.random() * 0.5);
      rm.castShadow = true; rm.receiveShadow = true;
      scene.add(rm);
    }
  }
}
/* 山脊连接体（把峰连成山脊线） */
/* 山脊连接体：世界坐标烘焙 + 盘缘截断 + 同款表面色 */
function ridgeLink(x1, z1, x2, z2, thick, hgt) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const g = new THREE.BoxGeometry(thick, hgt, len, 8, 2, 14);
  const pos = g.attributes.position;
  const th = Math.atan2(x2 - x1, z2 - z1);
  const ca = Math.cos(th), sa = Math.sin(th);
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  const CL = BASE_R - 0.03;
  const vc = [];
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i) + rr(-0.5, 0.5);
    const ly = pos.getY(i) + rr(-0.4, 0.4);
    const lz = pos.getZ(i) + rr(-0.5, 0.5);
    let wx = lx * ca + lz * sa + mx;
    let wz = -lx * sa + lz * ca + mz;
    const r = Math.hypot(wx, wz);
    if (r > CL) { wx *= CL / r; wz *= CL / r; }
    const wy = ly + hgt * 0.42;
    pos.setXYZ(i, wx, wy, wz);
    const col = mountainColor(wx, wy, wz, hgt * 1.2);
    vc.push(col.r, col.g, col.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, M.mountain);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
scene.add(ridgeLink(-3, -17, -14, -19.5, 6, 7.6));
scene.add(ridgeLink(-3, -17, 10.5, -13.5, 5, 6.4));
scene.add(ridgeLink(-14, -19.5, -20.5, -13, 4.5, 4.4));
scene.add(ridgeLink(2.2, -10.8, 10.5, -13.5, 4.5, 6.2));
scene.add(ridgeLink(-1.8, -10.5, -14, -19.5, 4.5, 7.2));
/* v4.98 主楼地盘开挖：山体 cone 南趾整体压在主楼上（开正门见山壁）。凡落入主楼地盘矩形 x±4.15 z-9.35..-3.75 的
   山面顶点整排压到地下 -7，形成人工开挖断面；地磅内裸岩实体没收 */
{
  const RX0 = -4.15, RX1 = 4.15, RZ0 = -9.35, RZ1 = -3.75;
  const inFoot = (x, z) => x > RX0 && x < RX1 && z > RZ0 && z < RZ1;
  const wv = new THREE.Vector3();
  scene.traverse(function (o) {
    if (!o.isMesh || !o.geometry.attributes.color) return;   /* v5.27 放宽：克隆材质的第二层山体(背景锥)以前逃过所有开挖/上色 */
    if (o.material !== M.mountain && !(o.material.vertexColors && o.parent === scene && new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length() > 6)) return;
    const pa = o.geometry.attributes.position;
    let dirty = false;
    for (let i2 = 0; i2 < pa.count; i2++) {
      wv.set(pa.getX(i2), pa.getY(i2), pa.getZ(i2));
      o.localToWorld(wv);
      if (inFoot(wv.x, wv.z) && wv.y < 13.2) { pa.setY(i2, pa.getY(i2) - (wv.y + 7)); dirty = true; }   /* v5.14 帽 10.5→13.2：主锥顶柱(2.2,11.4,-8.2)漏挖成屋脊后灰柱墙，一并压坑 */
    }
    if (dirty) { pa.needsUpdate = true; o.geometry.computeVertexNormals(); }
  });
  for (const o of scene.children.slice()) {
    if (o.isMesh && o.material === window.__mtnRockMat) {
      const p = o.getWorldPosition(wv);
      if (inFoot(p.x, p.z)) o.visible = false;
    }
  }
}

/* ---------------- 河流 + 溪流 + 桥 + 码头 ---------------- */
const riverCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-29.7, 0, 13.4),
  new THREE.Vector3(-26, 0, 14.8),
  new THREE.Vector3(-16, 0, 17.8),
  new THREE.Vector3(-8, 0, 20.2),
  new THREE.Vector3(0, 0, 19.9),
  new THREE.Vector3(9, 0, 20.4),
  new THREE.Vector3(18, 0, 17.8),
  new THREE.Vector3(26, 0, 15.0),
  new THREE.Vector3(29.7, 0, 13.5),
]);
var __flySet;
const streamCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-16, 0, -8.5),
  new THREE.Vector3(-19.5, 0, -2.5),
  new THREE.Vector3(-19, 0, 4.5),
  new THREE.Vector3(-16.9, 0, 14.6),
]);
function ribbonGeo(curve, width, segs) {
  const pts = curve.getSpacedPoints(segs);
  const CL = BASE_R - 0.06;
  const pin = (x, z) => {
    const r = Math.hypot(x, z);
    return r <= CL ? [x, z] : [x * CL / r, z * CL / r];
  };
  const p = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const q = pts[i];
    const t = curve.getTangentAt(Math.min(i / segs, 1));
    let nx = t.z, nz = -t.x;
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const hx = nx * width / 2, hz = nz * width / 2;
    const A = pin(q.x - hx, q.z - hz), B = pin(q.x + hx, q.z + hz);
    p.push(A[0], 0, A[1], B[0], 0, B[1]);
    uv.push(0, i / segs * 8, 1, i / segs * 8);
    if (i < segs) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }   /* 卷面朝上（曾背向被剔除，路面全系隐身） */
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal.array;
  if (n[1] < 0) for (let i = 1; i < n.length; i += 3) n[i] = -n[i];
  return g;
}
function waterTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#3e7a92'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    x.strokeStyle = `rgba(190,225,235,${rr(0.05, 0.22)})`;
    x.lineWidth = rr(1, 2.5);
    x.beginPath();
    const y0 = rand() * 256;
    x.moveTo(0, y0);
    for (let px = 0; px <= 256; px += 32) x.lineTo(px, y0 + Math.sin(px * 0.09 + i) * 5);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.encoding = THREE.sRGBEncoding;
  return t;
}
function waveNormalTexture(seed) {
  /* 可平铺多正弦叠加高度场 → 法线贴图：整数频率保证接缝无缝，多频干涉 = 自然波光 */
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  let s0 = (seed + 3) * 1103515245 + 12345;
  const R = () => { s0 = (s0 * 1103515245 + 12345) & 0x7fffffff; return s0 / 0x7fffffff; };
  const w = [];
  for (let i = 0; i < 7; i++) {
    const fx = 1 + Math.floor(R() * 7), fy = 1 + Math.floor(R() * 7);
    w.push([fx, fy, R() * 6.28, (0.5 + R() * 0.5) * 8 / (fx + fy)]);
  }
  const hAt = (x, y) => {
    let h = 0;
    for (let j = 0; j < w.length; j++) h += Math.sin((x / S) * w[j][0] * 6.2832 + (y / S) * w[j][1] * 6.2832 + w[j][2]) * w[j][3];
    return h;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = hAt(x + 1.5, y) - hAt(x - 1.5, y), dy = hAt(x, y + 1.5) - hAt(x, y - 1.5);
    const nx = -dx, ny = -dy, l = Math.hypot(nx, ny, 1), i = (y * S + x) * 4;
    img.data[i]     = (nx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (1  / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function pebbleTexture() {
  /* 沙砾河床：透明浅水要透出河床才有清澈见底的层次 */
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#8d8168'; x.fillRect(0, 0, 256, 256);   /* 暖沙底色（旧蓝灰在露滩时像脏水） */
  for (let i = 0; i < 850; i++) {
    const v = 112 + (Math.random() * 80 | 0);
    x.fillStyle = `rgba(${v},${v - 2},${v - 14},0.5)`;
    const r = 1 + Math.random() * 3.2;
    x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, r, r * 0.66, Math.random() * 3.1, 0, 6.3); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  return t;
}
const bedTex = pebbleTexture();
/* 水下河床不参与暖金直射光：固定为冷青暗石，卵石纹理交给贴图；焦散另做受光动画。 */
const bedMat = new THREE.MeshStandardMaterial({ color: '#847734', roughness: 1 });   /* 无贴图纯草色：与岸完全同色同受光，绿岸直连水面 */
const riverBank = new THREE.Mesh(ribbonGeo(riverCurve, 9.0, 80), bedMat);
riverBank.position.y = 0.04; riverBank.receiveShadow = true; scene.add(riverBank);

/* ---- 着色器水面：学习自 holooooo/webgl-seascape-video ----
   8 octave 方向波：黄金角展开 + 深水频散 sqrt(9.81f) + exp(sin-1) 尖峰，
   片元中心差分法线（无贴图接缝）、Beer-Lambert 吸收(近岸浅蓝→中泓青绿)、
   波峰透射微光、岸边噪声泡沫。菲涅尔/反射走 Three 标准管线(已有 env)。 */
const WATER_REFLECT = 0.45;   /* 实验结论：反射非黄色主因（0 时仍黄），恢复 0.45 */
const waterU = {
  uTime:   { value: 0 },
  uAmp:    { value: 1 },      /* 雷雨放大 chop */
  uFoam:   { value: 0.04 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunInt: { value: 1.35 },
};
const REFLU = { uReflMap: { value: null }, uReflRes: { value: new THREE.Vector2(1, 1) }, uReflStr: { value: 0 } };
const WATER_OBJS = [];
function tuneWater(mat, pondFlag) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, waterU, REFLU);
    sh.uniforms.uPond = { value: pondFlag };
    sh.uniforms.uAlpha = { value: mat.userData.o0 };   /* 基准不透明度，雷雨经 shader 调制 */
    sh.vertexShader = 'varying vec2 vWUv; varying vec3 vWPos;\n' + sh.vertexShader.replace(
      '#include <fog_vertex>',
      '#include <fog_vertex>\nvWUv = uv;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `
varying vec2 vWUv;
varying vec3 vWPos;
uniform float uTime, uAmp, uFoam, uSunInt, uPond, uAlpha;
uniform sampler2D uReflMap;
uniform vec2 uReflRes;
uniform float uReflStr;
uniform vec3 uSunDir;
float wHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float wNoise(vec2 x){ vec2 i=floor(x), f=fract(x); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(wHash(i), wHash(i+vec2(1,0)), u.x), mix(wHash(i+vec2(0,1)), wHash(i+vec2(1,1)), u.x), u.y); }
float wavesGL(vec2 p){                       /* 黄金角多向波，频散推进，尖峰缓谷 */
  float h = 0.0, amp = 1.0, freq = 0.55, sum = 0.0, ang = 0.6;
  for (int i = 0; i < 8; i++) {
    vec2 dir = vec2(cos(ang), sin(ang));
    float ph = dot(dir, p) * freq + uTime * sqrt(9.81 * freq) * 0.30;
    h += amp * exp(sin(ph) - 1.0);
    sum += amp; amp *= 0.78; freq *= 1.26; ang += 2.39996;
  }
  return h / sum;
}
` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
{   /* 吸收近似：近岸暖浅、中泓青绿（河 u 向宽度 / 塘 r 向半径） */
  float dd = uPond > 0.5 ? length(vWUv - 0.5) * 2.0 : abs(vWUv.x * 2.0 - 1.0);
  float dF = 1.0 - smoothstep(0.25, 0.95, dd);
  diffuseColor.rgb *= mix(vec3(0.82, 0.94, 1.06), vec3(0.42, 0.78, 1.30), dF);
}`)
      .replace('#include <normal_fragment_maps>', `{   /* 解析波法线（中心差分），世界→视图 */
  vec2 wp = vWPos.xz;
  float e = 0.18;
  float h0 = wavesGL(wp), hx = wavesGL(wp + vec2(e, 0.0)), hz = wavesGL(wp + vec2(0.0, e));
  float A = uAmp * 6.5;
  vec3 wN = normalize(vec3(-(hx - h0) * A / e, 1.0, -(hz - h0) * A / e));
  normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
}`)
      .replace('#include <output_fragment>', `#include <output_fragment>
{   /* 波峰透射微光 + 岸边/雷雨泡沫 */
  vec2 wp = vWPos.xz;
  float crest = wavesGL(wp);
  float dd = uPond > 0.5 ? length(vWUv - 0.5) * 2.0 : abs(vWUv.x * 2.0 - 1.0);
  float dF = 1.0 - smoothstep(0.25, 0.95, dd);
  vec3 vdir = normalize(vWPos - cameraPosition);
  float sss = pow(max(crest, 0.0), 3.0) * max(dot(vdir, uSunDir) + 0.4, 0.0) * min(uSunInt, 1.4);
  gl_FragColor.rgb += vec3(0.0, 0.30, 0.26) * sss * 0.18;
  float fn = wNoise(wp * 1.1 + uTime * 0.15) * 0.6 + wNoise(wp * 2.9 - uTime * 0.22) * 0.4;
  float foam = (1.0 - dF) * 0.14 * smoothstep(0.55, 0.88, fn)
             + crest * crest * 0.03
             + uFoam * (0.20 + 0.5 * crest) * smoothstep(0.30, 0.70, fn);
  foam = clamp(foam, 0.0, 1.0) * (0.20 + 0.80 * min(uSunInt, 1.0));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.90, 0.94, 0.95), foam * 0.5);
  /* 标准 BRDF 会把暖金直射光原样染进水面高光。仅压黄偏，保留波光亮度，
     把黄光高光替换成冷青天空色，避免影响泡沫和蓝绿色水体自身的色相。 */
  vec3 wc = max(gl_FragColor.rgb, vec3(0.0));
  float yellowBias = clamp((wc.r - wc.b) * 1.30 + (wc.g - wc.b) * 0.35, 0.0, 1.0);
  vec3 coolGlint = vec3(0.40, 0.90, 1.18) * dot(wc, vec3(0.2126, 0.7152, 0.0722));
  wc = mix(wc, coolGlint, yellowBias * 0.78);
  wc = mix(wc, vec3(0.30, 0.76, 1.04) * dot(wc, vec3(0.2126, 0.7152, 0.0722)), 0.24);
  wc += vec3(0.0015, 0.0060, 0.0120);
  gl_FragColor.rgb = wc;
  /* 菲涅尔透明度：俯视保留约四成水色、清楚看见卵石+焦散，掠射角转镜面 */
  float fres = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0);
  gl_FragColor.a = clamp(uAlpha * (0.53 + 0.97 * fres), 0.04, 1.0);
  if (uReflStr > 0.001) {   /* 屏幕空间镜像倒影：波纹扰动 + 菲涅尔混合 */
    vec2 suv = gl_FragCoord.xy / uReflRes;
    float rgx = wavesGL(wp + vec2(0.7, 0.0)) - crest;
    float rgz = wavesGL(wp + vec2(0.0, 0.7)) - crest;
    suv += vec2(rgx, rgz) * 0.10;
    vec3 reflc = texture2D(uReflMap, clamp(suv, vec2(0.0015), vec2(0.9985))).rgb;   /* RT 线性色空间：直接混合，别再做 sRGB 解码 */
    float fr2 = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 1.45);
    float shoreM = 0.22 + 0.78 * smoothstep(0.04, 0.86, dd);   /* 倒影收在近岸带，中泓轻微 */
    float rm = clamp((0.14 + 0.86 * fr2) * uReflStr * shoreM * (1.0 - 0.55 * uPond), 0.0, 0.55);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, reflc, rm);
    gl_FragColor.a = clamp(gl_FragColor.a + rm * 0.55, 0.04, 1.0);
  }
}`);
    mat.userData.shader = sh;
  };
}
const waterMat = new THREE.MeshStandardMaterial({
  color: '#4fb9c2', transparent: true, opacity: 0.84,
  roughness: 0.11, metalness: 0.0, side: THREE.DoubleSide,
});
waterMat.userData = { r0: 0.11, o0: 0.84 };
tuneWater(waterMat, 0);
const river = new THREE.Mesh(ribbonGeo(riverCurve, 7.6, 80), waterMat);
river.position.y = 0.14; scene.add(river); WATER_OBJS.push(river);
dayNight.water = waterMat;

const streamBank = new THREE.Mesh(ribbonGeo(streamCurve, 1.9, 40), bedMat);
streamBank.position.y = 0.04; streamBank.receiveShadow = true; scene.add(streamBank);
const stream = new THREE.Mesh(ribbonGeo(streamCurve, 1.15, 40), waterMat);
stream.position.y = 0.13; scene.add(stream); WATER_OBJS.push(stream);

/* ---- 焦散（Blender 烘：折射透镜射线沉积，见 tools/blender_mk_caustics.py）----
   床底上方加法叠加面，双层不同 cell 尺寸/流速漂移；强度随日光与浑浊度每帧绝对写 */
const causticMats = [], causticMeshes = [];
/* WebGL2 拒绝 tainted 本地图：file:// 下必须走 base64 data URI（script 注入，不受 fetch CORS 限） */
let _caustQ = null;
function caustReady(fn) {
  if (location.protocol !== 'file:') return fn('assets/caustics.png');
  if (window.__CAUST_B64) return fn('data:image/png;base64,' + window.__CAUST_B64);
  if (_caustQ) return _caustQ.push(fn);
  _caustQ = [fn];
  const sc = document.createElement('script');
  sc.src = 'assets/caustics.b64.js';
  sc.onload = () => { const u = 'data:image/png;base64,' + window.__CAUST_B64; _caustQ.forEach(f => f(u)); _caustQ = null; };
  sc.onerror = () => { _caustQ.forEach(f => f(null)); _caustQ = null; };
  document.head.appendChild(sc);
}
function addCaustics(geo, repX, repY, o0, flow) {
  const me = new THREE.Mesh(geo, null);
  me.visible = false; scene.add(me);                       /* 贴图没到位前不画，防闪白 */
  const cimg = new Image();
  const tex = new THREE.Texture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.encoding = THREE.sRGBEncoding;
  tex.repeat.set(repX, repY);
  caustReady(src => { if (!src) return;
    cimg.onload = () => cimg.decode().then(() => { tex.image = cimg; tex.needsUpdate = true; me.visible = true; });
    cimg.src = src; });
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, color: '#d6f0f2' });
  m.userData = { o0, flow, tex };
  me.material = m;
  causticMats.push(m); causticMeshes.push(me);
  return me;
}
{ const c1 = addCaustics(ribbonGeo(riverCurve, 6.9, 80), 2.4, 2.5, 0.22, 0.16); c1.position.y = 0.05; const _c2h = null;
  const c2 = addCaustics(ribbonGeo(riverCurve, 6.9, 80), 3.6, 3.75, 0.13, 0.10); c2.position.y = 0.048;
  const s1 = addCaustics(ribbonGeo(streamCurve, 1.5, 40), 0.55, 1.1, 0.13, 0.14); s1.position.y = 0.05;
  const s2 = addCaustics(ribbonGeo(streamCurve, 1.5, 40), 0.9, 1.8, 0.08, 0.09); s2.position.y = 0.048; WATER_OBJS.push(c1, c2, s1, s2); }

/* 雨中河面涟漪：双层环形圈贴图带，反向滚动+闪烁，雨强控透明度 */
const RIP_RINGS = (n, rmin, rmax) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  for (let i = 0; i < n; i++) {
    x.strokeStyle = 'rgba(225,242,250,' + (0.25 + Math.random() * 0.5) + ')';
    x.lineWidth = 1.4 + Math.random() * 1.6;
    x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, rmin + Math.random() * (rmax - rmin), 0, Math.PI * 2); x.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6.5);
  return t;
};
const rippleMatA = new THREE.MeshBasicMaterial({ map: RIP_RINGS(16, 2.5, 6), color: '#bfe0ee', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
const rippleMatB = new THREE.MeshBasicMaterial({ map: RIP_RINGS(11, 3.5, 8), color: '#a8cfde', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
const rippleA = new THREE.Mesh(ribbonGeo(riverCurve, 7.2, 80), rippleMatA);
const rippleB = new THREE.Mesh(ribbonGeo(riverCurve, 7.2, 80), rippleMatB);
rippleA.position.y = rippleB.position.y = 0.155;
rippleA.visible = false; rippleB.visible = false;
scene.add(rippleA, rippleB);

/* 小溪穿路涵桥 v4.62：改拱式木桥+栏杆，见 roadLen 后 STREAM_BRIDGE 段 */

/* 桥与火把灯 v4.60 已拆除待重做（BRIDGE_Z 与空登记数组保留，加载链自动空转） */
const BRIDGE_Z = 18.6;
const railingSlots = [];
const torchFires = [];
/* 码头平台 v4.60 已拆除待重做；河堤/鱼篓/晾衣杆/小船保留 */
{

  /* 河堤：打木桩 + 挡板（码头一带北岸，路边临水） */
  for (let i = 0; i < 9; i++) {
    const x = -8.6 + i * 0.75;
    const st = cyl(0.09, 0.11, 0.75, 5, M.wood);
    st.position.set(x, 0.32, 16.6 + 0.22 * Math.sin(i * 1.3));
    st.rotation.z = rr(-0.07, 0.07);
    scene.add(st);
    if (i < 8) {
      const plank = box(0.78, 0.34, 0.07, M.wood);
      plank.position.set(x + 0.375, 0.45, 16.62 + 0.22 * Math.sin((i + 0.5) * 1.3));
      plank.rotation.y = rr(-0.06, 0.06);
      scene.add(plank);
    }
  }
  /* 鱼篓 ×2（水线边） */
  for (const [fx, fz, s] of [[-6.7, 16.0, 1], [-6.0, 16.4, 0.75]]) {
    const bask = cyl(0.22 * s, 0.3 * s, 0.5 * s, 8, mat('#a8905a'));
    bask.position.set(fx, 0.25 * s, fz);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.24 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat('#96804c'));
    lid.position.set(fx, 0.5 * s, fz);
    scene.add(bask, lid);
  }
  /* 晾衣杆：两杆 + 绳 + 两块布（前院东南角） */
  for (const cx of [-7.4, -4.6]) {
    const pole = cyl(0.06, 0.07, 1.7, 6, M.wood);
    pole.position.set(cx, 0.85, 8.3);
    scene.add(pole);
  }
  const rope = cyl(0.015, 0.015, 2.8, 4, mat('#d8cfc0'));
  rope.rotation.z = Math.PI / 2;
  rope.position.set(-6, 1.62, 8.3);
  scene.add(rope);
  for (const [cx, w, h, col] of [[-6.8, 0.7, 0.85, M.cloth], [-5.4, 0.55, 0.6, mat('#8f9a8e')]]) {
    const cloth = box(w, h, 0.03, col);
    cloth.position.set(cx, 1.62 - h / 2 - 0.03, 8.3);
    cloth.rotation.x = 0.06;
    scene.add(cloth);
  }
  /* 小船：拴在码头 */
  const boat = new THREE.Group();
  const hull = cyl(0.5, 0.32, 2.8, 6, M.wood);
  hull.rotation.z = Math.PI / 2; hull.scale.y = 0.55;
  hull.position.y = 0.25;
  boat.add(hull);
  const deckB = box(2.0, 0.08, 0.7, mat('#8a6a48'));
  deckB.position.y = 0.5;
  boat.add(deckB);
  const oar = box(0.08, 0.06, 1.3, M.wood);
  oar.position.set(0.5, 0.58, 0.55); oar.rotation.y = 0.5;
  boat.add(oar);
  window.__smBoat = boat;   /* v4.94 鹈鹕可登船 */
  boat.position.set(9.55, 0.1, 22.35);   /* v4.80 系于横码头东端 */
  boat.rotation.y = 1.2;
  scene.add(boat);
}

/* ---------------- v4.80 江南单孔石拱桥 v2（白石大理石、连续勾栏、实体行人台阶） ---------------- */
const rzAtG = (x0) => { let best = 0, bd = 1e9; for (let i2 = 0; i2 <= 240; i2++) { const q = riverCurve.getPointAt(i2 / 240); const d = Math.abs(q.x - x0); if (d < bd) { bd = d; best = q.z; } } return best; };
{
  const zcB = rzAtG(0);
  const halfD = 5.35, zN1 = zcB - halfD, zS1 = zcB + halfD;
  const RISE = 2.9;
  const arch = z => 0.12 + RISE * (1 - Math.pow((z - zcB) / halfD, 2));
  const st1 = mat('#e6e3db', { roughness: 0.5 }), st2 = mat('#d9d5ca', { roughness: 0.55 }), st3 = mat('#c8c4b8', { roughness: 0.6 });
  const st4 = mat('#93968f', { roughness: 0.85 });   /* 水泥灰：栏板 */
  {   /* v5.21 用户令大桥作旧：风化 canvas（雨渍竖流 + 苔斑 + 脏斑 + 边角磨白）共享贴图 */
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const xc = cv.getContext('2d');
    xc.fillStyle = '#cfc9bc'; xc.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 190; i++) {   /* 脏斑 */
      const bx = Math.random() * 256, by = Math.random() * 256, bw = 3 + Math.random() * 16;
      xc.fillStyle = 'rgba(' + (96 + Math.random() * 54 | 0) + ',' + (88 + Math.random() * 48 | 0) + ',' + (70 + Math.random() * 40 | 0) + ',' + (0.05 + Math.random() * 0.16).toFixed(2) + ')';
      xc.beginPath(); xc.ellipse(bx, by, bw, bw * (0.4 + Math.random()), Math.random() * 3, 0, 6.29); xc.fill();
    }
    for (let i = 0; i < 26; i++) {    /* 雨渍竖流 */
      const bx = Math.random() * 256; xc.strokeStyle = 'rgba(' + (66 + Math.random() * 34 | 0) + ',62,54,' + (0.08 + Math.random() * 0.14).toFixed(2) + ')';
      xc.lineWidth = 1.5 + Math.random() * 4; xc.beginPath(); xc.moveTo(bx, Math.random() * 90);
      let px2 = bx; for (let yy = 0; yy < 5; yy++) { px2 += (Math.random() - 0.5) * 14; xc.lineTo(px2, 40 + yy * 52 + Math.random() * 18); } xc.stroke();
    }
    for (let i = 0; i < 90; i++) {    /* 苔斑（北背阴偏多由 uv 摊平将就） */
      const bx = Math.random() * 256, by = Math.random() * 256;
      xc.fillStyle = 'rgba(' + (72 + Math.random() * 36 | 0) + ',' + (94 + Math.random() * 40 | 0) + ',' + (56 + Math.random() * 26 | 0) + ',' + (0.10 + Math.random() * 0.22).toFixed(2) + ')';
      xc.beginPath(); xc.arc(bx, by, 2 + Math.random() * 7, 0, 6.29); xc.fill();
    }
    const ageT = new THREE.CanvasTexture(cv);
    ageT.wrapS = ageT.wrapT = THREE.RepeatWrapping; ageT.repeat.set(2, 2);
    ageT.anisotropy = 4;
    for (const stm of [st1, st2, st3, st4]) { stm.map = ageT; stm.needsUpdate = true; }
    st1.color.multiplyScalar(0.90); st2.color.multiplyScalar(0.88); st3.color.multiplyScalar(0.86); st4.color.multiplyScalar(0.9);
  }
  const cR = 4.3, soffit = 2.44;
  const vaultR = (cR * cR + soffit * soffit) / (2 * soffit);
  const arcA = 2 * Math.asin(Math.min(1, cR / vaultR));
  const vaultY = z => { const dz = Math.abs(z - zcB); if (dz > cR - 0.02) return -1; return (soffit - vaultR) + Math.sqrt(vaultR * vaultR - dz * dz); };
  window.__BR = { zc: zcB, zN: zN1, zS: zS1, arch };
  for (const rx of [-0.5, 0.5]) {
    const vg = new THREE.TorusGeometry(vaultR, 0.17, 8, 30, arcA);
    vg.rotateZ(Math.PI / 2 - arcA / 2); vg.rotateY(Math.PI / 2);
    const vm = new THREE.Mesh(vg, st1); vm.position.set(rx, soffit - vaultR, zcB); vm.castShadow = true; scene.add(vm);
  }
  for (let k = 0; k < 9; k++) {
    const th = -arcA / 2 + (k + 0.5) * arcA / 9;
    const rr2 = vaultR + 0.16;
    const kb = box(1.16, 0.1, 0.34, st2);
    kb.position.set(0, (soffit - vaultR) + Math.cos(th) * rr2, zcB + Math.sin(th) * rr2);
    kb.rotation.x = th + Math.PI / 2; kb.castShadow = true; scene.add(kb);
  }
  { const ks = box(1.24, 0.34, 0.5, st1); ks.position.set(0, soffit + 0.16, zcB); ks.castShadow = true; scene.add(ks);
    const kr = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 14), st3); kr.position.set(0, soffit + 0.16, zcB); kr.rotation.y = Math.PI / 2; scene.add(kr); }
  for (const sx of [-0.98, 0.98]) {
    const segW = 30, zl = zN1 + 0.12, zr = zS1 - 0.12, step = (zr - zl) / segW;
    for (let i = 0; i < segW; i++) {
      const z0 = zl + (i + 0.5) * step;
      const yTop = arch(z0) - 0.22, yBot = Math.max(vaultY(z0), 0.0);
      if (yTop <= yBot) continue;
      const w = box(0.34, yTop - yBot, step + 0.012, st2);
      w.position.set(sx, (yTop + yBot) / 2, z0); w.castShadow = true; scene.add(w);
      const cop = box(0.42, 0.06, step + 0.03, st1); cop.position.set(sx, yTop + 0.03, z0); scene.add(cop);
    }
    for (const hz of [zcB - 1.9, zcB + 1.9]) {
      const dp = cyl(0.07, 0.07, 0.5, 6, st3); dp.rotation.z = Math.PI / 2; dp.position.set(sx, arch(hz) - 0.62, hz); scene.add(dp);
    }
  }
  const zD0 = zcB - 3.2, zD1 = zcB + 3.2, Nd = 17;          /* 中段缓坡桥面薄板 */
  for (let i = 0; i < Nd; i++) {
    const z0 = zD0 + (i + 0.5) * (6.4 / Nd);
    const dydz = -2 * RISE * (z0 - zcB) / (halfD * halfD);
    const d = box(2.02, 0.28, 6.4 / Nd - 0.018, (i % 2 ? st1 : st2));
    d.position.set(0, arch(z0) - 0.14, z0); d.rotation.x = -Math.atan(dydz);
    d.castShadow = true; d.receiveShadow = true; scene.add(d);
  }
  { const rs = box(2.1, 0.06, 0.46, st1); rs.position.set(0, arch(zcB) + 0.02, zcB); scene.add(rs); }
  for (const dir of [-1, 1]) {                              /* 两端石阶：踏步顶沿拱曲线取高，栏杆顺势落地 */
    for (let k = 0; k < 7; k++) {
      const zK = (dir > 0 ? zD1 : zD0) + dir * (k + 0.5) * 0.26;
      const yt = Math.max(arch(zK) + 0.03, 0.07);
      const stp = box(1.95, yt, 0.26, k % 2 ? st2 : st3);
      stp.position.set(0, yt / 2, zK);
      stp.castShadow = true; stp.receiveShadow = true; scene.add(stp);
    }
    for (let k = 0; k < 2; k++) {
      const ab = box(2.6, 0.18, 0.44, st2); ab.position.set(0, 0.09 + k * 0.18, (dir > 0 ? zS1 : zN1) + dir * 0.36); ab.receiveShadow = true; scene.add(ab);
    }
    for (const s2 of [-1, 1]) {
      const wing = box(0.28, 0.5, 1.1, st2);
      wing.position.set(s2 * 1.38, 0.25, (dir > 0 ? zS1 : zN1) + dir * 0.55); wing.rotation.y = s2 * dir * 0.55; wing.castShadow = true; scene.add(wing);
    }
  }
  for (const sx of [-0.95, 0.95]) {                         /* 连续勾栏：寻杖+中梃随坡、望柱 4 格一尊 */
    const Np = 30, zl = zN1 + 0.15, zr = zS1 - 0.15, dd = (zr - zl) / Np;
    for (let i = 0; i < Np; i++) {
      const zm = zl + (i + 0.5) * dd;
      const yM = arch(zm);
      const sl = Math.atan(2 * RISE * (zm - zcB) / (halfD * halfD));
      const rail = box(0.06, 0.055, dd + 0.015, st1); rail.position.set(sx, yM + 0.32, zm); rail.rotation.x = sl; scene.add(rail);
      const low = box(0.04, 0.04, dd + 0.015, st4); low.position.set(sx, yM + 0.16, zm); low.rotation.x = sl; scene.add(low);
      const pane = box(0.03, 0.24, dd * 0.965, st4); pane.position.set(sx, yM + 0.17, zm); pane.rotation.x = sl; scene.add(pane);   /* v5.21 栏板连通：0.72→0.965 */
    }
    for (let i = 0; i <= Np; i += 2) {   /* v5.21 望柱加密：4 格一尊→2 格一尊（原 1.55m 间距被用户点名稀疏） */
      const zp = zl + i * dd; const yP = arch(zp);
      const post = box(0.085, 0.48, 0.085, st1); post.position.set(sx, yP + 0.26, zp); post.castShadow = true; scene.add(post);
      const cap = box(0.12, 0.05, 0.12, st3); cap.position.set(sx, yP + 0.52, zp); scene.add(cap);
      if (i === 0 || i >= Np - 1) { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), st1); ball.position.set(sx, yP + 0.6, zp); scene.add(ball); }
    }
  }
  const apn = box(2.4, 0.06, 4.2, mat('#b59a6d', { roughness: 1 })); apn.position.set(0, 0.05, zN1 - 2.3); apn.receiveShadow = true; scene.add(apn);
}
/* ---------------- v4.80 码头重做 v2：沿南岸横置木栈桥 + 浮桥接岸 + 灯杆 ---------------- */
{
  const dz0 = rzAtG(6.5);
  const wd = M.wood;
  const zDk = dz0 + 3.0;                       /* 走道轴线贴水（南岸水线 dz0+4.5 以北 1.5m） */
  window.__dock = { x: 6.05, z: zDk - 0.75 };   /* 泊位对齐浮桥口 */
  const deckP = box(5.2, 0.09, 1.15, wd); deckP.position.set(6.5, 0.55, zDk); deckP.castShadow = deckP.receiveShadow = true; scene.add(deckP);
  for (let i = 0; i < 5; i++) {
    const bx4 = 4.1 + i * 1.2;
    const bm2 = box(0.14, 1.24, 0.07, wd); bm2.rotation.x = Math.PI / 2; bm2.position.set(bx4, 0.47, zDk); scene.add(bm2);
    for (const sz of [-0.4, 0.4]) {
      const pile = cyl(0.06, 0.08, 1.4, 6, wd); pile.position.set(bx4, -0.05, zDk + sz); pile.castShadow = true; scene.add(pile);
    }
  }
  for (const bxp of [4.0, 6.5, 9.0]) {
    const bitt = cyl(0.09, 0.11, 0.46, 8, wd); bitt.position.set(bxp, 0.82, zDk - 0.42); bitt.castShadow = true; scene.add(bitt);
    const bc = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 6), wd); bc.position.set(bxp, 1.06, zDk - 0.42); scene.add(bc);
  }
  {                                            /* 小浮桥：两道 pontoon 板接南岸 */
    const f1 = box(0.8, 0.07, 0.52, wd); f1.position.set(6.05, 0.5, zDk + 0.95); f1.rotation.x = 0.08; f1.castShadow = true; scene.add(f1);
    const f2 = box(0.8, 0.07, 0.52, wd); f2.position.set(6.05, 0.46, zDk + 1.45); f2.rotation.x = 0.14; f2.castShadow = true; scene.add(f2);
    for (const fx of [5.75, 6.35]) { const fp = cyl(0.05, 0.07, 1.1, 6, wd); fp.position.set(fx, 0.05, zDk + 1.2); scene.add(fp); }
    const gpl = box(0.8, 0.06, 0.85, wd); gpl.position.set(6.05, 0.3, zDk + 2.12); gpl.rotation.x = 0.3; gpl.receiveShadow = true; scene.add(gpl);
    const gst = box(0.8, 0.14, 0.3, wd); gst.position.set(6.05, 0.12, zDk + 2.55); scene.add(gst);
  }
  const poleP = cyl(0.05, 0.07, 2.1, 6, wd); poleP.position.set(4.3, 1.05, zDk + 1.55); poleP.castShadow = true; scene.add(poleP);
  const armP = box(0.42, 0.05, 0.05, wd); armP.position.set(4.5, 2.05, zDk + 1.55); scene.add(armP);
  const lampGM = mat('#ffd9a0', { emissive: '#ff9d3c', emissiveIntensity: 0.3 });
  const lampG = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.18, 8), lampGM); lampG.position.set(4.7, 1.86, zDk + 1.55); scene.add(lampG);
  const lampC = cyl(0.1, 0.06, 0.05, 8, mat('#3a2c1c')); lampC.position.set(4.7, 1.98, zDk + 1.55); scene.add(lampC);
  const lampL = new THREE.PointLight('#ffb45a', 0, 4.5, 2); lampL.position.set(4.7, 1.86, zDk + 1.55); scene.add(lampL);
  dayNight.lanternMats.push(lampGM); dayNight.lanternLights.push(lampL);
  {   /* v4.80f 溪桥桥头同款路灯（用户圈点：桥头驿道边草带） */
    const fx0 = -16.2, fz0 = 7.7;
    const poleF = cyl(0.05, 0.07, 2.1, 6, wd); poleF.position.set(fx0, 1.05, fz0); poleF.castShadow = true; scene.add(poleF);
    const armF = box(0.42, 0.05, 0.05, wd); armF.position.set(fx0 + 0.2, 2.05, fz0 + 0.5); armF.rotation.y = -0.9; scene.add(armF);
    const lampGF = mat('#ffd9a0', { emissive: '#ff9d3c', emissiveIntensity: 0.3 });
    const lampGFm = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.18, 8), lampGF); lampGFm.position.set(fx0 + 0.38, 1.86, fz0 + 0.68); scene.add(lampGFm);
    const lampCF = cyl(0.1, 0.06, 0.05, 8, mat('#3a2c1c')); lampCF.position.set(fx0 + 0.38, 1.98, fz0 + 0.68); scene.add(lampCF);
    const lampLF = new THREE.PointLight('#ffb45a', 0, 4.5, 2); lampLF.position.set(fx0 + 0.38, 1.86, fz0 + 0.68); scene.add(lampLF);
    dayNight.lanternMats.push(lampGF); dayNight.lanternLights.push(lampLF);
  }
}
/* ---------------- v4.80 点4 北岸小栈桥 + 双乌篷船泊位 ---------------- */
{
  const wz0 = rzAtG(-7.5) - 4.5;               /* 北岸水线 */
  const wd = M.wood;
  const jd = box(0.85, 0.08, 2.0, wd); jd.position.set(-7.5, 0.45, wz0 + 0.7); jd.castShadow = jd.receiveShadow = true; scene.add(jd);
  for (let i = 0; i < 2; i++) for (const jx of [-7.85, -7.15]) {
    const jp = cyl(0.05, 0.07, 1.0, 6, wd); jp.position.set(jx, 0.02, wz0 + 0.15 + i * 1.1); scene.add(jp);
  }
  const jb1 = cyl(0.07, 0.09, 0.4, 8, wd); jb1.position.set(-7.5, 0.68, wz0 + 1.55); scene.add(jb1);
  window.__wuDock = { z1: wz0 + 1.35, z2: wz0 + 2.05 };
}
/* ---------------- 土路（全部土色，边缘参差） ---------------- */
function dirtRoad(x, z, w, d, rotY) {
  const g = new THREE.Group();
  const main = box(w, 0.06, d, M.path);
  main.receiveShadow = true;
  g.add(main);
  for (let i = 0; i < 4; i++) {
    const e = box(rr(0.5, 1.1), 0.05, rr(0.35, 0.7), M.dirt);
    const s = rand() < 0.5 ? -1 : 1;
    if (rand() < 0.5) e.position.set(rr(-w / 2, w / 2), 0, s * (d / 2 + rr(0.1, 0.25)));
    else { e.scale.set(1, 1, 1.6); e.position.set(s * (w / 2 + rr(0.1, 0.3)), 0, rr(-d / 2, d / 2)); }
    e.receiveShadow = true;
    g.add(e);
  }
  g.position.set(x, 0.05, z);
  if (rotY) g.rotation.y = rotY;
  scene.add(g);
}
dirtRoad(0, 9.4, 2.3, 2.1);                    // 大门门槛（接沿河大路）
dirtRoad(0, 5.2, 1.9, 5.6);                    // 前院甬道（石灯之间）
dirtRoad(0, -0.6, 1.8, 6.0);                   // 门屋 → 主楼台阶（主院内）
/* 沿河横向大路：与河平行，贴大门、接码头，延伸到沙盘两头 */
const roadCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-29.0, 0, 7.35),
  new THREE.Vector3(-24, 0, 8.0),
  new THREE.Vector3(-16, 0, 10.2),
  new THREE.Vector3(-8, 0, 12.7),
  new THREE.Vector3(0, 0, 11.9),
  new THREE.Vector3(9, 0, 12.4),
  new THREE.Vector3(16, 0, 10.6),
  new THREE.Vector3(24, 0, 7.8),
  new THREE.Vector3(29.0, 0, 7.15),
]);
{
  const edge = new THREE.Mesh(ribbonGeo(roadCurve, 4.1, 44), M.dirt);
  edge.position.y = 0.045; edge.receiveShadow = true;
  const face = new THREE.Mesh(ribbonGeo(roadCurve, 3.2, 44), M.road);
  face.position.y = 0.075; face.receiveShadow = true;
  /* 门口主路：沿路中铺碎石带（卵石+砂砾 canvas） */
  const gravelTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    x.fillStyle = '#8d8168'; x.fillRect(0, 0, 256, 256);   /* 走旧的灰黄土底 */
    const stones = ['#a49a86', '#8f8674', '#6e675c', '#bcb29c', '#7c7466', '#948b72', '#5d574e'];
    for (let i = 0; i < 46; i++) {                          /* 乱砌残石：尺寸角度全随机 */
      const w = 14 + Math.random() * 44, h = 10 + Math.random() * 30;
      const px = Math.random() * 260 - 10, py = Math.random() * 260 - 10, rot = (Math.random() - 0.5) * 0.9;
      x.save(); x.translate(px, py); x.rotate(rot);
      x.fillStyle = 'rgba(42,36,28,0.4)'; x.fillRect(-w / 2 + 2, -h / 2 + 2.5, w, h);
      x.fillStyle = stones[i % stones.length]; x.fillRect(-w / 2, -h / 2, w, h);
      x.fillStyle = 'rgba(255,255,255,0.09)'; x.fillRect(-w / 2 + 2, -h / 2 + 1.5, w - 4, 3);
      x.restore();
    }
    for (let i = 0; i < 16; i++) {                          /* 黄土补坑 */
      x.fillStyle = 'rgba(138,112,72,0.55)';
      x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 16, 4 + Math.random() * 9, Math.random() * 3.14, 0, Math.PI * 2); x.fill();
    }
    for (let i = 0; i < 500; i++) {                         /* 砂砾噪点 */
      const g0 = 80 + Math.floor(Math.random() * 80);
      x.fillStyle = `rgb(${g0},${g0 - 6},${g0 - 18})`;
      x.fillRect(Math.random() * 256, Math.random() * 256, 1.8, 1.8);
    }
    for (let i = 0; i < 9; i++) {                           /* 石缝偶起杂草 */
      x.fillStyle = 'rgba(122,138,72,0.5)';
      x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3.5, 1 + Math.random() * 2, Math.random() * 3.14, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = 'rgba(196,184,158,0.14)';                 /* 两道车辙磨光带 */
    x.fillRect(52, 0, 30, 256); x.fillRect(174, 0, 30, 256);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.4, 6);
    t.encoding = THREE.sRGBEncoding;
    return t;
  })();
  const gravel = new THREE.Mesh(ribbonGeo(roadCurve, 2.6, 60), mat('#ffffff', { map: gravelTex, roughness: 1 }));
  gravel.position.y = 0.088; gravel.receiveShadow = true;
  scene.add(gravel);
  scene.add(edge, face);
}
const roadPts = roadCurve.getSpacedPoints(140);

/* ---------------- 路过马车：1~3 辆一队的牛马车从沙盘一头进、另一头出 ---------------- */
/* 马匹随机毛色（9 选 1 等概率；列表按用户原序，棕踏雪出现两次=权重 2/9） */
const SKINS = [
  { body: '#f0ece1', hair: '#23211d', spots: 1 },   // 奶牛色黑斑白马
  { body: '#7a4a2c', snow: 1 },                     // 棕身白半腿（踏雪）
  { body: '#f2efe6', hair: '#b3ab9b' },             // 白马
  {},                                               // 棕马（现款）
  { body: '#1a1720', hair: '#0c0b10' },             // 黑马
  { body: '#1a1720', hair: '#0c0b10', snow: 1 },    // 黑踏雪
  { body: '#7a4a2c', snow: 1 },                     // 棕踏雪（重复条目）
  { body: '#1e3b33', hair: '#132a23' },             // 墨绿马
  { body: '#1e3b33', hair: '#132a23', snow: 1 },    // 墨绿踏雪
];
function skinHorse(root) {
  const sc = SKINS[Math.floor(Math.random() * SKINS.length)];
  root.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.name) return;
    const nm = o.material.name;
    if (sc.body && /horseBody/.test(nm)) { o.material = o.material.clone(); o.material.color.set(sc.body); }
    else if (sc.hair && /horseHair/.test(nm)) { o.material = o.material.clone(); o.material.color.set(sc.hair); }
    if (sc.snow && /^shin/.test(o.name || '')) { o.material = o.material.clone(); o.material.color.set('#eae5d8'); }
  });
  if (sc.spots) {                                   // 奶牛斑：贴面压扁黑球
    const smat = mat('#1d1a19', { roughness: 0.9 });
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.09, 7, 5), smat);
      const ax = i < 4 ? 0 : (i < 6 ? 1 : 2);
      const side = Math.random() < 0.5 ? -1 : 1;
      if (ax === 0) { sp.position.set(side * 0.175, 0.7 + Math.random() * 0.4, -0.42 + Math.random() * 0.86); sp.scale.set(0.3, 0.85, 1); }
      else if (ax === 1) { sp.position.set(-0.1 + Math.random() * 0.2, 1.08, -0.3 + Math.random() * 0.6); sp.scale.set(0.8, 0.3, 1); }
      else { sp.position.set(-0.08 + Math.random() * 0.16, 0.85 + Math.random() * 0.25, -0.63); sp.scale.set(0.9, 0.9, 0.3); }
      root.add(sp);
    }
  }
  return sc;
}
function makeCart() {
  /* 清代骡车（参考照片）：黑漆封闭式车身+篷形穹顶+后门卷帘格窗+后大前小十辐轮+双辕+挽具马 */
  const g = new THREE.Group();
  const wheels = [];
  const dark = mat('#33291f'), roofC = mat('#2a241d'), wheelC = mat('#5a4228', { roughness: 0.8 }), curtC = dark;   // 卷帘/门楣与车厢同色（浅色太跳）
  for (const [dz, r, xw] of [[-0.45, 0.5, 0.58], [-0.45, 0.5, -0.58], [0.7, 0.38, 0.56], [0.7, 0.38, -0.56]]) {
    const h = new THREE.Group(); h.position.set(xw, r, dz);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.038, 6, 14), wheelC);
    rim.rotation.y = Math.PI / 2; h.add(rim);
    const hub = cyl(0.07, 0.07, 0.13, 8, wheelC); hub.rotation.z = Math.PI / 2; h.add(hub);
    for (let k = 0; k < 5; k++) { const sp = box(0.042, r * 1.84, 0.042, wheelC); sp.rotation.x = k * Math.PI / 5; h.add(sp); }
    g.add(h); wheels.push(h);
  }
  const frame = box(0.9, 0.12, 2.0, M.wood); frame.position.set(0, 0.6, 0.05); g.add(frame);
  for (const px of [-0.36, 0.36]) { const sk = box(0.05, 0.16, 1.5, dark); sk.position.set(px, 0.74, -0.15); g.add(sk); }
  /* 车厢拼板结构：侧壁真开两条 0.4×0.3 窗洞（棂窗镂空），后壁真门洞，光路真实可透 */
  const cab = (w, h, d, x, y, z) => { const m = box(w, h, d, dark); m.position.set(x, y, z); g.add(m); return m; };
  cab(0.88, 0.06, 1.45, 0, 0.78, -0.15);                 // 底板
  cab(0.88, 0.05, 1.45, 0, 1.345, -0.15);                // 顶板
  cab(0.88, 0.56, 0.05, 0, 1.06, 0.55);                  // 前壁
  for (const px of [-0.44, 0.44]) {                      // 侧壁：窗洞间立板
    cab(0.05, 0.21, 1.45, px, 0.895, -0.15);             // 下坐板 (y.79~1.0)
    cab(0.05, 0.06, 1.45, px, 1.31, -0.15);              // 上板 (y1.28~1.34)
    for (const [z0, z1] of [[-0.875, -0.8], [-0.4, -0.22], [0.18, 0.575]])
      cab(0.05, 0.28, z1 - z0, px, 1.14, (z0 + z1) / 2);
  }
  for (const rx of [-0.33, 0.33]) cab(0.22, 0.56, 0.05, rx, 1.06, -0.875);
  cab(0.44, 0.08, 0.05, 0, 1.3, -0.875);                 // 门洞上条
  cab(0.44, 0.06, 0.05, 0, 0.81, -0.875);                // 门洞下条
  const litNow = dayNight.isNight ? 1.55 : 0.25;   // 静态模式 envApply 只在启动跑一次：出生自发光必须自带夜值（cycle 模式随后每帧覆盖）
  for (const px of [-0.44, 0.44]) for (const pz of [-0.6, -0.02]) {
    for (const bx of [-0.12, 0, 0.12]) { const bar = box(0.025, 0.26, 0.025, mat('#241d17')); bar.position.set(px, 1.14, pz + bx); g.add(bar); }
    const rail = box(0.025, 0.025, 0.36, mat('#241d17')); rail.position.set(px, 1.06, pz); g.add(rail);
    const wp = box(0.015, 0.28, 0.39, mat('#5d4c3a', { emissive: '#ff9e3e', emissiveIntensity: litNow }));
    wp.position.set(px + (px > 0 ? -0.014 : 0.014), 1.14, pz); wp.userData.pane = true; g.add(wp);
  }
  for (const cx of [-0.26, 0.26]) { const cu = box(0.13, 0.5, 0.06, curtC); cu.position.set(cx, 1.02, -0.93); g.add(cu); }
  const val = box(0.62, 0.1, 0.06, curtC); val.position.set(0, 1.3, -0.93); g.add(val);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), roofC);
  dome.scale.set(0.66, 0.32, 1.04); dome.position.set(0, 1.42, -0.13); g.add(dome);
  const eave = box(1.1, 0.05, 1.7, roofC); eave.position.set(0, 1.36, -0.14); g.add(eave);
  for (const s of [-1, 1]) { const sh = box(0.06, 0.06, 1.55, M.wood); sh.position.set(s * 0.2, 0.56, 1.35); g.add(sh); }
  const bar = box(0.5, 0.07, 0.07, M.wood); bar.position.set(0, 0.56, 2.02); g.add(bar);
  /* ---- 马：栗色深蹄，两节腿对角步态、尾摆头点 ---- */
  const horse = new THREE.Group(); const legs = [];
  const hp = mat('#7a4a2c'), hair = mat('#2e2118'), tackC = mat('#6f675a');
  let headG, tailG;
  if (horseProto) {
    const c = horseProto.clone(); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0);
    const node = n => { let r = null; c.traverse(o0 => { if (!r && o0.name === n) r = o0; }); return r; };
    for (const [tag, ph] of [['FL', 0], ['FR', Math.PI], ['RL', Math.PI], ['RR', 0]])
      legs.push({ hip: node('hip' + tag), knee: node('knee' + tag), ph });
    headG = node('headG'); tailG = node('tailG');
    horse.add(c);
  } else {
  const torso = box(0.36, 0.4, 0.92, hp); torso.position.y = 0.85; horse.add(torso);
  const chest = box(0.38, 0.34, 0.26, hp); chest.position.set(0, 0.82, 0.44); horse.add(chest);
  const rump = box(0.38, 0.36, 0.24, hp); rump.position.set(0, 0.84, -0.5); horse.add(rump);
  const neck = box(0.17, 0.4, 0.17, hp); neck.position.set(0, 1.08, 0.52); neck.rotation.x = -0.55; horse.add(neck);
  const mane = box(0.05, 0.12, 0.5, hair); mane.position.set(0, 1.24, 0.32); mane.rotation.x = -0.55; horse.add(mane);
  headG = new THREE.Group(); headG.position.set(0, 1.28, 0.68);
  const head = box(0.16, 0.18, 0.28, hp); headG.add(head);
  const muz = box(0.12, 0.13, 0.13, hair); muz.position.set(0, -0.03, 0.2); headG.add(muz);
  for (const ex of [-0.06, 0.06]) { const ear = cyl(0.005, 0.03, 0.09, 5, hair); ear.position.set(ex, 0.13, -0.02); headG.add(ear); }
  for (const bx of [-0.1, 0.1]) { const bl = box(0.02, 0.1, 0.1, tackC); bl.position.set(bx, 0.02, 0.03); headG.add(bl); }
  horse.add(headG);
  tailG = new THREE.Group(); tailG.position.set(0, 0.98, -0.62); tailG.rotation.x = 0.55;
  const t1 = box(0.07, 0.26, 0.06, hair); t1.position.y = -0.13; tailG.add(t1);
  const t2 = box(0.05, 0.2, 0.05, hair); t2.position.y = -0.34; tailG.add(t2);
  horse.add(tailG);
  for (const lx of [-0.15, 0.15]) for (const lz of [0.42, -0.42]) {
    const ph = (lz > 0 ? 0 : Math.PI) + (lx > 0 ? Math.PI : 0);   // 对角蹄：FL&RR 同相
    const hip = new THREE.Group(); hip.position.set(lx, 0.66, lz);
    const th = box(0.1, 0.34, 0.1, hp); th.position.y = -0.17; hip.add(th);
    const knee = new THREE.Group(); knee.position.y = -0.34; hip.add(knee);
    const shn = box(0.08, 0.28, 0.08, hp); shn.position.y = -0.14; knee.add(shn);
    const hoof = box(0.09, 0.05, 0.11, hair); hoof.position.y = -0.31; knee.add(hoof);
    horse.add(hip); legs.push({ hip, knee, ph });
  }
  const blanket = box(0.4, 0.07, 0.34, mat('#8a3f33')); blanket.position.set(0, 1.08, 0.12); horse.add(blanket);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 10), tackC);
  collar.position.set(0, 0.98, 0.55); collar.rotation.x = Math.PI / 2 - 0.55; horse.add(collar);
  }
  horse.position.set(0, 0, 2.15);
  g.add(horse);
  g.userData.legs = legs; g.userData.headG = headG; g.userData.tailG = tailG; g.userData.gait = rand() * 6.28;
  /* 车内油灯：夜里发光 + 小点光（放在后门内，光从门洞透出） */
  const lampMat = mat('#e8b06a', { emissive: '#ff9e3e', emissiveIntensity: 0.25 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 6), lampMat);
  lamp.position.set(0, 1.12, -0.15);
  const lampL = new THREE.PointLight('#ffb066', dayNight.isNight ? 0.9 : 0, 0.95);   // 半径 0.95 < 灯离地 1.12：只照车厢内，不外泄照地
  lampL.position.set(0, 1.12, -0.15);
  g.add(lamp, lampL);
  g.userData.lampMat = lampMat;
  g.userData.lampL = lampL;
  g.userData.wheels = wheels;
  g.userData.horse = horse;
  dayNight.lanternMats.push(lampMat);
  dayNight.lanternLights.push(lampL);
  if (horseProto) skinHorse(horse);
  const mats = [], winMats = [];
  g.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.material = o.material.clone();
      if (o.material.userData.eBase !== undefined && ENV_MATS.indexOf(o.material) < 0) ENV_MATS.push(o.material);
      mats.push(o.material);
      if (o.userData.pane) { winMats.push(o.material); dayNight.lanternMats.push(o.material); }
    }
  });
  g.userData.mats = mats;
  g.userData.winMats = winMats;
  return g;
}
const carts = [];
const roadLen = roadCurve.getLength();
/* 溪口单孔木拱桥（沿用已拆河桥的拱形+GLB 栏杆风格）：跨溪路口，车马通行 */
const STREAM_BRIDGE = { tB: 0.1255, ZONE: 0.069, APPR: 0.145, x: 0, z: 0, yAt: () => 0 };
{
  {   /* 路×溪交点参数：数值搜索，路改形后自动跟随 */
    const sb = streamCurve.getSpacedPoints(240);
    let bD = 1e18, bA = 0.12;
    for (let k = 0; k <= 500; k++) {
      const p0 = roadCurve.getPointAt(k / 500);
      for (const q0 of sb) { const d = (p0.x - q0.x) ** 2 + (p0.z - q0.z) ** 2; if (d < bD) { bD = d; bA = k / 500; } }
    }
    STREAM_BRIDGE.tB = bA;
  }
  const pS = roadCurve.getPointAt(STREAM_BRIDGE.tB), tgS = roadCurve.getTangentAt(STREAM_BRIDGE.tB);
  STREAM_BRIDGE.x = pS.x; STREAM_BRIDGE.z = pS.z;
  STREAM_BRIDGE.ZONE = 3.4 / roadLen; STREAM_BRIDGE.APPR = 7.2 / roadLen;
  const SPAN = 4.8, RISE = 0.42, N = 8;
  const yAt = (t) => {
    const a2 = 0.5 + (t - STREAM_BRIDGE.tB) * roadLen / SPAN;
    return a2 > 0 && a2 < 1 ? 0.42 * Math.sin(a2 * Math.PI) : 0;
  };
  STREAM_BRIDGE.yAt = yAt;
  /* v5.72 古桥木：陈化板纹贴图（板缝+雨痕+节疤），桥面/边梁/勾栏共用 */
  const OLDW = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = '#6b4c2c'; x.fillRect(0, 0, 128, 128);
    for (let r2 = 0; r2 < 4; r2++) {
      x.fillStyle = ['#5e4226', '#74532f', '#664828', '#6e4e2a'][r2];
      x.fillRect(0, r2 * 32, 128, 30);
      x.fillStyle = 'rgba(30,20,10,.55)'; x.fillRect(0, r2 * 32 + 30, 128, 2);
    }
    for (let i = 0; i < 60; i++) {
      x.strokeStyle = 'rgba(38,26,14,' + (0.12 + Math.random() * 0.22) + ')';
      x.lineWidth = 0.8 + Math.random() * 1.4;
      const yy = Math.random() * 128;
      x.beginPath(); x.moveTo(0, yy); x.bezierCurveTo(40, yy + Math.random() * 5 - 2.5, 90, yy + Math.random() * 5 - 2.5, 128, yy); x.stroke();
    }
    for (let i = 0; i < 6; i++) {
      x.fillStyle = 'rgba(46,30,16,.5)';
      x.beginPath(); x.ellipse(Math.random() * 128, Math.random() * 128, 2.5 + Math.random() * 2, 1.4, 0, 0, 6.29); x.fill();
    }
    const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return tx;
  })();
  const oldWood = (rx, ry) => { const t2 = OLDW.clone(); t2.needsUpdate = true; t2.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: t2, color: '#f0e2cc', roughness: 0.95 }); };
  const oDeck = oldWood(1, 6), oBeam = oldWood(1, 10), oRail = oldWood(1, 12);
  const br = new THREE.Group();
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const seg = box(2.6, 0.12, SPAN / N + 0.05, oDeck);
    seg.position.set(0, 0.04 + RISE * Math.sin(t * Math.PI), (t - 0.5) * SPAN);
    seg.rotation.x = -Math.atan(RISE * Math.PI * Math.cos(t * Math.PI) / SPAN);
    br.add(seg);
  }
  for (const s of [-1, 1]) {
    const st2 = box(0.12, 0.16, 4.94, oBeam);
    st2.position.set(s * 1.3, 0.16, 0); br.add(st2);
    /* v5.72 中式连续木勾栏：寻杖 8 段随坡连续 + 川挂板裙板 + 望柱鼓墩头 */
    const NK = 8;
    for (let k2 = 0; k2 < NK; k2++) {
      const t1 = k2 / NK, t2b = (k2 + 1) / NK, tm = (t1 + t2b) / 2;
      const y1 = 0.12 + RISE * Math.sin(t1 * Math.PI), ym = 0.12 + RISE * Math.sin(tm * Math.PI), y2 = 0.12 + RISE * Math.sin(t2b * Math.PI);
      const z1 = (t1 - 0.5) * SPAN, z2 = (t2b - 0.5) * SPAN;
      const ang = Math.atan2(-(y2 - y1), z2 - z1);
      const len = Math.hypot(z2 - z1, y2 - y1) + 0.02;
      const top = box(0.075, 0.06, len, oRail); top.position.set(s * 1.02, ym + 0.5, (z1 + z2) / 2); top.rotation.x = ang; br.add(top);
      const mid = box(0.05, 0.045, len, oRail); mid.position.set(s * 1.02, ym + 0.28, (z1 + z2) / 2); mid.rotation.x = ang; br.add(mid);
      const skirt = box(0.03, 0.2, len - 0.02, oRail); skirt.position.set(s * 1.02, ym + 0.17, (z1 + z2) / 2); skirt.rotation.x = ang; br.add(skirt);
    }
    for (let k2 = 0; k2 <= 4; k2++) {
      const t3 = k2 / 4, y3 = 0.12 + RISE * Math.sin(t3 * Math.PI), z3 = (t3 - 0.5) * SPAN;
      const post = box(0.085, 0.62, 0.085, oRail); post.position.set(s * 1.02, y3 + 0.31, z3); br.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), oRail);
      cap.scale.set(1, 0.72, 1); cap.position.set(s * 1.02, y3 + 0.64, z3); br.add(cap);
    }
  }
  br.position.set(pS.x, 0, pS.z);
  br.rotation.y = Math.atan2(tgS.x, tgS.z);
  br.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(br);
  console.log('[沙盘] 溪口拱桥就位 @', pS.x.toFixed(1), pS.z.toFixed(1));
}
let nextCartAt = 3;
let cartBornSeq = 0;
function spawnCart(dir) {
  const c = makeCart();
  c.userData.t = dir > 0 ? 0 : 1;
  c.userData.wait = 0;
  c.userData.dir = dir;
  c.userData.speed = rr(0.012, 0.017);
  /* 车速 buff：60% 概率得 buff 之一（+100%:15%、+25%:50%、+50%:35%，Math.random 不占序列） */
  if (Math.random() < 0.60) {
    const q = Math.random();
    const mul = q < 0.15 ? 2 : q < 0.65 ? 1.25 : 1.5;
    c.userData.speed *= mul;
    c.userData.buff = mul;
  }
  c.userData.born = cartBornSeq++;
  c.userData.avoid = 0;
  c.userData.lat = 0;
  carts.push(c);
  scene.add(c);
  return c;
}
function spawnConvoy(slots) {
  const n = Math.min(1 + Math.floor(rand() * 2), slots);   // 1~2 辆，且不超过在场容量
  const dir = rand() < 0.5 ? 1 : -1;                       // 从西端或东端进入
  for (let i = 0; i < n; i++) spawnCart(dir).userData.wait = i * rr(2.4, 3.4);  // 队内错开出闸
}
let cartPhase = 0;
function updateCarts(dt, t) {
  if (t > nextCartAt && horseProto !== null) {
    if (cartPhase === 0) {                 // 开场：东西两侧各来一台
      cartPhase = 1;
      spawnCart(1); spawnCart(-1);
    } else if (carts.length < 3) {         // 之后维持在盘 2~3 台
      spawnConvoy(3 - carts.length);
    }
    nextCartAt = t + rr(16, 30);
  }
  for (const c of carts) {
    if (c.userData.wait > 0) { c.userData.wait -= dt; continue; }
    c.userData.t += c.userData.dir * c.userData.speed * dt;
  }
  /* 同向：跟车距离不足时，后车被压住；对向：后出发的车让到右侧路肩 */
  for (let i = 0; i < carts.length; i++) {
    for (let j = 0; j < carts.length; j++) {
      if (i === j) continue;
      const A = carts[i], B = carts[j];
      if (A.userData.dir === B.userData.dir) {
        const gap = (B.userData.t - A.userData.t) * A.userData.dir; // B 在前则 >0
        if (gap > 0 && gap < 0.1) A.userData.t = B.userData.t - 0.1 * A.userData.dir;
      } else if (Math.abs(A.userData.t - B.userData.t) < 0.13) {
        if (A.userData.born > B.userData.born) A.userData.avoid = 1;
      }
    }
  }
  /* 溪口桥单车道管制：先到先过，对向在桥头候让；moved 判定供步态/车轮 */
  {
    const BT = STREAM_BRIDGE.tB, ZN = STREAM_BRIDGE.ZONE;
    const onBr = carts.filter(c => c.userData.wait <= 0 && Math.abs(c.userData.t - BT) < ZN);
    const occDir = onBr.length ? onBr[0].userData.dir : 0;
    const q = [];
    for (const c of carts) {
      if (c.userData.wait > 0) continue;
      const d = c.userData.dir, ap = (BT - c.userData.t) * d;
      if (Math.abs(c.userData.t - BT) < ZN || ap <= 0 || ap > STREAM_BRIDGE.APPR) continue;
      q.push(c);
    }
    if (q.length) {
      q.sort((a2, b2) => (BT - a2.userData.t) * a2.userData.dir - (BT - b2.userData.t) * b2.userData.dir);
      const passDir = occDir || q[0].userData.dir;
      let slot = 0;
      for (const c of q) {
        if (c.userData.dir === passDir) continue;
        const edge = BT - ZN * c.userData.dir - 0.0015 * c.userData.dir - slot * 0.03 * c.userData.dir;
        if ((c.userData.t - edge) * c.userData.dir > 0) c.userData.t = edge;
        slot++;
      }
    }
    for (const c of carts) {
      c.userData.moved = Math.abs(c.userData.t - (c.userData.pt0 == null ? c.userData.t : c.userData.pt0)) > 1e-9;
      c.userData.pt0 = c.userData.t;
    }
  }
  for (let i = carts.length - 1; i >= 0; i--) {
    const c = carts[i];
    let meeting = false;
    for (const o of carts) {
      if (o !== c && o.userData.dir !== c.userData.dir && Math.abs(o.userData.t - c.userData.t) < 0.2) { meeting = true; break; }
    }
    if (!meeting) c.userData.avoid = 0;
    const onBr = Math.abs(c.userData.t - STREAM_BRIDGE.tB) < STREAM_BRIDGE.ZONE + 0.035;
    c.userData.lat += (((c.userData.avoid && !onBr) ? 0.95 : 0) - c.userData.lat) * Math.min(1, dt * 1.6);
    const tt = Math.min(Math.max(c.userData.t, 0), 1);
    const ext = (c.userData.t - tt) * roadLen;            // 越过路端界的实际外延（沿切线）
    const outSide = (c.userData.t - tt) * c.userData.dir; // >0 = 已驶出路另一端
    if (outSide > 0) {
      /* 到达沙盘边缘：继续滑出并立刻渐隐，约 0.7 秒后移除 */
      c.userData.fade = (c.userData.fade || 0) + dt * 1.5;
      var op = Math.max(0, 1 - c.userData.fade);
      if (op <= 0 || Math.abs(ext) > 4) {
        scene.remove(c);
        carts.splice(i, 1);
        c.userData.mats.forEach(m => m.dispose());
        let li = dayNight.lanternLights.indexOf(c.userData.lampL);
        if (li >= 0) dayNight.lanternLights.splice(li, 1);
        li = dayNight.lanternMats.indexOf(c.userData.lampMat);
        if (li >= 0) dayNight.lanternMats.splice(li, 1);
        c.userData.winMats.forEach(m => {
          const wi = dayNight.lanternMats.indexOf(m);
          if (wi >= 0) dayNight.lanternMats.splice(wi, 1);
        });
        continue;
      }
    } else {
      /* 进场端：从盘缘起 2.2 米内在沙盘里渐显 */
      const tin = (c.userData.dir > 0 ? c.userData.t : 1 - c.userData.t) * roadLen;
      op = Math.max(0, Math.min(1, tin / 2.2));
    }
    if (op < 1 || c.userData.op == null || c.userData.op >= 1 !== (op >= 1)) {
      c.userData.op = op;
      c.userData.mats.forEach(m => { m.transparent = op < 1; m.opacity = op; });
      c.traverse(o => { if (o.isMesh) o.castShadow = op > 0.4; });   /* 本体成形才投影，盘外影子不再提前露出 */
      const night = dayNight.isNight;
      if (c.userData.lampL) c.userData.lampL.intensity = (night ? 0.9 : 0) * op;
      if (c.userData.lampMat) c.userData.lampMat.emissiveIntensity = (night ? 1.4 : 0.25) * op;
    }
    if (c.userData.t < -0.4 || c.userData.t > 1.4) {
      /* 兜底清理（正常走不到这里） */
      scene.remove(c);
      carts.splice(i, 1);
      c.userData.mats.forEach(m => m.dispose());
      continue;
    }
    const p = roadCurve.getPointAt(tt), tg = roadCurve.getTangentAt(tt);
    let px = p.x + tg.x * ext, pz = p.z + tg.z * ext;
    if (Math.abs(c.userData.lat) > 0.002) {
      px += tg.z * c.userData.dir * c.userData.lat;
      pz += -tg.x * c.userData.dir * c.userData.lat;
    }
    c.position.set(px, 0.08 + STREAM_BRIDGE.yAt(c.userData.t) + Math.sin(t * 7 + i) * 0.012, pz);
    c.rotation.y = Math.atan2(tg.x * c.userData.dir, tg.z * c.userData.dir);
    const spin = c.userData.speed * 60 * dt * (c.userData.moved ? 1 : 0);   // 候让=停轮
    c.userData.wheels.forEach(w => { w.rotation.x += spin; });
    /* 马步态：对角腿两节拍、膝只单向弯、头顶微点头、尾摆、走动时躯干上下颠 */
    const gd = c.userData;
    const gbuff = gd.buff || 1;
    const gallop = gbuff >= 1.5;               /* +50%/+100%：奔蹄 */
    gd.gait += dt * (gallop ? (gbuff >= 2 ? 19 : 15) : 7 * gbuff) * (gd.moved ? 1 : 0.05);
    if (gd.legs) gd.legs.forEach(L => {
      const a2 = Math.sin(gd.gait * 2 + L.ph);
      if (gallop) {
        L.hip.rotation.x = a2 * 0.85;
        L.knee.rotation.x = 0.35 + Math.max(0, -a2) * 0.95;
      } else {
        L.hip.rotation.x = a2 * 0.45;
        L.knee.rotation.x = 0.25 + Math.max(0, -a2) * 0.55;
      }
    });
    if (gd.headG) gd.headG.rotation.x = gallop
      ? -0.1 + Math.sin(gd.gait * 2 + 1.4) * 0.09
      : Math.sin(t * 0.9 + i * 1.7) * 0.05 + Math.sin(gd.gait * 2 + 1.4) * 0.035;
    if (gd.tailG) {
      gd.tailG.rotation.z = Math.sin(t * (gallop ? 5 : 1.7) + i * 2.3) * (gallop ? 0.28 : 0.16);
      gd.tailG.rotation.x = gallop ? 0.15 : 0.55;          /* 奔时扬尾 */
    }
    if (gd.horse) gd.horse.position.y = gallop
      ? Math.abs(Math.sin(gd.gait)) * 0.11
      : Math.abs(Math.sin(gd.gait * 2)) * 0.025;
  }
}

/* ---------------- 方形院墙 + 围墙小门楼 ---------------- */
/* ---- 徽派瓦作：Canvas 黛瓦楞纹 + 双坡瓦檐 + 马头墙 ---- */
const tileTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#363c46'; x.fillRect(0, 0, 128, 64);          // 底色：同筒瓦灰(ridgeM #40454e)但更深一档
  for (let i = 0; i < 128; i += 9) {
    x.fillStyle = '#4b525d'; x.fillRect(i, 0, 4, 64);          // 瓦楞垄
    x.fillStyle = '#2b3038'; x.fillRect(i + 8, 0, 1.4, 64);    // 垄间阴线
  }
  for (let y = 6; y < 64; y += 14) { x.fillStyle = 'rgba(24,27,32,0.45)'; x.fillRect(0, y, 128, 1.6); }  // 瓦档横路
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  return t;
})();
function tileMat(len) {
  const t = tileTex.clone(); t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(2, len / 0.45), 1);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.82 });
}

const brickTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#5f6268'; x.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 16; r++) {
    const off = (r % 2) * 8;
    for (let b = -1; b < 8; b++) {
      const v = 88 + (b * 7 + r * 13) % 22;
      x.fillStyle = `rgb(${v + 6},${v + 4},${v})`;
      x.fillRect(b * 16 + off + 1, r * 8 + 1, 14, 6);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  t.repeat.set(1.7, 7);
  return t;
})();
const brickM = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 });
const ridgeM = mat('#40454e', { roughness: 0.8 });
function cornerPost(x, z) {
  const g = new THREE.Group();
  const bs = box(0.76, 0.42, 0.76, M.wallBase); bs.position.y = 0.21;
  const b = box(0.64, 2.9, 0.64, brickM); b.position.y = 1.6;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.36, 4), ridgeM);
  cap.position.y = 3.25; cap.rotation.y = Math.PI / 4;
  g.add(bs, b, cap);
  g.position.set(x, 0, z);
  scene.add(g);
}
function horseTower(x, z, f) {
  /* 门侧马头墙塔：白墙四叠落、峰值朝外侧(背门)、每级青瓦檐翘角、顶立罗汉头、外侧小窗 */
  const g = new THREE.Group();
  const tM = tileMat(1.8);
  const bs = box(1.04, 0.5, 1.06, M.wallBase); bs.position.y = 0.25; g.add(bs);
  const col = box(0.66, 2.9, 0.66, brickM); col.position.y = 1.6; g.add(col);   // 青砖柱身托底
  const tiers = [[1.32, 0.72], [1.04, 1.12], [0.78, 1.5], [0.54, 1.82]];
  tiers.forEach(([w, h], i) => {
    const xo = -f * (0.18 - i * 0.16);
    const b = box(w, h, 0.66, M.wall); b.position.set(xo, 2.3 + h / 2, 0); g.add(b);
    const cp = box(w + 0.16, 0.075, 0.84, tM); cp.position.set(xo, 2.3 + h + 0.03, 0); g.add(cp);
    for (const e of [-1, 1]) {
      const q = box(0.13, 0.17, 0.24, tM);
      q.position.set(xo + e * (w / 2 + 0.05), 2.3 + h + 0.09, 0);
      q.rotation.z = -e * 0.3; g.add(q);                                   // 翘角
    }
  });
  const py = 2.3 + 1.82;
  g.add((() => { const a1 = box(0.4, 0.13, 0.5, ridgeM); a1.position.set(-f * 0.3, py + 0.13, 0); return a1; })());
  g.add((() => { const a2 = box(0.24, 0.12, 0.3, ridgeM); a2.position.set(-f * 0.3, py + 0.26, 0); return a2; })());
  g.add((() => { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), ridgeM); sp.position.set(-f * 0.3, py + 0.47, 0); sp.rotation.y = Math.PI / 4; return sp; })());
  const win = box(0.15, 0.18, 0.04, mat('#201a13')); win.position.set(-f * 0.3, 2.98, 0.35); g.add(win);   // 外侧小窗
  g.position.set(x, 0, z);
  scene.add(g);
}
/* 苏式海棠漏窗：墙面同色粉壁裁凹角四瓣形，石砌双边，格心连环钱纹，透光 */
const winLatM = new THREE.MeshStandardMaterial({ map: (() => {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 230;
  const x = cv.getContext('2d');
  const x0 = 13, x1 = 243, y0 = 13, y1 = 217, c = 56;   // 形放大几乎占满窗洞
  const shape = () => {
    const p = new Path2D();
    p.moveTo(x0 + c, y0);
    p.arc(x0, y0, c, 0, Math.PI / 2);
    p.lineTo(x0, y1 - c);
    p.arc(x0, y1, c, -Math.PI / 2, 0);
    p.lineTo(x1 - c, y1);
    p.arc(x1, y1, c, Math.PI, Math.PI * 1.5);
    p.lineTo(x1, y0 + c);
    p.arc(x1, y0, c, Math.PI / 2, Math.PI);
    p.closePath();
    return p;
  };
  const P = shape();
  x.fillStyle = '#dcd3c0'; x.fillRect(0, 0, 256, 230);       // 与院墙同色粉壁
  x.globalCompositeOperation = 'destination-out'; x.fill(P);  // 挖空成形
  x.globalCompositeOperation = 'source-over';
  x.strokeStyle = '#17140f'; x.lineWidth = 15; x.stroke(P);    // 苏式青砖黑边
  x.strokeStyle = '#000000'; x.lineWidth = 4; x.stroke(P);     // 内沿墨线
  x.save(); x.clip(P);                                          // 格心：连环钱纹
  x.strokeStyle = '#cfc7b2'; x.lineCap = 'round';
  const sp = 52, r = 36;
  x.lineWidth = 10;
  for (let j = -1; j <= 6; j++) for (let i = -1; i <= 7; i++) {
    x.beginPath(); x.arc(i * sp + (Math.abs(j) % 2) * sp / 2, j * sp + 12, r, 0, Math.PI * 2); x.stroke();
  }
  x.lineWidth = 7;
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
    const px = i * sp + sp / 2 + (Math.abs(j) % 2 ? sp / 2 : 0), py = j * sp + 24;
    x.beginPath(); x.moveTo(px - 8, py - 8); x.lineTo(px + 8, py + 8);
    x.moveTo(px + 8, py - 8); x.lineTo(px - 8, py + 8); x.stroke();
  }
  x.restore();
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
})(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
function winFrame() {
  const g0 = new THREE.Group();
  for (const q of [-1, 1]) {                       // 双面齐墙皮：无内陷
    const lat = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.95), winLatM);
    lat.position.z = q * 0.224;                    // 墙厚 0.45 两侧表面
    g0.add(lat);
  }
  return g0;
}
function wallSeg(x1, z1, x2, z2, winTs) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const g = new THREE.Group();
  const wl = [];
  let wprev = -len / 2;
  for (const tw of winTs || []) {
    const c = -len / 2 + tw * len;
    wl.push([wprev, c - 0.53]); wprev = c + 0.53;
    const lo = box(1.06, 0.32, 0.45, M.wall); lo.position.set(c, 0.66, 0); g.add(lo);
    const up = box(1.06, 0.53, 0.45, M.wall); up.position.set(c, 2.035, 0); g.add(up);
    const wf0 = winFrame(); wf0.position.set(c, 1.285, 0); g.add(wf0);
  }
  wl.push([wprev, len / 2]);
  for (const [wa, wb] of wl) if (wb - wa > 0.02) {
    const bd = box(wb - wa, 2.3, 0.45, M.wall); bd.position.set((wa + wb) / 2, 1.15, 0); g.add(bd);
  }
  const base = box(len + 0.06, 0.5, 0.58, M.wallBase); base.position.y = 0.25;
  const sill = box(len + 0.16, 0.08, 0.82, mat('#d8d1c2')); sill.position.y = 2.38;   // 出檐白下须
  const tM = tileMat(len);
  for (const s of [-1, 1]) {
    const sl = box(len + 0.04, 0.07, 0.62, tM);
    sl.rotation.x = s * 0.32; sl.position.set(0, 2.56, s * 0.26);
    g.add(sl);
  }
  const ridge = box(len + 0.08, 0.14, 0.16, tM); ridge.position.y = 2.78;
  g.add(ridge);
  const rg = new THREE.CylinderGeometry(0.085, 0.085, len + 0.1, 8); rg.rotateZ(Math.PI / 2);
  const rmg = new THREE.Mesh(rg, ridgeM); rmg.position.y = 2.87; g.add(rmg);   // 圆正脊
  /* 筒瓦沿流水方向顺坡竖铺（参照徽派实拍：垄垂直于正脊）；InstancedMesh 一段墙 1 次绘制 */
  const wg = new THREE.CylinderGeometry(0.052, 0.052, 0.62, 7); wg.rotateX(Math.PI / 2);
  const rows = Math.max(4, Math.floor((len - 0.14) / 0.15));
  const im = new THREE.InstancedMesh(wg, ridgeM, rows * 2);
  const mtx = new THREE.Matrix4(); const p = new THREE.Vector3(); const q = new THREE.Quaternion(); const eu = new THREE.Euler(); const sc1 = new THREE.Vector3(1, 1, 1);
  let ki = 0;
  for (const sgn of [-1, 1]) {
    const th = sgn * 0.32;
    eu.set(th, 0, 0); q.setFromEuler(eu);
    for (let j = 0; j < rows; j++) {
      p.set(-len / 2 + 0.1 + j * 0.15, 2.56 + 0.015 * Math.cos(th), sgn * 0.26 + 0.015 * Math.sin(th));
      mtx.compose(p, q, sc1); im.setMatrixAt(ki++, mtx);
    }
  }
  im.castShadow = true; g.add(im);
  for (const e of [-1, 1]) {
    const rc = box(0.16, 0.2, 0.24, tM);
    rc.position.set(e * (len / 2 + 0.02), 2.84, 0); rc.rotation.z = -e * 0.14;   // 轻微翅起
    g.add(rc);
  }
  g.add(base, sill);
  g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  g.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  scene.add(g);
}
/* 北墙两段：中间让山体穿院而过 */
cornerPost(-WX, WZN); cornerPost(WX, WZN);
cornerPost(-WX, WZS); cornerPost(WX, WZS);
horseTower(-1.9, WZS, 1); horseTower(1.9, WZS, -1);
cornerPost(-6.8, WZN); cornerPost(7, WZN);
wallSeg(-WX, WZN, -6.8, WZN);
wallSeg(7, WZN, WX, WZN);
wallSeg(-WX, -10, -WX, WZS, [0.292, 0.708]);   // 西墙两扇，间距再拉开 25%
wallSeg(WX, -10, WX, WZS, [0.292, 0.708]);   // 东墙两扇，间距再拉开 25%
wallSeg(-WX, WZS, -1.3, WZS, [0.3, 0.7]);   // 门左两扇
wallSeg(1.3, WZS, WX, WZS, [0.3, 0.7]);   // 门右两扇
/* 四角角柱 */
for (const [cx, cz] of [[-WX, -10], [WX, -10], [-WX, WZS], [WX, WZS]]) {
  const post = box(0.7, 2.7, 0.7, M.wall);
  post.position.set(cx, 1.35, cz);
  scene.add(post);
  const pcap = box(0.85, 0.25, 0.85, M.tile);
  pcap.position.set(cx, 2.8, cz);
  scene.add(pcap);
}
/* 围墙小门楼（一进） */
{
  const gate = new THREE.Group();
  for (const s of [-1, 1]) {
    const pier = box(0.85, 2.8, 1.15, brickM);
    pier.position.set(s * 1.45, 1.4, 0);
    gate.add(pier);
    const pcap = box(1.05, 0.2, 1.35, M.tile);
    pcap.position.set(s * 1.45, 2.9, 0);
    gate.add(pcap);
  }
  const lintel = box(3.0, 0.4, 0.9, M.wood);
  lintel.position.y = 2.65;
  gate.add(lintel);
  /* 徽派门楼檐（v4.22）：白腰带藏椽 + 双坡青瓦 + 竖瓦垄 + 圆脊鸱尾（同墙瓦作一路数） */
  const gTM = tileMat(3.9);
  const belt = box(3.9, 0.18, 2.4, M.wall); belt.position.y = 3.06;   // 封檐腰带：檐下木头全部藏进白带后面
  belt.castShadow = true;
  gate.add(belt);
  for (const sgn of [-1, 1]) {
    const sl = box(3.9, 0.07, 1.15, gTM);
    sl.rotation.x = sgn * 0.3; sl.position.set(0, 3.24, sgn * 0.52);
    sl.castShadow = true; gate.add(sl);
  }
  const grdg = box(4.0, 0.14, 0.18, gTM); grdg.position.y = 3.46; gate.add(grdg);
  const rg2 = new THREE.CylinderGeometry(0.09, 0.09, 4.06, 8); rg2.rotateZ(Math.PI / 2);
  const rmg2 = new THREE.Mesh(rg2, ridgeM); rmg2.position.y = 3.55; rmg2.castShadow = true; gate.add(rmg2);
  const wg2 = new THREE.CylinderGeometry(0.055, 0.055, 1.15, 7); wg2.rotateX(Math.PI / 2);
  const rows2 = 24;
  const im2 = new THREE.InstancedMesh(wg2, ridgeM, rows2 * 2);
  {
    const m4 = new THREE.Matrix4(); const pv = new THREE.Vector3(); const qq = new THREE.Quaternion(); const ee = new THREE.Euler(); const sc2 = new THREE.Vector3(1, 1, 1);
    let k2 = 0;
    for (const sgn of [-1, 1]) {
      const th = sgn * 0.3;
      ee.set(th, 0, 0); qq.setFromEuler(ee);
      for (let j = 0; j < rows2; j++) {
        pv.set(-1.9 + 0.08 + j * 0.16, 3.24 + 0.015 * Math.cos(th), sgn * (0.52 + 0.015 * Math.sin(th)));
        m4.compose(pv, qq, sc2); im2.setMatrixAt(k2++, m4);
      }
    }
  }
  im2.castShadow = true; gate.add(im2);
  for (const e of [-1, 1]) {
    const ck = box(0.2, 0.34, 0.3, ridgeM);   // 鸱尾
    ck.position.set(e * 2.06, 3.62, 0); ck.rotation.z = -e * 0.24;
    gate.add(ck);
  }
  /* 门罩 + 砖雕门套（内外两面） */
  const cg2 = new THREE.CylinderGeometry(0.045, 0.045, 0.64, 6); cg2.rotateX(Math.PI / 2);
  for (const sgn of [-1, 1]) {
    const cap = box(2.8, 0.1, 0.64, gTM); cap.position.set(0, 2.88, sgn * 1.02); cap.castShadow = true; gate.add(cap);
    for (let j = 0; j < 17; j++) {
      const t2 = new THREE.Mesh(cg2, ridgeM);
      t2.position.set(-1.28 + 0.08 + j * 0.155, 2.95, sgn * 1.02);
      gate.add(t2);
    }
    for (const e of [-1, 1]) {
      const qj = box(0.1, 0.15, 0.26, ridgeM);
      qj.position.set(e * 1.48, 2.96, sgn * 1.02); qj.rotation.z = -e * 0.3;
      gate.add(qj);
    }
    for (const e of [-1, 1]) {
      const v2 = box(0.16, 2.5, 0.14, brickM); v2.position.set(e * 1.14, 1.25, sgn * 0.65); gate.add(v2);   /* 砖雕柱止于横眉下（原共面穿插致闪烁） */
    }
    const h2 = box(2.44, 0.2, 0.14, brickM); h2.position.set(0, 2.7, sgn * 0.65); gate.add(h2);
  }
  /* 双扇小门（铰链组：视频里可开合 window.__gateDoors） */
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * 1.12, 0, 0);
    const d = plankDoor(1.1, 1.9);
    d.position.set(-s * 0.55, 0.98, 0);
    hinge.add(d);
    const ring = doorRing(-s * 0.84, 0.98);
    hinge.add(ring);
    gate.add(hinge);
    (window.__gateDoors = window.__gateDoors || []).push(hinge);
  }
  const step = box(2.4, 0.16, 0.6, M.stone);
  step.position.set(0, 0.08, 0.85);
  gate.add(step);
  gate.position.set(0, 0, WZS);
  scene.add(gate);
}

/* ---------------- 牌匾 / 旗 纹理 ---------------- */
const plaqueTexture = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 144;
  const x = c.getContext('2d');
  x.fillStyle = '#241a12'; x.fillRect(0, 0, 512, 144);
  x.strokeStyle = '#8a6a3a'; x.lineWidth = 10; x.strokeRect(8, 8, 496, 128);
  x.fillStyle = '#e8c87a';
  x.font = '72px "KaiTi","STKaiti","Noto Serif CJK SC","WenQuanYi Zen Hei",serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  '秋山客棧'.split('').forEach((ch, i) => x.fillText(ch, 90 + i * 111, 78));
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  return t;
})();
/* 匾额：挪到围墙小门楼南侧（朝桥、朝土路一面） */
{
  const gp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.74),
    new THREE.MeshStandardMaterial({ map: plaqueTexture, roughness: 0.7 }));
  gp.position.set(0, 2.42, WZS + 0.92);
  gp.rotation.x = 0.12;   /* 微俯朝地面 */
  scene.add(gp);
}
const flagTexture = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#efe4c8'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#a83226'; x.lineWidth = 18; x.strokeRect(12, 12, 232, 232);
  x.fillStyle = '#33291e';
  x.font = '150px "KaiTi","STKaiti","Noto Serif CJK SC","WenQuanYi Zen Hei",serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('驛', 128, 138);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  return t;
})();
const windowMat = new THREE.MeshStandardMaterial({
  color: '#e6d7ba', emissive: '#ffb85c', emissiveIntensity: 0.1, roughness: 0.9,
  transparent: true, opacity: 0.42, side: THREE.DoubleSide,
});
dayNight.windows.push(windowMat);
const candleMat = new THREE.MeshStandardMaterial({
  color: '#3a2a18', emissive: '#ffbe6a', emissiveIntensity: 0.15, roughness: 0.8,
});
dayNight.windows.push(candleMat);

function latticeWindow(w, h) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), windowMat));
  const wm = mat('#8a6a44', { map: winWoodTex(1, 0.3), roughness: 0.75 });   /* v641 窗框老木纹（用户令同1楼/阳台） */
  const f1 = box(w + 0.1, 0.07, 0.05, wm); f1.position.z = 0.03;
  const f2 = f1.clone(); f2.position.y = h / 2;
  const f3 = f1.clone(); f3.position.y = -h / 2;
  g.add(f1, f2, f3);
  const bar = box(0.05, h, 0.05, wm);
  for (let i = -1; i <= 1; i++) { const b = bar.clone(); b.position.x = i * w / 3; b.position.z = 0.03; g.add(b); }
  return g;
}
/* 古式门扇：下半木板、上半雕花格窗（糊纸用窗烛材质，入夜透光） */
function latticeDoorPanel(w, h) {
  const g = new THREE.Group();
  const post = mat('#6b4c2b', { map: winWoodTex(0.6, 2), roughness: 0.76 });   /* v641 门框同木纹 */
  for (const s of [-1, 1]) {
    const stile = box(0.07, h, 0.1, post);
    stile.position.x = s * (w / 2 - 0.035);
    g.add(stile);
  }
  const low = box(w - 0.09, h * 0.45, 0.08, M.doorWood);
  low.position.y = -h * 0.255;
  g.add(low);
  const railM = box(w, 0.08, 0.11, post); railM.position.y = -h * 0.01;
  const railT = box(w, 0.07, 0.11, post); railT.position.y = h / 2 - 0.035;
  g.add(railM, railT);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.12, h * 0.46), windowMat);
  paper.position.set(0, h * 0.245, 0.015);
  g.add(paper);
  const bar = box(0.026, h * 0.46, 0.03, post);
  for (const bx of [-w * 0.21, 0, w * 0.21]) {
    const b = bar.clone(); b.position.set(bx, h * 0.245, 0.045); g.add(b);
  }
  const hb = box(w - 0.1, 0.026, 0.03, post);
  for (const by of [0.11, 0.34]) {
    const b = hb.clone(); b.position.set(0, h * by, 0.045); g.add(b);
  }
  return g;
}

/* ---------------- 客栈门屋已拆除：中轴成为空旷前院广场 ---------------- */

/* ---------------- 徽派瓦面屋顶：保持原四坡轮廓，只换围墙同款瓦面（贴图瓦垄+四角垂脊筒瓦） ----------------
   与 roofPyramid 同轮廓同摆位；hx/hz 半跨、h 高 */
function pRoof(hx, h, hz) {
  const g = new THREE.Group();
  const t = tileTex.clone(); t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(5, 2 * hx / 0.42), Math.max(2, h / 0.32));
  const p = roofPyramid(hx, h, hz, mat('#eef0f3', { map: t }));
  g.add(p);
  const L = Math.hypot(hx, hz, h);
  const up = new THREE.Vector3(0, 1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const dir = new THREE.Vector3(-sx * hx, h, -sz * hz).normalize();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, L, 7), ridgeM);
    c.position.set(sx * hx / 2, 0, sz * hz / 2);
    c.quaternion.setFromUnitVectors(up, dir);
    c.castShadow = true;
    g.add(c);
  }
  return g;
}
/* 檐口带 → 围墙同款瓦檐：原灰檐带 + 四周外挑瓦舌（贴面+实体圆瓦垄实例排布）
   + 白圆滴水沿 + 深色圆脊线，罩住椽子木棍 */
function eaveCap(w, d, y) {
  const g = new THREE.Group();
  const hx = w / 2, hz = d / 2;
  g.add(box(w, 0.35, d, M.eaveDark));
  const t = tileTex.clone(); t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(5, w / 0.45), 1);
  const tm = mat('#eef0f3', { map: t });
  const out = 0.62, drop = 0.5;
  const sl = Math.hypot(out, drop), th = Math.atan2(drop, out);
  for (const s of [-1, 1]) {
    const a = box(w + 2 * out + 0.06, 0.06, sl, tm);
    a.position.set(0, -drop / 2 + 0.02, s * (hz + out / 2 - 0.02));
    a.rotation.x = s * th;
    g.add(a);
    const b = box(sl, 0.06, d + 2 * out + 0.06, tm);
    b.position.set(s * (hx + out / 2 - 0.02), -drop / 2 + 0.02, 0);
    b.rotation.z = -s * th;
    g.add(b);
  }
  const up = new THREE.Vector3(0, 1, 0);
  const sinT = Math.sin(th), cosT = Math.cos(th);
  const faces = [];
  for (const s of [-1, 1]) {
    faces.push({ dn: new THREE.Vector3(0, -sinT, s * cosT),
      at: new THREE.Vector3(0, -drop / 2, s * (hz + out / 2 - 0.02)),
      ax: new THREE.Vector3(1, 0, 0), a0: -(hx + out), a1: hx + out });
    faces.push({ dn: new THREE.Vector3(s * cosT, -sinT, 0),
      at: new THREE.Vector3(s * (hx + out / 2 - 0.02), -drop / 2, 0),
      ax: new THREE.Vector3(0, 0, 1), a0: -(hz + out - 0.16), a1: hz + out - 0.16 });
  }
  const step = 0.15;   /* 与围墙顶瓦垄同排布：间距 0.15 */
  let cnt = 0;
  for (const f of faces) cnt += Math.floor((f.a1 - f.a0) / step) + 1;
  const wg = new THREE.CylinderGeometry(0.065, 0.065, sl - 0.06, 7);
  const im = new THREE.InstancedMesh(wg, ridgeM, cnt);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  let k = 0;
  for (const f of faces) {
    q.setFromUnitVectors(up, f.dn);
    const n = Math.floor((f.a1 - f.a0) / step) + 1;
    for (let i = 0; i < n; i++) {
      const p = f.at.clone().addScaledVector(f.ax, f.a0 + i * (f.a1 - f.a0) / (n - 1));
      mtx.compose(p, q, sc);
      im.setMatrixAt(k++, mtx);
    }
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = true;
  g.add(im);
  for (const s of [-1, 1]) {                    /* 白圆滴水沿 + 深色圆脊 */
    const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, w + 2 * out + 0.2, 7), mat('#d8d1c2'));
    c1.rotation.z = Math.PI / 2;
    c1.position.set(0, -drop, s * (hz + out));
    g.add(c1);
    const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, d + 2 * out + 0.2, 7), mat('#d8d1c2'));
    c2.rotation.x = Math.PI / 2;
    c2.position.set(s * (hx + out), -drop, 0);
    g.add(c2);
    const r1 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, w + 0.1, 7), ridgeM);
    r1.rotation.z = Math.PI / 2;
    r1.position.set(0, 0.02, s * (hz + 0.02));
    g.add(r1);
    const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, d + 0.1, 7), ridgeM);
    r2.rotation.x = Math.PI / 2;
    r2.position.set(s * (hx + 0.02), 0.02, 0);
    g.add(r2);
  }
  g.position.y = y;
  return g;
}

window.__mark('主楼内饰');
window.__bootStage = Math.max(window.__bootStage || 0, 2);
/* ---------------- 主楼（北，后半嵌入山体 + 二层阳台） ---------------- */
{
  const inn = new THREE.Group();
  const b1 = wallPanel(7, 3.3, 0.16, M.cream, [
    { cx: 0, cy: 1.42, hw: 1.25, hh: 1.42 },                 /* v5.26 正门洞 2.5×2.84 加高（门扇坐上阶后顶 2.75，原 2.16 门楣吃门半截） */
    { cx: -2.3, cy: 1.95, hw: 0.62, hh: 0.70 },              /* 侧窗洞 */
    { cx: 2.3, cy: 1.95, hw: 0.62, hh: 0.70 },
  ]); b1.position.set(0, 0, 2.2); inn.add(b1);
  { const nb = wallPanel(7, 3.3, 0.16, M.cream, [{ cx: 0, cy: 1.08, hw: 1.1, hh: 1.08 }]); nb.position.set(0, 0, -2.2); inn.add(nb);   /* v5.27 堂北墙改中门洞 2.2×2.16：正对门罩-梯间轴线（原两侧 0.8 窄门被隔断墙视觉遮住，用户找不到梯） */
    const wbL = wallPanel(4.4, 3.3, 0.16, M.cream, [{ cx: 0, cy: 1.95, hw: 0.62, hh: 0.675 }]);
    wbL.rotation.y = Math.PI / 2; wbL.position.set(-3.5, 0, 0); inn.add(wbL);
    const wbR = wallPanel(4.4, 3.3, 0.16, M.cream, [{ cx: 0, cy: 1.95, hw: 0.62, hh: 0.675 }]);
    wbR.rotation.y = -Math.PI / 2; wbR.position.set(3.5, 0, 0); inn.add(wbR); }
  const eave1 = eaveCap(9.5, 6.6, 3.62);
  { const cmat = mat('#6e5f4e', { roughness: 1, flatShading: true });
    const cW = (w2, h2, d2, x2, y2, z2) => { const q = box(w2, h2, d2, cmat); q.position.set(x2, y2, z2); q.receiveShadow = true; inn.add(q); };
    cW(6.6, 2.6, 0.14, 0, 1.3, -10.44); cW(6.6, 2.6, 0.14, 0, 1.3, -12.64);
    cW(0.14, 2.6, 4.44, -3.22, 1.3, -11.52); cW(0.14, 2.6, 4.44, 3.22, 1.3, -11.52);
    cW(1.2, 0.9, 0.14, -2.7, 0.45, -10.72); cW(3.0, 0.9, 0.14, 1.8, 0.45, -10.72);   /* v5.35 矮墙基北移 0.26 贴封带，让出梯脚活动区 */
    cW(1.6, 0.16, 2.16, -2.42, 2.58, -11.52); cW(1.6, 0.16, 2.16, 2.42, 2.58, -11.52);
    cW(3.4, 0.16, 1.04, 0, 2.58, -10.58); cW(3.4, 0.16, 1.24, 0, 2.58, -12.4);
    cW(0.72, 2.6, 0.14, -2.06, 1.3, -8.25); cW(0.72, 2.6, 0.14, 2.06, 1.3, -8.25);   /* v5.27 窖南墙开中门 x±1.7（原 3.4 整板堵轴线） */
    cW(0.9, 2.6, 0.14, -2.75, 1.3, -8.25); cW(0.9, 2.6, 0.14, 2.75, 1.3, -8.25);
    cW(1.0, 0.42, 0.16, -1.9, 2.38, -8.25); cW(1.0, 0.42, 0.16, 1.9, 2.38, -8.25);
    const cfl = box(3.66, 0.08, 1.76, M.stone); cfl.position.set(0, 0.05, -9.6); inn.add(cfl);
    const clt = new THREE.PointLight('#c98d4f', 1.15, 5.5, 1.9); clt.position.set(0, 2.1, -9.9); inn.add(clt);
    const cbr = box(0.1, 0.24, 0.1, mat('#ffd9a0', { emissive: '#ffb060', emissiveIntensity: 0.8 })); cbr.position.set(0, 2.12, -10.38); inn.add(cbr);
    for (let i = 0; i < 5; i++) { const rk = box(0.55 + (i % 2) * 0.2, 0.3 + (i % 3) * 0.08, 0.12, i % 2 ? M.rock : M.stone); rk.position.set(-1.35 + i * 0.68, 0.22 + (i % 2) * 0.06, -10.36); rk.rotation.z = (i % 2 ? 1 : -1) * 0.07; inn.add(rk); }
    const cbin = box(0.9, 0.7, 0.5, M.woodDark); cbin.position.set(-1.25, 0.4, -10.05); inn.add(cbin);
    for (let i = 0; i < 3; i++) { const j = cyl(0.13, 0.15, 0.34, 8, i === 1 ? mat('#4a6a66', { roughness: 0.35 }) : M.wall); j.position.set(1.0 + (i % 2) * 0.42, 0.2, -10.0 + i * 0.2); inn.add(j); } }
  const skirt = pRoof(4.5, 2.3, 2.35); skirt.position.y = 4.6;   /* v5.33e 复原：抬裙致窗上沿空洞；室内改藻井 */   /* v5.33d 抬 0.5 压脊 0.35：坡体整体入屋顶腔（脊 7.1<吊顶 7.36），二楼室内告别屋中屋顶；外观仍双坡腰檐 */
  rafters(inn, 4.85, 3.4, 3.42);
  const b2 = wallPanel(4.6, 2.8, 0.16, M.cream, [
    { cx: 0, cy: 0.82, hw: 1.1, hh: 0.82 },                  /* v5.35 阳台门洞落回地面（v5.33 误当窗抬高 0.56→门坎挡住阳台栏杆全看不见） */
    { cx: -1.72, cy: 1.07, hw: 0.44, hh: 0.44 },   /* v627 与壳洞/格窗三者同轴 y5.39..6.27 */
    { cx: 1.72, cy: 1.07, hw: 0.44, hh: 0.44 },
  ]); b2.position.set(0, 4.75, 1.6); inn.add(b2);
  { const n2 = wallPanel(4.6, 2.8, 0.16, M.cream, []); n2.position.set(0, 4.75, -1.6); inn.add(n2);
    const w2L = wallPanel(3.2, 2.8, 0.16, M.cream, [{ cx: 0, cy: 1.2, hw: 0.47, hh: 0.42 }, { cx: -1.05, cy: 1.2, hw: 0.45, hh: 0.55 }]);   /* v5.33 矮窗落地改窗台 0.53 */
    w2L.rotation.y = Math.PI / 2; w2L.position.set(-2.3, 4.75, 0); inn.add(w2L);
    const w2R = wallPanel(3.2, 2.8, 0.16, M.cream, [{ cx: 0, cy: 1.2, hw: 0.47, hh: 0.42 }]);
    w2R.rotation.y = -Math.PI / 2; w2R.position.set(2.3, 4.75, 0); inn.add(w2R); }
  const eave2 = eaveCap(7.2, 5.2, 7.72);   /* v5.35y 2层次檐整体抬至壳顶之上（原 7.22 环体砸客房天花板=黑屋顶真身） */
  const roof2 = pRoof(3.35, 2.5, 2.35); roof2.position.y = 8.3;
  rafters(inn, 3.6, 2.6, 7.02);
  inn.add(eave1, skirt, eave2, roof2);
  roofFinial(inn, 3.35, 2.5, 9.55);
  /* 回廊柱 + 正堂四扇古式门（上雕花格窗·下木板） + 台阶 */
  for (const x of [-2.7, -1.1, 1.1, 2.7]) {
    const p = cyl(0.13, 0.15, 3.3, 8, M.woodRed);
    p.position.set(x, 1.65, 2.55);
    inn.add(p);
  }

  for (let i = 0; i < 3; i++) {
    const st = box(2.6 + i * 0.35, 0.2, 0.42, M.stone);
    st.position.set(0, 0.5 - i * 0.2, 2.85 + i * 0.4);
    inn.add(st);
  }
  /* 二层阳台（望前院和门外河景） */
  const bal = new THREE.Group();
  const floorB = box(4.9, 0.12, 1.35, M.wood); floorB.position.set(0, 4.62, 2.25);
  const sup1 = box(0.12, 1.2, 1.1, M.wood); sup1.position.set(-2.0, 3.95, 2.25);
  const sup2 = sup1.clone(); sup2.position.x = 2.0;
  bal.add(floorB, sup1, sup2);
  for (let i = 0; i < 7; i++) {
    const post = cyl(0.05, 0.05, 0.95, 5, M.wood);
    post.position.set(-2.3 + i * 0.767, 5.15, 2.85);
    bal.add(post);
  }
  const railTop = cyl(0.045, 0.045, 4.9, 6, M.wood);
  railTop.rotation.z = Math.PI / 2;
  railTop.position.set(0, 5.62, 2.85);
  bal.add(railTop);
  for (const s of [-1, 1]) {
    const side = cyl(0.045, 0.045, 1.3, 6, M.wood);
    side.rotation.x = Math.PI / 2;
    side.position.set(s * 2.42, 5.62, 2.25);
    bal.add(side);
    for (const dz of [1.7, 2.4]) {
      const post = cyl(0.05, 0.05, 0.95, 5, M.wood);
      post.position.set(s * 2.42, 5.15, dz);
      bal.add(post);
    }
  }
  inn.add(bal);
  /* 二层通阳台：四扇古式格门 + 两侧小格窗 + 壁挂小油灯一对 + 二层东西侧窗 */
  /* v627 外立面假扇+环拆除：与真门（door2F 铰链扇）同位叠影，看着像一排旧门卡位 */
  const tw = latticeWindow(2.5, 0.55); tw.position.set(0, 6.95, 1.72); inn.add(tw);
  for (const s of [-1, 1]) {
    /* v632 旧格窗装饰 wn 摘除：阳台看是灯笼下悬空木架（用户图1红圈，v628 误删整条 bal 已回滚） */
    const lp = makeLantern(inn, s * 1.72, 6.02, 1.78, true);
    lp.scale.setScalar(0.7);
  }
  for (const s of [-1, 1]) {
    const wE = latticeWindow(0.9, 0.8);
    wE.position.set(s * 2.4, 5.95, 0);
    wE.rotation.y = s * Math.PI / 2;
    inn.add(wE);
  }
  for (const x of [-2.3, 2.3]) {
    const w1 = latticeWindow(1.2, 1.35); w1.position.set(x, 1.95, 2.3); inn.add(w1);
  }
  for (const s of [-1, 1]) {
    const wS = latticeWindow(1.2, 1.3);
    wS.position.set(s * 3.6, 1.95, 0); wS.rotation.y = s * Math.PI / 2;
    inn.add(wS);
  }
  inn.position.set(0, 0, -6.5);
  scene.add(inn);
  window.__shellInn = inn;
}

/* ---------------- 东西厢房（木檐 + 椽子） ---------------- */
function wing(x, rotDoor) {
  const g = new THREE.Group();
  const b = wallPanel(3.4, 2.7, 0.16, M.cream, [{ cx: 0, cy: 0.90, hw: 1.02, hh: 0.90 }]);   /* 院侧门洞 2.04×1.80 与门扇齐 */
  b.rotation.y = rotDoor * Math.PI / 2;
  b.position.set(rotDoor * (-2.5), 0, 0); g.add(b);
  { const nb = wallPanel(5, 2.7, 0.16, M.cream, []); nb.position.set(0, 0, -1.7); g.add(nb);
    const sb = wallPanel(5, 2.7, 0.16, M.cream, [{ cx: -1.35, cy: 1.6, hw: 0.47, hh: 0.47 }, { cx: 1.35, cy: 1.6, hw: 0.47, hh: 0.47 }]);
    sb.position.set(0, 0, 1.7); g.add(sb);
    const eb = wallPanel(3.4, 2.7, 0.16, M.cream, []); eb.rotation.y = Math.PI / 2; eb.position.set(rotDoor * 2.42, 0, 0); g.add(eb); }
  const e = eaveCap(6.0, 4.4, 3.02);
  const r = pRoof(2.75, 1.7, 1.95); r.position.y = 3.7;
  rafters(g, 3.05, 2.25, 2.8);
  g.add(e, r);
  roofFinial(g, 2.75, 1.7, 4.55);
  /* 朝向院心真门洞（门环由铰链门自带） */
  /* 南面（朝广场）各开两扇格窗 */
  for (const dx of [-1.35, 1.35]) {
    const wn = latticeWindow(0.9, 0.9);
    wn.position.set(dx, 1.6, 1.71);
    g.add(wn);
  }
  g.position.set(x, 0, -1.5);
  scene.add(g);
  return g;
}
window.__shellWingE = wing(5.5, 1);
const wingW = window.__shellWingW = wing(-5.5, -1);
/* 西厢烟囱 + 炊烟 */
{
  const chimney = box(0.55, 1.3, 0.55, M.stone);
  chimney.position.set(1.2, 4.2, 0);
  wingW.add(chimney);
  const smoke = [];
  for (let i = 0; i < 6; i++) {
    const sm = new THREE.SpriteMaterial({ map: null, color: '#e8e4da', transparent: true, opacity: 0.32, depthWrite: false });
    const p = new THREE.Sprite(sm);
    p.position.set(1.2, 5.0 + i * 0.42, rr(-0.1, 0.1));
    p.scale.set(1.2, 1.2, 1);
    wingW.add(p);
    smoke.push(p);
  }
  wingW.userData.smoke = smoke;
  wingW.userData.chimneyTop = 5.0;
  scene.userData.smokeSet = wingW;
  window.__smokeTexReady = () => { for (const p of smoke) { p.material.map = cloudTex; p.material.needsUpdate = true; } };
}
/* ---------------- 🏠 室内精装 v4.87：主楼两层 + 东厢浴室澡塘 + 西厢食堂 ---------------- */
{
  const IN = new THREE.Group();
  const Mf = {
    plank: mat('#8a6a42', { roughness: 0.82 }),
    plankDark: mat('#5d4426', { roughness: 0.86 }),
    wallIn: mat('#efe6d4', { roughness: 0.92, side: THREE.DoubleSide, map: (() => { const t = new THREE.CanvasTexture(AGING_CANVAS); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.2, 1); return t; })() }),   /* v643 窗洞衬板/二层壳墙做旧：四角不再惨白 */
    wainscot: mat('#4f3b24', { roughness: 0.8, side: THREE.DoubleSide }),
    beam: mat('#3c2c1c', { roughness: 0.85 }),
    bedsheet: mat('#e9e2d0', { roughness: 0.9 }),
    quiltR: mat('#9c3b31', { roughness: 0.85 }),
    quiltB: mat('#39506b', { roughness: 0.85 }),
    pillow: mat('#f2ead6', { roughness: 0.9 }),
    screen: mat('#7a5636', { roughness: 0.8 }),
    paper: mat('#f4e9c8', { roughness: 0.95, transparent: true, opacity: 0.96 }),
    lampGlow: new THREE.MeshBasicMaterial({ color: '#e8a24a' }),
    lampGlow2: new THREE.MeshBasicMaterial({ color: '#ff9b52' }),
    stoneTile: mat('#9a958a', { roughness: 0.7, side: THREE.DoubleSide }),
    bathWater: null,
    curtain: mat('#8f7a52', { roughness: 0.95, side: THREE.DoubleSide }),
    barrel: mat('#6e5334', { roughness: 0.78 }),
    iron: mat('#2a2d31', { roughness: 0.55, metalness: 0.5 }),
    fire: new THREE.MeshBasicMaterial({ color: '#ff7a2e' }),
    jarGlaze: mat('#4a6a66', { roughness: 0.35 }),
    grainSack: mat('#b3a37a', { roughness: 0.95 }),
    porcelain: mat('#eef2f0', { roughness: 0.25 }),
  };
  const boxI = (w, h, d, mt) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); b.castShadow = b.receiveShadow = true; return b; };
  const glowLamp = (x, y, z, r, warm) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), warm ? Mf.lampGlow2 : Mf.lampGlow);
    s.position.set(x, y, z); IN.add(s);
    return s;
  };
  /* ======== 主楼 · 一层 ======== */
  {
    const Z0 = -6.5, HW = 3.35, HD = 2.1;   // 内腔 x±3.3 z -8.6..-4.4
    const floor = boxI(6.7, 0.1, 4.2, Mf.plank); floor.position.set(0, 0.07, Z0); IN.add(floor);
    for (let i = 0; i < 9; i++) { const p = boxI(6.7, 0.022, 0.05, Mf.plankDark); p.position.set(0, 0.126, Z0 - 1.9 + i * 0.48); IN.add(p); }
    /* 内墙皮（外壳已组合板化，仅留踢脚线） */
    const wallBack = boxI(6.8, 3.2, 0.08, Mf.wallIn); wallBack.position.set(0, 1.72, Z0 - HD); wallBack.visible = false; IN.add(wallBack);
    for (const s of [-1, 1]) {
      const wside = boxI(0.08, 3.2, 4.2, Mf.wallIn); wside.position.set(s * HW, 1.72, Z0); wside.visible = false; IN.add(wside);
      const wc = boxI(0.02, 0.85, 4.2, Mf.wainscot); wc.position.set(s * (HW - 0.16), 0.55, Z0); IN.add(wc);
    }
    { const W0 = Z0 - HD + 0.09;   /* v5.32 北护壁拆中段：中门洞开在旧整幅护壁上，悬空半米板挡门（用户'木板挡着但可以穿过'） */
      for (const s of [-1, 1]) { const wg = boxI(2.3, 0.85, 0.02, Mf.wainscot); wg.position.set(s * 2.25, 0.55, W0); IN.add(wg); } }
    /* 天花 + 梁 */
    const ceil = boxI(6.7, 0.06, 4.2, Mf.wallIn); ceil.position.set(0, 3.32, Z0); IN.add(ceil);
    for (let i = 0; i < 4; i++) { const bm = boxI(6.7, 0.22, 0.16, Mf.beam); bm.position.set(0, 3.14, Z0 - 1.55 + i * 1.05); IN.add(bm); }
    const ridge = boxI(0.2, 0.24, 4.2, Mf.beam); ridge.position.set(0, 3.1, Z0); IN.add(ridge);
    /* 隔墙两条（x=±1.75）留门洞 */
    for (const s of [-1, 1]) {   /* v5.19b 隔断墙接南北墙（原留 0.9 缝远看像悬空板墙）；门洞收整 1.5 中券 */
      const pw = boxI(0.12, 3.2, 1.7, Mf.wallIn); pw.position.set(s * 1.75, 1.72, -7.85); IN.add(pw);
      const pw2 = boxI(0.12, 3.2, 1.15, Mf.wallIn); pw2.position.set(s * 1.75, 1.72, -4.925); IN.add(pw2);
      const pwT = boxI(0.12, 0.8, 1.5, Mf.wallIn); pwT.position.set(s * 1.75, 2.8, -6.25); IN.add(pwT);
    }
    IN.userData.c0 = IN.children.length;   /* v5.17 一楼杂物清空：此后至二层前的全部陈设可一键隐藏（柜台/桌凳/炕/挂画/匾额/吊灯罩） */
    /* 中厅柜台 */
    const counter = boxI(2.4, 1.06, 0.55, Mf.plankDark); counter.position.set(0.1, 0.65, -8.08);   /* v4.98 西移让开东廊→酒窖门洞 x1.5..2.3 */ IN.add(counter);
    const cTop = boxI(2.6, 0.07, 0.72, Mf.screen); cTop.position.set(0.1, 1.22, -8.08); IN.add(cTop);
    const abacus = boxI(0.42, 0.06, 0.26, Mf.iron); abacus.position.set(-0.6, 1.29, -8.06); IN.add(abacus);
    const led = boxI(0.06, 0.3, 0.03, Mf.lampGlow2); led.position.set(-0.6, 1.5, -8.14); IN.add(led);
    const book = boxI(0.3, 0.06, 0.22, Mf.paper); book.position.set(0.75, 1.28, -8.05); book.rotation.y = 0.3; IN.add(book);
    const stool = boxI(0.34, 0.5, 0.34, Mf.barrel); stool.position.set(0.1, 0.37, -7.5); IN.add(stool);
    /* 柜台后酒柜 */
    const shelf = boxI(0.4, 2.3, 2.2, Mf.plankDark); shelf.position.set(-3.15, 1.27, -5.0); IN.add(shelf);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
      const jr = cyl(0.09, 0.11, 0.26, 8, (i + j) % 2 ? Mf.jarGlaze : Mf.porcelain);
      jr.position.set(-2.96, 0.55 + i * 0.72, -7.7 + j * 0.62); IN.add(jr);
    }
    /* 中厅方桌条凳（柜台腾开后的视觉主体） */
    const mt = boxI(1.15, 0.14, 1.15, Mf.screen); mt.position.set(-0.7, 0.76, -5.85);   /* v4.98 西移，东廊取道不绕桌 */ IN.add(mt);
    for (const s of [-1, 1]) { const ml = boxI(0.1, 0.66, 0.1, Mf.beam); ml.position.set(-0.7 + s * 0.42, 0.42, -5.85); IN.add(ml); }
    for (const s of [-1, 1]) { const bn = boxI(0.32, 0.42, 1.5, Mf.plank); bn.position.set(-0.7, 0.42, -5.85 + s * 0.92); IN.add(bn); }
    const teapot = cyl(0.1, 0.11, 0.15, 8, Mf.iron); teapot.position.set(-0.7, 0.91, -5.85); IN.add(teapot);
    /* 北墙：墙裙乱石带（低矮自然）+ 大幅山水挂屏，去掉"半截塌山体"感 */
    for (let i = 0; i < 9; i++) {
      const rk = boxI(0.72 + (i % 3) * 0.14, 0.26 + (i % 2) * 0.1, 0.1 + (i % 2) * 0.04, i % 2 ? Mf.stoneTile : Mf.rock);
      rk.position.set(i < 4 ? -3.02 + i * 0.72 : 0.85 + (i - 4) * 0.72, 0.18 + (i % 3) * 0.05, -8.5); rk.rotation.z = (i % 2 ? 1 : -1) * 0.05; IN.add(rk);   /* v4.98 中间让开 ±1.9 酒窖动线 */
    }
    const pscr = boxI(2.3, 1.5, 0.06, Mf.beam); pscr.position.set(0, 2.0, -8.4); IN.add(pscr);
    const pnl = new THREE.Mesh(new THREE.PlaneGeometry(2.14, 1.34), Mf.paper); pnl.position.set(0, 2.0, -8.35); IN.add(pnl);
    const pine = boxI(0.62, 0.62, 0.02, mat('#3e5b3b')); pine.position.set(-0.4, 2.2, -8.34); pine.rotation.z = 0.5; IN.add(pine);
    const rockp = boxI(0.44, 0.52, 0.02, mat('#6b6558')); rockp.position.set(0.55, 1.78, -8.34); IN.add(rockp);
    const fall = boxI(0.06, 0.8, 0.02, mat('#a8c8cc')); fall.position.set(0.15, 2.15, -8.33); IN.add(fall);
    /* 匾额「客栈」+ 大堂吊灯 */
    const sign = boxI(1.5, 0.5, 0.07, Mf.screen); sign.position.set(0.7, 2.62, -8.3); IN.add(sign);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.3), Mf.paper); sg.position.set(0.7, 2.62, -8.24); IN.add(sg);
    const lace = cyl(0.02, 0.02, 0.5, 4, Mf.beam); lace.position.set(0, 3.02, -5.9); IN.add(lace);
    glowLamp(0, 2.68, -5.9, 0.11);
    const pl1 = new THREE.PointLight('#ffd27a', 1.35, 8, 1.8); pl1.position.set(0, 2.6, -5.9); IN.add(pl1);
    /* 西偏：客房（上炕：床+炕桌+被褥+盆架） */
    {
      const bx = -2.55;
      const kang = boxI(1.3, 0.45, 2.0, Mf.plank); kang.position.set(bx, 0.34, -7.4); IN.add(kang);
      const kd = boxI(1.24, 0.1, 1.9, Mf.bedsheet); kd.position.set(bx, 0.62, -7.4); IN.add(kd);
      const ql = boxI(1.22, 0.14, 0.9, Mf.quiltR); ql.position.set(bx, 0.72, -7.8); IN.add(ql);
      const plw = boxI(0.5, 0.12, 0.34, Mf.pillow); plw.position.set(bx, 0.75, -6.68); IN.add(plw);
      const kt = boxI(0.62, 0.36, 0.62, Mf.screen); kt.position.set(bx, 0.86, -7.35); IN.add(kt);
      const stand = cyl(0.05, 0.07, 0.8, 6, Mf.barrel); stand.position.set(bx + 0.5, 0.52, -5.6); IN.add(stand);
      const basin = cyl(0.18, 0.13, 0.1, 10, Mf.porcelain); basin.position.set(bx + 0.5, 0.95, -5.6); IN.add(basin);
      glowLamp(bx, 2.9, -7.0, 0.1);
      const pl2 = new THREE.PointLight('#ffd9a0', 0.7, 5.5, 1.8); pl2.position.set(bx, 2.4, -7.0); IN.add(pl2);
    }
    /* 东偏：茶座客房（方桌+圆凳+炭盆+窗光） */
    {
      const bx = 2.55;
      const tab = boxI(0.9, 0.5, 0.9, Mf.screen); tab.position.set(bx, 0.62, -6.6); IN.add(tab);
      const tTop = boxI(1.0, 0.07, 1.0, Mf.plankDark); tTop.position.set(bx, 0.9, -6.6); IN.add(tTop);
      const pot = cyl(0.11, 0.12, 0.16, 8, Mf.iron); pot.position.set(bx, 1.02, -6.6); IN.add(pot);
      for (const a of [[0.62, 0.2], [-0.6, 0.1], [0.1, 0.66]]) {
        const st = cyl(0.16, 0.18, 0.44, 8, Mf.barrel); st.position.set(bx + a[0], 0.34, -6.6 + a[1]); IN.add(st);
      }
      const bed2 = boxI(1.5, 0.42, 0.85, Mf.plank); bed2.position.set(bx, 0.33, -8.0); IN.add(bed2);
      const bd2 = boxI(1.44, 0.1, 0.78, Mf.bedsheet); bd2.position.set(bx, 0.59, -8.0); IN.add(bd2);
      const q2 = boxI(1.4, 0.12, 0.42, Mf.quiltB); q2.position.set(bx, 0.68, -8.18); IN.add(q2);
      glowLamp(bx, 2.9, -6.6, 0.1);
      const pl3 = new THREE.PointLight('#ffd9a0', 0.7, 5.5, 1.8); pl3.position.set(bx, 2.4, -6.6); IN.add(pl3);
    }
    /* v4.99 楼梯迁往石室尾端山腹梯井（见内景块末），前梯拆除腾出西次间 */
    {
      const bedX = -1.6;
      const nb2 = boxI(1.9, 0.4, 1.4, Mf.plank); nb2.position.set(bedX, 0.34, -7.5); IN.add(nb2);
      const nb3 = boxI(1.82, 0.1, 1.32, Mf.bedsheet); nb3.position.set(bedX, 0.58, -7.5); IN.add(nb3);
      const nq = boxI(1.76, 0.12, 0.72, Mf.quiltR); nq.position.set(bedX, 0.67, -7.85); IN.add(nq);
      const np2 = boxI(0.5, 0.12, 0.32, Mf.pillow); np2.position.set(bedX, 0.68, -7.0); IN.add(np2);
      const nh = boxI(0.1, 0.9, 1.5, Mf.screen); nh.position.set(bedX - 1.0, 0.6, -7.5); IN.add(nh);
      const nd = boxI(0.7, 0.06, 0.9, Mf.plankDark); nd.position.set(bedX + 0.9, 0.5, -6.1); IN.add(nd);
      glowLamp(bedX, 2.5, -7.6, 0.08);
    }
  }
  {   /* v5.17 用户令：客栈 1 楼杂物全删，只留墙地梁柱梯——隐藏 c0 之后的陈设 mesh（光源保留） */
    for (let i = IN.userData.c0; i < IN.children.length; i++) {
      const o = IN.children[i];
      o.traverse(x => { if (x.isMesh) x.visible = false; });
    }
  }
  window.__doors = window.__doors || [];   /* v618b 提前登记：二层观景窗在壳建造段就要 push（原初始化在 4127 太晚） */
  /* ======== 主楼 · 二层 ======== */
  {
    const Z0 = -6.5;
    const f2b = boxI(6.8, 0.12, 3.75, Mf.plank); f2b.position.set(0, 4.78, -6.725); IN.add(f2b);   /* v617 楼板北推贴壳墙 -8.6：0.55m 危险零头平台消失 */
    /* v617 房后墙整排拆除（用户'右边白墙没去掉'）：梯口→平台由井栏+壳墙门洞收边，视野一通到底 */
    /* v4.99 二层后扩山腹段：地板 + 岩顶横梁封檐 + 东西内墙 + 北檐室通梯室格门洞 + 窖延段壳/内衬 */
    const f2e = boxI(5.0, 0.14, 3.6, Mf.plank); f2e.position.set(0, 4.78, -9.82); f2e.visible = false; IN.add(f2e);
    {   /* v5.20 新梯洞改西端 x-2.4..-1.2 z-11.15..-10.15：补板=全板减洞口 */
      /* v614 q 板重排对齐 v601 大洞 x-2.4..-0.7 z-11.48..-8.6：q4 原封板正盖二段梯头顶（鹈鹕上不来真凶） */
      const q1 = boxI(3.15, 0.14, 3.6, Mf.plank); q1.position.set(0.875, 4.78, -9.82); IN.add(q1);
      const q3 = boxI(1.7, 0.14, 0.16, Mf.plank); q3.position.set(-1.55, 4.78, -11.54); IN.add(q3);
      const q5 = boxI(0.9, 0.14, 3.6, Mf.plank); q5.position.set(-2.9, 4.78, -9.82); IN.add(q5);
      /* v5.90 q6 封板撤销：新梯 19 级正是从 x-2.47 顶上此洞，板在=梯顶天花板（用户：门洞没了根本上不去） */

    }
    for (let i2 = 0; i2 < 4; i2++) { const bm2 = boxI(5.0, 0.14, 0.12, Mf.beam); bm2.position.set(0, 7.28, -8.6 - i2 * 0.85); IN.add(bm2); }
    for (const s2 of [-1, 1]) { const wS2 = boxI(0.1, 2.6, 3.65, Mf.wallIn); wS2.position.set(s2 * 2.5, 6.13, -9.8); IN.add(wS2); }
    const hb2 = wallPanel(7, 3.2, 0.16, M.cream, [{ cx: -0.9, cy: 1.08, hw: 1.2, hh: 1.08 }]); hb2.position.set(0, 0, -11.62); IN.add(hb2);
    const cWn = boxI(7.2, 3.4, 0.12, Mf.wallIn); cWn.position.set(0, 1.7, -11.68); IN.add(cWn);
    for (const s of [-1, 1]) { const wS = boxI(0.08, 2.6, 3.1, Mf.wallIn); wS.position.set(s * 2.25, 6.13, Z0); IN.add(wS); }
    const c2 = boxI(4.5, 0.06, 3.1, Mf.wallIn); c2.position.set(0, 7.44, Z0); IN.add(c2);
    for (let i = 0; i < 3; i++) { const bm = boxI(4.5, 0.16, 0.13, Mf.beam); bm.position.set(0, 7.3, Z0 - 1.0 + i * 1.0); IN.add(bm); }
    IN.userData.c2 = IN.children.length;   /* v5.20 二楼清空段起点 */
    /* 通间大平层：北墙主卧 + 东茶角 + 西书角 + 南阳台门厅 */
    {
      const kb = boxI(2.0, 0.42, 1.5, Mf.plank); kb.position.set(-0.55, 5.05, Z0 - 0.72); IN.add(kb);
      const kb2 = boxI(1.9, 0.1, 1.42, Mf.bedsheet); kb2.position.set(-0.55, 5.32, Z0 - 0.72); IN.add(kb2);
      const kq = boxI(1.84, 0.13, 0.8, Mf.quiltB); kq.position.set(-0.55, 5.43, Z0 - 1.12); IN.add(kq);
      for (const s of [-1, 1]) { const kp = boxI(0.56, 0.13, 0.34, Mf.pillow); kp.position.set(-0.55 + s * 0.42, 5.44, Z0 - 0.22); IN.add(kp); }
      const hed = boxI(2.1, 0.7, 0.09, Mf.screen); hed.position.set(-0.55, 5.75, Z0 - 1.44); IN.add(hed);
      for (const s of [-1, 1]) { const ns = boxI(0.42, 0.5, 0.42, Mf.screen); ns.position.set(s * 1.28, 5.09, Z0 - 1.15); IN.add(ns); const ln = glowLamp(s * 1.28, 5.5, Z0 - 1.15, 0.07); }
      const ls = boxI(1.6, 0.09, 0.45, Mf.plankDark); ls.position.set(0, 6.35, Z0 - 1.42); IN.add(ls);
      const scr2 = boxI(0.8, 0.55, 0.05, Mf.paper); scr2.position.set(-0.3, 6.78, Z0 - 1.46); IN.add(scr2);
    }
    { /* 东茶角：矮几+坐垫+炭炉 */
      const tb = boxI(0.9, 0.34, 0.6, Mf.screen); tb.position.set(1.6, 4.99, Z0 + 0.75); IN.add(tb);
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), Mf.bedsheet); cl.rotation.x = -Math.PI / 2; cl.position.set(1.55, 4.85, Z0 + 0.75); IN.add(cl);
      const st = cyl(0.14, 0.15, 0.16, 8, Mf.iron); st.position.set(1.6, 5.24, Z0 + 0.75); IN.add(st);
      for (const s of [-1, 1]) { const cc = cyl(0.07, 0.07, 0.07, 8, Mf.porcelain); cc.position.set(1.6 + s * 0.26, 5.2, Z0 + 0.75); IN.add(cc); }
      glowLamp(1.6, 6.6, Z0 + 0.75, 0.09);
    }
    { /* 西书角：书架+书案+文房 */
      const bk = boxI(0.35, 1.9, 1.5, Mf.plankDark); bk.position.set(-2.05, 5.81, Z0 - 0.5); IN.add(bk);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const bd2 = boxI(0.05, 0.24, 0.18, (i + j) % 2 ? Mf.quiltR : Mf.screen); bd2.position.set(-1.9, 5.2 + i * 0.6, Z0 - 1.0 + j * 0.5); IN.add(bd2); }
      const ds = boxI(0.75, 0.06, 1.15, Mf.plankDark); ds.position.set(-1.5, 5.53, Z0 + 0.85); IN.add(ds);
      for (const s of [-1, 1]) { const dl = boxI(0.07, 0.72, 0.07, Mf.beam); dl.position.set(-1.5 + s * 0.3, 5.18, Z0 + 0.85); IN.add(dl); }
      const ink = cyl(0.05, 0.06, 0.08, 8, Mf.iron); ink.position.set(-1.35, 5.6, Z0 + 1.15); IN.add(ink);
      const roll = cyl(0.04, 0.04, 0.5, 6, Mf.paper); roll.rotation.x = Math.PI / 2; roll.position.set(-1.6, 5.58, Z0 + 0.6); IN.add(roll);
      glowLamp(-1.5, 6.6, Z0 + 0.85, 0.09);
    }
    { /* v4.99 隔断两客房 + 后段梯厅 */
      const div1 = boxI(0.1, 2.5, 1.62, Mf.wallIn); div1.position.set(0.72, 6.05, -5.76); IN.add(div1);
      const div2 = boxI(0.1, 2.5, 2.9, Mf.wallIn); div2.position.set(0.72, 6.05, -9.05); IN.add(div2);
      const div3 = boxI(0.5, 2.5, 0.1, Mf.wallIn); div3.position.set(2.3, 6.05, -10.45); IN.add(div3);
      const div3b = boxI(0.42, 2.5, 0.1, Mf.wallIn); div3b.position.set(1.11, 6.05, -10.45); IN.add(div3b);   /* v4.99e 东次间北墙门洞 x1.35..2.05 */
      /* v614 屏风格栅 dbd/lat2 拔除：z-4.9x 恰在四扇阳台门同一线=用户圈"错误栏杆"（扫描区 z<-5.0 当年漏网） */
      /* 东客房（f2 东次间） */
      const eb2 = boxI(1.5, 0.4, 1.3, Mf.plank); eb2.position.set(1.62, 5.0, -6.45); IN.add(eb2);
      const eb3 = boxI(1.42, 0.1, 1.22, Mf.bedsheet); eb3.position.set(1.62, 5.24, -6.45); IN.add(eb3);
      const eq = boxI(1.36, 0.12, 0.66, Mf.quiltB); eq.position.set(1.62, 5.33, -6.8); IN.add(eq);
      const ep = boxI(0.46, 0.12, 0.3, Mf.pillow); ep.position.set(1.62, 5.34, -6.0); IN.add(ep);
      const eh = boxI(1.6, 0.66, 0.08, Mf.screen); eh.position.set(1.62, 5.55, -5.62); IN.add(eh);
      const ed2 = boxI(0.66, 0.55, 0.42, Mf.plankDark); ed2.position.set(2.1, 5.1, -7.3); IN.add(ed2);
      glowLamp(1.62, 6.5, -6.3, 0.08);
    }
    IN.userData.stairMark = IN.children.length;   /* v5.33 楼梯+门厅段起点（免遭清场误杀） */
    { /* v601 L形转角梯（用户设计图）：13级西上 42° → 转角平台 y3.5 → 5级南上缓梯直通二楼梯口，出梯面客房门洞不撞墙 */
      for (let i2 = 0; i2 < 13; i2++) {
        const x2 = 2.46 - i2 * 0.274;
        const s2 = boxI(0.28, 0.12, 1.0, Mf.plank); s2.position.set(x2, 0.25 + i2 * 0.248, -10.65); IN.add(s2);
        const rv = boxI(0.05, 0.248, 1.0, Mf.plankDark); rv.position.set(x2 - 0.14, 0.125 + i2 * 0.248, -10.65); IN.add(rv);
      }
      const land = boxI(1.6, 0.14, 1.55, Mf.plank); land.position.set(-1.55, 3.43, -10.7); IN.add(land);
      {   /* v611 井道东西两边补楼板（FLOORS 有碰撞但当年 mesh 没建=看着是洞） */
        const plE9 = boxI(0.95, 0.14, 3.6, Mf.plank); plE9.position.set(2.88, 4.71, -9.82); IN.add(plE9);
        const plW9 = boxI(0.95, 0.14, 3.6, Mf.plank); plW9.position.set(-2.88, 4.71, -9.82); IN.add(plW9);
      }
      const landL = boxI(0.06, 0.9, 1.55, Mf.plankDark); landL.position.set(-1.55, 2.98, -9.9); IN.add(landL);
      for (let i2 = 0; i2 < 5; i2++) {
        const z2 = -9.75 + i2 * 0.22;
        const s2 = boxI(1.0, 0.12, 0.24, Mf.plank); s2.position.set(-1.55, 3.63 + i2 * 0.256, z2); IN.add(s2);
        const rv = boxI(1.0, 0.256, 0.05, Mf.plankDark); rv.position.set(-1.55, 3.5 + i2 * 0.256 + 0.128, z2 - 0.12); IN.add(rv);
      }
      const flS = boxI(6.6, 0.07, 3.5, M.stone); flS.position.set(0, 0.045, -9.85); IN.add(flS);   /* v5.36 梯步间石板地铺平（FLOORS 同步加宽） */
      { /* v601 斜梁随 L 形拆两段：一段 3.6m 西上，二段 1.7m 南上 */
        const sgL = boxI(3.9, 0.26, 0.06, Mf.beam); sgL.position.set(0.9, 1.85, -10.13); sgL.rotation.z = -0.733; IN.add(sgL);
        const sgR = boxI(3.9, 0.26, 0.06, Mf.beam); sgR.position.set(0.9, 1.85, -11.17); sgR.rotation.z = -0.733; IN.add(sgR);
        const sgS = boxI(0.06, 0.26, 1.7, Mf.beam); sgS.position.set(-2.12, 4.0, -9.1); sgS.rotation.x = -0.85; IN.add(sgS);   /* v621 三段式镜像病：二段梯向南升高 +0.85=向南降（v5.97 同款符号错复发） */ }
      /* v5.95 斜扶手撤除：本排 z-11.14 与梯面 z-10.65 差 0.49m 且顶入二楼板（用户：'栏杆在对面'）；防坠改梯口水平栏 */
      {   /* v5.91 楼梯间顶棚：封梯井通天缝隙（用户令"挡一下显干净"），只见木梁不见天 */
        const ceil = boxI(7.3, 0.2, 4.0, Mf.beam); ceil.position.set(0, 7.62, -9.8); IN.add(ceil);
        for (let i2 = 0; i2 < 4; i2++) { const jb9 = boxI(7.3, 0.14, 0.16, Mf.plankDark); jb9.position.set(0, 7.45, -8.3 - i2 * 1.0); IN.add(jb9); }
        /* v5.92 封四周腔缝：梯井洞挖穿山顶后，外裙坡瓦垄/椽环从缝里透视进来像"反向楼梯"（用户圈①②③），内衬墙全围合 */
        const cpN = boxI(7.3, 3.3, 0.1, Mf.wallIn); cpN.position.set(0, 6.1, -11.75); IN.add(cpN);
        /* v617 中层吊顶+暗梁拆除（v600 遮檐板使命已由 v612 顶封板 cpTop 接管，出梯头顶不再压两根梁） */
        const cpS = boxI(7.3, 3.3, 0.1, Mf.wallIn); cpS.position.set(0, 6.1, -8.45); IN.add(cpS);   /* 贴壳北墙后 0.15，不侵入客房 */
        for (const s9 of [-1, 1]) { const cpE = boxI(0.1, 3.3, 3.95, Mf.wallIn); cpE.position.set(s9 * 3.62, 6.1, -9.8); IN.add(cpE); }
        /* v612 山体遮丑：梯厅挖腔壁 ±3.05 裸露（v5.92 内衬钉在 ±3.62 埋进石头=没钉），白墙钉进腔内 */
        for (const s9 of [-1, 1]) { const cpIn = boxI(0.08, 3.5, 4.1, Mf.wallIn); cpIn.position.set(s9 * 3.0, 6.15, -10.0); IN.add(cpIn); }
        for (const s9 of [-1, 1]) { const cpOut = boxI(0.06, 3.3, 4.1, Mf.wallIn); cpOut.position.set(s9 * 3.5, 6.15, -10.0); IN.add(cpOut); }   /* v624 梯厅外侧面也糊白：山墙面从阳台/窗洞不再露土黄 */
        const cpTop = boxI(6.1, 0.12, 4.1, Mf.wallIn); cpTop.position.set(0, 7.78, -10.0); IN.add(cpTop);
      }
      {   /* v611 井口护栏整齐版：东沿通长+南沿齐洞沿，双横档立柱均布 */
        for (const yy9 of [5.72, 5.42]) {
          const rlE = boxI(0.08, 0.08, 2.95, Mf.screen); rlE.position.set(-0.72, yy9, -10.05); IN.add(rlE);
          const rlS1 = boxI(0.5, 0.08, 0.08, Mf.screen); rlS1.position.set(-2.15, yy9, -8.56); IN.add(rlS1);
          const rlS2 = boxI(0.5, 0.08, 0.08, Mf.screen); rlS2.position.set(-0.97, yy9, -8.56); IN.add(rlS2);   /* v620 中间留 1m 梯口（'加了栏杆我咋上去'） */
        }
        {   /* v630 最后一笔：梯口右侧栏下裙板，封住横栏与楼板间的竖缝（用户红圈） */
          const sk2 = boxI(0.5, 0.36, 0.05, Mf.screen); sk2.position.set(-0.97, 5.05, -8.56); IN.add(sk2);
        }
        for (const pz of [-11.45, -9.95, -8.62]) { const jp = boxI(0.09, 0.95, 0.09, Mf.screen); jp.position.set(-0.72, 5.26, pz); IN.add(jp); }   /* v626 打叉抽稀 */
        for (const px of [-2.42, -1.92, -0.72, -1.0]) { const jp = boxI(0.09, 0.95, 0.09, Mf.screen); jp.position.set(px, 5.26, -8.56); IN.add(jp); }   /* v632 按东西箭头回西段栏线空档（rlS2 中段） */
      }
      /* v617 山水屏撤销：PlaneGeometry 单面朝外，从梯厅看只剩一块绿色贴片（用户'不知道啥玩意儿'），补一盏壁灯代替 */
      const lk2 = new THREE.PointLight('#ffe0a8', 0.5, 4, 2); lk2.position.set(-2.9, 6.4, -10.1); IN.add(lk2);
      const pl7 = new THREE.PointLight('#ffcf8e', 0.8, 6.5, 1.8); pl7.position.set(0, 6.3, -10.6); IN.add(pl7);
      const pl8 = new THREE.PointLight('#ffcf8e', 0.5, 4.5, 1.8); pl8.position.set(1.6, 1.9, -10.6); IN.add(pl8);
    }
    { /* v5.35x 房中房内壳（终极收编）：客房/门厅四周 1cm 内衬墙 + 平顶天花——
         外墙内一切杂音（裙坡/瓦垄/椽环/挖痕）永久包进夹层，室内只见壳与井口梁；门窗洞与外壳洞口对位 */
      const shell = new THREE.Group();
      const sn = wallPanel(6.8, 2.9, 0.1, Mf.wallIn, [{ cx: -1.7, cy: 1.05, hw: 1.2, hh: 1.05 }, { cx: 1.0, cy: 1.05, hw: 0.7, hh: 1.05 }]);   /* v626 红框位开北廊门洞 x0.3..1.7 */
      sn.position.set(0, 4.75, -8.6); shell.add(sn);
    /* v618 v616 手搓窗棂拆除（尺寸没对洞，棂条悬出洞外像栅栏）——改 winSash 对洞做扇 + F 外开 */                    /* 北墙：通梯间口 */
      const ss = wallPanel(6.8, 2.9, 0.1, Mf.wallIn, [{ cx: 0, cy: 1.28, hw: 1.12, hh: 1.28 }, { cx: 1.72, cy: 1.07, hw: 0.5, hh: 0.5 }, { cx: -1.72, cy: 1.07, hw: 0.5, hh: 0.5 }]);   /* v625 高窗位重开（下沿 5.85 起，下面墙封） */
      ss.position.set(0, 4.75, -4.9); shell.add(ss);                    /* 南墙：阳台门洞 */

      for (const s of [-1, 1]) {
        const se = wallPanel(3.7, 2.9, 0.1, Mf.wallIn, [{ cx: 0.3, cy: 1.05, hw: 0.5, hh: 0.4 }, { cx: -1.0, cy: 1.05, hw: 0.5, hh: 0.4 }]);
        se.rotation.y = Math.PI / 2; se.position.set(s * 3.42, 4.75, -6.75); shell.add(se);   /* 东西墙：两窗洞对位 */
      }
      {   /* v620 东西观景窗改朝外双开木窗：木色框双扇对开，F 同开同闭；南两窗已封 */
        const Mw1 = mat('#7a5632', { map: winWoodTex(1, 1), roughness: 0.75 }), Mw2 = mat('#4a3118', { roughness: 0.85 });   /* v641 窗框深棕改老木纹底 */
        function winSash(w, h) {
          const g3 = new THREE.Group();
          const bx = (bw, bh, x2, y2) => { const q2 = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.05), Mw1); q2.position.set(x2, y2, 0); g3.add(q2); };
          bx(w, 0.07, 0, h / 2 - 0.035); bx(w, 0.07, 0, -h / 2 + 0.035);
          bx(0.07, h, -w / 2 + 0.035, 0); bx(0.07, h, w / 2 - 0.035, 0);
          bx(0.038, h - 0.14, 0, 0);
          bx(w - 0.14, 0.038, 0, h * 0.17); bx(w - 0.14, 0.038, 0, -h * 0.17);
          return g3;
        }
        const WINS = [{ n: '东窗一', z: -7.05, s: 1 }, { n: '东窗二', z: -5.75, s: 1 }, { n: '西窗一', z: -7.05, s: -1 }, { n: '西窗二', z: -5.75, s: -1 }];
        for (const W2 of WINS) {
          const set2 = { name: '二楼' + W2.n, x: 3.1 * W2.s, z: W2.z, y: 4.78, cur: 0, target: 0, open: false, hinges: [] };
          for (const sz2 of [-1, 1]) {
            const hg2 = new THREE.Group();
            hg2.position.set(W2.s * 3.47, 5.82, W2.z + sz2 * 0.52);
            const base = sz2 * Math.PI / 2;   /* v623 base 再翻正：南边扇 base=-π/2 才朝 +z 伸向洞心（v622 装反 90°=开向屋内） */
            hg2.rotation.y = base; hg2.userData.base = base;
            const sash = winSash(0.5, 0.84);   /* v622 扇宽=洞口一半（原 0.98 整洞宽两扇叠一起） */
            sash.position.set(0.25, 0, 0);
            hg2.add(sash); scene.add(hg2);
            set2.hinges.push({ hinge: hg2, s: -sz2 * W2.s });   /* v622 符号修正：朝外开（原来是往屋里开） */
          }
          window.__doors.push(set2);
        }
        for (const fx2 of [-1.72, 1.72]) {   /* v627 降回红圈旧款高度（与门格心齐平） */
          const fs2 = winSash(0.9, 0.86);
          fs2.position.set(fx2, 5.82, -4.9); scene.add(fs2);
        }
      }
      const sc = boxI(6.94, 0.12, 3.82, Mf.wallIn); sc.position.set(0, 7.72, -6.75); shell.add(sc);   /* 壳顶贴墙顶 7.65，无黑阴角；次檐板下半没入壳顶夹层 */
      const plL = new THREE.PointLight('#ffe2ac', 0.9, 8, 1.7); plL.position.set(-1.6, 7.2, -6.2); IN.add(plL);
      const plR = new THREE.PointLight('#ffe2ac', 0.9, 8, 1.7); plR.position.set(1.6, 7.2, -7.4); IN.add(plR);
      for (let i2 = 0; i2 < 4; i2++) { const jb = boxI(6.9, 0.16, 0.16, Mf.beam); jb.position.set(0, 7.57, -5.3 - i2 * 1.1); IN.add(jb); }
      const cjb2 = boxI(0.24, 0.24, 3.82, Mf.beam); cjb2.position.set(0, 7.55, -6.75); IN.add(cjb2);
      {   /* v5.35aa 阳台面层压黑坡：裙坡在阳台下鼓出地板 0.2-0.5m，门洞平视满黑——木地板盖层压顶（含门槛带） */
        const bd = boxI(5.1, 0.07, 1.52, Mf.plank); bd.position.set(0, 4.70, -4.24); IN.add(bd);
        const th = boxI(2.4, 0.05, 0.16, Mf.plankDark); th.position.set(0, 4.72, -4.94); IN.add(th);
      }
      IN.add(shell);
    }
    /* v5.35z 坡顶面层剥离：roofPyramid 坡面（eef0f3-TEX）世界顶点入客房腔（|x|<3.7,-8.9<z<-4.2,4.4<y<7.9）即剔；
       脊筒/檐环/外观零损伤——"屋里不该有瓦面"的强制执行令 */
    {
      const wvP = new THREE.Vector3();
      scene.traverse(function (o) {
        if (!o.isMesh || o.isInstancedMesh || !o.material.map || o.material.color.getHexString() !== "eef0f3") return;
        const b7 = new THREE.Box3().setFromObject(o);
        if (!(b7.min.y < 7 && b7.max.y > 4.5 && b7.min.z < -4.5 && b7.max.z > -9 && b7.min.x < 4 && b7.max.x > -4)) return;
        const pa = o.geometry.attributes.position;
        const inCav = (vi2) => {
          wvP.set(pa.getX(vi2), pa.getY(vi2), pa.getZ(vi2));
          o.localToWorld(wvP);
          return Math.abs(wvP.x) < 3.7 && wvP.z > -8.9 && wvP.z < -4.2 && wvP.y > 4.4 && wvP.y < 7.9;
        };
        const idx = o.geometry.index;
        const tris = [];
        const nt = (idx ? idx.count : pa.count) / 3;
        for (let t2 = 0; t2 < nt; t2++) {
          const a3 = idx ? [idx.getX(t2 * 3), idx.getX(t2 * 3 + 1), idx.getX(t2 * 3 + 2)] : [t2 * 3, t2 * 3 + 1, t2 * 3 + 2];
          if (!(inCav(a3[0]) && inCav(a3[1]) && inCav(a3[2]))) tris.push(a3);
        }
        if (tris.length === nt) return;
        if (idx) {
          const arr = [];
          tris.forEach((t3) => arr.push(t3[0], t3[1], t3[2]));
          o.geometry.setIndex(arr);
        } else {
          const np = new Float32Array(tris.length * 9);
          const nu = new Float32Array(tris.length * 2);
          const uvA = o.geometry.attributes.uv;
          const nc = o.geometry.attributes.color ? new Float32Array(tris.length * 3) : null;
          const ca = o.geometry.attributes.color;
          let w9 = 0;
          tris.forEach((t3) => t3.forEach((vi2) => {
            np[w9 * 3] = pa.getX(vi2); np[w9 * 3 + 1] = pa.getY(vi2); np[w9 * 3 + 2] = pa.getZ(vi2);
            if (uvA) { nu[w9 * 2] = uvA.getX(vi2); nu[w9 * 2 + 1] = uvA.getY(vi2); }
            if (nc) { nc[w9] = ca.getX(vi2); nc[w9 + 1] = ca.getY(vi2); nc[w9 + 2] = ca.getZ(vi2); }
            w9++;
          }));
          o.geometry.setAttribute("position", new THREE.BufferAttribute(np, 3));
          if (uvA) o.geometry.setAttribute("uv", new THREE.BufferAttribute(nu, 2));
          if (nc) o.geometry.setAttribute("color", new THREE.BufferAttribute(nc, 3));
        }
        o.geometry.computeVertexNormals();
        o.geometry.computeBoundingSphere();
        window.__facet = (window.__facet || 0) + (nt - tris.length);
      });
    }
    { /* 阳台门厅：穿衣镜+衣架+引出地毯 */
      const mir = boxI(0.7, 1.5, 0.05, Mf.screen); mir.position.set(1.7, 5.62, Z0 + 1.42); mir.rotation.y = -0.35; IN.add(mir);
      const mpg = boxI(0.56, 1.3, 0.02, mat('#cfe3e0', { metalness: 0.6, roughness: 0.15 })); mpg.position.set(1.66, 5.62, Z0 + 1.4); mpg.rotation.y = -0.35; IN.add(mpg);
      const rk2 = cyl(0.04, 0.05, 1.7, 6, Mf.beam); rk2.position.set(-1.75, 5.72, Z0 + 1.25); IN.add(rk2);
      const rg2 = boxI(0.6, 0.04, 0.04, Mf.beam); rg2.position.set(-1.75, 6.5, Z0 + 1.25); IN.add(rg2);
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.6), Mf.quiltB); rug.rotation.x = -Math.PI / 2; rug.position.set(-0.8, 4.85, Z0 + 0.3); IN.add(rug);
    }
    /* v4.99 主卧随隔断并入西客房，原中位大床西移 */
    const pl5 = new THREE.PointLight('#ffdd9a', 1.1, 7, 1.8); pl5.position.set(0, 6.9, Z0 - 0.2); IN.add(pl5);
    const pl5b = new THREE.PointLight('#ffd9a0', 0.55, 4.5, 1.8); pl5b.position.set(1.6, 6.4, Z0 + 0.75); IN.add(pl5b);
    const pl5c = new THREE.PointLight('#ffd9a0', 0.55, 4.5, 1.8); pl5c.position.set(-1.6, 6.4, Z0 + 0.4); IN.add(pl5c);
    /* 楼梯口：地板开洞 */
    const holeCover = boxI(0.9, 0.02, 1.1, Mf.plankDark); holeCover.position.set(-1.85, 4.85, -5.35); holeCover.visible = false; IN.add(holeCover);
  }
  /* ======== 东厢 · 浴室澡塘（x 3.2..7.8, z -3.2..0.2） ======== */
  {
    const CX = 5.5, CZ = -1.5;
    const fl = boxI(4.5, 0.08, 3.3, Mf.stoneTile); fl.position.set(CX, 0.06, CZ); IN.add(fl);
    for (let i = 0; i < 7; i++) { const g = boxI(4.5, 0.02, 0.04, Mf.plankDark); g.position.set(CX, 0.108, CZ - 1.5 + i * 0.5); IN.add(g); }
    IN.userData.c3 = IN.children.length;   /* v5.20 二楼清空段终点 */
    {   /* v5.20 用户令：二楼陈设+旧隔断全清（格局重排前看空场）；光源保留 */
      const hideIds = [];
      for (let i = IN.userData.c2; i < IN.userData.c3; i++) hideIds.push(IN.children[i]);
      for (const o of hideIds) o.traverse(x2 => {
        if (x2.isMesh) x2.visible = false;
        if (x2.isMesh && WATER_OBJS.indexOf(x2) >= 0) x2.visible = true;   /* v5.30 澡塘水面/水盆是水不是杂物（v5.17 误杀成木箱） */
      });
      for (let i = IN.userData.stairMark; i < IN.userData.c3; i++) IN.children[i].traverse(function (x3) { if (x3.isMesh) x3.visible = true; });   /* v5.33 复活：楼梯/梯间灯/门厅镜架被 c2..c3 清场整段误杀（用户图3'没看到楼梯'真因，碰撞一直在=穿模上梯） */
    }
    /* 内壁由外壳组合板承担（真门窗洞透光），仅留顶棚/地面 */
    const cl = boxI(4.5, 0.06, 3.3, Mf.wallIn); cl.position.set(CX, 2.6, CZ); IN.add(cl);
    /* 大澡塘（北半）：木围 + 水面 + 汽 */
    {
      const bz = CZ - 0.75;
      for (const s of [-1, 1]) { const e = boxI(0.14, 0.85, 1.7, Mf.barrel); e.position.set(CX + s * 1.35, 0.5, bz); IN.add(e); }
      for (const s of [-1, 1]) { const e = boxI(2.85, 0.85, 0.14, Mf.barrel); e.position.set(CX, 0.5, bz + s * 0.85); IN.add(e); }
      const rim = boxI(3.1, 0.09, 1.95, Mf.screen); rim.position.set(CX, 0.96, bz); rim.scale.set(1.06, 1, 1.12); IN.add(rim);   /* v5.30 rim 当池沿整板（实心盖），水面提板上做溢汤池 */
      const bwaterMat = new THREE.MeshStandardMaterial({ color: '#4db8b6', transparent: true, opacity: 0.94, roughness: 0.16, emissive: '#0d4f4c', emissiveIntensity: 0.42 });   /* v5.30b 压高光去奶白：汤色深一档 */
      bwaterMat.userData = { r0: 0.1, o0: 0.7 }; tuneWater(bwaterMat, 1);
      dayNight.pondWater = dayNight.pondWater || bwaterMat;
      const wtr = new THREE.Mesh(new THREE.PlaneGeometry(2.62, 1.6), bwaterMat);
      wtr.rotation.x = -Math.PI / 2; wtr.position.set(CX, 1.02, bz); wtr.scale.set(0.82, 0.8); IN.add(wtr);   /* v5.30 水面坐上盖板 1.02：青汤居中，木沿外圈 = 浴池 */
      WATER_OBJS.push(wtr);
      /* 入水踏步 */
      for (let i = 0; i < 3; i++) { const st = boxI(0.7, 0.22, 0.34, Mf.stoneTile); st.position.set(CX + 1.0, 0.2 + i * 0.21, bz + 0.98 + (2 - i) * 0.02); st.position.z = bz + 1.15 - i * 0.3; IN.add(st); }
      /* 蒸汽 */
      const steam = [];
      for (let i = 0; i < 5; i++) {
        const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, color: '#eef3f4', transparent: true, opacity: 0.26, depthWrite: false }));
        sm.position.set(CX - 1.1 + i * 0.55, 1.1 + (i % 3) * 0.4, bz - 0.4 + (i % 2) * 0.5);
        sm.scale.set(0.9, 0.62, 1); IN.add(sm); steam.push({ s: sm, t: Math.random() });
      }
      window.__bathSteam = steam;
    }
    /* 南半：两个木桶私浴 + 竹帘 */
    {
      for (const s of [-1, 1]) {
        const bx = CX + s * 1.05, bz = CZ + 1.15;
        const barr = cyl(0.46, 0.42, 0.9, 12, Mf.barrel); barr.position.set(bx, 0.53, bz); IN.add(barr);
        const hoop1 = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.02, 5, 14), Mf.iron); hoop1.rotation.x = Math.PI / 2; hoop1.position.set(bx, 0.75, bz); IN.add(hoop1);
        const wt = cyl(0.4, 0.4, 0.05, 12, mat('#8fd6cf', { transparent: true, opacity: 0.8 })); wt.position.set(bx, 0.92, bz); IN.add(wt);
        const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.6), Mf.curtain);
        curtain.position.set(bx, 0.95, bz + 0.5); curtain.rotation.y = s * 0.12; IN.add(curtain);
      }
      const shelfL = boxI(1.6, 0.06, 0.3, Mf.screen); shelfL.rotation.y = Math.PI / 2; shelfL.position.set(CX + 2.1, 1.25, CZ - 0.1); IN.add(shelfL);
      for (let i = 0; i < 2; i++) { const br = boxI(0.05, 0.5, 0.26, Mf.screen); br.rotation.y = Math.PI / 2; br.position.set(CX + 2.1, 1.0, CZ - 0.6 + i * 1.0); IN.add(br); }
      for (let i = 0; i < 3; i++) { const bk = cyl(0.09, 0.11, 0.18, 8, Mf.barrel); bk.position.set(CX + 2.05, 1.37, CZ - 0.6 + i * 0.5); IN.add(bk); }
      const lampE = glowLamp(CX, 2.4, CZ, 0.1);
      const pl6 = new THREE.PointLight('#ffe0a8', 0.85, 6, 1.8); pl6.position.set(CX, 2.3, CZ); IN.add(pl6);
    }
  }
  /* ======== 西厢 · 食堂（x -7.8..-3.2） ======== */
  {
    const CX = -5.5, CZ = -1.5;
    const fl = boxI(4.5, 0.08, 3.3, Mf.stoneTile); fl.position.set(CX, 0.06, CZ); IN.add(fl);
    /* 内壁由外壳组合板承担（真门窗洞透光），仅留顶棚/地面 */
    const cl = boxI(4.5, 0.06, 3.3, Mf.wallIn); cl.position.set(CX, 2.6, CZ); IN.add(cl);
    /* 北灶台：对应烟囱 (-4.3,-1.5)→北墙 */
    {
      const st = boxI(2.4, 0.95, 0.85, Mf.stoneTile); st.position.set(CX - 0.3, 0.56, CZ - 1.1); IN.add(st);
      const stTop = boxI(2.5, 0.07, 0.95, mat('#767065')); stTop.position.set(CX - 0.3, 1.08, CZ - 1.1); IN.add(stTop);
      for (const s of [-1, 1]) {
        const wok = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 7, 0, 6.28, 0, Math.PI / 2), Mf.iron);
        wok.rotation.x = Math.PI; wok.position.set(CX - 0.3 + s * 0.6, 1.14, CZ - 1.1); IN.add(wok);
        const lid = cyl(0.26, 0.26, 0.04, 10, Mf.screen); lid.position.set(CX - 0.3 + s * 0.6, 1.2, CZ - 1.1); IN.add(lid);
      }
      const mouth = boxI(0.5, 0.34, 0.06, Mf.iron); mouth.position.set(CX - 0.3, 0.42, CZ - 0.66); IN.add(mouth);
      const fireM = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.24), Mf.fire); fireM.position.set(CX - 0.3, 0.4, CZ - 0.63); IN.add(fireM);
      const fl2 = new THREE.PointLight('#ff7a2e', 0.55, 3.5, 2); fl2.position.set(CX - 0.3, 0.7, CZ - 0.5); IN.add(fl2);
      window.__stoveFire = { light: fl2, mesh: fireM };
      /* 案板 + 菜刀 + 面案 */
      const board = boxI(0.8, 0.07, 0.55, Mf.barrel); board.position.set(CX + 1.35, 0.92, CZ - 1.05); IN.add(board);
      const knife = boxI(0.3, 0.015, 0.13, Mf.iron); knife.position.set(CX + 1.3, 0.965, CZ - 0.9); knife.rotation.y = 0.4; IN.add(knife);
      const roll = cyl(0.05, 0.05, 0.5, 6, Mf.screen); roll.rotation.z = Math.PI / 2; roll.position.set(CX + 1.35, 1.0, CZ - 1.2); IN.add(roll);
      /* 碗架 */
      const rack = boxI(1.0, 1.4, 0.32, Mf.plankDark); rack.position.set(CX - 1.85, 0.8, CZ - 1.15); IN.add(rack);
      for (let i = 0; i < 6; i++) { const bw = cyl(0.08, 0.05, 0.07, 8, Mf.porcelain); bw.position.set(CX - 2.1 + (i % 3) * 0.25, 0.5 + Math.floor(i / 3) * 0.5, CZ - 1.0); IN.add(bw); }
    }
    /* 南厅堂：三张方桌条凳 */
    {
      const spots = [[-1.35, 0.55], [0.15, 0.85], [1.35, 0.35]];
      for (const sp of spots) {
        const tx = CX + sp[0], tz = CZ + sp[1];
        const tab = boxI(0.8, 0.5, 0.8, Mf.plankDark); tab.position.set(tx, 0.62, tz); IN.add(tab);
        const tt = boxI(0.9, 0.06, 0.9, Mf.screen); tt.position.set(tx, 0.9, tz); IN.add(tt);
        for (const s of [-1, 1]) {
          const bn = boxI(0.7, 0.06, 0.24, Mf.barrel); bn.position.set(tx + s * 0.62, 0.44, tz); IN.add(bn);
          for (const l of [-0.26, 0.26]) { const lg = boxI(0.06, 0.4, 0.06, Mf.barrel); lg.position.set(tx + s * 0.62 + l, 0.22, tz); IN.add(lg); }
        }
        const dish = cyl(0.11, 0.09, 0.06, 8, Mf.porcelain); dish.position.set(tx - 0.12, 0.96, tz + 0.1); IN.add(dish);
        const cup = cyl(0.035, 0.03, 0.07, 6, Mf.porcelain); cup.position.set(tx + 0.2, 0.97, tz - 0.15); IN.add(cup);
        const chop = boxI(0.2, 0.012, 0.03, Mf.screen); chop.position.set(tx + 0.05, 0.95, tz + 0.22); chop.rotation.y = 0.6; IN.add(chop);
      }
      /* 酒坛 + 挂面架 */
      for (let i = 0; i < 2; i++) {
        const jrr = cyl(0.2, 0.24, 0.5, 10, Mf.jarGlaze); jrr.position.set(CX - 1.7 + i * 0.55, 0.35, CZ + 1.35); IN.add(jrr);
        const lidJ = cyl(0.21, 0.21, 0.04, 10, Mf.screen); lidJ.position.set(CX - 1.7 + i * 0.55, 0.62, CZ + 1.35); IN.add(lidJ);
      }
      const poleN = boxI(2.2, 0.05, 0.05, Mf.screen); poleN.position.set(CX + 1.1, 2.25, CZ + 1.2); IN.add(poleN);
      for (let i = 0; i < 4; i++) {
        const noodle = boxI(0.3, 0.5, 0.02, mat('#efe4c2'));
        noodle.position.set(CX + 0.35 + i * 0.5, 1.98, CZ + 1.2); IN.add(noodle);
      }
      const lampW = glowLamp(CX, 2.42, CZ + 0.3, 0.1);
      const pl7 = new THREE.PointLight('#ffe0a8', 0.9, 6, 1.8); pl7.position.set(CX, 2.3, CZ + 0.2); IN.add(pl7);
    }
  }
  scene.add(IN);
  window.__interior = IN;
}
/* 四合院连接短墙已拆除：两翼与广场之间完全开敞 */

/* ---------------- 酒旗（墙外土路边） ---------------- */
{
  const fg = new THREE.Group();
  const pole = cyl(0.06, 0.07, 4.2, 8, M.wood); pole.position.y = 2.1;
  const arm = cyl(0.035, 0.035, 1.3, 6, M.wood); arm.rotation.z = Math.PI / 2; arm.position.set(0.55, 4.02, 0);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), M.woodDark); tip.position.set(1.2, 4.02, 0);
  const cord = cyl(0.015, 0.015, 0.5, 4, M.wood); cord.position.set(0.28, 3.78, 0); cord.rotation.z = 0.5;
  const fgeo = new THREE.PlaneGeometry(1.1, 1.5, 12, 16);
  {   /* 燕尾剪裁：底缘中央上切 */
    const pa = fgeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const px = pa.getX(i), py = pa.getY(i);
      if (py < -0.42) pa.setY(i, py + (Math.abs(py) - 0.42) * (1 - Math.abs(px) / 0.55) * 0.92);
    }
    fgeo.computeVertexNormals();
  }
  const flag = new THREE.Mesh(fgeo, new THREE.MeshStandardMaterial({ map: flagTexture, side: THREE.DoubleSide, roughness: 0.92 }));
  flag.position.set(0.55, 3.22, 0);
  flag.castShadow = true;
  fg.add(pole, arm, tip, cord, flag);
  fg.position.set(11.3, 0, 9.7);
  fg.userData.flag = flag;
  scene.add(fg);
  scene.userData.flagGroup = fg;
  {   /* 软布幡风浪登记 */
    const fbase = Float32Array.from(fgeo.attributes.position.array);
    window.__flagWave = { flag, fgeo, fbase };
  }
}
/* 水井（前院） */
{
  const well = new THREE.Group();
  const ring = cyl(0.75, 0.8, 0.65, 12, M.stone); ring.position.y = 0.33;
  const waterTop = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), mat('#31596b'));
  waterTop.rotation.x = -Math.PI / 2; waterTop.position.y = 0.55;
  for (const s of [-1, 1]) { const p = cyl(0.07, 0.08, 1.5, 6, M.wood); p.position.set(s * 0.62, 1.35, 0); well.add(p); }
  const beam = cyl(0.06, 0.06, 1.4, 6, M.wood); beam.rotation.z = Math.PI / 2; beam.position.y = 2.1;
  const wr = pRoof(1.0, 0.5, 0.8); wr.position.y = 2.5;
  const wcap = box(0.66, 0.1, 0.14, mat('#2f3540')); wcap.position.y = 2.6;
  well.add(ring, waterTop, beam, wr, wcap);
  well.position.set(7.0, 0, 5.4);
  scene.add(well);
}

/* 前院锦鲤小鱼塘（银杏/枫树一侧，石圈砌岸） */
const POND_X = -6.6, POND_Z = 3.0;
const koi = [];
{
  const pondMat = new THREE.MeshStandardMaterial({
    color: '#58c2ce', transparent: true, opacity: 0.66,
    roughness: 0.1, metalness: 0.0, side: THREE.DoubleSide,
  });
  pondMat.userData = { r0: 0.1, o0: 0.66 };
  tuneWater(pondMat, 1);
  dayNight.pondWater = pondMat;
  const bed = new THREE.Mesh(new THREE.CircleGeometry(1.78, 14), mat('#8a7c62'));   /* 卵石暖滩沿：水面与石圈之间 */
  bed.rotation.x = -Math.PI / 2; bed.position.set(POND_X, 0.05, POND_Z);
  bed.receiveShadow = true;
  const surf = new THREE.Mesh(new THREE.CircleGeometry(1.68, 14), pondMat);
  surf.rotation.x = -Math.PI / 2; surf.position.set(POND_X, 0.14, POND_Z);
  scene.add(bed, surf); WATER_OBJS.push(surf);
  { const p1 = addCaustics(new THREE.CircleGeometry(1.6, 14), 1.1, 1.1, 0.24, 0);
    p1.rotation.x = -Math.PI / 2; p1.position.set(POND_X, 0.06, POND_Z);
    const p2 = addCaustics(new THREE.CircleGeometry(1.6, 14), 1.5, 1.5, 0.15, 0);
    p2.rotation.x = -Math.PI / 2; p2.position.set(POND_X, 0.058, POND_Z); WATER_OBJS.push(p1, p2); }
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + rr(-0.08, 0.08);
    const R = 1.8 + rr(-0.12, 0.15);
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.26, 0.4), 0), M.rock);
    st.scale.y = 0.55;
    st.position.set(POND_X + Math.cos(a) * R, 0.14, POND_Z + Math.sin(a) * R);
    st.rotation.set(rand(), rand() * 3, rand());
    st.castShadow = true; st.receiveShadow = true;
    scene.add(st);
  }
  const koiCols = ['#e05a26', '#ece6da', '#2e2c2c', '#d8a52b'];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 9, 7), mat(koiCols[i]));
    body.scale.set(0.55, 0.38, 1.45);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), mat(koiCols[i]));
    tail.rotation.x = -Math.PI / 2; tail.position.z = -0.32;
    g.add(body, tail);
    g.userData = {
      ang: rand() * Math.PI * 2, r: rr(0.5, 1.25),
      spd: rr(0.5, 1.1) * (rand() < 0.5 ? 1 : -1), tail,
    };
    koi.push(g); scene.add(g);
  }
}

/* ---------------- 灯笼（红灯笼 + 石灯柱） ---------------- */
function makeLantern(parent, x, y, z, withLight) {
  const g = new THREE.Group();
  const lm = new THREE.MeshStandardMaterial({ color: '#d8402c', emissive: '#ff6a3a', emissiveIntensity: 0.25, roughness: 0.6 });
  dayNight.lanternMats.push(lm);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), lm);
  body.scale.y = 0.85;
  const capT = cyl(0.12, 0.16, 0.1, 8, mat('#5a4326')); capT.position.y = 0.3;
  const capB = cyl(0.16, 0.12, 0.1, 8, mat('#5a4326')); capB.position.y = -0.3;
  const tassel = cyl(0.02, 0.03, 0.25, 5, mat('#c8a24a')); tassel.position.y = -0.48;
  const cord = cyl(0.012, 0.012, 0.45, 4, mat('#5a4326')); cord.position.y = 0.55;
  g.add(body, capT, capB, tassel, cord);
  if (withLight) {
    const L = new THREE.PointLight('#ffab63', 0, 10, 2);
    g.add(L);
    dayNight.lanternLights.push(L);
  }
  g.position.set(x, y, z);
  (parent || scene).add(g);
  return g;
}
/* 门屋前一对 + 门屋内侧一对 + 主楼回廊一对 */
/* 门屋已拆除；广场两侧灯笼一并撤走，只留围墙门楼一对 + 主楼门口一对 */
makeLantern(scene, -1.9, 3.05, -3.6, false);
makeLantern(scene, 1.9, 3.05, -3.6, false);
/* 大门红灯笼一对：挂门楼朝桥一面（路侧檐下），分立「秋山客棧」匾额左右 */
makeLantern(scene, -1.55, 2.28, 9.34, true);
makeLantern(scene, 1.55, 2.28, 9.34, true);

/* v4.96d 日式庭院石灯笼（vol.2）：青石程序纹理，火袋四角立柱镂空 + 三横棂，内置烛焰发光衬，夜透暖光 */
const stoneTexL = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#8f948f'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { const v = 128 + (Math.random() * 46 - 23) | 0; x.fillStyle = 'rgba(' + v + ',' + (v + 4) + ',' + (v - 2) + ',0.35)'; x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2.4, 1 + Math.random() * 2.4); }
  x.strokeStyle = 'rgba(70,74,72,0.35)'; x.lineWidth = 1;
  for (let i = 0; i < 7; i++) { x.beginPath(); let px = Math.random() * 128, py = Math.random() * 128; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += Math.random() * 26 - 13; py += Math.random() * 26 - 13; x.lineTo(px, py); } x.stroke(); }
  for (let i = 0; i < 12; i++) { x.fillStyle = 'rgba(104,120,84,0.28)'; x.beginPath(); x.ellipse(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 6, 2 + Math.random() * 4, Math.random() * 3, 0, 6.29); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; return t;
})();
const lampStone = mat('#ffffff', { map: stoneTexL, roughness: 0.95 });
function stoneLantern(x, z, withLight) {
  const g = new THREE.Group();
  const add = (o2, y, ry) => { o2.position.y = y; if (ry) o2.rotation.y = ry; o2.castShadow = o2.receiveShadow = true; g.add(o2); return o2; };
  add(cyl(0.3, 0.36, 0.08, 8, lampStone), 0.04);                                  /* 基础·八角 */
  add(cyl(0.17, 0.26, 0.14, 8, lampStone), 0.15);                                  /* 下云石 */
  add(cyl(0.095, 0.11, 0.56, 6, lampStone), 0.5);                                   /* 竿（六角） */
  add(cyl(0.135, 0.135, 0.045, 8, lampStone), 0.62);                                /* 席（竿环） */
  add(cyl(0.13, 0.08, 0.1, 6, lampStone), 0.83);                                    /* 中台束 */
  add(cyl(0.24, 0.15, 0.09, 4, lampStone), 0.925, Math.PI / 4);                     /* 中台（四方出翘） */
  const HY = 1.22;                                                                  /* 火袋中心高 */
  for (let k = 0; k < 4; k++) {                                                     /* 火袋四角柱 */
    const a2 = k * Math.PI / 2 + Math.PI / 4;
    const p2 = box(0.055, 0.5, 0.055, lampStone);
    p2.position.set(Math.cos(a2) * 0.155, HY, Math.sin(a2) * 0.155); p2.rotation.y = -a2; p2.castShadow = true; g.add(p2);
  }
  add(box(0.42, 0.05, 0.42, lampStone), HY + 0.275);                                 /* 火袋上框 */
  add(box(0.4, 0.045, 0.4, lampStone), HY - 0.272);                                  /* 火袋下框 */
  for (let k = 0; k < 4; k++) {                                                      /* 每面三横棂（镂空留透光缝） */
    const rot = k % 2 === 1;
    for (let r = 0; r < 3; r++) {
      const lat = box(rot ? 0.028 : 0.3, 0.022, rot ? 0.3 : 0.028, lampStone);
      lat.position.set(rot ? 0.172 : 0, HY - 0.16 + r * 0.16, rot ? 0 : 0.172);
      lat.castShadow = true; g.add(lat);
      const lat2 = lat.clone(); lat2.position[rot ? 'x' : 'z'] *= -1; lat2.castShadow = true; g.add(lat2);
    }
  }
  const liner = box(0.2, 0.4, 0.2, candleMat); add(liner, HY);                        /* 内透光衬（烛焰包在石壳内四面漏光） */
  const fig = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), mat('#ffdf9a', { emissive: '#ffb45a', emissiveIntensity: 0.4 }));
  add(fig, HY - 0.06);                                                               /* 烛珠 */
  add(cyl(0.06, 0.5, 0.24, 4, lampStone), 1.615, Math.PI / 4);                        /* 笠（四角反宇大屋顶） */
  add(box(0.66, 0.035, 0.66, lampStone), 1.5, 0);                                     /* 笠檐 */
  const jb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 6), lampStone); add(jb, 1.77);   /* 宝珠 */
  add(cyl(0.008, 0.03, 0.07, 6, lampStone), 1.86);
  if (withLight) {
    const L = new THREE.PointLight('#ffbe6a', 0, 7, 2);
    L.position.y = HY; L.userData.boost = 1.15;
    g.add(L);
    dayNight.lanternLights.push(L);
  }
  g.position.set(x, 0, z);
  scene.add(g);
}
for (const s of [-1, 1]) {
  [1.5, 3.6, 5.7, 7.8].forEach((z, i) => stoneLantern(s * 4.4, z, i % 2 === 0));
}

/* ---------------- 植被 ---------------- */
const riverPts = riverCurve.getSpacedPoints(120);
const streamPts = streamCurve.getSpacedPoints(60);
function distTo(pts, x, z) {
  let m = 1e9;
  for (const p of pts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < m) m = d; }
  return Math.sqrt(m);
}
function insideMountain(x, z, margin) {
  for (const c of mountainCones) {
    const dx = (x - c.cx) / (c.R * margin), dz = (z - c.cz) / (c.R * margin);
    if (dx * dx + dz * dz < 1) return true;
  }
  return false;
}
/* ---- Blender 低多边形树（3绿3黄）：占位组保持原 rand 序列（位置不变），GLB 到位后克隆入位 ---- */
const treeQueue = [];
function glbTree(kind, scale, extraRand) {
  if (extraRand) for (let i2 = 0; i2 < extraRand; i2++) rand();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  treeQueue.push({ g, kind });
  return g;
}
function makeMaple(s) { return glbTree('maple', s); }
function makeGinkgo(s) { return glbTree('ginkgo', s); }
function makePine(s) { return glbTree('pine', s); }
function makePersimmon(s) { return glbTree('apricot', s, 12); }   /* 原 6 果 12 次 rand 保留，序列不移位 */
function makeCypress(s) { return glbTree('cypress', s); }
function makeCamphor(s) { return glbTree('camphor', s); }
function makeBamboo(scale) {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const h = rr(2.0, 2.8);
    const s = cyl(0.045, 0.055, h, 5, M.bamboo);
    s.position.set(rr(-0.35, 0.35), h / 2, rr(-0.35, 0.35));
    s.rotation.set(rr(-0.08, 0.08), 0, rr(-0.08, 0.08));
    g.add(s);
  }
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.6, 7, 5), mat('#5c8351', { flatShading: true }));
  leaf.scale.y = 0.6; leaf.position.y = 2.6; leaf.castShadow = true;
  g.add(leaf);
  g.scale.setScalar(scale);
  return g;
}
const treeFactories = [makeMaple, makeGinkgo, makeCypress, makePine, makePersimmon, makeCamphor, makeCamphor];  /* v4.78 绿多红少 */
function treeOK(x, z) {
  if (Math.hypot(x, z) > BASE_R - 2.5) return false;
  if (Math.abs(x) < 12 && z > -12 && z < 13.4) return false;      // 方院及四周
  if (distTo(roadPts, x, z) < 4.3) return false;   /* 树干+冠幅双余量：路半宽2.05+树冠~2.2 */                  // 沿河土路
  if (Math.abs(x) < 2.8 && z > 1 && z < 11.5) return false;       // 南北甬道
  if (distTo(riverPts, x, z) < 6.4) return false;
  if (distTo(streamPts, x, z) < 1.7) return false;
  if (insideMountain(x, z, 1.05)) return false;
  if (x > -17.3 && x < -14.4 && z > -2.4 && z < 8.4) return false;   /* v4.86 溯溪航拍空廊 */
  if (x > -20.6 && x < -15.0 && z > 0.8 && z < 14.6 && Math.abs(x + 17.9) < 2.8 - (z - 7.7) * 0.22) return false;   /* 廊道楔形：溪上净空 */
  return true;
}
let treesPlaced = 0, tries = 0;
const scatterTrees = [];   /* 散布树登记：马房清场用（不删 rand 消耗） */
while (treesPlaced < 30 && tries < 900) {
  tries++;
  const a = rand() * Math.PI * 2, r = rr(13, BASE_R - 3);
  let x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (!treeOK(x, z)) continue;
  if (x > -19.8 && x < -15.2 && z > 0.6 && z < 14.2) {   /* v4.86 溯溪航拍空廊：树甩到廊外西坡 */
    const aL = Math.atan2(z, x);
    x = Math.cos(aL) * (r - 3.0); z = Math.sin(aL) * (r - 3.0);
    if (!treeOK(x, z)) continue;
  }
  const f = treeFactories[Math.floor(rand() * treeFactories.length)];
  const t = f(rr(0.85, 1.45));
  t.position.set(x, 0, z);
  t.rotation.y = rand() * Math.PI * 2;
  t.userData.tx = x; t.userData.tz = z;
  scatterTrees.push(t);
  scene.add(t);
  treesPlaced++;
}
/* v4.86 溯溪空廊精修：廊内残留树甩到西坡林缘（保 rand 序列） */
for (const t of scatterTrees) {
  const ddx = t.userData.tx + 17.6, ddz = t.userData.tz - 7.4;
  if (ddx * ddx + ddz * ddz < 20.25) {
    const nx = t.userData.tx - 3.4, nz = t.userData.tz - 1.2;
    t.position.set(nx, 0, nz); t.userData.tx = nx; t.userData.tz = nz;
  }
}
/* 竹丛（东南角外） */
[[18.9, 7.4], [19.9, 8.7]].forEach(p => {   /* v4.80 老积木竹隐没（rand 序列保留），改精模竹重植路边 */
  const b = makeBamboo(rr(0.9, 1.1)); b.position.set(p[0], -60, p[1]); scene.add(b);
});
/* 院内绿化：前院 + 主院（不挡中轴） */
{
  const cm = makeMaple(0.95); cm.position.set(-8.4, 0, 15.9); scene.add(cm);   /* v4.86 街树外挪避 fall 航线 */
  const cg = makeGinkgo(0.9); cg.position.set(8.4, 0, 15.9); scene.add(cg);
  const cm2 = makeMaple(0.95); cm2.position.set(2.05, 0, -2.8); scene.add(cm2);
  const cg2 = makePersimmon(0.85); cg2.position.set(-2.05, 0, -2.8); scene.add(cg2);
}
window.__mark('山坡植被');
window.__bootStage = Math.max(window.__bootStage || 0, 3);
/* 山坡植被：贴棱线锥面密植（避开门楼/主楼/厢房，树+灌木+草） */
const bushMat = [mat('#b5793a', { flatShading: true }), mat('#7d8a4a', { flatShading: true }), mat('#c25b33', { flatShading: true })];
const WEED_TEX = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const bladeCols = ['#8a9a4f', '#a99a4a', '#6f8a48', '#c0a24e', '#7d8a4a'];
  for (let i = 0; i < 18; i++) {
    x.strokeStyle = bladeCols[Math.floor(Math.random() * bladeCols.length)];
    x.lineWidth = 1.6 + Math.random() * 1.8; x.lineCap = 'round';
    const bx = 40 + Math.random() * 48, h = 55 + Math.random() * 62, bend = (Math.random() - 0.5) * 46;
    x.beginPath(); x.moveTo(bx, 126);
    x.quadraticCurveTo(bx + bend * 0.4, 126 - h * 0.55, bx + bend, 126 - h);
    x.stroke();
  }
  return new THREE.CanvasTexture(cv);
})();
const WEED_MAT = new THREE.MeshStandardMaterial({ map: WEED_TEX, transparent: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
const REED_STEM = mat('#7d8a4a'), REED_HEAD = mat('#e0d1a8');
const reedFx = [];   /* 芦苇荡摆动登记 */
const grassGeo = new THREE.ConeGeometry(0.13, 0.4, 4);
const grassTuftMat = mat('#8f7d46');
function onBuilding(x, z) {
  if (Math.abs(x) < 5.0 && z > -10.1 && z < -3.0) return true;                   // 主楼及大檐
  if (Math.abs(x) > 2.6 && Math.abs(x) < 8.8 && z > -7.4 && z < -1.6) return true; // 东西厢房
  return false;
}
window.__onBuilding = onBuilding;   /* v5.49 修：v5.47 误把函数声明改成具名函数表达式，具名只在表达式内可见→2950 行起 ReferenceError 全文件断流 */
mountainCones.forEach((c, ci) => {
  const n = Math.max(9, Math.round(c.R * 2.2));
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const u = Math.sqrt(rr(0.08, 0.92));
    const x = c.cx + Math.cos(a) * u * c.R, z = c.cz + Math.sin(a) * u * c.R;
    if (Math.hypot(x, z) > BASE_R - 1.5) continue;
    const y = surfaceY(c, u) - 0.15 + rr(-0.2, 0.2);
    if (y < 0.25) continue;
    if (onBuilding(x, z)) continue;
    const r2 = rand(); const f = r2 < 0.40 ? makePine : r2 < 0.60 ? makeCypress : r2 < 0.80 ? makeCamphor : makeMaple;  /* v4.78 山坡 80% 常绿 */
    const t = f(rr(0.45, 0.85));
    t.position.set(x, y, z);
    scene.add(t);
    (window.__mtnFlora = window.__mtnFlora || []).push(t);   /* v5.45 坡面植被登记入漂浮检测 */
  }
  const nb = c.R > 6 ? 8 : 4;
  for (let i = 0; i < nb; i++) {
    const a = rand() * Math.PI * 2;
    const u = Math.sqrt(rr(0.2, 0.95));
    const x = c.cx + Math.cos(a) * u * c.R, z = c.cz + Math.sin(a) * u * c.R;
    if (Math.hypot(x, z) > BASE_R - 0.8) continue;
    const y = surfaceY(c, u) - 0.1;
    if (y < 0.2 || onBuilding(x, z)) continue;
    const b = new THREE.Mesh(new THREE.SphereGeometry(rr(0.3, 0.6), 7, 5), bushMat[Math.floor(rand() * 3)]);
    b.scale.y = 0.6; b.position.set(x, y, z);
    scene.add(b);
    (window.__mtnFlora = window.__mtnFlora || []).push(b);   /* v5.45 */
  }
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const u = Math.sqrt(rr(0.3, 0.96));
    const x = c.cx + Math.cos(a) * u * c.R, z = c.cz + Math.sin(a) * u * c.R;
    if (Math.hypot(x, z) > BASE_R - 0.8) continue;
    const y = surfaceY(c, u);
    if (y < 0.15 || y > 6) continue;
    const tuft = new THREE.Mesh(grassGeo, grassTuftMat);
    tuft.position.set(x, y + 0.15, z);
    scene.add(tuft);
    (window.__mtnFlora = window.__mtnFlora || []).push(tuft);   /* v5.45 */
  }
});
/* 灌木、草丛、芦苇、石头 */
for (let i = 0; i < 14; i++) {
  const a = rand() * Math.PI * 2, r = rr(13, BASE_R - 3);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (!treeOK(x, z)) continue;
  const b = new THREE.Mesh(new THREE.SphereGeometry(rr(0.4, 0.75), 7, 5), bushMat[Math.floor(rand() * 3)]);
  b.scale.y = 0.6; b.position.set(x, 0.25, z);
  b.castShadow = true; b.receiveShadow = true;
  scene.add(b);
}
for (let i = 0; i < 60; i++) {
  const a = rand() * Math.PI * 2, r = rr(12, BASE_R - 1.5);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (distTo(riverPts, x, z) < 5.4 || distTo(streamPts, x, z) < 1.3) continue;
  if (insideMountain(x, z, 1.0)) continue;
  const wg0 = new THREE.Group();
  const sW = 0.75 + Math.random() * 0.7;
  for (const k of [0, 1]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.55 * sW, 0.55 * sW), WEED_MAT);
    q.position.y = 0.27 * sW;
    q.rotation.y = k * Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    wg0.add(q);
  }
  wg0.position.set(x, 0.02, z);
  wg0.rotation.y = rand() * Math.PI;
  scene.add(wg0);
}
for (let i = 0; i < 24; i++) {
  const t = i / 24, p = riverCurve.getPointAt(t), tg = riverCurve.getTangentAt(t);
  const s = rand() < 0.5 ? 1 : -1;
  const nx = tg.z, nz = -tg.x, l = Math.hypot(nx, nz);
  const off = (7.6 / 2 + rr(0.2, 0.8)) * s;
  const hgt = rr(0.8, 1.3);
  const rx = p.x + nx / l * off, rz = p.z + nz / l * off;
  if (Math.hypot(rx, rz) > BASE_R - 0.3) continue;   // 超出圆盘范围的芦苇不摆
  const tilt = rr(-0.15, 0.15);
  /* 芦苇荡一簇：5~9 根细杆挑芦花头（Math.random 散形，rand 序列与原锥体一致） */
  const cl = new THREE.Group();
  const nStem = 5 + Math.floor(Math.random() * 5);
  for (let k = 0; k < nStem; k++) {
    const sh = hgt * (0.75 + Math.random() * 0.55);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, sh, 4), REED_STEM);
    const az = Math.random() * 6.28, rad = Math.random() * 0.16;
    stem.position.set(Math.cos(az) * rad, sh / 2, Math.sin(az) * rad);
    stem.rotation.z = (Math.random() - 0.5) * 0.24;
    stem.rotation.x = (Math.random() - 0.5) * 0.2;
    cl.add(stem);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 5), REED_HEAD);
    head.position.set(stem.position.x - Math.sin(stem.rotation.z) * sh / 2, sh + 0.05, stem.position.z - Math.sin(stem.rotation.x) * sh / 2);
    head.rotation.z = stem.rotation.z * 1.7;
    head.rotation.x = stem.rotation.x * 1.7;
    cl.add(head);
  }
  cl.position.set(rx, 0, rz);
  cl.rotation.z = tilt;
  scene.add(cl);
  reedFx.push({ g: cl, ph: Math.random() * 6.28 });
}
for (let i = 0; i < 10; i++) {
  const a = rand() * Math.PI * 2, r = rr(13, BASE_R - 2.5);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (insideMountain(x, z, 1.0)) continue;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.3, 0.8), 0), M.rock);
  rock.scale.y = 0.7;
  rock.position.set(x, 0.15, z);
  {   /* 扩河后落水的散石沿法推离 */
    if (distTo(riverPts, x, z) < 5.0) {
      let nr = riverPts[0], nd = 1e18;
      for (const q0 of riverPts) { const dd = (q0.x - x) ** 2 + (q0.z - z) ** 2; if (dd < nd) { nd = dd; nr = q0; } }
      const ux2 = x - nr.x, uz2 = z - nr.z, ul = Math.hypot(ux2, uz2) || 1;
      const kk = (5.4 + Math.random()) / ul;
      rock.position.x = nr.x + ux2 * kk; rock.position.z = nr.z + uz2 * kk;
    }
  }
  {   /* 桥位圈 3.2m 内散石外推，方便扩建桥台 */
    const rbx = x - STREAM_BRIDGE.x, rbz = z - STREAM_BRIDGE.z, rbd = Math.hypot(rbx, rbz);
    if (rbd < 3.2) {
      const kk = (3.6 + Math.random() * 0.9) / (rbd || 0.2);
      rock.position.x = STREAM_BRIDGE.x + rbx * kk;
      rock.position.z = STREAM_BRIDGE.z + rbz * kk;
    }
  }
  {   /* 压路/近路的大石迁去河岸：沿河岸法线站到水边 */
    let nrp = riverPts[0], ndr = 1e18, ndr2 = 1e18, nroad = roadCurve.getPointAt(0);
    for (const q0 of riverPts) { const dd = (q0.x - rock.position.x) ** 2 + (q0.z - rock.position.z) ** 2; if (dd < ndr) { ndr = dd; nrp = q0; } }
    for (let k = 0; k <= 60; k++) {
      const pr = roadCurve.getPointAt(k / 60);
      const dd = (pr.x - rock.position.x) ** 2 + (pr.z - rock.position.z) ** 2;
      if (dd < ndr2) { ndr2 = dd; nroad = pr; }
    }
    if (Math.sqrt(ndr2) < 2.4) {
      const ux2 = rock.position.x - nrp.x, uz2 = rock.position.z - nrp.z;
      const ul = Math.hypot(ux2, uz2) || 1;
      const dT = 4.7 + Math.random() * 0.5;
      let nx2 = nrp.x + ux2 / ul * dT, nz2 = nrp.z + uz2 / ul * dT;
      const rl = Math.hypot(nx2, nz2);
      if (rl > BASE_R - 1.2) { const kk = (BASE_R - 1.2) / rl; nx2 *= kk; nz2 *= kk; }
      rock.position.x = nx2; rock.position.z = nz2;
    }
  }
  {   /* v4.95b 大桥南岸台阶口避让：所有位移做完后终判，±2.6 桥登门 2.5m 圈内不放散石 */
    let skipStair = false;
    for (const sgn of [-1, 1]) { const ddx = rock.position.x - sgn * 2.6, ddz = rock.position.z - 25.3; if (ddx * ddx + ddz * ddz < 6.4) skipStair = true; }
    if (Math.hypot(rock.position.x, rock.position.z - 25.0) < 3.0) skipStair = true;   /* 正门口再扩 3m */
    if (skipStair) { rock.geometry.dispose(); continue; }
  }
  rock.rotation.set(rand(), rand() * 3, rand());
  rock.castShadow = true; rock.receiveShadow = true;
  scene.add(rock);
}

/* v4.95b 桥轴视线清扫：南北岸正对桥登门 ±3.2m 带内的低矮石坨/灌木一律横移到 x±4.6 外 */
{
  const _v3 = new THREE.Vector3();
  scene.traverse(function (o) {
    if (!o.isMesh || !o.material || !o.material.color) return;
    const hx = o.material.color.getHexString();
    if (hx !== '83715b' && hx !== 'b5793a' && hx !== '7d8a4a' && hx !== 'c25b33' && hx !== '8f8a7a') return;
    let top = o; while (top.parent && top.parent !== scene) top = top.parent;
    const p = top.getWorldPosition(_v3);
    if (p.y > 1.4 || Math.abs(p.x) >= 3.2) return;
    if (!((p.z > 11.5 && p.z < 16.8) || (p.z > 23.4 && p.z < 27.6))) return;
    const sgn = p.x >= 0 ? 1 : -1;
    const dx = sgn * 4.9 - p.x;
    top.position.x += (top === o ? dx : dx);   /* 挂在 scene 的 mesh 直接推；group 子件则推根 */
  });
}

/* ---------------- 小动物 ---------------- */
const animals = [];
function makeChicken(color) {   /* v4.98b 圆润低模鸡：单体卵形躯干（平滑大球），非球串 */
  const g = new THREE.Group();
  const c0 = new THREE.Color(color);
  const wingC = mat('#' + c0.clone().offsetHSL(0.02, -0.08, 0.1).getHexString());
  const darkC = mat('#' + c0.clone().offsetHSL(-0.02, 0.1, -0.16).getHexString());
  const shd = (o2) => { o2.castShadow = true; return o2; };
  /* 躯干：单一卵形（12 段平滑，前倾下伏） */
  const body = shd(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mat(color)));
  body.scale.set(1.05, 0.92, 1.32); body.position.set(0, 0.36, -0.04); body.rotation.x = 0.16;
  /* 胸：圆垫 */
  const chest = shd(new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), wingC));
  chest.scale.set(0.95, 0.85, 0.6); chest.position.set(0, 0.32, 0.155);
  /* 颈：八段圆斜柱 */
  const neck = shd(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.058, 0.2, 8), mat(color)));
  neck.position.set(0, 0.53, 0.185); neck.rotation.x = 0.4;
  const head = shd(new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(color)));
  head.scale.set(1, 0.92, 1.25); head.position.set(0, 0.635, 0.255);
  /* 冠：三齿错峰 */
  for (let k = 0; k < 3; k++) { const cc = shd(box(0.022, 0.05 - k * 0.008, 0.045, mat('#c03a26'))); cc.position.set(0, 0.685 - k * 0.004, 0.3 - k * 0.042); g.add(cc); }
  /* 喙 + 肉垂 */
  const beak = shd(new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.1, 4), mat('#d99a3c')));
  beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.615, 0.36); beak.rotation.z = Math.PI / 4; g.add(beak);
  const wattle = shd(box(0.02, 0.05, 0.03, mat('#b93a24'))); wattle.position.set(0, 0.575, 0.33); g.add(wattle);
  const eyeM = mat('#231a12');
  for (const s of [-1, 1]) { const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), eyeM); e2.position.set(s * 0.052, 0.645, 0.285); g.add(e2); }
  /* 翅：两面贴羽板（后抿） */
  for (const s of [-1, 1]) {
    const wg = shd(new THREE.Mesh(new THREE.SphereGeometry(0.1, 9, 7), wingC));
    wg.scale.set(0.32, 0.78, 1.15); wg.position.set(s * 0.135, 0.39, -0.03); wg.rotation.x = -0.28; wg.rotation.z = s * 0.16; g.add(wg);
    const wt = shd(new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 6), darkC));
    wt.scale.set(0.3, 0.5, 1); wt.position.set(s * 0.15, 0.43, -0.15); wt.rotation.x = -0.42; wt.rotation.z = s * 0.2; g.add(wt);
  }
  /* 尾：三扇弯羽上翘后展（压扁球片，弯弧离身，不粘臀） */
  for (let k = 0; k < 3; k++) {
    const tf = shd(new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), k === 1 ? wingC : darkC));
    tf.scale.set(0.42 + Math.abs(k - 1) * 0.1, 1.25, 0.16);
    tf.position.set((k - 1) * 0.055, 0.56 + (1 - Math.abs(k - 1)) * 0.02, -0.27 - Math.abs(k - 1) * 0.015);
    tf.rotation.x = -0.72 - Math.abs(k - 1) * 0.14; tf.rotation.z = (k - 1) * 0.18; g.add(tf);
  }
  const coop = shd(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), darkC));   /* 尾上覆羽：衔接臀尾 */
  coop.scale.set(1.15, 0.55, 0.8); coop.position.set(0, 0.47, -0.2); coop.rotation.x = -0.5; g.add(coop);
  /* 腿 + 四趾 */
  const legM = mat('#c98a3c');
  for (const s of [-1, 1]) {
    const up = shd(cyl(0.017, 0.021, 0.17, 4, legM)); up.position.set(s * 0.06, 0.16, 0.01); g.add(up);
    for (let k = -1; k <= 1; k++) { const toe = shd(box(0.016, 0.012, 0.07, legM)); toe.position.set(s * 0.06 + k * 0.022, 0.065, 0.07); g.add(toe); }
    const hb = shd(box(0.016, 0.012, 0.04, legM)); hb.position.set(s * 0.06, 0.065, -0.035); hb.rotation.y = 0.5 * s; g.add(hb);
  }
  g.add(body, chest, neck, head);
  return g;
}
/* 鸡：主院内 + 前院各两只 */
[[-1.6, 0.6, '#e2d8bc'], [1.4, 1.4, '#b98d5e'], [-4.2, 7.3, '#e2d8bc'], [-5.4, 6.0, '#9c6b42']]
  .forEach(p => {
    const c = makeChicken(p[2]);
    c.position.set(p[0], 0, p[1]);
    c.rotation.y = rr(0, 6.28);
    c.userData.phase = rand() * 6.28;
    scene.add(c);
    animals.push({ kind: 'chicken', obj: c });
  });
/* v4.97 秋叶铺地：InstancedMesh 三层密度（甬道两侧密 / 走道面疏 / 门外大路散） */
{
  const leafTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = '#fff';
    x.beginPath();
    for (let k = 0; k < 10; k++) {   /* 五裂枫叶：径 26/9 交替 */
      const rr2 = k % 2 === 0 ? 26 : 9, a2 = -Math.PI / 2 + k * Math.PI / 5;
      const px = 32 + Math.cos(a2) * rr2, py = 30 + Math.sin(a2) * rr2;
      k === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath(); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.moveTo(32, 34); x.lineTo(32, 58); x.stroke();
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  })();
  const leafPal = ['#b8481f', '#c8632a', '#d07a2e', '#a83c28', '#c98f3a', '#8f3524', '#a8b04a', '#94a03c'];   /* v5.02 加黄绿两色 */
  const leafGeo = new THREE.PlaneGeometry(1, 1);
  const leafMat2 = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.42, roughness: 0.95, side: THREE.DoubleSide });
  const zones = [
    { n: 520, fn: () => { const sgn = Math.random() < 0.5 ? -1 : 1; return [sgn * (1.95 + Math.random() * 2.45), 0.7 + Math.random() * 8.4, 0.075]; } },          /* 甬道两侧地毯（v4.97 加密） */
    { n: 95,  fn: () => { const a2 = Math.random() * 6.283, rr2 = Math.sqrt(Math.random()) * 1.45; return [3.7 + Math.cos(a2) * rr2, 1.0 + Math.sin(a2) * rr2, 0.075]; } }, /* 院内枫树下一堆 */
    { n: 26,  fn: () => [ (Math.random() - 0.5) * 3.0, 0.9 + Math.random() * 8.0, 0.1 ] },                                                                        /* 走道面零星 */
    { n: 165, fn: () => { if (Math.random() < 0.55) return [(Math.random() - 0.5) * 7.5, 25.6 + Math.random() * 4.6, 0.09]; return [(Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 9), 10 + Math.random() * 16, 0.085]; } },  /* 门外官道 + 东西土路（加密） */
  ];
  const total = zones.reduce((s2, z2) => s2 + z2.n, 0);
  const im = new THREE.InstancedMesh(leafGeo, leafMat2, total);
  const mx = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), vv = new THREE.Vector3(), ss = new THREE.Vector3(), cc = new THREE.Color();
  let idx = 0;
  for (const zn of zones) for (let k = 0; k < zn.n; k++) {
    const [lx, lz, ly] = zn.fn();
    ee.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.5, 0, Math.random() * 6.283);
    qq.setFromEuler(ee);
    const tier = Math.random();   /* v5.02 三档叶径：基础 / 3× / 5× */
    const sc = (0.07 + Math.random() * 0.055) * (tier < 0.62 ? 1 : tier < 0.88 ? 3 : 5);
    vv.set(lx, ly + Math.random() * 0.012, lz); ss.set(sc, sc, sc);
    mx.compose(vv, qq, ss); im.setMatrixAt(idx, mx);
    cc.set(leafPal[(Math.random() * leafPal.length) | 0]); cc.offsetHSL(0, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.1);
    im.setColorAt(idx, cc);
    idx++;
  }
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.receiveShadow = false; im.castShadow = false;
  scene.add(im);
}
/* v5.02 大黄狗 2.0：圆润低模 + 全院漫游（撒欢跑 → 到点驻足摇尾歪头，偶尔小跳） */
{
  const g = new THREE.Group();
  const fur = mat('#c8a878'), belly = mat('#e6d2a8'), dark = mat('#a8875a'), pink = mat('#c97b6a');
  const shd = (o2) => { o2.castShadow = true; return o2; };
  const body = shd(new THREE.Mesh(new THREE.SphereGeometry(0.155, 11, 9), fur));
  body.scale.set(1.6, 0.98, 0.88); body.position.set(0, 0.34, 0); g.add(body);
  const chest = shd(new THREE.Mesh(new THREE.SphereGeometry(0.105, 9, 8), belly));
  chest.scale.set(0.9, 1, 0.8); chest.position.set(0.17, 0.3, 0); g.add(chest);
  const neck = shd(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.14, 8), fur));
  neck.position.set(0.24, 0.46, 0); neck.rotation.z = -0.55; g.add(neck);
  const headG = new THREE.Group(); headG.position.set(0.30, 0.55, 0); g.add(headG);
  const head = shd(new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), fur));
  head.scale.set(1.05, 0.95, 0.92); headG.add(head);
  const muzzle = shd(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 7), belly));
  muzzle.scale.set(1.5, 0.8, 0.8); muzzle.position.set(0.095, -0.02, 0); headG.add(muzzle);
  const noseM = shd(new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 6), mat('#3a3128')));
  noseM.position.set(0.165, 0.005, 0); headG.add(noseM);
  const eyeM = mat('#241a10');
  for (const s of [-1, 1]) { const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.015, 7, 6), eyeM); e2.position.set(0.075, 0.035, s * 0.058); headG.add(e2); }
  for (const s of [-1, 1]) {
    const earM = shd(new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.1, 4), dark));
    earM.position.set(-0.01, 0.1, s * 0.072); earM.rotation.z = 0.25; earM.rotation.x = s * -0.25; headG.add(earM);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.016, 6, 12), mat('#a83c2c', { roughness: 0.6 }));
  collar.position.set(0.215, 0.475, 0); collar.rotation.y = Math.PI / 2; collar.rotation.x = 0.5; g.add(collar);
  const tailG = new THREE.Group(); tailG.position.set(-0.24, 0.47, 0); g.add(tailG);
  const tailM = shd(new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.026, 6, 10, 4.6), dark));
  tailM.rotation.y = Math.PI / 2; tailG.add(tailM);
  const legs = [];
  for (const [lx, lz, ph2] of [[0.16, 0.07, 0], [0.16, -0.07, Math.PI], [-0.15, 0.075, Math.PI], [-0.15, -0.075, 0]]) {
    const lg = new THREE.Group(); lg.position.set(lx, 0.27, lz); g.add(lg);
    const up = shd(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.2, 7), fur)); up.position.y = -0.1; lg.add(up);
    const paw = shd(new THREE.Mesh(new THREE.SphereGeometry(0.036, 7, 6), belly)); paw.scale.set(1.25, 0.62, 1); paw.position.set(0.012, -0.208, 0); lg.add(paw);
    legs.push({ g2: lg, ph: ph2 });
  }
  g.position.set(2.6, 0.06, 7.2); g.rotation.y = -0.9;
  scene.add(g);
  const WP = [[2.6, 7.2], [0, 6.2], [-2.8, 4.6], [-3.8, 1.2], [-2.4, -2.2], [0, -3.9], [2.6, -2.6], [3.9, 1.0], [2.2, 3.4]];
  const st = { wp: 1, wait: 0, run: 1.5 + Math.random() * 0.7, hop: 0, tilt: 0, ph: Math.random() * 6.28 };
  animals.push({ kind: 'dog', obj: g, tail: tailM, tick(dt2, t2) {
    const P = g.position;
    if (st.wait > 0) {
      st.wait -= dt2;
      tailG.rotation.y = Math.sin(t2 * 5) * 0.32;
      st.tilt += ((Math.sin(t2 * 0.7) > 0.86 ? 0.42 : 0) - st.tilt) * Math.min(1, dt2 * 3);
      headG.rotation.z = st.tilt;
      for (const L of legs) L.g2.rotation.z *= 0.9;
      st.hop = Math.max(0, st.hop - dt2);
      P.y = (window.__groundAt ? window.__groundAt(P.x, P.z, 0.5) : 0.06) + 0.02 + Math.abs(Math.sin(st.hop * 14)) * (st.hop > 0 ? 0.07 : 0);
    } else {
      const [tx, tz] = WP[st.wp];
      let dx = tx - P.x, dz = tz - P.z; const d = Math.hypot(dx, dz);
      if (d < 0.3) { st.wp = (st.wp + 1 + ((Math.random() * 2) | 0)) % WP.length; st.wait = 1.1 + Math.random() * 2.2; if (Math.random() < 0.3) st.hop = 0.5; return; }
      dx /= d; dz /= d;
      let want = Math.atan2(-dz, dx); let da = want - g.rotation.y;
      while (da > Math.PI) da -= 6.28318; while (da < -Math.PI) da += 6.28318;
      g.rotation.y += da * Math.min(1, dt2 * 6);
      const sp = st.run;
      P.x += dx * sp * dt2; P.z += dz * sp * dt2;
      if (window.__cw) window.__cw(P);                        /* v5.22 偶尔穿院墙/厢角：直线插值无碰撞，补 WALLS 推离 */
      P.x = Math.max(-9.3, Math.min(9.3, P.x)); P.z = Math.max(-9.3, Math.min(9.3, P.z));   /* 院界兜底 */
      const gY = window.__groundAt ? window.__groundAt(P.x, P.z, 0.5) : 0.06;
      const gait = Math.sin(t2 * 11 + st.ph);
      P.y = gY + 0.02 + Math.abs(gait) * 0.022;
      for (const L of legs) L.g2.rotation.z = gait * 0.6 * (L.ph === 0 ? 1 : -1);
      tailG.rotation.y = Math.sin(t2 * 13) * 0.55;
      headG.rotation.z = 0; st.tilt = 0;
    }
  } });
}
/* 马房（墙外酒旗东侧）：木柱坡顶三栏，中栏寄 1 匹（GLB 就绪后挂入），左右空置 */
{
  const W = mat('#6b4a30'), W2 = mat('#54402a');
  const cx = 15.1, cz = 7.9;
  const st = new THREE.Group();
  for (const dx of [-1.85, 0, 1.85]) {              // 前低后高柱（窄身）
    const pb = box(0.13, 2.0, 0.13, W); pb.position.set(cx + dx, 1.0, cz + 1.3); st.add(pb);
    const qb = box(0.13, 2.45, 0.13, W); qb.position.set(cx + dx, 1.225, cz - 1.3); st.add(qb);
  }
  const back = box(4.0, 2.25, 0.09, W2); back.position.set(cx, 1.13, cz - 1.34); st.add(back);
  for (const sx of [-1, 1]) {
    const sw = box(0.09, 2.2, 2.7, W2); sw.position.set(cx + sx * 2.0, 1.1, cz); st.add(sw);
  }
  for (const dx of [-0.66, 0.66]) {                 // 窄三栏隔墙
    const dv = box(0.07, 1.2, 2.5, W2); dv.position.set(cx + dx, 0.6, cz - 0.05); st.add(dv);
  }
  const rail = box(4.0, 0.09, 0.09, W); rail.position.set(cx, 1.2, cz + 1.3); st.add(rail);
  for (const dx of [-1.33, 0, 1.33]) {
    const gp = box(0.07, 1.2, 0.07, W); gp.position.set(cx + dx, 0.6, cz + 1.3); st.add(gp);
  }
  for (const q of [-1, 1]) for (const o of [-0.3, 0.3]) {
    const bar = box(0.045, 1.16, 0.045, W); bar.position.set(cx + q * 1.0 + o, 0.58, cz + 1.3); st.add(bar);
  }
  /* 乱木拼顶：板宽/厚/色/出头全随机（Math.random 不占场景 rand 序列） */
  const roof = new THREE.Group();
  roof.position.set(cx, 2.28, cz - 0.02);
  roof.rotation.x = Math.atan2(0.45, 2.9);
  const tone = ['#4c3a26', '#55412c', '#5f4a32', '#473624', '#593f29', '#6e6558', '#575046', '#3d332a'];   // 含风化灰板
  const L = 2.95;
  let zc = -L / 2;
  while (zc < L / 2 - 0.04) {
    const w = Math.min(0.18 + Math.random() * 0.24, L / 2 - zc);
    const pk = box(4.1 + (Math.random() - 0.5) * 0.18,
      0.05 + Math.random() * 0.035, w,
      mat(tone[Math.floor(Math.random() * tone.length)], { roughness: 0.9 }));
    pk.position.set((Math.random() - 0.5) * 0.08, 0, zc + w / 2);
    pk.rotation.z = (Math.random() - 0.5) * 0.035;
    roof.add(pk);
    zc += w + 0.012;
  }
  /* 岁月痕迹：烧焦斑驳 / 腐孔 / 苔痕 / 秋叶积顶（Math.random） */
  const pat = mat('#16110c', { roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const bp = new THREE.Mesh(new THREE.CircleGeometry(0.03 + Math.random() * 0.09, 7), pat);
    bp.rotation.x = -Math.PI / 2;
    bp.position.set((Math.random() - 0.5) * 3.9, 0.062, (Math.random() - 0.5) * 2.8);
    roof.add(bp);
  }
  const rotM = mat('#0d0a07', { roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02 + Math.random() * 0.03, 0.028 + Math.random() * 0.03, 0.03, 7), rotM);
    h.position.set((Math.random() - 0.5) * 3.8, 0.035, (Math.random() - 0.5) * 2.7);
    roof.add(h);
  }
  const moss = mat('#5c6a44', { roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const m0 = new THREE.Mesh(new THREE.CircleGeometry(0.06 + Math.random() * 0.1, 8), moss);
    m0.rotation.x = -Math.PI / 2; m0.scale.y = 0.6;
    m0.position.set((Math.random() - 0.5) * 3.9, 0.06, (Math.random() - 0.5) * 2.8);
    roof.add(m0);
  }
  const LC = ['#c9561f', '#dd8330', '#c3a23e', '#8c4a26'].map(c =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }));
  for (let i = 0; i < 16; i++) {
    const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.055 + Math.random() * 0.05, 0.04 + Math.random() * 0.035), LC[i % 4]);
    lf.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
    lf.position.set((Math.random() - 0.5) * 4.0, 0.067, (Math.random() - 0.5) * 2.85);
    roof.add(lf);
  }
  st.add(roof);
  const ridge = box(4.2, 0.1, 0.2, mat('#3f3020')); ridge.position.set(cx, 2.56, cz - 1.44); st.add(ridge);
  for (const dx of [-1.28, 0, 1.28]) {              // 三栏各一料槽
    const ft = box(0.78, 0.18, 0.26, W); ft.position.set(cx + dx, 0.86, cz + 1.42); st.add(ft);
  }
  const hay = box(0.62, 0.13, 0.19, mat('#c9a24e')); hay.position.set(cx, 1.02, cz + 1.42); hay.rotation.y = 0.08; st.add(hay);
  const pile = box(0.6, 0.35, 0.6, mat('#b98d3f')); pile.position.set(cx - 1.4, 0.18, cz - 0.55); pile.rotation.set(0.1, 0.5, 0.08); st.add(pile);
  const trough = cyl(0.28, 0.24, 0.3, 8, W); trough.position.set(cx + 1.45, 0.15, cz - 0.62); st.add(trough);
  const signP = box(0.95, 0.26, 0.06, W2); signP.position.set(cx, 1.86, cz + 1.34); st.add(signP);   // 门楣小匾
  /* 油灯（马房前檐右角）：夜自动点灯 */
  {
    const arm = box(0.55, 0.05, 0.05, W2); arm.position.set(cx + 2.1, 1.98, cz + 1.25); st.add(arm);
    const rope = cyl(0.012, 0.012, 0.3, 4, mat('#2c2620')); rope.position.set(cx + 1.86, 1.8, cz + 1.25); st.add(rope);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.26, 6), mat('#3a332a', { metalness: 0.4, roughness: 0.6 })); body.position.set(cx + 1.86, 1.53, cz + 1.25); st.add(body);
    const glassM = mat('#ffd9a0', { emissive: '#ff9d3c', emissiveIntensity: 0.3 });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 8), glassM); glass.position.set(cx + 1.86, 1.52, cz + 1.25); st.add(glass);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.09, 6), mat('#3a332a', { metalness: 0.4, roughness: 0.6 })); cap.position.set(cx + 1.86, 1.68, cz + 1.25); st.add(cap);
    const ll = new THREE.PointLight('#ffb45a', 0, 4.5, 2); ll.position.set(cx + 1.86, 1.48, cz + 1.25); st.add(ll);
    dayNight.lanternMats.push(glassM); dayNight.lanternLights.push(ll);
  }
  for (const t of scatterTrees)
    if (t.userData.tx > 12.2 && t.userData.tx < 18.2 && t.userData.tz > 5.6 && t.userData.tz < 10.3) scene.remove(t);
  {   /* 后撤让路 + 转身平行路缘：绕 (cx,cz) 旋后整体后移 */
    let bD2 = 1e18, bA2 = 0.5;
    for (let k = 0; k <= 400; k++) { const p0 = roadCurve.getPointAt(k / 400); const d = (p0.x - cx) ** 2 + (p0.z - cz) ** 2; if (d < bD2) { bD2 = d; bA2 = k / 400; } }
    const tg0 = roadCurve.getTangentAt(bA2);
    const th = Math.atan2(-tg0.z, tg0.x);
    const px2 = cx + tg0.z * 0.62, pz2 = cz - tg0.x * 0.62;   // 沿路法线后退 0.62m
    st.rotation.y = th;
    st.position.set(px2 - (cx * Math.cos(th) + cz * Math.sin(th)), 0, pz2 - (-cx * Math.sin(th) + cz * Math.cos(th)));
  }
  scene.add(st);
  const slot = new THREE.Group(); slot.position.set(cx, 0, cz + 0.1); st.add(slot);
  const entry = { kind: 'horse', obj: slot, tail: { rotation: {} } };
  animals.push(entry);
  window.__stableReq = { slot, entry };
  const post = cyl(0.09, 0.1, 1.2, 6, M.wood); post.position.set(12.95, 0.6, 8.8); scene.add(post);
}
/* ---------------- 山洞小瀑布 v3：大山高崖洞（y8.4）飞瀑 12m 越肩落溪，石只堆潭边 ---------------- */
const splashFx = [], dropFx = [];
{
  const mt = { cx: -14, cz: -19.5, R: 9.5, H: 10.5 };     // 后排大山锥
  const land = streamCurve.getPoint(0);   // 落点=溪流源头端点，潭即溪首
  const F = new THREE.Vector3(land.x - mt.cx, 0, land.z - mt.cz).normalize();
  const u0 = 0.45, y0 = mt.H * Math.pow(1 - Math.max(0, u0 - 0.34) / 0.66, 1.15);
  const caveP = new THREE.Vector3(mt.cx + F.x * (u0 * mt.R + 0.25), y0 - 0.1, mt.cz + F.z * (u0 * mt.R + 0.25));
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.42, 10), mat('#0e0c0a', { roughness: 1 }));
  mouth.position.copy(caveP);
  mouth.lookAt(caveP.x + F.x, caveP.y - 0.35, caveP.z + F.z);
  scene.add(mouth);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.09, 5, 9, Math.PI), M.stone);
  arch.position.copy(caveP); arch.position.y += 0.05;
  arch.lookAt(caveP.x + F.x, caveP.y - 0.35, caveP.z + F.z);
  scene.add(arch);
  /* 五段跌水：沿山脊蛇形逐段贴坡而下 */
  const landP = new THREE.Vector3(land.x, 0.10, land.z);
  const perp = new THREE.Vector3(F.z, 0, -F.x);
  const yAt = (x, z) => {
    let y = 0;
    for (const c0 of mountainCones) {
      const u2 = Math.hypot((x - c0.cx) / c0.R, (z - c0.cz) / c0.R);
      if (u2 < 1) y = Math.max(y, surfaceY(c0, u2));
    }
    return y;
  };
  const path = [caveP.clone()];
  for (let i = 1; i <= 5; i++) {
    const u = 0.5 + (i / 5) * 0.66;
    const lat = 0.55 * Math.sin(5.1 * u + 0.8) + 0.3 * Math.sin(9.7 * u + 2.2);
    const px = mt.cx + F.x * u * mt.R + perp.x * lat, pz = mt.cz + F.z * u * mt.R + perp.z * lat;
    path.push(i === 5 ? landP.clone() : new THREE.Vector3(px, Math.max(0.12, yAt(px, pz) + 0.06), pz));
  }
  const wfMat = new THREE.MeshBasicMaterial({ color: '#a5dbe6', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  wfMat.map = (() => {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = 'rgba(150,215,230,0.55)'; x.fillRect(0, 0, 32, 128);
    for (let i = 0; i < 7; i++) {
      x.strokeStyle = 'rgba(255,255,255,' + (0.35 + Math.random() * 0.5) + ')';
      x.lineWidth = 1.5 + Math.random() * 3;
      const lx = 2 + Math.random() * 28;
      x.beginPath(); x.moveTo(lx, 0);
      for (let yy = 16; yy <= 128; yy += 16) x.lineTo(lx + (Math.random() - 0.5) * 5, yy);
      x.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 6);
    return t;
  })();
  for (let i = 0; i < 5; i++) {
    const A = path[i], B = path[i + 1];
    const seg = B.clone().sub(A);
    const sl = seg.length();
    const msh = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, sl), wfMat);
    msh.position.copy(A).lerp(B, 0.5);
    msh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), seg.normalize());
    scene.add(msh);
    if (i > 0) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.52), i % 2 ? M.stone : mat('#7a6c52', { flatShading: true }));
      led.position.set(A.x, A.y - 0.12, A.z);
      led.rotation.y = Math.random() * 3.14;
      led.castShadow = led.receiveShadow = true;
      scene.add(led);
    }
  }
  dayNight.wfMat = wfMat; window.__wfMat = wfMat;
  dayNight.wfFx = [];
  /* 跌潭 + 潭边乱石（石头只在这里） */
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), mat('#27454d', { transparent: true, opacity: 0.85 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(land.x, 0.09, land.z); scene.add(pool);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28 + 0.4;
    const rs = 0.26 + Math.random() * 0.22;
    const rb = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), i % 2 ? M.stone : mat('#7a6c52', { flatShading: true }));
    rb.position.set(land.x + Math.cos(a) * (0.95 + Math.random() * 0.25), rs * 0.4, land.z + Math.sin(a) * (0.9 + Math.random() * 0.25));
    rb.rotation.set(Math.random(), Math.random() * 3, Math.random());
    rb.castShadow = rb.receiveShadow = true; scene.add(rb);
  }
  const foamTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const x = cv.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.55, 'rgba(240,250,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  for (const [ox, oz, sc0] of [[0, 0, 1.1], [0.55, -0.4, 0.6], [-0.6, 0.28, 0.65], [0.22, 0.65, 0.55]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: foamTex, transparent: true, opacity: 0.8, depthWrite: false }));
    sp.position.set(land.x + ox, 0.24, land.z + oz);
    sp.scale.setScalar(sc0);
    sp.userData = { s0: sc0, ph: Math.random() * 6.28, y0: 0.24 };
    scene.add(sp); splashFx.push(sp);
  }
  for (let i = 1; i <= 3; i++) {   /* 每级石坎：双跌花 + 双侧溅珠 */
    const A = path[i];
    for (const [off, sc] of [[0.18, 0.46], [-0.24, 0.3]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: foamTex, transparent: true, opacity: 0.78, depthWrite: false }));
      sp.position.set(A.x + off, A.y + 0.12, A.z);
      sp.scale.setScalar(sc);
      sp.userData = { s0: sc, ph: Math.random() * 6.28, y0: A.y + 0.12 };
      scene.add(sp); splashFx.push(sp);
    }
    for (let k = 0; k < 2; k++) {
      const dr = new THREE.Sprite(new THREE.SpriteMaterial({ map: foamTex, transparent: true, opacity: 0.65, depthWrite: false }));
      dr.userData = { a: (k ? 1.9 : 4.4), ph: Math.random(), r0: 0.1 + Math.random() * 0.12, ux: A.x, uz: A.z, yb: A.y + 0.05, h0: 0.3 };
      dr.scale.setScalar(0.12);
      scene.add(dr); dropFx.push(dr);
    }
  }
  for (let i = 0; i < 8; i++) {
    const dr = new THREE.Sprite(new THREE.SpriteMaterial({ map: foamTex, transparent: true, opacity: 0.7, depthWrite: false }));
    dr.userData = { a: (i / 8) * 6.28, ph: Math.random(), r0: 0.25 + Math.random() * 0.35, ux: land.x, uz: land.z };
    dr.scale.setScalar(0.16);
    scene.add(dr); dropFx.push(dr);
  }
  for (const sp of splashFx.concat(dropFx)) {
    if (!dayNight.wfFx.find(e => e.m === sp.material))
      dayNight.wfFx.push({ m: sp.material, op: sp.material.opacity, c: sp.material.color.clone() });
  }
}
/* 鹿（东侧小山林间） */
{
  const g = new THREE.Group();
  const body = box(1.0, 0.5, 0.42, mat('#b98d5e')); body.position.y = 0.95;
  const neck = box(0.2, 0.55, 0.2, mat('#b98d5e')); neck.position.set(0.5, 1.35, 0); neck.rotation.z = -0.4;
  const head = box(0.34, 0.2, 0.2, mat('#a67c4e')); head.position.set(0.72, 1.66, 0);
  for (const s of [-1, 1]) {
    const ant = cyl(0.025, 0.03, 0.3, 4, mat('#7a5c3a'));
    ant.position.set(0.72, 1.85, s * 0.08); ant.rotation.z = s * 0.35;
    const br = cyl(0.02, 0.02, 0.16, 4, mat('#7a5c3a'));
    br.position.set(0.78, 1.95, s * 0.14); br.rotation.z = s * 1.1;
    g.add(ant, br);
  }
  for (const [x, z] of [[0.35, 0.14], [0.35, -0.14], [-0.35, 0.14], [-0.35, -0.14]]) {
    const leg = box(0.08, 0.72, 0.08, mat('#9c7448')); leg.position.set(x, 0.4, z); g.add(leg);
  }
  g.add(body, neck, head);
  g.userData.head = head;
  g.position.set(19.5, 0, -2.2); g.rotation.y = -1.1;
  scene.add(g);
  animals.push({ kind: 'deer', obj: g });
}
/* 鸭子（码头附近河湾） */
[[-6.8, 18.0], [-7.5, 18.3], [-6.4, 17.7]].forEach(p => {
  const g = new THREE.Group();
  const dm = mat('#e9e5d6', { roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 9), dm);
  body.scale.set(1.05, 0.82, 1.5); body.position.y = 0.13; body.castShadow = true;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 6), dm);
  tail.position.set(0, 0.19, -0.16); tail.rotation.x = -0.7;
  const neck = cyl(0.028, 0.034, 0.12, 6, dm); neck.position.set(0, 0.24, 0.12); neck.rotation.x = -0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), dm);
  head.position.set(0, 0.31, 0.17);
  const crest = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), mat('#6f7d52', { roughness: 0.85 }));
  crest.position.set(0, 0.345, 0.15); crest.scale.set(0.8, 0.7, 1.4);
  const beak = box(0.055, 0.022, 0.06, mat('#d99a3c', { roughness: 0.6 })); beak.position.set(0, 0.3, 0.235);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.008, 5, 4), mat('#26221a')); eyeL.position.set(0.04, 0.322, 0.2);
  const eyeR = eyeL.clone(); eyeR.position.x = -0.04;
  g.add(body, tail, neck, head, crest, beak, eyeL, eyeR);
  g.position.set(p[0], 0, p[1]);
  g.rotation.y = rr(0, 6.28);
  g.userData.phase = rand() * 6.28;
  scene.add(g);
  animals.push({ kind: 'duck', obj: g });
});
/* 飞鸟 */
const flock = new THREE.Group();
const birdSlots = [];
{
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group();
    const a = rand() * 6.28, r = rr(9, 18);
    b.position.set(Math.cos(a) * r, rr(10.5, 15), Math.sin(a) * r);
    b.rotation.y = -a + Math.PI / 2;
    b.userData.phase = rand() * 6.28;
    b.userData.y0 = b.position.y;
    b.userData.flapS = rr(0.7, 1.4);
    b.userData.glide = rand() < 0.4;
    birdSlots.push(b);
    flock.add(b);
  }
  scene.add(flock);
}
/* 云：软边精灵絮团（canvas 絮纹理 ×5 叠加出体积感；夜/雷雨着色由 stormFx 驱动） */
let cloudN = 0;   /* envApply 写入夜强度 */
const cloudTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const cx = 128 + (Math.random() - 0.5) * 130, cy = 128 + (Math.random() - 0.5) * 80;
    const rad = 40 + Math.random() * 60;
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
  }
  return new THREE.CanvasTexture(cv);
})();
const CLOUD_TINT_N = new THREE.Color('#7e90a6');
const clouds = [];
for (let i = 0; i < 5; i++) {
  const g = new THREE.Group();
  const cm = new THREE.SpriteMaterial({ map: cloudTex, color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
  for (let j = 0; j < 5; j++) {
    const p = new THREE.Sprite(cm);
    p.position.set(rr(-2.6, 2.6), rr(-0.5, 0.5), rr(-1.2, 1.2));
    p.scale.set(rr(4.5, 8), rr(2.4, 3.6), 1);
    g.add(p);
  }
  g.position.set(rr(-24, 24), rr(14, 18), rr(-20, 14));
  g.userData.speed = rr(0.15, 0.4);
  g.userData.mat = cm;
  g.userData.baseY = g.position.y;
  scene.add(g);
  clouds.push(g);
}
if (window.__smokeTexReady) window.__smokeTexReady();   /* 炊烟絮精灵取云纹理 */
if (window.__bathSteam) for (const st of window.__bathSteam) { st.s.material.map = cloudTex; st.s.material.needsUpdate = true; }   /* 澡塘蒸汽取云纹理 */

/* ---------------- 对岸（桥南）生态：假山 + 景石 + 秋树 + 灌木草丛 + 青蛙 + 兔子 ---------------- */
const critters = [];
{
  const put = (obj, x, y, z, ry) => {
    obj.position.set(x, y, z);
    if (ry !== undefined) obj.rotation.y = ry;
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(obj);
    return obj;
  };
  /* v4.79 排序基准线 */
  const rzAt = (x0) => { let best = 0, bd = 1e9; for (let i2 = 0; i2 <= 240; i2++) { const q = riverCurve.getPointAt(i2 / 240); const d = Math.abs(q.x - x0); if (d < bd) { bd = d; best = q.z; } } return best; };
  /* 临水假山小丘：v4.79 由河心移到南岸（盘缘自动截切） */
  put(jaggedCone({ cx: 11.8, cz: 26.2, R: 2.6, H: 3.4, seg: 7 }, 3.1), 0, 0, 0);
  /* 北岸景石：v4.79 等距一列贴岸线（原散落河心） */
  for (const [x, s] of [[-12, 0.75], [-8.5, 0.55], [-5.6, 0.6], [6.5, 0.7], [10, 0.8], [15.5, 0.7]]) {   /* v4.95b 桥轴正对列(-6.5~-1)挪开，北岸让出对岸视线 */
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), M.rock);
    rk.scale.y = 0.72;
    put(rk, x, s * 0.32, rzAt(x) - 5.4, rand() * 3);
  }
  /* 秋树 */
  const tp = [[makeMaple(1.05), -8.5, rzAt(-8.5) - 4.5], [makeGinkgo(1.0), -3, rzAt(-3) - 5.0],
    [makePersimmon(0.9), 11.5, rzAt(11.5) - 4.8], [makeMaple(0.8), 15, rzAt(15) - 4.9]];
  for (const [tr, x, z] of tp) put(tr, x, 0, z, rand() * 6.28);
  /* 灌木 + 草丛 */
  for (const [x, z] of [[-6, rzAt(-6) + 5.2], [5.2, rzAt(5.2) + 5.4], [10.5, rzAt(10.5) - 5.0], [-14.5, rzAt(-14.5) - 5.0]]) {   /* v4.95b 树放回；堵门的其实是散石（见上避让块） */
    const b = new THREE.Mesh(new THREE.SphereGeometry(rr(0.4, 0.7), 7, 5), bushMat[Math.floor(rand() * 3)]);
    b.scale.y = 0.6;
    put(b, x, 0.25, z);
  }
  for (const [x, z] of [[-3, rzAt(-3) + 5.0], [6.5, rzAt(6.5) + 4.55], [13.2, rzAt(13.2) - 5.2], [-8, rzAt(-8) + 3.9]]) {
    const tuft = new THREE.Mesh(grassGeo, grassTuftMat);
    put(tuft, x, 0.2, z, rand() * 3);
  }
  /* 青蛙 ×3：石上/岸边/假山脚，会朝水面鼓气蹦跶 */
  function makeFrog() {
    const g = new THREE.Group();
    const gm = mat('#5c7440'); const gd = mat('#47602f');
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 9), gm);
    body.scale.set(1.15, 0.85, 1.35); body.position.y = 0.085; body.castShadow = true;
    g.add(body);
    for (const [ox, oz] of [[0.05, 0.02], [-0.05, -0.02], [0.02, -0.07]]) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), gd);
      sp.scale.y = 0.4; sp.position.set(ox, 0.152, oz); g.add(sp);
    }
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), gm);
    snout.scale.set(1.1, 0.78, 1.05); snout.position.set(0, 0.1, 0.13); g.add(snout);
    for (const s of [-1, 1]) {
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.033, 8, 6), gm);
      lid.position.set(s * 0.055, 0.17, 0.11); g.add(lid);
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), mat('#f2efe4'));
      w.position.set(s * 0.055, 0.186, 0.126); g.add(w);
      const pb = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), mat('#1d1d1d'));
      pb.position.set(s * 0.055, 0.19, 0.142); g.add(pb);
      const arm = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), gm);
      arm.scale.set(0.9, 0.9, 1.6); arm.position.set(s * 0.075, 0.033, 0.09); g.add(arm);
      const th = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), gm);
      th.scale.set(0.8, 1.15, 1.5); th.position.set(s * 0.085, 0.058, -0.06); g.add(th);
      const ft = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), gm);
      ft.scale.set(1, 0.5, 1.8); ft.position.set(s * 0.09, 0.02, 0.02); g.add(ft);
    }
    return { g, body };
  }
  for (const [x, y, z, ry, zn, zx] of [[-5, 0.02, rzAt(-5) - 4.9, 0, rzAt(-5) - 5.5, rzAt(-5) - 4.3],
    [2.2, 0.02, rzAt(2.2) - 4.85, 0, rzAt(2.2) - 5.4, rzAt(2.2) - 4.3], [7.2, 0.02, rzAt(7.2) - 4.9, 0, rzAt(7.2) - 5.5, rzAt(7.2) - 4.3]]) {
    const fr = makeFrog();
    put(fr.g, x, y, z, ry);
    critters.push({ kind: 'frog', obj: fr.g, body: fr.body, ph: rand() * 7,
      baseY: y, baseZ: z, hopAt: 1.5 + rr(0, 5), hopT: 0, dirZ: -1, zN: zn, zX: zx });
  }
  /* 野兔 ×2：竖耳张望、偶尔转头 */
  function makeRabbit() {
    const g = new THREE.Group();
    const rm = mat('#d8cdb2'); const rd = mat('#b3a384');
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 9), rm);
    body.scale.set(1, 0.95, 1.4); body.position.y = 0.1; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), rm);
    head.position.set(0, 0.175, 0.1);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), rm);
    muzzle.position.set(0, 0.16, 0.148);
    const ear = new THREE.Group();
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), rm);
      e.scale.set(0.75, 2.9, 0.6); e.position.set(s * 0.028, 0.245, 0.08);
      e.rotation.z = s * 0.14;
      const ei = new THREE.Mesh(new THREE.SphereGeometry(0.013, 5, 4), rd);
      ei.scale.set(0.7, 2.6, 0.5); ei.position.set(s * 0.028, 0.245, 0.086);
      ei.rotation.z = s * 0.14;
      ear.add(e, ei);
      const ey = new THREE.Mesh(new THREE.SphereGeometry(0.008, 5, 4), mat('#2a2118'));
      ey.position.set(s * 0.034, 0.184, 0.138); g.add(ey);
      const arm = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), rm);
      arm.scale.set(1, 1, 1.5); arm.position.set(s * 0.038, 0.03, 0.06); g.add(arm);
      const th = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), rm);
      th.scale.set(0.75, 1.05, 1.5); th.position.set(s * 0.055, 0.062, -0.05); g.add(th);
      const ft = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), rm);
      ft.scale.set(1, 0.5, 1.9); ft.position.set(s * 0.055, 0.02, 0.01); g.add(ft);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), mat('#efe8d8'));
    tail.position.set(0, 0.115, -0.118);
    g.add(body, head, muzzle, ear, tail);
    return { g, ear };
  }
  for (const [x, z, hd] of [[-2.6, rzAt(-2.6) - 5.9, 3.5], [11, rzAt(11) - 5.7, -2.6]]) {
    const rb = makeRabbit();
    put(rb.g, x, 0, z, hd);
    critters.push({ kind: 'rabbit', obj: rb.g, ear: rb.ear, ph: rand() * 7,
      baseY: 0, hdg: hd, turn: rr(2, 6) });
  }
}

/* ---------------- 落叶粒子 ---------------- */
const leafTex = (() => {   /* v5.91 柔边枫叶：软径向衰减+叶脉，告别"一排斜栏杆"错觉（原固定倾角白椭圆板） */
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.translate(32, 34); x.rotate(0.5); x.translate(-32, -34);
  x.fillStyle = '#fff';
  x.beginPath();
  for (let k = 0; k < 10; k++) {
    const rr2 = k % 2 === 0 ? 27 : 11, a2 = -Math.PI / 2 + k * Math.PI / 5;
    const px = 32 + Math.cos(a2) * rr2, py = 32 + Math.sin(a2) * rr2;
    k === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
  }
  x.closePath(); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(32, 56); x.lineTo(32, 10); x.stroke();
  x.globalCompositeOperation = 'destination-out';
  const g2 = x.createRadialGradient(32, 32, 10, 32, 32, 31);
  g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.72, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,.9)');
  x.fillStyle = g2; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const LEAF_N = 170;
const leafPos = new Float32Array(LEAF_N * 3);
const leafCol = new Float32Array(LEAF_N * 3);
const leafMeta = [];
const leafPalette = ['#d95f2b', '#c0451f', '#e08a3c', '#e2bd2e', '#b06a2a'].map(c => new THREE.Color(c));
for (let i = 0; i < LEAF_N; i++) {
  const a = rand() * 6.28, r = rand() * BASE_R;
  leafPos[i * 3] = Math.cos(a) * r;
  leafPos[i * 3 + 1] = rr(0.3, 10);
  leafPos[i * 3 + 2] = Math.sin(a) * r;
  const c = leafPalette[Math.floor(rand() * leafPalette.length)];
  leafCol[i * 3] = c.r; leafCol[i * 3 + 1] = c.g; leafCol[i * 3 + 2] = c.b;
  leafMeta.push({ fall: rr(0.4, 1.1), sway: rr(0.5, 1.6), phase: rand() * 6.28 });
}
const leafGeo = new THREE.BufferGeometry();
leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(leafPos, 3));
leafGeo.setAttribute('color', new THREE.Float32BufferAttribute(leafCol, 3));
const leavesMat = new THREE.PointsMaterial({
  map: leafTex, size: 0.24, transparent: true, alphaTest: 0.25, vertexColors: true,
  sizeAttenuation: true,
});
const leaves = new THREE.Points(leafGeo, leavesMat);
scene.add(leaves);
dayNight.leaves = leavesMat;

/* ---------------- 昼夜环境 + 滚动日照 ---------------- */
const SKY_DUSK = new THREE.Color('#c8783c');
const C = {
  sunDay:  new THREE.Color('#f0a145'),
  sunDusk: new THREE.Color('#ff8f4e'),
  sunMoon: new THREE.Color('#8093b8'),
  waterD: new THREE.Color('#4fb9c2'), waterN: new THREE.Color('#16324e'),
  pondD:  new THREE.Color('#58c2ce'), pondN:  new THREE.Color('#132b45'),
  bedD:   new THREE.Color('#847734'), bedN:   new THREE.Color('#232a1b'),   /* 夜滩同步压成夜草色 */   /* 河床 Basic 不吃光：夜色必须手动写，否则夜河发光 */
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _sc = new THREE.Color(), _sk = new THREE.Color();
/* n = 夜度 0~1（日出前/日落后连续过渡） */
const pmremGen = new THREE.PMREMGenerator(renderer);
function skyEnv(top, hor, gnd) {
  /* 程序化 equirect 天空(上渐层+地平线+地面向反照) → PMREM 预滤波环境贴图 */
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, top); gr.addColorStop(0.5, hor); gr.addColorStop(0.52, gnd); gr.addColorStop(1, gnd);
  x.fillStyle = gr; x.fillRect(0, 0, 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  const e = pmremGen.fromEquirectangular(t).texture;
  t.dispose();
  return e;
}
const ENV = {
  day:   skyEnv('#f0d9a6', '#e3c98f', '#4f3d24'),   /* v4.33 反射也转昏黄（原天顶冷蓝是白感主因） */
  night: skyEnv('#131b2c', '#0b1020', '#05070b'),
  morning: skyEnv('#a4cbe8', '#d8ecf8', '#5a6050'),
  deep:    skyEnv('#070c16', '#04060c', '#020303'),
  grayD: skyEnv('#988a6a', '#837153', '#453c2c'),
  grayN: skyEnv('#20262e', '#161b22', '#0a0d11'),
};
scene.environment = ENV.day;
const ENV_MATS = [];   /* 非水材质登记表：环境反射压到 0.32 并在昼夜切换缝隙淡出，消除整场景突变 */
scene.traverse(o => {
  if (o.material && o.material !== waterMat && o.material !== dayNight.pondWater && o.material.envMapIntensity !== undefined) {   /* 两个水面自管反射，不入全局登记 */
    o.material.envMapIntensity = 0.32;
    o.material.userData.eBase = 0.32;
    if (ENV_MATS.indexOf(o.material) < 0) ENV_MATS.push(o.material);
  }
});
/* v5.05 大气透视方案（Preetham Sky 实测与暖色盘不搭，回滚）：
   线性雾保留，雾底混入淡蓝天光（大气散射的透视结果），时辰收紧视程 */
const SKY_HAZE = new THREE.Color('#b8c4d4');
const _fogCol = new THREE.Color();
function hazeMix(col, k) { return _fogCol.copy(col).lerp(SKY_HAZE, k); }
const E0G = { near: 80, far: 180 };
function envApply(sky, sunCol, sunInt, hemiInt, n, opt) {
  const E0 = opt || {};
  E0G.near = E0.near !== undefined ? E0.near : 80;
  E0G.far = E0.far !== undefined ? E0.far : 180;
  dayNight.isNight = n > 0.5;
  _baseSky.copy(sky);
  _baseEnv.sun = sunInt; _baseEnv.hemi = hemiInt;
  renderer.toneMappingExposure = E0.exp !== undefined ? E0.exp : EXP.day + (EXP.night - EXP.day) * n;
  scene.fog.near = E0.near !== undefined ? E0.near : 80;
  scene.fog.far = E0.far !== undefined ? E0.far : 180;
  cloudN = n;
  /* 环境贴图无法混合：n=0.5 切换缝隙处把强度淡到 0，两侧再淡入，整场景反射连续过渡 */
  const sEnv = Math.min(1, Math.abs(n - 0.5) * 2);
  _baseEnv.env = E0.envKey ? ENV[E0.envKey] : (n > 0.5 ? ENV.night : ENV.day);
  _baseEnv.envInt = (0.55 + 0.6 * n) * sEnv;
  scene.environment = _baseEnv.env;
  for (const m of ENV_MATS) m.envMapIntensity = m.userData.eBase * sEnv;
  scene.background.copy(sky);
  scene.fog.color.copy(hazeMix(sky, 0.22 * (1 - n)));   /* v5.05 大气透视：天光淡蓝入雾 */
  if (dayNight.tableMat) dayNight.tableMat.color.copy(E0.table || dayNight.tableBase);
  dayNight.sun.color.copy(sunCol);
  dayNight.sun.intensity = sunInt;
  dayNight.hemi.intensity = hemiInt;
  window.__fillAdj(n);   /* v638 时辰联动补光与 Bloom 强度 */
  dayNight.windows.forEach(m => { m.emissiveIntensity = 0.15 + 1.15 * n; });
  dayNight.lanternMats.forEach(m => { m.emissiveIntensity = 0.25 + 1.3 * n; });
  (dayNight.torchLights || []).forEach(pt => { pt.intensity = 1.15 * n; });
  if (dayNight.flameMats) { const base = [0.8, 0.85, 0.9]; dayNight.flameMats.forEach((m, i) => { m.opacity = base[i % 3] * (0.4 + 0.6 * n); }); }
  dayNight.lanternLights.forEach(L => { L.intensity = (L.userData.boost || 1.05) * n; });
  dayNight.water.color.copy(C.waterD).lerp(C.waterN, n);
  if (dayNight.pondWater) dayNight.pondWater.color.copy(C.pondD).lerp(C.pondN, n);
  bedMat.color.copy(C.bedD).lerp(C.bedN, n);   /* Standard 自身会随光变暗，这里只做额外压色 */
  if (dayNight.wfMat) {   /* 瀑布/水花 Basic 同款夜暗 */
    dayNight.wfMat.color.set('#a5dbe6').lerp(new THREE.Color('#16252d'), n);
    dayNight.wfMat.opacity = 0.85 - 0.33 * n;
    for (const e of dayNight.wfFx) {
      e.m.color.copy(e.c).lerp(new THREE.Color('#141f27'), n);
      e.m.opacity = e.op * (1 - 0.6 * n);
    }
  }
  if (dayNight.leaves) dayNight.leaves.opacity = 1 - 0.75 * n;
}
function setNight(night) {
  if (night) {
    dayNight.sun.position.set(-16, 24, 10);
    envApply(SKY_NIGHT, C.sunMoon, 0.045, 0.09, 1);
  } else {
    dayNight.sun.position.set(20, 18, 12);
    envApply(SKY_DAY, C.sunDay, 1.52, 0.19, 0);
  }
}
/* ---------------- 雷阵雨系统（滚动模式：昼/夜半场各 50% 概率下一场中到大雨） ---------------- */
const rainTex = (() => {
  const cv = document.createElement('canvas'); cv.width = 6; cv.height = 56;
  const x = cv.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 56);
  gr.addColorStop(0, 'rgba(235,246,255,0)');
  gr.addColorStop(0.4, 'rgba(235,246,255,1)');
  gr.addColorStop(0.7, 'rgba(220,236,248,0.8)');
  gr.addColorStop(1, 'rgba(220,236,248,0)');
  x.fillStyle = gr; x.fillRect(2, 0, 1.5, 56);
  return new THREE.CanvasTexture(cv);
})();
const NR = 4600;   /* 加密：4600 根 */
const rainPos = new Float32Array(NR * 3);
for (let i = 0; i < NR; i++) {   /* Math.random：不占用场景 rand 序列 */
  const a = Math.random() * Math.PI * 2, r = Math.random() * 25;
  rainPos[i * 3] = Math.cos(a) * r;
  rainPos[i * 3 + 1] = 0.5 + Math.random() * 23.5;
  rainPos[i * 3 + 2] = Math.sin(a) * r;
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.PointsMaterial({
  map: rainTex, color: '#e8f3fc', transparent: true, opacity: 0,
  size: 0.2, sizeAttenuation: true, depthWrite: false,
  blending: THREE.AdditiveBlending, depthTest: false,
});
const rain = new THREE.Points(rainGeo, rainMat);
rain.visible = false; scene.add(rain);
/* 雨后积水：路面上 + 院里水洼，雨中渐显、雨停后慢慢收干 */
const puddleMat = mat('#3c4650', { roughness: 0.12, metalness: 0.6, transparent: true });
puddleMat.opacity = 0;
const puddles = [];
const PUDDLE = [
  [12.8, 12.0, 1.5, 0.8, 1], [-13.2, 11.3, 1.7, 0.9, 1], [4.2, 12.1, 2.0, 0.85, 1],
  [-20.6, 8.3, 1.3, 0.75, 1], [16.2, 9.2, 1.5, 0.8, 1], [-5.5, 11.8, 1.7, 0.85, 1],
  [-7.6, 7.8, 1.5, 1.0, 0], [7.8, 7.4, 1.4, 0.9, 0], [-8.8, 2.4, 1.2, 0.8, 0],
  [8.6, 2.6, 1.3, 0.85, 0], [0.2, 7.9, 1.0, 0.7, 0], [-3.2, 0.6, 1.4, 0.9, 0],
];
function blobPuddle() {   /* 不规则水洼轮廓：外圈半径随机凹凸 */
  const g = new THREE.CircleGeometry(1, 9);
  const p = g.attributes.position;
  for (let i = 1; i < p.count; i++) {
    const k = 0.68 + rand() * 0.6, x = p.getX(i), y = p.getY(i);
    p.setX(i, x * k); p.setY(i, y * k);
  }
  g.computeVertexNormals();
  return g;
}
function putPuddle(px, pz, sx, sz, y) {
  const pd = new THREE.Mesh(blobPuddle(), puddleMat);
  pd.rotation.x = -Math.PI / 2;
  pd.rotation.z = rand() * 6.28;
  pd.scale.set(sx * rr(0.85, 1.35), sz * rr(0.8, 1.3), 1);
  pd.position.set(px + rr(-1.3, 1.3), y, pz + rr(-1.3, 1.3));
  pd.visible = false;
  puddles.push(pd); scene.add(pd);
}
for (const [px, pz, sx, sz, onRoad] of PUDDLE)
  putPuddle(px, pz, sx, sz, onRoad ? 0.085 : 0.055);
for (let i = 0; i < 8; i++) {   /* 随机散点补几个小雨洼 */
  const x = rr(-19, 19), z = rr(-8.5, 12.5);
  if (Math.abs(x) < 2.8 && z > 1 && z < 11.5) continue;   /* 甬道留空 */
  putPuddle(x, z, rr(0.55, 1.05), rr(0.5, 0.95), 0.06);
}
const storm = { on: false, decided: '', start: -1, dur: 0, inten: 0, wet: 0, flash: 0, flashNext: 0 };
window.storm = storm;   /* 视频/探针钩子 */
/* ---------------- 水面镜像倒影：反射相机 + 屏幕空间采样 ---------------- */
{
  const rt = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(innerWidth / 2)), Math.max(2, Math.floor(innerHeight / 2)), { depthBuffer: true });
  const mc = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.14);
  const dp = new THREE.Vector3();
  window.__refl = { on: true, WY: 0.14 };
  window.__reflRT = rt;
  window.__reflPass = function () {
    if (!window.__refl.on) { REFLU.uReflStr.value = 0; return; }
    const cam = window.__activeCam || camera;
    const WY = window.__refl.WY;
    mc.fov = cam.fov; mc.aspect = cam.aspect; mc.near = cam.near; mc.far = 34;   /* 只映近岸景物，远山不进倒影 */
    mc.updateProjectionMatrix();
    mc.up.set(0, 1, 0);
    mc.position.set(cam.position.x, 2 * WY - cam.position.y, cam.position.z);
    cam.getWorldDirection(dp);
    mc.lookAt(mc.position.x + dp.x, mc.position.y - dp.y, mc.position.z + dp.z);
    const hid = [];
    for (const o of WATER_OBJS) if (o.visible) { o.visible = false; hid.push(o); }
    if (typeof rain !== 'undefined' && rain.visible) { rain.visible = false; hid.push(rain); }
    const old = renderer.clippingPlanes;
    renderer.clippingPlanes = [plane];
    renderer.setRenderTarget(rt);
    renderer.render(scene, mc);
    renderer.setRenderTarget(null);
    renderer.clippingPlanes = old;
    for (const o of hid) o.visible = true;
    REFLU.uReflMap.value = rt.texture;
    REFLU.uReflRes.value.set(renderer.domElement.width, renderer.domElement.height);
    REFLU.uReflStr.value = dayNight.isNight ? 0.62 : 0.50;
  };

/* ================= 🐦 鹈鹕模式 v4.87：模型 + 控制器 + 门交互 ================= */
{
  const PEL = window.__pel = { on: false, pos: new THREE.Vector3(-7, 0.06, 26), yaw: Math.PI, pitch: -0.10,
    vel: new THREE.Vector3(), vy: 0, jumps: 0, grounded: true, swim: false, flap: 0, camDist: 3.2, hint: null };
  /* ---- 门系统 ---- */
  window.__doors = window.__doors || [];
  function addDoorSet(name, px, py, pz, face, pw, ph, swing) {   /* v5.01 swing=-1 朝外开（门扇翻向不占室内） */
    const set = { name, x: px, y: py, z: pz, hinges: [], cur: 0, target: 0, open: false };
    const along = face === 'z+' || face === 'z-' ? 'x' : 'z';
    const base = face === 'x+' ? Math.PI / 2 : face === 'x-' ? -Math.PI / 2 : face === 'z+' ? Math.PI : 0;
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      const off = along === 'x' ? s * pw : 0, offz = along === 'z' ? s * pw : 0;
      hinge.position.set(px + off, py, pz + offz);
      hinge.rotation.y = base;
      hinge.userData.base = base;
      const panel = latticeDoorPanel(pw * 1.02, ph);
      const fl = face === 'x+' ? 1 : -1;   /* v4.95e x+ 面朝院内开，门扇须沿局部 +x 延展（否则关门朝洞外反扣） */
      const sl = fl * s * pw / 2, slz = 0;
      panel.position.set(sl, ph / 2, slz);
      hinge.add(panel);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 10), mat('#8d7238', { metalness: 0.7, roughness: 0.35 }));
      ring.position.set(along === 'z' ? fl * s * (pw - 0.16) : (sl > 0 ? 0.12 : -0.06), ph * 0.42, along === 'z' ? -0.06 : 0);
      hinge.add(ring);
      set.hinges.push({ hinge, s: s * (swing || 1) });
      scene.add(hinge);
    }
    window.__doors.push(set);
    return set;
  }
  /* 大门（旧 __gateDoors 由 fly 引擎驱动，这里登记触发点并兼容 F 键） */
  window.__doors.push({ name: '大门', x: 0, z: 8.6, legacy: true, cur: 0, target: 0, open: false, hinges: [] });
  /* 主楼正门：中缝 x=0，铰链 ±1.26，朝外（南）开 */
  addDoorSet('主楼正门', 0, 0.6, -4.3, 'z-', 1.24, 2.15, 1);   /* v5.25 门下沿坐上阶石顶（v5.22 只抬了碰撞没抬门板，半扇门） */
  addDoorSet('东厢浴室门', 3.0, 0.0, -1.5, 'x-', 1.0, 1.8, 1);   /* v5.19b 考古：厢体跨 x3.0..7.9，端头墙就在 3.0，回位 */
  addDoorSet('西厢食堂门', -3.0, 0.0, -1.5, 'x+', 1.0, 1.8, -1);   /* v5.19b 回位；v5.01 朝院外开 */
  /* v5.32 堂屋三门洞雕花格子门：石室门朝北开进石室；次间门朝次间内开（不占堂屋） */
  addDoorSet('石室门', 0, 0, -8.7, 'z-', 1.08, 2.14, -1);
  addDoorSet('西次间门', -1.75, 0, -6.25, 'x-', 0.74, 2.38, -1);
  addDoorSet('东次间门', 1.75, 0, -6.25, 'x+', 0.74, 2.38, -1);
  addDoorSet('二楼北廊门', 1.0, 4.78, -8.6, 'z-', 0.68, 2.1, 1);   /* v626 白墙开侧门（用户红框）：格子双扇朝外开，通梯厅北侧实地 */
  /* v602 二层观景平台改造（用户令：二楼不放房间）：①清扫壳内家具隔断成大通间 ②阳台洞装四扇格子门（中二扇 F 开，样式同主楼正门） */
  { const bd2 = addDoorSet('二层阳台门', 0, 4.78, -4.9, 'z-', 0.56, 2.06, 1);
    for (const hp2 of bd2.hinges) { const rr2 = hp2.hinge.children.find(function (c2) { return c2.geometry && c2.geometry.type === 'TorusGeometry'; }); if (rr2) hp2.hinge.remove(rr2); }
  }   /* v619 门环摘除：pw=0.56 窄扇上环坐标悬在半空（用户令：去掉或贴门上，取去掉） */
  for (const s of [-1, 1]) {
    const fp = latticeDoorPanel(0.55, 2.06); fp.position.set(s * 0.845, 4.78 + 1.03, -4.9); scene.add(fp);
    const fst = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.06, 0.1), mat('#3c2c1c', { roughness: 0.9 })); fst.position.set(s * 1.13, 4.78 + 1.03, -4.9); scene.add(fst);
  }
  {   /* v603b 全局 box()/mat()（boxI/Mf 是内景块局部，此前 ReferenceError 卡死启动 stage3） */
    const bx = (w, h, d, mt) => { const b2 = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); b2.castShadow = b2.receiveShadow = true; return b2; };
    const trs = bx(2.32, 0.52, 0.1, mat('#cfc4ae', { roughness: 1 })); trs.position.set(0, 7.05, -4.9); scene.add(trs);
    const hdr = bx(2.32, 0.09, 0.14, mat('#4a3526', { roughness: 0.9 })); hdr.position.set(0, 6.84, -4.9); scene.add(hdr);
  }
  {
    const wv6 = new THREE.Vector3();
    scene.traverse(function (o) {
      if (!o.isMesh) return;
      o.getWorldPosition(wv6);
      if (Math.abs(wv6.x) < 2.9 && wv6.z > -10.2 && wv6.z < -5.0 && wv6.y > 4.8 && wv6.y < 7.45) {   /* v616 下探 4.8：两张蓝被面地毯漏网=用户'颜色不对' */   /* v611 收窄：东西窗框窗台/井口边板曾被误伤 */
        if (wv6.z > -8.78 && wv6.z < -8.45) return;                     /* 梯厅北墙线：梯井护栏在此 */
        if (wv6.x > -0.98 && wv6.x < -0.58 && wv6.z < -8.6) return;      /* v602 梯井东沿长栏+立柱豁免 */
        if (wv6.x > 0.1 && wv6.x < 2.1 && wv6.z > -7.7 && wv6.z < -5.7 && wv6.y < 5.6) return;   /* v614 观光洞围栏豁免 */
        o.visible = false;
      }
    });
  }
  window.__doorTick = function (dt) {
    for (const d of window.__doors) {
      if (d.legacy) {
        d.cur += ((d.target > 0.5 ? 1 : 0) - d.cur) * Math.min(1, dt * 3.2);
        if (window.__gateDoors) { window.__gateDoors[0].rotation.y = -d.cur * 1.05; window.__gateDoors[1].rotation.y = d.cur * 1.05; }
        continue;
      }
      const tgt = d.target > 0.5 ? 1 : 0;
      d.cur += (tgt - d.cur) * Math.min(1, dt * 3.2);
      for (const hpair of d.hinges) hpair.hinge.rotation.y = hpair.hinge.userData.base + hpair.s * d.cur * 1.5;
    }
  };
  /* ---- 鹈鹕模型（低多边形写实比例，翼展 2m） ---- */
  const pel = new THREE.Group();
  {
    const FW = mat('#f2efe6'), FG = mat('#b9b2a0'), FBK = mat('#26262c'), FOR = mat('#e88f35'), FP = mat('#f2b48d');
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 9), FW);
    body.scale.set(1.9, 0.62, 0.7); body.position.set(-0.1, 0.52, 0);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), FG);
    belly.scale.set(1.7, 0.5, 0.62); belly.position.set(-0.08, 0.42, 0);
    const nk1 = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.14, 0.34, 8), FW);
    nk1.position.set(0.34, 0.75, 0); nk1.rotation.z = -1.05;
    const nk2 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.3, 8), FW);
    nk2.position.set(0.5, 0.93, 0); nk2.rotation.z = -0.42;
    pel.add(nk1, nk2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), FW);
    head.scale.set(1.15, 0.95, 0.95); head.position.set(0.64, 1.04, 0);
    const crest = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), FG);
    crest.position.set(0.6, 1.13, 0); crest.scale.set(1, 0.7, 1);
    const bill = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.052, 0.46, 6), FOR);
    bill.position.set(0.92, 1.01, 0); bill.rotation.z = Math.PI / 2 + 0.05;
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), FP);
    pouch.scale.set(1.7, 0.5, 0.5); pouch.position.set(0.84, 0.9, 0);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), FBK); eyeL.position.set(0.71, 1.07, 0.075);
    const eyeR = eyeL.clone(); eyeR.position.z = -0.085;
    pel.add(body, belly, head, crest, bill, pouch, eyeL, eyeR);
    pel.userData.bone = { pouch, bill, head };
    const wings = [];
    for (const s of [1, -1]) {
      const wg = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), FG);
      upper.scale.set(0.5, 0.16, 1.5); upper.position.set(0, 0, s * 0.34);
      const fore = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), FG);
      fore.scale.set(0.42, 0.13, 1.15); fore.position.set(0.02, 0.005, s * 0.78);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), FBK);
      tip.scale.set(0.4, 0.1, 1.05); tip.position.set(0.03, 0.0, s * 1.16);
      wg.add(upper, fore, tip);
      wg.position.set(-0.02, 0.72, s * 0.12);
      pel.add(wg); wings.push({ g: wg, s });
    }
    pel.userData.wings = wings;
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), FG);
    tail.scale.set(1.35, 0.25, 0.7); tail.position.set(-0.52, 0.66, 0);
    pel.add(tail);
    for (const s of [1, -1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.32, 6), FOR);
      leg.position.set(0.02, 0.3, s * 0.1);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.14), FOR);
      foot.position.set(0.06, 0.13, s * 0.1);
      pel.add(leg, foot);
      (pel.userData.legs = pel.userData.legs || []).push(leg);
    }
    pel.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    pel.traverse(function (o) { if (o.isMesh) { const mm = o.material; if (ENV_MATS.indexOf(mm) < 0 && mm.envMapIntensity !== undefined) { mm.userData.eBase = 0.32; ENV_MATS.push(mm); } } });
    pel.visible = false;
    scene.add(pel);
    window.__pelMesh = pel;
  }
  /* ---- 地形/水面查询 ---- */
  function mtnH(x, z) {
    let h = 0;
    for (const c of mountainCones) {
      const d = Math.hypot(x - c.cx, z - c.cz), u = d / c.R;
      if (u < 1) h = Math.max(h, surfaceY(c, Math.max(0.02, u)));
    }
    return h;
  }
  window.waterAt = waterAt;
  function waterAt(x, z) {
    const zr = rzAtG(x);
    if (Math.abs(z - zr) < 3.8 && Math.abs(x) < 29.2) return 1;
    for (const q of streamPts) { const dx = x - q.x, dz = z - q.z; if (dx * dx + dz * dz < 0.62) return 2; }
    if (Math.hypot(x - 0, z - 8.6) < 3.2 && z > 9.5) return 1;
    return 0;
  }
  /* ---- 碰撞：薄墙(门洞条件通行) + 地板/桥面/楼梯 ---- */
  const DOOR_OPEN = (name) => {
    for (const d of window.__doors) if (d.name === name) return d.target > 0.5 || d.cur > 0.4;
    return true;
  };
  const WALLS = [
    /* 院墙（含门楼开口，主楼门关=洞口变实体） */
    { ax: 'z', c: 8.6, t: 0.3, v0: -10.3, v1: 10.3, h: 2.85, gaps: [{ a: -1.35, b: 1.35, door: '大门' }] },
    { ax: 'x', c: -10.05, t: 0.3, v0: -10.0, v1: 8.6, h: 2.85, gaps: [] },
    { ax: 'x', c: 10.05, t: 0.3, v0: -10.0, v1: 8.6, h: 2.85, gaps: [] },
    /* 门楼砖柱（门洞两侧） */
    { ax: 'x', c: -1.25, t: 0.32, v0: 7.95, v1: 9.25, h: 2.5, gaps: [] },
    { ax: 'x', c: 1.25, t: 0.32, v0: 7.95, v1: 9.25, h: 2.5, gaps: [] },
    /* 主楼一层 */
    { ax: 'z', c: -4.3, t: 0.1, v0: -3.5, v1: 3.5, h: 3.45, gaps: [{ a: -1.25, b: 1.25, door: '主楼正门' }] },
    { ax: 'z', c: -8.7, t: 0.1, v0: -3.5, v1: 3.5, h: 3.45, gaps: [{ a: -1.1, b: 1.1, door: '石室门' }] },   /* v5.32 中门洞挂格子门（关=挡 F=开） */
    /* v5.32 隔断墙碰撞补全：x±1.75 两段实体 + 门洞段挂门（此前隔断无碰撞=穿帮） */
    { ax: 'x', c: -1.75, t: 0.1, v0: -8.7, v1: -7.0, h: 3.45, gaps: [] },
    { ax: 'x', c: -1.75, t: 0.1, v0: -5.5, v1: -4.35, h: 3.45, gaps: [] },
    { ax: 'x', c: -1.75, t: 0.1, v0: -7.0, v1: -5.5, h: 3.45, gaps: [{ a: -6.85, b: -5.65, door: '西次间门' }] },   /* v5.35 gap 用 z 坐标（原 ±0.75 永不命中=开门进不去） */
    { ax: 'x', c: 1.75, t: 0.1, v0: -8.7, v1: -7.0, h: 3.45, gaps: [] },
    { ax: 'x', c: 1.75, t: 0.1, v0: -5.5, v1: -4.35, h: 3.45, gaps: [] },
    { ax: 'x', c: 1.75, t: 0.1, v0: -7.0, v1: -5.5, h: 3.45, gaps: [{ a: -6.85, b: -5.65, door: '东次间门' }] },
    { ax: 'z', c: -8.25, t: 0.1, v0: -3.3, v1: 3.3, h: 2.7, gaps: [{ a: -1.1, b: 1.1 }] },
    /* v5.35 石室北矮墙碰撞两段删除：梯脚东段被 0.9 高墙墩顶死上不了梯（用户图1'左右柱子'） */
    { ax: 'z', c: -12.6, t: 0.14, v0: -1.7, v1: 1.7, h: 2.6, gaps: [] },
    { ax: 'x', c: 1.68, t: 0.1, v0: -12.7, v1: -11.42, h: 2.6, gaps: [] },   /* v5.21 旧梯井侧墙收口：原 v1-10.4 凸体 0.6m 堵死新楼梯间口 */
    { ax: 'x', c: -1.68, t: 0.1, v0: -12.7, v1: -11.42, h: 2.6, gaps: [] },
    { ax: 'z', c: -11.62, t: 0.12, v0: -3.3, v1: 3.3, h: 3.3, y0: -1, gaps: [{ a: -2.1, b: 0.3 }] },
    { ax: 'z', c: -11.56, t: 0.1, v0: -2.5, v1: 2.5, h: 7.5, y0: 4.3, gaps: [{ a: -1.3, b: 0.2 }],   /* v5.35cc 门洞对齐二层客房门（原洞与门板错位一米） */ },   /* v4.99e 梯洞侧帮 */
    /* v620 观景平台空气墙六条随墙撤（-2.3/2.3/0.77×2/±2.55：mesh 已被清扫、碰撞残留=用户红线） */
    { ax: 'z', c: -11.55, t: 0.1, v0: -2.55, v1: -1.75, h: 7.5, y0: 4.95, gaps: [] },
    { ax: 'z', c: -11.55, t: 0.1, v0: 1.35, v1: 2.55, h: 7.5, y0: 4.95, gaps: [] },   /* v4.99c 井上收口（x±1.75 内让位上跑） */
    { ax: 'z', c: -10.45, t: 0.1, v0: 1.0, v1: 2.5, h: 7.5, y0: 4.3, gaps: [{ a: 1.35, b: 2.05 }] },   /* v4.99e 东次间北门洞 */
    { ax: 'x', c: 3.22, t: 0.1, v0: -10.5, v1: -8.2, h: 2.6, gaps: [] },
    { ax: 'x', c: -3.22, t: 0.1, v0: -10.5, v1: -8.2, h: 2.6, gaps: [] },
    { ax: 'x', c: -3.5, t: 0.18, v0: -8.75, v1: -4.35, h: 3.45, gaps: [] },
    { ax: 'x', c: 3.5, t: 0.18, v0: -8.75, v1: -4.35, h: 3.45, gaps: [] },
    /* 二层房间（仅 y≥4.3 生效，南侧通阳台门洞开放） */
    { ax: 'z', c: -4.9, t: 0.1, v0: -2.3, v1: 2.3, h: 7.5, y0: 4.3, gaps: [{ a: -1.1, b: 1.1, door: '二层阳台门' }] },   /* v5.21 门洞挂铰链扇 */
    /* v617 后墙碰撞随墙撤（壳北墙洞 -2.9..-0.5 仍收口，平台边缘有井栏 z-8.08 碰撞） */
    /* 东厢（西门洞=浴室门）/ 西厢（东门洞=食堂门） */
    { ax: 'x', c: 3.0, t: 0.16, v0: -3.3, v1: 0.3, h: 2.75, gaps: [{ a: -2.55, b: -0.45, door: '东厢浴室门' }] },
    { ax: 'x', c: 8.0, t: 0.16, v0: -3.3, v1: 0.3, h: 2.75, gaps: [] },
    { ax: 'z', c: -3.2, t: 0.16, v0: 3.0, v1: 8.0, h: 2.75, gaps: [] },
    { ax: 'z', c: 0.2, t: 0.16, v0: 3.0, v1: 8.0, h: 2.75, gaps: [] },
    { ax: 'x', c: -3.0, t: 0.16, v0: -3.3, v1: 0.3, h: 2.75, gaps: [{ a: -2.55, b: -0.45, door: '西厢食堂门' }] },
    { ax: 'x', c: -8.0, t: 0.16, v0: -3.3, v1: 0.3, h: 2.75, gaps: [] },
    { ax: 'z', c: -3.2, t: 0.16, v0: -8.0, v1: -3.0, h: 2.75, gaps: [] },
    /* v4.99 院墙北段：主楼地界开大洞（窖延段穿墙），主楼外墙贴合成新边界 */
    { ax: 'z', c: -10, t: 0.3, v0: -10.3, v1: -4.4, h: 2.85, gaps: [] },
    { ax: 'z', c: -10, t: 0.3, v0: 4.4, v1: 10.3, h: 2.85, gaps: [] },
    /* v5.20 东西向楼梯间围合：北封带旧窖延门洞，东西山墙，南端敞接石室 */
    { ax: 'z', c: -11.5, t: 0.16, v0: -2.3, v1: 2.3, h: 4.9, gaps: [{ a: -2.1, b: 0.3 }] },
    /* v5.35cc 东西墙各开 z-11.15..-10.15 全高洞：东洞让梯脚（原墙把最低三级埋死=上不去梯），西洞做梯顶出口 */
    { ax: 'x', c: 2.28, t: 0.14, v0: -11.44, v1: -11.15, h: 4.9, gaps: [] },
    { ax: 'x', c: 2.28, t: 0.14, v0: -10.15, v1: -9.85, h: 4.9, gaps: [] },
    { ax: 'x', c: -2.28, t: 0.14, v0: -11.44, v1: -11.15, h: 4.9, gaps: [] },
    { ax: 'x', c: -2.28, t: 0.14, v0: -10.15, v1: -9.85, h: 4.9, gaps: [] },
    /* v5.21 防坠三组：望阳台三面勾栏（世界坐标）+ 二层梯洞三面矮栏（西侧留梯口） */
    { ax: 'z', c: -3.62, t: 0.1, v0: -2.45, v1: 2.45, h: 5.95, y0: 4.62, gaps: [] },
    { ax: 'x', c: 2.45, t: 0.1, v0: -4.9, v1: -3.62, h: 5.95, y0: 4.62, gaps: [] },
    { ax: 'x', c: -2.45, t: 0.1, v0: -4.9, v1: -3.62, h: 5.95, y0: 4.62, gaps: [] },
    /* v5.36 旧梯洞矮栏三面碰撞撤：洞已封板，木框挡梯顶出口 */
    { ax: 'x', c: -0.68, t: 0.12, v0: -11.5, v1: -9.0, h: 5.78, y0: 4.85, gaps: [] },   /* v611 东沿长栏（南端 -9.0..-8.5 留上下梯口） */
    { ax: 'z', c: -8.52, t: 0.12, v0: -2.45, v1: -0.7, h: 5.78, y0: 4.85, gaps: [{ a: -1.9, b: -1.2 }] },   /* v620 只留梯轴 0.7m 口 */
    /* v5.36 房中房壳碰撞（mesh 建了没碰撞=穿墙）：北墙正对梯口洞、南墙阳台门洞、东西墙实 */
    { ax: 'z', c: -8.6, t: 0.12, v0: -3.45, v1: 3.45, h: 7.65, y0: 4.7, gaps: [{ a: -2.9, b: -0.5 }, { a: 0.3, b: 1.7 }] },   /* v626 北廊门洞放行 */
    { ax: 'z', c: -4.9, t: 0.12, v0: -3.45, v1: 3.45, h: 7.65, y0: 4.7, gaps: [{ a: -1.15, b: 1.15 }] },
    { ax: 'x', c: -3.42, t: 0.12, v0: -8.6, v1: -4.9, h: 7.65, y0: 4.7, gaps: [] },
    { ax: 'x', c: 3.42, t: 0.12, v0: -8.6, v1: -4.9, h: 7.65, y0: 4.7, gaps: [] },
    { ax: 'x', c: -4.4, t: 0.3, v0: -10.0, v1: -3.2, h: 3.45, gaps: [] },
    { ax: 'x', c: 4.4, t: 0.3, v0: -10.0, v1: -3.2, h: 3.45, gaps: [] },
    { ax: 'z', c: -11.6, t: 0.3, v0: -4.4, v1: -3.4, h: 2.85, gaps: [] },
    { ax: 'z', c: -11.6, t: 0.3, v0: 3.4, v1: 4.4, h: 2.85, gaps: [] },
    { ax: 'z', c: 0.2, t: 0.16, v0: -8.0, v1: -3.0, h: 2.75, gaps: [] },
  ];
  const ZDK0 = rzAtG(6.5) + 3.0;   /* 码头走道轴线 z（提前定义供 FLOORS 用） */
  const FLOORS = [
    { x0: -3.5, x1: 3.5, z0: -8.75, z1: -4.35, y: 0.12 },     /* 主楼一层 */
    { x0: -1.75, x1: 1.75, z0: -3.46, z1: -3.04, y: 0.4 },    /* v5.22 大门阶石下阶（mesh 有板无碰撞=穿模元凶） */
    { x0: -1.6, x1: 1.6, z0: -3.86, z1: -3.44, y: 0.6 },      /* 大门阶石上阶 */
    { x0: -1.35, x1: 1.35, z0: -4.32, z1: -3.86, y: 0.55 },   /* 门槛带（高阈，入堂落回 0.12 有真实跨槛感） */
    { x0: -3.0, x1: 3.0, z0: -8.3, z1: -7.9, y: 0.1 },           /* 门槛带 */
    { x0: -2.9, x1: 2.9, z0: -10.42, z1: -8.2, y: 0.09 },   /* 堂后石室（v4.98 加宽带双门洞） */
    { x0: -3.42, x1: 3.42, z0: -8.6, z1: -4.9, y: 4.78 },   /* v617 北缘推到壳墙线 */
    { x0: -2.45, x1: 2.45, z0: -4.95, z1: -3.55, y: 4.68 },   /* 望阳台 */
    { x0: -2.45, x1: 2.45, z0: -8.05, z1: -7.9, y: 4.78 },    /* v4.99 北墙门槛带 */
    { x0: -0.7, x1: 2.45, z0: -11.62, z1: -8.05, y: 4.78, lo: 4.3 },   /* v601 L梯井洞 x-2.4..-0.7 z-11.5..-8.6：边条 东/南/北/西 */
    /* v617 梯井南零头条并入房板（上方 f2b 已铺到 -8.6） */
    { x0: -2.45, x1: -0.7, z0: -11.62, z1: -11.48, y: 4.78, lo: 4.3 },
    { x0: -3.35, x1: -2.45, z0: -11.62, z1: -8.05, y: 4.78, lo: 4.3 },
    { x0: -1.6, x1: 1.6, z0: -12.6, z1: -10.4, y: 0.09 },    /* v4.99 石室延段（梯井底） */
    { x0: -3.35, x1: 3.35, z0: -11.65, z1: -8.05, y: 0.09 },  /* v5.36 铺平至开挖满格：原 2.35 窄于腔体 3.35，贴边踩空坠绿渊 */
    { x0: 3.2, x1: 7.8, z0: -3.2, z1: 0.2, y: 0.1 },          /* 东厢 */
    { x0: -7.8, x1: -3.2, z0: -3.2, z1: 0.2, y: 0.1 },        /* 西厢 */
    { x0: 3.9, x1: 9.1, z0: ZDK0 - 0.62, z1: ZDK0 + 0.62, y: 0.59, lo: -0.2 },    /* 横码头走道 v4.94（水上岸面均可拾级） */
    { x0: 5.62, x1: 6.48, z0: ZDK0 + 0.62, z1: ZDK0 + 1.65, y: 0.46, lo: -0.2 },  /* 浮桥上段 */
    { x0: 5.62, x1: 6.48, z0: ZDK0 + 1.65, z1: ZDK0 + 2.62, y: 0.24 },  /* 浮桥下段 */
    /* v5.36 屋顶实体顶（用户令：所有屋顶鹈鹕都能按物理站上去）：lo=可从上方落到该板 */
    { x0: -5.45, x1: 5.45, z0: -10.2, z1: -9.0, y: 3.86, lo: 3.3 },      /* 腰檐后段 */
    { x0: -5.45, x1: 5.45, z0: -4.05, z1: -2.8, y: 3.86, lo: 3.3 },      /* 腰檐前段（阳台上遁） */
    { x0: -5.45, x1: -4.35, z0: -9.0, z1: -4.05, y: 3.86, lo: 3.3 },
    { x0: 4.35, x1: 5.45, z0: -9.0, z1: -4.05, y: 3.86, lo: 3.3 },
    { x0: -4.5, x1: 4.5, z0: -6.62, z1: -5.3, y: 5.85, lo: 5.2 },        /* 裙坡前半 */
    { x0: -4.5, x1: 4.5, z0: -7.95, z1: -6.62, y: 5.85, lo: 5.2 },       /* 裙坡后半 */
    { x0: -4.5, x1: 4.5, z0: -5.3, z1: -4.27, y: 4.9, lo: 4.4 },
    { x0: -4.5, x1: 4.5, z0: -8.97, z1: -7.95, y: 4.9, lo: 4.4 },
    { x0: -2.6, x1: 2.6, z0: -8.2, z1: -5.05, y: 9.9, lo: 9.3 },         /* 塔顶坡面带 */
    { x0: -1.1, x1: 1.1, z0: -7.3, z1: -5.95, y: 10.7, lo: 10.2 },       /* 塔脊带 */
    { x0: 3.15, x1: 7.95, z0: -3.5, z1: 0.5, y: 4.55, lo: 3.9 },         /* 东厢顶 */
    { x0: -7.95, x1: -3.15, z0: -3.5, z1: 0.5, y: 4.55, lo: 3.9 },       /* 西厢顶 */
    { x0: -1.95, x1: 1.95, z0: 7.6, z1: 9.6, y: 4.42, lo: 3.6 },         /* 门楼top */
    { x0: -3.7, x1: 3.7, z0: -10.6, z1: -8.3, y: 7.85, lo: 7.2 },        /* 披厦前段 */
    { x0: -3.7, x1: 3.7, z0: -12.55, z1: -10.6, y: 8.15, lo: 7.5 },      /* 披厦后段 */
    { x0: -10.35, x1: 10.35, z0: 8.42, z1: 8.78, y: 2.95, lo: 2.3 },     /* 院墙南脊道 */
    { x0: -10.35, x1: 10.35, z0: -8.88, z1: -8.52, y: 2.95, lo: 2.3 },
    { x0: -10.38, x1: -10.02, z0: -8.52, z1: 8.42, y: 2.95, lo: 2.3 },
    { x0: 10.02, x1: 10.38, z0: -8.52, z1: 8.42, y: 2.95, lo: 2.3 },
  ];
  window.__WALLS = WALLS; window.__FLOORS = FLOORS; window.__cw = function (p) { collideWalls(p, 0.32); return p; }; window.__stairY = stairY; window.__groundAt = groundAt;
  const BRZ = 19.9, BRH = 5.35;
  const deckY = (z) => 0.12 + 2.9 * (1 - Math.pow((z - BRZ) / BRH, 2));
  const rideBoats = () => {
    const a2 = [];
    if (window.__pb && window.__pb.g.parent) a2.push(window.__pb.g.userData.ride || (window.__pb.g.userData.ride = { g: window.__pb.g, hl: 3.0, hw: 0.8, dy: 0.5 }));
    for (const w of (window.__wuNav || [])) w.g.userData.ride2 || a2.push(w.g.userData.ride2 = { g: w.g, hl: 1.4, hw: 0.5, dy: 0.4 });
    if (window.__smBoat && window.__smBoat.parent) a2.push(window.__smBoat.userData.ride3 || (window.__smBoat.userData.ride3 = { g: window.__smBoat, hl: 1.25, hw: 0.4, dy: 0.5 }));
    return a2;
  };
  function stairY(x, z, y) {   /* v611 缝合平台缺口：一段延伸 -2.45 封顶 3.5，平台放宽，站上不再漏成深渊 */
    if (z > -11.25 && z < -10.1 && x > -2.45 && x < 2.62) {
      const yy = Math.min(3.5, 4.72 * (2.62 - x) / 5.24);
      if (yy < y + 0.55) return Math.max(0, yy);
    }
    if (x > -2.45 && x < -0.55) {
      if (z > -11.55 && z < -9.8 && y > 2.6) return 3.5;
      if (z >= -9.8 && z < -8.45) {
        const yy2 = 3.6 + (z + 9.8) * 1.16;
        if (yy2 < y + 0.55) return Math.min(4.78, yy2);
      }
    }
    return -1;
  }
  function groundAt(x, z, y) {
    let g = 0.06;
    let inBuilding = false;
    for (const f of FLOORS) {
      if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && y > (f.lo !== undefined ? f.lo : f.y - 0.42)) { g = Math.max(g, f.y); inBuilding = true; }
    }
    if (!inBuilding && insideMountain(x, z, 1.0)) g = Math.max(g, mtnH(x, z));
    if (Math.abs(x) < 1.2 && z > 14.1 && z < 25.7) {
      const dy0 = deckY(Math.max(14.55, Math.min(25.25, z)));
      if (y > dy0 - 0.5) g = Math.max(g, dy0);   /* 只从上方接坡；桥洞下可穿行 */
    }
    {   /* v4.94 船面：画舫/乌篷/拴泊小船 */
      for (const rb of rideBoats()) {
        const gp = rb.g.position;
        if (gp.y < -40) continue;
        const c0 = Math.cos(rb.g.rotation.y), s0 = Math.sin(rb.g.rotation.y);
        const ddx = x - gp.x, ddz = z - gp.z;
        if (Math.abs(ddx * c0 - ddz * s0) < rb.hl && Math.abs(ddx * s0 + ddz * c0) < rb.hw) {
          const gy0 = gp.y + rb.dy;
          if (y > gy0 - 0.5 && gy0 > g) { g = gy0; PEL.rideC = rb; }
        }
      }
    }
    const sy = stairY(x, z, y);
    if (sy > 0 && y > sy - 0.45) g = Math.max(g, sy);
    return g;
  }
  function collideWalls(p, r) {
    for (let it = 0; it < 2; it++) {
      for (const w of WALLS) {
        if (p.y > w.h + 0.1 || p.y < (w.y0 || 0)) continue;
        const ca = w.ax === 'z' ? p.z : p.x;
        const va = w.ax === 'z' ? p.x : p.z;
        let d = ca - w.c;
        if (Math.abs(d) > w.t + r) continue;
        /* 实体段 = 全长 - 已开门洞 */
        let blocked = false;
        const gapsOpen = (w.gaps || []).filter((gp) => !gp.door || DOOR_OPEN(gp.door));
        const cuts = gapsOpen.map((gp) => [gp.a, gp.b]).sort((a, b) => a[0] - b[0]);
        let cursor = w.v0;
        const segs = [];
        for (const [a1, b1] of cuts) { if (a1 > cursor) segs.push([cursor, a1]); cursor = Math.max(cursor, b1); }
        if (cursor < w.v1) segs.push([cursor, w.v1]);
        for (const [s0, s1] of segs) if (va > s0 - r && va < s1 + r) { blocked = true; break; }
        if (!blocked) continue;
        const half = w.t + r;
        const push = (d >= 0 ? half : -half) - d;
        if (Math.abs(d) < 1e-4) { if (w.ax === 'z') p.z += half; else p.x += half; continue; }
        if (w.ax === 'z') p.z += push; else p.x += push;
      }
    }
  }
  window.__pelEnv = { mtnH, waterAt, groundAt, collideWalls };
  /* ---- 输入 ---- */
  const keys = {};
  window.__pelKeys = keys;
  window.addEventListener('keydown', function (e) {
    if (!PEL.on) return;
    if (e.code === 'Space') { e.preventDefault(); if (!keys.Space) PEL.jumpQueued = true; }
    keys[e.code] = true;
    if (e.code === 'KeyF') pelTryDoor();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('keydown', function (e) {   /* v5.24 方向键阻止页面滚动 */
    if (PEL.on && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight')) e.preventDefault();
  });
  let dragging = false, lx = 0, ly = 0;
  renderer.domElement.addEventListener('pointerdown', function (e) { if (!PEL.on) return; if (e.button === 2) { dragging = true; lx = e.clientX; ly = e.clientY; } });
  window.addEventListener('pointerup', function (e) { if (e.button === 2) dragging = false; });
  window.addEventListener('pointermove', function (e) {
    if (!PEL.on || !dragging) return;
    PEL.yaw -= (e.clientX - lx) * 0.005;
    PEL.pitch = Math.max(-0.55, Math.min(1.15, PEL.pitch + (e.clientY - ly) * 0.004));
    lx = e.clientX; ly = e.clientY;
  });
  renderer.domElement.addEventListener('wheel', function (e) { if (!PEL.on) return; PEL.camDist = Math.max(1.5, Math.min(7, PEL.camDist + e.deltaY * 0.0035)); }, { passive: true });
  renderer.domElement.addEventListener('contextmenu', function (e) { if (PEL.on) e.preventDefault(); });
  let nearDoor = null;
  window.__pelNearDoor = () => nearDoor;
  function pelTryDoor() {
    let best = null, bd = 2.3;
    for (const d of window.__doors) { if (Math.abs(PEL.pos.y - (d.y || 0)) > 1.9) continue; const dd = Math.hypot(PEL.pos.x - d.x, PEL.pos.z - d.z); if (dd < bd) { bd = dd; best = d; } }
    if (best) { if (best.shop) { window.__pecShopOpen(best.shop); return; } best.target = best.target > 0.5 ? 0 : 1; best.open = best.target > 0.5; }
  }
  /* 提示条 */
  const hint = document.createElement('div');
  hint.id = 'pelHint';
  hint.style.cssText = 'position:fixed;left:50%;bottom:78px;transform:translateX(-50%);background:rgba(20,16,10,.72);color:#ffe9c4;padding:7px 16px;border-radius:8px;font:13px/1.5 system-ui;display:none;z-index:40;pointer-events:none;border:1px solid rgba(255,220,150,.35)';
  document.body.appendChild(hint);
  PEL.hint = hint;
  /* ---- 主循环 ---- */
  window.__pelUpdate = function (dt) {
    {   /* v4.96 自愈钩子：GLB 部件就绪但 head/tails 未挂时补挂 */
      const pmx = window.__pelMesh;
      if (pmx && !pmx.userData.head && pmx.children.length && pmx.children[0].getObjectByName && window.__pelHeadHooks) {
        const o0 = pmx.children[0];
        if (o0.getObjectByName('GEO-head')) window.__pelHeadHooks(o0, pmx);
      }
    }
    if (!PEL.on) { if (nearDoor) { hint.style.display = 'none'; nearDoor = null; } const kph = document.getElementById('pelKeys'); if (kph) kph.style.display = 'none'; return; }
    {   /* v5.24 用户令：方向键切视角（与右键拖同向），按住平滑 */
      const kpk = document.getElementById('pelKeys');
      if (kpk) kpk.style.display = 'block';
      const turn = 2.1 * dt;
      if (keys.ArrowLeft) PEL.yaw += turn;
      if (keys.ArrowRight) PEL.yaw -= turn;
      if (keys.ArrowUp) PEL.pitch = Math.max(-0.55, PEL.pitch - turn * 0.8);
      if (keys.ArrowDown) PEL.pitch = Math.min(1.15, PEL.pitch + turn * 0.8);
    }
    const pel = window.__pelMesh;
    PEL.rideC = null;
    const fwd = new THREE.Vector3(Math.sin(PEL.yaw), 0, Math.cos(PEL.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3();
    if (keys.KeyW) move.add(fwd);
    if (keys.KeyS) move.sub(fwd);
    if (keys.KeyA) move.sub(right);
    if (keys.KeyD) move.add(right);
    const sprint = (keys.ShiftLeft || keys.ShiftRight) && move.lengthSq() > 0 ? 2.4 : 1;
    const spd = 2.45 * sprint * (PEL.swim ? 0.45 : 1);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(spd);
    PEL.vel.lerp(move, Math.min(1, dt * (PEL.swim ? 3 : 6.5)));
    PEL.pos.x += PEL.vel.x * dt; PEL.pos.z += PEL.vel.z * dt;
    /* 沙盘圆盘限制 */
    const rr2 = Math.hypot(PEL.pos.x, PEL.pos.z);
    if (rr2 > 29.3) { PEL.pos.x *= 29.3 / rr2; PEL.pos.z *= 29.3 / rr2; }
    if (!PEL.swim) collideWalls(PEL.pos, 0.32);
    {   /* v4.94 桥面软护栏：站上桥后沿 z 带内把 x 收进勾栏（防侧缘落水），低飞/洞游不受扰 */
      const bz2 = Math.max(14.55, Math.min(25.25, PEL.pos.z));
      const dyq = deckY(bz2);
      if (PEL.pos.z > 14.3 && PEL.pos.z < 25.6 && Math.abs(PEL.pos.x) > 0.72 && Math.abs(PEL.pos.x) < 1.2 && PEL.pos.y > dyq - 0.3 && PEL.pos.y < dyq + 0.8) PEL.pos.x = Math.sign(PEL.pos.x) * 0.72;
    }
    const wq = waterAt(PEL.pos.x, PEL.pos.z);
    const onBridge = Math.abs(PEL.pos.x) < 1.2 && PEL.pos.z > 14.1 && PEL.pos.z < 25.7 && PEL.pos.y > deckY(Math.max(14.55, Math.min(25.25, PEL.pos.z))) - 0.42;   /* 走上桥面不落水；桥洞内正常游/穿 */
    PEL.swim = !onBridge && !PEL.ride && (wq === 1 || (wq === 2 && PEL.pos.y < 0.3));
    if (PEL.swim) {
      {   /* v4.94 游到船边一步登船 */
        for (const rb of rideBoats()) {
          const gp = rb.g.position;
          if (gp.y < -40) continue;
          const c0 = Math.cos(rb.g.rotation.y), s0 = Math.sin(rb.g.rotation.y);
          const ddx = PEL.pos.x - gp.x, ddz = PEL.pos.z - gp.z;
          if (Math.abs(ddx * c0 - ddz * s0) < rb.hl && Math.abs(ddx * s0 + ddz * c0) < rb.hw) {
            PEL.swim = false; PEL.grounded = true; PEL.vy = 0; PEL.jumps = 0;
            PEL.pos.y = gp.y + rb.dy; PEL.rideC = rb; break;
          }
        }
      }
    }
    if (PEL.swim) {
      PEL.vy = 0; PEL.jumps = 0; PEL.grounded = false;
      const target = 0.16;
      PEL.pos.y += (target + Math.sin(clock.elapsedTime * 2.2) * 0.03 - PEL.pos.y) * Math.min(1, dt * 4);
    } else {
      PEL.vy -= 15.5 * dt;
      if (keys.Space && PEL.vy < -1.6) PEL.vy = -1.6;   /* 按住空格滑翔 */
      if (PEL.jumpQueued) {
        if (PEL.jumps < 3) { PEL.vy = [5.3, 4.7, 4.1][PEL.jumps] * (PEL.swim ? 0.7 : 1); PEL.jumps++; PEL.grounded = false; }
        else if (!PEL.swim && PEL.vy < 1.0) { PEL.vy = 2.1; PEL.grounded = false; }   /* 三段用尽：连按空格=持续扇翅滞空 */
        PEL.jumpQueued = false;
      }
      PEL.jumpQueued = false;
      PEL.pos.y += PEL.vy * dt;
      const g = groundAt(PEL.pos.x, PEL.pos.z, PEL.pos.y);
      if (PEL.pos.y <= g && g - PEL.pos.y < 2.2) { PEL.pos.y = g; if (PEL.vy < 0) PEL.vy = 0; PEL.grounded = true; PEL.jumps = 0; }
      else if (PEL.grounded && PEL.vy <= 0 && PEL.pos.y < g + 0.5 && g - PEL.pos.y < 0.55) { PEL.pos.y = g; }   /* 坡面跟足（限幅防跨空吸附） */
    }
    /* 模型姿态 */
    pel.position.copy(PEL.pos);
    /* v5.37 取消停步自动回正：原静止时身体缓转回视线方向——正脸拍照总被"转回去"毁掉（用户令）。
       现在停步定姿（保持最后朝向）；转身只靠真实移动（含 ←→ 边转边挪一小步） */
    if (PEL.vel.lengthSq() > 0.01) PEL.heading = Math.atan2(-PEL.vel.z, PEL.vel.x);
    if (PEL.heading === undefined) PEL.heading = Math.atan2(-fwd.z, fwd.x);
    const heading = PEL.heading;
    let dA = heading - pel.rotation.y;
    while (dA > Math.PI) dA -= 6.28318; while (dA < -Math.PI) dA += 6.28318;
    pel.rotation.y += dA * Math.min(1, dt * 8);
    const air = !PEL.swim && !PEL.grounded;
    const moving = PEL.vel.lengthSq() > 0.02;
    PEL.flap += dt * (air ? 11 : moving ? 3.4 : 1.1);
    if (moving && PEL.grounded) PEL.step = (PEL.step || 0) + spd * dt * 3.4;
    for (const w of pel.userData.wings) {
      if (PEL.glbWing) {
        const amp = air ? 0.52 : PEL.swim ? 0.015 : moving ? 0.2 : 0.05;
        w.g.rotation.x = (w.bx || 0) + w.s * ((air ? 0.16 : 0) + Math.sin(PEL.flap) * amp) + (PEL.swim ? w.s * 0.34 : w.s * 0.10);
        if (w.bz === undefined) w.bz = w.g.rotation.z;
        w.g.rotation.z = PEL.swim ? w.bz - w.s * 0.3 : w.bz;
      } else {
        const amp = air ? 0.62 : PEL.swim ? 0.015 : moving ? 0.26 : 0.06;   /* v4.96 走路扇翅加大 */
        w.g.rotation.x = air ? -w.s * (0.2 + Math.sin(PEL.flap) * amp) : w.s * (0.55 + Math.sin(PEL.flap) * amp * 0.3);
        w.g.rotation.z = (air ? 0.34 : -0.16) * w.s;
      }
    }
    if (pel.userData.feet) for (const ft of pel.userData.feet) ft.visible = !PEL.swim;
    if (pel.userData.legs) {
      for (const L of pel.userData.legs) {
        if (PEL.swim) {
          L.m.rotation.z = (L.bz || 0) - 2.55 - Math.sin(PEL.flap * 1.4) * 0.10;   /* 双腿并拢贴尾收平，低幅同步微摆划水 */
        } else if (PEL.grounded && moving) {
          const phg = (PEL.step || 0) + (L.s > 0 ? 0 : Math.PI);
          L.m.rotation.z = (L.bz || 0) + (Math.sin(phg) * 0.72 + Math.sin(2 * phg) * 0.2) * L.s;   /* 前后大跨步，左右腿反相 */
        } else if (!PEL.grounded) {
          L.m.rotation.z = (L.bz || 0) + 0.5 * L.s;   /* 飞时两腿向后掠 */
        } else {
          L.m.rotation.z += ((L.bz || 0) - L.m.rotation.z) * 0.2;
        }
      }
    }
    {   /* v4.96 走路生动化：头前后点+左右摇、尾羽摆+翘 */
      const phs = PEL.step || 0;
      const liv = PEL.grounded && moving ? 1 : 0;
      const hd = pel.userData.head;
      if (hd) {
        hd.a += (liv - hd.a) * Math.min(1, dt * 5);
        hd.m.rotation.z = hd.b[2] + Math.sin(phs * 2) * 0.13 * hd.a;
        hd.m.rotation.y = hd.b[1] + Math.sin(phs) * 0.11 * hd.a;
        hd.m.rotation.x = hd.b[0] + Math.sin(phs * 2 + 1) * 0.05 * hd.a;
      }
      {   /* v5.51 喉囊下颌开合：待机微翕、走路点头带、水面俯冲大鱼口 */
        const pj = pel.userData.pouchJaw;
        if (pj) {
          /* v5.62 撤摇摆抵消（头囊一体才不与喙错缝）；home+回正偏移接上头；开合幅度减半 */
          pj.m.position.set(pj.hx - 0.19, pj.hy + 0.38, pj.hz - 0.65);   /* v5.67 四审：viewer右=鸟左，z 翻向；再上提贴缝 */
          pj.m.rotation.set(pj.bx + 0.07, pj.by, pj.bz);   /* v5.65 基准俯仰回收，嘴缝更小 */
          const tgt = PEL.swim ? 1 : liv;
          pj.a += (tgt - pj.a) * Math.min(1, dt * 4);
          pj.m.rotation.x += (PEL.swim ? Math.abs(Math.sin((PEL.flap || 0) * 1.6)) * 0.10 : Math.sin(phs * 2 + 0.7) * 0.028 * pj.a + Math.sin(performance.now() / 1000 * 1.4) * 0.011);
        }
      }
      for (const t2 of (pel.userData.tails || [])) {
        t2.a += (liv - t2.a) * Math.min(1, dt * 5);
        t2.m.rotation.y = t2.b[1] + Math.sin(phs + 0.6) * 0.22 * t2.a;
        t2.m.rotation.z = t2.b[2] + (0.06 + Math.sin(phs * 2) * 0.09) * t2.a;
      }
    }
    {   /* v5.78 眼镜/帽跟随层：按白眼球世界矩阵摆位（无视节点缩放），GLB 缺席退化为头朝向 */
      const cE = window.__pec && window.__pec.equip, cs = window.__pec && window.__pec.cos;
      if (cs && cE && (cE.eye || cE.head)) {
        const eL = pel.getObjectByName('GEO-eyeWL'), eR = pel.getObjectByName('GEO-eyeWR');
        const qE = new THREE.Quaternion();
        const wl = new THREE.Vector3(), wr = new THREE.Vector3();
        if (eL && eR) { eL.getWorldPosition(wl); eR.getWorldPosition(wr); }
        else {
          wl.set(pel.position.x + Math.cos(pel.rotation.y) * 0.42, pel.position.y + 0.86, pel.position.z - Math.sin(pel.rotation.y) * 0.42 + 0.055);
          wr.copy(wl); wr.z -= 0.11;
        }
        /* v5.79 正交基：side=双眼连线，up=世界重力反轨，fwd=up×side——节点局部轴歪斜问题解决 */
        const side = wr.clone().sub(wl);
        if (side.lengthSq() < 1e-8) side.set(0, 0, 1);
        side.normalize();
        const fw = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), side).normalize();
        const upw = side.clone().cross(fw).normalize();
        /* v5.80b 双保险定号：up 必须朝天，fw 必须顺鸟朝向（否则帽子掉脖子） */
        if (upw.y < 0) upw.negate();
        const heading = new THREE.Vector3(Math.cos(pel.rotation.y), 0, -Math.sin(pel.rotation.y));
        if (fw.dot(heading) < 0) fw.negate();
        const mB = new THREE.Matrix4().makeBasis(fw, upw, side);
        qE.setFromRotationMatrix(mB);
        const mid = wl.clone().add(wr).multiplyScalar(0.5);
        if (cE.eye && cs[cE.eye] && cs[cE.eye].visible) { cs[cE.eye].quaternion.copy(qE); cs[cE.eye].position.copy(mid).addScaledVector(fw, 0.03).addScaledVector(upw, 0.014);   /* v5.88 鼻梁架喙根 */ }
        if (cE.head && cs[cE.head] && cs[cE.head].visible) { cs[cE.head].quaternion.copy(qE); cs[cE.head].position.copy(mid).addScaledVector(fw, -0.045).addScaledVector(upw, 0.005); }
      }
    }
    {   /* v4.94 站在船上随船漂移（8 帧滞环防抖） */
      if (PEL.grounded && PEL.rideC) PEL._rideAge = 8;
      else if (PEL.ride && PEL.grounded && !PEL.swim && PEL._rideAge > 0) PEL._rideAge--;
      const rid = (PEL.grounded && !PEL.swim && (PEL.rideC || PEL._rideAge > 0)) ? (PEL.rideC || PEL.ride) : null;
      if (rid) {
        const gp = rid.g.position;
        if (rid.px !== undefined) { PEL.pos.x += gp.x - rid.px; PEL.pos.z += gp.z - rid.pz; }
        rid.px = gp.x; rid.pz = gp.z;
        if (PEL.pos.y > gp.y + rid.dy + 0.3 || PEL.pos.y < gp.y + rid.dy - 0.5) PEL.pos.y = gp.y + rid.dy;
      }
      PEL.ride = rid;
    }
    const bob = PEL.swim ? Math.sin(clock.elapsedTime * 2.2) * 0.05 : 0;
    pel.rotation.z = (PEL.swim ? 0.10 : 0) + (air ? -PEL.vy * 0.02 : 0);
    pel.rotation.x = bob * 0.5 + (PEL.swim ? 0.06 : 0);
    /* 相机（穿墙规避：沿视线方向对墙段打 2D 射线，命中就拉近） */
    const cp = Math.cos(PEL.pitch), sp = Math.sin(PEL.pitch);
    let cd = PEL.camDist;
    {
      const dx = -fwd.x, dz = -fwd.z, px = PEL.pos.x, pz = PEL.pos.z;
      let hitT = cd;
      for (const w of WALLS) {
        if (PEL.pos.y <= (w.y0 || 0) || PEL.pos.y >= w.h + 0.15) continue;
        let t, vc;
        if (w.ax === 'x') { if (Math.abs(dx) < 1e-4) continue; t = (w.c - px) / dx; vc = pz + dz * t; }
        else { if (Math.abs(dz) < 1e-4) continue; t = (w.c - pz) / dz; vc = px + dx * t; }
        if (!(t > 0.12 && t < hitT) || vc < w.v0 || vc > w.v1) continue;
        let solid = true;
        for (const gp of (w.gaps || [])) {
          if ((!gp.door || DOOR_OPEN(gp.door)) && vc > gp.a && vc < gp.b) { solid = false; break; }
        }
        if (solid) hitT = t;
      }
      cd = Math.max(0.85, hitT - 0.3);
      /* v5.36 入室内自动锁近景（用户图2）：主楼/两厢/梯步间内固定 ≤1.5m 贴随视角，出户恢复滚轮距离 */
      const PZ = PEL.pos;
      const indoors = (PZ.z > -11.75 && PZ.z < -2.0 && Math.abs(PZ.x) < 3.7) ||
        (PZ.z > -3.4 && PZ.z < 0.4 && Math.abs(PZ.x) > 3.1 && Math.abs(PZ.x) < 8.1);
      if (indoors) cd = Math.min(cd, 1.5);
    }
    const cx = PEL.pos.x - fwd.x * cp * cd, cz = PEL.pos.z - fwd.z * cp * cd;
    const cy = Math.max(0.5, PEL.pos.y + 1.05 + sp * cd);
    camera.up.set(0, 1, 0);
    if (window.__fxCam) {   /* v605 大烟花观赏镜头：俯瞰烟花天顶，观看期结束追背相机自动接管回来 */
      camera.position.lerp(window.__fxCam.p, Math.min(1, dt * 3.6));
      camera.lookAt(window.__fxCam.look);
    } else {
      camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 10));
      camera.lookAt(PEL.pos.x + fwd.x * 0.6, PEL.pos.y + 0.95, PEL.pos.z + fwd.z * 0.6);
    }
    /* 门提示 */
    let best = null, bd = 2.3;
    for (const d of window.__doors) { if (Math.abs(PEL.pos.y - (d.y || 0)) > 1.9) continue; const dd = Math.hypot(PEL.pos.x - d.x, PEL.pos.z - d.z); if (dd < bd) { bd = dd; best = d; } }
    nearDoor = best;
    if (best) { hint.style.display = 'block'; hint.textContent = best.shop ? '按 F 光顾·' + best.name : '按 F ' + (best.open || best.target > 0.5 ? '关' : '开') + '·' + best.name; }
    else hint.style.display = 'none';
    window.__doorTick(dt);
  };
  /* ---- 按钮 ---- */
  const btn = document.getElementById('btnPel');
  btn.addEventListener('click', function () {
    PEL.on = !PEL.on;
    btn.blur();
    btn.classList.toggle('on', PEL.on);
    window.__pelMesh.visible = PEL.on;
    controls.enabled = !PEL.on;
    if (PEL.on) {
      controls.autoRotate = false;
      document.getElementById('btnRotate') && document.getElementById('btnRotate').classList.remove('on');
      PEL.pos.set(-7, 0.06, 26); PEL.yaw = Math.PI; PEL.pitch = -0.10; PEL.vy = 0; PEL.jumps = 0;
      document.body.style.cursor = 'crosshair';
    } else {
      hint.style.display = 'none';
      document.body.style.cursor = '';
      if (window.__pelShells) for (const sh of window.__pelShells) sh.g.visible = true;
      camera.position.copy(CAM0); camera.lookAt(TGT0); controls.target.copy(TGT0);
    }
  });
  window.__pelEnter = function (x, y, z, yaw) { if (!PEL.on) btn.click(); PEL.pos.set(x, y, z); PEL.yaw = yaw; };

  /* ======== v540 鹈鹕寻宝：每 30 秒一波钱币（铜20/银10/金5 固定，钱袋 55%，宝箱 12%），
     接触 0.9m 即得：原地起飞淡出 + 头顶气泡「得到 X G」；右上角国风钱袋 HUD；页面刷新清零（用户令） ======== */
  {
    const PEC = window.__pec = { money: 0, items: [], nextWave: 0, started: false };
    PEC.meshes = {};   /* v5.43 GLB 道具模板（treasures.glb）；未就绪=程序化兜底 */
    /* v5.47 修正：__loadGLB 定义在 1000 行之后，直接调用恒 undefined=GLB 永不生效；改轮询等就绪 */
    const glbPoll = setInterval(function () {
      if (!window.__loadGLB) return;
      clearInterval(glbPoll);
      window.__loadGLB('assets/treasures.glb', [0, -400, 0], 1, 0).then(function (root) {
        root.visible = false;
        root.traverse(function (c) { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
        ['copper', 'silver', 'gold', 'bag', 'chest'].forEach(function (nm) {
          const o = root.getObjectByName(nm);
          if (o) { o.position.set(0, 0, 0); PEC.meshes[nm] = o; }
        });
        console.log('[沙盘] 财宝 GLB 就绪');
      }, function () {});
    }, 600);
    const mkMat = (c, e) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.75, emissive: e, emissiveIntensity: 0.5, transparent: true });
    const mCu = '#c07840', mAg = '#cfd4da', mAu = '#eec643';
    const V = { copper: 1, silver: 5, gold: 10 };
    /* 共享特效贴图与几何 */
    PEC.geoBlob = new THREE.CircleGeometry(0.5, 18);
    PEC.geoBlob.rotateX(-Math.PI / 2);
    {
      const cvB = document.createElement('canvas'); cvB.width = cvB.height = 64;
      const xb = cvB.getContext('2d');
      const gr = xb.createRadialGradient(32, 32, 4, 32, 32, 30);
      gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      xb.fillStyle = gr; xb.fillRect(0, 0, 64, 64);
      PEC.blobTex = new THREE.CanvasTexture(cvB);
    }
    PEC.matShadow = new THREE.MeshBasicMaterial({ alphaMap: PEC.blobTex, transparent: true, opacity: 0.5, color: 0x120c06, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    {
      const cvS = document.createElement('canvas'); cvS.width = cvS.height = 64;
      const xs = cvS.getContext('2d');
      xs.translate(32, 32); xs.fillStyle = '#fff3c8';
      for (const rot of [0, Math.PI / 4]) {
        xs.save(); xs.rotate(rot);
        xs.beginPath(); xs.moveTo(0, -28); xs.quadraticCurveTo(4, -4, 28, 0); xs.quadraticCurveTo(4, 4, 0, 28); xs.quadraticCurveTo(-4, 4, -28, 0); xs.quadraticCurveTo(-4, -4, 0, -28);
        xs.fill(); xs.restore();
      }
      xs.globalAlpha = 0.85; xs.beginPath(); xs.arc(0, 0, 7, 0, 6.29); xs.fill();
      PEC.sparkTex = new THREE.CanvasTexture(cvS);
    }
    PEC.matSpark = new THREE.SpriteMaterial({ map: PEC.sparkTex, color: 0xffe28a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    function coinMesh(r, c, ec) {
      const g2 = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.035, 16), mkMat(c, ec));
      g2.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.66, 0.012, 6, 14), mkMat(c, ec));
      rim.rotation.x = Math.PI / 2; g2.add(rim);
      return g2;
    }
    const bagMesh = () => {
      const g2 = new THREE.Group();
      const bm = new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.8, transparent: true });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), bm);
      body.scale.set(1, 0.82, 1); body.position.y = 0.16; g2.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.12, 8), bm);
      neck.position.y = 0.34; g2.add(neck);
      const cord = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.015, 6, 10), mkMat('#c23b2a', '#5a1408'));
      cord.rotation.x = Math.PI / 2; cord.position.y = 0.33; g2.add(cord);
      return g2;
    };
    const chestMesh = () => {
      const g2 = new THREE.Group();
      const wm = new THREE.MeshStandardMaterial({ color: '#5e4626', roughness: 0.7, transparent: true });
      const gm = mkMat('#e7bd4a', '#6a4c0e');
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.3, 0.36), wm); b.position.y = 0.16; g2.add(b);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.52, 10, 1, false, 0, Math.PI), wm);
      lid.rotation.z = Math.PI / 2; lid.position.y = 0.31; g2.add(lid);
      for (const bx of [-0.16, 0.16]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.38), gm); band.position.set(bx, 0.16, 0); g2.add(band); }
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.05), gm); lock.position.set(0, 0.22, 0.19); g2.add(lock);
      return g2;
    };
    /* 候选地面：FLOORS 全表按高度分组（钱=低层，袋=中层含院墙脊，箱=屋顶层"险地"） */
    const flLow = [], flMid = [], flRoof = [];
    for (const f of window.__FLOORS) {
      if (f.z0 < -24 || f.z1 > 26) continue;
      if (f.y < 2) flLow.push(f); else if (f.y < 5) flMid.push(f); else flRoof.push(f);
    }
    const rnd = (a2, b2) => a2 + Math.random() * (b2 - a2);
    function freeSpot(fl, yAdj) {
      for (let tries = 0; tries < 26; tries++) {
        const f = fl[(Math.random() * fl.length) | 0];
        if (!f) break;
        const x = rnd(f.x0 + 0.4, f.x1 - 0.4), z = rnd(f.z0 + 0.4, f.z1 - 0.4);
        const p2 = { x, y: f.y + 0.6, z };
        window.__cw(p2);
        if (Math.abs(p2.x - x) > 0.03 || Math.abs(p2.z - z) > 0.03) continue;
        if (PEC.items.some((it) => Math.hypot(it.x - x, it.z - z) < 1.1 && Math.abs(it.y - f.y) < 2)) continue;
        return { x, z, y: f.y + (yAdj || 0.2) };
      }
      return null;
    }
    /* v5.47 全图散落（用户令）：院外道路/桥头/对岸/山径台地也进刷新池 */
    function terrainSpot() {
      for (let tries = 0; tries < 30; tries++) {
        const a2 = Math.random() * 6.283, rr2 = 4.5 + Math.random() * 12;
        const x = Math.cos(a2) * rr2, z = Math.sin(a2) * rr2;
        if (Math.abs(x) > 16.5 || z > 16.5 || z < -13.5) continue;
        if (window.__onBuilding && window.__onBuilding(x, z)) continue;
        const gy = window.__groundAt(x, z, 9);
        if (window.waterAt(x, z)) continue;
        if (!(gy > 0.02 && gy < 6.5)) continue;
        if (!flatGround(x, z, gy)) continue;
        const p2 = { x, y: gy + 0.6, z };
        window.__cw(p2);
        if (Math.abs(p2.x - x) > 0.03 || Math.abs(p2.z - z) > 0.03) continue;
        if (PEC.items.some((it) => Math.hypot(it.x - x, it.z - z) < 1.1 && Math.abs(it.y - gy) < 2)) continue;
        return { x, z, y: gy + 0.2 };
      }
      return null;
    }
    function spotFor(kind) {
      const pT = (kind === 'bag' || kind === 'chest') ? 0.15 : (kind === 'gold' ? 0.4 : 0.55);
      if (Math.random() < pT) return terrainSpot();
      return freeSpot(kind === 'chest' ? flRoof : kind === 'bag' ? flMid : kind === 'gold' ? (Math.random() < 0.25 ? flMid : flLow) : flLow, kind === 'chest' ? 0.1 : 0.22);
    }
    function spawnItem(kind, fl) {
      const sp = spotFor(kind);
      if (sp) placeItem(kind, sp);
    }
    function placeItem(kind, sp) {
      let obj;
      const tpl = PEC.meshes[kind];
      if (tpl) {   /* GLB：clone 网格 + 材质逐实例化（淡出动画互不串扰） */
        obj = tpl.clone(true);
        obj.traverse(function (c) {
          if (!c.isMesh || !c.material) return;
          /* v5.50 修"钱币隐形"：单材质网格无 geometry.groups，被塞成材质数组后 three.js 按组绘制=0 drawcall 整件消失；保持原形状逐材克隆 */
          const cl2 = (mm) => { const n2 = mm.clone(); n2.transparent = true; n2.opacity = 1; return n2; };
          if (Array.isArray(c.material)) c.material = c.material.map(cl2);
          else {
            c.material = cl2(c.material);
            if (kind === 'copper' || kind === 'silver' || kind === 'gold') {
              c.material.emissive = c.material.emissive || new THREE.Color();
              c.material.emissiveIntensity = Math.max(c.material.emissiveIntensity || 0, 0.85);   /* 保底自发光，黄昏也能看见 */
            }
          }
        });
        if (kind === 'copper' || kind === 'silver' || kind === 'gold') obj.scale.setScalar(1.6);   /* v5.50 0.3m 直径在草地里存在感太低，放大到 ~0.5m */
        else if (kind === 'bag') obj.scale.setScalar(1.25);
        if (kind === 'copper' || kind === 'silver' || kind === 'gold') {   /* v5.47 立币：内层侧立，外层组绕 Y 转=硬币花 */
          const piv = new THREE.Group();
          obj.rotation.x = Math.PI / 2;
          obj.position.y = kind === 'gold' ? 0.19 : kind === 'silver' ? 0.17 : 0.16;
          piv.add(obj); obj = piv;
        }
      } else if (kind === 'copper') obj = coinMesh(0.13, mCu, '#3a1c06');
      else if (kind === 'silver') obj = coinMesh(0.15, mAg, '#20242c');
      else if (kind === 'gold') obj = coinMesh(0.17, mAu, '#4a3608');
      else if (kind === 'bag') obj = bagMesh();
      else obj = chestMesh();
      obj.position.set(sp.x, sp.y, sp.z);
      /* v5.52 金光闪闪 + 同步旋转假阴影（共享贴图，单件各 1 draw call，软件渲染无压力） */
      const sc2 = kind === 'chest' ? 1.5 : kind === 'bag' ? 0.9 : 0.55;
      const shadow = new THREE.Mesh(PEC.geoBlob, PEC.matShadow.clone());
      shadow.position.set(sp.x, (kind === 'chest' ? sp.y + 0.02 : sp.y - 0.14), sp.z);
      shadow.scale.setScalar(sc2);
      scene.add(shadow);
      const star = new THREE.Sprite(PEC.matSpark.clone());
      star.position.set(sp.x, sp.y + (kind === 'chest' ? 0.7 : 0.42), sp.z);
      star.scale.setScalar(kind === 'chest' ? 0.55 : 0.34);
      scene.add(star);
      scene.add(obj);
      const itm = { kind, obj, shadow, star, x: sp.x, z: sp.z, y: sp.y, born: performance.now() / 1000, dying: 0 };
      PEC.items.push(itm);
      return itm;
    }
    function wave() {
      const cnt = {}; PEC.items.forEach((it) => { if (!it.dying && (it.kind === 'copper' || it.kind === 'silver' || it.kind === 'gold')) cnt[it.kind] = (cnt[it.kind] || 0) + 1; });
      for (let i = (cnt.copper || 0); i < 20; i++) spawnItem('copper', flLow);
      for (let i = (cnt.silver || 0); i < 10; i++) spawnItem('silver', Math.random() < 0.25 ? flMid : flLow);
      for (let i = (cnt.gold || 0); i < 5; i++) spawnItem('gold', flMid);
      const alive = (k) => PEC.items.some((it) => it.kind === k && !it.dying);
      const r = Math.random();
      if (!alive('bag') && r < 0.6) { spawnItem('bag', flMid); if (Math.random() < 0.08) spawnItem('bag', flMid); }
      if (!alive('chest') && Math.random() < 0.12) spawnItem('chest', flRoof);
      /* v5.57 地标三坑值守（用户改令）：路/小船码头/马房后各至多 1 件在世，捡了才补；其余场地以散币为主 */
      {
        PEC.lm = PEC.lm || {};
        const LMS = [
          ['road', lmRoad],
          ['stable', () => lmNear(window.__stablePos ? window.__stablePos.x : 13.4, (window.__stablePos ? window.__stablePos.z : 8.9) - 1.7, 0.7, 1.8)],
          ['dock', () => lmNear(9.4, 21.1, 0.8, 1.6)],
        ];
        for (const [keyL, fnL] of LMS) {
          const cur = PEC.lm[keyL];
          if (cur && PEC.items.includes(cur) && !cur.dying) continue;
          const spL = fnL();
          if (spL) PEC.lm[keyL] = placeItem(Math.random() < 0.38 ? 'chest' : 'bag', spL);
        }
      }
      PEC.nextWave = performance.now() / 1000 + 30;
      PEC.waveNo = (PEC.waveNo || 0) + 1;
    }
    function lmRoad() {
      for (let ti = 0; ti < 20; ti++) {
        const t2 = 0.08 + Math.random() * 0.84;
        if (Math.abs(t2 - STREAM_BRIDGE.tB) < 0.09) continue;
        const p3 = roadCurve.getPointAt(t2), tg3 = roadCurve.getTangentAt(t2);
        const off2 = (Math.random() - 0.5) * 1.1;
        const x = p3.x + tg3.z * off2, z = p3.z - tg3.x * off2;
        const gy = window.__groundAt(x, z, 9);
        if (window.waterAt(x, z) || !(gy > 0.02 && gy < 3)) continue;
        if (!flatGround(x, z, gy)) continue;
        const p4 = { x, y: gy + 0.6, z };
        window.__cw(p4);
        if (Math.abs(p4.x - x) > 0.03 || Math.abs(p4.z - z) > 0.03) continue;
        if (PEC.items.some((it) => Math.hypot(it.x - x, it.z - z) < 0.9)) continue;
        return { x, z, y: gy + 0.2 };
      }
      return null;
    }
    function flatGround(x, z, gy) {   /* v5.58 坑沿拒刷：四邻 0.5m 内地面落差 >0.55 即视为盘缘/崖口，弃点 */
      for (const q of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
        const g2 = window.__groundAt(x + q[0], z + q[1], gy + 2);
        if (!(g2 > gy - 0.55 && g2 < gy + 0.55)) return false;
      }
      return true;
    }
    function lmNear(ax, az, rMin, rMax) {
      for (let ki = 0; ki < 18; ki++) {
        const an = Math.random() * 6.283, r2 = rMin + Math.random() * (rMax - rMin);
        const x = ax + Math.cos(an) * r2, z = az + Math.sin(an) * r2;
        const gy = window.__groundAt(x, z, 9);
        if (window.waterAt(x, z) || !(gy > 0.02 && gy < 3)) continue;
        if (!flatGround(x, z, gy)) continue;
        const p4 = { x, y: gy + 0.6, z };
        window.__cw(p4);
        if (Math.abs(p4.x - x) > 0.03 || Math.abs(p4.z - z) > 0.03) continue;
        if (PEC.items.some((it) => Math.hypot(it.x - x, it.z - z) < 0.9)) continue;
        return { x, z, y: gy + 0.2 };
      }
      return null;
    }
    /* v5.75 调试助手：Console 里 $G(5000) 直接设钱，$G.add(500) 加钱 */
    window.$G = function (n) { PEC.money = Math.max(0, n | 0); PEC.hudAmt(PEC.money); return PEC.money + 'G'; };
    window.$G.add = function (n) { PEC.money = Math.max(0, PEC.money + (n | 0)); PEC.hudAmt(PEC.money); return PEC.money + 'G'; };
    PEC.wave = wave;
    /* HUD：右上角钱袋 + 余额（国风描金） */
    const hud = document.createElement('div');
    hud.style.cssText = 'position:fixed;top:14px;right:14px;z-index:36;display:none;align-items:center;gap:8px;padding:7px 14px 7px 9px;background:rgba(46,36,22,.82);border:1.5px solid #b98d3f;border-radius:20px;font-family:KaiTi,"STKaiti","Noto Serif CJK SC",serif;pointer-events:none;color:#f0d9a0;font-size:19px;letter-spacing:1px;box-shadow:0 2px 10px rgba(0,0,0,.35)';
    const ic = document.createElement('canvas'); ic.width = ic.height = 30; ic.style.cssText = 'width:26px;height:26px';
    const ix = ic.getContext('2d');
    ix.fillStyle = '#c8a24e'; ix.beginPath(); ix.moveTo(15, 4); ix.lineTo(21, 10); ix.quadraticCurveTo(27, 20, 22, 26); ix.quadraticCurveTo(15, 30, 8, 26); ix.quadraticCurveTo(3, 20, 9, 10); ix.closePath(); ix.fill();
    ix.strokeStyle = '#6b4c14'; ix.lineWidth = 1.6; ix.stroke();
    ix.strokeStyle = '#8a6a2a'; ix.beginPath(); ix.moveTo(10, 9); ix.quadraticCurveTo(15, 5, 20, 9); ix.stroke();
    ix.fillStyle = '#5a3c10'; ix.font = 'bold 11px serif'; ix.textAlign = 'center'; ix.fillText('G', 15, 21);
    const amt = document.createElement('span'); amt.textContent = '0 G';
    hud.appendChild(ic); hud.appendChild(amt);
    document.body.appendChild(hud);
    PEC.hudAmt = (v) => { amt.textContent = v + ' G'; };
    /* 头顶气泡 */
    const bub = document.createElement('div');
    bub.style.cssText = 'position:fixed;z-index:37;display:none;padding:5px 12px;background:rgba(250,244,224,.94);border:1.5px solid #8a6a34;border-radius:12px;font-family:KaiTi,"STKaiti","Noto Serif CJK SC",serif;font-size:16px;color:#4a3410;pointer-events:none;transform:translate(-50%,-100%);box-shadow:0 2px 8px rgba(0,0,0,.25)';
    document.body.appendChild(bub);
    let bubT = 0, bubTxt = '';
    PEC.say = (txt) => { const now = performance.now() / 1000; bubTxt = (bubT > now && bubTxt ? bubTxt + '・' : '') + txt; bubT = now + 1.3; };
    /* 拾取 + 动画 + 波次：独立 120ms 心跳（与渲染帧解耦） */
    setInterval(function () {
      try {   /* v5.47 防弹衣：单件道具异常不得杀死整个经济心跳 */
      if (!PEL.on) { hud.style.display = 'none'; bub.style.display = 'none'; return; }
      hud.style.display = 'flex';
      const now = performance.now() / 1000;
      if (!PEC.started) { PEC.started = true; wave(); }
      else if (now > PEC.nextWave) wave();
      const kill = [];
      for (const it of PEC.items) {
        if (it.dying) {
          const dt3 = now - it.dying;
          it.obj.position.y = it.y + dt3 * 2.6;
          const s2 = Math.max(0.01, 1 - dt3 * 1.5);
          it.obj.scale.set(s2, s2, s2);
          it.obj.traverse((mm) => { const arr = Array.isArray(mm.material) ? mm.material : (mm.material ? [mm.material] : []); arr.forEach((n2) => { n2.opacity = s2; }); });   /* v5.47 修复：单材质被 .map 判空误当数组，forEach 抛错杀死整个心跳 */
          if (it.star) { it.star.position.copy(it.obj.position); it.star.position.y += 0.4; it.star.material.opacity = Math.max(0, 1 - dt3 * 1.6); }
          if (it.shadow) it.shadow.material.opacity = Math.max(0, 0.5 - dt3);
          if (dt3 > 0.66) kill.push(it);
          continue;
        }
        it.obj.rotation.y += 0.07;
        it.obj.position.y = it.y + Math.sin(now * 2.4 + it.x) * 0.05;
        if (it.shadow) { it.shadow.rotation.y = it.obj.rotation.y; const pb = 1 + Math.sin(now * 2.4 + it.x) * 0.09; it.shadow.scale.setScalar((it.kind === 'chest' ? 1.5 : it.kind === 'bag' ? 0.9 : 0.55) * pb); it.shadow.material.opacity = 0.5 - Math.sin(now * 2.4 + it.x) * 0.08; }
        if (it.star) { const tw = 0.55 + Math.sin(now * 3.1 + it.z * 2) * 0.45; it.star.material.opacity = it.kind === 'gold' || it.kind === 'chest' ? tw * 0.95 : tw * 0.55; it.star.material.rotation = it.obj.rotation.y * 0.5 + now; it.star.position.y = it.obj.position.y + (it.kind === 'chest' ? 0.7 : 0.42); }
        if (Math.hypot(PEL.pos.x - it.x, PEL.pos.z - it.z) < 0.9 && Math.abs(PEL.pos.y - it.y) < 1.5) {
          let gain = V[it.kind];
          if (it.kind === 'bag') gain = 5 + ((Math.random() * 10) | 0) * 5;
          if (it.kind === 'chest') gain = 50 + ((Math.random() * 11) | 0) * 5;
          PEC.money += gain; PEC.hudAmt(PEC.money);
          PEC.say('得到 ' + gain + ' G');
          it.dying = now;
        }
      }
      for (const it of kill) {
        scene.remove(it.obj);
        if (it.shadow) { scene.remove(it.shadow); it.shadow.material.dispose(); }
        if (it.star) { scene.remove(it.star); it.star.material.dispose(); }
        PEC.items.splice(PEC.items.indexOf(it), 1);
      }
      if (bubT > now) {
        const v = new THREE.Vector3(PEL.pos.x, PEL.pos.y + 1.9, PEL.pos.z).project(camera);
        {   /* v5.56 钳进视口：近镜头/仰角时头顶锚点常投出屏外（院内"无提示"根因），夹到边缘 14px 内始终可见 */
          const sx = Math.max(14, Math.min(innerWidth - 14, (v.x * 0.5 + 0.5) * innerWidth));
          const sy = Math.max(14, Math.min(innerHeight - 90, (-v.y * 0.5 + 0.5) * innerHeight));
          bub.style.display = 'block';
          bub.style.left = sx + 'px';
          bub.style.top = sy + 'px';
          if (bub.textContent !== bubTxt) bub.textContent = bubTxt;
        }
        if (bubT - now < 0.35) bub.style.opacity = Math.max(0, (bubT - now) / 0.35);
      } else { bub.style.display = 'none'; bub.style.opacity = 1; bubTxt = ''; }
      } catch (e) { if (!window.__pecErrShown) { window.__pecErrShown = 1; console.log('[沙盘] 经济心跳异常已隔离:', e.message); } }
    }, 120);
  }

  /* ======== v541 三铺一客：猫卖墨镜(客厅)/狗卖帽(东厢)/灰羽鹈鹕卖包(西厢)/鹿卖烟花(鱼塘) ========
     F 键伪门进商店面板（客栈招牌风），G 币购买即得，饰品自动上身（挂点：眼 0.79,1.07/头顶 0.62,1.18/身侧） */
  {
    const PEC = window.__pec;
    PEC.got = {}; PEC.inv = { f1: 0, f2: 0, f3: 0, f4: 0 };
    const GOODS = {
      cat:  { title: '猫掌柜 · 目下生辉', goods: [
        { id: 'g1', name: '竹叶细框镜', price: 80, slot: 'eye' },
        { id: 'g2', name: '水墨方镜', price: 260, slot: 'eye' },
        { id: 'g3', name: '金框曜目镜', price: 800, slot: 'eye' }] },
      dog:  { title: '大黄 · 顶上风光', goods: [
        { id: 'h1', name: '小斗笠', price: 60, slot: 'head' },
        { id: 'h2', name: '青布方巾', price: 200, slot: 'head' },
        { id: 'h3', name: '金翅冠', price: 900, slot: 'head' }] },
      pel:  { title: '灰羽 · 行囊铺子', goods: [
        { id: 'b1', name: '青布褡裢', price: 100, slot: 'bag' },
        { id: 'b2', name: '豹纹时款包', price: 388, slot: 'bag' },
        { id: 'b3', name: '羊脂玉佩袋', price: 1200, slot: 'bag' }] },
      deer: { title: '鹿先生 · 烟花水塘', goods: [
        { id: 'f1', name: '地上转菊', price: 50 },
        { id: 'f2', name: '桶花烂漫', price: 100 },
        { id: 'f3', name: '三层牡丹', price: 200 },
        { id: 'f4', name: '金雨天象', price: 1000 }] },
    };
    PEC.GOODS = GOODS;
    const M = (c, r2, mt) => new THREE.MeshStandardMaterial({ color: c, roughness: r2 === undefined ? 0.6 : r2, metalness: mt || 0 });
    const B = (w, h, d2, mt) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d2), mt);
    function leopardTex() {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#c8964f'; cx.fillRect(0, 0, 64, 64);
      cx.fillStyle = '#3a2a14';
      for (let i = 0; i < 26; i++) {
        const px = Math.random() * 64, py = Math.random() * 64, rr = 2.5 + Math.random() * 2.5;
        for (let k = 0; k < 5; k++) { const an = k / 5 * 6.283; cx.beginPath(); cx.arc(px + Math.cos(an) * rr, py + Math.sin(an) * rr, 1.1, 0, 6.28); cx.fill(); }
      }
      const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      return tx;
    }
    /* ── 饰品建模 v5.74：眼/帽锚定 GLB 喙根（GEO-bill 于 GEO-head 局部），挂上头部随头动 ── */
    function faceAnchor() {
      const hdN = pel.getObjectByName('GEO-head');
      /* v5.76 首选白眼球节点：镜片=眼球外偏 1.5cm，帽=眼球上 0.17 后 0.05（v5.74 喙根后退公式埋进头骨=墨镜隐身） */
      const e1 = hdN && hdN.getObjectByName('GEO-eyeWL');
      const e2 = hdN && hdN.getObjectByName('GEO-eyeWR');
      if (e1 && e2) {
        return { p: hdN, x: (e1.position.x + e2.position.x) / 2 + 0.015, y: (e1.position.y + e2.position.y) / 2 + 0.004, z: Math.abs(e1.position.z) + 0.01, hz: (e1.position.x + e2.position.x) / 2, hy: (e1.position.y + e2.position.y) / 2, eye: true };
      }
      const bl = hdN ? hdN.getObjectByName('GEO-bill') : (pel.getObjectByName('GEO-bill'));
      if (bl) return { p: hdN || pel, x: bl.position.x + 0.03, y: bl.position.y + 0.05, z: 0.075, hz: bl.position.x, hy: bl.position.y + 0.16, eye: false };
      return { p: pel, x: 0.5, y: 0.85, z: 0.075, hz: 0.4, hy: 1.0, eye: false };
    }
    function mkCos(id) {
      const g2 = new THREE.Group();
      const FA = faceAnchor();
      if (id === 'g1' || id === 'g2' || id === 'g3') {   /* v5.78 原点系世界米：x=前 y=上 z=左右，跟随层摆到眼球 */
        const big = id === 'g2' ? 1.3 : 1, gold = id === 'g3';
        const lm = M(id === 'g2' ? '#1c1c22' : gold ? '#3c2c10' : '#2c3c24', 0.3, 0.4);
        const fm = M(gold ? '#e7bd4a' : id === 'g1' ? '#7a8a4a' : '#111', 0.35, 0.7);
        for (const s of [1, -1]) {
          const l2 = B(0.02, 0.045 * big, 0.052 * big, lm); l2.position.set(0.012, 0, s * 0.048); g2.add(l2);   /* v5.88 片距收拢罩住眼球，前推架喙 */
          const tmp = B(0.085, 0.012, 0.012, fm); tmp.position.set(-0.072, 0.004, s * 0.082); tmp.rotation.y = s * 0.5; g2.add(tmp);
          if (gold) { const rim = new THREE.Mesh(new THREE.TorusGeometry(0.032 * big, 0.006, 5, 10), fm); rim.position.set(0.024, 0, s * 0.048); rim.rotation.y = Math.PI / 2; g2.add(rim); }
        }
        const br = B(0.015, 0.01, 0.04, fm); br.position.set(0.02, 0.004, 0); g2.add(br);
        if (gold) for (let k = 0; k < 6; k++) { const sp = B(0.03, 0.008, 0.008, fm); const an = k / 6 * 6.283; sp.position.set(0.024, Math.sin(an) * 0.048, Math.cos(an) * 0.048); g2.add(sp); }
      } else if (id === 'h1') {   /* v5.78 原点系：跟随层摆到眼球上方 */
        const bm = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.12, 12), M('#c9a86a', 0.8)); bm.position.set(-0.01, 0.105, 0); g2.add(bm);
        const br2 = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.25, 0.02, 12), M('#b8964f', 0.85)); br2.position.set(-0.01, 0.05, 0); g2.add(br2);
      } else if (id === 'h2') {
        const cm = M('#3a4a66', 0.8);
        const cap = B(0.18, 0.06, 0.18, cm); cap.position.set(-0.01, 0.075, 0); g2.add(cap);
        const fl = B(0.14, 0.12, 0.03, cm); fl.position.set(-0.12, 0.035, 0); fl.rotation.z = 0.3; g2.add(fl);
        const kn = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 5), M('#2a3448', 0.8)); kn.position.set(-0.01, 0.115, 0); g2.add(kn);
      } else if (id === 'h3') {
        const gm = M('#e7bd4a', 0.3, 0.8);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 12), gm); band.position.set(-0.01, 0.055, 0); band.rotation.x = Math.PI / 2; g2.add(band);
        for (const s of [1, -1]) { const wg = B(0.08, 0.1, 0.02, gm); wg.position.set(-0.01, 0.095, s * 0.085); wg.rotation.x = s * 1.25; wg.rotation.z = -0.15; g2.add(wg); }   /* v5.82 金翼贴头侧放平（原来竖直成三角尺） */
        const jew = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), M('#c23b2a', 0.2, 0.3)); jew.position.set(0.07, 0.08, 0); g2.add(jew);
      } else if (id === 'b1' || id === 'b2' || id === 'b3') {
        let pm2;
        if (id === 'b1') pm2 = M('#4a5a6e', 0.85);
        else if (id === 'b2') pm2 = new THREE.MeshStandardMaterial({ map: leopardTex(), roughness: 0.7 });
        else pm2 = M('#8a5a4a', 0.6);
        if (id === 'b1') { const p1 = B(0.2, 0.16, 0.06, pm2); p1.position.set(-0.05, 0.5, 0.26); g2.add(p1); const p3 = p1.clone(); p3.position.z = -0.26; g2.add(p3); const st = B(0.22, 0.03, 0.5, M('#3a4656', 0.85)); st.position.set(-0.05, 0.58, 0); g2.add(st); }
        else if (id === 'b2') {
          const bd2 = B(0.22, 0.26, 0.09, pm2); bd2.position.set(-0.1, 0.42, 0.27); bd2.rotation.x = 0.12; g2.add(bd2);
          const flap = B(0.22, 0.07, 0.095, pm2); flap.position.set(-0.1, 0.56, 0.275); g2.add(flap);
          {   /* v5.78 过肩两段背带：袋口→肩峰→对侧肋下 */
            const sM = M('#3a2a14', 0.8);
            const strap = (a2, b2) => {
              const d3 = b2.clone().sub(a2); const ln = d3.length();
              const bb = B(0.045, ln, 0.022, sM);
              bb.position.copy(a2).add(b2).multiplyScalar(0.5);
              bb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d3.normalize());
              g2.add(bb);
            };
            strap(new THREE.Vector3(-0.08, 0.56, 0.25), new THREE.Vector3(-0.1, 0.78, 0.04));
            strap(new THREE.Vector3(-0.1, 0.78, 0.04), new THREE.Vector3(-0.12, 0.55, -0.18));
          }
        } else {
          const po = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), pm2); po.scale.set(1.1, 0.9, 0.6); po.position.set(-0.1, 0.44, 0.26); g2.add(po);
          const jd = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12), M('#cfe3d2', 0.3, 0.2)); jd.position.set(-0.1, 0.3, 0.3); g2.add(jd);
          const ts = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.02, 0.12, 5), M('#c23b2a', 0.7)); ts.position.set(-0.1, 0.24, 0.3); g2.add(ts);
        }
      }
      return g2;
    }
    const cosMesh = {};
    PEC.equip = { eye: null, head: null, bag: null };
    PEC.equipG = function (id) {
      const gd = GOODS.cat.goods.concat(GOODS.dog.goods, GOODS.pel.goods).find((x) => x.id === id);
      if (!gd) return;
      if (PEC.equip[gd.slot] && PEC.equip[gd.slot] !== id) cosMesh[PEC.equip[gd.slot]].visible = false;
      if (!cosMesh[id]) { cosMesh[id] = mkCos(id); (gd.slot === 'bag' ? pel : scene).add(cosMesh[id]); }   /* v5.84 帽/镜挂 scene 世界系（挂 pel 会把世界坐标当局部写→位移翻倍甩车尾）；包保局部 */
      window.__pec.cos = cosMesh;
      cosMesh[id].visible = true; PEC.equip[gd.slot] = id;
    };
    PEC.unequipAll = function () { for (const k in PEC.equip) { const cid = PEC.equip[k]; if (cid && cosMesh[cid]) cosMesh[cid].visible = false; PEC.equip[k] = null; } };
    /* ── 商店面板 ── */
    const shop = document.createElement('div');
    shop.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:45;display:none;min-width:300px;background:linear-gradient(160deg,#3c2f1c,#2a2012);border:3px solid #b98d3f;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.6);font-family:KaiTi,"STKaiti","Noto Serif CJK SC",serif;color:#f0d9a0;padding:16px 18px 14px';
    shop.innerHTML = '<div id="shTtl" style="font-size:20px;letter-spacing:2px;text-align:center;border-bottom:1px solid #8a6a34;padding-bottom:8px;margin-bottom:10px"></div><div id="shList"></div><div style="text-align:center;margin-top:10px;font-size:15px">钱袋 <span id="shMon" style="color:#ffe28a"></span>　<button id="shX" style="background:#5a4426;border:1px solid #b98d3f;color:#f0d9a0;border-radius:6px;padding:3px 14px;font-family:inherit;font-size:14px;cursor:pointer">关</button></div>';
    document.body.appendChild(shop);
    const renderShop = (key) => {
      const S = GOODS[key];
      document.getElementById('shTtl').textContent = S.title;
      document.getElementById('shMon').textContent = PEC.money + ' G';
      const li = document.getElementById('shList'); li.innerHTML = '';
      S.goods.forEach((gd) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 4px;border-bottom:1px dashed rgba(185,141,63,.25);gap:14px';
        const nm = document.createElement('span'); nm.style.cssText = 'font-size:17px'; nm.textContent = gd.name;
        const pr = document.createElement('span'); pr.style.cssText = 'color:#ffe28a;font-size:15px'; pr.textContent = gd.price + 'G';
        const bt = document.createElement('button');
        bt.style.cssText = 'min-width:64px;background:#6e4c1e;border:1px solid #d4a94e;border-radius:6px;color:#ffecc0;font-family:inherit;font-size:15px;padding:4px 10px;cursor:pointer';
        const isFw = !!(window.__FWD && window.__FWD[gd.id]);   /* v605 烟花是消耗品：可无限回购；穿戴件仍是一件 */
        if (PEC.got[gd.id] && gd.slot) { bt.textContent = '背上了'; bt.disabled = true; bt.style.opacity = 0.55; }
        else if (isFw && PEC.got[gd.id]) { bt.textContent = '再买 ×' + PEC.inv[gd.id]; bt.onclick = function () {
          if (PEC.money < gd.price) { bt.textContent = '钱不够'; setTimeout(() => { bt.textContent = '再买 ×' + PEC.inv[gd.id]; }, 900); return; }
          PEC.money -= gd.price; PEC.inv[gd.id]++; PEC.hudAmt(PEC.money); PEC.say('又买一发 ' + gd.name); renderShop(key);
        }; }
        else { bt.textContent = '买下'; bt.onclick = function () {
          if (PEC.money < gd.price) { bt.textContent = '钱不够'; setTimeout(() => { bt.textContent = '买下'; }, 900); return; }
          PEC.money -= gd.price; PEC.got[gd.id] = 1;
          if (gd.slot) PEC.equipG(gd.id); else PEC.inv[gd.id]++;
          PEC.hudAmt(PEC.money); PEC.say('买下了 ' + gd.name);
          renderShop(key);
        }; }
        row.appendChild(nm); row.appendChild(pr); row.appendChild(bt); li.appendChild(row);
      });
    };
    let shopKey = null;
    window.__pecShopOpen = (key) => { shopKey = key; renderShop(key); shop.style.display = 'block'; };
    const shopClose = () => { shop.style.display = 'none'; shopKey = null; };
    document.getElementById('shX').onclick = shopClose;
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && shopKey) shopClose(); });
    setInterval(() => { if (shopKey && (!PEL.on || Math.hypot(PEL.pos.x - shopNpcPos[shopKey][0], PEL.pos.z - shopNpcPos[shopKey][1]) > 4.2)) shopClose(); }, 400);
    /* ── 四位掌柜（程序低模，各自店址） ── */
    const shopNpcPos = { cat: [0.6, -7.1], dog: [7.3, -2.05], pel: [-4.15, -1.15], deer: [-4.9, 2.2] };   /* v5.89 用户点单：猫大堂中间/狗大澡塘沿/灰羽鹈鹕餐桌上，全部面向大门 */
    function sitMat(c) { return M(c, 0.85); }
    { /* 猫：橘白团身坐姿+长尾绕脚 */
      const g2 = new THREE.Group();
      const or = sitMat('#d8853a'), wh = sitMat('#f2ead8');
      const bd3 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), or); bd3.scale.set(0.85, 1.15, 0.75); bd3.position.y = 0.2; g2.add(bd3);
      const ch2 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), wh); ch2.scale.set(0.8, 0.7, 0.5); ch2.position.set(0.06, 0.14, 0); g2.add(ch2);
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), or); hd.position.set(0, 0.47, 0); g2.add(hd);
      for (const s of [1, -1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 4), or); ear.position.set(0.01, 0.6, s * 0.06); g2.add(ear); const fr = B(0.02, 0.05, 0.05, wh); fr.position.set(0.03, 0.55, s * 0.05); g2.add(fr); }
      const msn = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), M('#26262c')); msn.position.set(0.1, 0.46, 0); g2.add(msn);
      for (const s of [1, -1]) { const ey = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), M('#1c2a14', 0.3)); ey.position.set(0.1, 0.5, s * 0.045); g2.add(ey); }
      const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.4, 6), or); tl.position.set(-0.12, 0.16, 0.1); tl.rotation.x = 1.3; tl.rotation.z = 0.5; g2.add(tl);
      g2.position.set(shopNpcPos.cat[0], 0.09, shopNpcPos.cat[1]); g2.rotation.y = -1.59; scene.add(g2);
      const zbu = B(0.5, 0.03, 0.4, M('#7a3a2a', 0.9)); zbu.position.set(shopNpcPos.cat[0], 0.02, shopNpcPos.cat[1]); scene.add(zbu);
    }
    { /* 店狗：坐姿小大黄（区别于院中漫游狗：蹲在钱箱上） */
      const g2 = new THREE.Group();
      const fu = sitMat('#c8963e'), dk = sitMat('#a87a2e');
      const bd3 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fu); bd3.scale.set(0.8, 1.2, 0.7); bd3.position.y = 0.2; g2.add(bd3);
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), fu); hd.position.set(0.05, 0.44, 0); hd.scale.set(1.1, 0.9, 0.9); g2.add(hd);
      const sn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 5), dk); sn.rotation.z = -1.4; sn.position.set(0.16, 0.42, 0); g2.add(sn);
      for (const s of [1, -1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), dk); ear.position.set(0.02, 0.52, s * 0.055); ear.rotation.x = s * 0.4; g2.add(ear); }
      g2.position.set(shopNpcPos.dog[0], 1.0, shopNpcPos.dog[1]); g2.rotation.y = -1.84; g2.scale.setScalar(0.92); scene.add(g2);   /* v5.89 趴大澡塘东南沿（y1.0=塘沿板面），望大门 */
    }
    { /* 灰羽鹈鹕掌柜：西厢 */
      const g2 = new THREE.Group();
      const gy = sitMat('#9aa0a6'), gy2 = sitMat('#7a8088'), o2 = M('#d8842e', 0.5);
      const bd3 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), gy); bd3.scale.set(1.6, 0.6, 0.65); bd3.position.set(-0.05, 0.5, 0); g2.add(bd3);
      const n1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), gy); n1.position.set(0.3, 0.78, 0); n1.rotation.z = -0.9; g2.add(n1);
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), gy); hd.position.set(0.52, 1.0, 0); g2.add(hd);
      const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, 0.4, 6), o2); bl.position.set(0.78, 0.98, 0); bl.rotation.z = 1.6; g2.add(bl);
      const pc = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M('#e8a86a', 0.7)); pc.scale.set(1.6, 0.45, 0.5); pc.position.set(0.72, 0.9, 0); g2.add(pc);
      for (const s of [1, -1]) { const wg = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), gy2); wg.scale.set(1.7, 0.5, 0.35); wg.position.set(-0.1, 0.56, s * 0.16); wg.rotation.y = s * 0.2; g2.add(wg); }
      g2.position.set(-6.85, 0.67, -0.95); g2.rotation.y = -1.31; g2.scale.setScalar(0.8); scene.add(g2);   /* v5.99 最里侧餐桌（西桌 -6.85,-0.95）：0.67=腹贴桌面（0.93−体半径，原悬空），望大门 */
    }
    { /* 鹿掌柜 v5.89 精修：梅花斑点 + 二段腿接蹄 + 三叉鹿角 + 耳 + 白腹 */
      const g2 = new THREE.Group();
      /* v5.98 梅花鹿皮纹贴图：棕底+深棕梅花斑直接长在毛皮上（白色贴片悬浮案撤） */
      const deerTex = (() => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const x = cv.getContext('2d');
        x.fillStyle = '#9a6f42'; x.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 70; i++) {
          x.fillStyle = 'rgba(122,85,48,' + (0.25 + Math.random() * 0.35) + ')';
          x.beginPath(); x.ellipse(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 5, 2 + Math.random() * 4, Math.random() * 3, 0, 6.29); x.fill();
        }
        for (let i = 0; i < 26; i++) {
          const px = Math.random() * 128, py = Math.random() * 128;
          x.fillStyle = '#714c26';
          x.beginPath(); x.ellipse(px, py, 3.4, 2.4, 0, 0, 6.29); x.fill();
          x.fillStyle = '#5c3d1d';
          for (let k = 0; k < 4; k++) { const an = k * 1.57 + 0.5; x.beginPath(); x.ellipse(px + Math.cos(an) * 3, py + Math.sin(an) * 2.4, 1.5, 1.1, an, 0, 6.29); x.fill(); }
        }
        const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(2, 1);
        return tx;
      })();
      const fu = new THREE.MeshStandardMaterial({ map: deerTex, roughness: 0.92 }), lt = sitMat('#d9c08a'), dk = sitMat('#5e4226'), hr = sitMat('#4a3320');
      const bd3 = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 9), fu); bd3.scale.set(1.5, 0.85, 0.75); bd3.position.y = 1.05; bd3.geometry.translate(0, 0, 0); g2.add(bd3);
      const hump = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), fu); hump.scale.set(1.1, 0.8, 0.8); hump.position.set(0.26, 1.26, 0); g2.add(hump);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), lt); belly.scale.set(1.4, 0.5, 0.6); belly.position.set(-0.02, 0.9, 0); g2.add(belly);
      const nk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.6, 8), fu); nk.position.set(0.46, 1.56, 0); nk.rotation.z = -0.42; g2.add(nk);
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 9, 7), fu); hd.scale.set(1.35, 0.9, 0.8); hd.position.set(0.68, 1.86, 0); g2.add(hd);
      const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), dk); muzzle.scale.set(1.3, 0.8, 0.85); muzzle.position.set(0.82, 1.8, 0); g2.add(muzzle);
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), hr); nose.position.set(0.88, 1.82, 0); g2.add(nose);
      for (const s of [1, -1]) {
        const ey = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), hr); ey.position.set(0.72, 1.9, s * 0.055); g2.add(ey);
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), fu); ear.scale.set(0.5, 1.4, 0.5); ear.position.set(0.56, 2.0, s * 0.11); ear.rotation.x = s * 0.5; ear.rotation.z = -0.3; g2.add(ear);
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.024, 0.3, 5), hr); ant.position.set(0.6, 2.1, s * 0.05); ant.rotation.z = 0.22; ant.rotation.x = s * 0.28; g2.add(ant);
        for (const [by, bl, bz2] of [[2.14, 0.11, 0.09], [2.2, 0.09, 0.16]]) {   /* 双分叉 */
          const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.013, bl, 4), hr);
          tk.position.set(0.6 + bl * 0.35, by, s * bz2); tk.rotation.z = 1.05 + (bz2 - 0.09) * 2; tk.rotation.x = s * 0.4; g2.add(tk);
        }
      }
      for (const s of [1, -1]) for (const [lx, ly] of [[0.3, 1], [-0.3, -1]]) {   /* 四腿：大腿+小腿+蹄 */
        const th = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.03, 0.42, 6), fu); th.position.set(lx, 0.62 + 0.02, s * 0.13); th.rotation.x = ly * 0.06; g2.add(th);
        const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.4, 6), fu); sh.position.set(lx - ly * 0.02, 0.24, s * 0.13); g2.add(sh);
        const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.07, 6), hr); hoof.position.set(lx - ly * 0.02, 0.035, s * 0.13); g2.add(hoof);
      }
      const tl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), lt); tl.scale.set(0.7, 1.2, 0.6); tl.position.set(-0.52, 1.14, 0); g2.add(tl);
      g2.position.set(shopNpcPos.deer[0], 0.06, shopNpcPos.deer[1]); g2.rotation.y = -1.9; scene.add(g2);
    }
    /* 伪门挂 F：y 对齐各楼层 */
    window.__doors.push(
      { name: GOODS.cat.title, x: 0.6, z: -6.4, y: 0, shop: 'cat', cur: 0, target: 0, open: false, hinges: [] },
      { name: GOODS.dog.title, x: 6.7, z: -1.4, y: 0, shop: 'dog', cur: 0, target: 0, open: false, hinges: [] },
      { name: GOODS.pel.title, x: -6.85, z: -0.05, y: 0, shop: 'pel', cur: 0, target: 0, open: false, hinges: [] },
      { name: GOODS.deer.title, x: -4.9, z: 2.8, y: 0, shop: 'deer', cur: 0, target: 0, open: false, hinges: [] }
    );
  }

  /* ======== v542 烟花引擎 + 右上道具栏（双击释放/装备，一键卸下） ======== */
  {
    const PEC = window.__pec;
    const FWD = {
      f1: { label: '转菊', n: 110, dur: 2.0, r: 1.4, colors: ['#ffd75e', '#ff9a3c'], spin: 1 },
      f2: { label: '桶花', n: 200, h: 4.2, tiers: 2, colors: ['#ffb347', '#7ad7ff'] },
      f3: { label: '牡丹', n: 360, h: 6.2, tiers: 3, colors: ['#ff6e8a', '#ffd75e', '#9cff8a'], watch: 3900 },
      f4: { label: '金雨', n: 620, h: 9.0, tiers: 5, colors: ['#ffe28a', '#ffb347', '#ff6e8a', '#7ad7ff', '#fff'], gold: 1, watch: 5400 },
    };
    window.__FWD = FWD;   /* v605b 商店块跨块引用（const 块级作用域，直接引用 ReferenceError） */
    const fxList = [];
    const GRAV = 6.5;
    function burst(x, y, z, def) {
      const tiers = def.tiers || 1, per = (def.n / tiers) | 0;
      for (let k = 0; k < tiers; k++) {
        const n = per;
        const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
        const sp = 2.2 + k * 1.15 + (def.gold ? 1.4 : 0);
        for (let i = 0; i < n; i++) {
          const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1);
          const s2 = sp * (0.6 + Math.random() * 0.55);
          vel[i * 3] = Math.sin(ph) * Math.cos(th) * s2;
          vel[i * 3 + 1] = Math.cos(ph) * s2 * (def.gold ? 0.55 : 1);
          vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * s2;
        }
        const g2 = new THREE.BufferGeometry();
        g2.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const matl = new THREE.PointsMaterial({ color: def.colors[k % def.colors.length], size: def.gold ? 0.08 : 0.1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const pts = new THREE.Points(g2, matl);
        pts.position.set(x, y, z);
        scene.add(pts);
        fxList.push({ pts, vel, t0: performance.now() / 1000, life: (def.dur || 1.5) + k * 0.35 });
      }
    }
    window.__pecFire = function (id) {
      if (!PEC.inv[id]) return false;
      const def = FWD[id];
      PEC.inv[id]--; uiRefresh();
      const fw2 = new THREE.Vector3(Math.sin(PEL.yaw), 0, Math.cos(PEL.yaw));
      const px = PEL.pos.x + fw2.x * 2.4, pz = PEL.pos.z + fw2.z * 2.4;
      const gy = window.__groundAt(px, pz, PEL.pos.y + 3);
      if ((def.tiers || 1) >= 3) {   /* v605 大烟花自动切观赏机位（小烟花 f1/f2 原地放不变） */
        const w0 = window.__fxCam ? window.__fxCam : (window.__fxCam = { p: new THREE.Vector3(), look: new THREE.Vector3() });
        w0.p.set(px + 5.0, gy + 5 + def.h * 0.45, pz + 8.5);
        w0.look.set(px, gy + def.h + 1.4, pz);
        clearTimeout(w0.tm);
        w0.tm = setTimeout(function () { window.__fxCam = null; }, def.watch || 3900);
      }
      const go = function () {
        if (def.spin) {
          const g2 = new THREE.BufferGeometry();
          const n = def.n;
          g2.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
          const matl = new THREE.PointsMaterial({ color: '#ffd75e', size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
          const pts = new THREE.Points(g2, matl);
          pts.position.set(px, gy + 0.15, pz);
          scene.add(pts);
          fxList.push({ pts, spin: def, t0: performance.now() / 1000, life: def.dur, emitted: 0 });
        } else {
          const sh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffd28a' }));
          sh.position.set(px, gy + 0.2, pz);
          scene.add(sh);
          fxList.push({ shell: sh, vy: def.h * 2.6, targetY: gy + def.h, def, t0: performance.now() / 1000 });
        }
      };
      if ((def.tiers || 1) >= 3) setTimeout(go, 1200); else go();   /* v610 大烟花等镜头推到位（开场式俯瞰）再点火 */
      return true;
    };
    setInterval(function () {
      const now = performance.now() / 1000;
      for (let i = fxList.length - 1; i >= 0; i--) {
        const f = fxList[i];
        const t = now - f.t0;
        if (f.shell) {
          f.shell.position.y += f.vy * 0.05;
          f.vy -= 0.28;
          if (f.shell.position.y >= f.targetY || f.vy <= 0.4) {
            burst(f.shell.position.x, f.shell.position.y, f.shell.position.z, f.def);
            scene.remove(f.shell); fxList.splice(i, 1);
          }
          continue;
        }
        if (f.spin) {
          if (t > f.life) { scene.remove(f.pts); fxList.splice(i, 1); continue; }
          const pa = f.pts.geometry.attributes.position;
          const n = pa.count;
          for (let k2 = 0; k2 < n; k2++) {
            const age = ((k2 * 0.11 + t * 2.2) % f.life);
            const an = k2 * 2.39996 + t * 9;
            const rr = 0.25 + age * 1.5;
            pa.setXYZ(k2, Math.cos(an) * rr, Math.sin(age * 5) * 0.1 + age * 0.7, Math.sin(an) * rr);
          }
          pa.needsUpdate = true;
          f.pts.material.opacity = Math.max(0, 1 - t / f.life);
          continue;
        }
        if (t > f.life) { scene.remove(f.pts); f.pts.geometry.dispose(); f.pts.material.dispose(); fxList.splice(i, 1); continue; }
        const pa = f.pts.geometry.attributes.position;
        const step = 0.05;
        for (let k2 = 0; k2 < pa.count; k2++) {
          f.vel[k2 * 3 + 1] -= GRAV * step;
          pa.setXYZ(k2, pa.getX(k2) + f.vel[k2 * 3] * step, pa.getY(k2) + f.vel[k2 * 3 + 1] * step, pa.getZ(k2) + f.vel[k2 * 3 + 2] * step);
        }
        pa.needsUpdate = true;
        f.pts.material.opacity = Math.max(0, 1 - Math.pow(t / f.life, 1.8));
      }
    }, 50);
    /* ── 道具栏 HUD ── */
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:64px;right:14px;z-index:36;display:none;flex-direction:column;gap:6px;font-family:KaiTi,"STKaiti","Noto Serif CJK SC",serif;align-items:flex-end';
    const rowC = document.createElement('div');
    rowC.style.cssText = 'display:flex;gap:6px';
    bar.appendChild(rowC);
    const btnOff = document.createElement('button');
    btnOff.textContent = '打开包包';   /* v605 双击开合包包子菜单（卸下装备移入面板） */
    btnOff.style.cssText = 'position:fixed;right:14px;bottom:88px;z-index:39;background:rgba(46,36,22,.9);border:1.5px solid #b98d3f;border-radius:10px;color:#f0d9a0;font-family:KaiTi,"STKaiti","Noto Serif CJK SC",serif;font-size:15px;padding:6px 16px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)';
    const bagP = document.createElement('div');
    bagP.style.cssText = 'position:fixed;right:14px;bottom:132px;z-index:38;display:none;min-width:260px;max-width:340px;background:linear-gradient(160deg,#3c2f1c,#2a2012);border:2.5px solid #b98d3f;border-radius:12px;color:#f0d9a0;font-family:inherit;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.55)';   /* v609 贴右下角按钮排上方 */
    document.body.appendChild(bagP);
    function renderBag() {
      let h = '<div style="font-size:16px;letter-spacing:2px;border-bottom:1px solid rgba(185,141,63,.4);padding-bottom:6px;margin-bottom:8px">👛 包包</div>';
      const cosAll = PEC.GOODS.cat.goods.concat(PEC.GOODS.dog.goods, PEC.GOODS.pel.goods).filter(function (gd2) { return PEC.got[gd2.id]; });
      let any = false;
      for (const gd2 of cosAll) {
        const on = PEC.equip[gd2.slot] === gd2.id; any = true;
        h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 2px;font-size:15px"><span>' + (on ? '✓ ' : '') + gd2.name + '</span>' + (on ? '<button data-act="off" style="background:#6e4c1e;border:1px solid #d4a94e;border-radius:6px;color:#ffecc0;font-family:inherit;font-size:13px;padding:2px 10px;cursor:pointer">卸下</button>' : '<button data-act="on" data-id="' + gd2.id + '" style="background:#3a2e18;border:1px solid #8a6a34;border-radius:6px;color:#e8d5a8;font-family:inherit;font-size:13px;padding:2px 10px;cursor:pointer">穿上</button>') + '</div>';
      }
      let anyF = false;
      for (const fid2 in FWD) {
        if (!PEC.inv[fid2]) continue; anyF = true;
        h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 2px;font-size:15px"><span>🎆 ' + FWD[fid2].label + ' ×' + PEC.inv[fid2] + '</span><button data-act="fire" data-id="' + fid2 + '" style="background:#7a3a1e;border:1px solid #ffb347;border-radius:6px;color:#ffe28a;font-family:inherit;font-size:13px;padding:2px 12px;cursor:pointer">放！</button></div>';
      }
      if (!any && !anyF) h += '<div style="font-size:13px;color:#a8905e">空空如也——去捡铜钱吧</div>';
      h += '<div style="text-align:center;margin-top:8px"><button data-act="close" style="background:#6e4c1e;border:1px solid #d4a94e;border-radius:8px;color:#ffecc0;font-family:inherit;font-size:14px;padding:4px 22px;cursor:pointer">收起包包</button></div>';
      bagP.innerHTML = h;
      bagP.onclick = function (ev2) {
        const a2 = ev2.target.getAttribute && ev2.target.getAttribute('data-act');
        if (a2 === 'off') { PEC.unequipAll(); renderBag(); uiRefresh(); }
        else if (a2 === 'on') { PEC.equipG(ev2.target.getAttribute('data-id')); renderBag(); uiRefresh(); }
        else if (a2 === 'fire') { if (PEL.on) window.__pecFire(ev2.target.getAttribute('data-id')); renderBag(); uiRefresh(); }
        else if (a2 === 'close') { bagP.style.display = 'none'; btnOff.textContent = '打开包包'; }
      };
    }
    btnOff.onclick = function () {
      const open2 = bagP.style.display === 'none';
      bagP.style.display = open2 ? 'block' : 'none';
      btnOff.textContent = open2 ? '收起包包' : '打开包包';
      if (open2) renderBag();
    };
    btnOff.ondblclick = btnOff.onclick;
    document.body.appendChild(btnOff);   /* v610 独立浮按：底部按钮排正上方 */
    const tip = document.createElement('div');
    tip.textContent = '双击格子：穿戴 / 放烟花';
    tip.style.cssText = 'font-size:11px;color:#cbb27e;opacity:.8;pointer-events:none';
    bar.appendChild(tip);
    document.body.appendChild(bar);
    function chip(txt, dbl, hot) {
      const d = document.createElement('div');
      d.textContent = txt;
      d.title = '双击';
      d.style.cssText = 'padding:5px 10px;background:rgba(46,36,22,.85);border:1.5px solid ' + (hot ? '#ffd75e' : '#8a6a34') + ';border-radius:9px;color:' + (hot ? '#ffe28a' : '#e8d5a8') + ';font-size:14px;cursor:pointer;user-select:none';
      d.ondblclick = dbl;
      d.onclick = function () { d.style.borderColor = '#ffd75e'; setTimeout(() => uiRefresh(), 350); dbl(); };
      return d;
    }
    function uiRefresh() {
      rowC.innerHTML = '';
      const cosAll = PEC.GOODS.cat.goods.concat(PEC.GOODS.dog.goods, PEC.GOODS.pel.goods);
      for (const gd of cosAll) {
        if (!PEC.got[gd.id]) continue;
        const on = PEC.equip[gd.slot] === gd.id;
        rowC.appendChild(chip((on ? '✓' : '') + gd.name.slice(0, 5), function () { PEC.equipG(gd.id); uiRefresh(); }, on));
      }
      for (const fid in FWD) {
        if (!PEC.inv[fid]) continue;
        rowC.appendChild(chip(FWD[fid].label + ' ×' + PEC.inv[fid], function () { if (PEL.on) window.__pecFire(fid); }, false));
      }
      if (!rowC.children.length) { const d0 = document.createElement('div'); d0.textContent = '（空口袋，去捡钱买东西）'; d0.style.cssText = 'font-size:12px;color:#a8905e;'; rowC.appendChild(d0); }
      if (typeof bagP !== 'undefined' && bagP.style.display !== 'none') renderBag();   /* v605 面板开着就刷新 */
    }
    PEC.uiRefresh = uiRefresh;
    setInterval(function () {
      bar.style.display = 'none';   /* v610 顶部物品条退役（用户令）：库存/穿戴统一走右下角包包 */
      if (!PEL.on) {
        if (bagP.style.display !== 'none') { bagP.style.display = 'none'; btnOff.textContent = '打开包包'; }
        btnOff.style.display = 'none';
        return;
      }
      btnOff.style.display = 'block';   /* v612b 包包按钮只在鹈鹕模式出现 */
    }, 500);
    uiRefresh();
  }

  /* ======== v553 万马奔腾：马房头马 F 对话，1000G 召 50 匹沿马车路自东奔西，扬沙 ~~ ======== */
  {
    const PEC = window.__pec;
    /* 马房伪门：等 slot 就位后取其世界坐标 */
    const pollDoor = setInterval(function () {
      if (!window.__stableReq || !window.__doors) return;
      clearInterval(pollDoor);
      scene.updateMatrixWorld(true);
      const wv2 = new THREE.Vector3();
      window.__stableReq.slot.getWorldPosition(wv2);
      window.__stablePos = { x: wv2.x, z: wv2.z };
      window.__doors.push({ name: '马房头马·奔腾预约', x: wv2.x + 0.5, z: wv2.z + 0.5, y: 0, shop: 'gallop', cur: 0, target: 0, open: false, hinges: [] });
    }, 1500);
    /* 对话框 */
    const dlg = document.createElement('div');
    dlg.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:46;display:none;min-width:290px;background:linear-gradient(160deg,#3c2f1c,#2a2012);border:3px solid #b98d3f;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.6);font-family:KaiTi,"STKaiti","Noto Serif CJK SC",serif;color:#f0d9a0;padding:20px 22px;text-align:center';
    dlg.innerHTML = '<div id="dgTxt" style="font-size:19px;letter-spacing:2px;line-height:1.7;margin-bottom:16px"></div><div style="display:flex;gap:16px;justify-content:center"><button id="dgY" style="min-width:76px;background:#6e4c1e;border:1px solid #d4a94e;border-radius:8px;color:#ffecc0;font-family:inherit;font-size:17px;padding:6px 0;cursor:pointer">是</button><button id="dgN" style="min-width:76px;background:#4a3420;border:1px solid #8a6a34;border-radius:8px;color:#e0cfa0;font-family:inherit;font-size:17px;padding:6px 0;cursor:pointer">否</button></div>';
    document.body.appendChild(dlg);
    const dlgClose = () => { dlg.style.display = 'none'; };
    document.getElementById('dgN').onclick = dlgClose;
    document.getElementById('dgY').onclick = function () {
      if (PEC.money < 1000) { document.getElementById('dgTxt').textContent = '「钱不够，回见。」'; setTimeout(dlgClose, 900); return; }
      if (PEC.stampeding) { document.getElementById('dgTxt').textContent = '「正跑着呢，看！」'; setTimeout(dlgClose, 900); return; }
      PEC.money -= 1000; PEC.hudAmt(PEC.money);
      dlgClose();
      window.__pecStampede();
    };
    const origOpen = window.__pecShopOpen;
    window.__pecShopOpen = function (key) {
      if (key !== 'gallop') { origOpen(key); return; }
      document.getElementById('dgTxt').textContent = '（头马甩了甩鬃毛）\n「你要看万马奔腾吗？1000 G」';
      document.getElementById('dgY').textContent = '是';
      document.getElementById('dgN').textContent = '否';
      dlg.style.display = 'block';
    };
    /* 扬沙粒子池（全局 1 个 Points） */
    const DUSTN = 900;
    const dPos = new Float32Array(DUSTN * 3), dVel = new Float32Array(DUSTN * 3), dLife = new Float32Array(DUSTN);
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    const dMat = new THREE.PointsMaterial({ color: '#c9b088', size: 0.22, transparent: true, opacity: 0.5, depthWrite: false });
    const dustPts = new THREE.Points(dGeo, dMat);
    dustPts.visible = false;
    scene.add(dustPts);
    let dCur = 0;
    function puff(x, y, z) {
      const i = dCur = (dCur + 1) % DUSTN;
      dPos[i * 3] = x + (Math.random() - 0.5) * 0.3; dPos[i * 3 + 1] = y + 0.06; dPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
      dVel[i * 3] = (Math.random() - 0.5) * 0.5; dVel[i * 3 + 1] = 0.5 + Math.random() * 0.7; dVel[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      dLife[i] = 1;
    }
    window.__pecStampede = function () {
      if (!horseProto) { PEC.say('马房里马都在打盹…'); return; }
      PEC.stampeding = true;
      dustPts.visible = true;
      {   /* v607 万马奔腾观赏镜头（同大烟花待遇）：路中段东南上方俯瞰，跑完切回 */
        const mid = roadCurve.getPointAt(0.5);
        const wch = window.__fxCam = { p: new THREE.Vector3(mid.x + 2, 7.5, mid.z + 10), look: new THREE.Vector3(mid.x, 1.2, mid.z) };
        if (!PEL.on && typeof controls !== 'undefined' && controls) {
          controls.enabled = false;
          wch.save = { pos: camera.position.clone(), tgt: controls.target.clone() };
          wch.orbit = 1;
        }
        setTimeout(function () { if (window.__fxCamStop) window.__fxCamStop(); }, 95000);   /* v607 保险丝：模拟万一卡住，镜头 95 秒后强制交还 */
        window.__fxCamStop = function () {
          if (wch.orbit && wch.save) {
            camera.position.copy(wch.save.pos); controls.target.copy(wch.save.tgt); controls.enabled = true;
          }
          window.__fxCam = null; window.__fxCamStop = null;
        };
      }
      const herd = [];
      let toBorn = 50, bornT = 0;
      const TAGS = [['FL', 0], ['FR', Math.PI], ['RL', Math.PI], ['RR', 0]];
      function spawnOne() {
        const c = horseProto.clone(true);
        c.traverse(function (o2) { if (o2.isMesh) { o2.castShadow = false; o2.receiveShadow = false; } });
        skinHorse(c);
        c.scale.setScalar(0.88 + Math.random() * 0.26);
        const node = function (n2) { let r = null; c.traverse(function (o2) { if (!r && o2.name === n2) r = o2; }); return r; };
        const legs = [];
        for (const [tag, ph] of TAGS) { const hip = node('hip' + tag), knee = node('knee' + tag); if (hip && knee) legs.push({ hip, knee, ph }); }
        const hs = { c, legs, headG: node('headG'), tailG: node('tailG'), t: 1.03 + Math.random() * 0.05, spd: 0.034 * (1.4 + Math.random() * 0.8), lat: (Math.random() - 0.5) * 1.1, gait: Math.random() * 6.28, fade: 0 };
        scene.add(c);
        herd.push(hs);
      }
      let last = performance.now();
      const gateT = performance.now() + 1300;   /* v610 等观赏机位推到位再开跑 */
      const iv = setInterval(function () {
        const now = performance.now(), dt = Math.min(0.12, (now - last) / 1000);
        last = now;
        if (now < gateT) return;
        if (toBorn > 0) { bornT -= dt; if (bornT <= 0) { spawnOne(); toBorn--; bornT = 0.1 + Math.random() * 0.1; } }   /* 5~10 匹/秒 */
        let alive = 0;
        for (const hs of herd) {
          if (!hs.c.parent) continue;
          hs.t -= hs.spd * dt;
          if (hs.t < -0.03) {
            hs.fade += dt * 2;
            if (hs.fade > 1) { scene.remove(hs.c); }
            else hs.c.traverse(function (o2) {
              if (o2.isMesh && o2.material) {
                const arr2 = Array.isArray(o2.material) ? o2.material : [o2.material];
                arr2.forEach(function (mm) { mm.transparent = true; mm.opacity = Math.max(0, 1 - hs.fade); });
              }
            });
          }
          alive++;
          const tt = Math.min(Math.max(hs.t, 0), 1);
          const p = roadCurve.getPointAt(tt), tg = roadCurve.getTangentAt(tt);
          const px2 = p.x + tg.z * -1 * hs.lat, pz2 = p.z + -tg.x * -1 * hs.lat;
          hs.c.position.set(px2, 0.09 + Math.abs(Math.sin(hs.gait)) * 0.05, pz2);
          hs.c.rotation.y = Math.atan2(-tg.x, -tg.z);
          const near = Math.abs(hs.c.position.x - PEL.pos.x) + Math.abs(hs.c.position.z - PEL.pos.z) < 22;
          hs.gait += dt * 19 * (near ? 1 : 0.5);
          if (near) for (const L of hs.legs) {
            const a2 = Math.sin(hs.gait * 2 + L.ph);
            L.hip.rotation.x = a2 * 0.85;
            L.knee.rotation.x = 0.35 + Math.max(0, -a2) * 0.95;
          }
          if (hs.headG) hs.headG.rotation.x = 0.15 + Math.sin(hs.gait) * 0.08;
          if (hs.tailG) hs.tailG.rotation.x = -0.5 - Math.sin(hs.gait * 0.7) * 0.12;
          if (near && Math.random() < 0.5) puff(hs.c.position.x - Math.sin(hs.c.rotation.y) * 0.5, 0.05, hs.c.position.z - Math.cos(hs.c.rotation.y) * 0.5);
          for (const ak of animals) {
            if (ak.scare && Math.hypot(ak.obj.position.x - px2, ak.obj.position.z - pz2) < 3.2) ak.scare(px2, pz2);
          }
        }
        for (let k = 0; k < DUSTN; k++) {
          if (dLife[k] <= 0) continue;
          dLife[k] -= dt * 1.4;
          dPos[k * 3] += dVel[k * 3] * dt; dPos[k * 3 + 1] += dVel[k * 3 + 1] * dt; dPos[k * 3 + 2] += dVel[k * 3 + 2] * dt;
          dVel[k * 3 + 1] -= dt * 0.8;
        }
        dGeo.attributes.position.needsUpdate = true;
        if (window.__fxCam && window.__fxCam.orbit) {
          camera.position.lerp(window.__fxCam.p, 0.08);
          const tg2 = controls.target.clone().lerp(window.__fxCam.look, 0.08);
          controls.target.copy(tg2); camera.lookAt(tg2);
        }
        if (toBorn <= 0 && alive === 0) {
          clearInterval(iv);
          dustPts.visible = false;
          for (const hs of herd) if (hs.c.parent) scene.remove(hs.c);
          PEC.stampeding = false;
          if (window.__fxCamStop) window.__fxCamStop();   /* v607 镜头交还 */
          PEC.say('奔腾完毕， horse power +50');
        }
      }, 50);
    };
  }
}

  window.__reflResize = function () {
    rt.setSize(Math.max(2, Math.floor(renderer.domElement.clientWidth / 2)), Math.max(2, Math.floor(renderer.domElement.clientHeight / 2)));
  };
}
window.reedFx = reedFx;
/* 手动雷雨（按钮触发）：独立倒计时，与滚动自动雷雨互不干扰 */
let manualStorm = 0;
function decideStorm(t0, len, isN) {
  if (window.__stormForce) {
    if ((window.__stormForce === 'night') === !!isN) {
      storm.start = t0 + len * 0.32; storm.dur = Math.min(len * 0.55, 20);
    } else storm.start = -1;
    return;
  }
  if (Math.random() < 0.5) {
    storm.start = t0 + 2 + Math.random() * Math.max(2, len * 0.4);
    storm.dur = 18 + Math.random() * 10;
    if (storm.start + storm.dur > t0 + len - 2) storm.dur = (t0 + len - 2 - storm.start) * 0.9;
  } else storm.start = -1;
}
const GRAY = { day: new THREE.Color('#837153'), night: new THREE.Color('#161b22') };   /* 雨天也转暖黄灰 */
const _baseSky = scene.background.clone();   /* 基准天空：白天初始环境不走 envApply，直接取当前背景 */
const _baseEnv = { sun: 1.35, hemi: 0.25, env: null, envInt: 0.55 };   /* 基准光强/天空/反射（白天初始值，envApply 会覆写） */
const FLASH = new THREE.Color('#e8eef4');
const CLOUD_WHITE = new THREE.Color('#f1e2c2');   /* 白天云带乳黄，不再死白 */
const CLOUD_DARK = new THREE.Color('#2f3640');
/* 闪电枝：每次打雷重新生成从天而降的折线管道，HDR 过曝白+加法混合，闪时炸亮 */
const boltMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
boltMat.color.setRGB(6, 6, 6);
const bolt = new THREE.Group();
bolt.visible = false; bolt.frustumCulled = false; scene.add(bolt);
function boltTube(pts, r) {
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 4), r, 6, false), boltMat);
}
function clearBolt() {
  for (let i = bolt.children.length - 1; i >= 0; i--) {
    bolt.children[i].geometry.dispose();
    bolt.remove(bolt.children[i]);
  }
}
function makeBolt() {
  clearBolt();
  const a = Math.random() * Math.PI * 2, r0 = 7 + Math.random() * 14;
  let x = Math.cos(a) * r0, z = Math.sin(a) * r0, y = 20;
  const pts = [new THREE.Vector3(x, y, z)];
  while (y > 1.5) {
    y -= 1.8 + Math.random() * 2.4;
    x += (Math.random() - 0.5) * 3.2;
    z += (Math.random() - 0.5) * 3.2;
    pts.push(new THREE.Vector3(x, Math.max(1.5, y), z));
  }
  bolt.add(boltTube(pts, 0.16));
  const nBr = 1 + Math.floor(Math.random() * 2);
  for (let b = 0; b < nBr; b++) {
    const i0 = 2 + Math.floor(Math.random() * Math.max(1, pts.length - 5));
    let bx = pts[i0].x, bz = pts[i0].z, by = pts[i0].y;
    const bp = [new THREE.Vector3(bx, by, bz)];
    for (let s = 0; s < 4; s++) {
      by -= 1 + Math.random() * 1.6;
      bx += (Math.random() - 0.5) * 4;
      bz += (Math.random() - 0.5) * 4;
      bp.push(new THREE.Vector3(bx, Math.max(1, by), bz));
    }
    bolt.add(boltTube(bp, 0.07));
  }
}
function stormFx(isNight) {
  /* 静态(非滚动)模式 envApply 不逐帧跑：每帧先复位天空/雾色/光强基准再叠加，
     否则 += / *= 增量会永久累积（闪电连闪把半球光堆到 3.6 全场发白） */
  if (envMode !== 'cycle') {
    scene.background.copy(_baseSky); scene.fog.color.copy(hazeMix(_baseSky, dayNight.isNight ? 0 : 0.22));
    dayNight.sun.intensity = _baseEnv.sun; dayNight.hemi.intensity = _baseEnv.hemi;
    if (_baseEnv.env) scene.environment = _baseEnv.env;
  }
  /* 水面参数每帧绝对写入（非增量）：平静 → 雨点打碎 → 闪电银光 */
  const wK = storm.inten;
  [dayNight.water, dayNight.pondWater].forEach(m => {
    if (!m) return;
    m.roughness = m.userData.r0 + 0.26 * wK;
    const sh = m.userData.shader;
    if (sh && sh.uniforms.uAlpha) sh.uniforms.uAlpha.value = m.userData.o0 + 0.08 * wK;
    else m.opacity = m.userData.o0 + 0.08 * wK;
    m.envMapIntensity = _baseEnv.envInt * WATER_REFLECT;
  });
  waterU.uAmp.value = 1.0 + 1.1 * wK;          /* 雨点把浪打碎 */
  waterU.uFoam.value = 0.04 + 0.80 * wK;
  if (storm.inten > 0.02) {
    const k = storm.inten;
    scene.environment = isNight ? ENV.grayN : ENV.grayD;
    scene.background.lerp(isNight ? GRAY.night : GRAY.day, 0.5 * k);
    scene.fog.color.copy(scene.background);
    scene.fog.near = 80 - 42 * k;
    scene.fog.far = 180 - 85 * k;
    dayNight.sun.intensity *= 1 - 0.55 * k;
    dayNight.hemi.intensity += (isNight ? -0.08 : 0.10) * k;
    /* 白云原地变成大片乌云：加深、放大、微微压低（高度带不变） */
    for (const c of clouds) {
      const m = c.userData.mat;
      m.color.copy(CLOUD_WHITE).lerp(CLOUD_DARK, k);
      m.opacity = 0.5 + 0.32 * k;
      const s = 1 + 0.5 * k;
      c.scale.set(s, s * 0.8, s);
      c.position.y = c.userData.baseY - 1.6 * k;
    }
  } else {
    for (const c of clouds) {
      c.userData.mat.color.copy(CLOUD_WHITE).lerp(CLOUD_TINT_N, cloudN * 0.75);
      c.userData.mat.opacity = 0.5 - 0.14 * cloudN;
      if (c.scale.x !== 1) { c.scale.set(1, 1, 1); c.position.y = c.userData.baseY; }
    }
  }
  if (storm.flash > 0) {
    const k = Math.min(1, storm.flash / 0.2);
    const fk = isNight ? 0.95 : 0.55;   /* 白天闪电收敛，别把整屏洗白；夜景保持原强度 */
    scene.background.lerp(FLASH, k * fk);
    scene.fog.color.copy(scene.background);
    dayNight.hemi.intensity += (isNight ? 2.4 : 1.2) * k;
    dayNight.sun.intensity += (isNight ? 3.0 : 1.5) * k;
    [dayNight.water, dayNight.pondWater].forEach(m => { if (m) m.envMapIntensity += 2.4 * k; });   /* 闪电瞬间水面银光 */
    boltMat.opacity = k;
    bolt.visible = true;
  } else {
    bolt.visible = false;
  }
}
function updateWeather(dt) {
  const inCycle = envMode === 'cycle';
  if (manualStorm > 0) { manualStorm = Math.max(0, manualStorm - dt); if (!manualStorm) syncStormBtn(); }
  const tempest = storm.on || manualStorm > 0;
  const tgt = tempest ? 1 : 0;
  storm.inten += (tgt - storm.inten) * Math.min(1, dt * 0.9);
  rainMat.opacity = 0.72 * storm.inten;
  rain.visible = storm.inten > 0.02;
  if (rain.visible) rain.position.set(camera.position.x, 0, camera.position.z);
  if (rain.visible) {
    const arr = rainGeo.attributes.position.array;
    for (let i = 0; i < NR; i++) {
      arr[i * 3 + 1] -= (19 + (i % 9)) * dt;
      arr[i * 3] += 3.2 * dt;
      if (arr[i * 3] > 26) arr[i * 3] -= 52;
      if (arr[i * 3 + 1] < 0.1) {
        arr[i * 3 + 1] = rr(16, 25);
        const a = rand() * Math.PI * 2, r = rr(0, 25);
        arr[i * 3] = Math.cos(a) * r; arr[i * 3 + 2] = Math.sin(a) * r;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  storm.wet = Math.min(1, Math.max(0, storm.wet + dt * (tempest ? 0.25 : -0.045)));
  puddleMat.opacity = 0.8 * storm.wet;
  for (const pd of puddles) pd.visible = storm.wet > 0.03;
  if (tempest) {
    storm.flashNext -= dt;
    if (storm.flashNext <= 0) {
      const gnd = Math.random() < 1 / 3;   /* 1/3 落地雷（雷管+强闪），2/3 云内空闪（弱闪无管） */
      storm.flash = gnd ? 0.2 : 0.13;
      if (gnd) makeBolt(); else clearBolt();
      storm.flashNext = 2 + Math.random();
    }
  }
  storm.flash = Math.max(0, storm.flash - dt);
  stormFx(dayNight.isNight);
  if (!inCycle && storm.inten < 0.02) { scene.fog.near = 80; scene.fog.far = 180; }
}

/* ---------------- v4.81 四段时辰：上午(蓝)/下午(昏黄)/上半夜/下半夜(黑+薄雾) ---------------- */
let DAY_SEC = 120, NIGHT_SEC = 120;
let envMode = 'day', cycleT = 0;
const PH4 = [
  { key: 'am', sky: SKY_MORN, sun: new THREE.Color('#ffd9b0'), sunInt: 1.22, hemi: 0.26, n: 0, exp: 0.72, envKey: 'morning', near: 56, far: 168, pos: new THREE.Vector3(30, 11, -14), table: new THREE.Color('#c6e2f4') },
  { key: 'pm', sky: SKY_DAY, sun: new THREE.Color('#f0a145'), sunInt: 1.52, hemi: 0.19, n: 0, exp: EXP.day, envKey: 'day', near: 62, far: 172, pos: new THREE.Vector3(20, 18, 12) },
  { key: 'n1', sky: SKY_NIGHT, sun: new THREE.Color('#8093b8'), sunInt: 0.045, hemi: 0.09, n: 1, exp: EXP.night, envKey: 'night', near: 52, far: 140, pos: new THREE.Vector3(-16, 24, 10) },
  { key: 'n2', sky: SKY_DEEP, sun: new THREE.Color('#8093b8'), sunInt: 0.03, hemi: 0.055, n: 1, exp: 0.80, envKey: 'deep', near: 44, far: 112, pos: new THREE.Vector3(-16, 26, 10), table: new THREE.Color('#04060c') },
];
const CE = { sky: SKY_DAY.clone(), sun: new THREE.Color('#f0a145'), sunInt: 1.52, hemi: 0.19, n: 0, exp: EXP.day, near: 80, far: 180, envKey: 'day', table: null, idx: -1 };
function setPhase(i) {
  const P0 = PH4[i];
  CE.sky.copy(P0.sky); CE.sun.copy(P0.sun); CE.sunInt = P0.sunInt; CE.hemi = P0.hemi;
  CE.table = P0.table ? P0.table.clone() : null;
  CE.n = P0.n; CE.exp = P0.exp; CE.near = P0.near; CE.far = P0.far; CE.envKey = P0.envKey; CE.idx = i;
  dayNight.sun.position.copy(P0.pos);
  envApply(CE.sky, CE.sun, CE.sunInt, CE.hemi, CE.n, { exp: CE.exp, envKey: CE.envKey, near: CE.near, far: CE.far, table: CE.table });
  if (window.__cine) window.__cine.applyLut(P0.key);
}
/* ---- 🎆 礼花 & 黄昏混合（运镜尾段） ---- */
{
  const cols = ['#ffd75e', '#ff7a4d', '#8ee08a', '#ff5d8f', '#9fd0ff', '#ffe9b0'];
  const sys = window.__fwSys = { bursts: [], fired: {}, n: 0 };
  window.__fwReset = function () { sys.fired = {}; };
  sys.spawn = function (x, y, z) {
    const N = 190;
    const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1), sp = 1.5 + Math.random() * 2.3;
      vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp; vel[i * 3 + 1] = Math.cos(ph) * sp; vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: cols[sys.n++ % cols.length], size: 0.3, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const p = new THREE.Points(g, m);
    p.userData = { vel, life: 0, ttl: 1.9 };
    scene.add(p); sys.bursts.push(p);
  };
  window.__fwUpdate = function (dt) {
    for (let i = sys.bursts.length - 1; i >= 0; i--) {
      const p = sys.bursts[i]; const u = p.userData; u.life += dt;
      const arr = p.geometry.attributes.position.array; const v3 = u.vel;
      for (let j = 0; j < arr.length; j += 3) {
        v3[j + 1] -= 2.3 * dt;
        arr[j] += v3[j] * dt; arr[j + 1] += v3[j + 1] * dt; arr[j + 2] += v3[j + 2] * dt;
      }
      p.geometry.attributes.position.needsUpdate = true;
      p.material.opacity = Math.max(0, 1 - u.life / u.ttl);
      if (u.life > u.ttl) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); sys.bursts.splice(i, 1); }
    }
  };
  const A = PH4[1], B = PH4[2];
  const _sk = new THREE.Color(), _su = new THREE.Color(), _po = new THREE.Vector3(), _tb = new THREE.Color();
  window.__duskMix = function (k) {
    _sk.copy(A.sky).lerp(B.sky, k); _su.copy(A.sun).lerp(B.sun, k);
    _po.copy(A.pos).lerp(B.pos, k); dayNight.sun.position.copy(_po);
    B.table ? _tb.copy(dayNight.tableBase).lerp(B.table, k) : _tb.copy(dayNight.tableBase);
    CE.sky.copy(_sk); CE.sun.copy(_su);
    CE.sunInt = A.sunInt + (B.sunInt - A.sunInt) * k; CE.hemi = A.hemi + (B.hemi - A.hemi) * k;
    CE.n = A.n + (B.n - A.n) * k; CE.exp = A.exp + (B.exp - A.exp) * k;
    CE.near = A.near + (B.near - A.near) * k; CE.far = A.far + (B.far - A.far) * k;
    CE.envKey = k > 0.5 ? 'night' : 'day';
    envApply(CE.sky, CE.sun, CE.sunInt, CE.hemi, CE.n, { exp: CE.exp, envKey: CE.envKey, near: CE.near, far: CE.far, table: _tb });
    if (window.__cine) window.__cine.applyLut(k > 0.5 ? 'n1' : 'pm');
  };
  /* 🎥 四段压缩巡游混光：每段 SEG 秒，段尾 20% 平滑过渡到下一段（无人机一镜到底用） */
  window.__envMix4 = function (tt, seg) {
    const S = seg || 15;
    const i = Math.max(0, Math.min(3, Math.floor(tt / S)));
    const j = Math.min(3, i + 1);
    const f = tt / S - i;
    let k = f <= 0.8 ? 0 : (f - 0.8) / 0.2 * (j > i ? 1 : 0);
    k = k * k * (3 - 2 * k);
    const A2 = PH4[i], B2 = PH4[j];
    _sk.copy(A2.sky).lerp(B2.sky, k); _su.copy(A2.sun).lerp(B2.sun, k);
    _po.copy(A2.pos).lerp(B2.pos, k); dayNight.sun.position.copy(_po);
    const tbA = A2.table ? A2.table : dayNight.tableBase;
    const tbB = B2.table ? B2.table : dayNight.tableBase;
    _tb.copy(tbA).lerp(tbB, k);
    CE.sky.copy(_sk); CE.sun.copy(_su);
    CE.sunInt = A2.sunInt + (B2.sunInt - A2.sunInt) * k; CE.hemi = A2.hemi + (B2.hemi - A2.hemi) * k;
    CE.n = A2.n + (B2.n - A2.n) * k; CE.exp = A2.exp + (B2.exp - A2.exp) * k;
    CE.near = A2.near + (B2.near - A2.near) * k; CE.far = A2.far + (B2.far - A2.far) * k;
    CE.envKey = k > 0.5 ? B2.envKey : A2.envKey;
    envApply(CE.sky, CE.sun, CE.sunInt, CE.hemi, CE.n, { exp: CE.exp, envKey: CE.envKey, near: CE.near, far: CE.far, table: _tb });
    if (window.__cine) window.__cine.applyLut(k > 0.5 ? B2.key : A2.key);
  };
  /* 🎥 巡游五段：上午→下午→上半夜→下半夜→天晴回下午（转圈视频专用，seg=12s） */
  const SEQ = [0, 1, 2, 3, 1];
  window.__envTour = function (tt, seg) {
    const S = seg || 12;
    const i = Math.max(0, Math.min(SEQ.length - 1, Math.floor(tt / S)));
    const ii = SEQ[i], j = SEQ[Math.min(SEQ.length - 1, i + 1)];
    const f = tt / S - i;
    let k = (f <= 0.8 || j === ii) ? 0 : (f - 0.8) / 0.2;
    k = k * k * (3 - 2 * k);
    const A2 = PH4[ii], B2 = PH4[j];
    _sk.copy(A2.sky).lerp(B2.sky, k); _su.copy(A2.sun).lerp(B2.sun, k);
    _po.copy(A2.pos).lerp(B2.pos, k); dayNight.sun.position.copy(_po);
    const tbA = A2.table ? A2.table : dayNight.tableBase;
    const tbB = B2.table ? B2.table : dayNight.tableBase;
    _tb.copy(tbA).lerp(tbB, k);
    CE.sky.copy(_sk); CE.sun.copy(_su);
    CE.sunInt = A2.sunInt + (B2.sunInt - A2.sunInt) * k; CE.hemi = A2.hemi + (B2.hemi - A2.hemi) * k;
    CE.n = A2.n + (B2.n - A2.n) * k; CE.exp = A2.exp + (B2.exp - A2.exp) * k;
    CE.near = A2.near + (B2.near - A2.near) * k; CE.far = A2.far + (B2.far - A2.far) * k;
    CE.envKey = k > 0.5 ? B2.envKey : A2.envKey;
    envApply(CE.sky, CE.sun, CE.sunInt, CE.hemi, CE.n, { exp: CE.exp, envKey: CE.envKey, near: CE.near, far: CE.far, table: _tb });
    if (window.__cine) window.__cine.applyLut(k > 0.5 ? B2.key : A2.key);
  };
  /* 🎥 v4.93 连续光照巡游 50s（录像专用）：5×10s am→pm→n1→n2→am，
     全程平滑过渡 + 太阳方位持续扫动（影子不再定住猛甩）；雷阵雨 25→31s（上半夜第5s起，下半夜开场已收） */
  const T5 = [0, 1, 2, 3, 0];
  window.__envTour2 = function (tt) {
    const u = Math.max(0, Math.min(0.9999, tt / 50));
    const g = u * 5; const i = Math.min(4, Math.floor(g)); const f = g - i;
    const ii = T5[i], j = T5[Math.min(4, i + 1)];
    const A2 = PH4[ii], B2 = PH4[j];
    const k = f * f * (3 - 2 * f);
    _sk.copy(A2.sky).lerp(B2.sky, k); _su.copy(A2.sun).lerp(B2.sun, k);
    _po.copy(A2.pos).lerp(B2.pos, k);
    { const sw = (u * 4.2 - 1.6) * 0.42, cs = Math.cos(sw), sn = Math.sin(sw);
      const ppx = _po.x, ppz = _po.z;
      _po.set(ppx * cs - ppz * sn, _po.y, ppx * sn + ppz * cs); }
    dayNight.sun.position.copy(_po);
    const tbA = A2.table ? A2.table : dayNight.tableBase;
    const tbB = B2.table ? B2.table : dayNight.tableBase;
    _tb.copy(tbA).lerp(tbB, k);
    CE.sky.copy(_sk); CE.sun.copy(_su);
    CE.sunInt = A2.sunInt + (B2.sunInt - A2.sunInt) * k; CE.hemi = A2.hemi + (B2.hemi - A2.hemi) * k;
    CE.n = A2.n + (B2.n - A2.n) * k; CE.exp = A2.exp + (B2.exp - A2.exp) * k;
    CE.near = A2.near + (B2.near - A2.near) * k; CE.far = A2.far + (B2.far - A2.far) * k;
    CE.envKey = k > 0.5 ? B2.envKey : A2.envKey;
    envApply(CE.sky, CE.sun, CE.sunInt, CE.hemi, CE.n, { exp: CE.exp, envKey: CE.envKey, near: CE.near, far: CE.far, table: _tb });
    if (window.__cine) window.__cine.applyLut(k > 0.5 ? B2.key : A2.key);
    storm.on = tt >= 25 && tt < 31;
  };
}
function cycleEnv(dt) {
  const TOT = 120;
  cycleT = (cycleT + dt) % TOT;
  const pi = Math.min(3, Math.floor(cycleT / 30));
  const P0 = PH4[pi];
  if (pi !== CE.idx) {
    CE.idx = pi;
    storm.decided = P0.key;
    decideStorm(cycleT, 30, pi >= 2);
    storm.flashNext = 2;
  }
  storm.on = storm.start >= 0 && cycleT >= storm.start && cycleT < storm.start + storm.dur;
  const k = Math.min(1, dt * 1.5);
  CE.sky.lerp(_sc.copy(P0.sky), k);
  CE.sun.lerp(_sk.copy(P0.sun), k);
  CE.sunInt += (P0.sunInt - CE.sunInt) * k;
  CE.hemi += (P0.hemi - CE.hemi) * k;
  CE.n += (P0.n - CE.n) * k;
  CE.exp += (P0.exp - CE.exp) * k;
  CE.near += (P0.near - CE.near) * k;
  CE.far += (P0.far - CE.far) * k;
  CE.envKey = P0.envKey;
  if (P0.table) { if (!CE.table) CE.table = P0.table.clone(); else CE.table.lerp(P0.table, k); }
  else if (CE.table) { CE.table.lerp(dayNight.tableBase, k); if (CE.table.distanceTo(dayNight.tableBase) < 0.01) CE.table = null; }
  dayNight.sun.position.lerp(P0.pos, k);
  envApply(CE.sky, CE.sun, CE.sunInt, CE.hemi, CE.n, { exp: CE.exp, envKey: CE.envKey, near: CE.near, far: CE.far, table: CE.table });
  if (window.__cine && cineLutGate(CE.envKey)) window.__cine.applyLut(CE.envKey);
}
function cineLutGate(key) {   /* 滚动中整点才换 LUT（CSS filter 过渡自带 1.4s 缓动） */
  const c = window.__cine; if (!c) return false;
  if (c._lutKey === key) return false; c._lutKey = key; return true;
}

/* ---------------- 岁月痕迹：墙面藤蔓 + 墙根杂草（canvas 贴图 + alphaTest 面片） ---------------- */
{
  const vineTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
    const x = cv.getContext('2d');
    x.strokeStyle = '#6a5236'; x.lineWidth = 3.2; x.lineCap = 'round';
    x.beginPath(); x.moveTo(64, 254);
    let px = 64;
    for (let i = 1; i <= 5; i++) {
      const nx = 64 + (Math.random() - 0.5) * 70;
      x.quadraticCurveTo(px + (Math.random() - 0.5) * 40, 254 - i * 45 + 20, nx, 254 - i * 45);
      px = nx;
    }
    x.stroke();
    const leafCols = ['#5e7f3a', '#7a8f35', '#a86a2c', '#8c4a26', '#4c6e33'];
    for (let i = 0; i < 90; i++) {
      const ly = 240 - Math.pow(Math.random(), 0.7) * 235;
      const lx = 64 + (Math.random() - 0.5) * (30 + (254 - ly) * 0.35);
      x.fillStyle = leafCols[Math.floor(Math.random() * leafCols.length)];
      x.beginPath(); x.ellipse(lx, ly, 3.5 + Math.random() * 4.5, 3 + Math.random() * 3.5, Math.random() * 3.14, 0, Math.PI * 2); x.fill();
    }
    return new THREE.CanvasTexture(cv);
  })();
  const vineMat = new THREE.MeshStandardMaterial({ map: vineTex, transparent: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
  const weedMat = WEED_MAT;   /* 公共杂草材质：与路边同款 */
  const putVine = (x, z, rotY, w, h) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), vineMat);
    p.position.set(x, h / 2 + 0.15, z);
    p.rotation.y = rotY;
    scene.add(p);
  };
  /* 随机散布：主楼正面 + 院墙内/外侧（北外侧贴山体跳过），避大门与彼此 */
  const VINES = [
    { x: 0, z: -6.34, rot: 0, t0: -2.1, t1: 2.1, axis: 'x' },              /* 主楼正面窄条 */
    { x: 9.62, z: 0, rot: -Math.PI / 2, t0: -8.6, t1: 7.8, axis: 'z' },    /* 东内 */
    { x: -9.62, z: 0, rot: Math.PI / 2, t0: -8.6, t1: 7.8, axis: 'z' },    /* 西内 */
    { x: 0, z: 8.22, rot: Math.PI, t0: -8.4, t1: 7.0, axis: 'x', gap: [-2.2, 2.2] },  /* 南内避门 */
    { x: 9.62, z: 0, rot: -Math.PI / 2, t0: -8.6, t1: 7.8, axis: 'z' },    /* 东内补位（同墙第二张） */
    { x: 10.3, z: 0, rot: -Math.PI / 2, t0: -9.2, t1: 8.2, axis: 'z' },    /* 东外 */
    { x: -10.3, z: 0, rot: Math.PI / 2, t0: -9.2, t1: 8.2, axis: 'z' },    /* 西外 */
    { x: 0, z: 8.92, rot: 0, t0: -9.2, t1: 8.2, axis: 'x', gap: [-2.6, 2.6] },       /* 南外避门楼 */
    { x: 10.3, z: 0, rot: Math.PI / 2, t0: -9.2, t1: 8.2, axis: 'z' },     /* 东外第二张 */
    { x: -10.3, z: 0, rot: -Math.PI / 2, t0: -9.2, t1: 8.2, axis: 'z' },   /* 西外第二张 */
  ];
  const vinePts = [];
  /* 大门保底：门两侧各 1 张（先占位，随机散布不会再靠近门 ≥2.4m） */
  putVine(-4.52, 8.6, -Math.PI / 2 + rr(-0.03, 0.03), rr(1.1, 1.4), rr(2.0, 2.5));   /* v5.22 用户令挪出洞：原贴西翼墙外侧 */
  vinePts.push([-2.7, 8.22]);
  putVine(4.52, 8.6, Math.PI / 2 + rr(-0.03, 0.03), rr(1.1, 1.4), rr(2.0, 2.5));      /* v5.22 挪贴东翼墙外侧 */
  vinePts.push([3.1, 8.92]);
  for (const f of VINES) {
    let placed = 0;
    for (let tries = 0; tries < 14 && placed < 1 + Math.floor(rand() * 2); tries++) {
      const t = rr(f.t0, f.t1);
      if (f.gap && t > f.gap[0] && t < f.gap[1]) continue;
      const vx = f.axis === 'x' ? t : f.x, vz = f.axis === 'x' ? f.z : t;
      if (vinePts.some(p => Math.hypot(p[0] - vx, p[1] - vz) < 2.4)) continue;
      vinePts.push([vx, vz]);
      putVine(vx, vz, f.rot + rr(-0.04, 0.04), rr(1.0, 1.5), rr(1.9, 2.7));
      placed++;
    }
  }
  const putWeed = (x, z, s) => {
    const g0 = new THREE.Group();
    for (let k = 0; k < 2; k++) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.55 * s, 0.55 * s), weedMat);
      q.position.y = 0.27 * s;
      q.rotation.y = k * Math.PI / 2 + rr(-0.3, 0.3);
      g0.add(q);
    }
    g0.position.set(x, 0.02, z);
    scene.add(g0);
  };
  for (let i = 0; i < 52; i++) {   /* 墙根散草：内外两侧都长（北侧外侧贴山跳过） */
    const side = Math.floor(rand() * 6);
    const t = rr(-9.4, 9.4);
    if (side === 0 && !(Math.abs(t) < 1.8)) putWeed(rr(-9.3, 9.3), 8.05 + rr(0, 0.4), rr(0.7, 1.3));        /* 南内 */
    else if (side === 1) putWeed(-9.4 + rr(0, 0.35), t, rr(0.7, 1.3));                                     /* 西内 */
    else if (side === 2) putWeed(9.4 - rr(0, 0.35), t, rr(0.7, 1.3));                                      /* 东内 */
    else if (side === 3 && Math.abs(t) > 2) putWeed(t, -9.4 + rr(0, 0.35), rr(0.7, 1.3));                  /* 北内 */
    else if (side === 4 && Math.abs(t) > 2.6) putWeed(t, 9.05 + rr(0, 0.5), rr(0.7, 1.4));                 /* 南外 */
    else if (side === 5) putWeed((rand() < 0.5 ? 10.45 : -10.45) + rr(-0.3, 0.3), t, rr(0.7, 1.4));         /* 东西外 */
    else putWeed(rr(-9, 9), 8.0 + rr(0, 0.4), rr(0.7, 1.3));
  }
  for (let i = 0; i < 6; i++)      /* 主楼基座沿 */
    putWeed(-2.5 + i * 1.0 + rr(-0.3, 0.3), -6.25 + rr(0, 0.2), rr(0.6, 1.1));
  for (const p of [vineMat, weedMat]) {
    if (ENV_MATS.indexOf(p) < 0) { p.envMapIntensity = 0.32; p.userData.eBase = 0.32; ENV_MATS.push(p); }
  }
}

/* ---------------- 外部模型挂点（Blender → glTF 管线） ----------------
   用法：window.__loadGLB('assets/xxx.glb', [x,y,z], scale, rotY) → Promise(物体)
   材质自动遵循场景约定：投影双向开启、envMapIntensity=eBase 并入昼夜缝隙淡出登记。 */
window.__loadGLB = function (file, pos, scale, rotY) {
  return new Promise((resolve, reject) => {
    if (!THREE.GLTFLoader) return reject(new Error('GLTFLoader 未加载'));
    const done = gltf => {
      const o = gltf.scene;
      o.position.set(pos[0], pos[1], pos[2]);
      o.rotation.y = rotY || 0;
      o.scale.setScalar(scale == null ? 1 : scale);
      o.traverse(c => {
        if (c.isMesh) {
          const bb = new THREE.Box3().setFromObject(c), sy = bb.max.y - bb.min.y;   /* v635 小于 22cm 的挂件不再进阴影通道 */
          c.castShadow = sy > 0.22; c.receiveShadow = true;
          if (c.material && c.material.envMapIntensity !== undefined) {
            c.material.envMapIntensity = 0.32;
            c.material.userData.eBase = 0.32;
            if (ENV_MATS.indexOf(c.material) < 0) ENV_MATS.push(c.material);
          }
        }
      });
      scene.add(o);
      (window.__glbs = window.__glbs || []).push(file);
      resolve(o);
    };
    if (location.protocol === 'file:') {
      /* file:// 下 fetch 被 CORS 拦死：改 script 标签注入 base64（同目录 js 不受限） */
      const sc = document.createElement('script');
      sc.src = file.replace(/\.glb$/, '.glb.b64.js');
      sc.onload = () => {
        try {
          const bin = atob((window.__GLB_B64 || {})[file]);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          new THREE.GLTFLoader().parse(u8.buffer, '', done, err => reject(err));
        } catch (e) { reject(e); }
      };
      sc.onerror = () => reject(new Error('缺少 ' + file + '.b64.js'));
      document.head.appendChild(sc);
    } else {
      new THREE.GLTFLoader().load(file + (file.indexOf('?') < 0 ? '?v560' : ''), done, undefined, err => reject(err));   /* v5.60 资产换代防旧缓存 */
    }
  });
};
/* v5.94 GLB 解析全局串行队列：并发 load 的 parse/done 同帧挤压=单帧 8s 级长任务（用户 Performance 实测 7967ms），
   排队后每帧只干一个文件，加载条推进更平滑，总时长基本不变 */
(function () {
  const f0 = window.__loadGLB;
  let tail = Promise.resolve();
  const q = function () {
    const args = Array.prototype.slice.call(arguments);   /* v5.95b 修 v594 手滑：then 回调里的 arguments 不是外层参数（file 变 undefined） */
    const run = tail.then(function () { return f0.apply(null, args); });
    tail = run.then(function () {}, function () {});
    return run;
  };
  window.__loadGLB = q;
})();

window.__pelHeadHooks = function (o, pm) {
  const hd = o.getObjectByName('GEO-head');
  if (hd && !pm.userData.head) {
    for (const kn of ['crown', 'crest0', 'crest1', 'crest2', 'billRoot', 'billHook', 'bill', 'jaw', 'pouch', 'narlL', 'narlR', 'eyeWL', 'eyeYL', 'eyeBL', 'eyeHL', 'eyeWR', 'eyeYR', 'eyeBR', 'eyeHR']) {
      const k2 = o.getObjectByName('GEO-' + kn); if (k2) hd.attach(k2);
    }
    pm.userData.head = { m: hd, b: [hd.rotation.x, hd.rotation.y, hd.rotation.z], a: 0 };
  }
  /* v5.51 用户令：喉囊替换细条下颌当"活下颌"，颜色靠近上喙 */
  if (!pm.userData.pouchJaw) {
    const jw = o.getObjectByName('GEO-jaw');
    if (jw) jw.visible = false;
    const po = o.getObjectByName('GEO-pouch');
    if (po) {   /* v5.55 的 position.copy(jw) 是画蛇添足：囊顶点自带喉部偏移，节点原点该留在原位，拷贝=偏移×2 飞天（v5.61 撤） */
      po.traverse(function (c2) {
        if (!c2.isMesh || !c2.material) return;
        const cl2 = (mm) => { const n2 = mm.clone(); n2.color.set('#d9862e'); n2.roughness = 0.5; return n2; };
        c2.material = Array.isArray(c2.material) ? c2.material.map(cl2) : cl2(c2.material);
      });
      pm.userData.pouchJaw = { m: po, hx: po.position.x, hy: po.position.y, hz: po.position.z, bx: po.rotation.x, by: po.rotation.y, bz: po.rotation.z, a: 0 };   /* v5.61 基准=囊自身入链姿态 */
    }
  }
  if (!pm.userData.tails) {
    const tls = [];
    for (const tn of ['tail', 'tail2', 'tailFe0', 'tailFe1', 'tailFe2', 'tailFe3']) {
      const t2 = o.getObjectByName('GEO-' + tn); if (t2) tls.push({ m: t2, b: [t2.rotation.x, t2.rotation.y, t2.rotation.z], a: 0 });
    }
    if (tls.length) pm.userData.tails = tls;
  }
};
/* v4.99 二层格门两扇（客房门/梯厅门）：内建块跑在 addDoorSet 定义前，微任务里补挂 */
Promise.resolve().then(function () {
  if (!window.addDoorSet2F && window.__doors) {
    const gInn = window.__shellInn || scene.children.find(function (o2) { return o2.type === 'Group' && o2.children.length > 30 && o2.position.isVector3 && Math.abs(o2.position.x) < 0.2 && o2.position.z > -7 && o2.position.z < -6; });
    if (!gInn) return;
    const Mfd = {
      plank: mat('#8a6a42', { roughness: 0.82 }), beam: mat('#3c2c1c', { roughness: 0.85 }),
      lattice: mat('#e8d9b0', { roughness: 0.9, transparent: true, opacity: 0.5 }),
      iron: mat('#2a2d31', { roughness: 0.55, metalness: 0.5 }),
    };
    function door2F(name, px, pz, along, pw) {
      const grp = new THREE.Group(); grp.position.set(px, 4.84, pz); gInn.add(grp);
      const panels = [];
      for (const s of [-1, 1]) {
        const pg = new THREE.Group(); pg.position.set(along === 'z' ? s * pw / 2 : 0, 1.02, along === 'x' ? s * pw / 2 : 0);
        const pan = new THREE.Mesh(new THREE.BoxGeometry(along === 'z' ? pw / 2 - 0.01 : 0.05, 2.04, along === 'x' ? pw / 2 - 0.01 : 0.05), Mfd.plank);
        const ax2 = along === 'z' ? 'x' : 'z';
        pan.position[ax2] = -s * (pw / 4); pg.add(pan);
        for (let ly = 0; ly < 4; ly++) { const lat = new THREE.Mesh(new THREE.BoxGeometry(along === 'z' ? pw / 2 : 0.065, 0.035, along === 'x' ? pw / 2 : 0.065), Mfd.beam); lat.position[ax2] = -s * (pw / 4); lat.position.y = -0.72 + ly * 0.34; lat.position.x += along === 'x' ? 0 : 0.02; pg.add(lat); }
        for (let lx = 0; lx < 3; lx++) { const lat2 = new THREE.Mesh(new THREE.BoxGeometry(along === 'z' ? 0.035 : 0.07, 2.0, along === 'x' ? 0.035 : 0.07), Mfd.beam); lat2.position[ax2] = -s * (pw / 4 - 0.06) + (lx - 1) * 0.16 * (along === 'x' ? -s : 1) * 0; lat2.position[ax2] += (lx - 1) * (along === 'z' ? pw / 8 : 0.16) * (s > 0 ? -1 : 1) * 0; lat2.position[ax2] = -s * pw / 4 + (lx - 1) * pw / 8 * (s > 0 ? -1 : 1); lat2.position.x += along === 'x' ? 0 : 0.02; pg.add(lat2); }
        const glz = new THREE.MeshStandardMaterial({ color: '#cfe8ee', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide });
        const lg = new THREE.Mesh(new THREE.BoxGeometry(along === 'z' ? pw / 2 - 0.04 : 0.02, 1.2, along === 'x' ? pw / 2 - 0.04 : 0.02), glz);   /* v627 格心镂空改透明玻璃 */
        lg.position[ax2] = -s * (pw / 4); lg.position.x += along === 'x' ? 0 : 0.028; lg.position.y = 0.42; pg.add(lg);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 5, 10), Mfd.iron);
        ring.position[ax2] = -s * 0.1; ring.position.x += along === 'x' ? 0 : 0.03; ring.rotation.y = along === 'x' ? 0 : Math.PI / 2; pg.add(ring);
        grp.add(pg); panels.push({ pg, s });
      }
      window.__doors.push({ name, cur: 0, target: 0, x: px, z: pz - 6.62, hinges: panels.map(function (p2) { return { hinge: p2.pg, s: -p2.s }; }) });   /* v5.33 补 x/z：缺坐标 F 键距离 NaN 永不触发（用户图4'没法用F打开'根因） */
    }
    door2F('二层客房门', -0.55, -4.97, 'z', 1.6);
    /* v633 旧双层阳台门拆除：与新四扇格子门重叠（俯视图'旧门还在'），F 触发同名自动归新门 */
    window.addDoorSet2F = 1;
  }
});
/* 门前石狮成对（Blender metaball+烘焙管线, 3.7MB GLB 内含左右两只 @x±1.35） */
(function () {
  const pel = window.__pelMesh; const PEL = window.__pel;
  if (!pel || !PEL) return;
  window.__loadGLB('assets/pelican.glb', [0, -400, 0], 1, 0).then(function (o) {
    scene.remove(o);
    for (const c2 of pel.children.slice()) pel.remove(c2);
    o.position.set(0, 0, 0); o.scale.setScalar(0.75); o.traverse(function (c2) { if (c2.isMesh) c2.frustumCulled = false; });
    pel.add(o);
    const wl = o.getObjectByName('WingL'); const wr = o.getObjectByName('WingR');
    const lg = []; const lL = o.getObjectByName('GEO-legL'); const lR = o.getObjectByName('GEO-legR');
    if (lL && lR) { lg.push({ m: lL, s: 1, bz: lL.rotation.z }); lg.push({ m: lR, s: -1, bz: lR.rotation.z }); }   /* v4.95d 步态改绕 z（前后平面），x 轴在模型上是左右劈叉 */
    if (lg.length === 2) pel.userData.legs = lg;
    const fts = []; o.traverse(function (c2) { if (c2.isMesh && /^GEO-(foot|toe)/.test(c2.name)) fts.push(c2); });
    if (fts.length) pel.userData.feet = fts;
    for (const [leg, tag] of [[lL, 'L'], [lR, 'R']]) {
      if (!leg) continue;
      const re2 = new RegExp('^GEO-(foot|toe)' + tag);   /* v4.96b 趾骨名以数字结尾，旧 slice(-1) 全漏；改前缀匹配 footL/toeL0-2 */
      const fs2 = fts.filter(function (c2) { return re2.test(c2.name); });
      for (const c2 of fs2) leg.attach(c2);
    }
    window.__pelHeadHooks(o, pel);

    const ws2 = [];
    if (wl) ws2.push({ g: wl, s: 1, bx: wl.rotation.x });
    if (wr) ws2.push({ g: wr, s: -1, bx: wr.rotation.x });
    if (ws2.length === 2) { pel.userData.wings = ws2; PEL.glbWing = true; }
  }).catch(function () {});
})();
/* ---------------- v5.03 高精度猫 ×5（Blender GLB，五色换装，随机分布） ---------------- */
{
  animals.filter(function (a2x) { return a2x.kind === 'chicken' && !a2x.tick; }).forEach(function (ak) {
    const home = ak.obj.position.clone();
    const st = { mode: 0, ft: 0, dx: 1, dz: 0, wt: 1 + Math.random() * 3, tx: home.x, tz: home.z, ph: Math.random() * 6.28 };
    const gy = (xx, zz) => (window.__groundAt ? window.__groundAt(xx, zz, 0.5) : 0.06);
    ak.scare = function (sx, sz) {
      const P = ak.obj.position; const ddx = P.x - sx, ddz = P.z - sz; const dd = Math.hypot(ddx, ddz);
      if (dd < 2.0 && st.mode !== 1) { st.mode = 1; st.ft = 0.9 + Math.random() * 0.8; st.dx = ddx / (dd || 1); st.dz = ddz / (dd || 1); }
    };
    ak.tick = function (dt2, t2) {
      const P = ak.obj.position;
      if (st.mode === 1) {
        st.ft -= dt2;
        P.x += st.dx * 2.6 * dt2; P.z += st.dz * 2.6 * dt2;
        ak.obj.rotation.y = Math.atan2(-st.dz, st.dx);
        ak.obj.rotation.x = Math.abs(Math.sin(t2 * 16 + st.ph)) * 0.5;
        ak.obj.rotation.z = Math.sin(t2 * 20) * 0.2;
        P.y = gy(P.x, P.z);
        if (st.ft <= 0) { st.mode = 2; }
        return;
      }
      ak.obj.rotation.z *= 0.9;
      if (st.mode === 2) {
        const hx = home.x - P.x, hz = home.z - P.z; const hd = Math.hypot(hx, hz);
        if (hd < 0.12) { st.mode = 0; st.wt = 1.5 + Math.random() * 3; ak.obj.rotation.x = Math.max(0, Math.sin(t2 * 3 + st.ph)) * 0.45; return; }
        st.dx = hx / hd; st.dz = hz / hd;
        P.x += st.dx * 0.5 * dt2; P.z += st.dz * 0.5 * dt2;
        ak.obj.rotation.y = Math.atan2(-st.dz, st.dx);
        ak.obj.rotation.x = 0; P.y = gy(P.x, P.z);
        return;
      }
      st.wt -= dt2;
      if (st.mode === 3) {
        const wx = st.tx - P.x, wz = st.tz - P.z; const wd = Math.hypot(wx, wz);
        if (wd < 0.08) { st.mode = 0; st.wt = 2 + Math.random() * 4; return; }
        st.dx = wx / wd; st.dz = wz / wd;
        P.x += st.dx * 0.14 * dt2; P.z += st.dz * 0.14 * dt2;
        ak.obj.rotation.y = Math.atan2(-st.dz, st.dx);
        ak.obj.rotation.x = 0; P.y = gy(P.x, P.z);
      } else {
        ak.obj.rotation.x = Math.max(0, Math.sin(t2 * 3 + st.ph)) * 0.45;
        if (st.wt <= 0) { const ang = Math.random() * 6.28, rr = 0.6 + Math.random() * 1.3;
          st.tx = Math.max(-4.6, Math.min(4.6, home.x + Math.cos(ang) * rr));
          st.tz = home.z + Math.sin(ang) * rr;
          if (Math.abs(st.tx) < 2.0 && st.tz > -4.6 && st.tz < 8.6) st.tz += 2.4;
          st.mode = 3; }
      }
    };
  });
  const SKINS = {
    '橘猫':   { furMain: '#d98e42', furDark: '#a8621e', patchA: '#c67c30', patchB: '#a55f1e', belly: '#f2dfc0', eyeIris: '#e8c84a', earIn: '#e0a090', paw: '#e8b890' },
    '白猫':   { furMain: '#eae4d8', furDark: '#d8d0c0', patchA: '#eae4d8', patchB: '#ded6c6', belly: '#f5f0e6', eyeIris: '#6fb8cc', earIn: '#e8b0a8', paw: '#ecc8c0' },
    '黑猫':   { furMain: '#2b2724', furDark: '#1a1714', patchA: '#2b2724', patchB: '#211d1a', belly: '#3a352f', eyeIris: '#d8b84a', earIn: '#5a4038', paw: '#4a3a34' },
    '灰纹猫': { furMain: '#949aa2', furDark: '#61666e', patchA: '#868c94', patchB: '#5f656d', belly: '#c8ccd0', eyeIris: '#4ac0a0', earIn: '#c09a94', paw: '#b0aca8' },
    '奶牛猫': { furMain: '#e8e2d4', furDark: '#d8d2c4', patchA: '#cf7f36', patchB: '#33302c', belly: '#f2ede0', eyeIris: '#e0b84a', earIn: '#e0a8a0', paw: '#c8b8ac' }
  };
  const SLOT2 = { furMain: 'furMain', furDark: 'furDark', patchA: 'patchA', patchB: 'patchB', belly: 'belly', eyeIris: 'eyeIris', earIn: 'earIn', paw: 'paw', pupil: 'pupil', nose: 'nose', whisk: 'whisk' };
  const POOL = [   /* 猫位候选：院子2个保底 + 全场随机池 */
    { x: 1.7, z: -3.1, rY: 2.4 },        /* 主楼阶前日台（东南晒点，避台阶实体） */
    { x: -2.9, z: 0.9, rY: 2.1 },        /* 西厢南墙根 */
    { x: 1.2, z: 6.4, rY: -0.8 },        /* 大门内甬道 */
    { x: -4.2, z: -2.0, rY: 1.2 },       /* 水池西沿 */
    { x: 3.8, z: 3.4, rY: 3.6 },         /* 东厢前草坡 */
    { x: -1.4, z: 10.6, rY: 0.2 },       /* 门外官道 */
    { x: 5.9, z: 8.9, rY: -2.2 },        /* 照壁东 */
    { x: -6.2, z: 5.2, rY: 1.8 }         /* 前院西角 */
  ];
  const pick = [POOL[0], POOL[1]];
  const rest = POOL.slice(2).sort(() => Math.random() - 0.5).slice(0, 3);
  pick.push.apply(pick, rest);
  const skins = Object.keys(SKINS).sort(() => Math.random() - 0.5);
  window.__loadGLB('assets/cat.glb', [0, -400, 0], 1, 0).then(function (proto) {
    proto.visible = false;
    const baseMats = {};
    proto.traverse(c => { if (c.isMesh) c.material.forEach ? c.material.forEach(mm => { baseMats[mm.name] = mm; }) : (baseMats[c.material.name] = c.material); });
    pick.forEach((spot, ci) => {
      const skinName = skins[ci % skins.length];
      const sk = SKINS[skinName];
      const root = proto.clone(true);
      root.traverse(c => {
        if (c.isMesh && c.material) {
          const arr = c.material.forEach ? c.material : [c.material];
          const mapped = arr.map(mm => {
            const nm = (mm.name || '').replace(/_\d+$/, '');
            const rep = { furMain: sk.furMain, furDark: sk.furDark, patchA: sk.patchA, patchB: sk.patchB, belly: sk.belly, eyeIris: sk.eyeIris, earIn: sk.earIn, paw: sk.paw };
            if (rep[nm] === undefined) return mm;
            const m2 = mm.clone(); m2.color.set(rep[nm]); return m2;
          });
          c.material = c.material.forEach ? mapped : mapped[0];
        }
      });
      root.scale.setScalar(0.42);
      root.position.set(spot.x, 0, spot.z);
      root.rotation.y = spot.rY;
      root.visible = true;
      scene.add(root);
      const gy = window.__groundAt ? window.__groundAt(spot.x, spot.z, 0.5) : 0.06;
      const tail = root.getObjectByName('CAT-tail');
      const head = root.getObjectByName('CAT-head');
      const earL = root.getObjectByName('CAT-earL');
      const earR = root.getObjectByName('CAT-earR');
      const lidL = root.getObjectByName('CAT-lidL');
      const lidR = root.getObjectByName('CAT-lidR');
      const st = { ph: Math.random() * 6.28, mode: 0, tm: 2 + Math.random() * 4, look: 0, blink: 0, bt: 1 + Math.random() * 3, twitch: 0, tt: 2 + Math.random() * 5, gy, chase: null, ct: 0 };
      root.position.y = gy;
      animals.push({ kind: 'cat', obj: root, tail: tail, tick(dt2, t2) {
        st.tm -= dt2;
        if (st.mode === 2 && st.chase) {   /* v5.04 追鸡：冲刺盯咬，鸡逃我就追，腻了回位 */
          const ck = st.chase; const CP = ck.obj.position;
          const ddx = CP.x - root.position.x, ddz = CP.z - root.position.z; const dd = Math.hypot(ddx, ddz);
          st.ct -= dt2;
          if (dd < 0.38 || st.ct <= 0 || dd > 8) { st.mode = 0; st.tm = 2.5 + Math.random() * 4; st.chase = null; }
          else {
            const bob = Math.abs(Math.sin(t2 * 9 + st.ph)) * 0.012;
            root.position.x += (ddx / dd) * 1.5 * dt2; root.position.z += (ddz / dd) * 1.5 * dt2;
            root.position.y = st.gy + bob; st.gy = window.__groundAt ? window.__groundAt(root.position.x, root.position.z, 0.5) : 0.06;
            let wy = Math.atan2(-ddz, ddx) - root.rotation.y; while (wy > Math.PI) wy -= 6.28318; while (wy < -Math.PI) wy += 6.28318;
            root.rotation.y += wy * Math.min(1, dt2 * 9);
            if (ck.scare) ck.scare(root.position.x, root.position.z);
            if (head) { head.rotation.y *= 0.7; head.rotation.z = Math.sin(t2 * 9) * 0.04; }
            if (tail) { tail.rotation.x = -0.25; tail.rotation.y = Math.sin(t2 * 12 + st.ph) * 0.35; }
            return;
          }
        }
        if (st.tm <= 0) {
          if (!st.mode && Math.random() < 0.5) {   /* 起手追鸡：找最近可追的鸡 */
            let best = null, bd = 7;
            animals.forEach(function (ac) { if (ac.kind === 'chicken') { const dd2 = Math.hypot(ac.obj.position.x - root.position.x, ac.obj.position.z - root.position.z); if (dd2 < bd) { bd = dd2; best = ac; } } });
            if (best) { st.chase = best; st.mode = 2; st.ct = 2.5 + Math.random() * 3.5; }
          }
          if (!st.mode) { st.mode = 1; st.tm = 2.2 + Math.random() * 3; st.look = (Math.random() - 0.5) * 1.4; }
          else { st.mode = 0; st.tm = 3 + Math.random() * 5; }
          if (tail) tail.rotation.x = 0;
        }
        if (head) { head.rotation.y += (st.mode ? st.look : Math.sin(t2 * 0.5 + st.ph) * 0.28 - head.rotation.y) * Math.min(1, dt2 * 2); head.rotation.z = Math.sin(t2 * 0.8 + st.ph) * 0.05; }
        if (tail) tail.rotation.y = Math.sin(t2 * (st.mode ? 3.2 : 1.1) + st.ph) * (st.mode ? 0.4 : 0.22);
        st.tt -= dt2;
        if (st.tt <= 0) { st.twitch = 0.5; st.tt = 2.5 + Math.random() * 6; }
        if (st.twitch > 0) { st.twitch -= dt2; const tw = Math.sin(st.twitch * 42) * st.twitch * 0.5; if (earL) earL.rotation.x = -0.2 + tw; if (earR) earR.rotation.x = 0.2 - tw * 0.7; }
        st.bt -= dt2;
        if (st.bt <= 0) { st.blink = st.blink > 0 ? -1 : 1; st.bt = st.blink > 0 ? 0.16 : 1.6 + Math.random() * 4; }
        const lv = st.blink > 0 ? 1 : 0;
        if (lidL) { lidL.position.y += ((lv ? -0.014 : 0.018) - (lidL.position.y - 0.738)) * Math.min(1, dt2 * 14); if (lidR) lidR.position.y = lidL.position.y; }
        root.position.y = st.gy + Math.sin(t2 * 2.2 + st.ph) * 0.004;   /* 呼吸 */
      } });
    });
    dsh_log_cats = pick.length;
  }).catch(() => {});
  let dsh_log_cats = 0;
  window.__catCount = () => dsh_log_cats;
}
window.__loadGLB('assets/shishi.glb', [0, 0, 10.25], 1.15, Math.PI)
  .then(() => console.info('[沙盘] 石狮已就位'))
  .catch(() => console.warn('[沙盘] 石狮 GLB 加载失败'));

/* 挽马 GLB（方正低模）：就绪后新车自动用之；未就绪时发车门控等待 */
let horseProto = null;
window.__loadGLB('assets/horse.glb', [0, -400, 0], 1, 0)
  .then(o => {
    horseProto = o;
    if (window.__stableReq) {
      const c = o.clone(); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0);
      let tg = null; c.traverse(n0 => { if (!tg && n0.name === 'tailG') tg = n0; });
      skinHorse(c);
      window.__stableReq.slot.add(c);
      if (tg) window.__stableReq.entry.tail = tg;
      console.log('[沙盘] 马房寄养就位');
    }
  })
  .catch(() => { horseProto = false; console.warn('[沙盘] 马 GLB 加载失败，用盒装马'); });

/* ---------------- 院角花坛 + 高精度竹丛（GLB，精模 3.8k 三角） ---------------- */
const bambooFx = [];
window.bambooFx = bambooFx;
{
  const mkBed = (bx, bz) => {                       /* 正方形小角花坛：贴院墙内角，避檐避物 */
    const g = new THREE.Group();
    const S = 1.7;
    for (const [dx, dz, w, d] of [[0, S / 2 - 0.06, S, 0.12], [0, -S / 2 + 0.06, S, 0.12],
                                  [S / 2 - 0.06, 0, 0.12, S - 0.24], [-S / 2 + 0.06, 0, 0.12, S - 0.24]]) {
      const curb = box(w, 0.22, d, mat('#d9d2c0')); curb.position.set(dx, 0.11, dz);
      curb.castShadow = curb.receiveShadow = true; g.add(curb);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 0.28, 8), mat('#cfc7b2'));
      p.position.set(sx * (S / 2 - 0.06), 0.14, sz * (S / 2 - 0.06)); p.castShadow = true; g.add(p);
    }
    const soil = box(S - 0.24, 0.16, S - 0.24, mat('#4a3826')); soil.position.y = 0.09; soil.receiveShadow = true; g.add(soil);
    const fc = ['#d16a8a', '#e0b64a', '#c9563f', '#b06ab3', '#dd8330'];
    for (const [ox, oz, si] of [[0, 0.56, 0], [0.56, 0, 1], [0, -0.56, 2], [-0.56, 0, 3], [0.48, 0.48, 4], [-0.48, 0.48, 0], [0.48, -0.48, 1], [-0.48, -0.48, 2]]) {
      const st2 = cyl(0.007, 0.007, 0.1, 4, mat('#5f8344')); st2.position.set(ox, 0.22, oz); g.add(st2);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), mat(fc[si]));
      f.scale.y = 0.65; f.position.set(ox, 0.28, oz); g.add(f);
    }
    g.position.set(bx, 0, bz);
    scene.add(g);
  };
  mkBed(-8.72, 7.32); mkBed(8.72, 7.32);   /* 前院西南/东南墙角：井/池/甬道/屋檐全避开 */
/* ---------------- v4.82b 地被花草·全场自然生境分布 ---------------- */
{
  const dRV = (x, z) => { let bd = 1e9; for (let i = 0; i < 240; i += 2) { const q = riverCurve.getPointAt(i / 240); const d = Math.hypot(q.x - x, q.z - z); if (d < bd) bd = d; } return bd; };
  const dRD = (x, z) => { let bd = 1e9; for (let i = 0; i < roadPts.length; i += 2) { const d = Math.hypot(roadPts[i].x - x, roadPts[i].z - z); if (d < bd) bd = d; } return bd; };
  const inRect = (x, z, x0, x1, z0, z1) => x > x0 && x < x1 && z > z0 && z < z1;
  function ok(x, z, hard) {
    if (Math.hypot(x, z) > BASE_R - 0.9) return false;
    if (z < -2.4 && !hard) return false;                       /* 山体的坡面留白 */
    if (dRV(x, z) < 4.0) return false;                          /* 水里 */
    if (dRD(x, z) < 2.12) return false;                         /* 路上 */
    if (Math.abs(x) < 8 && z > -12.9 && z < -5.1) return false; /* 主殿台基 */
    if (Math.hypot(x - 7, z - 5.4) < 2.3) return false;         /* 水井 */
    if (Math.hypot(x + 6.6, z - 3) < 3.0) return false;         /* 鱼塘 */
    if (Math.abs(x) < 3.3 && z > -6.2 && z < 11.8) return false;/* 御道+门前场 */
    if (inRect(x, z, 11.0, 15.0, 6.6, 11.0)) return false;      /* 马房 */
    if (inRect(x, z, 3.2, 9.8, 22.2, 24.2)) return false;       /* 码头平台 */
    if (Math.abs(x) < 1.9 && Math.abs(z - rzAtG(0)) < 6.7) return false;  /* 大桥踏步带 */
    if (Math.hypot(x + 17.96, z - 9.63) < 2.7) return false;    /* 溪桥 */
    if (Math.hypot(x - 11.3, z - 9.7) < 1.1) return false;      /* 驿旗 */
    return true;
  }
  function patchPos() {
    const r = Math.random();
    let x, z;
    if (r < 0.30) {                                            /* 河岸草甸带 */
      x = -28 + Math.random() * 56;
      const side = Math.random() < 0.5 ? -1 : 1;
      z = rzAtG(x) + side * (4.05 + Math.random() * 1.6);
    } else if (r < 0.52) {                                     /* 路肩花带 */
      const p = roadPts[Math.floor(Math.random() * roadPts.length)];
      const p2 = roadPts[Math.min(roadPts.length - 1, Math.floor(Math.random() * roadPts.length) + 2)];
      let nx = -(p2.z - p.z), nz = p2.x - p.x; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = 2.2 + Math.random() * 1.1;
      x = p.x + nx * off * side; z = p.z + nz * off * side;
    } else if (r < 0.86) {                                     /* 开阔草甸（全盘子） */
      const a = Math.random() * 6.283, rr2 = 4 + Math.random() * (BASE_R - 5.2);
      x = Math.cos(a) * rr2; z = Math.sin(a) * rr2;
      if (dRV(x, z) < 5.6 || dRD(x, z) < 3.5) return null;
    } else if (r < 0.94) {                                     /* 院内墙根 */
      const sx = Math.random() < 0.5 ? -1 : 1;
      x = sx * (2.0 + Math.random() * 7.4);
      z = Math.random() < 0.5 ? -5.0 + Math.random() * 2.2 : 6.3 + Math.random() * 1.7;
    } else {                                                   /* 山脚过渡带 */
      x = -24 + Math.random() * 48; z = -3.9 + Math.random() * 1.5;
    }
    return ok(x, z) ? [x, z] : null;
  }
  const FL = ['tuft', 'flower_red', 'flower_yellow', 'flower_blue'];
  const loaded = {};
  let placed = false;
  function tryPlace() {
    if (placed || treeFx.length < 140 || Object.keys(loaded).length < 4) return false;
    placed = true;
    const trunks = treeFx.map(g => { const w = g.getWorldPosition(new THREE.Vector3()); return [w.x, w.z]; });
    let cnt = 0, patches = 0, guard = 0;
    const plans = [];   /* v5.60 收集布点，最后 InstancedMesh 合批（940 draw call → 4） */
    while (patches < 205 && guard++ < 2600) {
      const c = patchPos();
      if (!c) continue;
      let nearTrunk = false;
      for (const t of trunks) if (Math.hypot(t[0] - c[0], t[1] - c[1]) < 1.05) { nearTrunk = true; break; }
      if (nearTrunk) continue;
      patches++;
      const accent = Math.random() < 0.52 ? null : FL[1 + Math.floor(Math.random() * 3)];
      const n = 3 + Math.floor(Math.random() * (accent ? 5 : 4));
      for (let i = 0; i < n; i++) {
        const kind = !accent ? 'tuft' : Math.random() < 0.42 ? 'tuft' : accent;
        const px = c[0] + (Math.random() - 0.5) * (0.5 + Math.random() * 0.7);
        const pz = c[1] + (Math.random() - 0.5) * (0.5 + Math.random() * 0.7);
        if (!ok(px, pz, true) || dRV(px, pz) < 3.95 || dRD(px, pz) < 2.05) continue;
        plans.push({ kind, px, pz, rx: (Math.random() - 0.5) * 0.07, ry: Math.random() * 6.283, rz: (Math.random() - 0.5) * 0.07, sc: kind === 'tuft' ? 0.5 + Math.random() * 0.45 : 0.7 + Math.random() * 0.55 });
      }
    }
    {
      const e4 = new THREE.Euler(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4v = new THREE.Vector3(), m4 = new THREE.Matrix4();
      for (const kd2 of FL) {
        const arr = plans.filter(p2 => p2.kind === kd2);
        const proto = loaded[kd2];
        if (!arr.length || !proto) continue;
        let src = null; proto.traverse(o => { if (!src && o.isMesh) src = o; });
        if (!src) continue;
        const mat2 = src.material.clone();
        mat2.userData.uT = { value: 0 };
        mat2.onBeforeCompile = function (sh) {
          sh.uniforms.uT = mat2.userData.uT;
          sh.vertexShader = 'uniform float uT;\nattribute float aPh;\n' + sh.vertexShader.replace('#include <begin_vertex>',
            "#include <begin_vertex>\nfloat yy2 = max(transformed.y, 0.0);\ntransformed.x += sin(uT * 1.9 + aPh + transformed.y * 2.2) * 0.055 * yy2;\ntransformed.z += cos(uT * 1.4 + aPh * 1.7) * 0.04 * yy2;");
        };
        const im2 = new THREE.InstancedMesh(src.geometry, mat2, arr.length);
        const phA = new Float32Array(arr.length);
        for (let i2 = 0; i2 < arr.length; i2++) {
          const p2 = arr[i2];
          e4.set(p2.rx, p2.ry, p2.rz); q4.setFromEuler(e4);
          p4v.set(p2.px, 0, p2.pz); s4.set(p2.sc, p2.sc, p2.sc);
          m4.compose(p4v, q4, s4);
          im2.setMatrixAt(i2, m4);
          phA[i2] = Math.random() * 6.283;
        }
        im2.geometry = im2.geometry.clone();   /* 不污染 proto 共享几何 */
        im2.geometry.setAttribute('aPh', new THREE.InstancedBufferAttribute(phA, 1));
        im2.instanceMatrix.needsUpdate = true;
        im2.castShadow = false; im2.receiveShadow = false; im2.frustumCulled = false;
        scene.add(im2);
        (window.__grassU = window.__grassU || []).push(mat2);
        cnt += arr.length;
      }
      if (!window.__grassTicker) {
        window.__grassTicker = 1;
        setInterval(function () { const t2 = performance.now() / 1000; for (const m2 of (window.__grassU || [])) if (m2.userData.uT) m2.userData.uT.value = t2; }, 50);
      }
    }
    window.__groundDone = 1;
    console.log('[沙盘] 地被花草 ' + patches + ' 簇 ' + cnt + ' 株（InstancedMesh 合批 ×' + FL.length + '）');
    return true;
  }
  FL.forEach(f => window.__loadGLB('assets/' + f + '.glb', [0, -500, 0], 1, 0).then(o => {
    loaded[f] = o; tryPlace();
  }));
  { const iv = setInterval(() => { if (tryPlace()) clearInterval(iv); }, 900); }
}
/* ---------------- v4.84 水际生态带：杂草+阔叶芽+香蒲（戳出水面感） ---------------- */
{
  const wm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  wm.envMapIntensity = 0.32; wm.userData.eBase = 0.32; ENV_MATS.push(wm);
  const PALETTE = [[0.46, 0.45, 0.27], [0.56, 0.50, 0.32], [0.32, 0.48, 0.19], [0.26, 0.40, 0.16], [0.40, 0.52, 0.22], [0.50, 0.52, 0.30]];
  function clumpMesh(towardZ) {
    const pos = [], col = [], idx = [];
    let n = 0;
    function tri(a1, b1, c1, ca, cb, cc) {
      pos.push(a1[0], a1[1], a1[2], b1[0], b1[1], b1[2], c1[0], c1[1], c1[2]);
      col.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
      idx.push(n, n + 1, n + 2); n += 3;
    }
    function blade(dx, dz, h, w, lean, curl, c) {
      const sx = -dz, sz = dx;
      const pts = [];
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        pts.push([dx * lean * h * t, h * t - curl * h * t * t * 0.55, dz * lean * h * t]);
      }
      for (let i = 0; i < 4; i++) {
        const t0 = i / 4, t1 = (i + 1) / 4;
        const w0 = w * (1 - t0 * 0.9), w1 = w * (1 - t1 * 0.9);
        const a1 = [pts[i][0] + sx * w0, pts[i][1], pts[i][2] + sz * w0];
        const b1 = [pts[i][0] - sx * w0, pts[i][1], pts[i][2] - sz * w0];
        const c1 = [pts[i + 1][0] - sx * w1, pts[i + 1][1], pts[i + 1][2] - sz * w1];
        const d1 = [pts[i + 1][0] + sx * w1, pts[i + 1][1], pts[i + 1][2] + sz * w1];
        const g0 = 0.55 + 0.45 * t0, g1 = 0.55 + 0.45 * t1;
        tri(a1, b1, c1, [c[0] * g0, c[1] * g0, c[2] * g0], [c[0] * g0, c[1] * g0, c[2] * g0], [c[0] * g1, c[1] * g1, c[2] * g1]);
        tri(a1, c1, d1, [c[0] * g0, c[1] * g0, c[2] * g0], [c[0] * g1, c[1] * g1, c[2] * g1], [c[0] * g1, c[1] * g1, c[2] * g1]);
      }
    }
    function leafBlade(dx, dz, h, c) { blade(dx, dz, h, h * 0.16, 0.55, 0.5, c); }
    const nb = 9 + Math.floor(Math.random() * 8);
    for (let i = 0; i < nb; i++) {
      const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const aa = Math.random() * 6.283;
      let dx = Math.cos(aa), dz = Math.sin(aa);
      if (Math.random() < 0.5) { dz = dz * 0.5 + 0.85 * towardZ; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
      blade(dx, dz, 0.26 + Math.random() * 0.36, 0.011 + Math.random() * 0.008,
            Math.random() * 0.3 + (Math.random() < 0.4 ? 0.45 : 0), 0.3 + Math.random() * 0.6, c);
    }
    if (Math.random() < 0.4) {
      const nl = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < nl; i++) {
        const aa = i / nl * 6.283 + Math.random() * 0.5;
        leafBlade(Math.cos(aa), Math.sin(aa), 0.14 + Math.random() * 0.12, [0.28, 0.50, 0.20]);
      }
    }
    if (Math.random() < 0.14) {
      const nc = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < nc; i++) {
        const ox = (Math.random() - 0.5) * 0.14, oz = (Math.random() - 0.5) * 0.14;
        const H = 0.55 + Math.random() * 0.28;
        blade(0.06, 0.03, H, 0.009, 0.12, 0.15, [0.34, 0.44, 0.18]);
        const bx = ox, bz = oz, by = H * 0.86;
        const bw = 0.018, bh = 0.11;
        const br = [0.36, 0.24, 0.11], br2 = [0.28, 0.18, 0.09];
        pos.push(bx - bw, by, bz, bx + bw, by, bz, bx + bw, by + bh, bz, bx - bw, by, bz, bx + bw, by + bh, bz, bx - bw, by + bh, bz);
        for (let q = 0; q < 3; q++) col.push(br[0], br[1], br[2]);
        for (let q = 0; q < 3; q++) col.push(br2[0], br2[1], br2[2]);
        idx.push(n, n + 1, n + 2, n + 3, n + 4, n + 5); n += 6;
        pos.push(bx, by, bz - bw, bx, by, bz + bw, bx, by + bh, bz + bw, bx, by, bz - bw, bx, by + bh, bz + bw, bx, by + bh, bz - bw);
        for (let q = 0; q < 3; q++) col.push(br[0], br[1], br[2]);
        for (let q = 0; q < 3; q++) col.push(br2[0], br2[1], br2[2]);
        idx.push(n, n + 1, n + 2, n + 3, n + 4, n + 5); n += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, wm);
    m.castShadow = false; m.receiveShadow = false;
    return m;
  }
  let wn = 0;
  /* 连续弧长铺带：沿河线每 1.1m 一处，两侧各随机 0~2 丛，桥/码头避让——把水线织成草带 */
  const N = 150;
  for (let i = 0; i < N; i++) {
    const q = riverCurve.getPointAt(Math.min(1, (i + 0.5) / N));
    const tg = riverCurve.getTangentAt(Math.min(1, (i + 0.5) / N));
    let nx = -tg.z, nz = tg.x; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    for (const side of [-1, 1]) {
      const cnt = Math.random() < 0.5 ? 2 : 1;   /* 水线不断：每点至少 1 丛 */
      for (let k = 0; k < cnt; k++) {
        const off = 3.9 + Math.random() * 0.75 + k * 0.5;
        const along = (Math.random() - 0.5) * 1.1;
        const x = q.x + nx * off * side + tg.x * along;
        const z = q.z + nz * off * side + tg.z * along;
        if (Math.hypot(x, z) > 28.7) continue;
        if (Math.abs(x) < 5.6) continue;                       /* 大桥视野 */
        if (side > 0 && x > 3 && x < 10.2) continue;           /* 码头 */
        if (Math.hypot(x + 17.96, z - 9.63) < 2.5) continue;   /* 溪桥 */
        const g = new THREE.Group();
        g.add(clumpMesh(-side));
        g.position.set(x, 0, z);
        g.rotation.y = Math.random() * 6.283;
        g.scale.setScalar(0.8 + Math.random() * 0.65);
        scene.add(g); reedFx.push({ g, ph: Math.random() * 6.28 }); wn++;
      }
    }
  }
  console.log('[沙盘] 水际杂草生态带 ' + wn + ' 丛（含香蒲/阔叶芽·连续草带）');
}
  window.__bambooSpots = [
    [-8.72, 7.32, 1.6], [-8.2, 6.95, 0.75], [-9.1, 6.8, 0.5], [-8.15, 7.7, 0.45], [-9.15, 7.6, 0.95],
    [8.72, 7.32, 1.6], [8.2, 6.95, 0.75], [9.1, 6.8, 0.5], [8.15, 7.7, 0.45], [9.15, 7.6, 0.95],
  ];
}
window.__loadGLB('assets/bamboo.glb', [0, -400, 0], 1, 0)
  .then(o => {
    for (const [bx, bz, sc] of window.__bambooSpots) {
      const c = o.clone();
      c.position.set(bx, 0.19, bz); c.rotation.set(0, Math.random() * 6.28, 0);
      c.scale.setScalar(sc);
      scene.add(c);
      bambooFx.push({ g: c, ph: Math.random() * 6.28, s: sc });
    }
    for (const [bx, bz, sc] of [[21.2, 5.8, 1.3], [17.5, 6.0, 0.95], [-12.8, 5.2, 1.15], [-20.5, 4.8, 0.8], [-11.5, 8.0, 0.95], [8.2, 15.5, 1.0], [10.6, 7.4, 0.85], [-8.2, 15.5, 0.9], [10.2, 25.5, 1.1], [-6.2, 25.8, 0.9]]) {
      const c = o.clone();
      c.position.set(bx, 0.05, bz); c.rotation.set(0, Math.random() * 6.28, 0);
      c.scale.setScalar(sc);
      scene.add(c);
      bambooFx.push({ g: c, ph: Math.random() * 6.28, s: sc });
    }
    console.log('[沙盘] 竹增密完成（共 14 丛·精模）');
  })
  .catch(() => console.warn('[沙盘] 竹 GLB 加载失败'));
/* ---------------- v4.79 双层画舫：0.75 缩比（总高 2.24 < 桥净空 2.38），码头⇄巡航 ---------------- */
window.__loadGLB('assets/paintboat.glb', [0, -500, 0], 0.72, 0).then(o => {
  o.traverse(mm => {
    if (mm.isMesh && /lantern|latn/.test(mm.name || '')) {
      mm.material = mm.material.clone();
      mm.material.emissive = new THREE.Color('#ffb45a'); mm.material.emissiveIntensity = 0.55;
      dayNight.lanternMats.push(mm.material);
    }
    if (mm.isMesh && mm.material && /pbRoof/.test(mm.material.name)) {
      const tm = tileTex.clone(); tm.needsUpdate = true; tm.wrapS = tm.wrapT = THREE.RepeatWrapping; tm.repeat.set(5, 2);
      mm.material = mm.material.clone();
      mm.material.map = tm; mm.material.color.set('#ffffff'); mm.material.needsUpdate = true;
    }
  });
  const bl = new THREE.PointLight('#ffb45a', 0, 4.2, 2); bl.position.set(2.78 * 0.72, 1.5, 0.55 * 0.72); o.add(bl);
  const bl2 = new THREE.PointLight('#ffca7a', 0, 6, 1.4); bl2.position.set(-0.95 * 0.72, 1.95, 0); o.add(bl2);
  const bl3 = new THREE.PointLight('#ffca7a', 0, 5.5, 1.4); bl3.position.set(-0.6 * 0.72, 1.0, 0); o.add(bl3);
  bl.userData.boost = 1.6; bl2.userData.boost = 2; bl3.userData.boost = 1.6;   /* v4.96c 舱内亮度倍率（envApply 每帧沿用） */
  dayNight.lanternLights.push(bl, bl2, bl3);
  {   /* v4.96c 画舫 GLB 晚于 envApply 注册：按当前夜强立即补刷，否则室内灯整夜 0 亮度 */
    const nn = (typeof CE !== 'undefined' && isFinite(CE.n)) ? CE.n : (dayNight.isNight ? 1 : 0);
    const li = 1.6 * nn + (nn > 0.4 ? 0.3 : 0);   /* 舱内多挡光，比街灯给得更足 */
    bl.intensity = li; bl2.intensity = li * 1.25; bl3.intensity = li;
    o.traverse(function (mm) { if (mm.isMesh && /lantern|latn/.test(mm.name || '')) mm.material.emissiveIntensity = 0.25 + 1.3 * nn; });
  }
  const dk = window.__dock;
  const PBW = 95;
  const pbPath = (u) => {
    u = ((u % 1) + 1) % 1;
    const sv = u * PBW;
    if (sv < 40) { const x = -20 + sv; return { x, z: rzAtG(x) + 1.9 }; }
    if (sv < 47.5) { const a2 = (sv - 40) / 7.5 * Math.PI; const cz = rzAtG(20) + 0.15; return { x: 20 + Math.sin(a2) * 1.75, z: cz + Math.cos(a2) * 1.75 }; }
    if (sv < 87.5) { const x = 20 - (sv - 47.5); return { x, z: rzAtG(x) - 1.6 }; }
    const a2 = (sv - 87.5) / 7.5 * Math.PI; const cz = rzAtG(-20) + 0.15; return { x: -20 - Math.sin(a2) * 1.75, z: cz - Math.cos(a2) * 1.75 };
  };
  const pb = {
    g: o, u: 26.05 / PBW, dir: 1, hold: 6, docked: true, uDock: 26.05 / PBW, dockCool: 0, ph: 0,
    get x() { return pbPath(this.u).x; },
    tick(dt2, t2) {
      this.dockCool = Math.max(0, this.dockCool - dt2);
      if (this.hold > 0) {
        this.hold -= dt2;
        if (this.hold <= 0) { this.docked = false; if (Math.random() < 0.5) this.dir = -this.dir; this.dockCool = 45; }
      } else {
        let sp = 0.85;
        const p = pbPath(this.u);
        if (Math.abs(p.x) < 5.6) sp *= 0.55;
        {   /* 前向走廊：乌篷挡道则停等，>9s 蠕行脱困 */
          const a2 = pbPath(this.u + this.dir * 0.004);
          let fx = a2.x - p.x, fz = a2.z - p.z;
          const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
          let blocked = false;
          for (const w of (window.__wuNav || [])) {
            const dx0 = w.g.position.x - p.x, dz0 = w.g.position.z - p.z;
            const proj = dx0 * fx + dz0 * fz;
            if (proj > 0.4 && proj < 2.6 && Math.abs(dx0 * fz - dz0 * fx) < 0.9) { blocked = true; break; }
          }
          if (blocked) {
            this.blockT = (this.blockT || 0) + dt2;
            sp = this.blockT > 9 ? 0.18 : 0;
          } else this.blockT = 0;
        }
        this.u += (this.dir * sp / PBW) * dt2;
        const p2 = pbPath(this.u);
        if (this.dockCool <= 0 && p2.z > rzAtG(p2.x) && Math.abs(p2.x - dk.x) < 0.55 && Math.random() < 0.02) {
          this.u = this.uDock; this.docked = true; this.hold = 13 + Math.random() * 3.5;
        }
      }
      const pt = this.docked && this.hold > 0 ? pbPath(this.uDock) : pbPath(this.u);
      const ahead = pbPath(this.u + this.dir * 0.004);
      const target = new THREE.Vector3(pt.x, 0.2 + Math.sin(t2 * 1.35 + this.ph) * 0.035, pt.z);
      const yaw = this.hold > 0 && this.docked ? (this.dir === 1 ? 0 : Math.PI) : Math.atan2(-(ahead.z - pt.z), ahead.x - pt.x);
      this.g.position.lerp(target, Math.min(1, dt2 * 2.4));
      let dy = yaw - this.g.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.g.rotation.y += dy * Math.min(1, dt2 * 1.5);
      this.g.rotation.z = Math.sin(t2 * 1.1 + 1.4) * 0.018;
      this.g.rotation.x = Math.sin(t2 * 0.9) * 0.012;
    },
  };
  { const p0 = pbPath(pb.u); o.position.set(p0.x, 0.2, p0.z); o.rotation.y = 0; }
  window.__pb = pb;
  console.log('[沙盘] 画舫下水');
}).catch(() => console.warn('[沙盘] 画舫 GLB 加载失败'));
/* ---------------- v4.80 乌篷船×2：北岸小栈桥泊位（1/3 画舫长，各带特小油灯） ---------------- */
window.__loadGLB('assets/wupengboat.glb', [0, -500, 0], 0.73, 0).then(o => {
  o.traverse(mm => {
    if (mm.isMesh && mm.name === 'lantern') {
      mm.material = mm.material.clone();
      mm.material.emissive = new THREE.Color('#ffb45a'); mm.material.emissiveIntensity = 0.3;
      dayNight.lanternMats.push(mm.material);
    }
  });
  const wd = window.__wuDock;
  const boats = [];
  [[-6.3, wd.z1, 0.12], [-8.6, wd.z2, Math.PI + 0.1]].forEach(p => {
    const c = (boats.length === 0) ? o : o.clone();
    c.position.set(p[0], 0.16, p[1]); c.rotation.y = p[2];
    const l2 = new THREE.PointLight('#ffb45a', 0, 2.6, 2); l2.position.set(0.9 * 0.73, 0.72, -0.22 * 0.73); c.add(l2);
    dayNight.lanternLights.push(l2);
    scene.add(c); boats.push(c);
  });
  window.__wuBoats = boats;
  window.__wuNav = boats.map((b, i) => ({ g: b, tx: b.position.x, tz: b.position.z, wait: 2 + i * 2.4, spd: 0.2 + i * 0.04 }));
  console.log('[沙盘] 乌篷船巡游 2 艘（桥西水域）');
}).catch(() => console.warn('[沙盘] 乌篷船 GLB 加载失败'));
/* ---------------- v4.80 垂柳试栽 1 株（点8 东岸，效果不满意即删） ---------------- */
/* 六树原型载入 v2（精模：实体针穗 + alpha 叶卡，零芯球；按旧积木树高度归一） */
const treeFx = [];
/* ---- v12 垂柳群植：模板克隆 8 株·柳帘皆向水·摆向微随机 ---- */
{
  const V = THREE.Vector3;
  const vcM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const WAZ = 0, wx = Math.sin(WAZ), wz = Math.cos(WAZ);  /* 模板帘向局部+z，摆放时整组转 y */
  const BARK = [0.40, 0.39, 0.21];
  function Geo() { return { pos: [], col: [], idx: [], n: 0 }; }
  function pushTube(g, pts2, r0, r1, radial, colFn) {
    const N = pts2.length, base = g.n;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), r = r0 + (r1 - r0) * t;
      const a0 = pts2[Math.max(0, i - 1)], b0 = pts2[Math.min(N - 1, i + 1)];
      let tang = b0.clone().sub(a0); if (tang.lengthSq() < 1e-9) tang.set(0, 1, 0); tang.normalize();
      let side = new V().crossVectors(tang, new V(0, 1, 0));
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const upv = new V().crossVectors(side, tang).normalize();
      for (let k = 0; k < radial; k++) {
        const aa = k / radial * Math.PI * 2;
        const dv = side.clone().multiplyScalar(Math.cos(aa)).add(upv.clone().multiplyScalar(Math.sin(aa)));
        g.pos.push(pts2[i].x + dv.x * r, pts2[i].y + dv.y * r, pts2[i].z + dv.z * r);
        const c = colFn ? colFn(t, k / radial) : BARK;
        g.col.push(c[0], c[1], c[2]);
      }
      g.n += radial;
    }
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < radial; k++) {
      const k2 = (k + 1) % radial, A = base + i * radial + k, B = base + i * radial + k2, C = base + (i + 1) * radial + k, D = base + (i + 1) * radial + k2;
      g.idx.push(A, C, B, B, C, D);
    }
  }
  function pushQuad(g, a, b, c, d, col) {
    const bs = g.n;
    g.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    for (let i = 0; i < 4; i++) g.col.push(col[0], col[1], col[2]);
    g.idx.push(bs, bs + 1, bs + 2, bs, bs + 2, bs + 3);
    g.n += 4;
  }
  function mkMesh(g) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
    geo.setIndex(g.idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, vcM); m.castShadow = true; m.receiveShadow = false;
    return m;
  }
  const tcurve = new THREE.CatmullRomCurve3([new V(0, 0, 0), new V(wx * 0.045, 1.0, wz * 0.045), new V(wx * 0.15, 1.9, wz * 0.15), new V(wx * 0.30, 2.6, wz * 0.30), new V(wx * 0.44, 3.05, wz * 0.44)]);
  const bcurves = [];
  const gb = Geo();
  pushTube(gb, tcurve.getSpacedPoints(44), 0.195, 0.095, 14, (t, k) => {
    const shade = 0.86 + 0.14 * t;
    const ridge = 0.96 + 0.05 * Math.abs(Math.sin(k * 25.13));
    return [0.285 * shade * ridge, 0.195 * shade * ridge, 0.125 * shade * ridge];
  });
  const tips = [];
  for (let k = 0; k < 9; k++) {
    const aa = WAZ + (k - 4) * 0.20;                 /* 9 岔同扇面 ±46°，高低错落 */
    const byy = [2.35, 2.85, 3.30, 3.52, 3.10, 2.55, 3.38, 2.42, 2.98][k];
    const rx = 1.15 + (byy - 2.3) * 0.62;
    const cb = new THREE.CatmullRomCurve3([
      new V(wx * 0.28, byy - 0.06, wz * 0.28),
      new V(Math.sin(aa) * 0.34 + wx * 0.08, byy + 0.30, Math.cos(aa) * 0.34 + wz * 0.08),
      new V(Math.sin(aa) * rx * 0.55, byy + 0.40, Math.cos(aa) * rx * 0.55),
      new V(Math.sin(aa) * rx, byy + 0.14, Math.cos(aa) * rx),
      new V(Math.sin(aa) * (rx + 0.22), byy - 0.42, Math.cos(aa) * (rx + 0.22)),
      new V(Math.sin(aa) * (rx + 0.30), byy - 1.02, Math.cos(aa) * (rx + 0.30))]);
    bcurves.push(cb);
    const bp = cb.getSpacedPoints(12);
    pushTube(gb, bp, 0.028, 0.005, 8, (t) => { const d = 0.85 + 0.15 * t; return [0.32 * d, 0.235 * d, 0.15 * d]; });
    tips.push(bp[bp.length - 1]);
  }
  const bodyGeo = mkMesh(gb).geometry;
  const brGeos = [];
  tips.forEach((tip, ti) => {
    for (let j = 0; j < 12; j++) {
      const bt = 0.34 + (j / 12) * 0.66;                                  /* 沿拱弧 t∈[0.34,1] 逐点挂出 */
      const bcv = bcurves[ti];
      const anch = bcv.getPoint(Math.min(1, bt)).add(new V(Math.sin(j * 2.4) * 0.05, -0.015, Math.cos(j * 2.4) * 0.05));
      const btan = bcv.getTangent(Math.min(1, bt)); btan.y = 0;
      if (btan.lengthSq() < 1e-6) btan.set(Math.sin(j), 0, Math.cos(j));
      btan.normalize();
      const aa = Math.atan2(btan.x, btan.z) + 1.57;
      const L = 2.0 + ((j * 7919 + ti * 104729) % 100) / 100 * 0.95;
      const ext = 0.26 + ((j * 37) % 10) / 10 * 0.16;                    /* 出枝先顺弧外挑 */
      const push = L * (0.17 + ((j * 31 + ti * 7) % 10) / 10 * 0.06);
      const rawL = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const ex = ext * Math.sin(Math.min(1, t * 2.8) * 1.5708) * (1 - t * 0.35);
        rawL.push(new V(
          btan.x * ex + wx * push * Math.pow(t, 1.3),
          -L * Math.pow(t, 1.55),
          btan.z * ex + wz * push * Math.pow(t, 1.3)));
      }
      const cl = new THREE.CatmullRomCurve3(rawL);
      const ptsL = cl.getSpacedPoints(9);
      const g = Geo();
      pushTube(g, ptsL, 0.013, 0.0035, 5, () => [0.44, 0.44, 0.23]);
      const nl = 26 + (j % 3) * 3;                            /* 加密：26~32 枚/枝 */
      for (let i2 = 0; i2 < nl; i2++) {
        const t = 0.05 + 0.57 * i2 / (nl - 1);                              /* 叶域 6%~56%，尾段垂丝光杆 */
        const fi = t * 8; const i0f = Math.min(7, Math.floor(fi)); const ft = fi - i0f;
        const p = ptsL[i0f].clone().lerp(ptsL[Math.min(8, i0f + 1)], ft);
        const sgn = i2 % 2 ? 1 : -1;
        const sv = new V(Math.sin(aa + 1.57) * sgn, 0, Math.cos(aa + 1.57) * sgn);
        const basev = p.clone().add(sv.clone().multiplyScalar(0.004));
        const midL = p.clone().add(sv.clone().multiplyScalar(0.030)).add(new V(0, -0.022, 0));
        const midR = p.clone().add(sv.clone().multiplyScalar(0.019)).add(new V(0, -0.018, 0)).add(new V(-sv.x * 0.011, 0, -sv.z * 0.011));
        const tipv = p.clone().add(sv.clone().multiplyScalar(0.027)).add(new V(0, -0.070, 0));
        const lj = 0.85 + ((i2 * 613 + j * 71 + ti * 13) % 30) / 100;
        const lc = i2 % 3 ? [0.33 * lj, 0.55 * lj, 0.20 * lj] : [0.45 * lj, 0.65 * lj, 0.24 * lj];
        pushQuad(g, basev, midL, tipv, midR, lc);
      }
      brGeos.push({ geo: mkMesh(g).geometry, pos: anch.clone() });
    }
  });
  const SPOTS = [
    [16.6, 13.6, 0.9, 2.35],    /* 现有东段北岸 */
    [20.5, 12.8, 0.85, -0.15],  /* 东段北岸补 */
    [5, 15.5, 0.8, 0.25],       /* 桥东北岸 */
    [-9.5, 12.9, 0.88, 0.25],    /* 西段北岸·实测水4.4 离路4.4 */
    [-21, 10.7, 0.82, 0.2],     /* 极西北岸 */
    [-17.5, 22.2, 0.8, 3.05],   /* 西段南岸·实测 r28.3 水北3.2 */
    [-10, 24.8, 0.8, 3.0],      /* 上游西段南岸 */
    [-3.5, 25.4, 0.9, 2.85],    /* 中南岸 */
    [13.5, 23.7, 0.86, 3.2],    /* 东段南岸 */
    [19.2, 11.8, 0.8, 1.5]      /* 下游东端·北岸带帘朝南水 */
  ];
  window.__willowBr = [];
  SPOTS.forEach((sp, si) => {
    const w2 = new THREE.Group();
    const bm = new THREE.Mesh(bodyGeo, vcM); bm.castShadow = true; bm.receiveShadow = false;
    w2.add(bm);
    brGeos.forEach((bg, bi) => {
      const holder = new THREE.Group(); holder.position.copy(bg.pos);
      const m = new THREE.Mesh(bg.geo, vcM); m.castShadow = false; m.receiveShadow = false;
      holder.add(m);
      holder.userData.ph = ((bi * 977 + si * 6151) % 100) / 100 * 6.283;
      w2.add(holder); window.__willowBr.push(holder);
    });
    w2.position.set(sp[0], 0, sp[1]);

    w2.scale.setScalar(sp[2] + (si % 3 - 1) * 0.04);
    w2.rotation.y = sp[3] + ((si * 7723) % 100) / 100 * 0.4 - 0.2;
    w2.userData.sw = { ph: si * 1.9 };
    w2.userData.spot = si;
    scene.add(w2); treeFx.push(w2);
  });
  console.log('[沙盘] 垂柳群植 10 株（几何共享）· 1080 挂枝 · 柳帘向水');
}


{
  const protos = {};
  const NORM = { ginkgo: 0.45, maple: 0.59, apricot: 0.62, camphor: 0.44, pine: 0.51, cypress: 0.50 };  /* ≈旧树 65% */
Promise.all(['pine', 'cypress', 'camphor', 'ginkgo', 'maple', 'apricot'].map(k =>
    window.__loadGLB(`assets/tree2_${k}.glb`, [0, -400, 0], 1, 0).then(o => { protos[k] = o; })))
    .then(() => {
      let n = 0;
      for (const it of treeQueue) {
        const p = protos[it.kind]; if (!p) continue;
        const c = p.clone(); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0);
        c.traverse(o => {
          if (o.isMesh && (o.name === 'cards' || (o.parent && o.parent.name === 'cards'))) { o.castShadow = false; o.receiveShadow = false; }
        });
        c.scale.setScalar(NORM[it.kind]);
        it.g.add(c);
        it.g.userData.sw = { ph: Math.random() * 6.28 };
        treeFx.push(it.g);
        n++;
      }
      const extra = [[-23.5, 4.6, 1.0, 'maple'], [-13.2, 2.6, 0.9, 'pine'], [-20.5, 4.4, 0.85, 'cypress'], [-10.6, 7.4, 1.0, 'camphor'], [8.6, 15.8, 0.8, 'ginkgo'], [11.8, 15.1, 0.8, 'pine'], [21.2, 4.8, 0.9, 'maple'], [21.2, 5.5, 0.8, 'cypress'], [-15.0, 7.3, 0.9, 'apricot'], [-22.6, 3.6, 0.85, 'ginkgo'], [-13.8, -6.2, 1.0, 'pine'], [13.8, -2.2, 0.9, 'camphor'],
        [19.6, 5.8, 0.85, 'maple'], [18.2, 6.6, 0.85, 'pine'], [-11.5, 8.7, 0.9, 'ginkgo'], [-16.2, 21.6, 0.8, 'cypress'], [-8.5, 25.2, 0.9, 'camphor'], [1.5, 26.2, 0.8, 'maple'], [-4.0, 26.0, 0.85, 'apricot'], [24.6, 4.0, 0.8, 'pine']];
      for (const [x, z, scE, kd] of extra) {
        const p = protos[kd]; if (!p) continue;
        if (x > 13.0 && x < 17.2 && z > 6.4 && z < 9.4) continue;   /* 马房栅栏禁入兜底 */
        const c = p.clone();
        c.traverse(o => { if (o.isMesh && (o.name === 'cards' || (o.parent && o.parent.name === 'cards'))) { o.castShadow = false; o.receiveShadow = false; } });
        c.scale.setScalar(NORM[kd] * scE);
        c.position.set(x, 0, z); c.rotation.y = Math.random() * 6.28;
        c.userData.sw = { ph: Math.random() * 6.28 };
        scene.add(c); treeFx.push(c); n++;
      }
      console.log('[沙盘] 树木就位', n, '棵（精模六种类）');
    });
}
window.__loadGLB('assets/bird.glb', [0, -400, 0], 0.62, 0).then(o => {
  for (const b of birdSlots) {
    const c = o.clone(); c.position.set(0, 0, 0); c.rotation.set(0, Math.PI / 2, 0);
    let wL = null, wR = null;
    c.traverse(n0 => { if (n0.name === 'wingL') wL = n0; else if (n0.name === 'wingR') wR = n0; });
    b.add(c);
    b.userData.bird = { root: c, wL, wR };
  }
  console.log('[沙盘] 小鸟就位', birdSlots.length, '只');
}).catch(() => console.warn('[沙盘] 小鸟 GLB 加载失败'));
if (railingSlots.length) window.__loadGLB('assets/railing.glb', [0, -400, 0], 1, 0).then(o => {
  for (const sl of railingSlots) { const c = o.clone(); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); sl.add(c); }
  console.log('[沙盘] 桥栏杆就位', railingSlots.length, '段');
}).catch(() => console.warn('[沙盘] 栏杆 GLB 加载失败'));
if (torchFires.length) window.__loadGLB('assets/flame.glb', [0, -400, 0], 1, 0).then(o => {
  const FM = [
    new THREE.MeshBasicMaterial({ color: '#e8641c', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: '#ffab3a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: '#ffedbe', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  ];
  for (const tf of torchFires) {
    const c = o.clone(); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0);
    const parts = [];
    for (const nm of ['flameOuter', 'flameMid', 'flameCore']) {
      c.traverse(n => { if (n.isMesh && n.name === nm) { n.material = FM[['flameOuter', 'flameMid', 'flameCore'].indexOf(nm)]; parts.push(n); } });
    }
    tf.holder.add(c);
    tf.holder.userData.parts = parts;
  }
  dayNight.flameMats = FM;
  console.log('[沙盘] 精细火苗就位', torchFires.length, '座');
}).catch(() => console.warn('[沙盘] 火苗 GLB 加载失败'));

/* v5.14 背景大锥北撤：cx-3 cz-19 R9.7 的南趾(y5..11, z-10..-13)从后锥肩后探出，
   侧看像一堵灰柱墙压在主楼屋脊上。整体北移 3m 收进主峰背后（独立 mesh，平移零风险） */
scene.traverse(function (o) {
  if (!o.isMesh) return;   /* v5.27 同款放宽 */
  if (o.material !== M.mountain && !(o.material.vertexColors && o.parent === scene && new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length() > 6)) return;
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  if (b.min.z < -27 && b.max.z > -10.1 && b.max.z < -9.5 && b.max.y > 9 && b.max.y < 12 && b.min.y > -0.5) o.position.z -= 3;
  /* 后锥(cx-3 cz-17 开挖后 y≤8.5)拔高 1.45× 北撤 1.5m：绿主峰压住 z-12 冠区灰柱幕 */
  if (b.min.z < -21 && b.max.z > -5.8 && b.max.z < -5.2 && b.max.y > 7 && b.max.y < 9.5 && b.min.y > -0.5) { o.scale.y = 1.72; o.position.z -= 2.2; o.position.y = 0; }
});
/* v4.99 二段开挖：石室后梯井 + 二层后扩山腹段（岩层 4.45 以下掏空做地板下伏岩，≥7.05 保留成天然顶） */
{
  const wv3 = new THREE.Vector3();
  scene.traverse(function (o) {
    if (!o.isMesh || !o.geometry.attributes.color) return;   /* v5.27 放宽：克隆材质的第二层山体(背景锥)以前逃过所有开挖/上色 */
    if (o.material !== M.mountain && !(o.material.vertexColors && o.parent === scene && new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length() > 6)) return;
    const pa = o.geometry.attributes.position;
    let dirty = false;
    for (let i2 = 0; i2 < pa.count; i2++) {
      wv3.set(pa.getX(i2), pa.getY(i2), pa.getZ(i2));
      o.localToWorld(wv3);
      const x = wv3.x, z = wv3.z, y = wv3.y;
      if (x > -3.05 && x < 3.05 && z > -11.5 && z < -9.8 && y > 0.02 && y < 4.95) { pa.setY(i2, -8); dirty = true; }   /* v5.20 东西向楼梯间横廊掏挖（含压冠岩顶 4.3 一并通） */
      else if (x > -3.3 && x < 3.3 && z > -12.72 && z < -8.1 && y > 0.02 && y < 4.95) { pa.setY(i2, -8); dirty = true; }   /* v5.27 石室顶与梯廊统一 4.95 直顶楼板（原 2.66 矮顶+檐舌=用户所见'只有山体'） */
      else if (x > -1.75 && x < 1.75 && z > -12.7 && z < -10.3 && y > 0.05 && y < 4.75) { pa.setY(i2, y - (y + 7)); dirty = true; }   /* v5.14 y 并进外层：同款劫持 bug，梯井 xz 内的冠顶点曾卡死本分支跳不过压冠条款 */
      else if (x > -3.9 && x < 3.9 && z > -11.95 && z < -8.0 && y > 4.45 && y < 13.4) { pa.setY(i2, 4.3); dirty = true; }   /* v5.14 北界 -11.65→-11.95 帽→13.4 且 y 并外层：跨界挂帘三角(北邻点未压)一并压平，主峰南面退到 z-12 后 */
      else if ((x > 3.9 && x < 6.25 || x < -3.9 && x > -6.25) && z > -11.95 && z < -9.3 && y > 4.45 && y < 13.4) { pa.setY(i2, 4.3); dirty = true; }   /* v5.14 东西侧幕条：主锥/大锥 x3.9~6.2 的挂帘三角；z>-9.3 保住东绿山的院侧坡 */
    }
    if (dirty) { pa.needsUpdate = true; o.geometry.computeVertexNormals(); }
  });
  for (const o of scene.children.slice()) {
    if (o.isMesh && o.material === window.__mtnRockMat) {
      const p = o.getWorldPosition(wv3);
      if ((p.x > -3.35 && p.x < 3.35 && p.z > -12.8 && p.z < -8.05 && p.y < 2.7) || (p.x > -1.7 && p.x < 1.7 && p.z > -12.75 && p.z < -10.2) || (p.x > -2.7 && p.x < 2.7 && p.z > -11.8 && p.z < -7.9 && p.y > 4.1 && p.y < 7.2)) o.visible = false;
    }
  }
}
/* v5.27 背景锥北撤/拔高已前移至二段开挖之前（先挪后挖——否则挖好的梯间走廊随锥平移，挡面补回轴线，用户所见'只有山体'根因） */
/* v5.14 开挖断面石壁化：地盘开挖把山体压到 -7，坑壁一圈竖直断面仍带草绿顶点色——
   从酒窖门洞/厅后墙缝看进去就是面刺眼绿墙（"盖住前台"真凶）。把坑壁带顶点改岩灰色，
   伪装成人工开凿石断面（仅改颜色，几何/物理零影响） */
{
  const wv = new THREE.Vector3();
  const cWall = new THREE.Color('#6e6355').lerp(new THREE.Color('#8a7d68'), 0.35);
  const cWall2 = new THREE.Color('#5c5347');
  scene.traverse(function (o) {
    if (!o.isMesh || !o.geometry.attributes.color) return;   /* v5.27 放宽：克隆材质的第二层山体(背景锥)以前逃过所有开挖/上色 */
    if (o.material !== M.mountain && !(o.material.vertexColors && o.parent === scene && new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length() > 6)) return;
    const pa = o.geometry.attributes.position, ca = o.geometry.attributes.color;
    o.updateMatrixWorld(true);
    let dirty = false;
    for (let i2 = 0; i2 < pa.count; i2++) {
      wv.set(pa.getX(i2), pa.getY(i2), pa.getZ(i2));
      o.localToWorld(wv);
      const y = wv.y, x = wv.x, z = wv.z;
      const nearX = (x > 3.85 && x < 4.6) || (x < -3.85 && x > -4.6);
      const northWall = z > -12.65 && z < -7.3 && Math.abs(x) < 4.0;   /* 坑北壁→垂幕柱→冠区统一岩色成照壁 */
      const westEastWall = nearX && z > -10.0 && z < -3.4;
      const southWall = z > -4.15 && z < -3.45 && Math.abs(x) < 4.6;
      if (northWall || westEastWall || southWall) {
        const t = (y + 7) / 12.5;
        const j = nzHash2i(Math.round(x * 17) + 7717, Math.round(z * 17) + 3313) % 100 / 100;
        const c = cWall.clone().lerp(cWall2, Math.min(1, t * 1.6));
        const off = j * 0.055 - 0.025;   /* r147 无 offsetScalar(r162+)，手写线性偏移 */
        c.setRGB(Math.max(0, Math.min(1, c.r + off)), Math.max(0, Math.min(1, c.g + off * 0.9)), Math.max(0, Math.min(1, c.b + off * 0.8)));
        ca.setXYZ(i2, c.r, c.g, c.b);
        if (northWall && y > 4.45) {
          const j2 = nzHash2i(Math.round(x * 23) + 991, Math.round(z * 23) + 557) % 100 / 100;
          pa.setY(i2, pa.getY(i2) + ((j * 100 | 0) % 9) * 0.24 - 0.96);
          pa.setX(i2, pa.getX(i2) + ((j2 * 100 | 0) % 7) * 0.26 - 0.78);
          pa.setZ(i2, pa.getZ(i2) + ((j2 * 100 | 0) % 5) * 0.3 - 0.6);
        }
        dirty = true;
      }
    }
    if (dirty) ca.needsUpdate = true;
  });
}
/* v4.98 主楼地盘上的山树没收（树晚于开挖摆放，二次清点） */
{
  const RX0 = -4.15, RX1 = 4.15, RZ0 = -9.35, RZ1 = -3.75;
  const wv2 = new THREE.Vector3();
  for (const tr of treeFx) {
    const p = tr.getWorldPosition ? tr.getWorldPosition(wv2) : tr.position;
    if (p.x > RX0 && p.x < RX1 && p.z > RZ0 && p.z < RZ1) tr.visible = false;
  }
}
/* v5.14 漂浮物贴地检测：开挖区(x±12, z-14..-7)内树/石按真实网格表面测高差，
   悬空 >1.8m 一律没收——坐标窗扫不净的边角浮石一网打尽（合法坡面植被高差 <1） */
{
  const rcF = new THREE.Raycaster();
  const mtnM = [];
  scene.traverse(function (o) { if (o.isMesh && o.material === M.mountain) mtnM.push(o); });
  const wvF = new THREE.Vector3();
  function floatChk(o) {
    o.getWorldPosition(wvF);
    const rrF = Math.hypot(wvF.x, wvF.z);
    if (Math.abs(wvF.x) > 24 || Math.abs(wvF.z) > 26) return;
    let allow = 0;
    if (wvF.y > 2.5 && wvF.z > -20.5 && wvF.z < -7) allow = 1.8;           /* 石室开挖区（原判定） */
    else if (wvF.z < 2 && rrF > BASE_R * 0.5) allow = wvF.y < 1.5 ? 2.6 : 1.8;   /* v5.45 全山腰+台地：崖边允许值收紧 */
    if (!allow) return;
    rcF.set(new THREE.Vector3(wvF.x, wvF.y + 1.2, wvF.z), new THREE.Vector3(0, -1, 0));
    rcF.far = 34;
    let hit = null;
    try { hit = rcF.intersectObjects(mtnM, false)[0]; } catch (e) { return; }
    if (wvF.y - (hit ? hit.point.y : -8) > allow) o.visible = false;
  }
  for (const o of scene.children) { if (o.isMesh && o.material === window.__mtnRockMat) floatChk(o); }
  for (const tr of treeFx) floatChk(tr);
  for (const fl2 of (window.__mtnFlora || [])) floatChk(fl2);
  if (window.__bushGrp) for (const bg2 of window.__bushGrp.children) floatChk(bg2);
  /* ---- v5.23 偶发 5-15s 冻结三防：软渲染降载 / 程序预编译 / GPU 上下文丢失自愈 + 长任务探针 ---- */
{
  const glR = renderer.getContext();
  const dbgI = glR.getExtension('WEBGL_debug_renderer_info');
  const rendr = String(dbgI ? glR.getParameter(dbgI.UNMASKED_RENDERER_WEBGL) : '');
  const soft = /SwiftShader|Basic Render|Software|llvmpipe|Microsoft/i.test(rendr);
  window.__rendrName = rendr; window.__softGL = soft;
  if (soft) {   /* 远程桌面=WARP/SwiftShader：同步重任务全砍 */
    sun.shadow.mapSize.set(1024, 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    if (window.__refl) window.__refl.on = false;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 0.8));
    console.log('[沙盘] 检测到软件渲染(' + rendr.slice(0, 40) + ')：阴影1024/反射关/dpr0.8');
  }
  window.__lag = [];
  try {
    new PerformanceObserver(function (l) {
      for (const en of l.getEntries()) {
        window.__lag.push([Math.round(en.startTime), Math.round(en.duration)]);
        if (window.__lag.length > 40) window.__lag.shift();
        if (en.duration > 900) console.log('[沙盘] 长任务 ' + Math.round(en.duration) + 'ms');
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) {}
  setTimeout(function () {   /* 预编译：懒编译是同步冻结主犯，先付掉；Points/Sprite 首帧热身 */
    const warmTmp = [];
    scene.traverse(function (o) { if ((o.isPoints || o.isSprite) && !o.visible) { warmTmp.push(o); o.visible = true; } });
    try { renderer.compile(scene, camera); } catch (e) {}
    for (const o of warmTmp) o.visible = false;
    window.__precomp = 1;
    console.log('[沙盘] 程序预编译完成 ' + renderer.info.programs.length + ' 个程序');
  }, 8000);
  let hintT2 = 0;
  renderer.domElement.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    window.__ctxLost = (window.__ctxLost || 0) + 1;
    const h = document.getElementById('hint');
    if (h) { h.style.display = 'block'; h.textContent = 'GPU 上下文重置（远程会话常见），正在自动恢复…'; clearTimeout(hintT2); }
    console.log('[沙盘] WebGL context lost #' + window.__ctxLost);
  });
  renderer.domElement.addEventListener('webglcontextrestored', function () {
    const h = document.getElementById('hint');
    if (h) { h.textContent = '图形上下文已恢复 ✓'; hintT2 = setTimeout(function () { h.style.display = 'none'; }, 2200); }
    renderer.shadowMap.needsUpdate = true;
    setTimeout(function () { try { renderer.compile(scene, camera); } catch (e) {} }, 1500);
    console.log('[沙盘] WebGL context restored（已自动重编译）');
  });
}
/* v5.35p 山腹披厦重做：一块单坡瓦板（废 pRoof——四坡尖顶在楼后像黑帐篷）
   高边贴岩 z-12.5/y7.6 低边压廊 z-8.8/y6.0，东西梯形封板关山尖 */
{
  const slope = new THREE.Mesh(new THREE.BoxGeometry(7.44, 0.08, 4.3), tileMat(2));
  slope.position.set(0, 7.98, -10.45);   /* v5.35q 抬到墙顶之上：低檐 7.62(z-8.3) 高头 8.34(z-12.6 入岩)——坡面不再扎进客房 */
  slope.rotation.x = 0.178;
  slope.castShadow = true;
  scene.add(slope);
  const rgM = box(7.6, 0.2, 0.24, ridgeM); rgM.position.set(0, 8.42, -12.5); scene.add(rgM);
  const evM = box(7.6, 0.16, 0.22, ridgeM); evM.position.set(0, 7.56, -8.34); scene.add(evM);
  for (const s of [-1, 1]) {
    const shp = new THREE.Shape();
    shp.moveTo(8.3, 7.5); shp.lineTo(12.6, 8.34); shp.lineTo(12.6, 7.4); shp.lineTo(8.3, 7.4); shp.closePath();
    const gm = new THREE.ShapeGeometry(shp);
    gm.rotateY(Math.PI / 2);
    const gable = new THREE.Mesh(gm, mat('#5a5f6b', { side: THREE.DoubleSide, roughness: 0.9 }));
    gable.position.set(s * 3.72, 0, 0);
    scene.add(gable);
  }
  window.__mtnRoof = 1;
}
/* v5.33 削内部坡顶见坡面：主楼裙顶只留上瓦面——从二楼门厅/梯间抬头不再看见黑色瓦斜面底（外观零变化） */
{
  const doSkirt = (root) => {
    if (!root) return;
    root.traverse(function (o) {
      if (!o.isMesh || !o.geometry || !o.geometry.index || !o.geometry.attributes.normal) return;
      const nm = o.geometry.attributes.normal, idx = o.geometry.index;
      const keep = [];
      for (let i = 0; i < idx.count; i += 3) {
        const fy = (nm.getY(idx.getX(i)) + nm.getY(idx.getX(i + 1)) + nm.getY(idx.getX(i + 2))) / 3;
        if (fy > 0.25) keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
      }
      if (keep.length && keep.length < idx.count) o.geometry.setIndex(keep);
    });
  };
  let nSk = 0;
  const wvS = new THREE.Vector3();
  scene.traverse(function (o) {
    if (o.type === "Group" && o.position.y > 4.3 && o.position.y < 4.8 && Math.abs(o.position.x) < 0.3 && Math.abs(o.position.z) < 0.1 && o.parent && Math.abs((o.parent.position ? o.parent.position.z : 0) + 6.62) < 0.5) {
      doSkirt(o); nSk++;
      /* v5.35r 按面切洞：三角形三顶点全在客房空腔（x±3.35 z-4.9~-8.55 y4.5~7.35）就整面删——
         坡体从室内绝迹（人字坡横穿 2F 头部高度=用户"屋顶依然存在"本尊），楼体轮廓外腰檐环带零损失 */
      o.traverse(function (mm) {
        if (!mm.isMesh) return;
        const pa = mm.geometry.attributes.position;
        const inRoom = (vi2) => {
          wvS.set(pa.getX(vi2), pa.getY(vi2), pa.getZ(vi2));
          mm.localToWorld(wvS);
          return Math.abs(wvS.x) < 3.35 && wvS.z > -8.55 && wvS.z < -4.9 && wvS.y > 4.5 && wvS.y < 7.35;
        };
        const triCount = (mm.geometry.index ? mm.geometry.index.count : pa.count) / 3;
        const keep = [];
        for (let t2 = 0; t2 < triCount; t2++) {
          const a3 = mm.geometry.index ? [mm.geometry.index.getX(t2 * 3), mm.geometry.index.getX(t2 * 3 + 1), mm.geometry.index.getX(t2 * 3 + 2)] : [t2 * 3, t2 * 3 + 1, t2 * 3 + 2];
          if (!(inRoom(a3[0]) && inRoom(a3[1]) && inRoom(a3[2]))) keep.push(a3);
        }
        if (keep.length === triCount) return;
        if (mm.geometry.index) {
          const arr = [];
          keep.forEach((t3) => arr.push(t3[0], t3[1], t3[2]));
          mm.geometry.setIndex(arr);
        } else {
          const np = new Float32Array(keep.length * 9);
          const ncol = mm.geometry.attributes.color ? new Float32Array(keep.length * 3) : null;
          const ca = mm.geometry.attributes.color;
          let w = 0;
          keep.forEach((t3) => { t3.forEach((vi2) => { np[w * 3] = pa.getX(vi2); np[w * 3 + 1] = pa.getY(vi2); np[w * 3 + 2] = pa.getZ(vi2); if (ncol) { ncol[w] = ca.getX(vi2); ncol[w + 1] = ca.getY(vi2); ncol[w + 2] = ca.getZ(vi2); } w++; }); });
          mm.geometry.setAttribute("position", new THREE.BufferAttribute(np, 3));
          if (ncol) mm.geometry.setAttribute("color", new THREE.BufferAttribute(ncol, 3));
          const uvA = mm.geometry.attributes.uv;
          if (uvA) { const nu = new Float32Array(keep.length * 2); let w2 = 0; keep.forEach((t3) => { t3.forEach((vi2) => { nu[w2 * 2] = uvA.getX(vi2); nu[w2 * 2 + 1] = uvA.getY(vi2); w2++; }); }); mm.geometry.setAttribute("uv", new THREE.BufferAttribute(nu, 2)); }
        }
        mm.geometry.computeVertexNormals();
        mm.geometry.computeBoundingSphere();
      });
      o.traverse(function (mm) {   /* v5.35s 垂脊/正脊瓦筒：bbox 中心落在客房腔内即藏（对角垂脊 bbox 跨度过大，整体框法漏网——黑金字塔本尊） */
        if (!mm.isMesh || (mm.geometry.type !== "CylinderGeometry" && mm.geometry.type !== "BoxGeometry")) return;
        const c9 = new THREE.Box3().setFromObject(mm).getCenter(new THREE.Vector3());
        if (Math.abs(c9.x) < 4.3 && c9.y > 4.4 && c9.y < 7.45 && c9.z > -8.95 && c9.z < -4.35) mm.visible = false;
      });
    }
  });
  /* v5.35t 正主抓了：eaveCap(9.5,6.6,3.62) 主楼一层次檐的方攒四根垂脊（bbox 6.9×13.8 巨框，此前按框过滤全漏网）
     顶点级处决：客房腔内顶点（|x|<3.6,-9<z<-4.2,4.3<y<7.6）钉进平顶板体 7.09，室外段沿原线收 */
  scene.traverse(function (o) {
    if (!o.isMesh || o.geometry.type !== "CylinderGeometry") return;
    const pw = new THREE.Vector3();
    const b2 = new THREE.Box3().setFromObject(o);
    if (!(b2.max.y > 4.5 && b2.min.y < 7.6 && b2.max.z > -10 && b2.min.z < -3 && b2.max.x > 3.5 && b2.min.x < -3.5)) return;
    const pa = o.geometry.attributes.position;
    let dirty = false;
    for (let i2 = 0; i2 < pa.count; i2++) {
      pw.set(pa.getX(i2), pa.getY(i2), pa.getZ(i2));
      o.localToWorld(pw);
      if (Math.abs(pw.x) < 3.6 && pw.z > -9 && pw.z < -4.2 && pw.y > 4.3 && pw.y < 7.6) {
        pa.setY(i2, pa.getY(i2) + (7.09 - pw.y));
        dirty = true;
      }
    }
    if (dirty) { pa.needsUpdate = true; o.geometry.computeVertexNormals(); }
  });
  window.__skirtCut = nSk;
}
  /* v5.35bb2 裙顶收编（挪至全部落位后执行——早前跑在 inn.position 之前，世界坐标测试全 false） */
  /* v5.35bb 裙顶根治：roofPyramid 坡面是 4 枚含顶角大三角——"三顶点全在腔内"永假、按框过滤又漏。
     细分重切（每三角 6×6 插值网格再剔），垂脊中心入腔即藏。室内只见壳顶，楼外腰檐零改动 */
  {
    const inCav = (x, y, z) => Math.abs(x) < 3.55 && z > -8.75 && z < -4.35 && y > 4.5 && y < 7.9;
    const wvS = new THREE.Vector3();
    scene.updateMatrixWorld(true);
    scene.traverse(function (o) {
      if (!o.isMesh) return;
      let inGrp = false, p8 = o.parent;
      while (p8) { if (Math.abs(p8.position.y - 4.6) < 0.3 && Math.abs(p8.position.x) < 0.3 && Math.abs(p8.position.z) < 0.3) { inGrp = true; break; } p8 = p8.parent; }
      if (!inGrp) return;
      if (o.geometry.type === "CylinderGeometry") {   /* 四坡主坡=缩尖四棱柱(Instanced)，与垂脊同规则：中心入腔即藏 */
        const c7 = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
        if (inCav(c7.x, c7.y, c7.z)) { o.visible = false; window.__spikeKill = (window.__spikeKill || 0) + 1; }
        return;
      }
      if (o.isInstancedMesh) return;
      if (!o.material.map) return;
      const pa = o.geometry.attributes.position, uvA = o.geometry.attributes.uv;
      const nt = (o.geometry.index ? o.geometry.index.count : pa.count) / 3;
      const vtxAt = (vi2) => { wvS.set(pa.getX(vi2), pa.getY(vi2), pa.getZ(vi2)); o.localToWorld(wvS); return [wvS.x, wvS.y, wvS.z, pa.getX(vi2), pa.getY(vi2), pa.getZ(vi2), uvA ? uvA.getX(vi2) : 0, uvA ? uvA.getY(vi2) : 0]; };
      const lerp8 = (a3, b3, c3, u, v) => { const w2 = 1 - u - v; return a3.map((cv, i3) => cv * w2 + b3[i3] * u + c3[i3] * v); };
      const outP = [], outU = [];
      let cut = 0, kept = 0;
      for (let t2 = 0; t2 < nt; t2++) {
        const ii = o.geometry.index ? [o.geometry.index.getX(t2 * 3), o.geometry.index.getX(t2 * 3 + 1), o.geometry.index.getX(t2 * 3 + 2)] : [t2 * 3, t2 * 3 + 1, t2 * 3 + 2];
        const A = vtxAt(ii[0]), B = vtxAt(ii[1]), C = vtxAt(ii[2]);
        const N = 6;
        for (let u = 0; u < N; u++) for (let v = 0; v + u < N; v++) {
          const p1 = lerp8(A, B, C, u / N, v / N);
          const p2 = lerp8(A, B, C, (u + 1) / N, v / N);
          const p3 = lerp8(A, B, C, u / N, (v + 1) / N);
          if (inCav(p1[0], p1[1], p1[2]) && inCav(p2[0], p2[1], p2[2]) && inCav(p3[0], p3[1], p3[2])) { cut++; continue; }
          [p1, p2, p3].forEach((pp) => { outP.push(pp[3], pp[4], pp[5]); outU.push(pp[6], pp[7]); });
          kept++;
        }
      }
      if (!cut) return;
      o.geometry.deleteAttribute("color");
      o.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(outP), 3));
      o.geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(outU), 2));
      o.geometry.setIndex(null);
      o.geometry.computeVertexNormals();
      o.geometry.computeBoundingSphere();
      window.__facet2 = (window.__facet2 || 0) + cut;
    });
  }window.__mark('精模树+漂浮剔除');
window.__bootStage = Math.max(window.__bootStage || 0, 4);
window.__fcRan = 1;
}
/* v5.14 压冠后漂浮植被没收：顶冠前半压到岩顶 4.3，但树石早按表高(≤12.5)摆放——悬空树杆/浮石全收 */
{
  const wv9 = new THREE.Vector3();
  for (const tr of treeFx) {
    const p = tr.getWorldPosition ? tr.getWorldPosition(wv9) : tr.position;
    if (p.x > -7.2 && p.x < 7.2 && p.z > -12.95 && p.z < -7.95 && p.y > 4.2) tr.visible = false;
  }
  for (const o of scene.children.slice()) {
    if (o.isMesh && o.material === window.__mtnRockMat) {
      const p = o.getWorldPosition(wv9);
      if (p.x > -7.2 && p.x < 7.2 && p.z > -12.95 && p.z < -7.95 && p.y > 4.2) o.visible = false;
    }
  }
}
/* v5.27 最终开挖兜底：所有山体几何操作（后推/拔高/WALLGRAY…）都完成后统一收口——
   石室+东西梯间走廊一整条掏到 -8（幂等：已挖顶点 y=-8 不再命中 y 窗口）。
   根因背景：背景锥克隆层以前逃过 selection，且"先挖后挪"让洞口随锥平移。 */
{
  const wvF = new THREE.Vector3();
  scene.traverse(function (o) {
    if (!o.isMesh || !o.geometry.attributes || !o.geometry.attributes.color) return;
    if (o.material !== M.mountain && !(o.material.vertexColors && o.parent === scene && new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length() > 6)) return;
    const pa = o.geometry.attributes.position;
    let dirty = false;
    for (let i2 = 0; i2 < pa.count; i2++) {
      wvF.set(pa.getX(i2), pa.getY(i2), pa.getZ(i2));
      o.localToWorld(wvF);
      if (wvF.x > -3.35 && wvF.x < 3.35 && wvF.z > -12.75 && wvF.z < -8.05 && wvF.y > 0.02 && wvF.y < 4.95) { pa.setY(i2, pa.getY(i2) - (wvF.y + 8)); dirty = true; }
    }
    if (dirty) { pa.needsUpdate = true; o.geometry.computeVertexNormals(); }
  });
  const wvG = new THREE.Vector3();
  scene.traverse(function (o) {   /* 断面补灰：新暴露的走廊/石室坑壁统一岩灰（跳坑底 -8） */
    if (!o.isMesh || !o.geometry.attributes || !o.geometry.attributes.color) return;
    if (o.material !== M.mountain && !(o.material.vertexColors && o.parent === scene && new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length() > 6)) return;
    const pa = o.geometry.attributes.position, ca = o.geometry.attributes.color;
    let dirty2 = false;
    for (let i2 = 0; i2 < pa.count; i2++) {
      wvG.set(pa.getX(i2), pa.getY(i2), pa.getZ(i2));
      o.localToWorld(wvG);
      if (wvG.x > -3.4 && wvG.x < 3.4 && wvG.z > -12.8 && wvG.z < -8.0 && wvG.y > -7 && wvG.y < 5.3) {
        const t = (wvG.y + 7) / 12.3;
        ca.setXYZ(i2, 0.43 - t * 0.1, 0.39 - t * 0.07, 0.33 - t * 0.05); dirty2 = true;
      }
    }
    if (dirty2) ca.needsUpdate = true;
  });
  {   /* v5.35u 客房腔最终开挖（兜底补刀）：条款链 else-if 劫持——次檐压平条款(y4.45-13.4→4.3)
       先抢走客房腔顶点，压到 4.3 正好嵌在二楼房（y4.72-7.5）里 = 黑尖立面真身。此处不看前序直接掏 -8 */
    const wvH = new THREE.Vector3();
    scene.traverse(function (o) {
      if (!o.isMesh || !o.geometry.attributes || !o.geometry.attributes.color) return;
      if (o.material !== M.mountain && !(o.material.vertexColors && o.parent === scene && new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length() > 6)) return;
      const pa = o.geometry.attributes.position;
      let dirty = false;
      for (let i2 = 0; i2 < pa.count; i2++) {
        wvH.set(pa.getX(i2), pa.getY(i2), pa.getZ(i2));
        o.localToWorld(wvH);
        if (wvH.x > -3.3 && wvH.x < 3.3 && wvH.z > -8.5 && wvH.z < -4.6 && wvH.y > 0.02 && wvH.y < 7.0) { pa.setY(i2, pa.getY(i2) - (wvH.y + 8)); dirty = true; }
      }
      if (dirty) { pa.needsUpdate = true; o.geometry.computeVertexNormals(); }
    });
  }
  window.__digFinal = 1;
}
/* v5.19 前梯残段没收：v4.99 拆前梯只拆了踏步，西墙内皮留着一列 12 块斜弦板+栏杆
   （用户图1"板墙/栏杆"真身）——按几何签名 (1.3×0.07×0.05 薄板 x<-3) 隐藏 */
{
  const wvS = new THREE.Vector3();
  scene.traverse(function (o) {
    if (!o.isMesh || !o.visible || o.geometry.type !== 'BoxGeometry') return;
    const p = o.geometry.parameters;
    if (Math.abs(p.width - 1.3) < 0.02 && p.height < 0.12 && p.depth < 0.12) {
      o.getWorldPosition(wvS);
      if (wvS.x < -3.2 && wvS.z > -6.8 && wvS.z < -4.0 && wvS.y > 1.0 && wvS.y < 2.8) o.visible = false;
    }
  });
}
/* v5.22 楼梯间口门罩：石室北墙 z-9.8 洞口装砖箍门罩（立柱+过梁+门簪+双坡瓦帽起翘） */
{
  const bm = mat('#b9b2a2', { roughness: 0.92 }), dm = mat('#7d766a', { roughness: 0.9 });
  for (const s of [-1, 1]) { const pil = box(0.3, 2.8, 0.34, bm); pil.position.set(s * 2.2, 1.4, -9.78); pil.castShadow = true; scene.add(pil); }
  const lint = box(4.7, 0.36, 0.42, dm); lint.position.set(0, 2.98, -9.78); lint.castShadow = true; scene.add(lint);
  for (const s of [-1, 1]) { const zz = box(0.13, 0.17, 0.24, mat('#8a6a42')); zz.position.set(s * 1.35, 3.2, -9.62); scene.add(zz); }
  const tMZ = tileMat(4.9);
  for (const sg of [-1, 1]) { const sl = box(4.9, 0.07, 0.52, tMZ); sl.rotation.x = sg * 0.3; sl.position.set(0, 3.32, -9.78 + sg * 0.24); sl.castShadow = true; scene.add(sl); }
  const rg2 = box(5.0, 0.09, 0.16, dm); rg2.position.set(0, 3.46, -9.78); scene.add(rg2);
  for (const sg of [-1, 1]) { const ch = box(0.15, 0.26, 0.15, dm); ch.position.set(sg * 2.5, 3.5, -9.78); ch.rotation.z = sg * 0.16; scene.add(ch); }
  window.__WALLS.push({ ax: 'x', c: 2.2, t: 0.3, v0: -9.96, v1: -9.6, h: 2.9, gaps: [] });
  window.__WALLS.push({ ax: 'x', c: -2.2, t: 0.3, v0: -9.96, v1: -9.6, h: 2.9, gaps: [] });
}
/* v5.17 大堂窗区 scene 级植被没收：爬藤/墙根杂草/草锥(=用户所见悬空三角体) */
{
  const wvV = new THREE.Vector3();
  const inHall = (p) => Math.abs(p.x) < 4.3 && p.z > -9.5 && p.z < -3.7 && p.y < 3.8;
  scene.traverse(function (o) {   /* 面片材质是块内局部变量，按几何+透明特征抓：alphaTest 面片(藤/草) + 草锥 */
    if (!o.isMesh) return;
    const mt = o.material;
    const g = o.geometry;
    const isVeg = (g.type === 'PlaneGeometry' && mt.alphaTest > 0.2 && mt.transparent) ||
                  (g.type === 'ConeGeometry' && mt === grassTuftMat) || mt === WEED_MAT || mt === grassTuftMat;
    if (!isVeg) return;
    o.getWorldPosition(wvV);
    if (inHall(wvV)) o.visible = false;
  });
}
/* ---------------- UI + 截图模式 ---------------- */
document.getElementById('btnRotate').addEventListener('click', e => {
  controls.autoRotate = !controls.autoRotate;
  e.target.textContent = controls.autoRotate ? '⏸ 停止旋转' : '▶ 自动旋转';
});
{   /* 旋转速度滑块：autoRotateSpeed = v/10（2.0≈30s/圈@60fps），记进 localStorage */
  const sr = document.getElementById('spdRange'), sv = document.getElementById('spdVal');
  const saved = parseFloat(localStorage.getItem('沙盘转速'));
  if (isFinite(saved) && saved >= 0 && saved <= 4) { sr.value = String(Math.round(saved * 10)); controls.autoRotateSpeed = saved; }
  const applySpd = () => { const v = +sr.value / 10; controls.autoRotateSpeed = v; sv.textContent = v.toFixed(1); localStorage.setItem('沙盘转速', String(v)); };
  sv.textContent = (+sr.value / 10).toFixed(1);
  sr.addEventListener('input', applySpd);
}
const ENV_BTNS = [['am', 'btnMorn'], ['pm', 'btnDay'], ['n1', 'btnNight'], ['n2', 'btnDeep'], ['cycle', 'btnCycle']];
function setEnvMode(mode) {
  envMode = mode;
  if (mode === 'am') setPhase(0);
  else if (mode === 'pm') setPhase(1);
  else if (mode === 'n1') setPhase(2);
  else if (mode === 'n2') setPhase(3);
  else {
    cycleT = 0;
    storm.decided = ''; storm.on = false; storm.start = -1; storm.inten = 0;
    cycleEnv(0);
  }
  for (const [m, id] of ENV_BTNS)
    document.getElementById(id).classList.toggle('on', m === mode);
}
for (const [m, id] of ENV_BTNS)
  document.getElementById(id).addEventListener('click', () => setEnvMode(m));
{
  const stormBtn = document.getElementById('btnStorm');
  window.syncStormBtn = () => stormBtn.classList.toggle('on', manualStorm > 0);
  stormBtn.addEventListener('click', () => {
    if (manualStorm > 0) manualStorm = 0;
    else { manualStorm = 32 + Math.random() * 8; storm.flashNext = 1.2; }
    syncStormBtn();
  });
}
document.getElementById('btnReset').addEventListener('click', () => {
  camera.position.copy(CAM0);
  controls.target.copy(TGT0);
});
addEventListener('resize', () => {
  if (window.__reflResize) window.__reflResize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (window.__bloomResize) window.__bloomResize(innerWidth, innerHeight);   /* v638 composer 随窗 */
});
/* ?night=1 夜景启动；?cycle=1 滚动日照；?angle=0-3 机位象限；
   ?shot=top 正交俯视；?grid=1 坐标网格+北箭头；带 shot/grid/still 时停自动旋转 */
if (/[?&]night=1/.test(location.search)) setEnvMode('n1');
{ const ph = new URLSearchParams(location.search).get('cine'); if (ph !== null) setTimeout(() => { const b = document.getElementById('btnCine'); if (b && !window.__cine.on) b.click(); }, 1600); }
{ const mm = location.search.match(/[?&]phase=(am|pm|n1|n2)/); if (mm) setEnvMode(mm[1]); }
if (/[?&]cycle=1/.test(location.search)) setEnvMode('cycle');
{
  const m = location.search.match(/[?&]angle=([0-3])/);
  if (m) {
    const q = +m[1];
    const ang = Math.PI / 4 + q * Math.PI / 2;
    const r = CAM0.length();
    camera.position.set(Math.cos(ang) * r * 0.8, 14, Math.sin(ang) * r * 0.8);
  }
}
{
  const P = new URLSearchParams(location.search);
  window.__activeCam = camera;
  if (P.get('cyc')) { const v = +P.get('cyc'); if (v > 10) { DAY_SEC = v; NIGHT_SEC = v; } }
  if (P.get('manual')) window.__manual = true;
  const stormQ = P.get('storm');
  if (stormQ === 'force') window.__stormForce = 'day';
  else if (stormQ === 'forcenight') window.__stormForce = 'night';
  if (P.get('orbit')) {
    controls.autoRotate = false; controls.enabled = false;
    const sph0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    window.__orb = { r: sph0.radius, phi: sph0.phi, th0: sph0.theta, T: +P.get('orbit') };
  }
  if (P.get('dbg')) {
    const mm = [];
    scene.traverse(o => { if (o.isMesh && o.material === M.mountain) mm.push(o); });
    const rc = new THREE.Raycaster();
    const from = camera.position.clone();
    const out = [];
    for (const t of [[-3, 10, -17], [-14, 8, -19.5], [2.2, 9, -10.8]]) {
      const tg = new THREE.Vector3(t[0], t[1], t[2]).sub(from).normalize();
      rc.set(from, tg);
      const hits = rc.intersectObjects(mm, false);
      const h = hits[0];
      out.push('->' + t.join(',') + ': ' + (h ? h.distance.toFixed(1) + 'm faceN.y=' + (h.face ? h.face.normal.y.toFixed(2) : '?') : 'NOHIT'));
    }
    let up = 0, down = 0, flat = 0;
    for (const o of mm) {
      const gg = o.geometry, pp = gg.attributes.position, ii = gg.index;
      for (let f = 0; f < ii.count; f += 3) {
        const A = new THREE.Vector3().fromBufferAttribute(pp, ii.getX(f));
        const B = new THREE.Vector3().fromBufferAttribute(pp, ii.getX(f + 1));
        const C = new THREE.Vector3().fromBufferAttribute(pp, ii.getX(f + 2));
        const ny = B.clone().sub(A).cross(C.clone().sub(A)).y;
        if (ny > 1e-6) up++; else if (ny < -1e-6) down++; else flat++;
      }
    }
    console.log('DBG tris up=' + up + ' down=' + down + ' flat=' + flat);
    const rc2 = new THREE.Raycaster();
    for (const camPos of [[0, 34, 14], [19, 14, 26]]) {
      let miss = 0, tot = 0, hits = [];
      for (const t of [[-14, 4, -19], [-14, 6, -21], [-3, 11, -14], [-3, 13, -19], [2.2, 10, -10.5], [10.5, 6, -13.5], [-20.5, 3, -12.6]]) {
        const from = new THREE.Vector3(camPos[0], camPos[1], camPos[2]);
        const dir = new THREE.Vector3(t[0], t[1], t[2]).sub(from).normalize();
        rc2.set(from, dir);
        tot++;
        const h = rc2.intersectObjects(mm, false)[0];
        if (!h) miss++; else hits.push((h.distance / from.distanceTo(new THREE.Vector3(t[0], t[1], t[2]))).toFixed(2));
      }
      console.log('DBG cam' + camPos.join(',') + ' miss=' + miss + '/' + tot + ' hitRatio=' + hits.join(','));
    }
    console.log('DBG mtn=' + mm.length + ' side=' + M.mountain.side + ' transp=' + M.mountain.transparent +
      ' opac=' + M.mountain.opacity + ' vc=' + M.mountain.vertexColors + ' cam=' + from.toArray().map(v => v.toFixed(0)).join(','));
    console.log('DBG rays ' + out.join(' | '));
    const g0 = mm[0].geometry, p0 = g0.attributes.position;
    console.log('DBG geo0 pos=' + p0.count + ' idx=' + (g0.index ? g0.index.count : 'none') +
      ' colorAttr=' + !!g0.attributes.color + ' tri0N.y=' + (function () {
        const i0 = g0.index.getX(0), i1 = g0.index.getX(1), i2 = g0.index.getX(2);
        const A = new THREE.Vector3().fromBufferAttribute(p0, i0);
        const B = new THREE.Vector3().fromBufferAttribute(p0, i1);
        const C = new THREE.Vector3().fromBufferAttribute(p0, i2);
        return B.sub(A).cross(C.clone().sub(A)).y.toFixed(3);
      })());
  }
  if (P.get('grid') || P.get('shot') === 'top') {
    const gh = new THREE.GridHelper(50, 10, 0x555041, 0x6b6553);
    gh.position.y = 0.035;
    gh.material.transparent = true;
    gh.material.opacity = 0.85;
    scene.add(gh);
    const am = new THREE.MeshBasicMaterial({ color: '#c0451f' });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.8, 8), am);
    cone.rotation.x = -Math.PI / 2; cone.position.set(0, 0.3, -23);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 3), am);
    shaft.position.set(0, 0.3, -19.5);
    scene.add(cone, shaft);
    const lc = document.createElement('canvas'); lc.width = lc.height = 64;
    const lx = lc.getContext('2d');
    lx.fillStyle = '#c0451f';
    lx.font = '46px "KaiTi","STKaiti","Noto Serif CJK SC","WenQuanYi Zen Hei",serif';
    lx.textAlign = 'center'; lx.textBaseline = 'middle';
    lx.fillText('北', 32, 36);
    const lt = new THREE.CanvasTexture(lc);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: lt, transparent: true }));
    lab.rotation.x = -Math.PI / 2;
    lab.position.set(0, 0.06, -16.5);
    scene.add(lab);
  }
  if (P.get('shot') === 'top') {
    const aspect = innerWidth / innerHeight, d = 27.5;
    const top = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 300);
    top.position.set(0.001, 90, 0.001);
    top.up.set(0, 0, -1);
    top.lookAt(0, 0, 0);
    window.__activeCam = top;
  }
  if (P.get('shot') || P.get('grid') || P.has('still')) {
    controls.autoRotate = false;
    document.getElementById('btnRotate').textContent = '▶ 自动旋转';
  }
}

function __stepFn(dt) { window.__stepDt = dt; animate(); }
/* ---------------- 动画循环 ---------------- */
const clock = new THREE.Clock();
/* v639 程序化法线贴图（移植参考版 generateNormalMap）：给无贴图的裸木/瓦/墙石上细节 */
function genNormal(type) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#8080ff'; cx.fillRect(0, 0, 256, 256);
  if (type === 'wood') {
    for (let i = 0; i < 40; i++) {
      cx.strokeStyle = 'rgba(100,100,130,' + (0.3 + Math.random() * 0.4).toFixed(2) + ')';
      cx.lineWidth = 1 + Math.random() * 2; cx.beginPath();
      let x = Math.random() * 256, y = 0; cx.moveTo(x, y);
      while (y < 256) { y += 10 + Math.random() * 20; x += (Math.random() - 0.5) * 3; cx.lineTo(x, y); }
      cx.stroke();
    }
  } else if (type === 'tile') {
    for (let r = 0; r < 8; r++) {
      cx.strokeStyle = 'rgba(90,90,120,0.5)'; cx.lineWidth = 2; cx.beginPath();
      cx.moveTo(0, r * 32 + 16); cx.lineTo(256, r * 32 + 16); cx.stroke();
      for (let c2 = 0; c2 < 8; c2++) { cx.strokeStyle = 'rgba(150,150,180,0.25)'; cx.beginPath(); cx.arc(c2 * 32 + 16, r * 32 + 8, 10, 0.2, 2.94); cx.stroke(); }
    }
  } else {
    for (let i = 0; i < 20; i++) {
      cx.strokeStyle = 'rgba(110,110,140,' + (0.2 + Math.random() * 0.3).toFixed(2) + ')';
      cx.lineWidth = 0.5 + Math.random(); cx.beginPath();
      let x = Math.random() * 256, y = Math.random() * 256; cx.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; cx.lineTo(x, y); }
      cx.stroke();
    }
  }
  const t2 = new THREE.CanvasTexture(cv);
  t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.repeat.set(2, 2);
  return t2;
}
{
  const NM = { wood: genNormal('wood'), tile: genNormal('tile'), stone: genNormal('stone') };
  window.__NM = NM;
  const put = (mt, np, sc) => { if (mt && mt.isMeshStandardMaterial && !mt.normalMap) { mt.normalMap = np.clone(); mt.normalMap.needsUpdate = true; mt.normalScale = new THREE.Vector2(sc, sc); mt.needsUpdate = true; } };
  put(M.wood, NM.wood, 0.5); put(M.woodDark, NM.wood, 0.5); put(M.plank, NM.wood, 0.6); put(M.beam, NM.wood, 0.5);
  put(M.tile, NM.tile, 0.7); put(M.roofTile, NM.tile, 0.7);
  put(M.wall, NM.stone, 0.35); put(M.stone, NM.stone, 0.45);
}

/* v638 材质细化（外部建议#2）：湿润瓦面/包浆木器/哑光灰墙分层 */
M.wood.roughness = 0.78; M.wood.metalness = 0.04;
M.woodDark.roughness = 0.82; M.woodDark.metalness = 0.02;
M.roofTile.roughness = 0.62; M.roofTile.metalness = 0.08;
M.tile.roughness = 0.66; M.tile.metalness = 0.08;
M.doorWood.roughness = 0.74;
M.wall.roughness = 0.88;
if (M.metal) { M.metal.roughness = 0.32; M.metal.metalness = 0.88; }
if (M.iron) { M.iron.roughness = 0.35; M.iron.metalness = 0.85; }
(function () {   /* v641 主楼/东西厢/围墙白面做旧：流挂+霉斑+墙根苔 */
  const ag = (rx, ry) => { const t = new THREE.CanvasTexture(AGING_CANVAS); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; };
  M.wall.map = ag(3, 1.4); M.wall.color.set('#efe9dc');   /* v643 往白靠 */
  M.cream.map = ag(1.5, 1); M.cream.color.set('#f5efe3');   /* v643 更白一档 */
  if (M.wallBase) M.wallBase.color.set('#837e6f');
})();
for (const mk in M) if (M[mk] && M[mk].isMaterial) M[mk].needsUpdate = true;

/* v637 全场景程序化凹凸：从已有 canvas 贴图派生高度图——瓦楞/木纹/石缝的"浮雕感"零 UV 改动上线（Blender 法线方案的本盘平替） */
(function () {
  const seen = new Map();
  function deriveBump(cv) {
    const b = document.createElement('canvas'); b.width = b.height = 128;
    const g = b.getContext('2d');
    try { g.filter = 'grayscale(1) contrast(1.5) brightness(1.06)'; } catch (e) {}
    g.drawImage(cv, 0, 0, 128, 128);
    const tx = new THREE.CanvasTexture(b);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return tx;
  }
  scene.traverse(function (o) {
    if (!o.isMesh || o.isInstancedMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const mt of ms) {
      if (!mt || !mt.isMeshStandardMaterial || mt.bumpMap || !mt.map) continue;
      const im = mt.map.image;
      if (!im || !im.getContext) continue;
      let bt = seen.get(mt.map);
      if (!bt) { bt = deriveBump(im); seen.set(mt.map, bt); }
      const b2 = bt.clone(); b2.needsUpdate = true;
      b2.repeat.copy(mt.map.repeat); b2.offset.copy(mt.map.offset);
      mt.bumpMap = b2; mt.bumpScale = 0.018; mt.needsUpdate = true;
    }
  });
  /* 素面白墙补一层灰泥噪点凹凸（无贴图材质不在上面循环里） */
  const scv = document.createElement('canvas'); scv.width = scv.height = 128;
  {
    const sx = scv.getContext('2d');
    for (let i = 0; i < 2600; i++) { const v = 108 + ((Math.random() * 60) | 0); sx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.5)'; sx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  }
  const stx = new THREE.CanvasTexture(scv); stx.wrapS = stx.wrapT = THREE.RepeatWrapping; stx.repeat.set(4, 4);
  if (M.wall && M.wall.isMeshStandardMaterial && !M.wall.bumpMap) { M.wall.bumpMap = stx; M.wall.bumpScale = 0.008; M.wall.needsUpdate = true; }
  if (M.stone && M.stone.isMeshStandardMaterial && !M.stone.bumpMap) { M.stone.bumpMap = stx.clone(); M.stone.bumpMap.needsUpdate = true; M.stone.bumpScale = 0.012; M.stone.needsUpdate = true; }
})();

/* v638 Bloom 辉光（外部建议#4）：灯笼烛光月华溢光；软渲染/低 FPS 自动旁路 */
window.__bloomOn = true;
if (THREE.EffectComposer && THREE.UnrealBloomPass) {
  const composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.55, 0.8);
  composer.addPass(bloom);
  composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
  window.__composer = composer; window.__bloom = bloom;
  window.__bloomSet = function (n) { bloom.strength = 0.2 + 0.3 * n; bloom.threshold = 0.8 - 0.06 * n; };   /* v639 夜辉光 0.74→0.5：光晕只给灯笼不给天空 */
  window.__bloomResize = function (w, h) { composer.setSize(w, h); };
}

function animate() {
  if (!window.__manual) requestAnimationFrame(animate);
  {   /* v636 实时 FPS（标题下小字，0.5s 一档均值） */
    const _fn = window.__fpsN = (window.__fpsN || 0) + 1;
    const _nt = performance.now();
    if (!window.__fpsT0) window.__fpsT0 = _nt;
    else if (_nt - window.__fpsT0 >= 500) {
      const v = Math.round(_fn * 1000 / (_nt - window.__fpsT0));
      window.__fps = v; window.__fpsN = 0; window.__fpsT0 = _nt;
      const el = document.getElementById('fpsLine');
      if (el) el.textContent = 'FPS ' + v + (v < 25 ? '（软件渲染/高负载）' : '');
    }
  }
  const dt = window.__manual ? (window.__stepDt || 0) : Math.min(clock.getDelta(), 0.1);
  if (window.__manual) window.__simT = (window.__simT || 0) + dt;
  const t = window.__manual ? window.__simT : clock.elapsedTime;

  if (!window.__pel || !window.__pel.on) controls.update();
  window.__shadowTick = (window.__shadowTick + 1) % 12; if (window.__shadowTick === 0) renderer.shadowMap.needsUpdate = true;   /* v635 20Hz→5Hz：2048 阴影全量重建是本盘最大隐形税，5Hz 与太阳角速度肉眼齐平 */
  if (window.__xray) { window.__xray._acc = (window.__xray._acc || 0) + dt; if (window.__xray._acc > 0.12) { window.__xray.tick(window.__xray._acc); window.__xray._acc = 0; } else window.__xray.matLerp(dt); }
  if (window.__gateDoors && __flySet && window.__simT !== undefined) __flySet(window.__simT);
  if (window.__orb) {
    const o = window.__orb;
    camera.position.setFromSphericalCoords(o.r, o.phi, o.th0 + t * Math.PI * 2 / o.T).add(controls.target);
    camera.lookAt(controls.target);
  }
  waterU.uTime.value = t;
  waterU.uSunDir.value.copy(dayNight.sun.position).normalize();
  waterU.uSunInt.value = dayNight.sun.intensity;
  if (causticMats.length) {
    for (const m of causticMats) {
      const u = m.userData;
      if (u.flow) u.tex.offset.y = -t * u.flow;                          /* 流动水体：顺流漂移 */
      else { u.tex.offset.x = Math.sin(t * 0.07) * 0.13;                 /* 静水：缓旋 */
             u.tex.offset.y = Math.cos(t * 0.055) * 0.13; }
    }
    const cK = Math.min(1, dayNight.sun.intensity / 1.35) * (1 - 0.85 * storm.inten);
    for (const m of causticMats) m.opacity = m.userData.o0 * cK;         /* 每帧绝对写：夜≈0，雷雨浑水 */
  }

  const lp = leafGeo.attributes.position.array;
  for (let i = 0; i < LEAF_N; i++) {
    const m = leafMeta[i];
    lp[i * 3 + 1] -= m.fall * dt;
    lp[i * 3] += Math.sin(t * m.sway + m.phase) * 0.4 * dt;
    if (lp[i * 3 + 1] < -0.1) {
      const a = rand() * 6.28, r = rand() * BASE_R;
      lp[i * 3] = Math.cos(a) * r;
      lp[i * 3 + 1] = rr(7, 11);
      lp[i * 3 + 2] = Math.sin(a) * r;
    }
  }
  leafGeo.attributes.position.needsUpdate = true;

  for (const a of animals) {
    if (a.kind === 'chicken' && a.tick) {
      a.tick(dt, t);
    } else if (a.kind === 'chicken') {
      a.obj.rotation.x = Math.max(0, Math.sin(t * 3 + a.obj.userData.phase)) * 0.45;
    } else if (a.kind === 'duck') {
      a.obj.position.y = Math.sin(t * 2 + a.obj.userData.phase) * 0.03;
      a.obj.rotation.y += Math.sin(t * 0.7 + a.obj.userData.phase) * 0.004;
    } else if (a.kind === 'cat' || a.kind === 'dog') {
      a.tick(dt, t);
    } else if (a.kind === 'horse') {
      a.tail.rotation.y = Math.sin(t * 2) * 0.4;
    } else if (a.kind === 'deer') {
      if (a.obj.userData.head) a.obj.userData.head.rotation.x = Math.sin(t * 0.8) * 0.08;
    }
  }
  if (envMode === 'cycle') cycleEnv(dt);
  updateWeather(dt);
  updateCarts(dt, t);
  for (const k of koi) {
    const u = k.userData;
    u.ang += u.spd * dt;
    const s = Math.sign(u.spd);
    k.position.set(POND_X + Math.cos(u.ang) * u.r, 0.08 + Math.sin(t * 2 + u.ang) * 0.012, POND_Z + Math.sin(u.ang) * u.r);
    k.rotation.y = Math.atan2(-Math.sin(u.ang) * s, Math.cos(u.ang) * s);
    u.tail.rotation.y = Math.sin(t * 7 + u.ang * 3) * 0.5;
  }
  for (const cr of critters) {
    if (cr.kind === 'frog') {
      cr.hopAt -= dt;
      if (cr.hopAt <= 0) {
        cr.hopT = 0.55;
        cr.hopAt = rr(3.5, 8);
        cr.z0 = cr.baseZ;
        cr.baseZ += 0.3 * cr.dirZ;
        if (cr.baseZ < cr.zN || cr.baseZ > cr.zX) { cr.dirZ *= -1; cr.baseZ = cr.z0 + 0.3 * cr.dirZ; }
      }
      if (cr.hopT > 0) {
        cr.hopT -= dt;
        const k = 1 - Math.max(0, cr.hopT) / 0.55;
        const lift = Math.sin(k * Math.PI);
        cr.obj.position.y = cr.baseY + lift * 0.16;
        cr.obj.position.z = cr.z0 + (cr.baseZ - cr.z0) * k;
      } else {
        cr.obj.position.y = cr.baseY;
        cr.obj.position.z = cr.baseZ;
      }
      cr.body.scale.y = 0.85 * (1 + Math.sin(t * 2.1 + cr.ph) * 0.06);
    } else {
      cr.turn -= dt;
      if (cr.turn <= 0) { cr.hdg = rand() * Math.PI * 2; cr.turn = rr(2.5, 7); }
      const d = Math.atan2(Math.sin(cr.hdg - cr.obj.rotation.y), Math.cos(cr.hdg - cr.obj.rotation.y));
      cr.obj.rotation.y += d * Math.min(1, dt * 2.5);
      cr.ear.rotation.x = Math.max(0, Math.sin(t * 3 + cr.ph) - 0.8) * 1.2;
      cr.obj.position.y = Math.abs(Math.sin(t * 1.3 + cr.ph)) * 0.01;
    }
  }
  flock.rotation.y = t * 0.12;
  for (const b of flock.children) {
    const u = b.userData;
    b.position.y = u.y0 + Math.sin(t * 1.5 + u.phase) * 0.45;
    const bird = u.bird;
    if (bird) {
      const glide = u.glide && Math.sin(t * 0.5 + u.phase * 2) > 0.45;
      const f = glide ? 0.1 + 0.08 * Math.sin(t * 1.2 + u.phase) : Math.sin(t * 9.5 * u.flapS + u.phase) * 0.78;
      if (bird.wL) bird.wL.rotation.z = f;
      if (bird.wR) bird.wR.rotation.z = -f;
      bird.root.rotation.z = Math.sin(t * 2.4 * u.flapS + u.phase) * 0.10;
      bird.root.rotation.y = Math.sin(t * 0.7 + u.phase) * 0.16;
    }
  }
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 30) c.position.x = -30;
  }
  /* 瀑布：UV 下滚 + 浪花呼吸 + 水点抛溅 */
  if (window.__wfMat) {
    window.__wfMat.map.offset.y -= dt * 0.55;
    window.__wfMat.map.offset.y %= 1;
  }
  {   /* 涟漪：反向滚动 + 异步闪烁，透明度=雨强（夜里压到六成） */
    const showR = storm.inten > 0.03;
    rippleA.visible = rippleB.visible = showR;
    if (showR) {
      rippleMatA.map.offset.y += dt * 0.06; rippleMatA.map.offset.x += dt * 0.017;
      rippleMatB.map.offset.y -= dt * 0.045;
      const nk = dayNight.isNight ? 0.6 : 1;
      rippleMatA.opacity = 0.5 * storm.inten * nk * (0.65 + 0.35 * Math.sin(t * 9));
      rippleMatB.opacity = 0.42 * storm.inten * nk * (0.65 + 0.35 * Math.sin(t * 7.1 + 1.9));
    }
  }
  if (window.__pb) window.__pb.tick(dt, t);
  {
    const fw = window.__flagWave;
    if (fw) {
      const wa = 0.5 + storm.inten * 1.7;
      const spd = 2.6 + storm.inten * 10;
      const pa = fw.fgeo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const bx = fw.fbase[i * 3], by = fw.fbase[i * 3 + 1];
        const d = Math.max(0, Math.min(1, (0.75 - by) / 1.5));
        const a1 = d * d * 0.14 * wa;
        pa.setZ(i, Math.sin(by * 3.4 - t * spd + bx * 2.2) * a1 + Math.sin(by * 7.8 + t * spd * 1.6) * a1 * 0.55);
        pa.setX(i, bx + d * d * 0.028 * wa * Math.sin(by * 4.4 + t * spd * 0.8));
      }
      pa.needsUpdate = true;
      fw.fgeo.computeVertexNormals();
      fw.flag.rotation.y = Math.sin(t * (1.4 + storm.inten * 6)) * (0.06 + storm.inten * 0.22);
    }
  }
  if (window.__wuNav) {
    const pbP = window.__pb ? window.__pb.g.position : null;
    window.__wuNav.forEach((w, wi) => {
      const g0 = w.g;
      w.wait -= dt;
      if (pbP && Math.hypot(pbP.x - g0.position.x, pbP.z - g0.position.z) < 3.6) {
        let vx = g0.position.x - pbP.x, vz = g0.position.z - pbP.z;
        const vl = Math.hypot(vx, vz) || 1; vx /= vl; vz /= vl;
        w.tx = Math.max(-10.4, Math.min(-3.8, g0.position.x + vx * 3.2));
        w.tz = Math.max(rzAtG(w.tx) - 2.6, Math.min(rzAtG(w.tx) + 2.9, g0.position.z + vz * 3.2));
        w.wait = Math.max(w.wait, 0.8);
      }
      if (w.wait <= 0 && Math.hypot(w.tx - g0.position.x, w.tz - g0.position.z) < 0.45) {
        w.tx = -10.4 + Math.random() * 6.6;
        w.tz = rzAtG(w.tx) + (Math.random() * 5.5 - 2.6);
        w.wait = 2 + Math.random() * 4;
      } else if (w.wait <= 0) {
        const w2o = window.__wuNav[1 - wi];
        if (Math.hypot(w2o.g.position.x - w.tx, w2o.g.position.z - w.tz) < 1.5) {
          w.tx = -10.4 + Math.random() * 6.6; w.tz = rzAtG(w.tx) + (Math.random() * 5.5 - 2.6);
        }
      }
      if (w.wait <= 0) {
        const dx0 = w.tx - g0.position.x, dz0 = w.tz - g0.position.z;
        const dl = Math.hypot(dx0, dz0);
        if (dl > 0.1) {
          g0.position.x += dx0 / dl * w.spd * dt; g0.position.z += dz0 / dl * w.spd * dt;
          const yw = Math.atan2(-dz0, dx0);
          let dy2 = yw - g0.rotation.y; dy2 = Math.atan2(Math.sin(dy2), Math.cos(dy2));
          g0.rotation.y += Math.max(-0.9 * dt, Math.min(0.9 * dt, dy2));
        }
      }
      g0.position.y = 0.16 + Math.sin(t * 1.5 + wi * 2.4) * 0.02;
      g0.rotation.z = Math.sin(t * 1.15 + wi) * 0.03;
    });
  }
  {
    const windS = 0.9 + storm.inten * 1.6;
    const windA = 0.006 + storm.inten * 0.055;
    for (const tg2 of treeFx) {
      tg2.rotation.z = Math.sin(t * windS + tg2.userData.sw.ph) * windA;
      tg2.rotation.x = Math.sin(t * windS * 0.7 + tg2.userData.sw.ph * 1.3) * windA * 0.7;
    }
    if (window.__willowBr) {
      const amp = windA * 3.4;
      for (const br of window.__willowBr) {
        const s2 = Math.sin(t * windS * 1.15 + br.userData.ph) * amp * 1.25;
        br.rotation.x = s2; br.rotation.z = Math.sin(t * windS * 0.71 + br.userData.ph * 1.9) * amp * 0.4;
      }
    }
  }
  for (const b of bambooFx) {
    b.g.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.017 / b.s;
    b.g.rotation.x = Math.sin(t * 0.62 + b.ph * 1.7) * 0.011 / b.s;
  }
  for (const rd of reedFx)
    rd.g.rotation.x = Math.sin(t * 1.25 + rd.ph) * 0.055;
  for (const sp of splashFx) {
    const k = 1 + 0.18 * Math.sin(t * 9 + sp.userData.ph);
    sp.scale.setScalar(sp.userData.s0 * k);
    sp.position.y = (sp.userData.y0 || 0.22) + 0.04 * Math.sin(t * 7 + sp.userData.ph);
  }
  for (const dr of dropFx) {
    const u = (t * 0.9 + dr.userData.ph * 4) % 1;
    const r = dr.userData.r0 * (0.4 + u * 1.1);
    const rw = dr.userData.h0 ? r * 0.6 : r;
    dr.position.set(
      dr.userData.ux + Math.cos(dr.userData.a) * rw,
      (dr.userData.yb || 0.14) + u * (1 - u) * 2.1 * (dr.userData.h0 || 1),
      dr.userData.uz + Math.sin(dr.userData.a) * rw);
    dr.material.opacity = 0.75 * (1 - u * u);
  }
  for (const tf of torchFires) {
    const fl = 1 + Math.sin(t * 11 + tf.ph) * 0.1 + Math.sin(t * 23 + tf.ph * 2) * 0.05;
    const ps = tf.holder.userData.parts;
    if (ps && ps.length === 3) {
      const [o, m0, c0] = ps;
      o.scale.set(1 + 0.07 * Math.sin(t * 7.3 + tf.ph), fl, 1 + 0.07 * Math.cos(t * 6.1 + tf.ph));
      m0.scale.set(1 - 0.05 * Math.sin(t * 9.1 + tf.ph), fl * 0.97, 1);
      c0.scale.set(1, 1 + Math.sin(t * 13 + tf.ph * 3) * 0.09, 1);
      o.rotation.y = t * 1.2 + tf.ph; m0.rotation.y = -t * 1.7 + tf.ph; c0.rotation.y = t * 2.3;
      tf.holder.rotation.z = Math.sin(t * 3.1 + tf.ph) * 0.06;
    }
    const p = tf.epos;
    for (let i = 0; i < tf.EG; i++) {
      tf.elife[i] -= dt * 0.5;
      if (tf.elife[i] <= 0) tf.elife[i] = 1;
      const l = tf.elife[i], u = 1 - l;
      p[i * 3] = Math.sin(i * 2.4 + tf.ph) * 0.05 + Math.sin(t * 2.2 + i * 1.3) * 0.05 * u;
      p[i * 3 + 1] = 2.14 + u * 1.05;
      p[i * 3 + 2] = Math.cos(i * 1.7 + tf.ph) * 0.05 + Math.cos(t * 1.9 + i * 0.9) * 0.04 * u;
    }
    tf.ep.geometry.attributes.position.needsUpdate = true;
  }
  const smokeSet = scene.userData.smokeSet;
  if (smokeSet && smokeSet.userData.smoke) {
    const y0 = smokeSet.userData.chimneyTop || 5.0;
    const windK = 0.5 + storm.inten * 1.6;
    smokeSet.userData.smoke.forEach((p, i) => {
      const k = (t * 0.38 + i * 0.167) % 1;
      p.position.y = y0 + k * 3.4;
      p.position.x = 1.2 + Math.sin(t * 0.9 + i * 1.7) * 0.12 + k * windK;
      p.position.z = Math.sin(t * 0.6 + i * 2.3) * 0.1 + k * 0.22;
      const sz = 0.9 + k * 2.6;
      p.scale.set(sz, sz * 0.72, 1);
      p.material.opacity = 0.34 * Math.sin(k * Math.PI) * (1 - 0.45 * cloudN);
      p.material.color.set('#e8e4da').lerp(_sk.set('#5a6376'), cloudN);
    });
  }
  const fg = scene.userData.flagGroup;
  if (fg) fg.userData.flag.rotation.y = Math.sin(t * 2.2) * 0.12;

  /* ============ 🎬 电影模式（自包含：辉光精灵/光柱/LUT/暗角遮幅/闪电全屏闪/影子省算力） ============ */
  if (window.__cine === undefined) {
    const cine = window.__cine = { on: false, halos: [], shafts: [], frame: 0 };
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'); const rg = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      rg.addColorStop(0, 'rgba(255,232,180,1)'); rg.addColorStop(0.25, 'rgba(255,205,120,.55)');
      rg.addColorStop(0.6, 'rgba(255,170,80,.14)'); rg.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const shaftTex = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128;
      const g = c.getContext('2d'); const lg = g.createLinearGradient(0, 0, 0, 128);
      lg.addColorStop(0, 'rgba(255,214,140,.5)'); lg.addColorStop(0.7, 'rgba(255,190,110,.08)'); lg.addColorStop(1, 'rgba(255,180,100,0)');
      g.fillStyle = lg; g.beginPath(); g.moveTo(24, 0); g.lineTo(40, 0); g.lineTo(60, 128); g.lineTo(4, 128); g.closePath(); g.fill();
      return new THREE.CanvasTexture(c);
    })();
    cine.build = function () {
      if (cine.built) return; cine.built = true;
      dayNight.lanternLights.forEach(L => {
        if (!L.parent) return;
        const wp = L.getWorldPosition(new THREE.Vector3());
        const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
        h.position.copy(wp); h.scale.setScalar(1.1); h.renderOrder = 20;
        scene.add(h); cine.halos.push(h);
        if (wp.y > 1.2 && wp.y < 4.6) {
          const sh = new THREE.Sprite(new THREE.SpriteMaterial({ map: shaftTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
          sh.position.set(wp.x, wp.y - 0.62, wp.z); sh.scale.set(0.95, 1.24, 1); sh.renderOrder = 19;
          scene.add(sh); cine.shafts.push(sh);
        }
      });
    };
    const LUTS = {
      am: 'saturate(1.06) contrast(1.05) brightness(1.02)',
      pm: 'saturate(1.16) contrast(1.05) sepia(0.12) brightness(1.01)',
      n1: 'saturate(0.94) contrast(1.1) hue-rotate(-6deg) brightness(0.99)',
      n2: 'saturate(0.88) contrast(1.14) hue-rotate(-10deg) brightness(0.95)'
    };
    cine.applyLut = function (key) {
      const cv = document.querySelector('canvas');
      if (cv) { cv.style.transition = 'filter 1.4s ease'; cv.style.filter = cine.on ? (LUTS[key] || LUTS.am) : 'none'; }
      const vg = document.getElementById('cineVignette'), br = document.getElementById('cineBars');
      if (vg) vg.style.opacity = cine.on ? '1' : '0';
      if (br) br.style.opacity = cine.on ? '1' : '0';
      if (cine.on) cine.build();
      if (!cine.on) { cine.halos.forEach(h => { h.material.opacity = 0; }); cine.shafts.forEach(sh => { sh.material.opacity = 0; }); }
      renderer.shadowMap.needsUpdate = true;
    };
    cine.tick = function (t) {
      if (!cine.on) return;
      cine.frame++;
      const nn = CE.n;
      cine.build();
      const flick = 1 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 13.1) * 0.03;
      cine.halos.forEach((h, i) => {
        h.material.opacity = 0.5 * nn * flick;
        h.scale.setScalar(1.0 + nn * 0.5 + Math.sin(t * 3.1 + i) * 0.06);
      });
      cine.shafts.forEach(sh => { sh.material.opacity = 0.34 * nn * flick; });
      const fl = document.getElementById('cineFlash');
      if (fl) {
        const k = storm.flash > 0 ? Math.min(1, storm.flash / 0.2) : 0;
        fl.style.opacity = (k * (dayNight.isNight ? 0.4 : 0.22)).toFixed(3);
      }
      if (cine.frame % 3 === 0) renderer.shadowMap.needsUpdate = true;
    };
    const btn = document.getElementById('btnCine');
    if (btn) btn.addEventListener('click', () => {
      cine.on = !cine.on;
      btn.classList.toggle('on', cine.on);
      cine.applyLut(CE.envKey);
      if (cine.on) renderer.shadowMap.needsUpdate = true;
    });
    cine.applyLut('am');
  }
  window.__cine.tick(t);
  if (window.__fwUpdate) window.__fwUpdate(dt);
  if (window.__pelShells) for (const sh of window.__pelShells) sh.g.visible = true;
  if (window.__pelUpdate) window.__pelUpdate(dt);
  if (window.__bathSteam) {
    for (const st of window.__bathSteam) {
      st.t += dt * 0.11;
      if (st.t > 1) st.t -= 1;
      st.s.position.y = 1.0 + st.t * 1.35;
      st.s.material.opacity = 0.3 * Math.sin(st.t * Math.PI);
      const sc2 = 0.7 + st.t * 0.9;
      st.s.scale.set(sc2, sc2 * 0.66, 1);
    }
  }
  if (window.__reflPass) window.__reflPass();
  { const _cam = window.__activeCam || camera;
    if (window.__composer && _cam === camera && window.__bloomOn !== false && !window.__softGL && (window.__fps === undefined || window.__fps >= 28)) window.__composer.render();
    else renderer.render(scene, _cam); }
}
window.__step = __stepFn;
window.__hideDecor = function (hide, keepSpots) {   /* 视频运镜避障：隐藏挂枝/竹/芦苇/地被（树保留，keepSpots 株留帘） */
  const keep = keepSpots || [];
  scene.children.forEach(function (g2) { if (g2.userData && g2.userData.spot !== undefined) {
    const on = !hide || keep.indexOf(g2.userData.spot) >= 0;
    for (let k = 1; k < g2.children.length; k++) g2.children[k].visible = on;
  } });
  for (const a2 of ['bambooFx', 'reedFx', 'grassFx']) { const L = window[a2]; if (L) for (const o of L) { const g = o && (o.g || o); if (g && g.isObject3D) g.visible = !hide; } }
  scene.traverse(function (o) {
    if (o.isMesh && o.material && o.material.name && /m_bamboo|m_tuft|m_flower|m_reed/.test(o.material.name)) o.visible = !hide;
  });
  window.__fxHide = hide ? 1 : 0;
};
if (!window.__manual) animate();
/* ---- 🎥 无人机运镜引擎（视频用；manual 模式 __step 驱动） ---- */
{
  const KF = {
    gate: { openAt: 8.0, kf: [
      /* p:[x,y,z] look:[x,y,z] t(秒) — 全程避开檐口；t15 起高轨飞越门楼（屋脊 y5.45） */
      { t: 0,  p: [0.0, 1.7, 16.9],  lk: [0.0, 2.3, 19.9] },
      { t: 2,  p: [0.0, 1.7, 16.9],  lk: [0.0, 2.3, 19.9] },
      { t: 4,  p: [0.0, 3.6, 14.2],  lk: [0.0, 3.0, 11.0] },
      { t: 7,  p: [0.0, 4.4, 12.0],  lk: [0.0, 3.0, 8.6] },
      { t: 9.5,p: [0.0, 5.0, 10.4],  lk: [0.0, 3.4, 6.0] },
      { t: 11, p: [0.0, 6.6, 8.6],   lk: [0.0, 3.8, 4.2] },
      { t: 12.5, p: [0.0, 7.6, 7.8], lk: [0.0, 2.6, 3.0] },
      { t: 14.5, p: [0.0, 9.4, 6.4], lk: [0.0, 1.2, -1.0] },
      { t: 19, p: [0.0, 7.6, 4.4],   lk: [0.0, 0.6, -5.0] },
      { t: 24, p: [0.2, 10.5, 2.0],  lk: [0.0, 0.4, -6.0] },
      { t: 30, p: [0.6, 13.5, 1.6],  lk: [0.0, 0.3, -5.5] },
      { t: 36, p: [0.8, 14.0, 2.2],  lk: [0.0, 0.3, -5.2] }
    ] },
    fall: { openAt: 6.6, kf: [
      { t: 0,    p: [-17.2, 9.2, -7.2],  lk: [-16.4, 5.5, -8.0] },
      { t: 2.5,  p: [-16.9, 6.0, -8.4],  lk: [-18.0, 1.5, -3.0] },
      { t: 4.5,  p: [-19.0, 2.4, -5.0],  lk: [-19.8, 0.6, -1.0] },
      { t: 6.5,  p: [-19.5, 3.2, -0.6],  lk: [-19.2, 1.2, 5.0] },
      { t: 7.2,  p: [-18.6, 2.9, 4.2],   lk: [-17.9, 1.5, 9.0] },
      { t: 10,   p: [-18.0, 3.0, 7.2],   lk: [-16.7, 1.8, 11.6] },
      { t: 11.5, p: [-16.9, 3.1, 11.2],  lk: [-16.75, 1.6, 15.0] },
      { t: 13.5, p: [-16.78, 1.5, 13.4], lk: [-16.6, 1.4, 16.5] },
      { t: 15.5, p: [-16.8, 1.35, 15.4], lk: [-16.2, 1.9, 19.0] },
      { t: 18,   p: [-14.8, 3.2, 17.2],  lk: [-9.0, 2.6, 20.2] },
      { t: 20,   p: [-11.0, 3.0, 18.8],  lk: [-4.5, 2.6, 21.6] },
      { t: 21, p: [2.6, 2.4, 24.0],    lk: null, orb: { r: 6.4, h: 5.8, w0: -0.5 } },
      { t: 33, p: [4.6, 4.0, 24.5],    lk: null, orb: { r: 5.8, h: 5.8, w0: 2.2 } },
      { t: 34.4, p: [3.5, 4.2, 23.0],  lk: null, orb: { r: 5.8, h: 5.8, w0: 2.55 } },
      { t: 35, p: [8.0, 7.0, 25.5],    lk: [2.0, 2.0, 16.0] },
      { t: 38.5, p: [14.0, 11.5, 26.5], lk: [1.0, 2.5, 8.0] },
      { t: 41, p: [21.5, 16.0, 30.0],  lk: [0.0, 2.5, 0.0] },
      { t: 46, p: [21.5, 16.0, 30.0],  lk: [0.0, 2.5, 0.0] }
    ] }
  };
  const v = new URLSearchParams(location.search).get('fly');
  const route = KF[v] && KF[v].kf;
  const openAt = KF[v] ? KF[v].openAt : 1e9;
  if (route) {
    const vp = a => a.slice();
    function seg(tt) {
      let i = 0;
      while (i < route.length - 2 && route[i + 1].t <= tt) i++;
      const A = route[i], B = route[i + 1];
      let k = (tt - A.t) / (B.t - A.t); k = Math.max(0, Math.min(1, k));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      return { A, B, e };
    }
    window.__flySet = function (tt) {
      const { A, B, e } = seg(tt);
      const P = A.p.map((q, j) => q + (B.p[j] - q) * e);
      camera.position.set(P[0], P[1], P[2]);
      let L;
      if (A.lk && B.lk) L = A.lk.map((q, j) => q + (B.lk[j] - q) * e);
      else {
        const tPb = window.__pb ? window.__pb.g.position : new THREE.Vector3(6, 0.4, 22);
        const oa = A.orb && B.orb ? A.orb.w0 + (B.orb.w0 - A.orb.w0) * e : (A.orb || B.orb).w0;
        const or = A.orb && B.orb ? A.orb.r + (B.orb.r - A.orb.r) * e : (A.orb || B.orb).r;
        const oh = A.orb && B.orb ? A.orb.h + (B.orb.h - A.orb.h) * e : (A.orb || B.orb).h;
        L = [tPb.x, oh - 1.6, tPb.z];
        camera.position.set(tPb.x + Math.cos(oa) * or, oh + 0.6, tPb.z + Math.sin(oa) * or);
      }
      camera.up.set(0, 1, 0);
      camera.lookAt(L[0], L[1], L[2]);
      if (v === 'fall') {
        const dk = Math.max(0, Math.min(1, (tt - 33) / 5));
        if (dk > 0) window.__duskMix(dk);
        const shots = [[37.6, 0, -1.5], [38.9, 3.2, 1.8], [40.2, -3, 2.4], [41.6, 0.6, 3.6], [43, -2.4, -1.2], [44.3, 2.2, -2.6]];
        for (const sh2 of shots) {
          if (!window.__fwSys.fired[sh2[0]] && tt >= sh2[0]) { window.__fwSys.fired[sh2[0]] = 1; window.__fwSys.spawn(sh2[1], 8.6 + (sh2[0] % 1) * 2.2, sh2[2]); }
        }
      }
      const gd = window.__gateDoors;
      if (gd) {
        const open = Math.max(0, Math.min(1, (tt - openAt) / 1.8));
        gd[0].rotation.y = -open * 1.05;
        gd[1].rotation.y = open * 1.05;
      }
    };
    __flySet = window.__flySet;
    window.__flyDur = route[route.length - 1].t;
    controls.enabled = false; controls.autoRotate = false;
    console.log('[沙盘] 运镜航线 ' + v + ' 就绪 ' + window.__flyDur + 's');
  }
}

/* v5.48 启动遮罩控制器：磨砂玻璃盖到「GLB 全载 + 树阵生成完」才放行（用户令） */
requestAnimationFrame(function () {
  const el = document.getElementById('loading');
  if (!el) return;
  const bar = document.getElementById('ldBar'), txt = document.getElementById('ldTxt');
  const st = { req: 0, done: 0 };
  const orig = window.__loadGLB;
  if (orig && !orig.__bootHooked) {
    const w = function (file) {
      st.req++;
      const t2 = performance.now();
      const p = orig.apply(null, arguments);
      p.then(function () { st.done++; st.last = String(arguments[0] || '').split('/').pop().replace('.glb', ''); }, function () { st.done++; });
      p.then(function (o) { (window.__glbT = window.__glbT || []).push([String(file).split('/').pop(), Math.round(performance.now() - t2)]); }, function () {});
      return p;
    };
    w.__bootHooked = 1;
    window.__loadGLB = w;
  }
  let shown = 0, ceil = 0, finT = 0;
  const t0 = performance.now();
  const CN = { pelican: '鹈鹕', horse: '马群', deer: '小鹿', cat: '猫摊', dog: '狗摊', bird: '鸟群', fish: '鱼群', boat: '乌篷船', paintboat: '画舫', treasures: '宝箱', flamingo: '火烈鸟', bamboo: '竹林', railing: '栏杆', bridge: '石桥' };
  function dismiss() {
    if (!window.__profShown) {
      window.__profShown = 1;
      window.__mark('进入沙盘');
      const P = window.__prof, T = (window.__glbT || []).slice().sort((a, b2) => b2[1] - a[1]);
      console.log('%c—— 启动分段耗时（自页面起点的时刻 ms）——', 'color:#e7bd4a');
      console.table(P.map((r, i) => ({ 阶段: r[0], 时刻ms: r[1], 上段耗时ms: i ? r[1] - P[i - 1][1] : '-' })));
      if (T.length) console.log('%cGLB 下载+解析耗时排名: ' + T.map(r => r[0] + ' ' + r[1] + 'ms').join(' | '), 'color:#7ad7ff');
      window.__profReport = () => console.table(P.map((r, i) => ({ 阶段: r[0], 时刻ms: r[1], 上段耗时ms: i ? r[1] - P[i - 1][1] : '-' })));
    }
    el.style.opacity = 0;
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 950);
  }
  const iv = setInterval(function () {
    /* v644 阶梯进度：结构 0~42 → 逐文件 42~88（带资产名）→ 收尾 88~100 缓爬 720ms；
       显示值按 90ms tick 缓动逼近上限：解码长任务吞掉定时器后连续补画，不再 42→100 蹦极 */
    let p = ((window.__bootStage || 0) / 4) * 42;
    if (st.req > 0) p = Math.max(p, 42 + 46 * Math.min(1, st.done / st.req));
    const glbOK = (window.__glbs || []).length >= 6 && (!st.req || st.done >= st.req);
    const treesOK = typeof treeFx !== "undefined" && treeFx.length >= 150 && (window.__groundDone || treeFx.length >= 900);
    if (p < 88 && glbOK && treesOK) p = 88;
    if (glbOK && treesOK) {
      if (!finT) finT = performance.now();
      p = Math.min(100, 88 + (performance.now() - finT) / 60);
    }
    if (performance.now() - t0 > 60000) p = 100;   /* 兜底：60 秒强制放行 */
    ceil = Math.max(ceil, p);
    shown = Math.min(ceil, shown + Math.max(0.9, (ceil - shown) * 0.18));
    const ip = Math.floor(shown);
    if (bar) bar.style.width = ip + '%';
    if (txt) txt.textContent = ip >= 100 ? '加载完毕 · 点击进入沙盘'
      : '正在加载中 ' + ip + '%' + (ip >= 42 && ip < 88 && st.last ? ' · ' + (CN[st.last] || st.last) : '');
    if (ip >= 100) {
      clearInterval(iv);
      el.style.cursor = 'pointer';
      el.onclick = dismiss;
      setTimeout(dismiss, 5000);
    }
  }, 90);
});
