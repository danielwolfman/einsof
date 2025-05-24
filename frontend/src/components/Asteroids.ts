// Asteroid logic, rendering, and helpers
export interface Asteroid {
  x: number;
  y: number;
  z: number;
  size: number;
  speed: number;
  outer: Array<{ x: number; y: number }>;
  holes: Array<Array<{ x: number; y: number }>>;
  color: string;
  angle: number;
  spin: number;
  opacity: number;
}

export function sortAsteroidsByZ(asteroids: Asteroid[]) {
  return [...asteroids].sort((a, b) => a.z - b.z);
}

export function drawAsteroids(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, asteroids: Asteroid[], projectStar: any, fov: number, aspect: number) {
  const sorted = sortAsteroidsByZ(asteroids);
  sorted.forEach(asteroid => {
    const proj = projectStar(asteroid, canvas, fov, aspect);
    context.save();
    const asteroidAlpha = (asteroid.opacity !== undefined ? asteroid.opacity : 1) * 0.95;
    context.globalAlpha = asteroidAlpha;
    context.translate(proj.x, proj.y);
    const scale = canvas.width / (asteroid.z * fov) * 0.5;
    context.scale(scale, scale);
    context.rotate(asteroid.angle);
    context.shadowColor = 'rgba(0,0,0,0.4)';
    context.shadowBlur = 12;
    context.beginPath();
    context.moveTo(asteroid.outer[0].x, asteroid.outer[0].y);
    asteroid.outer.forEach((pt, i) => { if (i > 0) context.lineTo(pt.x, pt.y); });
    context.closePath();
    asteroid.holes.forEach(hole => {
      context.moveTo(hole[0].x, hole[0].y);
      for (let i = hole.length - 1; i >= 0; i--) {
        const pt = hole[i];
        context.lineTo(pt.x, pt.y);
      }
      context.closePath();
    });
    const grad = context.createRadialGradient(0, 0, asteroid.size * 0.2, 0, 0, asteroid.size);
    grad.addColorStop(0, '#fff8');
    grad.addColorStop(0.2, asteroid.color);
    grad.addColorStop(1, '#222');
    context.fillStyle = grad;
    context.fill('evenodd');
    context.globalAlpha = asteroidAlpha;
    context.lineWidth = 2;
    context.strokeStyle = '#222';
    context.stroke();
    context.restore();
  });
}

// Add asteroid generation logic to Asteroids.ts
// Fix asteroid spawn z to be much closer so they appear on screen
export function generateAsteroid3D(
  canvas: HTMLCanvasElement,
  spaceshipWidth: number,
  spaceshipHeight: number,
  minZFactor: number,
  maxZFactor: number,
  minSpeed: number,
  maxSpeed: number
): Asteroid {
    const fov = Math.tan(60 * Math.PI / 180 / 2);
    const aspect = canvas.width / canvas.height;
    function randCenterBias() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        num = 0.5 + num * 0.18;
        return Math.max(0, Math.min(1, num));
    }
    // Use minZFactor and maxZFactor for spawn z
    const STARFIELD_DEPTH = 1200; // Should match GameCanvas
    const z = STARFIELD_DEPTH * (minZFactor + Math.random() * (maxZFactor - minZFactor));
    const sx = randCenterBias();
    const sy = randCenterBias();
    const x = ((sx - 0.5) * 2 * z * fov) / aspect;
    const y = ((sy - 0.5) * 2 * z * fov);
    const size = 500 + Math.random() * 1200; // much smaller asteroids for visibility
    const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
    const points = 18 + Math.floor(Math.random() * 6);
    const outer: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const r = size * (0.85 + Math.sin(angle * 3 + Math.random() * 2) * 0.08 + Math.random() * 0.12);
        outer.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    const holes: Array<Array<{ x: number; y: number }>> = [];
    const mainHoleAngle = Math.random() * Math.PI * 2;
    const mainHoleDist = size * 0.15 + Math.random() * size * 0.18;
    const mainHoleCx = Math.cos(mainHoleAngle) * mainHoleDist;
    const mainHoleCy = Math.sin(mainHoleAngle) * mainHoleDist;
    const minMainHoleW = Math.max(spaceshipWidth * 1.15, size * 0.28);
    const minMainHoleH = Math.max(spaceshipHeight * 1.15, size * 0.28);
    const maxMainHoleW = Math.max(minMainHoleW, size * 0.32);
    const maxMainHoleH = Math.max(minMainHoleH, size * 0.32);
    holes.push(generateAsteroidHole(mainHoleCx, mainHoleCy, minMainHoleW, minMainHoleH, maxMainHoleW, maxMainHoleH));
    const extraHoles = 1 + Math.floor(Math.random() * (3 - 1 + 1));
    for (let i = 0; i < extraHoles; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = size * 0.2 + Math.random() * size * 0.5;
        const cx = Math.cos(angle) * dist;
        const cy = Math.sin(angle) * dist;
        const minW = spaceshipWidth * (0.5 + Math.random() * 0.7);
        const minH = spaceshipHeight * (0.5 + Math.random() * 0.7);
        const maxW = Math.max(minW, size * 0.18 + Math.random() * size * 0.12);
        const maxH = Math.max(minH, size * 0.18 + Math.random() * size * 0.12);
        holes.push(generateAsteroidHole(cx, cy, minW, minH, maxW, maxH));
    }
    const color = `hsl(${20 + Math.random() * 30}, 30%, ${35 + Math.random() * 20}%)`;
    const angle = Math.random() * Math.PI * 2;
    const spin = (Math.random() < 0.5 ? 1 : -1) * (0.001 + Math.random() * (0.004 - 0.001));
    const opacity = 0;
    return { x, y, z, size, speed, outer, holes, color, angle, spin, opacity };
}

function generateAsteroidHole(cx: number, cy: number, minW: number, minH: number, maxW: number, maxH: number) {
    const holeW = minW + Math.random() * (maxW - minW);
    const holeH = minH + Math.random() * (maxH - minH);
    const holeAngle = Math.random() * Math.PI * 2;
    const holePoints = 18;
    const arr: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < holePoints; i++) {
        const angle = holeAngle + (i / holePoints) * Math.PI * 2;
        const rw = holeW * (0.95 + Math.sin(angle * 2 + Math.random()) * 0.04) / 2;
        const rh = holeH * (0.95 + Math.cos(angle * 2 + Math.random()) * 0.04) / 2;
        arr.push({ x: cx + Math.cos(angle) * rw, y: cy + Math.sin(angle) * rh });
    }
    return arr;
}
