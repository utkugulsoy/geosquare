// The app's illustrated backdrop, ported from ThemeBackground / GlobeHorizon
// in Theme.swift. The geometry is copied rather than reinvented — same disc
// radius, same continent blobs, same rim light and flight arc — so the page
// and the app are recognisably one product.

const SKY = { top: '#0E2750', bottom: '#081A3A' };  // AppColor.background → .backgroundDeep

/** SplitMix64-ish seeded noise, standing in for SeededRandomNumberGenerator:
 *  the star field has to be the same every load, not twinkling on refresh. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawStars(ctx, w, h) {
  const rnd = seeded(0xC0FFEE);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w;
    const y = rnd() * h * 0.7;          // stars keep to the upper sky
    const r = 0.8 + rnd() * 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Each continent is a cluster of overlapping ellipses, clipped to the disc, so
// the coastlines read as coasts rather than as a circle. Fractions are the
// app's, verbatim: x, y, width, height, rotation.
const CONTINENTS = [
  [[0.12, 0.44, 0.30, 0.16, -14], [0.26, 0.52, 0.18, 0.12, 22], [0.05, 0.60, 0.16, 0.10, 8], [0.34, 0.42, 0.10, 0.08, 0]],
  [[0.56, 0.36, 0.22, 0.13, 10], [0.66, 0.44, 0.16, 0.11, -18], [0.48, 0.46, 0.10, 0.07, 30]],
  [[0.90, 0.50, 0.20, 0.11, -8], [0.82, 0.60, 0.12, 0.08, 15]],
  [[0.40, 0.66, 0.14, 0.08, 18], [0.47, 0.72, 0.08, 0.06, -10]],
];

function drawGlobe(ctx, w, h) {
  const radius = w * 1.35;
  const cx = w / 2;
  const cy = h * 0.28 + radius;

  const disc = () => { ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); };

  ctx.save();
  ctx.filter = 'blur(18px)';            // atmosphere just outside the rim
  disc(); ctx.fillStyle = 'rgba(58,155,255,0.55)'; ctx.fill();
  ctx.restore();

  const ocean = ctx.createRadialGradient(cx, cy - radius * 0.98, 0, cx, cy - radius * 0.98, radius * 1.3);
  ocean.addColorStop(0, '#3A96F5');
  ocean.addColorStop(0.5, '#1B5FC2');
  ocean.addColorStop(1, '#0E3F8E');
  disc(); ctx.fillStyle = ocean; ctx.fill();

  ctx.save();
  disc(); ctx.clip();
  // Blob radii scale with the width in the app, while the band's height comes
  // from the viewport height. On a phone those are in proportion (390 wide
  // against a 186pt band); on a wide window they are not, and the continents
  // grow until they fill the band and swallow the ocean. Capping the scale at
  // a ratio near the phone's keeps narrow screens identical to the app and
  // stops wide ones degenerating. Clamping all the way to the phone's exact
  // 2.1 went too far the other way — a wide band then showed specks. The app has the same latent issue in iPad
  // landscape — this is the first place it was visible.
  const scale = Math.min(w, h * 3.0);
  const land = ctx.createLinearGradient(0, h * 0.3, w, h);
  land.addColorStop(0, '#8BE06A');
  land.addColorStop(1, '#4CAF50');
  for (const blobs of CONTINENTS) {
    const path = new Path2D();
    for (const [bx, by, bw, bh, rot] of blobs) {
      // Both radii scale with the width, as in the app, so the land keeps its
      // proportion to the disc rather than to the band.
      path.ellipse(bx * w, by * h, (bw * scale) / 2, (bh * scale) / 2, (rot * Math.PI) / 180, 0, Math.PI * 2);
    }
    ctx.save();
    ctx.filter = 'blur(3px)';
    ctx.fillStyle = 'rgba(11,46,107,0.5)';   // soft coastal shadow
    ctx.fill(path);
    ctx.restore();
    ctx.fillStyle = land;
    ctx.fill(path);
  }
  ctx.restore();

  ctx.beginPath();                      // rim light along the top
  ctx.arc(cx, cy, radius - 1, (240 * Math.PI) / 180, (300 * Math.PI) / 180);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.stroke();

  ctx.beginPath();                      // dashed flight arc
  ctx.moveTo(-10, h * 0.55);
  ctx.quadraticCurveTo(w * 0.5, h * 0.05, w + 10, h * 0.30);
  ctx.setLineDash([5, 6]);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}

function paintBackdrop() {
  const sky = document.getElementById('sky');
  const globe = document.getElementById('globe');
  if (!sky || !globe) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  for (const [cv, h] of [[sky, window.innerHeight], [globe, Math.round(window.innerHeight * 0.22)]]) {
    cv.width = Math.round(window.innerWidth * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, h);
    if (cv === sky) drawStars(ctx, window.innerWidth, h);
    else drawGlobe(ctx, window.innerWidth, h);
  }
}

window.addEventListener('resize', paintBackdrop);
paintBackdrop();
