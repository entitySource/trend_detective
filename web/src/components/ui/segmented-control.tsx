// Adapted from Planes (https://useplanes.com/components/segmented-control), source-owned registry component;
// restyled for the Trend Detective HUD (cyan glass pill, smaller type).
import * as React from "react";
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
  useMotionValue,
  useVelocity,
} from "motion/react";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  /**
   * Icon-only inactive tabs. Default: automatic when the control is under
   * 448px wide. Pass `false` inside shrink-to-fit parents (w-fit, auto grid
   * tracks) where the measured width is the content's own.
   */
  compact?: boolean;
}

const PILL_SPRING  = { stiffness: 380, damping: 24, mass: 0.6 } as const;
const WIDTH_SPRING = { stiffness: 400, damping: 28, mass: 0.5 } as const;
const LABEL_SPRING = { type: "spring", stiffness: 400, damping: 28, mass: 0.5 } as const;
const PRESS_SPRING = { stiffness: 600, damping: 22, mass: 0.4 } as const;
const ICON_INACTIVE_TRANSITION = { duration: 0.2, ease: "easeOut" } as const;

export function SegmentedControl({
  options,
  value,
  onChange,
  className,
  id,
  compact: compactProp,
}: SegmentedControlProps) {
  const prefersReducedMotion = useReducedMotion();
  const reactId = React.useId();
  const tablistId = id ?? reactId;
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const activeIndex = Math.max(options.findIndex((o) => o.value === value), 0);

  const rawX = useMotionValue(0);
  const rawW = useMotionValue(0);

  const springX = useSpring(rawX, PILL_SPRING);
  const springW = useSpring(rawW, WIDTH_SPRING);

  const velX = useVelocity(springX);

  const stretch = useTransform(velX, (v) => Math.min(Math.abs(v) * 0.04, 12));

  const pillW = useTransform(
    [springW, stretch],
    ([w, s]: number[]) => w + s
  );
  const pillX = useTransform(
    [springX, stretch],
    ([x, s]: number[]) => Math.max(0, x - s / 2)
  );
  const pillBlur = useTransform(
    velX,
    (v) => `blur(${Math.min(Math.abs(v) * 0.011, 5)}px)`
  );

  // Client-only app, so the user agent can be read once at mount instead of in an effect.
  const [isSafari] = React.useState(() => typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent));

  const [ready, setReady] = React.useState(false);
  const [sepPositions, setSepPositions] = React.useState<number[]>([]);
  const isFirst = React.useRef(true);

  const measure = React.useCallback(() => {
    const btn = buttonRefs.current[activeIndex];
    const container = containerRef.current;
    if (!btn || !container) return;

    const x = btn.offsetLeft;
    const w = btn.offsetWidth;

    if (isFirst.current) {
      rawX.jump(x); rawW.jump(w);
      isFirst.current = false;
    } else {
      rawX.set(x); rawW.set(w);
    }

    const pos: number[] = [];
    for (let i = 0; i < options.length - 1; i++) {
      const b = buttonRefs.current[i];
      if (b) pos.push(b.offsetLeft + b.offsetWidth);
    }
    setSepPositions(pos);
    setReady(true);
  }, [activeIndex, options.length, rawX, rawW]);

  const optionsKey = options.map((o) => `${o.value}:${o.label}`).join("|");

  const [measuredNarrow, setMeasuredNarrow] = React.useState(false);
  const narrow = compactProp ?? measuredNarrow;
  const checkWidth = React.useCallback(() => {
    const el = containerRef.current;
    if (el) setMeasuredNarrow(el.clientWidth < 448);
  }, []);

  // Before first paint, so phones never paint the labelled layout first.
  React.useLayoutEffect(() => { checkWidth(); }, [checkWidth]);

  // Re-measure after labels show/hide as well as on selection. A narrow flip
  // re-arms isFirst so the pill jumps to the new layout instead of springing.
  const prevNarrow = React.useRef(narrow);
  React.useLayoutEffect(() => {
    if (prevNarrow.current !== narrow) {
      prevNarrow.current = narrow;
      isFirst.current = true;
    }
    measure();
  }, [measure, optionsKey, narrow]);

  // Below 28rem of its own width, inactive tabs with icons drop their labels so
  // the row fits (phones, narrow sidebars). Measured, not a container query:
  // inline-size containment would collapse the control inside w-fit parents.
  React.useEffect(() => {
    const ro = new ResizeObserver(() => {
      checkWidth();
      isFirst.current = true;
      measure();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure, checkWidth]);

  const focusByIndex = (i: number) => buttonRefs.current[i]?.focus();
  const selectByIndex = (i: number) => { const o = options[i]; if (o) onChange(o.value); };
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (!options.length) return;
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "Home") { selectByIndex(0); focusByIndex(0); return; }
    if (e.key === "End") { const l = options.length - 1; selectByIndex(l); focusByIndex(l); return; }
    const next = (idx + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    selectByIndex(next); focusByIndex(next);
  };

  if (!options.length) return null;

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        "relative inline-flex w-full items-center select-none",
        "rounded-full p-[3px] gap-0",
        "border border-cyan-400/25 bg-slate-950/50",
        className,
      )}
      style={{ isolation: "isolate" }}
    >
      {ready && !prefersReducedMotion && (
        <motion.span
          aria-hidden
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 0,
            borderRadius: 9999,
            pointerEvents: "none",
            x: pillX,
            width: pillW,
            filter: isSafari ? undefined : pillBlur,
          }}
          className={cn(
            "border border-cyan-300/50 bg-cyan-400/20 shadow-[0_0_12px_rgba(34,211,238,0.35)]",
          )}
        />
      )}

      {ready && prefersReducedMotion && (
        <span
          aria-hidden
          className={cn(
            "absolute rounded-full pointer-events-none",
            "border border-cyan-300/50 bg-cyan-400/20",
          )}
          style={{ top: 3, bottom: 3, left: rawX.get(), width: rawW.get() }}
        />
      )}

      {sepPositions.map((x, i) => {
        const adjacent = i === activeIndex - 1 || i === activeIndex;
        return (
          <motion.span
            key={i}
            aria-hidden
            animate={{ opacity: adjacent ? 0 : 1, scaleY: adjacent ? 0.3 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute top-[20%] bottom-[20%] w-px pointer-events-none origin-center bg-cyan-400/15"
            style={{ left: x }}
          />
        );
      })}

      {options.map((option, index) => (
        <TabButton
          key={option.value}
          ref={(node) => { buttonRefs.current[index] = node; }}
          option={option}
          isActive={index === activeIndex}
          compact={narrow && !!option.icon && index !== activeIndex}
          tablistId={tablistId}
          prefersReducedMotion={!!prefersReducedMotion}
          disableBlur={isSafari}
          onClick={() => onChange(option.value)}
          onKeyDown={(e) => onKeyDown(e, index)}
        />
      ))}
    </div>
  );
}

interface TabButtonProps {
  option: SegmentedControlOption;
  isActive: boolean;
  /** Icon-only: the control is narrow and this inactive tab has an icon. */
  compact: boolean;
  tablistId: string;
  prefersReducedMotion: boolean;
  disableBlur: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

const TabButton = React.forwardRef<HTMLButtonElement, TabButtonProps>(
  ({ option, isActive, compact, tablistId, prefersReducedMotion, disableBlur, onClick, onKeyDown }, ref) => {
    const pressScale = useMotionValue(1);
    const springPressScale = useSpring(pressScale, PRESS_SPRING);

    const onDown   = () => { if (!prefersReducedMotion) pressScale.set(0.93); };
    const onUp     = () => { if (!prefersReducedMotion) pressScale.set(1); };

    return (
      <motion.button
        ref={ref}
        type="button"
        role="tab"
        id={`${tablistId}-${option.value}`}
        aria-selected={isActive}
        aria-label={compact ? option.label : undefined}
        tabIndex={isActive ? 0 : -1}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onPointerCancel={onUp}
        style={{ scale: springPressScale }}
        className={cn(
          "relative z-10 inline-flex min-w-0 flex-1 items-center justify-center gap-2",
          "rounded-full py-2 text-[13px] leading-none",
          // Narrow: icon tabs hug their icon, the active tab takes the rest.
          compact ? "flex-none px-2.5" : "px-2.5",
          "cursor-pointer border-none bg-transparent outline-none",
          "focus-visible:ring-2 focus-visible:ring-cyan-300/70",
        )}
      >
        <motion.span
          animate={{
            opacity: isActive ? 1 : 0.55,
            scale:   isActive ? 1 : 0.975,
          }}
          transition={prefersReducedMotion ? { duration: 0 } : LABEL_SPRING}
          className="inline-flex min-w-0 items-center gap-2"
        >
          {option.icon && (
            <motion.div
              initial={false}
              animate={
                prefersReducedMotion
                  ? { opacity: isActive ? 1 : 0.7, y: 0, scale: 1 }
                  : isActive
                    ? {
                        opacity: [0.86, 1, 1],
                        y: [0, -1.5, 0],
                        scale: [1, 1.035, 1],
                        ...(disableBlur
                          ? {}
                          : { filter: ["blur(1.5px)", "blur(0px)", "blur(0px)"] }),
                      }
                    : { opacity: 0.7, y: 0, scale: 1, ...(disableBlur ? {} : { filter: "blur(0px)" }) }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : isActive
                    ? {
                        y: { duration: 0.36, times: [0, 0.42, 1], ease: "easeOut" },
                        scale: { duration: 0.36, times: [0, 0.42, 1], ease: "easeOut" },
                        opacity: { duration: 0.2, ease: "easeOut" },
                        filter: { duration: 0.22, ease: "easeOut" },
                      }
                    : ICON_INACTIVE_TRANSITION
              }
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center will-change-transform"
            >
              {option.icon}
            </motion.div>
          )}
          <span
            className={cn(
              "truncate transition-[font-weight] duration-0",
              compact && "hidden",
              isActive
                ? "font-semibold text-cyan-50"
                : "font-medium text-slate-300",
            )}
          >
            {option.label}
          </span>
        </motion.span>
      </motion.button>
    );
  }
);
TabButton.displayName = "TabButton";
