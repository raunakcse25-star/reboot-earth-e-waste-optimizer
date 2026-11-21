import React from 'react';
import { motion } from 'motion/react';

export interface AnimatedContentProps {
  children: React.ReactNode;
  distance?: number;
  direction?: 'vertical' | 'horizontal';
  reverse?: boolean;
  duration?: number;
  ease?: string | [number, number, number, number];
  initialOpacity?: number;
  animateOpacity?: boolean;
  scale?: number;
  blur?: number;
  stagger?: number;
  threshold?: number;
  delay?: number;
  className?: string;
}

function resolveEase(ease?: string | [number, number, number, number]): [number, number, number, number] {
  if (Array.isArray(ease) && ease.length === 4) return ease;
  switch (ease) {
    case 'power1.out':
      return [0.25, 0.46, 0.45, 0.94];
    case 'power2.out':
      return [0.215, 0.61, 0.355, 1];
    case 'power3.out':
      return [0.165, 0.84, 0.44, 1];
    case 'power4.out':
      return [0.16, 1, 0.3, 1];
    case 'expo.out':
      return [0.19, 1, 0.22, 1];
    case 'back.out':
      return [0.34, 1.56, 0.64, 1];
    default:
      return [0.165, 0.84, 0.44, 1];
  }
}

export const AnimatedContent: React.FC<AnimatedContentProps> = ({
  children,
  distance = 100,
  direction = 'vertical',
  reverse = false,
  duration = 0.8,
  ease = 'power3.out',
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  blur = 0,
  stagger = 0.08,
  threshold = 0.1,
  delay = 0,
  className = '',
}) => {
  const offset = reverse ? -distance : distance;
  const xOffset = direction === 'horizontal' ? offset : 0;
  const yOffset = direction === 'vertical' ? offset : 0;
  const cubicEase = resolveEase(ease);
  const childArray = React.Children.toArray(children);

  return (
    <div className={className}>
      {childArray.map((child, index) => (
        <motion.div
          key={index}
          initial={{
            opacity: animateOpacity ? initialOpacity : 1,
            x: xOffset,
            y: yOffset,
            scale,
            filter: blur > 0 ? `blur(${blur}px)` : 'blur(0px)',
          }}
          whileInView={{
            opacity: 1,
            x: 0,
            y: 0,
            scale: 1,
            filter: 'blur(0px)',
          }}
          viewport={{ once: true, amount: Math.max(0, Math.min(1, threshold)) }}
          transition={{
            duration,
            delay: delay + index * stagger,
            ease: cubicEase,
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
};

export default AnimatedContent;
