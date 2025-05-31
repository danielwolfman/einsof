// Collision helpers
export function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi + 1e-10) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonIntersectsRect(polygon: Array<{ x: number; y: number }>, rect: { x: number; y: number; width: number; height: number }) {
  const rectEdges = [
    [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }],
    [{ x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }],
    [{ x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }],
    [{ x: rect.x, y: rect.y + rect.height }, { x: rect.x, y: rect.y }]
  ];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    for (const [r1, r2] of rectEdges) {
      if (segmentsIntersect(a, b, r1, r2)) return true;
    }
  }
  if (polygon.some(pt => pt.x >= rect.x && pt.x <= rect.x + rect.width && pt.y >= rect.y && pt.y <= rect.y + rect.height)) return true;
  if (rectCornersInsidePolygon(rect, polygon)) return true;
  return false;
}

function rectCornersInsidePolygon(rect: { x: number; y: number; width: number; height: number }, polygon: Array<{ x: number; y: number }>) {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height }
  ];
  return corners.some(corner => pointInPolygon(corner, polygon));
}

function segmentsIntersect(p1: { x: number; y: number }, p2: { x: number; y: number }, q1: { x: number; y: number }, q2: { x: number; y: number }) {
  function ccw(a: any, b: any, c: any) {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  }
  return (ccw(p1, q1, q2) !== ccw(p2, q1, q2)) && (ccw(p1, p2, q1) !== ccw(p1, p2, q2));
}

// Add Asteroid type locally for type safety
export type Asteroid = {
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
};

// Add robust collision check for spaceship and asteroids
export function checkCollision(
  canvas: HTMLCanvasElement,
  spaceship: { x: number; y: number; width: number; height: number },
  asteroids: Asteroid[],
  projectStar: (star: any, canvas: HTMLCanvasElement, fov: number, aspect: number) => { x: number; y: number },
  fov: number,
  aspect: number
): boolean {
  const rect = {
    x: spaceship.x,
    y: spaceship.y,
    width: spaceship.width,
    height: spaceship.height
  };

  // Check each asteroid
  for (const asteroid of asteroids) {
    const proj = projectStar(asteroid, canvas, fov, aspect);
    const scale = canvas.width / (asteroid.z * fov) * 0.5;
    const angle = asteroid.angle;

    // Transform asteroid outer polygon
    const poly = asteroid.outer.map((pt: { x: number; y: number }) => {
      const rx = Math.cos(angle) * pt.x - Math.sin(angle) * pt.y;
      const ry = Math.sin(angle) * pt.x + Math.cos(angle) * pt.y;
      return {
        x: proj.x + rx * scale,
        y: proj.y + ry * scale
      };
    });

    // Check if spaceship corners are inside the asteroid
    const spaceshipCorners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height }
    ];

    // Check each corner of the spaceship
    for (const corner of spaceshipCorners) {
      if (pointInPolygon(corner, poly)) {
        return true;
      }
    }

    // Check center points of each spaceship edge
    const edgeCenters = [
      { x: rect.x + rect.width / 2, y: rect.y }, // top
      { x: rect.x + rect.width / 2, y: rect.y + rect.height }, // bottom
      { x: rect.x, y: rect.y + rect.height / 2 }, // left
      { x: rect.x + rect.width, y: rect.y + rect.height / 2 } // right
    ];

    for (const point of edgeCenters) {
      if (pointInPolygon(point, poly)) {
        return true;
      }
    }

    // Check center of spaceship
    const center = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2
    };
    
    if (pointInPolygon(center, poly)) {
      return true;
    }
  }
  return false;
}
