import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

export interface AnimatedListItem {
  title: string;
  description?: string;
  meta?: string;
}

export interface AnimatedListProps {
  items: AnimatedListItem[];
  onItemSelect?: (item: AnimatedListItem, index: number) => void;
  animation?: 'pop' | 'slide' | 'fade';
  theme?: 'dark' | 'light';
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  className?: string;
  maxHeightClass?: string;
}

export const AnimatedList: React.FC<AnimatedListProps> = ({
  items,
  onItemSelect,
  animation = 'pop',
  theme = 'dark',
  showGradients = true,
  enableArrowNavigation = true,
  className = '',
  maxHeightClass = 'max-h-[340px]',
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [topGradOpacity, setTopGradOpacity] = useState(0);
  const [bottomGradOpacity, setBottomGradOpacity] = useState(1);

  const isDark = theme === 'dark';

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setTopGradOpacity(Math.min(el.scrollTop / 40, 1));
    const bottomDist = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setBottomGradOpacity(el.scrollHeight <= el.clientHeight ? 0 : Math.min(bottomDist / 40, 1));
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    setBottomGradOpacity(el.scrollHeight > el.clientHeight ? 1 : 0);
  }, [items]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!enableArrowNavigation || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < items.length) {
      e.preventDefault();
      onItemSelect?.(items[selectedIndex], selectedIndex);
    }
  };

  const getInitial = () => {
    if (animation === 'slide') return { opacity: 0, x: -16 };
    if (animation === 'fade') return { opacity: 0 };
    return { opacity: 0, scale: 0.92, y: 10 };
  };

  const getAnimate = () => {
    if (animation === 'slide') return { opacity: 1, x: 0 };
    if (animation === 'fade') return { opacity: 1 };
    return { opacity: 1, scale: 1, y: 0 };
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`relative rounded-2xl border outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        isDark
          ? 'bg-[#071A2E] border-sky-900/70 text-sky-50'
          : 'bg-white border-slate-200 text-slate-900'
      } ${className}`}
    >
      <div
        ref={listRef}
        onScroll={handleScroll}
        className={`overflow-y-auto p-3 space-y-2 ${maxHeightClass}`}
      >
        {items.map((item, index) => {
          const isSelected = selectedIndex === index;
          return (
            <motion.button
              key={`${item.title}-${index}`}
              type="button"
              initial={getInitial()}
              whileInView={getAnimate()}
              viewport={{ once: true, amount: 0.25 }}
              transition={{
                type: animation === 'pop' ? 'spring' : 'tween',
                stiffness: 380,
                damping: 26,
                delay: Math.min(index * 0.045, 0.25),
              }}
              whileHover={{ scale: animation === 'pop' ? 1.015 : 1.005 }}
              whileTap={{ scale: 0.985 }}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => {
                setSelectedIndex(index);
                onItemSelect?.(item, index);
              }}
              className={`w-full text-left px-4 py-3.5 rounded-xl border transition-colors flex items-center justify-between gap-4 ${
                isDark
                  ? isSelected
                    ? 'bg-sky-900/45 border-sky-500/70 text-sky-50'
                    : 'bg-[#0B223B] border-sky-900/50 text-sky-100 hover:border-sky-700'
                  : isSelected
                  ? 'bg-sky-50 border-sky-400 text-slate-900'
                  : 'bg-slate-50/70 border-slate-200 text-slate-800 hover:border-sky-300'
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{item.title}</p>
                {item.description && (
                  <p
                    className={`text-xs truncate mt-0.5 ${
                      isDark ? 'text-sky-200/70' : 'text-slate-500'
                    }`}
                  >
                    {item.description}
                  </p>
                )}
              </div>
              {item.meta && (
                <span
                  className={`text-xs font-mono tabular-nums shrink-0 ${
                    isDark ? 'text-sky-300/80' : 'text-sky-700'
                  }`}
                >
                  {item.meta}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {showGradients && (
        <>
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute top-0 left-0 right-0 h-8 rounded-t-2xl transition-opacity duration-200 ${
              isDark
                ? 'bg-gradient-to-b from-[#071A2E] to-transparent'
                : 'bg-gradient-to-b from-white to-transparent'
            }`}
            style={{ opacity: topGradOpacity }}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-0 left-0 right-0 h-8 rounded-b-2xl transition-opacity duration-200 ${
              isDark
                ? 'bg-gradient-to-t from-[#071A2E] to-transparent'
                : 'bg-gradient-to-t from-white to-transparent'
            }`}
            style={{ opacity: bottomGradOpacity }}
          />
        </>
      )}
    </div>
  );
};

export default AnimatedList;
