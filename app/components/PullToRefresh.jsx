'use client';

import { useRef, useEffect, useCallback } from 'react';

const DIRECTION = { UP: -1, DOWN: 1 };

function isOverflowScrollable(element) {
  const overflowType = getComputedStyle(element).overflowY;
  if (element === document.scrollingElement && overflowType === 'visible') return true;
  if (overflowType !== 'scroll' && overflowType !== 'auto') return false;
  return true;
}

function isScrollable(element, direction) {
  if (!isOverflowScrollable(element)) return false;
  if (direction === DIRECTION.DOWN) {
    return element.scrollTop + element.clientHeight < element.scrollHeight;
  }
  if (direction === DIRECTION.UP) {
    return element.scrollTop > 0;
  }
  return false;
}

function isTreeScrollable(element, direction) {
  if (isScrollable(element, direction)) return true;
  if (element.parentElement == null) return false;
  return isTreeScrollable(element.parentElement, direction);
}

/**
 * 自定义下拉刷新组件
 *
 * 与 react-simple-pull-to-refresh 的区别：
 * - 弹性溢出：超过阈值后仍可继续下拉，但幅度逐步缩小（橡皮筋效果）
 * - 拖拽过程零延迟：拖拽中禁用 CSS transition，内容 1:1 跟随手指
 * - GPU 加速：使用 translate3d 触发合成层
 *
 * 弹性公式：
 *   阈值前：offset = rawDelta / resistance（线性）
 *   阈值后：offset = threshold + dampingFactor × (1 − 1/(1 + excess/dampingFactor))
 *   渐近线为 threshold + dampingFactor，即最多额外下拉 dampingFactor 像素
 */
export default function PullToRefresh({
  children,
  onRefresh,
  isPullable = true,
  pullDownThreshold = 67,
  resistance = 1,
  pullingContent,
  refreshingContent,
  className = ''
}) {
  const containerRef = useRef(null);
  const childrenRef = useRef(null);
  const pullDownRef = useRef(null);

  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const directionLockedRef = useRef(false); // 是否已确定手势方向
  const isHorizontalRef = useRef(false); // 已锁定为横向手势
  const thresholdBreachedRef = useRef(false);
  const isRefreshingRef = useRef(false);

  // 将回调和配置存入 ref，避免频繁重绑事件监听器
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const thresholdRef = useRef(pullDownThreshold);
  useEffect(() => {
    thresholdRef.current = pullDownThreshold;
  }, [pullDownThreshold]);

  const resistanceRef = useRef(resistance);
  useEffect(() => {
    resistanceRef.current = resistance;
  }, [resistance]);

  /**
   * 弹性偏移计算
   * @param {number} rawDelta - 手指原始位移（px）
   * @returns {number} 内容实际位移（px）
   */
  const computeOffset = useCallback((rawDelta) => {
    const threshold = thresholdRef.current;
    const res = resistanceRef.current;
    const linear = rawDelta / res;
    if (linear <= 0) return 0;
    if (linear <= threshold) return linear;

    // 超过阈值：渐进阻尼（橡皮筋效果）
    // damped = dampingFactor × (excess / (dampingFactor + excess))
    // 当 excess → ∞ 时 damped → dampingFactor（渐近线）
    const excess = linear - threshold;
    const dampingFactor = 50;
    const damped = (dampingFactor * excess) / (dampingFactor + excess);
    return threshold + damped;
  }, []);

  /** 直接操作 DOM，避免 setState 导致的 re-render 延迟 */
  const applyTransform = useCallback((offset) => {
    const threshold = thresholdRef.current;
    if (childrenRef.current) {
      childrenRef.current.style.transform = offset > 0 ? `translate3d(0, ${offset}px, 0)` : '';
    }
    if (pullDownRef.current) {
      pullDownRef.current.style.opacity = Math.min(offset / threshold, 1).toString();
      pullDownRef.current.style.visibility = offset > 0 ? 'visible' : 'hidden';
    }
  }, []);

  /** 复位所有状态和样式 */
  const reset = useCallback(() => {
    requestAnimationFrame(() => {
      if (childrenRef.current) {
        childrenRef.current.style.transform = '';
      }
      if (pullDownRef.current) {
        pullDownRef.current.style.opacity = '0';
        pullDownRef.current.style.visibility = 'hidden';
      }
      if (containerRef.current) {
        containerRef.current.classList.remove('ptr--dragging', 'ptr--pull-down-treshold-breached', 'ptr--refreshing');
      }
      thresholdBreachedRef.current = false;
      isRefreshingRef.current = false;
    });
  }, []);

  const onTouchStart = useCallback(
    (e) => {
      if (isRefreshingRef.current || !isPullable) return;

      isDraggingRef.current = false;
      directionLockedRef.current = false;
      isHorizontalRef.current = false;

      // 内部可滚动元素仍可向上滚动时不拦截
      if (isTreeScrollable(e.target, DIRECTION.UP)) return;

      // 页面不在顶部时不拦截
      if (window.scrollY > 0) return;

      startYRef.current = e.touches[0].pageY;
      startXRef.current = e.touches[0].pageX;
      isDraggingRef.current = true;
    },
    [isPullable]
  );

  const onTouchMove = useCallback(
    (e) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.touches[0].pageX - startXRef.current;
      const deltaY = e.touches[0].pageY - startYRef.current;

      // 方向锁定：首次移动时判断手势方向
      if (!directionLockedRef.current) {
        if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return; // 位移太小，等待
        directionLockedRef.current = true;
        isHorizontalRef.current = Math.abs(deltaX) > Math.abs(deltaY);
      }

      // 横向手势：放行，不触发下拉刷新
      if (isHorizontalRef.current) {
        isDraggingRef.current = false;
        thresholdBreachedRef.current = false;
        if (containerRef.current) {
          containerRef.current.classList.remove('ptr--dragging', 'ptr--pull-down-treshold-breached');
        }
        applyTransform(0);
        return;
      }

      const rawDelta = deltaY;

      // 向上滑动，取消拖拽并回弹
      if (rawDelta <= 0) {
        isDraggingRef.current = false;
        thresholdBreachedRef.current = false;
        if (containerRef.current) {
          containerRef.current.classList.remove('ptr--dragging', 'ptr--pull-down-treshold-breached');
        }
        applyTransform(0);
        return;
      }

      if (e.cancelable) e.preventDefault();

      const threshold = thresholdRef.current;
      const offset = computeOffset(rawDelta);

      // 更新阈值状态和 CSS 类
      const wasBreached = thresholdBreachedRef.current;
      const isBreached = offset >= threshold;

      if (isBreached !== wasBreached) {
        thresholdBreachedRef.current = isBreached;
        if (containerRef.current) {
          if (isBreached) {
            containerRef.current.classList.remove('ptr--dragging');
            containerRef.current.classList.add('ptr--pull-down-treshold-breached');
          } else {
            containerRef.current.classList.remove('ptr--pull-down-treshold-breached');
            containerRef.current.classList.add('ptr--dragging');
          }
        }
      } else if (!isBreached && containerRef.current && !containerRef.current.classList.contains('ptr--dragging')) {
        containerRef.current.classList.add('ptr--dragging');
      }

      applyTransform(offset);
    },
    [computeOffset, applyTransform]
  );

  const onEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    startYRef.current = 0;

    const threshold = thresholdRef.current;

    if (!thresholdBreachedRef.current) {
      // 未达阈值，回弹
      if (containerRef.current) {
        containerRef.current.classList.remove('ptr--dragging', 'ptr--pull-down-treshold-breached');
      }
      applyTransform(0);
      return;
    }

    // 达到阈值，保持位置并触发刷新
    isRefreshingRef.current = true;
    if (containerRef.current) {
      containerRef.current.classList.remove('ptr--pull-down-treshold-breached');
      containerRef.current.classList.add('ptr--refreshing');
    }
    applyTransform(threshold);

    Promise.resolve(onRefreshRef.current?.()).then(reset).catch(reset);
  }, [applyTransform, reset]);

  const onTouchCancel = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    thresholdBreachedRef.current = false;
    if (containerRef.current) {
      containerRef.current.classList.remove('ptr--dragging', 'ptr--pull-down-treshold-breached');
    }
    applyTransform(0);
  }, [applyTransform]);

  useEffect(() => {
    if (!isPullable || !childrenRef.current) return;

    const el = childrenRef.current;
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onTouchCancel);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [isPullable, onTouchStart, onTouchMove, onEnd, onTouchCancel]);

  return (
    <div className={`ptr ${className}`} ref={containerRef}>
      <div className="ptr__pull-down" ref={pullDownRef}>
        <div className="ptr__loader ptr__pull-down--loading">{refreshingContent}</div>
        <div className="ptr__pull-down--pull-more">{pullingContent}</div>
      </div>
      <div className="ptr__children" ref={childrenRef}>
        {children}
      </div>
    </div>
  );
}
