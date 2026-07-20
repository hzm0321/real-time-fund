import { isFunction, isNumber, isObject } from 'lodash';

const DEFAULT_GAP = 12;
const DEFAULT_PADDING = 6;
const DEFAULT_ANCHOR_AVOID_RADIUS = 8;

function isFiniteNumber(value) {
  return isNumber(value) && Number.isFinite(value);
}

function normalizeRect(rect) {
  if (!isObject(rect)) return null;

  const left = rect.left;
  const top = rect.top;
  const right = rect.right;
  const bottom = rect.bottom;

  if (!isFiniteNumber(left) || !isFiniteNumber(top) || !isFiniteNumber(right) || !isFiniteNumber(bottom)) {
    return null;
  }

  return {
    left: Math.min(left, right),
    top: Math.min(top, bottom),
    right: Math.max(left, right),
    bottom: Math.max(top, bottom)
  };
}

function rectWidth(rect) {
  return Math.max(0, rect.right - rect.left);
}

function rectHeight(rect) {
  return Math.max(0, rect.bottom - rect.top);
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function rectIntersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function rectContainsPoint(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function intersectionArea(a, b) {
  if (!rectIntersects(a, b)) return 0;
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width * height;
}

function overflowArea(rect, bounds) {
  const horizontalOverflow = Math.max(0, bounds.left - rect.left) + Math.max(0, rect.right - bounds.right);
  const verticalOverflow = Math.max(0, bounds.top - rect.top) + Math.max(0, rect.bottom - bounds.bottom);

  return horizontalOverflow * rectHeight(rect) + verticalOverflow * rectWidth(rect);
}

function makeRect(left, top, width, height) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height
  };
}

function makePointAvoidRect(x, y, radius) {
  return {
    left: x - radius,
    top: y - radius,
    right: x + radius,
    bottom: y + radius
  };
}

function getPlacementSides(placement) {
  return {
    top: placement.includes('top'),
    bottom: placement.includes('bottom'),
    left: placement.includes('left'),
    right: placement.includes('right')
  };
}

function pushRectAwayFromAnchor({ placement, left, top, width, height, anchorRect, bounds, gap }) {
  const initialRect = makeRect(left, top, width, height);
  if (!rectIntersects(initialRect, anchorRect)) {
    return { left, top };
  }

  const sides = getPlacementSides(placement);
  let nextLeft = left;
  let nextTop = top;

  if (sides.top) {
    nextTop = anchorRect.top - height - gap;
  } else if (sides.bottom) {
    nextTop = anchorRect.bottom + gap;
  }

  if (sides.left) {
    nextLeft = anchorRect.left - width - gap;
  } else if (sides.right) {
    nextLeft = anchorRect.right + gap;
  }

  return {
    left: clamp(nextLeft, bounds.left, bounds.right - width),
    top: clamp(nextTop, bounds.top, bounds.bottom - height)
  };
}

function measureChartText(chart, text) {
  const ctx = chart?.ctx;
  if (!isObject(ctx) || !isFunction(ctx.measureText)) return 0;

  if (isFunction(ctx.save)) ctx.save();
  ctx.font = '10px sans-serif';
  const width = ctx.measureText(String(text ?? '')).width;
  if (isFunction(ctx.restore)) ctx.restore();

  return width;
}

export function getChartAxisAvoidRects({ chart, anchorX, anchorY, xLabel, yLabel }) {
  if (!isObject(chart)) return [];

  const chartArea = normalizeRect(chart.chartArea);
  const chartWidth = chart.width;
  const chartHeight = chart.height;

  if (!chartArea || !isFiniteNumber(chartWidth) || !isFiniteNumber(chartHeight)) return [];

  const chartLeft = chart.scales?.x?.left ?? chartArea.left;
  const chartRight = chart.scales?.x?.right ?? chartArea.right;
  const bottomY = chart.scales?.y?.bottom ?? chartArea.bottom;
  const xTextWidth = measureChartText(chart, xLabel) + 8;
  const yTextWidth = measureChartText(chart, yLabel) + 8;
  const xLabelLeft = clamp(anchorX - xTextWidth / 2, chartLeft, chartRight - xTextWidth);

  const rects = [
    {
      left: 0,
      top: bottomY,
      right: chartWidth,
      bottom: chartHeight
    },
    {
      left: 0,
      top: 0,
      right: chartLeft,
      bottom: chartHeight
    }
  ];

  if (xTextWidth > 8) {
    rects.push({
      left: xLabelLeft,
      top: bottomY,
      right: xLabelLeft + xTextWidth,
      bottom: bottomY + 16
    });
  }

  if (yTextWidth > 8) {
    rects.push({
      left: chartLeft,
      top: anchorY - 8,
      right: chartLeft + yTextWidth,
      bottom: anchorY + 8
    });
  }

  return rects;
}

export function getChartTooltipPosition({
  anchorX,
  anchorY,
  tooltipWidth,
  tooltipHeight,
  chartWidth,
  chartHeight,
  chartArea,
  gap = DEFAULT_GAP,
  padding = DEFAULT_PADDING,
  anchorAvoidRadius = DEFAULT_ANCHOR_AVOID_RADIUS,
  avoidRects = []
}) {
  const safeChartArea = normalizeRect(chartArea);
  const chartBounds = normalizeRect({
    left: 0,
    top: 0,
    right: chartWidth,
    bottom: chartHeight
  });

  if (
    !isFiniteNumber(anchorX) ||
    !isFiniteNumber(anchorY) ||
    !isFiniteNumber(tooltipWidth) ||
    !isFiniteNumber(tooltipHeight) ||
    !chartBounds
  ) {
    return null;
  }

  const safeBounds = safeChartArea || chartBounds;
  const minLeft = safeBounds.left + padding;
  const maxLeft = safeBounds.right - tooltipWidth - padding;
  const minTop = safeBounds.top + padding;
  const maxTop = safeBounds.bottom - tooltipHeight - padding;
  const candidateBounds = {
    left: minLeft,
    top: minTop,
    right: maxLeft + tooltipWidth,
    bottom: maxTop + tooltipHeight
  };
  const safeAnchorAvoidRadius = isFiniteNumber(anchorAvoidRadius)
    ? Math.max(0, anchorAvoidRadius)
    : DEFAULT_ANCHOR_AVOID_RADIUS;
  const anchorAvoidRect = makePointAvoidRect(anchorX, anchorY, safeAnchorAvoidRadius);
  const obstacles = avoidRects.map(normalizeRect).filter(Boolean);

  const rawCandidates = [
    {
      placement: 'top',
      left: anchorX - tooltipWidth / 2,
      top: anchorY - tooltipHeight - gap,
      priority: 0
    },
    {
      placement: 'bottom',
      left: anchorX - tooltipWidth / 2,
      top: anchorY + gap,
      priority: 1
    },
    {
      placement: 'right',
      left: anchorX + gap,
      top: anchorY - tooltipHeight / 2,
      priority: 2
    },
    {
      placement: 'left',
      left: anchorX - tooltipWidth - gap,
      top: anchorY - tooltipHeight / 2,
      priority: 3
    },
    {
      placement: 'top-left',
      left: anchorX - tooltipWidth - gap,
      top: anchorY - tooltipHeight - gap,
      priority: 4
    },
    {
      placement: 'top-right',
      left: anchorX + gap,
      top: anchorY - tooltipHeight - gap,
      priority: 5
    },
    {
      placement: 'bottom-left',
      left: anchorX - tooltipWidth - gap,
      top: anchorY + gap,
      priority: 6
    },
    {
      placement: 'bottom-right',
      left: anchorX + gap,
      top: anchorY + gap,
      priority: 7
    }
  ];

  const candidates = rawCandidates.map((candidate) => {
    const clampedLeft = clamp(candidate.left, minLeft, maxLeft);
    const clampedTop = clamp(candidate.top, minTop, maxTop);
    const pushed = pushRectAwayFromAnchor({
      placement: candidate.placement,
      left: clampedLeft,
      top: clampedTop,
      width: tooltipWidth,
      height: tooltipHeight,
      anchorRect: anchorAvoidRect,
      bounds: candidateBounds,
      gap
    });
    const left = clamp(pushed.left, minLeft, maxLeft);
    const top = clamp(pushed.top, minTop, maxTop);
    const rect = makeRect(left, top, tooltipWidth, tooltipHeight);
    const anchorArea = intersectionArea(rect, anchorAvoidRect);
    const coversAnchorPoint = rectContainsPoint(rect, anchorX, anchorY);
    const obstacleArea = obstacles.reduce((sum, obstacle) => sum + intersectionArea(rect, obstacle), 0);
    const safeOverflowArea = overflowArea(rect, safeBounds);
    const chartOverflowArea = overflowArea(rect, chartBounds);
    const anchorDistance =
      Math.abs(anchorX - (rect.left + tooltipWidth / 2)) + Math.abs(anchorY - (rect.top + tooltipHeight / 2));

    return {
      ...candidate,
      left,
      top,
      rect,
      anchorArea,
      coversAnchorPoint,
      score:
        (coversAnchorPoint ? 1000000000 : 0) +
        anchorArea * 1000000 +
        obstacleArea * 10000 +
        safeOverflowArea * 1000 +
        chartOverflowArea * 100000 +
        anchorDistance +
        candidate.priority
    };
  });

  const nonBlockingCandidates = candidates.filter(
    (candidate) => !candidate.coversAnchorPoint && candidate.anchorArea === 0
  );
  const pointClearCandidates = candidates.filter((candidate) => !candidate.coversAnchorPoint);
  const candidatePool = nonBlockingCandidates.length
    ? nonBlockingCandidates
    : pointClearCandidates.length
      ? pointClearCandidates
      : candidates;

  const best = candidatePool.reduce((currentBest, candidate) => {
    if (!currentBest || candidate.score < currentBest.score) return candidate;
    return currentBest;
  }, null);

  if (!best) return null;

  return {
    left: best.left,
    top: best.top,
    placement: best.placement
  };
}
