/**
 * Hyprland-inspired dwindle BSP layout.
 * Splits the largest leaf by area along its longer axis,
 * weighting the cut by preferred panel areas.
 */

export const TILE_GAP = 14;
export const MIN_TILE_WIDTH = 240;
export const MIN_TILE_HEIGHT = 140;

export const DEFAULT_PREFERRED = {
  settings: { width: 400, height: 420 },
  otp: { width: 420, height: 360 },
  response: { width: 420, height: 280 },
};

export function preferredArea(panel) {
  const width = Math.max(1, Number(panel?.preferred?.width) || DEFAULT_PREFERRED.response.width);
  const height = Math.max(1, Number(panel?.preferred?.height) || DEFAULT_PREFERRED.response.height);
  return width * height;
}

function leafArea(leaf) {
  return Math.max(0, leaf.width) * Math.max(0, leaf.height);
}

function findLargestLeaf(node) {
  if (node.type === "leaf") return node;
  const left = findLargestLeaf(node.left);
  const right = findLargestLeaf(node.right);
  return leafArea(left) >= leafArea(right) ? left : right;
}

function subtreePreferredArea(node, preferredById) {
  if (node.type === "leaf") {
    return preferredById.get(node.panelId) || 1;
  }
  return (
    subtreePreferredArea(node.left, preferredById) +
    subtreePreferredArea(node.right, preferredById)
  );
}

function splitLeaf(leaf, newPanelId, preferredById) {
  const horizontal = leaf.width >= leaf.height;
  const existingArea = preferredById.get(leaf.panelId) || 1;
  const incomingArea = preferredById.get(newPanelId) || 1;
  const total = existingArea + incomingArea;
  let ratio = existingArea / total;

  if (horizontal) {
    const minRatio = MIN_TILE_WIDTH / Math.max(leaf.width, MIN_TILE_WIDTH * 2);
    const maxRatio = 1 - minRatio;
    ratio = Math.min(maxRatio, Math.max(minRatio, ratio));
  } else {
    const minRatio = MIN_TILE_HEIGHT / Math.max(leaf.height, MIN_TILE_HEIGHT * 2);
    const maxRatio = 1 - minRatio;
    ratio = Math.min(maxRatio, Math.max(minRatio, ratio));
  }

  const first = {
    type: "leaf",
    panelId: leaf.panelId,
    x: leaf.x,
    y: leaf.y,
    width: leaf.width,
    height: leaf.height,
  };
  const second = {
    type: "leaf",
    panelId: newPanelId,
    x: leaf.x,
    y: leaf.y,
    width: leaf.width,
    height: leaf.height,
  };

  if (horizontal) {
    const firstWidth = leaf.width * ratio;
    first.width = firstWidth;
    second.x = leaf.x + firstWidth;
    second.width = leaf.width - firstWidth;
  } else {
    const firstHeight = leaf.height * ratio;
    first.height = firstHeight;
    second.y = leaf.y + firstHeight;
    second.height = leaf.height - firstHeight;
  }

  return {
    type: "split",
    direction: horizontal ? "horizontal" : "vertical",
    left: first,
    right: second,
    x: leaf.x,
    y: leaf.y,
    width: leaf.width,
    height: leaf.height,
  };
}

function replaceNode(root, target, replacement) {
  if (root === target) return replacement;
  if (root.type !== "split") return root;
  return {
    ...root,
    left: replaceNode(root.left, target, replacement),
    right: replaceNode(root.right, target, replacement),
  };
}

function buildTree(panelIds, region, preferredById) {
  if (!panelIds.length) return null;

  let root = {
    type: "leaf",
    panelId: panelIds[0],
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  };

  for (let i = 1; i < panelIds.length; i += 1) {
    const largest = findLargestLeaf(root);
    const split = splitLeaf(largest, panelIds[i], preferredById);
    root = replaceNode(root, largest, split);
  }

  return root;
}

function layoutTree(node, rect, gap, preferredById) {
  if (!node) return [];

  if (node.type === "leaf") {
    return [
      {
        panelId: node.panelId,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    ];
  }

  const leftArea = subtreePreferredArea(node.left, preferredById);
  const rightArea = subtreePreferredArea(node.right, preferredById);
  const total = leftArea + rightArea;
  let ratio = leftArea / total;

  if (node.direction === "horizontal") {
    const available = Math.max(0, rect.width - gap);
    const minRatio = MIN_TILE_WIDTH / Math.max(available, MIN_TILE_WIDTH * 2);
    ratio = Math.min(1 - minRatio, Math.max(minRatio, ratio));
    const leftWidth = available * ratio;
    const rightWidth = available - leftWidth;
    return [
      ...layoutTree(
        node.left,
        { x: rect.x, y: rect.y, width: leftWidth, height: rect.height },
        gap,
        preferredById
      ),
      ...layoutTree(
        node.right,
        {
          x: rect.x + leftWidth + gap,
          y: rect.y,
          width: rightWidth,
          height: rect.height,
        },
        gap,
        preferredById
      ),
    ];
  }

  const available = Math.max(0, rect.height - gap);
  const minRatio = MIN_TILE_HEIGHT / Math.max(available, MIN_TILE_HEIGHT * 2);
  ratio = Math.min(1 - minRatio, Math.max(minRatio, ratio));
  const topHeight = available * ratio;
  const bottomHeight = available - topHeight;
  return [
    ...layoutTree(
      node.left,
      { x: rect.x, y: rect.y, width: rect.width, height: topHeight },
      gap,
      preferredById
    ),
    ...layoutTree(
      node.right,
      {
        x: rect.x,
        y: rect.y + topHeight + gap,
        width: rect.width,
        height: bottomHeight,
      },
      gap,
      preferredById
    ),
  ];
}

/**
 * Compute the right-side tile region relative to the viewport.
 */
export function computeTileRegion(viewportWidth, viewportHeight, {
  leftFraction = 0.38,
  marginX = 0.04,
  marginY = 0.05,
} = {}) {
  const mx = viewportWidth * marginX;
  const my = viewportHeight * marginY;
  const leftBound = viewportWidth * leftFraction;
  const x = leftBound + mx * 0.25;
  const y = my;
  const width = Math.max(MIN_TILE_WIDTH, viewportWidth - x - mx);
  const height = Math.max(MIN_TILE_HEIGHT, viewportHeight - my * 2);
  return { x, y, width, height };
}

/**
 * Place a single panel in the right region, sized to its preferred dimensions
 * (width may grow slightly for readability; height stays content-driven).
 */
function layoutSingle(panel, region) {
  const prefW = Number(panel?.preferred?.width) || DEFAULT_PREFERRED.response.width;
  const prefH = Number(panel?.preferred?.height) || DEFAULT_PREFERRED.response.height;
  const width = Math.min(
    region.width,
    Math.max(MIN_TILE_WIDTH, Math.max(prefW, Math.min(region.width * 0.82, prefW * 1.1)))
  );
  const height = Math.min(region.height, Math.max(MIN_TILE_HEIGHT, prefH));
  return [
    {
      panelId: panel.id,
      x: region.x + (region.width - width) / 2,
      y: region.y + (region.height - height) / 2,
      width,
      height,
    },
  ];
}

/**
 * @param {Array<{ id: string, preferred?: { width: number, height: number } }>} panels
 * @param {{ x: number, y: number, width: number, height: number }} region
 * @param {{ gap?: number }} [options]
 * @returns {Array<{ panelId: string, x: number, y: number, width: number, height: number }>}
 */
export function computeTileRects(panels, region, { gap = TILE_GAP } = {}) {
  if (!panels?.length || !region) return [];

  if (panels.length === 1) {
    return layoutSingle(panels[0], region);
  }

  const preferredById = new Map(
    panels.map((panel) => [panel.id, preferredArea(panel)])
  );
  const panelIds = panels.map((panel) => panel.id);
  const tree = buildTree(panelIds, region, preferredById);
  return layoutTree(tree, region, gap, preferredById);
}
