import React, { useEffect, useState } from 'react';
import GameCanvas from './components/GameCanvas';
import UI from './components/UI';

const App: React.FC = () => {
    const [score, setScore] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [isGameRunning, setIsGameRunning] = useState(true);

    useEffect(() => {
        const gameLoop = setInterval(() => {
            if (isGameRunning) {
                setScore(prevScore => prevScore + 1);
                setSpeed(prevSpeed => prevSpeed + 0.1); // Increase speed over time
            }
        }, 1000); // Update every second

        return () => clearInterval(gameLoop);
    }, [isGameRunning]);

    const handleGameOver = () => {
        setIsGameRunning(false);
        // Additional game over logic can be added here
    };

    return (
        <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
            <GameCanvas speed={speed} onGameOver={handleGameOver} />
            <UI score={score} speed={speed} />
        </div>
    );
};

export default App;