/**
 * Even grid for response windows.
 * Columns are chosen so every window stays wide enough to read,
 * and a short last row is centered instead of stretched into a sliver.
 */

export const TILE_GAP = 14;
export const MIN_TILE_WIDTH = 420;
export const MIN_TILE_HEIGHT = 220;
export const MAX_TILE_HEIGHT = 680;
const TARGET_TILE_WIDTH = 680;
export const TILE_MARGIN = 28;
/** Room left under the windows for the bottom command bar. */
export const DOCK_RESERVE = 128;

export const DEFAULT_PREFERRED = {
  settings: { width: 640, height: 560 },
  otp: { width: 520, height: 440 },
  response: { width: 560, height: 360 },
};

function preferredSize(panel) {
  const fallback = DEFAULT_PREFERRED[panel?.kind] || DEFAULT_PREFERRED.response;
  return {
    width: Math.max(1, Number(panel?.preferred?.width) || fallback.width),
    height: Math.max(1, Number(panel?.preferred?.height) || fallback.height),
  };
}

function chooseColumns(count, width, height, gap) {
  const maxColsByWidth = Math.max(1, Math.floor((width + gap) / (MIN_TILE_WIDTH + gap)));
  const maxCols = Math.min(count, maxColsByWidth);
  let best = 1;
  let bestScore = Infinity;

  for (let cols = 1; cols <= maxCols; cols += 1) {
    const rows = Math.ceil(count / cols);
    const cellWidth = (width - gap * (cols - 1)) / cols;
    const cellHeight = (height - gap * (rows - 1)) / rows;
    if (cellWidth + 0.5 < MIN_TILE_WIDTH) continue;
    if (rows > 1 && cellHeight + 0.5 < MIN_TILE_HEIGHT) continue;

    const empty = cols * rows - count;
    const widthPenalty = Math.abs(cellWidth - TARGET_TILE_WIDTH) / TARGET_TILE_WIDTH;
    const skinnyPenalty = cellHeight > cellWidth * 1.35 ? cellHeight / cellWidth - 1.35 : 0;
    const score = widthPenalty + skinnyPenalty + empty * 0.35;
    if (score < bestScore) {
      bestScore = score;
      best = cols;
    }
  }

  return best;
}

function layoutSingle(panel, region) {
  const preferred = preferredSize(panel);
  const width = Math.min(region.width, Math.max(MIN_TILE_WIDTH, preferred.width));
  const height = Math.min(region.height, Math.max(MIN_TILE_HEIGHT, preferred.height));
  return [
    {
      panelId: panel.id,
      x: region.x + Math.max(0, (region.width - width) / 2),
      y: region.y + Math.max(0, (region.height - height) / 2),
      width,
      height,
    },
  ];
}

function layoutGrid(panels, region, gap) {
  const count = panels.length;
  const columns = chooseColumns(count, region.width, region.height, gap);
  const rows = Math.ceil(count / columns);
  const cellWidth = (region.width - gap * (columns - 1)) / columns;
  const usedHeight = Math.min(region.height, rows * MAX_TILE_HEIGHT + (rows - 1) * gap);
  const cellHeight = (usedHeight - gap * (rows - 1)) / rows;
  const blockY = region.y + Math.max(0, (region.height - usedHeight) / 2);

  return panels.map((panel, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    const rowWidth = rowCount * cellWidth + (rowCount - 1) * gap;
    const rowX = region.x + (region.width - rowWidth) / 2;
    return {
      panelId: panel.id,
      x: rowX + column * (cellWidth + gap),
      y: blockY + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
    };
  });
}

/**
 * Full-width area above the command bar.
 */
export function computeTileRegion(viewportWidth, viewportHeight, {
  margin = TILE_MARGIN,
  dockReserve = DOCK_RESERVE,
} = {}) {
  const x = margin;
  const y = margin;
  const width = Math.max(MIN_TILE_WIDTH, viewportWidth - margin * 2);
  const height = Math.max(MIN_TILE_HEIGHT, viewportHeight - margin * 2 - dockReserve);
  return { x, y, width, height };
}

/**
 * @param {Array<{ id: string, kind?: string, preferred?: { width: number, height: number } }>} panels
 * @param {{ x: number, y: number, width: number, height: number }} region
 * @param {{ gap?: number }} [options]
 * @returns {Array<{ panelId: string, x: number, y: number, width: number, height: number }>}
 */
export function computeTileRects(panels, region, { gap = TILE_GAP } = {}) {
  if (!panels?.length || !region) return [];
  if (panels.length === 1) return layoutSingle(panels[0], region);
  return layoutGrid(panels, region, gap);
}
