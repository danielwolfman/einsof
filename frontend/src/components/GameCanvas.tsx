import React, { useEffect, useRef } from 'react';
import { drawStarfield } from './Starfield';
import { drawSpaceship } from './Spaceship';
import { drawAsteroids } from './Asteroids';
import { projectStar } from './Starfield';
import { generateAsteroid3D } from './Asteroids';
import { checkCollision } from '../utils/collision';
import type { Asteroid } from './Asteroids';

interface GameCanvasProps {
    speed: number;
    onGameOver: () => void;
}

const INITIAL_SPEED = 0.05;
const SPEED_INCREMENT = 0.002;
const SPACESHIP_WIDTH = 160;
const SPACESHIP_HEIGHT = 128;
const SPACESHIP_SPRITE = process.env.PUBLIC_URL + '/spaceship-sprite.png';
const EXPLOSION_GIF = process.env.PUBLIC_URL + '/explosion.gif';

// 3D starfield parameters
const STAR_COUNT_MIN = 20;
const STAR_COUNT_MAX = 180;
const STARFIELD_DEPTH = 1200; // How far stars spawn from camera
const CAMERA_ANGLE_DEG = 60;
const CAMERA_ANGLE_RAD = (CAMERA_ANGLE_DEG * Math.PI) / 180;

// Asteroid configuration constants
const ASTEROID_COUNT = 5;
const ASTEROID_MIN_Z_FACTOR = 30;
const ASTEROID_MAX_Z_FACTOR = 50;
const ASTEROID_MIN_SPEED = 10;
const ASTEROID_MAX_SPEED = 20;

const MAX_MANEUVER_SPEED = 18; // Maximum left/right speed
const BASE_MANEUVER_SPEED = 2; // Starting left/right speed
const MANEUVER_RAMP = 10; // How much speedRef.current must increase to reach max maneuver speed

const GameCanvas: React.FC<GameCanvasProps> = ({ speed: initialSpeed, onGameOver }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const gameLoopRef = useRef<number | null>(null);
    const speedRef = useRef<number>(initialSpeed || INITIAL_SPEED);
    const velocityRef = useRef({ x: 0, y: 0 }); // Updated for vertical movement
    // Mouse control state
    const isMouseControlRef = useRef(false);
    const mousePositionRef = useRef({ x: 0, y: 0 });
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
    const [gameOver, setGameOver] = React.useState(false);
    const runningRef = useRef(true);
    // Explosion state
    const [explosionPos, setExplosionPos] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [showExplosion, setShowExplosion] = React.useState(false);
    const explosionTimeoutRef = useRef<number | null>(null);
    const scoreRef = useRef(0);
    const [score, setScore] = React.useState(0);
    // High score state
    const [highScore, setHighScore] = React.useState(() => {
        const saved = localStorage.getItem('highScore');
        return saved ? parseInt(saved, 10) : 0;
    });

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

    // Arcade font CSS injection
    useEffect(() => {
        const font = document.createElement('style');
        font.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        `;
        document.head.appendChild(font);
        return () => { document.head.removeChild(font); };
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        runningRef.current = true; // Ensure game loop can start
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
            // Draw at least one frame to avoid white screen
            if (contextRef.current) drawGame();
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
                // Draw at least one frame after resize
                if (contextRef.current) drawGame();
            }
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Load spaceship image and start game loop only after image is loaded
        const img = new window.Image();
        img.src = SPACESHIP_SPRITE;
        img.onload = () => {
            spaceshipImgRef.current = img;
            if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] Spaceship image loaded');
            const loop = () => {
                if (!runningRef.current) return;
                if (!gameOver) {
                    updateGame();
                    drawGame();
                    gameLoopRef.current = requestAnimationFrame(loop);
                } else {
                    drawGame(); // Draw final frame with GAME OVER
                }
            };
            // Draw at least one frame before starting loop
            if (contextRef.current) drawGame();
            loop();
        };
        img.onerror = () => {
            spaceshipImgRef.current = null;
            if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] Spaceship image failed to load, using fallback');
            const loop = () => {
                if (!runningRef.current) return;
                if (!gameOver) {
                    updateGame();
                    drawGame();
                    gameLoopRef.current = requestAnimationFrame(loop);
                } else {
                    drawGame();
                }
            };
            // Draw at least one frame before starting loop
            if (contextRef.current) drawGame();
            loop();
        };
        return () => {
            runningRef.current = false;
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
            window.removeEventListener('resize', resizeCanvas);
        };
    }, [gameOver]);

    // Add keyboard controls for left/right movement (document-level)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Switch to keyboard control when arrow keys are pressed
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                isMouseControlRef.current = false;
            }
            const maneuverSpeed = Math.min(
                BASE_MANEUVER_SPEED + (MAX_MANEUVER_SPEED - BASE_MANEUVER_SPEED) * Math.min(1, (speedRef.current - INITIAL_SPEED) / MANEUVER_RAMP),
                MAX_MANEUVER_SPEED
            );
            if (process.env.NODE_ENV === 'development' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                console.log('[GameCanvas] speedRef.current:', speedRef.current, 'maneuverSpeed:', maneuverSpeed);
            }
            if (e.key === 'ArrowLeft') velocityRef.current.x = -maneuverSpeed;
            if (e.key === 'ArrowRight') velocityRef.current.x = maneuverSpeed;
            if (e.key === 'ArrowUp') velocityRef.current.y = -maneuverSpeed;
            if (e.key === 'ArrowDown') velocityRef.current.y = maneuverSpeed;
            // Restart game on Space if game over
            if (e.key === ' ' && gameOver) {
                // Reset asteroids
                const canvas = canvasRef.current;
                if (canvas) {
                    asteroidsRef.current = [];
                    for (let i = 0; i < ASTEROID_COUNT; i++) {
                        const scaled = getScaledSpaceshipSize();
                        asteroidsRef.current.push(generateAsteroid3D(
                            canvas,
                            scaled.width,
                            scaled.height,
                            ASTEROID_MIN_Z_FACTOR,
                            ASTEROID_MAX_Z_FACTOR,
                            ASTEROID_MIN_SPEED,
                            ASTEROID_MAX_SPEED
                        ));
                    }
                }
                // Reset speed
                speedRef.current = initialSpeed || INITIAL_SPEED;
                // Reset score
                scoreRef.current = 0;
                setScore(0);
                // Reset game over state
                setGameOver(false);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (['ArrowLeft', 'ArrowRight'].includes(e.key)) velocityRef.current.x = 0;
            if (['ArrowUp', 'ArrowDown'].includes(e.key)) velocityRef.current.y = 0;
        };

        // Mouse control handlers
        const handleMouseDown = (e: MouseEvent) => {
            if (gameOver) return;
            isMouseControlRef.current = true;
            mousePositionRef.current = { x: e.clientX, y: e.clientY };
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (gameOver || !isMouseControlRef.current) return;
            mousePositionRef.current = { x: e.clientX, y: e.clientY };
        };

        const handleMouseUp = () => {
            isMouseControlRef.current = false;
            velocityRef.current = { x: 0, y: 0 };
        };

        // Add all event listeners
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [gameOver, initialSpeed]);

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
        if (gameOver) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        // Gradually increase speed
        speedRef.current += SPEED_INCREMENT;
        // Increment score based on speed (or time)
        scoreRef.current += 0.01;
        
        // Scale spaceship size every frame
        const scaled = getScaledSpaceshipSize();
        const spaceship = spaceshipRef.current;
        spaceship.width = scaled.width;
        spaceship.height = scaled.height;

        // Handle mouse control
        if (isMouseControlRef.current) {
            const targetX = mousePositionRef.current.x - spaceship.width / 2;
            const targetY = mousePositionRef.current.y - spaceship.height / 2;
            
            const dx = targetX - spaceship.x;
            const dy = targetY - spaceship.y;
            
            // Calculate maneuver speed based on current game speed
            const maneuverSpeed = Math.min(
                BASE_MANEUVER_SPEED + (MAX_MANEUVER_SPEED - BASE_MANEUVER_SPEED) * Math.min(1, (speedRef.current - INITIAL_SPEED) / MANEUVER_RAMP),
                MAX_MANEUVER_SPEED
            );
            
            // Smooth movement towards mouse position
            velocityRef.current.x = Math.abs(dx) < maneuverSpeed ? dx : Math.sign(dx) * maneuverSpeed;
            velocityRef.current.y = Math.abs(dy) < maneuverSpeed ? dy : Math.sign(dy) * maneuverSpeed;
        }

        // Apply velocity (works for both mouse and keyboard control)
        spaceship.x += velocityRef.current.x;
        spaceship.y += velocityRef.current.y;

        // Clamp position to screen bounds
        if (spaceship.x < 0) spaceship.x = 0;
        if (spaceship.x + spaceship.width > canvas.width) spaceship.x = canvas.width - spaceship.width;
        if (spaceship.y < 0) spaceship.y = 0;
        if (spaceship.y + spaceship.height > canvas.height) spaceship.y = canvas.height - spaceship.height;
        
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
            const proj = projectStar(asteroid, canvas, fov, aspect);
            // Respawn if past camera or off screen
            if (
                asteroid.z < 10 ||
                proj.x < -asteroid.size || proj.x > canvas.width + asteroid.size ||
                proj.y < -asteroid.size || proj.y > canvas.height + asteroid.size
            ) {
                // Regenerate asteroid at far z
                const scaled = getScaledSpaceshipSize();
                const newAst = generateAsteroid3D(
                    canvas,
                    scaled.width,
                    scaled.height,
                    ASTEROID_MIN_Z_FACTOR,
                    ASTEROID_MAX_Z_FACTOR,
                    ASTEROID_MIN_SPEED,
                    ASTEROID_MAX_SPEED
                );
                asteroid.x = newAst.x;
                asteroid.y = newAst.y;
                asteroid.z = newAst.z;
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
        // Collision detection
        // Use fov and aspect already defined above
        // Fix: Only check collision if asteroids are actually visible (z < STARFIELD_DEPTH)
        // Only check collision if asteroids are close to the camera and their projected polygon is actually on screen
        const visibleAsteroids = asteroidsRef.current.filter(a => a.z < STARFIELD_DEPTH && a.z > 0);
        if (
            visibleAsteroids.length > 0 &&
            checkCollision(canvas, spaceship, visibleAsteroids, projectStar, fov, aspect)
        ) {
            // Save last ship position for explosion overlay
            setExplosionPos({ ...spaceship });
            setGameOver(true);
            if (onGameOver) onGameOver();
            if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
            return;
        }
    };

    // Show explosion only once for 1 second
    useEffect(() => {
        if (gameOver && explosionPos) {
            setShowExplosion(true);
            if (explosionTimeoutRef.current) {
                clearTimeout(explosionTimeoutRef.current);
            }
            explosionTimeoutRef.current = window.setTimeout(() => {
                setShowExplosion(false);
            }, 800);
        } else {
            setShowExplosion(false);
            if (explosionTimeoutRef.current) {
                clearTimeout(explosionTimeoutRef.current);
                explosionTimeoutRef.current = null;
            }
        }
        // Cleanup on unmount
        return () => {
            if (explosionTimeoutRef.current) {
                clearTimeout(explosionTimeoutRef.current);
                explosionTimeoutRef.current = null;
            }
        };
    }, [gameOver, explosionPos]);

    // Remove explosion overlay on restart
    useEffect(() => {
        if (!gameOver) setExplosionPos(null);
    }, [gameOver]);

    // In drawGame, always clear the canvas before drawing
    const drawGame = () => {
        const context = contextRef.current;
        const canvas = canvasRef.current;
        if (context && canvas) {
            context.clearRect(0, 0, canvas.width, canvas.height);
            const fov = Math.tan(CAMERA_ANGLE_RAD / 2);
            const aspect = canvas.width / canvas.height;
            drawStarfield(context, canvas, speedRef.current, starsRef.current);
            // Sort asteroids by z (closest first) before drawing
            asteroidsRef.current.sort((a, b) => a.z - b.z);
            drawAsteroids(context, canvas, asteroidsRef.current, projectStar, fov, aspect);
            // Draw score at top right (use scoreRef.current for live display)
            context.save();
            context.font = `bold 32px 'Press Start 2P', 'Arial', monospace`;
            context.textAlign = 'right';
            context.textBaseline = 'top';
            context.fillStyle = '#fff';
            context.strokeStyle = '#222';
            context.lineWidth = 4;
            const scoreText = `SCORE: ${Math.floor(scoreRef.current)}`;
            context.strokeText(scoreText, canvas.width - 40, 32);
            context.fillText(scoreText, canvas.width - 40, 32);
            // Draw high score below score
            const highScoreText = `HIGH: ${Math.floor(highScore)}`;
            context.strokeText(highScoreText, canvas.width - 40, 80);
            context.fillText(highScoreText, canvas.width - 40, 80);
            context.restore();
            // Only draw spaceship if not game over
            if (!gameOver) {
                drawSpaceship(context, spaceshipRef.current, spaceshipImgRef.current);
            }
            if (gameOver) {
                // Draw GAME OVER in arcade font
                context.save();
                context.globalAlpha = 0.95;
                context.font = `bold 80px 'Press Start 2P', 'Arial', monospace`;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.shadowColor = '#000';
                context.shadowBlur = 16;
                context.fillStyle = '#ff0044';
                context.strokeStyle = '#fff';
                const msg = 'GAME OVER';
                const x = canvas.width / 2;
                const y = canvas.height / 2;
                context.lineWidth = 8;
                context.strokeText(msg, x, y);
                context.fillText(msg, x, y);
                context.restore();
            }
        }
    };

    // Example: generate a few asteroids on mount
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        asteroidsRef.current = [];
        for (let i = 0; i < ASTEROID_COUNT; i++) {
            const scaled = getScaledSpaceshipSize();
            asteroidsRef.current.push(generateAsteroid3D(
                canvas,
                scaled.width,
                scaled.height,
                ASTEROID_MIN_Z_FACTOR,
                ASTEROID_MAX_Z_FACTOR,
                ASTEROID_MIN_SPEED,
                ASTEROID_MAX_SPEED
            ));
        }
    }, []);

    // On game over, sync scoreRef to React state for final display
    useEffect(() => {
        if (gameOver) {
            setScore(scoreRef.current);
            // Update high score if needed
            if (scoreRef.current > highScore) {
                setHighScore(scoreRef.current);
                localStorage.setItem('highScore', String(Math.floor(scoreRef.current)));
            }
        }
    }, [gameOver]);

    // Reset scoreRef and score on restart
    useEffect(() => {
        if (!gameOver) {
            scoreRef.current = 0;
            setScore(0);
        }
    }, [gameOver]);

    return (
        <>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
            {showExplosion && explosionPos && (
                <img
                    src={EXPLOSION_GIF}
                    alt="Explosion"
                    style={{
                        position: 'absolute',
                        left: explosionPos.x,
                        top: explosionPos.y,
                        width: explosionPos.width,
                        height: explosionPos.height,
                        pointerEvents: 'none',
                        zIndex: 10
                    }}
                />
            )}
        </>
    );
};

export default GameCanvas;