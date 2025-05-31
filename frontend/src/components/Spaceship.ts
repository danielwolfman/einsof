// Spaceship state and rendering
export interface Spaceship {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function drawSpaceship(
  context: CanvasRenderingContext2D, 
  spaceship: Spaceship, 
  img: HTMLImageElement | null,
  afterburnerImg: HTMLImageElement | null = null,
  afterburnerActive: boolean = false
) {
  context.save();
  
  // Draw afterburner effects if active
  if (afterburnerActive && afterburnerImg && afterburnerImg.complete) {
    const time = Date.now() / 1000; // Time in seconds
    const pulse = 0.8 + Math.sin(time * 10) * 0.2; // Pulsing between 0.6 and 1.0
    const afterburnerScale = 1.2 * pulse;
    
    context.globalAlpha = 0.8;

    // Left afterburner
    context.drawImage(
      afterburnerImg,
      spaceship.x + spaceship.width * 0.29, // Moved from 0.15 to 0.35
      spaceship.y + spaceship.height * 0.8,
      spaceship.width * 0.15, // Reduced from 0.2 to 0.15
      spaceship.height * afterburnerScale
    );

    // Center afterburner (slightly larger)
    context.drawImage(
      afterburnerImg,
      spaceship.x + spaceship.width * 0.425, // Moved from 0.4 to 0.425
      spaceship.y + spaceship.height * 0.8,
      spaceship.width * 0.15, // Reduced from 0.2 to 0.15
      spaceship.height * (afterburnerScale * 1.2) // Keep the center one slightly larger
    );

    // Right afterburner
    context.drawImage(
      afterburnerImg,
      spaceship.x + spaceship.width * 0.56, // Moved from 0.65 to 0.5
      spaceship.y + spaceship.height * 0.8,
      spaceship.width * 0.15, // Reduced from 0.2 to 0.15
      spaceship.height * afterburnerScale
    );
  }
  
  // Draw spaceship on top of afterburner effects
  if (img && img.complete) {
    context.drawImage(img, spaceship.x, spaceship.y, spaceship.width, spaceship.height);
  } else {
    context.fillStyle = 'blue';
    context.fillRect(spaceship.x, spaceship.y, spaceship.width, spaceship.height);
  }
  
  context.restore();
}
