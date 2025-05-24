export function generateAsteroids(count: number, canvasWidth: number, canvasHeight: number): Array<{ shape: Path2D, position: { x: number, y: number }, size: number }> {
    const asteroids = [];

    for (let i = 0; i < count; i++) {
        const size = Math.random() * 50 + 20; // Random size between 20 and 70
        const position = {
            x: Math.random() * canvasWidth,
            y: Math.random() * canvasHeight,
        };

        const shape = createBizarreShape(size);
        asteroids.push({ shape, position, size });
    }

    return asteroids;
}

function createBizarreShape(size: number): Path2D {
    const path = new Path2D();
    const points = Math.floor(Math.random() * 5 + 5); // Random number of points between 5 and 10
    const angleStep = (Math.PI * 2) / points;

    for (let j = 0; j < points; j++) {
        const angle = j * angleStep;
        const radius = size + (Math.random() * 20 - 10); // Random variation in radius
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        if (j === 0) {
            path.moveTo(x, y);
        } else {
            path.lineTo(x, y);
        }
    }

    path.closePath();
    return path;
}