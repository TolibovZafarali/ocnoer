"use client";

import { useLayoutEffect, useRef, useState } from "react";

type HandwritingLine = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type HandwritingLayout = {
  width: number;
  height: number;
  lines: HandwritingLine[];
};

const CHAPTER_CARD_TEXT_CLASSNAME =
  "m-0 font-chapter-card whitespace-pre-wrap break-words text-[clamp(0.9rem,1.25vw,1.15rem)] leading-[2.05] tracking-[0.012em] text-slate-50";

function mergeHandwritingLines(rects: HandwritingLine[]) {
  const merged: HandwritingLine[] = [];

  for (const rect of rects) {
    const previousLine = merged[merged.length - 1];

    if (previousLine && Math.abs(previousLine.top - rect.top) < 2) {
      const previousRight = previousLine.left + previousLine.width;
      const nextRight = rect.left + rect.width;

      previousLine.left = Math.min(previousLine.left, rect.left);
      previousLine.top = Math.min(previousLine.top, rect.top);
      previousLine.width =
        Math.max(previousRight, nextRight) - previousLine.left;
      previousLine.height = Math.max(previousLine.height, rect.height);
      continue;
    }

    merged.push({ ...rect });
  }

  return merged;
}

export function ChapterCardHandwriting(props: {
  text: string;
  progress: number;
}) {
  const measureRef = useRef<HTMLParagraphElement>(null);
  const [layout, setLayout] = useState<HandwritingLayout>({
    width: 0,
    height: 0,
    lines: []
  });

  useLayoutEffect(() => {
    const element = measureRef.current;

    if (!element) {
      return;
    }

    let cancelled = false;
    let frameId = 0;

    const measure = () => {
      if (cancelled || !measureRef.current) {
        return;
      }

      const measureElement = measureRef.current;
      const containerRect = measureElement.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(measureElement);
      const lineRects = mergeHandwritingLines(
        Array.from(range.getClientRects())
          .map((rect) => ({
            left: rect.left - containerRect.left,
            top: rect.top - containerRect.top,
            width: rect.width,
            height: rect.height
          }))
          .filter((rect) => rect.width > 0 && rect.height > 0)
      );

      setLayout({
        width: measureElement.clientWidth,
        height: measureElement.clientHeight,
        lines: lineRects
      });
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    void document.fonts?.ready?.then(() => {
      scheduleMeasure();
    });

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleMeasure();
          })
        : null;

    resizeObserver?.observe(element);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [props.text]);

  const clampedProgress = Math.max(0, Math.min(props.progress, 1));
  const totalLineWidth =
    layout.lines.reduce((sum, line) => sum + line.width, 0) || 1;
  let remainingRevealWidth = clampedProgress * totalLineWidth;
  const lineRevealWidths = layout.lines.map((line) => {
    const revealWidth = Math.min(line.width, Math.max(0, remainingRevealWidth));

    remainingRevealWidth -= line.width;
    return revealWidth;
  });

  return (
    <span className="relative inline-block w-[min(28rem,72vw)] max-w-full align-middle">
      <p
        ref={measureRef}
        aria-hidden
        className={`${CHAPTER_CARD_TEXT_CLASSNAME} invisible select-none`}
      >
        {props.text}
      </p>

      <span className="pointer-events-none absolute inset-0">
        {layout.lines.length === 0 ? (
          <p
            className={CHAPTER_CARD_TEXT_CLASSNAME}
            style={{ opacity: clampedProgress }}
          >
            {props.text}
          </p>
        ) : (
          <>
            {layout.lines.map((line, lineIndex) => {
              const revealWidth = lineRevealWidths[lineIndex] ?? 0;

              return (
                <span
                  key={`line-${lineIndex}`}
                  className="absolute overflow-hidden"
                  style={{
                    left: line.left,
                    top: line.top,
                    width: revealWidth,
                    height: line.height + 6
                  }}
                >
                  <p
                    className={CHAPTER_CARD_TEXT_CLASSNAME}
                    style={{
                      width: layout.width,
                      minHeight: layout.height,
                      transform: `translate(${-line.left}px, ${-line.top}px)`
                    }}
                  >
                    {props.text}
                  </p>
                </span>
              );
            })}

            {layout.lines.map((line, lineIndex) => {
              const revealWidth = lineRevealWidths[lineIndex] ?? 0;

              if (revealWidth <= 0 || revealWidth >= line.width) {
                return null;
              }

              const penLeft = line.left + revealWidth;
              const penTop = line.top + line.height * 0.64;
              const glowTop = line.top + line.height * 0.2;
              const penSize = Math.max(5, line.height * 0.24);
              const glowWidth = Math.max(18, line.height * 1.15);

              return (
                <span key={`pen-${lineIndex}`}>
                  <span
                    className="absolute rounded-full bg-slate-50/90"
                    style={{
                      left: penLeft,
                      top: penTop,
                      width: penSize,
                      height: penSize,
                      transform: "translate(-50%, -50%)",
                      boxShadow:
                        "0 0 10px rgba(255,255,255,0.45), 0 0 24px rgba(255,255,255,0.2)"
                    }}
                  />
                  <span
                    className="absolute bg-gradient-to-r from-transparent via-slate-50/25 to-slate-50/70 blur-[7px]"
                    style={{
                      left: Math.max(line.left, penLeft - glowWidth + penSize),
                      top: glowTop,
                      width: glowWidth,
                      height: Math.max(10, line.height * 0.95)
                    }}
                  />
                </span>
              );
            })}
          </>
        )}
      </span>
    </span>
  );
}
