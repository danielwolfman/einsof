import React, { useEffect, useRef } from 'react';

interface GameCanvasProps {
    speed: number;
    onGameOver: () => void;
}

const INITIAL_SPEED = 0.05;
const SPEED_INCREMENT = 0.0002;
const SPACESHIP_WIDTH = 160;
const SPACESHIP_HEIGHT = 128;
const SPACESHIP_SPRITE = process.env.PUBLIC_URL + '/spaceship-sprite.png';

// 3D starfield parameters
const STAR_COUNT_MIN = 20;
const STAR_COUNT_MAX = 180;
const STARFIELD_DEPTH = 1200; // How far stars spawn from camera
const CAMERA_ANGLE_DEG = 60;
const CAMERA_ANGLE_RAD = (CAMERA_ANGLE_DEG * Math.PI) / 180;
const STAR_WARP_THRESHOLD = 40;
const STAR_WARP_MAX = 40;

// Asteroid configuration constants
const ASTEROID_COUNT = 20;
const ASTEROID_MIN_SIZE = 5000;
const ASTEROID_SIZE_VARIANCE = 100000;
const ASTEROID_MIN_Z_FACTOR = 500; // how many times STARFIELD_DEPTH for min spawn distance
const ASTEROID_MAX_Z_FACTOR = 1000; // how many times STARFIELD_DEPTH for max spawn distance
const ASTEROID_OUTER_POINTS = 18;
const ASTEROID_OUTER_POINTS_VARIANCE = 6;
const ASTEROID_EXTRA_HOLES_MIN = 1;
const ASTEROID_EXTRA_HOLES_MAX = 3;
const ASTEROID_SPIN_MIN = 0.001; // radians per frame (increase for faster spin)
const ASTEROID_SPIN_MAX = 0.004;
const ASTEROID_SPEED_FACTOR = 100.0; // 1.0 = same as starfield, >1.0 = faster, <1.0 = slower

// Asteroid type with multiple holes
interface Asteroid {
    x: number; // 3D X
    y: number; // 3D Y
    z: number; // 3D Z (distance from camera)
    size: number; // base radius
    speed: number;
    outer: Array<{ x: number; y: number }>;
    holes: Array<Array<{ x: number; y: number }>>; // multiple holes
    color: string;
    angle: number; // rotation angle
    spin: number; // rotation speed
    opacity: number; // fade-in opacity
}

const GameCanvas: React.FC<GameCanvasProps> = ({ speed: initialSpeed, onGameOver }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const gameLoopRef = useRef<number | null>(null);
    const speedRef = useRef<number>(initialSpeed || INITIAL_SPEED);
    const velocityRef = useRef({ x: 0 }); // Only left/right movement
    const frameCount = useRef(0);
    // Spaceship is fixed at bottom center
    const spaceshipRef = useRef({
        x: 0,
        y: 0,
        width: SPACESHIP_WIDTH,
        height: SPACESHIP_HEIGHT
    });
    // Placeholder for asteroids and stars
    const starsRef = useRef<Array<{
        x: number; // 3D X
        y: number; // 3D Y
        z: number; // 3D Z (distance from camera)
        px?: number; // previous projected X
        py?: number; // previous projected Y
        size: number;
        speed: number;
    }>>([]);
    const starCountRef = useRef<number>(STAR_COUNT_MIN);
    const lastStarfieldChangeRef = useRef<number>(Date.now());
    const spaceshipImgRef = useRef<HTMLImageElement | null>(null);
    const lastLogTimeRef = useRef<number>(0);
    // Asteroids as a ref for mutability
    const asteroidsRef = useRef<Asteroid[]>([]);

    // Add style to prevent scrollbars
    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `
            html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }
            #root { height: 100%; }
        `;
        document.head.appendChild(style);
        return () => {
            document.head.removeChild(style);
        };
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const canvas = canvasRef.current;
        if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] useEffect: canvas', canvas);
        // Initialize starfield
        if (canvas) {
            // 3D starfield initialization (spread everywhere)
            const fov = Math.tan(CAMERA_ANGLE_RAD / 2);
            const aspect = canvas.width / canvas.height;
            const count = starCountRef.current;
            starsRef.current = Array.from({ length: count }, () => {
                const sx = Math.random(); // [0,1]
                const sy = Math.random(); // [0,1]
                const z = Math.random() * (STARFIELD_DEPTH * 0.8) + STARFIELD_DEPTH * 0.2;
                // Back-project to 3D X/Y at z
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
            if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] Starfield initialized', starsRef.current.length);
            // Ensure contextRef is set
            contextRef.current = canvas.getContext('2d');
            if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] contextRef set', !!contextRef.current);
        }
        const resizeCanvas = () => {
            if (canvas) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                contextRef.current = canvas.getContext('2d');
                // Scale spaceship size
                const scaled = getScaledSpaceshipSize();
                spaceshipRef.current.width = scaled.width;
                spaceshipRef.current.height = scaled.height;
                spaceshipRef.current.x = Math.max(0, Math.min(canvas.width / 2 - scaled.width / 2, canvas.width - scaled.width));
                spaceshipRef.current.y = Math.max(0, canvas.height - scaled.height - 40);
                // No need to reposition 3D stars on resize
                if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] Canvas resized', canvas.width, canvas.height, 'Spaceship size', scaled.width, scaled.height);
            }
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Load spaceship image and start game loop only after image is loaded
        const img = new window.Image();
        img.src = SPACESHIP_SPRITE;
        if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] Loading spaceship image:', img.src);
        img.onload = () => {
            spaceshipImgRef.current = img;
            if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] Spaceship image loaded');
            // Start game loop after image is loaded
            const startGameLoop = () => {
                if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] Starting game loop');
                const loop = () => {
                    updateGame();
                    drawGame();
                    gameLoopRef.current = requestAnimationFrame(loop);
                };
                loop();
            };
            startGameLoop();
        };
        img.onerror = () => {
            spaceshipImgRef.current = null;
            if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] Spaceship image failed to load, using fallback');
            const startGameLoop = () => {
                if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] Starting game loop (fallback)');
                const loop = () => {
                    updateGame();
                    drawGame();
                    gameLoopRef.current = requestAnimationFrame(loop);
                };
                loop();
            };
            startGameLoop();
        };

        return () => {
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
            window.removeEventListener('resize', resizeCanvas);
        };
    }, []);

    // Add keyboard controls for left/right movement (document-level)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') velocityRef.current.x = -8;
            if (e.key === 'ArrowRight') velocityRef.current.x = 8;
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') velocityRef.current.x = 0;
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Make spaceship size scale with window size
    const getScaledSpaceshipSize = () => {
        const canvas = canvasRef.current;
        if (!canvas) return { width: SPACESHIP_WIDTH, height: SPACESHIP_HEIGHT };
        const scale = Math.min(canvas.width / 1280, canvas.height / 720); // 1280x720 is base size
        return {
            width: SPACESHIP_WIDTH * scale,
            height: SPACESHIP_HEIGHT * scale
        };
    };

    const updateGame = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Gradually increase speed
        speedRef.current += SPEED_INCREMENT;
        // Scale spaceship size every frame
        const scaled = getScaledSpaceshipSize();
        const spaceship = spaceshipRef.current;
        spaceship.width = scaled.width;
        spaceship.height = scaled.height;
        // Keep spaceship at bottom center
        spaceship.y = Math.max(0, canvas.height - scaled.height - 40);
        // Move spaceship left/right, clamp to screen
        spaceship.x += velocityRef.current.x;
        if (spaceship.x < 0) spaceship.x = 0;
        if (spaceship.x + spaceship.width > canvas.width) spaceship.x = canvas.width - spaceship.width;
        // 3D starfield update
        const fov = Math.tan(CAMERA_ANGLE_RAD / 2);
        const aspect = canvas.width / canvas.height;
        starsRef.current.forEach(star => {
            // Save previous projected position for warp effect
            if (star.z > 0) {
                const prevProj = projectStar(star, canvas, fov, aspect);
                star.px = prevProj.x;
                star.py = prevProj.y;
            }
            // Move star forward (decrease z)
            star.z -= speedRef.current * star.speed * 1.5;
            // Respawn if past camera or off screen
            const proj = projectStar(star, canvas, fov, aspect);
            if (star.z < 10 || proj.x < 0 || proj.x > canvas.width || proj.y < 0 || proj.y > canvas.height) {
                // Pick a new random screen position, back-project to 3D at max depth
                const sx = Math.random();
                const sy = Math.random();
                star.z = STARFIELD_DEPTH;
                star.x = ((sx - 0.5) * 2 * star.z * fov) / aspect;
                star.y = ((sy - 0.5) * 2 * star.z * fov);
                star.size = 1 + Math.random() * 2;
                star.speed = 1 + Math.random() * 2;
                star.px = undefined;
                star.py = undefined;
            }
        });
        // Asteroid movement (like stars)
        asteroidsRef.current.forEach(asteroid => {
            asteroid.z -= speedRef.current * asteroid.speed * 1.5;
            asteroid.angle += asteroid.spin;
            // Fade in: opacity increases as z decreases from spawnZ to visibleZ
            const spawnZ = STARFIELD_DEPTH * ASTEROID_MAX_Z_FACTOR;
            const visibleZ = STARFIELD_DEPTH * (ASTEROID_MAX_Z_FACTOR - 0.5 * (ASTEROID_MAX_Z_FACTOR - ASTEROID_MIN_Z_FACTOR));
            if (asteroid.z > visibleZ) {
                // Fade in from 0 to 1 as z goes from spawnZ to visibleZ
                const t = 1 - (asteroid.z - visibleZ) / (spawnZ - visibleZ);
                asteroid.opacity = Math.min(1, Math.max(0, t));
            } else {
                asteroid.opacity = 1;
            }
            // Project to 2D
            const proj = projectStar(asteroid, canvas, undefined, undefined);
            // Respawn if past camera or off screen
            if (
                asteroid.z < 10 ||
                proj.x < -asteroid.size || proj.x > canvas.width + asteroid.size ||
                proj.y < -asteroid.size || proj.y > canvas.height + asteroid.size
            ) {
                // Regenerate asteroid at far z
                const scaled = getScaledSpaceshipSize();
                const newAst = generateAsteroid3D(canvas, scaled.width, scaled.height);
                asteroid.x = newAst.x;
                asteroid.y = newAst.y;
                asteroid.z = newAst.z; // use very far z
                asteroid.size = newAst.size;
                asteroid.speed = newAst.speed;
                asteroid.outer = newAst.outer;
                asteroid.holes = newAst.holes;
                asteroid.color = newAst.color;
                asteroid.angle = newAst.angle;
                asteroid.spin = newAst.spin;
                asteroid.opacity = 0; // Reset opacity for fade-in
            }
        });
        // Dynamically randomize star count every 4 seconds or as speed increases
        const now = Date.now();
        if (now - lastStarfieldChangeRef.current > 4000) {
            // Randomize star count based on speed (denser at higher speed, but with randomness)
            const base = Math.floor(STAR_COUNT_MIN + (STAR_COUNT_MAX - STAR_COUNT_MIN) * Math.min(1, speedRef.current / 60));
            const randomDelta = Math.floor(Math.random() * 20 - 10); // +/-10
            let newCount = Math.max(STAR_COUNT_MIN, Math.min(STAR_COUNT_MAX, base + randomDelta));
            if (newCount !== starsRef.current.length) {
                // Reinitialize starfield with new count
                const fov = Math.tan(CAMERA_ANGLE_RAD / 2);
                const aspect = canvas.width / canvas.height;
                starsRef.current = Array.from({ length: newCount }, () => {
                    const sx = Math.random();
                    const sy = Math.random();
                    const z = Math.random() * (STARFIELD_DEPTH * 0.8) + STARFIELD_DEPTH * 0.2;
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
                starCountRef.current = newCount;
            }
            lastStarfieldChangeRef.current = now;
        }
        // Throttle log
        const throttledLog = () => {
            const now = Date.now();
            if (process.env.NODE_ENV === 'development' && now - lastLogTimeRef.current > 5000) {
                // console.log('[GameCanvas] updateGame velocity.x', velocityRef.current.x, 'spaceship.x', spaceship.x, 'spaceship size', spaceship.width, spaceship.height);
                lastLogTimeRef.current = now;
            }
        };
        throttledLog();
    };

    // Project 3D asteroid/star to 2D
    function projectStar(star: { x: number; y: number; z: number }, canvas: HTMLCanvasElement, fov?: number, aspect?: number) {
        // Use provided fov/aspect or compute if undefined
        const _fov = fov !== undefined ? fov : Math.tan(CAMERA_ANGLE_RAD / 2);
        const _aspect = aspect !== undefined ? aspect : canvas.width / canvas.height;
        const px = (star.x / (star.z * _fov)) * canvas.width / 2 * _aspect + canvas.width / 2;
        const py = (star.y / (star.z * _fov)) * canvas.height / 2 + canvas.height / 2;
        return { x: px, y: py };
    }

    const drawStarfield = (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, speed: number) => {
        // Draw deep space gradient background
        const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#0a0a1a');
        gradient.addColorStop(1, '#1a0033');
        context.save();
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();

        // 3D starfield rendering
        const fov = Math.tan(CAMERA_ANGLE_RAD / 2);
        const aspect = canvas.width / canvas.height;
        starsRef.current.forEach(star => {
            if (star.z <= 0) return;
            const proj = projectStar(star, canvas, fov, aspect);
            if (proj.x < 0 || proj.x > canvas.width || proj.y < 0 || proj.y > canvas.height) return;
            const brightness = Math.min(1, 0.5 + star.speed / 3);
            context.save();
            // Gradual warp effect: warpStrength goes from 0 to 1 as speed increases
            const warpStart = STAR_WARP_THRESHOLD * 0.6;
            const warpEnd = STAR_WARP_MAX;
            const warpStrength = Math.max(0, Math.min(1, (speed - warpStart) / (warpEnd - warpStart)));
            // Draw circle (fades out as warpStrength increases)
            const circleAlpha = 0.7 * brightness * (1 - warpStrength);
            if (circleAlpha > 0.01) {
                const rawRadius = star.size * (1 + (STAR_WARP_THRESHOLD - speed) * 0.03);
                const radius = Math.max(0.1, rawRadius);
                context.globalAlpha = circleAlpha;
                context.beginPath();
                context.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
                context.fillStyle = `rgba(255,255,255,${brightness})`;
                context.fill();
            }
            // Draw line (grows in length and opacity as warpStrength increases)
            if (warpStrength > 0 && star.px !== undefined && star.py !== undefined) {
                const dx = proj.x - star.px;
                const dy = proj.y - star.py;
                // Line length increases with warpStrength
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
    };

    const drawGame = () => {
        const context = contextRef.current;
        const canvas = canvasRef.current;
        if (context && canvas) {
            // Draw enhanced starfield and background first
            drawStarfield(context, canvas, speedRef.current);
            drawAsteroids(context);
            drawSpaceship(context);
        }
    };

    const drawSpaceship = (context: CanvasRenderingContext2D) => {
        const spaceship = spaceshipRef.current;
        const img = spaceshipImgRef.current;
        if (img && img.complete) {
            context.drawImage(
                img,
                spaceship.x,
                spaceship.y,
                spaceship.width,
                spaceship.height
            );
        } else {
            context.fillStyle = 'blue';
            context.fillRect(spaceship.x, spaceship.y, spaceship.width, spaceship.height);
        }
    };

    // Draw asteroids with 3D projection and improved style
    const drawAsteroids = (context: CanvasRenderingContext2D) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const fov = Math.tan(CAMERA_ANGLE_RAD / 2);
        const aspect = canvas.width / canvas.height;
        // Draw asteroids sorted by z (closer ones drawn last, appear on top)
        const sortedAsteroids = [...asteroidsRef.current].sort((a, b) => a.z - b.z);
        sortedAsteroids.forEach(asteroid => {
            const proj = projectStar(asteroid, canvas, fov, aspect);
            context.save();
            // Use asteroid.opacity for both fill and stroke
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
            // Draw all holes
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
            // Stroke should also respect opacity
            context.globalAlpha = asteroidAlpha;
            context.lineWidth = 2;
            context.strokeStyle = '#222';
            context.stroke();
            context.restore();
        });
    };

    // Helper to generate a more organic asteroid with a smooth elliptical hole and random spin
    function generateAsteroid3D(canvas: HTMLCanvasElement, spaceshipWidth: number, spaceshipHeight: number): Asteroid {
        const fov = Math.tan(CAMERA_ANGLE_RAD / 2);
        const aspect = canvas.width / canvas.height;
        // 3D spawn position: spawn extremely far away for a long approach
        // Force spawn at the maximum possible Z (very far)
        const z = STARFIELD_DEPTH * ASTEROID_MAX_Z_FACTOR;
        const sx = Math.random();
        const sy = Math.random();
        const x = ((sx - 0.5) * 2 * z * fov) / aspect;
        const y = ((sy - 0.5) * 2 * z * fov);
        // Make asteroids HUGE
        const size = ASTEROID_MIN_SIZE + Math.random() * ASTEROID_SIZE_VARIANCE;
        // Speed: align with starfield speed, but allow some variance if desired
        const speed = ASTEROID_SPEED_FACTOR;
        // Outer shape: jagged but smooth polygon
        const points = ASTEROID_OUTER_POINTS + Math.floor(Math.random() * ASTEROID_OUTER_POINTS_VARIANCE);
        const outer: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const r = size * (0.85 + Math.sin(angle * 3 + Math.random() * 2) * 0.08 + Math.random() * 0.12);
            outer.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }
        // Multiple holes
        const holes: Array<Array<{ x: number; y: number }>> = [];
        // Main hole: random offset from center, but inside the asteroid
        const mainHoleAngle = Math.random() * Math.PI * 2;
        const mainHoleDist = size * 0.15 + Math.random() * size * 0.18; // not too close to edge
        const mainHoleCx = Math.cos(mainHoleAngle) * mainHoleDist;
        const mainHoleCy = Math.sin(mainHoleAngle) * mainHoleDist;
        // Ensure the main hole is always large enough for the spaceship to fit
        const minMainHoleW = Math.max(spaceshipWidth * 1.15, size * 0.28);
        const minMainHoleH = Math.max(spaceshipHeight * 1.15, size * 0.28);
        const maxMainHoleW = Math.max(minMainHoleW, size * 0.32);
        const maxMainHoleH = Math.max(minMainHoleH, size * 0.32);
        holes.push(generateAsteroidHole(mainHoleCx, mainHoleCy, minMainHoleW, minMainHoleH, maxMainHoleW, maxMainHoleH));
        // Add extra holes, some smaller, some larger, at random positions
        const extraHoles = ASTEROID_EXTRA_HOLES_MIN + Math.floor(Math.random() * (ASTEROID_EXTRA_HOLES_MAX - ASTEROID_EXTRA_HOLES_MIN + 1));
        for (let i = 0; i < extraHoles; i++) {
            // Random offset from center, but inside the asteroid
            const angle = Math.random() * Math.PI * 2;
            const dist = size * 0.2 + Math.random() * size * 0.5;
            const cx = Math.cos(angle) * dist;
            const cy = Math.sin(angle) * dist;
            // Some holes are smaller than the ship, some are a good fit
            const minW = spaceshipWidth * (0.5 + Math.random() * 0.7); // 0.5x to 1.2x ship width
            const minH = spaceshipHeight * (0.5 + Math.random() * 0.7);
            const maxW = Math.max(minW, size * 0.18 + Math.random() * size * 0.12);
            const maxH = Math.max(minH, size * 0.18 + Math.random() * size * 0.12);
            holes.push(generateAsteroidHole(cx, cy, minW, minH, maxW, maxH));
        }
        // Color: random brown/gray
        const color = `hsl(${20 + Math.random() * 30}, 30%, ${35 + Math.random() * 20}%)`;
        // Rotation
        const angle = Math.random() * Math.PI * 2;
        const spin = (Math.random() < 0.5 ? 1 : -1) * (ASTEROID_SPIN_MIN + Math.random() * (ASTEROID_SPIN_MAX - ASTEROID_SPIN_MIN));
        const opacity = 0; // Start fully transparent
        return { x, y, z, size, speed, outer, holes, color, angle, spin, opacity };
    }

    // Helper to generate a single hole (ellipse, slightly organic)
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

    // Example: generate a few asteroids on mount
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        asteroidsRef.current = [];
        for (let i = 0; i < ASTEROID_COUNT; i++) {
            const scaled = getScaledSpaceshipSize();
            asteroidsRef.current.push(generateAsteroid3D(canvas, scaled.width, scaled.height));
        }
    }, []);

    return <canvas ref={canvasRef} />;
};

export default GameCanvas;