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
export function drawStarfield(
  context: CanvasRenderingContext2D, 
  canvas: HTMLCanvasElement, 
  speed: number, 
  stars: any[],
  afterburnerActive: boolean = false
) {
  // Draw deep space gradient background with afterburner effect
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  if (afterburnerActive) {
      const time = Date.now() / 1000;
      const pulse = Math.sin(time * 3) * 0.1; // Subtle color pulsing
      gradient.addColorStop(0, `hsl(${260 + pulse * 20}, 70%, 15%)`); // Deep purple
      gradient.addColorStop(0.5, `hsl(${220 + pulse * 20}, 60%, 12%)`); // Deep blue
      gradient.addColorStop(1, `hsl(${280 + pulse * 20}, 70%, 8%)`); // Dark purple
  } else {
      gradient.addColorStop(0, '#0a0a1a');
      gradient.addColorStop(1, '#1a0033');
  }
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
      context.save();          // Warp effect starts earlier and scales up more gradually
          const warpStart = 20;
          const warpEnd = 60;
          const maxWarpLength = 10; // Maximum warp line length multiplier
          let warpStrength = Math.max(0, Math.min(1, (speed - warpStart) / (warpEnd - warpStart)));
          if (afterburnerActive) {
              warpStrength = Math.min(1, warpStrength * 1.5); // 1.5x warp effect with afterburner
          }
          const circleAlpha = 0.7 * brightness * (1 - warpStrength * 0.8); // Keep stars more visible even at high speeds
      
      if (circleAlpha > 0.01) {
          const rawRadius = star.size * (1 + (40 - speed) * 0.03);
          const radius = Math.max(0.1, rawRadius);
          context.globalAlpha = circleAlpha;
          context.beginPath();
          context.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
          
          // Add colorful stars during afterburner
          if (afterburnerActive) {
              const hue = (star.x * star.y * 0.1) % 360; // Pseudo-random hue based on position
              context.fillStyle = `hsla(${hue}, 80%, 70%, ${brightness})`;
          } else {
              context.fillStyle = `rgba(255,255,255,${brightness})`;
          }
          
          context.fill();
      }
      
      if (warpStrength > 0 && star.px !== undefined && star.py !== undefined) {
          const dx = proj.x - star.px;
          const dy = proj.y - star.py;
          // Calculate base trail length and apply maxWarpLength limit
          const baseLength = Math.sqrt(dx * dx + dy * dy);
          const trailLength = baseLength * (2 + Math.min(maxWarpLength * 8, 8 + 16 * warpStrength));
          const tx = proj.x - dx * trailLength / (Math.abs(dx) + Math.abs(dy) + 1e-3);
          const ty = proj.y - dy * trailLength / (Math.abs(dx) + Math.abs(dy) + 1e-3);
          context.globalAlpha = 0.7 * brightness * warpStrength;
          
          // Add colorful trails during afterburner
          if (afterburnerActive) {
              const hue = (star.x * star.y * 0.1) % 360;
              const grad = context.createLinearGradient(proj.x, proj.y, tx, ty);
              grad.addColorStop(0, `hsla(${hue}, 80%, 70%, ${brightness})`);
              grad.addColorStop(1, `hsla(${hue}, 80%, 70%, 0)`);
              context.strokeStyle = grad;
          } else {
              context.strokeStyle = `rgba(255,255,255,${brightness})`;
          }
          
          context.lineWidth = star.size * (1 + warpStrength * (afterburnerActive ? 2 : 1.5));
          context.beginPath();
          context.moveTo(proj.x, proj.y);
          context.lineTo(tx, ty);
          context.stroke();
      }
      context.globalAlpha = 1.0;
      context.restore();
  });
}
