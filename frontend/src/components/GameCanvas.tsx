import React, { useEffect, useRef, useState } from 'react';
import { drawStarfield } from './Starfield';
import { drawSpaceship } from './Spaceship';
import { drawAsteroids } from './Asteroids';
import { projectStar } from './Starfield';
import { generateAsteroid3D } from './Asteroids';
import { checkCollision } from '../utils/collision';
import type { Asteroid } from './Asteroids';

// Utility functions for relative measurements
const getWidthFromPercent = (percent: number, canvas: HTMLCanvasElement): number => {
    return (percent / 100) * canvas.width;
};

const getHeightFromPercent = (percent: number, canvas: HTMLCanvasElement): number => {
    return (percent / 100) * canvas.height;
};

interface GameCanvasProps {
    speed: number;
    onGameOver: () => void;
}

const INITIAL_SPEED = 0.05;
const SPEED_INCREMENT = 0.0005;
const SPACESHIP_WIDTH = 160;
const SPACESHIP_HEIGHT = 128;
const SPACESHIP_WIDTH_PERCENT = 12; // New constant for spaceship width percentage
const SPACESHIP_HEIGHT_PERCENT = 18; // New constant for spaceship height percentage
const SPACESHIP_SPRITE = process.env.PUBLIC_URL + '/spaceship-sprite.png';
const AFTERBURNER_SPRITE = process.env.PUBLIC_URL + '/afterburner.PNG';
const EXPLOSION_GIF = process.env.PUBLIC_URL + '/explosion.gif';

// Game speed multipliers
const AFTERBURNER_SPEED_MULTIPLIER = 3;
const AFTERBURNER_SCORE_MULTIPLIER = 2;

// 3D starfield parameters
const STAR_COUNT_MIN = 20;
const STAR_COUNT_MAX = 180;
const STARFIELD_DEPTH = 1200; // How far stars spawn from camera
const CAMERA_ANGLE_DEG = 60;
const CAMERA_ANGLE_RAD = (CAMERA_ANGLE_DEG * Math.PI) / 180;

// Asteroid configuration constants
const ASTEROID_COUNT = 5;
const ASTEROID_MIN_Z_FACTOR = 85;
const ASTEROID_MAX_Z_FACTOR = 120;
const ASTEROID_MIN_SPEED = 10;
const ASTEROID_MAX_SPEED = 20;

const MAX_MANEUVER_SPEED = 18; // Maximum left/right speed
const BASE_MANEUVER_SPEED = 2; // Starting left/right speed
const MANEUVER_RAMP = 10; // How much speedRef.current must increase to reach max maneuver speed

const INITIAL_FUEL = 100;
const FUEL_DRAIN_RATE = 0.003; // Normal fuel consumption rate
const AFTERBURNER_FUEL_DRAIN_RATE = 0.015; // Fuel consumption rate with afterburner

// Fuel popup interface
interface FuelPopup {
    x: number;
    y: number; // Current y position
    initialY: number; // Store initial y position
    amount: number;
    opacity: number; // Current opacity
    createdAt: number; // Timestamp of creation
    fixedDuration: number; // Duration to stay fixed (ms)
    fadeDuration: number; // Duration of fade/float animation (ms)
    floatDistance: number; // Total distance to float upwards during fade (px)
}

const GameCanvas: React.FC<GameCanvasProps> = ({ speed: initialSpeed, onGameOver }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const gameLoopRef = useRef<number | null>(null);
    const speedRef = useRef<number>(initialSpeed || INITIAL_SPEED);
    const afterburnerActiveRef = useRef<boolean>(false);
    const velocityRef = useRef({ x: 0, y: 0 }); // Updated for vertical movement
    const afterburnerImgRef = useRef<HTMLImageElement | null>(null);
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
        opacity: number; // Add opacity property
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
    // Afterburner state
    const [afterburnerActive, setAfterburnerActive] = React.useState(false);
    const afterburnerTimeoutRef = useRef<number | null>(null);
    // Fuel state
    const [fuelLevel, setFuelLevel] = useState(INITIAL_FUEL);
    const fuelRef = useRef(INITIAL_FUEL);
    const [fuelPopups, setFuelPopups] = useState<FuelPopup[]>([]);
    const MIN_FUEL_BONUS = 10;
    const MAX_FUEL_BONUS = 50;
    // Distance percentages for fuel bonus collection
    const FUEL_RADIUS_MIN_PERCENT = 0.1; // 0.1% of screen width
    const FUEL_RADIUS_MAX_PERCENT = 25; // 25% of screen width
    const STAR_FADE_IN_RATE = 0.01; // Adjust as needed
    const AFTERBURNER_ACCELERATION_RATE = 0.2; // Rate at which afterburner accelerates
    const currentAccelerationRef = useRef<number>(1); // Current acceleration multiplier

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

        // Load afterburner image
        const afterburnerImg = new window.Image();
        afterburnerImg.src = AFTERBURNER_SPRITE;
        afterburnerImg.onload = () => {
            afterburnerImgRef.current = afterburnerImg;
            if (process.env.NODE_ENV === 'development') console.log('[GameCanvas] Afterburner image loaded');
        };

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
                    speed: 1 + Math.random() * 2,
                    opacity: 0 // Initialize opacity to 0
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
            const maneuverSpeed = calculateManeuverSpeed();

            // Handle afterburner - only activate if there's fuel
            if (e.key === ' ' && !gameOver && fuelRef.current > 0) {
                e.preventDefault(); // Prevent page scroll
                afterburnerActiveRef.current = true;
            }

            // Movement controls
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
                // Reset fuel
                setFuelLevel(INITIAL_FUEL);
                fuelRef.current = INITIAL_FUEL;
                // Reset game over state
                setGameOver(false);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (['ArrowLeft', 'ArrowRight'].includes(e.key)) velocityRef.current.x = 0;
            if (['ArrowUp', 'ArrowDown'].includes(e.key)) velocityRef.current.y = 0;
            if (e.key === ' ' && !gameOver) {
                afterburnerActiveRef.current = false;
            }
        };

        // Mouse/Touch control handlers
        const handlePointerDown = (e: MouseEvent | TouchEvent) => {
            if (gameOver) return;
            isMouseControlRef.current = true;
            const pos = 'touches' in e ? e.touches[0] : e;
            mousePositionRef.current = { x: pos.clientX, y: pos.clientY };
        };

        const handlePointerMove = (e: MouseEvent | TouchEvent) => {
            if (gameOver || !isMouseControlRef.current) return;
            const pos = 'touches' in e ? e.touches[0] : e;
            mousePositionRef.current = { x: pos.clientX, y: pos.clientY };
            
            // Prevent scrolling on mobile devices
            if ('touches' in e) {
                e.preventDefault();
            }
        };

        const handlePointerUp = () => {
            isMouseControlRef.current = false;
            velocityRef.current = { x: 0, y: 0 };
        };

        // Add all event listeners
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('mousemove', handlePointerMove);
        document.addEventListener('mouseup', handlePointerUp);
        document.addEventListener('touchstart', handlePointerDown);
        document.addEventListener('touchmove', handlePointerMove, { passive: false });
        document.addEventListener('touchend', handlePointerUp);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('mousemove', handlePointerMove);
            document.removeEventListener('mouseup', handlePointerUp);
            document.removeEventListener('touchstart', handlePointerDown);
            document.removeEventListener('touchmove', handlePointerMove);
            document.removeEventListener('touchend', handlePointerUp);
        };
    }, [gameOver, initialSpeed]);

    // Make spaceship size scale with window size using percentages
    const getScaledSpaceshipSize = () => {
        const canvas = canvasRef.current;
        if (!canvas) return { width: SPACESHIP_WIDTH, height: SPACESHIP_HEIGHT };
        
        return {
            width: getWidthFromPercent(SPACESHIP_WIDTH_PERCENT, canvas),
            height: getHeightFromPercent(SPACESHIP_HEIGHT_PERCENT, canvas)
        };
    };

    const calculateManeuverSpeed = () => {
        let speed = Math.min(
            BASE_MANEUVER_SPEED + (MAX_MANEUVER_SPEED - BASE_MANEUVER_SPEED) * Math.min(1, (speedRef.current - INITIAL_SPEED) / MANEUVER_RAMP),
            MAX_MANEUVER_SPEED
        );
        
        // Reduce speed by 90% when out of fuel
        if (fuelRef.current <= 0) {
            speed *= 0.1;
        }
        
        return speed;
    };

    const updateGame = () => {
        if (gameOver) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const now = Date.now(); // Get current time

        // Update fuel popups
        setFuelPopups(prevPopups =>
            prevPopups.map(popup => {
                const elapsedTime = now - popup.createdAt;
                if (elapsedTime < popup.fixedDuration) {
                    // Fixed duration: full opacity, initial position
                    return {
                        ...popup,
                        opacity: 1,
                        y: popup.initialY // Keep at initial y
                    };
                } else {
                    // Fade and float duration
                    const fadeElapsedTime = elapsedTime - popup.fixedDuration;
                    const fadeProgress = Math.min(1, fadeElapsedTime / popup.fadeDuration);
                    const newOpacity = 1 - fadeProgress;
                    const newY = popup.initialY - (fadeProgress * popup.floatDistance);
                    return {
                        ...popup,
                        opacity: newOpacity,
                        y: newY
                    };
                }
            }).filter(popup => popup.opacity > 0) // Remove fully faded popups
        );

        // Update fuel level
        if (fuelRef.current > 0) {
            const fuelDrain = afterburnerActiveRef.current ? AFTERBURNER_FUEL_DRAIN_RATE : FUEL_DRAIN_RATE;
            fuelRef.current = Math.max(0, fuelRef.current - fuelDrain);
            setFuelLevel(fuelRef.current);
        } else {
            // Ensure afterburner is off when no fuel
            afterburnerActiveRef.current = false;
        }

        // Check for nearby asteroids and award fuel bonuses
        const fov = Math.tan(CAMERA_ANGLE_RAD / 2);
        const aspect = canvas.width / canvas.height;
        const visibleAsteroids = asteroidsRef.current.filter(a => a.z < STARFIELD_DEPTH && a.z > 0);

        visibleAsteroids.forEach(asteroid => {
            console.log(`Checking asteroid at z=${asteroid.z}, angle=${asteroid.angle}, outer points=${asteroid.outer.length}`);
            const proj = projectStar(asteroid, canvas, fov, aspect);
            const shipCenterX = spaceshipRef.current.x + spaceshipRef.current.width / 2;
            const shipCenterY = spaceshipRef.current.y + spaceshipRef.current.height / 2;

            // Calculate distance from ship center to nearest point on asteroid's outer shape
            const scale = canvas.width / (asteroid.z * fov) * 0.5;
            const angle = asteroid.angle;

            // Transform asteroid's outer points
            const transformedPoints = asteroid.outer.map(pt => {
                const rx = Math.cos(angle) * pt.x - Math.sin(angle) * pt.y;
                const ry = Math.sin(angle) * pt.x + Math.cos(angle) * pt.y;
                return {
                    x: proj.x + rx * scale,
                    y: proj.y + ry * scale
                };
            });

            // Find closest point on asteroid's outer shape to ship center
            let closestDistance = Infinity;
            for (let i = 0; i < transformedPoints.length; i++) {
                const p1 = transformedPoints[i];
                const p2 = transformedPoints[(i + 1) % transformedPoints.length];

                // Calculate distance to line segment
                const segmentDistance = distanceToLineSegment(
                    { x: shipCenterX, y: shipCenterY },
                    p1,
                    p2
                );

                closestDistance = Math.min(closestDistance, segmentDistance);
            }

            const distance = closestDistance;

            // Log distance when ship is somewhat near asteroid
            if (process.env.NODE_ENV === 'development') {
                console.log(`Distance to asteroid: ${Math.round(distance)}px`);
                // Increase scaling factor for bonus radius
                const maxDistance = (FUEL_RADIUS_MAX_PERCENT / 100) * canvas.width * 8000; // Increased from 500 to 800
                const minDistance = (FUEL_RADIUS_MIN_PERCENT / 100) * canvas.width * 8000; // Increased from 500 to 800
                console.log(`Bonus radius range: ${Math.round(minDistance)}px - ${Math.round(maxDistance)}px`);
                console.log(`Bonus amount if collected: ${Math.round(MIN_FUEL_BONUS + (MAX_FUEL_BONUS - MIN_FUEL_BONUS) * (1 - Math.max(0, (distance - minDistance) / (maxDistance - minDistance))))}`);
                console.log('---');
            }

            // Only give fuel bonus if within the maximum radius and asteroid hasn't given bonus yet
            // Increase scaling factor for bonus radius
            const maxDistance = (FUEL_RADIUS_MAX_PERCENT / 100) * canvas.width * 8000; // Increased from 800 to 1600
            const minDistance = (FUEL_RADIUS_MIN_PERCENT / 100) * canvas.width * 8000; // Increased from 800 to 1600
            if (distance <= maxDistance && !asteroid.gaveFuelBonus) {
                // Calculate bonus amount based on distance
                const distanceRatio = 1 - Math.max(0, (distance - minDistance) / (maxDistance - minDistance));
                if (distanceRatio > 0) {
                    const bonusAmount = Math.round(MIN_FUEL_BONUS + (MAX_FUEL_BONUS - MIN_FUEL_BONUS) * distanceRatio);

                    // Add fuel bonus
                    fuelRef.current = Math.min(INITIAL_FUEL, fuelRef.current + bonusAmount);
                    setFuelLevel(fuelRef.current);

                    // Create popup at a position weighted towards the spaceship for better visibility
                    const popupPosition = (px: number, py: number, shipX: number, shipY: number) => {
                        // Weight the position more towards the ship (80% ship position, 20% asteroid position)
                        const x = px * 0.2 + shipX * 0.8;
                        const y = py * 0.2 + shipY * 0.8;

                        // Clamp position to screen bounds with some padding
                        const padding = 100;
                        return {
                            x: Math.max(padding, Math.min(canvas.width - padding, x)),
                            y: Math.max(padding, Math.min(canvas.height - padding, y))
                        };
                    };

                    const pos = popupPosition(proj.x, proj.y, shipCenterX, shipCenterY);

                    if (process.env.NODE_ENV === 'development') {
                        console.log(`Fuel bonus awarded! Distance: ${Math.round(distance)}px, Amount: ${bonusAmount}`);
                        console.log(`Asteroid position: (${Math.round(proj.x)}, ${Math.round(proj.y)})`);
                        console.log(`Ship position: (${Math.round(shipCenterX)}, ${Math.round(shipCenterY)})`);
                        console.log(`Popup position: (${Math.round(pos.x)}, ${Math.round(pos.y)})`);
                    }

                    setFuelPopups(prev => [...prev, {
                        x: pos.x,
                        y: pos.y,
                        initialY: pos.y, // Store initial y
                        amount: bonusAmount,
                        opacity: 1, // Start fully visible
                        createdAt: Date.now(), // Record creation time
                        fixedDuration: 2000, // Stay fixed for 2 seconds
                        fadeDuration: 1500, // Fade and float for 1.5 seconds after fixed duration
                        floatDistance: 50 // Float up 50 pixels
                    }]);

                    // Mark asteroid as having given bonus
                    asteroid.gaveFuelBonus = true;
                }
            }
        });

        // Apply speed multiplier if afterburner is active and fuel available
        if (afterburnerActiveRef.current && fuelRef.current > 0) {
            currentAccelerationRef.current = Math.min(AFTERBURNER_SPEED_MULTIPLIER, currentAccelerationRef.current + AFTERBURNER_ACCELERATION_RATE);
        } else {
            currentAccelerationRef.current = 1; // Reset when afterburner is off or no fuel
        }
        const speedMultiplier = currentAccelerationRef.current;
        
        // Speed and score updates
        if (fuelRef.current > 0) {
            // Modify the speed increment and the base speed update based on the multiplier
            const currentSpeedIncrement = SPEED_INCREMENT * speedMultiplier;
            speedRef.current += currentSpeedIncrement;

            // Update score based on afterburner state
            scoreRef.current += 0.01 * (afterburnerActiveRef.current ? AFTERBURNER_SCORE_MULTIPLIER : 1);
        }

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
            
            // Calculate maneuver speed based on current game speed and fuel level
            const maneuverSpeed = calculateManeuverSpeed();
            
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
        
        // 3D starfield update - reuse existing fov and aspect variables
        starsRef.current.forEach(star => {
            // Save previous projected position for warp effect
            if (star.z > 0) {
                const prevProj = projectStar(star, canvas, fov, aspect);
                star.px = prevProj.x;
                star.py = prevProj.y;
            }
            // Move star forward (decrease z) - Apply speedMultiplier here
            // Limit maximum star movement speed
            const maxSpeed = 2.5;
            // Reduce star speed relative to asteroids
            const starSpeed = Math.min(maxSpeed, speedRef.current * star.speed * 0.005 * speedMultiplier); // Reduced multiplier from 1.5 to 0.5
            star.z -= starSpeed;
            // Increase opacity for fade-in
            star.opacity = Math.min(1, star.opacity + STAR_FADE_IN_RATE);
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
                star.opacity = 0; // Reset opacity to 0 on respawn
            }
        });
        // Asteroid movement (like stars) - Apply speedMultiplier here too
        asteroidsRef.current.forEach(asteroid => {
            // Remove speed limit on asteroids for more challenging gameplay
            asteroid.z -= speedRef.current * asteroid.speed * speedMultiplier;
            asteroid.angle += asteroid.spin;
            // Always fade in asteroids from their spawn point
            const spawnZ = STARFIELD_DEPTH * ASTEROID_MAX_Z_FACTOR;
            const visibleStartZ = STARFIELD_DEPTH * ASTEROID_MIN_Z_FACTOR;
            const fadeDistance = spawnZ - visibleStartZ;
            
            // Calculate base opacity from distance
            const distanceFromSpawn = spawnZ - asteroid.z;
            const baseT = Math.max(0, Math.min(1, distanceFromSpawn / fadeDistance));
            
            // Apply a quadratic ease-in curve for smoother fade
            const smoothT = baseT * baseT;
            asteroid.opacity = Math.min(1, Math.max(0, smoothT));
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
                asteroid.color = newAst.color;
                asteroid.angle = newAst.angle;
                asteroid.spin = newAst.spin;
                asteroid.opacity = 0; // Reset opacity for fade-in
                asteroid.gaveFuelBonus = false; // Reset fuel bonus flag
            }
        });
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
        // Fix: Only check collision if asteroids are actually visible (z < STARFIELD_DEPTH)
        // Only check collision if asteroids are close to the camera and their projected polygon is actually on screen
        if (
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
            drawStarfield(context, canvas, speedRef.current, starsRef.current, afterburnerActiveRef.current);
            // Sort asteroids by z (closest first) before drawing
            asteroidsRef.current.sort((a, b) => a.z - b.z);
            drawAsteroids(context, canvas, asteroidsRef.current, projectStar, fov, aspect);
            
            // Draw score at top right with relative positioning and sizing
            context.save();
            const fontSize = Math.max(20, canvas.height * 0.045); // 4.5% of screen height, min 20px
            context.font = `bold ${fontSize}px 'Press Start 2P', 'Arial', monospace`;
            context.textAlign = 'right';
            context.textBaseline = 'top';
            context.fillStyle = afterburnerActiveRef.current ? '#ff00ff' : '#fff';
            context.strokeStyle = '#222';
            context.lineWidth = Math.max(2, canvas.width * 0.003); // Line width scales with screen size
            
            const rightPadding = canvas.width * 0.03; // 3% from right edge
            const topPadding = canvas.height * 0.045; // 4.5% from top
            const scoreSpacing = fontSize * 1.5; // Space between score and high score
            
            const scoreText = `SCORE: ${Math.floor(scoreRef.current)}`;
            context.strokeText(scoreText, canvas.width - rightPadding, topPadding);
            context.fillText(scoreText, canvas.width - rightPadding, topPadding);
            // Draw high score below score
            const highScoreText = `HIGH: ${Math.floor(highScore)}`;
            context.strokeText(highScoreText, canvas.width - rightPadding, topPadding + scoreSpacing);
            context.fillText(highScoreText, canvas.width - rightPadding, topPadding + scoreSpacing);

            // Draw fuel bar at top left with relative measurements
            const barWidth = canvas.width * 0.15; // 15% of screen width
            const barHeight = canvas.height * 0.028; // 2.8% of screen height
            const barX = canvas.width * 0.03; // 3% from left
            const barY = canvas.height * 0.045; // 4.5% from top
            
            // Fuel text
            context.font = `bold ${Math.max(16, canvas.height * 0.033)}px 'Press Start 2P', 'Arial', monospace`;
            context.textAlign = 'left';
            context.fillStyle = '#fff';
            context.strokeStyle = '#000';
            context.lineWidth = 4;
            context.strokeText('FUEL', barX, barY + barHeight / 2 - 18);
            context.fillText('FUEL', barX, barY + barHeight / 2 - 18);

            const barStartX = barX + 220; // Move bar to the right of the text
            
            // Background of fuel bar
            context.fillStyle = '#333';
            context.fillRect(barStartX, barY, barWidth, barHeight);
            
            // Fuel level
            const fuelWidth = (fuelRef.current / INITIAL_FUEL) * barWidth; // Use fuelRef.current instead of fuelLevel
            const fuelColor = fuelRef.current > 30 ? '#00ff00' : fuelRef.current > 10 ? '#ff9900' : '#ff0000';
            context.fillStyle = fuelColor;
            context.fillRect(barStartX, barY, fuelWidth, barHeight);
            
            // Border of fuel bar
            context.strokeStyle = '#fff';
            context.lineWidth = 2;
            context.strokeRect(barStartX, barY, barWidth, barHeight);
            context.restore();

            // Only draw spaceship if not game over
            if (!gameOver) {
                drawSpaceship(context, spaceshipRef.current, spaceshipImgRef.current, afterburnerImgRef.current, afterburnerActiveRef.current);
            }
            
            if (gameOver) {
                // Draw GAME OVER in arcade font with relative sizing
                context.save();
                context.globalAlpha = 0.95;
                const gameOverFontSize = Math.min(canvas.width * 0.1, canvas.height * 0.15); // 10% of width or 15% of height, whichever is smaller
                context.font = `bold ${gameOverFontSize}px 'Press Start 2P', 'Arial', monospace`;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.shadowColor = '#000';
                context.shadowBlur = Math.max(8, canvas.width * 0.012); // Scale shadow blur with screen size
                context.fillStyle = '#ff0044';
                context.strokeStyle = '#fff';
                const msg = 'GAME OVER';
                const x = canvas.width / 2;
                const y = canvas.height / 2;
                context.lineWidth = Math.max(4, canvas.width * 0.006); // Scale line width with screen size
                context.strokeText(msg, x, y);
                context.fillText(msg, x, y);
                context.restore();
            }                // Draw fuel popups
            fuelPopups.forEach((popup) => {
                context.save();
                context.globalAlpha = popup.opacity;
                
                // Calculate size based on screen dimensions
                const circleSize = Math.max(30, canvas.width * 0.025);
                const fontSize = Math.max(28, canvas.width * 0.022);
                
                // Draw glowing circle
                context.fillStyle = '#00ff00';
                context.shadowColor = '#00ff00';
                context.shadowBlur = circleSize * 0.6;
                context.beginPath();
                context.arc(popup.x, popup.y, circleSize, 0, Math.PI * 2);
                context.fill();

                // Draw text with outline for better visibility
                context.shadowBlur = 0;
                context.font = `bold ${fontSize}px "Press Start 2P"`;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                
                // Draw outline
                context.strokeStyle = '#000';
                context.lineWidth = Math.max(3, fontSize * 0.15);
                context.strokeText(`+${popup.amount}`, popup.x, popup.y);
                
                // Draw text
                context.fillStyle = '#fff';
                context.fillText(`+${popup.amount}`, popup.x, popup.y);
                
                context.restore();
            });
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

// Helper function for point-to-line-segment distance
function distanceToLineSegment(p: { x: number; y: number }, v: { x: number; y: number }, w: { x: number; y: number }) {
    const lengthSquared = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
    if (lengthSquared === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
    
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    
    return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + 
                   Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
}

export default GameCanvas;