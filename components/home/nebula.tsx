"use client";

import { useEffect, useRef, useState } from "react";

import { createStarField, fragmentSource, vertexSource } from "./nebula-field";

const INITIAL_ROTATION = { x: 0.72, y: -0.32, z: -0.38 };

type SceneControls = {
  reset: () => void;
  pause: (paused: boolean) => void;
};

export function Nebula() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<SceneControls | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
      premultipliedAlpha: true
    });
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    if (!vertex || !fragment || !program || !buffer) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      if (program) gl.deleteProgram(program);
      if (buffer) gl.deleteBuffer(buffer);
      return;
    }

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    const dispose = () => {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      dispose();
      return;
    }

    const count = window.matchMedia("(max-width: 600px)").matches
      ? 10500
      : 19000;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, createStarField(count), gl.STATIC_DRAW);
    for (const [index, name] of ["aPosition", "aColor", "aStyle"].entries()) {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 36, index * 12);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);

    const uniforms = {
      resolution: gl.getUniformLocation(program, "uResolution"),
      rotation: gl.getUniformLocation(program, "uRotation"),
      pixelRatio: gl.getUniformLocation(program, "uPixelRatio"),
      time: gl.getUniformLocation(program, "uTime"),
      reveal: gl.getUniformLocation(program, "uReveal")
    };
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    let reducedMotion = motionPreference.matches;
    let isPaused = reducedMotion;
    let lost = false;
    let rotation = { ...INITIAL_ROTATION };
    const velocity = { x: 0, y: 0 };
    let pointer: { id: number; x: number; y: number } | null = null;
    let frame = 0;
    let lastTime = 0;
    let elapsed = 0;
    let revealTime = reducedMotion ? 3 : 0;
    let width = 1;
    let height = 1;
    let pixelRatio = 1;

    const draw = () => {
      if (lost) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform3f(uniforms.rotation, rotation.x, rotation.y, rotation.z);
      gl.uniform1f(uniforms.pixelRatio, pixelRatio);
      gl.uniform1f(uniforms.time, elapsed);
      gl.uniform1f(
        uniforms.reveal,
        1 - Math.pow(1 - Math.min(1, revealTime / 2.4), 3)
      );
      gl.drawArrays(gl.POINTS, 0, count);
    };

    const animate = (time: number) => {
      frame = 0;
      if (document.hidden || lost || isPaused) return;
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
      lastTime = time;
      elapsed += dt;
      revealTime += dt;
      if (!pointer && !reducedMotion) {
        rotation.y += dt * (0.025 + velocity.y);
        rotation.x += dt * velocity.x;
        velocity.x *= Math.exp(-dt * 3.2);
        velocity.y *= Math.exp(-dt * 3.2);
      }
      draw();
      frame = requestAnimationFrame(animate);
    };

    const start = () => {
      lastTime = 0;
      if (!frame && !document.hidden && !isPaused && !lost) {
        frame = requestAnimationFrame(animate);
      }
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      gl.viewport(0, 0, canvas.width, canvas.height);
      draw();
    };
    const reset = () => {
      rotation = { ...INITIAL_ROTATION };
      velocity.x = 0;
      velocity.y = 0;
      revealTime = isPaused || reducedMotion ? 3 : 0;
      draw();
    };
    const pause = (value: boolean) => {
      isPaused = value;
      setPaused(value);
      if (value) {
        stop();
        revealTime = 3;
        draw();
      } else {
        start();
      }
    };
    controlsRef.current = { reset, pause };
    setPaused(isPaused);

    const pointerDown = (event: PointerEvent) => {
      if (pointer || (event.pointerType === "mouse" && event.button !== 0))
        return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      velocity.x = 0;
      velocity.y = 0;
      canvas.setPointerCapture(event.pointerId);
      canvas.dataset.dragging = "true";
      canvas.focus({ preventScroll: true });
    };
    const pointerMove = (event: PointerEvent) => {
      if (pointer?.id !== event.pointerId) return;
      const dx = (event.clientX - pointer.x) * 0.006;
      const dy = (event.clientY - pointer.y) * 0.006;
      rotation.y += dx;
      rotation.x += dy;
      velocity.x = Math.max(-1.6, Math.min(1.6, dy * 15));
      velocity.y = Math.max(-1.6, Math.min(1.6, dx * 15));
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      revealTime = 3;
      draw();
    };
    const pointerUp = (event: PointerEvent) => {
      if (pointer?.id !== event.pointerId) return;
      pointer = null;
      delete canvas.dataset.dragging;
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          " ",
          "Home"
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      if (event.key === " ") pause(!isPaused);
      else if (event.key === "Home") reset();
      else {
        rotation.y +=
          event.key === "ArrowLeft"
            ? -0.12
            : event.key === "ArrowRight"
              ? 0.12
              : 0;
        rotation.x +=
          event.key === "ArrowUp"
            ? -0.12
            : event.key === "ArrowDown"
              ? 0.12
              : 0;
        revealTime = 3;
        draw();
      }
    };
    const visibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };
    const preferenceChange = () => {
      reducedMotion = motionPreference.matches;
      velocity.x = 0;
      velocity.y = 0;
      if (reducedMotion) pause(true);
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      stop();
      setReady(false);
      controlsRef.current = null;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("lostpointercapture", pointerUp);
    canvas.addEventListener("keydown", keyDown);
    canvas.addEventListener("webglcontextlost", contextLost);
    document.addEventListener("visibilitychange", visibilityChange);
    motionPreference.addEventListener("change", preferenceChange);
    resize();
    setReady(true);
    start();

    return () => {
      stop();
      observer.disconnect();
      controlsRef.current = null;
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("lostpointercapture", pointerUp);
      canvas.removeEventListener("keydown", keyDown);
      canvas.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", visibilityChange);
      motionPreference.removeEventListener("change", preferenceChange);
      dispose();
    };
  }, []);

  return (
    <div className="nebula" data-ready={ready}>
      <div
        className="nebula-still"
        role="img"
        aria-label="A luminous ring of stars in a dark sky"
        aria-hidden={ready}
      />
      <canvas
        ref={canvasRef}
        className="nebula-canvas"
        tabIndex={ready ? 0 : -1}
        role="img"
        aria-hidden={!ready}
        aria-label="Interactive nebula. Drag or use arrow keys to rotate. Space pauses motion. Home resets the view."
      />
      {ready && (
        <div className="nebula-controls">
          <button
            type="button"
            aria-label={paused ? "Resume motion" : "Pause motion"}
            onClick={() => controlsRef.current?.pause(!paused)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              {paused ? (
                <path d="m9 6 9 6-9 6Z" />
              ) : (
                <path d="M9 6v12M15 6v12" />
              )}
            </svg>
          </button>
          <button
            type="button"
            aria-label="Reset the nebula"
            onClick={() => controlsRef.current?.reset()}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path d="M5 10a7 7 0 1 1 0 5M5 5v5h5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
