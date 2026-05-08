import { useState, useRef, useEffect } from 'react';

/**
 * 追踪 Navbar 和 FilterBar 的动态高度
 * - 监听 resize 事件（rAF 节流），deps 变化时重新测量
 * - 额外提供 marketIndexAccordionHeight 状态供粘性定位计算使用
 *
 * @param {{ groups: any[], currentTab: string, shouldShowMarketIndex: boolean }} deps
 * @returns {{
 *   navbarRef: React.RefObject,
 *   filterBarRef: React.RefObject,
 *   navbarHeight: number,
 *   filterBarHeight: number,
 *   marketIndexAccordionHeight: number,
 *   setMarketIndexAccordionHeight: React.Dispatch<React.SetStateAction<number>>,
 * }}
 */
export function useNavHeights({ groups, currentTab }) {
  const navbarRef = useRef(null);
  const filterBarRef = useRef(null);
  const [navbarHeight, setNavbarHeight] = useState(0);
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const [marketIndexAccordionHeight, setMarketIndexAccordionHeight] = useState(0);

  useEffect(() => {
    let rafId = null;
    const updateHeights = () => {
      if (navbarRef.current) {
        setNavbarHeight(navbarRef.current.offsetHeight);
      }
      if (filterBarRef.current) {
        setFilterBarHeight(filterBarRef.current.offsetHeight);
      }
    };
    // rAF 节流，避免 resize 事件以 60fps 频率触发 setState
    const onResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateHeights();
      });
    };

    // 初始延迟一下，确保渲染完成
    const timer = setTimeout(updateHeights, 100);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [groups, currentTab]); // groups 或 tab 变化可能导致 filterBar 高度变化

  return {
    navbarRef,
    filterBarRef,
    navbarHeight,
    filterBarHeight,
    marketIndexAccordionHeight,
    setMarketIndexAccordionHeight,
  };
}

