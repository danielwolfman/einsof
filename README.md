# Endless Flight Game

## Description
Endless Flight is an online multiplayer game where players control a spaceship navigating through a field of bizarrely shaped asteroids. The asteroids are randomly generated and feature unique shapes, including holes, allowing players to fly through them. The game speeds up as the spaceship survives longer, providing an exhilarating experience.

## Tech Stack
- **Frontend**: React, TypeScript
- **Backend**: Node.js, Express, TypeScript

## Installation Instructions

### Backend Setup
1. Navigate to the `backend` directory:
   ```
   cd backend
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Start the backend server:
   ```
   npm start
   ```

### Frontend Setup
1. Navigate to the `frontend` directory:
   ```
   cd frontend
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Start the frontend application:
   ```
   npm start
   ```

## Game Features

- Endless flight mechanics that allow continuous gameplay.
- A physics engine that manages the movement of the spaceship and asteroids, including collision detection.
- Speed increases over time, enhancing the challenge as players survive longer.

## Development Tasks

- [ ] Spaceship always moves forward (no input needed for forward movement)
- [ ] Gradually increase speed as the game progresses
- [ ] Spaceship is fixed in third-person view (bottom center of the screen)
- [ ] Only allow left/right (and maybe up/down) movement for dodging
- [ ] Implement starfield background with "warp" effect (stars stretch/move faster as speed increases)
- [ ] Replace blue rectangle with spaceship sprite (pixel art or image)
- [ ] Generate and animate asteroids with bizarre shapes and holes, moving towards the player
- [ ] Asteroids and stars move faster as speed increases
- [ ] Add collision detection between spaceship and asteroids
- [ ] Add scoring system based on survival time/distance

## Future Work

- Implement multiplayer functionality to allow multiple players to compete or cooperate.
- Enhance the asteroid generation algorithm to create more diverse and interesting shapes.
- Improve graphics and animations for a more immersive experience.

## Contributing

Contributions are welcome! Please submit a pull request or open an issue to discuss potential improvements or features.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.