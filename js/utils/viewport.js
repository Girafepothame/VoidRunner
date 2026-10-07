export function isVisibleOnScreen(entity, cameraX, cameraY, viewportWidth, viewportHeight, margin){
  return entity.x >= cameraX - margin && entity.x <= cameraX + viewportWidth + margin
    && entity.y >= cameraY - margin && entity.y <= cameraY + viewportHeight + margin;
}
