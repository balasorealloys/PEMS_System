export const easing = {
  smooth: "cubic-bezier(0.4,0,0.2,1)",
  spring: "cubic-bezier(0.34,1.56,0.64,1)",
  bounce: "cubic-bezier(0.68,-0.55,0.265,1.55)",
} as const;

export const duration = { fast: "150ms", normal: "250ms", slow: "400ms", spring: "500ms" } as const;

// keyframe class names (defined in animations.css) that components can apply.
export const anim = {
  fadeIn: "anim-fade-in",
  fadeInUp: "anim-fade-in-up",
  scaleIn: "anim-scale-in",
  countUp: "anim-count-up",
  slideUp: "anim-slide-up",
  shimmer: "anim-shimmer",
  float: "anim-float",
  pulse: "anim-pulse-subtle",
} as const;
