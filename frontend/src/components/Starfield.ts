// Starfield rendering and logic
export interface Star {
  x: number;
  y: number;
  z: number;
  px?: number;
  py?: number;
  size: number;
  speed: number;
}

export function createStarfield(count: number, width: number, height: number, depth: number, fov: number, aspect: number): Star[] {
  return Array.from({ length: count }, () => {
    const sx = Math.random();
    const sy = Math.random();
    const z = Math.random() * (depth * 0.8) + depth * 0.2;
    const x = ((sx - 0.5) * 2 * z * fov) / aspect;
    const y = ((sy - 0.5) * 2 * z * fov);
    return {
      x,
      y,
      z,
      size: 1 + Math.random() * 2,
      speed: 1 + Math.random() * 2
    };
  });
}

export function projectStar(star: { x: number; y: number; z: number }, canvas: HTMLCanvasElement, fov: number, aspect: number) {
  const px = (star.x / (star.z * fov)) * canvas.width / 2 * aspect + canvas.width / 2;
  const py = (star.y / (star.z * fov)) * canvas.height / 2 + canvas.height / 2;
  return { x: px, y: py };
}

// Refactor drawStarfield to accept stars as argument
export function drawStarfield(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, speed: number, stars: any[]) {
  // Draw deep space gradient background
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#0a0a1a');
  gradient.addColorStop(1, '#1a0033');
  context.save();
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();

  // 3D starfield rendering
  const fov = Math.tan(60 * Math.PI / 180 / 2);
  const aspect = canvas.width / canvas.height;
  stars.forEach((star: any) => {
    if (star.z <= 0) return;
    const proj = projectStar(star, canvas, fov, aspect);
    if (proj.x < 0 || proj.x > canvas.width || proj.y < 0 || proj.y > canvas.height) return;
    const brightness = Math.min(1, 0.5 + star.speed / 3);
    context.save();
    const warpStart = 40 * 0.6;
    const warpEnd = 40;
    const warpStrength = Math.max(0, Math.min(1, (speed - warpStart) / (warpEnd - warpStart)));
    const circleAlpha = 0.7 * brightness * (1 - warpStrength);
    if (circleAlpha > 0.01) {
      const rawRadius = star.size * (1 + (40 - speed) * 0.03);
      const radius = Math.max(0.1, rawRadius);
      context.globalAlpha = circleAlpha;
      context.beginPath();
      context.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(255,255,255,${brightness})`;
      context.fill();
    }
    if (warpStrength > 0 && star.px !== undefined && star.py !== undefined) {
      const dx = proj.x - star.px;
      const dy = proj.y - star.py;
      const trailLength = Math.sqrt(dx * dx + dy * dy) * (2 + 8 * warpStrength);
      const tx = proj.x - dx * trailLength / (Math.abs(dx) + Math.abs(dy) + 1e-3);
      const ty = proj.y - dy * trailLength / (Math.abs(dx) + Math.abs(dy) + 1e-3);
      context.globalAlpha = 0.7 * brightness * warpStrength;
      context.strokeStyle = `rgba(255,255,255,${brightness})`;
      context.lineWidth = star.size * (1 + warpStrength * 1.5);
      context.beginPath();
      context.moveTo(proj.x, proj.y);
      context.lineTo(tx, ty);
      context.stroke();
    }
    context.globalAlpha = 1.0;
    context.restore();
  });
}
