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
    const starsRef = useRef<Array<{ x: number; y: number; speed: number; size: number }>>([]);
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
            const numStars = 120;
            starsRef.current = Array.from({ length: numStars }, () => ({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                speed: 1 + Math.random() * 2,
                size: 1 + Math.random() * 2
            }));
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
                starsRef.current.forEach(star => {
                    if (star.x > canvas.width) star.x = Math.random() * canvas.width;
                    if (star.y > canvas.height) star.y = Math.random() * canvas.height;
                });
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
        // Move stars down by speed, wrap to top
        starsRef.current.forEach(star => {
            star.y += speedRef.current * star.speed * 1.5;
            if (star.y > canvas.height) {
                star.x = Math.random() * canvas.width;
                star.y = 0;
                star.size = 1 + Math.random() * 2;
                star.speed = 1 + Math.random() * 2;
            }
        });
        // Throttle log
        const now = Date.now();
        if (process.env.NODE_ENV === 'development' && now - lastLogTimeRef.current > 5000) {
            // console.log('[GameCanvas] updateGame velocity.x', velocityRef.current.x, 'spaceship.x', spaceship.x, 'spaceship size', spaceship.width, spaceship.height);
            lastLogTimeRef.current = now;
        }
    };

    const drawStarfield = (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, speed: number) => {
        // Draw stars as lines for "warp" effect
        starsRef.current.forEach(star => {
            context.save();
            context.strokeStyle = 'white';
            context.globalAlpha = 0.7;
            context.beginPath();
            context.moveTo(star.x, star.y);
            // Warp effect: stretch line based on speed
            context.lineTo(star.x, star.y - speed * star.speed * 6);
            context.lineWidth = star.size;
            context.stroke();
            context.globalAlpha = 1.0;
            context.restore();
        });
    };

    const drawGame = () => {
        const context = contextRef.current;
        const canvas = canvasRef.current;
        if (context && canvas) {
            context.clearRect(0, 0, canvas.width, canvas.height);
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