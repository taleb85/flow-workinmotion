import { useState, useRef, useEffect } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";

export type ToggleSize = "xs" | "sm" | "md" | "lg";
export type ToggleColorTheme = "default" | "success" | "warning" | "danger" | "purple" | "cyan";

const sizeConfig = {
  xs: { trackWidth: 36, trackHeight: 20, knobWidth: 16, knobHeight: 16, knobMargin: 1, indicatorWidth: 2, indicatorHeight: 6, indicatorOffset: 7, circleSize: 5 },
  sm: { trackWidth: 40, trackHeight: 22, knobWidth: 22, knobHeight: 18, knobMargin: 2, indicatorWidth: 2, indicatorHeight: 6, indicatorOffset: 8, circleSize: 5 },
  md: { trackWidth: 60, trackHeight: 33, knobWidth: 35, knobHeight: 24, knobMargin: 2.5, indicatorWidth: 2, indicatorHeight: 10, indicatorOffset: 12, circleSize: 8 },
  lg: { trackWidth: 80, trackHeight: 36, knobWidth: 47, knobHeight: 30, knobMargin: 3, indicatorWidth: 2, indicatorHeight: 13, indicatorOffset: 15.5, circleSize: 10.5 },
};

const colorThemes = {
  default: {
    light: { active: "#26BF4D", inactive: "hsl(0, 0%, 90%)" },
    dark: { active: "#26BF4D", inactive: "hsl(0, 0%, 25%)" },
  },
  success: {
    light: { active: "hsl(142, 76%, 36%)", inactive: "hsl(0, 0%, 90%)" },
    dark: { active: "hsl(142, 76%, 30%)", inactive: "hsl(0, 0%, 25%)" },
  },
  warning: {
    light: { active: "hsl(38, 92%, 50%)", inactive: "hsl(0, 0%, 90%)" },
    dark: { active: "hsl(38, 92%, 45%)", inactive: "hsl(0, 0%, 25%)" },
  },
  danger: {
    light: { active: "hsl(0, 84%, 60%)", inactive: "hsl(0, 0%, 90%)" },
    dark: { active: "hsl(0, 84%, 50%)", inactive: "hsl(0, 0%, 25%)" },
  },
  purple: {
    light: { active: "hsl(271, 91%, 65%)", inactive: "hsl(0, 0%, 90%)" },
    dark: { active: "hsl(271, 91%, 55%)", inactive: "hsl(0, 0%, 25%)" },
  },
  cyan: {
    light: { active: "hsl(187, 85%, 53%)", inactive: "hsl(0, 0%, 90%)" },
    dark: { active: "hsl(187, 85%, 43%)", inactive: "hsl(0, 0%, 25%)" },
  },
};

// Velocity threshold for drag-to-toggle (Settings.app behavior)
const VELOCITY_THRESHOLD = 200;

export interface ToggleSwitchProps {
  className?: string;
  isActive?: boolean;
  onChange?: (isActive: boolean) => void;
  darkMode?: boolean;
  glassEffect?: boolean;
  size?: ToggleSize;
  colorTheme?: ToggleColorTheme;
  disabled?: boolean;
  /** Forma del binario: `pill` (default, a pillola) o `rect` (rettangolo stondato). */
  shape?: "pill" | "rect";
}

export default function ToggleSwitch({
  className = "",
  isActive: initialIsActive = false,
  onChange = () => {},
  darkMode = false,
  glassEffect = true,
  size = "md",
  colorTheme = "default",
  disabled = false,
  shape = "pill",
}: ToggleSwitchProps) {
  const [isActive, setIsActive] = useState(initialIsActive);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [showSweep, setShowSweep] = useState(false);
  const [sweepDirection, setSweepDirection] = useState<"left" | "right">("right");
  const trackRef = useRef<HTMLDivElement | null>(null);
  const velocityRef = useRef(0);

  const shouldReduceMotion = useReducedMotion();

  const { trackWidth, trackHeight, knobWidth, knobMargin, indicatorWidth, indicatorHeight, indicatorOffset, circleSize } = sizeConfig[size];

  /** Con `shape="rect"` binario e knob diventano rettangoli stondati (6px). */
  const shapeClass = shape === "rect" ? "rounded-[6px]" : "rounded-full";

  const calculateTravel = () => {
    return trackWidth - knobWidth - knobMargin * 2;
  };

  const motionX = useMotionValue(initialIsActive ? calculateTravel() : 0);

  // iOS 26-style spring: fast, low overshoot
  const springConfig = shouldReduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 750, damping: 38, mass: 0.6 };

  const springX = useSpring(motionX, springConfig);

  useEffect(() => {
    setIsActive(initialIsActive);
    const newX = initialIsActive ? calculateTravel() : 0;
    motionX.set(newX);
  }, [initialIsActive]);

  function getBackgroundColor() {
    const theme = colorThemes[colorTheme];
    const mode = darkMode ? theme.dark : theme.light;
    return isActive ? mode.active : mode.inactive;
  }

  function triggerSweep(direction: "left" | "right") {
    if (shouldReduceMotion) return;
    setSweepDirection(direction);
    setShowSweep(true);
    setTimeout(() => setShowSweep(false), 150);
  }

  // Pointer events for touch + mouse
  function handlePointerDown(e: ReactPointerEvent) {
    setIsPressed(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerUp() {
    setIsPressed(false);
  }

  function handlePointerCancel() {
    setIsPressed(false);
  }

  function handleComponentClick() {
    if (isDragging) return;

    const newState = !isActive;
    setIsActive(newState);

    const newX = newState ? calculateTravel() : 0;
    motionX.set(newX);

    // Trigger micro-sweep
    triggerSweep(newState ? "right" : "left");

    onChange(newState);
  }

  function handleDragStart() {
    setIsDragging(true);
    velocityRef.current = 0;
  }

  function handleDrag(_event: any, info: any) {
    const maxTravel = calculateTravel();
    const currentX = motionX.get() + info.delta.x;
    const clampedX = Math.max(0, Math.min(currentX, maxTravel));
    motionX.set(clampedX);
    velocityRef.current = info.velocity.x;
  }

  function handleDragEnd() {
    const maxTravel = calculateTravel();
    const currentX = motionX.get();
    const velocity = velocityRef.current;

    // Velocity-based toggle (true Settings.app behavior)
    let newState: boolean;
    if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
      // Fast swipe - toggle based on velocity direction
      newState = velocity > 0;
    } else {
      // Slow drag - toggle based on position
      newState = currentX > maxTravel / 2;
    }

    if (newState !== isActive) {
      triggerSweep(newState ? "right" : "left");
    }

    setIsActive(newState);
    const finalX = newState ? maxTravel : 0;
    motionX.set(finalX);
    onChange(newState);

    setTimeout(() => setIsDragging(false), 10);
  }

  const trackStyle = {
    width: `${trackWidth}px`,
    height: `${trackHeight}px`,
  };

  // UIKit-style press transition (fast, no bounce)
  const pressTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.1, ease: [0.25, 0.1, 0.25, 1] as const };

  return (
    <div
      className={`${className} relative cursor-pointer touch-none overflow-visible ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      onClick={handleComponentClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerUp}
      data-name={isActive ? "Toggle-On" : "Toggle-Off"}
    >
      {/* Track */}
      <motion.div
        ref={trackRef}
        className={`relative z-0 h-full w-full ${shapeClass}`}
        style={trackStyle}
        animate={{
          backgroundColor: getBackgroundColor(),
          boxShadow: isPressed ? "0 0 0 2px rgba(0,0,0,0.08)" : "0 0 0 0px rgba(0,0,0,0)",
        }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
        data-name="Track"
      >
        {/* Track inner highlight for glass effect */}
        {glassEffect && (
          <div
            className={`absolute inset-0 ${shapeClass} pointer-events-none`}
            style={{
              boxShadow: "inset 0 1px 2px rgba(255,255,255,0.15)",
            }}
          />
        )}

        {/* ON indicator: vertical line | on left */}
        <motion.div
          className="absolute pointer-events-none flex items-center justify-center"
          style={{
            left: `${indicatorOffset}px`,
            top: "50%",
            transform: "translateY(-50%)",
            width: `${indicatorWidth}px`,
            height: `${indicatorHeight}px`,
          }}
          animate={{
            opacity: isActive ? 1 : 0,
          }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="w-full h-full"
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "100px",
            }}
          />
        </motion.div>

        {/* OFF indicator: circle ○ on right */}
        <motion.div
          className="absolute pointer-events-none flex items-center justify-center"
          style={{
            right: `${indicatorOffset}px`,
            top: "50%",
            transform: "translateY(-50%)",
            width: `${circleSize}px`,
            height: `${circleSize}px`,
          }}
          animate={{
            opacity: isActive ? 0 : 0.5,
          }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="rounded-full"
            style={{
              width: `${circleSize}px`,
              height: `${circleSize}px`,
              border: `${Math.max(1.5, circleSize * 0.15)}px solid`,
              borderColor: darkMode ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)",
            }}
          />
        </motion.div>

        {/* Micro-highlight sweep */}
        {showSweep && !shouldReduceMotion && (
          <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{
              height: "2px",
              top: "50%",
              marginTop: "-1px",
              background: "rgba(255,255,255,0.5)",
            }}
            initial={{
              width: "0%",
              left: sweepDirection === "right" ? "10%" : "90%",
              opacity: 0,
            }}
            animate={{
              width: "80%",
              left: sweepDirection === "right" ? "10%" : "10%",
              opacity: [0, 0.7, 0],
            }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          />
        )}
      </motion.div>

      {/* Knob */}
      <motion.div
        className={`absolute ${shapeClass} z-[5] cursor-grab active:cursor-grabbing`}
        drag="x"
        dragConstraints={{ left: 0, right: calculateTravel() }}
        dragElastic={0}
        dragMomentum={false}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{
          x: springX,
          width: `${knobWidth}px`,
          height: `${trackHeight - knobMargin * 2}px`,
          top: `${knobMargin}px`,
          left: `${knobMargin}px`,
          overflow: "visible",
        }}
        animate={{
          scale: isDragging ? 1.25 : 1,
          boxShadow: isDragging
            ? "0 12px 40px -8px rgba(0, 0, 0, 0.35), 0 6px 16px -4px rgba(0, 0, 0, 0.2)"
            : "0 2px 8px rgba(0, 0, 0, 0.1)",
        }}
        transition={pressTransition}
        data-name="Knob"
      >
        {/* Knob base - 3D neumorphic pill shape */}
        <motion.div
          className={`w-full h-full ${shapeClass} relative overflow-hidden`}
          animate={{
            backgroundColor: isDragging ? "rgba(255, 255, 255, 0.08)" : "#FAFAFA",
          }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          style={{
            backdropFilter: isDragging ? "blur(32px) brightness(1.1)" : "blur(0px)",
            WebkitBackdropFilter: isDragging ? "blur(32px) brightness(1.1)" : "blur(0px)",
            boxShadow: isDragging
              ? "0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 0.5px rgba(255, 255, 255, 0.25), inset 0 0 20px rgba(255, 255, 255, 0.12), inset 0 -2px 8px rgba(0, 0, 0, 0.1), inset 0 2px 8px rgba(255, 255, 255, 0.3)"
              : "0 4px 12px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1), inset 0 -4px 8px rgba(0, 0, 0, 0.06)",
          }}
        >
          {/* Top highlight - curved shine for 3D effect */}
          <div
            className="absolute top-0 left-[10%] w-[80%] h-[45%] rounded-t-full pointer-events-none"
            style={{
              background: isDragging
                ? "linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.6) 40%, transparent 100%)",
            }}
          />
          {/* Secondary highlight - subtle edge glow */}
          <div
            className="absolute top-[5%] left-[15%] w-[70%] h-[25%] rounded-full pointer-events-none"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, transparent 100%)",
              filter: "blur(2px)",
            }}
          />
          {/* Bottom shadow for 3D depth */}
          <div
            className="absolute bottom-0 left-0 w-full h-[40%] rounded-b-full pointer-events-none"
            style={{
              background: isDragging
                ? "linear-gradient(to top, rgba(0,0,0,0.15) 0%, transparent 100%)"
                : "linear-gradient(to top, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.04) 50%, transparent 100%)",
            }}
          />
        </motion.div>
        {/* Outer glass rim highlight - thinner and more delicate */}
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          animate={{
            opacity: isDragging ? 1 : 0,
          }}
          transition={{ duration: 0.1 }}
          style={{
            border: "1px solid rgba(255, 255, 255, 0.35)",
            boxShadow: "inset 0 0 12px -2px rgba(255, 255, 255, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.4)",
          }}
        />
      </motion.div>
    </div>
  );
}
