// Spaceship state and rendering
export interface Spaceship {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function drawSpaceship(context: CanvasRenderingContext2D, spaceship: Spaceship, img: HTMLImageElement | null) {
  if (img && img.complete) {
    context.drawImage(img, spaceship.x, spaceship.y, spaceship.width, spaceship.height);
  } else {
    context.fillStyle = 'blue';
    context.fillRect(spaceship.x, spaceship.y, spaceship.width, spaceship.height);
  }
}
