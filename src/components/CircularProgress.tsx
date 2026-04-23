import type { Component } from 'solid-js';
import { createEffect, onCleanup } from 'solid-js';

interface Props {
  endTime: Date | null;
  size?: number;
  strokeWidth?: number;
  color?: string;
  class?: string;
}

/**
 * A donut-shaped progress bar that fills up until a specific endTime.
 * Uses Web Animations API for smooth performance.
 */
const CircularProgress: Component<Props> = (props) => {
  let circleRef: SVGCircleElement | undefined;
  let animation: Animation | undefined;

  const radius = 0.85; // Slightly smaller to prevent clipping with stroke-width
  const circumference = 2 * Math.PI * radius;

  const animateProgress = (ms: number) => {
    if (!circleRef) return;
    if (animation) animation.cancel();

    animation = circleRef.animate(
      [{ strokeDashoffset: circumference }, { strokeDashoffset: 0 }],
      {
        duration: ms,
        easing: 'linear',
        fill: 'forwards',
      },
    );
  };

  const resetProgress = () => {
    if (animation) animation.cancel();
    animation = undefined;
    if (circleRef) {
      circleRef.style.strokeDashoffset = `${circumference}`;
    }
  };

  createEffect(() => {
    const end = props.endTime;
    if (end) {
      const msLeft = end.getTime() - Date.now();
      if (msLeft > 0) {
        animateProgress(msLeft);
      } else {
        if (circleRef) circleRef.style.strokeDashoffset = '0';
      }
    } else {
      resetProgress();
    }
  });

  onCleanup(() => {
    if (animation) animation.cancel();
  });

  return (
    <svg
      class={`circular-progress-svg ${props.class || ''}`}
      viewBox="0 0 2 2"
      width={props.size || 24}
      height={props.size || 24}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="1"
        cy="1"
        r={radius}
        fill="none"
        stroke="currentColor"
        stroke-width={props.strokeWidth || 0.25}
        class="circular-progress-bg"
      />
      <circle
        ref={circleRef}
        cx="1"
        cy="1"
        r={radius}
        fill="none"
        stroke={props.color || 'currentColor'}
        stroke-width={props.strokeWidth || 0.25}
        stroke-linecap="round"
        stroke-dasharray={`${circumference}`}
        stroke-dashoffset={circumference}
        class="circular-progress-bar"
      />
    </svg>
  );
};

export default CircularProgress;
