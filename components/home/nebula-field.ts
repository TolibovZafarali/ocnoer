export function createStarField(count: number) {
  let seed = 42719;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const normal = () =>
    Math.sqrt(-2 * Math.log(Math.max(random(), 0.0001))) *
    Math.cos(random() * Math.PI * 2);
  const stars = new Float32Array(count * 9);
  const colors = [
    [0.67, 0.81, 1],
    [0.88, 0.94, 1],
    [1, 0.82, 0.64],
    [0.78, 0.74, 1]
  ];

  for (let index = 0; index < count; index++) {
    const background = index < count * 0.055;
    const angle = random() * Math.PI * 2;
    const lane = Math.floor(random() * 3);
    const spread = random() < 0.82 ? 0.055 : 0.19;
    const radius =
      1 +
      Math.sin(angle * 3 + lane * 0.5) * 0.065 +
      lane * 0.09 +
      normal() * spread;
    const bright = random();
    const color = colors[Math.floor(random() * colors.length)];
    const offset = index * 9;

    stars.set(
      [
        background ? random() * 2 - 1 : Math.cos(angle) * radius,
        background ? random() * 2 - 1 : Math.sin(angle) * radius,
        background ? random() : Math.sin(angle * 2) * 0.17 + normal() * spread,
        ...color,
        bright > 0.98
          ? 6 + random() * 6
          : bright > 0.86
            ? 2 + random() * 2
            : 0.65 + random() * 1.75,
        background ? 0.12 + random() * 0.35 : 0.4 + random() * 0.6,
        background ? 1 : 0
      ],
      offset
    );
  }

  return stars;
}

export const vertexSource = `
  precision highp float;
  attribute vec3 aPosition;
  attribute vec3 aColor;
  attribute vec3 aStyle;
  uniform vec2 uResolution;
  uniform vec3 uRotation;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uReveal;
  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    vec3 p = aPosition;
    float cx = cos(uRotation.x), sx = sin(uRotation.x);
    float cy = cos(uRotation.y), sy = sin(uRotation.y);
    float cz = cos(uRotation.z), sz = sin(uRotation.z);
    p.yz = mat2(cx, sx, -sx, cx) * p.yz;
    p.xz = mat2(cy, -sy, sy, cy) * p.xz;
    p.xy = mat2(cz, sz, -sz, cz) * p.xy;

    float perspective = 3.8 / (3.8 - p.z);
    float scale = min(uResolution.x * 0.28, uResolution.y * 0.31);
    vec2 position = p.xy * perspective * scale * 2.0 / uResolution;
    position *= 1.0 + (1.0 - uReveal) * 0.18;
    float depth = smoothstep(-1.5, 1.5, p.z);

    if (aStyle.z > 0.5) {
      position = aPosition.xy;
      perspective = 0.65;
      depth = 0.2;
    }

    float shimmer = 0.92 + 0.08 * sin(uTime * 0.65 + aPosition.x * 43.0);
    gl_Position = vec4(position, 0.0, 1.0);
    gl_PointSize = max(1.0, aStyle.x * uPixelRatio * perspective * 3.5);
    vColor = aColor;
    vOpacity = aStyle.y * (0.55 + depth * 0.45) * shimmer * uReveal;
  }
`;

export const fragmentSource = `
  precision mediump float;
  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    float radius = length(gl_PointCoord - 0.5) * 2.0;
    if (radius > 1.0) discard;
    float core = exp(-radius * radius * 65.0);
    float halo = exp(-radius * radius * 7.0) * 0.16;
    float alpha = (core + halo) * vOpacity * 1.3;
    gl_FragColor = vec4(vColor * alpha, alpha);
  }
`;
