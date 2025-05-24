import React from 'react';

const UI: React.FC<{ score: number; speed: number }> = ({ score, speed }) => {
    return (
        <div className="ui">
            <h1>Endless Flight</h1>
            <div className="score">Score: {score}</div>
            <div className="speed">Speed: {speed.toFixed(2)} units/s</div>
        </div>
    );
};

export default UI;