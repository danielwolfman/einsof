import React, { useEffect, useRef } from 'react';

interface GameCanvasProps {
    speed: number;
    onGameOver: () => void;
}

const INITIAL_SPEED = 5;
const SPEED_INCREMENT = 0.002;
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
    const asteroids: Array<{ x: number; y: number; radius: number }> = [];
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

    // Project 3D star to 2D canvas (improved)
    function projectStar(star: { x: number; y: number; z: number }, canvas: HTMLCanvasElement, fov: number, aspect: number) {
        // Project X/Y with perspective
        const px = (star.x / (star.z * fov)) * canvas.width / 2 * aspect + canvas.width / 2;
        const py = (star.y / (star.z * fov)) * canvas.height / 2 + canvas.height / 2;
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
            drawSpaceship(context);
            drawAsteroids(context);
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

    const drawAsteroids = (context: CanvasRenderingContext2D) => {
        asteroids.forEach(asteroid => {
            context.beginPath();
            context.arc(asteroid.x, asteroid.y, asteroid.radius, 0, Math.PI * 2);
            context.fillStyle = 'gray';
            context.fill();
            context.closePath();
        });
    };

    return <canvas ref={canvasRef} />;
};

export default GameCanvas;