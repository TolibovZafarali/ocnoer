"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion
} from "framer-motion";
import { ArrowRight } from "lucide-react";

import {
  signInHomePlayerAction,
  type PlayerHomeGateState
} from "@/app/(player)/play/actions";
import { cn } from "@/lib/utils";

const INITIAL_STATE: PlayerHomeGateState = {
  errorCount: 0
};

function getGateTransition(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) {
    return {
      duration: 0.01
    };
  }

  return {
    type: "spring" as const,
    stiffness: 260,
    damping: 28,
    mass: 0.95
  };
}

function ArrowButton(props: {
  expanded: boolean;
  onPress: () => void;
  errorCount: number;
  prefersReducedMotion: boolean;
}) {
  const { pending } = useFormStatus();
  const controls = useAnimationControls();
  const previousErrorCountRef = useRef(props.errorCount);

  useEffect(() => {
    const defaultStyles = {
      backgroundColor: "#ffffff",
      color: "#020617",
      boxShadow: "0 18px 48px -28px rgba(255,255,255,0.85)",
      x: 0,
      rotate: 0
    };

    if (props.errorCount === 0) {
      controls.set(defaultStyles);
      previousErrorCountRef.current = 0;
      return;
    }

    if (props.errorCount === previousErrorCountRef.current) {
      return;
    }

    previousErrorCountRef.current = props.errorCount;

    const errorDuration = props.prefersReducedMotion ? 0.34 : 0.82;
    const colorTimes = [0, 0.1, 0.22, 0.82, 1];
    const shakeTimes = [0, 0.1, 0.2, 0.3, 0.4, 0.52, 0.64, 0.76, 0.88, 0.94, 1];

    void controls.start({
      backgroundColor: ["#ffffff", "#fda4af", "#ef4444", "#ef4444", "#ffffff"],
      color: ["#020617", "#fff1f2", "#fff1f2", "#fff1f2", "#020617"],
      boxShadow: [
        "0 18px 48px -28px rgba(255,255,255,0.85)",
        "0 20px 52px -24px rgba(253,164,175,0.82)",
        "0 22px 56px -24px rgba(239,68,68,0.9)",
        "0 22px 56px -24px rgba(239,68,68,0.9)",
        "0 18px 48px -28px rgba(255,255,255,0.85)"
      ],
      x: props.prefersReducedMotion ? [0, 0] : [0, -10, 10, -9, 9, -7, 7, -5, 5, -2, 0],
      rotate: props.prefersReducedMotion ? [0, 0] : [0, -3, 3, -2.6, 2.6, -2, 2, -1.4, 1.4, -0.6, 0],
      transition: {
        backgroundColor: {
          duration: errorDuration,
          ease: "easeInOut",
          times: colorTimes
        },
        color: {
          duration: errorDuration,
          ease: "easeInOut",
          times: colorTimes
        },
        boxShadow: {
          duration: errorDuration,
          ease: "easeInOut",
          times: colorTimes
        },
        x: {
          duration: errorDuration,
          ease: "linear",
          times: shakeTimes
        },
        rotate: {
          duration: errorDuration,
          ease: "linear",
          times: shakeTimes
        }
      }
    });
  }, [controls, props.errorCount, props.prefersReducedMotion]);

  return (
    <motion.button
      layout
      type="button"
      aria-label={props.expanded ? "Submit password" : "Open password field"}
      initial={{
        backgroundColor: "#ffffff",
        color: "#020617",
        boxShadow: "0 18px 48px -28px rgba(255,255,255,0.85)",
        x: 0,
        rotate: 0
      }}
      animate={controls}
      className={cn(
        "flex h-14 w-14 shrink-0 items-center justify-center rounded-full",
        "bg-white text-slate-950 shadow-[0_18px_48px_-28px_rgba(255,255,255,0.85)]",
        "outline-none transition focus-visible:ring-2 focus-visible:ring-white/40",
        "disabled:cursor-not-allowed disabled:opacity-60"
      )}
      disabled={pending}
      onClick={props.onPress}
      transition={getGateTransition(props.prefersReducedMotion)}
      whileTap={
        props.prefersReducedMotion
          ? undefined
          : {
              scale: 0.97
            }
      }
    >
      <motion.span
        animate={
          props.prefersReducedMotion
            ? undefined
            : {
                x: pending ? 0 : 0.5
              }
        }
        transition={{
          duration: 0.18,
          ease: "easeOut"
        }}
      >
        <ArrowRight className="h-5 w-5" strokeWidth={2.4} />
      </motion.span>
    </motion.button>
  );
}

export function HomePlayerGate() {
  const [state, formAction] = useActionState(signInHomePlayerAction, INITIAL_STATE);
  const [expanded, setExpanded] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;

  useEffect(() => {
    if (state.errorCount > 0) {
      setExpanded(true);
    }
  }, [state.errorCount]);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const focusDelay = prefersReducedMotion ? 0 : 170;
    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus();
    }, focusDelay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [expanded, prefersReducedMotion]);

  const transition = getGateTransition(prefersReducedMotion);

  function handleArrowPress() {
    if (!expanded) {
      setExpanded(true);
      return;
    }

    formRef.current?.requestSubmit();
  }

  return (
    <main className="home-player-gate flex min-h-screen items-center justify-center overflow-hidden px-4 text-slate-100">
      <div aria-hidden className="home-player-gate-glow home-player-gate-glow-one" />
      <div aria-hidden className="home-player-gate-glow home-player-gate-glow-two" />
      <div aria-hidden className="home-player-gate-glow home-player-gate-glow-three" />
      <div aria-hidden className="home-player-gate-grid" />

      <div className="relative z-10 flex w-full flex-col items-center gap-4">
        <form ref={formRef} action={formAction} className="flex w-full justify-center">
          <motion.div
            layout
            initial={false}
            transition={transition}
            className={cn(
              "h-[72px] overflow-hidden rounded-full border border-white/10",
              "bg-black/35 shadow-[0_30px_120px_-48px_rgba(0,0,0,0.95)] backdrop-blur-xl",
              expanded ? "w-[min(26rem,calc(100vw-2rem))]" : "w-[72px]"
            )}
          >
            <motion.div
              layout
              transition={transition}
              className={cn(
                "flex h-full items-center",
                expanded ? "gap-2 pl-5 pr-2" : "justify-center p-2"
              )}
            >
              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.div
                    key="home-password-field"
                    layout
                    initial={
                      prefersReducedMotion
                        ? {
                            opacity: 1
                          }
                        : {
                            opacity: 0,
                            x: -12
                          }
                    }
                    animate={{
                      opacity: 1,
                      x: 0
                    }}
                    exit={
                      prefersReducedMotion
                        ? {
                            opacity: 0
                          }
                        : {
                            opacity: 0,
                            x: -12
                          }
                    }
                    transition={{
                      duration: prefersReducedMotion ? 0.01 : 0.16,
                      ease: "easeOut"
                    }}
                    className="min-w-0 flex-1"
                  >
                    <input
                      ref={inputRef}
                      id="home-player-password"
                      name="password"
                      type="password"
                      aria-label="Password"
                      autoComplete="current-password"
                      className="h-full w-full bg-transparent text-base text-slate-100 outline-none"
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <ArrowButton
                expanded={expanded}
                errorCount={state.errorCount}
                onPress={handleArrowPress}
                prefersReducedMotion={prefersReducedMotion}
              />
            </motion.div>
          </motion.div>
        </form>
      </div>
    </main>
  );
}
