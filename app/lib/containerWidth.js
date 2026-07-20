const DEFAULT_PC_CONTAINER_WIDTH = 1200;
const MIN_PC_CONTAINER_WIDTH = 600;
const MIN_PC_CONTAINER_WIDTH_MAX = 2000;

export { DEFAULT_PC_CONTAINER_WIDTH, MIN_PC_CONTAINER_WIDTH, MIN_PC_CONTAINER_WIDTH_MAX };

export function getPcContainerWidthMax() {
  if (typeof window === 'undefined') return MIN_PC_CONTAINER_WIDTH_MAX;
  return Math.max(MIN_PC_CONTAINER_WIDTH_MAX, Number(window.innerWidth) || 0);
}

export function clampPcContainerWidth(value) {
  const num = Number(value);
  const width = Number.isFinite(num) ? num : DEFAULT_PC_CONTAINER_WIDTH;
  return Math.min(getPcContainerWidthMax(), Math.max(MIN_PC_CONTAINER_WIDTH, width));
}
