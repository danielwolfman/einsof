// Asteroid logic, rendering, and helpers
export interface Asteroid {
  x: number;
  y: number;
  z: number;
  size: number;
  speed: number;
  outer: Array<{ x: number; y: number }>;
  color: string;
  angle: number;
  spin: number;
  opacity: number;
  gaveFuelBonus?: boolean;
}

export function sortAsteroidsByZ(asteroids: Asteroid[]) {
  return [...asteroids].sort((a, b) => a.z - b.z);
}

export function drawAsteroids(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, asteroids: Asteroid[], projectStar: any, fov: number, aspect: number) {
  // Sort asteroids by Z in descending order (furthest to closest)
  const sorted = [...asteroids].sort((a, b) => b.z - a.z);
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
    
    const grad = context.createRadialGradient(0, 0, asteroid.size * 0.2, 0, 0, asteroid.size);
    grad.addColorStop(0, '#fff8');
    grad.addColorStop(0.2, asteroid.color);
    grad.addColorStop(1, '#222');
    context.fillStyle = grad;
    context.fill();
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
    const size = 1000 + Math.random() * 2000; // Base size for solid asteroids
    const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
    const points = 18 + Math.floor(Math.random() * 6);
    const outer: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const r = size * (0.85 + Math.sin(angle * 3 + Math.random() * 2) * 0.08 + Math.random() * 0.12);
        outer.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    
    const color = `hsl(${20 + Math.random() * 30}, 30%, ${35 + Math.random() * 20}%)`;
    const angle = Math.random() * Math.PI * 2;
    const spin = (Math.random() < 0.5 ? 1 : -1) * (0.001 + Math.random() * (0.004 - 0.001));
    // Always start fully transparent
    const opacity = 0;
    return { x, y, z, size, speed, outer, color, angle, spin, opacity };
}
