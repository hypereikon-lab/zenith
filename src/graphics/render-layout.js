export function getRenderLayout(width, height, options) {
  const fullRect = { x: 0, y: 0, width, height };
  const safeLeft = reviewSafeLeft(width, options);
  const reviewRect = { x: safeLeft, y: 0, width: Math.max(1, width - safeLeft), height };
  const aspect = sourceAspect(options);

  if (options.viewMode === "split") {
    const left = { x: reviewRect.x, y: 0, width: Math.floor(reviewRect.width * 0.48), height };
    const right = {
      x: left.x + left.width,
      y: 0,
      width: reviewRect.width - left.width,
      height,
    };
    return {
      fullRect,
      flatRect: containRect(left, aspect, 18 * options.dpr),
      domeRect: right,
      splitX: right.x,
    };
  }

  if (options.viewMode === "flat") {
    return {
      fullRect,
      flatRect: containRect(reviewRect, aspect, 28 * options.dpr),
    };
  }

  return { fullRect, domeRect: fullRect };
}

export function getCssLayout(width, height, options) {
  const fullRect = { x: 0, y: 0, width, height };
  const safeLeft = reviewSafeLeft(width * options.dpr, options) / options.dpr;
  const reviewRect = { x: safeLeft, y: 0, width: Math.max(1, width - safeLeft), height };
  const aspect = sourceAspect(options);

  if (options.viewMode === "split") {
    const left = { x: reviewRect.x, y: 0, width: Math.floor(reviewRect.width * 0.48), height };
    const right = {
      x: left.x + left.width,
      y: 0,
      width: reviewRect.width - left.width,
      height,
    };
    return {
      fullRect,
      flatPane: left,
      domePane: right,
      flatRect: containRect(left, aspect, 18),
      splitX: right.x,
    };
  }

  if (options.viewMode === "flat") {
    return {
      fullRect,
      flatRect: containRect(reviewRect, aspect, 28),
    };
  }

  return { fullRect, domePane: fullRect };
}

export function reviewSafeLeft(width, options) {
  if (options.panelHidden || options.canvasClientWidth < 900) return 0;
  return Math.min(Math.round(410 * options.dpr), Math.floor(width * 0.32));
}

export function containRect(rect, aspect, padding) {
  const availableWidth = Math.max(1, rect.width - padding * 2);
  const availableHeight = Math.max(1, rect.height - padding * 2);
  let width = availableWidth;
  let height = width / aspect;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * aspect;
  }
  return {
    x: rect.x + (rect.width - width) * 0.5,
    y: rect.y + (rect.height - height) * 0.5,
    width,
    height,
  };
}

function sourceAspect(options) {
  return Math.max(0.000001, options.sourceWidth) / Math.max(0.000001, options.sourceHeight);
}
