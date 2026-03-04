export type FrameNodeMeta = { label: string; value: string };
export type FrameNodeAction = { label: string; action: string; primary?: boolean };

export type FrameNode = {
  id: string;
  label: string;
  angle: number;
  offset: number;
  description: string;
  meta: FrameNodeMeta[];
  actions: FrameNodeAction[];
};

export type FrameStatus = { label: string; value: string };

export type FrameVariant = 'interactive' | 'decorative';

export type FrameOptions = {
  canvas: HTMLCanvasElement;
  root: HTMLElement;
  nodes: FrameNode[];
  statuses: FrameStatus[];
  logoSrc?: string;
  variant?: FrameVariant;
  onAction?: (action: string) => void;
  onCoreAction?: () => void;
};

export type FrameSceneController = {
  update: (payload: { nodes: FrameNode[]; statuses: FrameStatus[] }) => void;
  dispose: () => void;
};

type LogoTexture = { image: HTMLImageElement; width: number; height: number };

const DPR = () => {
  const pixelRatio = window.devicePixelRatio || 1;
  const isSmallScreen = Boolean(window.matchMedia?.('(max-width: 720px)')?.matches);
  const cap = isSmallScreen ? 1.75 : 2.5;
  return Math.min(cap, pixelRatio);
};
const TWO_PI = Math.PI * 2;

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

type DrawNeuronParams = {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  radius: number;
  highlight?: number;
  time?: number;
};

function drawMinimalNeuron({ ctx, x, y, radius, highlight = 0, time = 0 }: DrawNeuronParams) {
  const pulse = 1 + Math.sin(time * 0.001 + y * 0.0006) * 0.04;
  const outerRadius = radius * (1.08 + highlight * 0.08) * pulse;
  const coreRadius = radius * 0.42;

  ctx.save();

  const glow = ctx.createRadialGradient(x, y, radius * 0.2, x, y, outerRadius);
  glow.addColorStop(0, `rgba(210, 240, 255, ${0.4 + highlight * 0.25})`);
  glow.addColorStop(0.6, 'rgba(140, 185, 220, 0.18)');
  glow.addColorStop(1, 'rgba(14, 24, 36, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, outerRadius, 0, TWO_PI);
  ctx.fill();

  ctx.lineWidth = Math.max(0.8, radius * 0.08);
  ctx.strokeStyle = `rgba(190, 225, 250, ${0.45 + highlight * 0.25})`;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius * (0.85 + highlight * 0.12), 0, TWO_PI);
  ctx.stroke();

  const fibrils = 5;
  ctx.lineWidth = Math.max(0.6, radius * 0.045);
  ctx.strokeStyle = `rgba(175, 210, 240, ${0.35 + highlight * 0.2})`;
  for (let i = 0; i < fibrils; i += 1) {
    const angle = (i / fibrils) * TWO_PI + Math.sin(time * 0.0009 + i) * 0.1;
    const inner = coreRadius * 0.45;
    const outer = coreRadius * (1.4 + highlight * 0.2);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer, radius * 0.12, 0, TWO_PI);
    ctx.fillStyle = `rgba(215, 245, 255, ${0.55 + highlight * 0.25})`;
    ctx.fill();
  }

  ctx.fillStyle = `rgba(230, 248, 255, ${0.72 + highlight * 0.2})`;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius * 0.6, 0, TWO_PI);
  ctx.fill();

  ctx.restore();
}

type DrawHelixParams = {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  height: number;
  amplitude: number;
  radius: number;
  alpha: number;
  time: number;
};

function drawNeuronHelix({ ctx, x, y, height, amplitude, radius, alpha, time }: DrawHelixParams) {
  const segmentCount = Math.max(18, Math.round(height / 16));
  const phase = time * 0.0004;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    const yPos = y + t * height;
    const angle = t * TWO_PI * 1.35 + phase;
    const offset = Math.sin(angle) * amplitude;
    const offset2 = Math.sin(angle + Math.PI) * amplitude;
    const x1 = x + offset;
    const x2 = x + offset2;

    const fade = Math.sin(Math.PI * t);
    const localAlpha = alpha * (0.25 + fade * 0.75);

    if (i % 3 === 0) {
      ctx.globalAlpha = localAlpha;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(210, 245, 255, 0.18)';
      ctx.beginPath();
      ctx.moveTo(x1, yPos);
      ctx.lineTo(x2, yPos);
      ctx.stroke();
    }

    ctx.globalAlpha = localAlpha;
    const glow = ctx.createRadialGradient(x1, yPos, 0, x1, yPos, radius * 2.2);
    glow.addColorStop(0, 'rgba(235, 252, 255, 0.28)');
    glow.addColorStop(1, 'rgba(8, 16, 26, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x1, yPos, radius * 2.2, 0, TWO_PI);
    ctx.fill();

    ctx.globalAlpha = localAlpha * 0.55;
    ctx.fillStyle = 'rgba(230, 248, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(x1, yPos, radius, 0, TWO_PI);
    ctx.fill();

    ctx.globalAlpha = localAlpha * 0.42;
    ctx.fillStyle = 'rgba(210, 240, 255, 0.38)';
    ctx.beginPath();
    ctx.arc(x2, yPos, radius * 0.72, 0, TWO_PI);
    ctx.fill();
  }

  ctx.restore();
}

class FogLayer {
  count: number;
  color: string;
  minRadius: number;
  maxRadius: number;
  speed: number;
  particles: Array<{
    x: number;
    y: number;
    radius: number;
    baseAlpha: number;
    phase: number;
    driftX: number;
    driftY: number;
    twinkle: number;
  }>;
  width: number;
  height: number;

  constructor({
    count,
    color,
    minRadius,
    maxRadius,
    speed,
  }: {
    count: number;
    color: string;
    minRadius: number;
    maxRadius: number;
    speed: number;
  }) {
    this.count = count;
    this.color = color;
    this.minRadius = minRadius;
    this.maxRadius = maxRadius;
    this.speed = speed;
    this.particles = [];
    this.width = 0;
    this.height = 0;
  }

  setBounds(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.particles = Array.from({ length: this.count }, () => this.spawn());
  }

  spawn() {
    const radius = rand(this.minRadius, this.maxRadius) * Math.max(this.width, this.height);
    return {
      x: rand(-radius, this.width + radius),
      y: rand(-radius, this.height + radius),
      radius,
      baseAlpha: rand(0.05, 0.18),
      phase: rand(0, TWO_PI),
      driftX: rand(-this.speed, this.speed) * this.width,
      driftY: rand(-this.speed, this.speed) * this.height,
      twinkle: rand(0.4, 1.1),
    };
  }

  update(dt: number) {
    const seconds = dt / 1000;
    this.particles.forEach((p) => {
      p.x += p.driftX * seconds;
      p.y += p.driftY * seconds;
      const margin = p.radius * 0.35;
      if (
        p.x < -margin ||
        p.x > this.width + margin ||
        p.y < -margin ||
        p.y > this.height + margin
      ) {
        Object.assign(p, this.spawn());
      }
    });
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.particles.forEach((p) => {
      const alpha = p.baseAlpha + Math.sin(time * 0.00025 + p.phase) * p.twinkle * 0.05;
      ctx.globalAlpha = clamp01(alpha);
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      gradient.addColorStop(0, this.color);
      gradient.addColorStop(1, 'rgba(7, 15, 24, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, TWO_PI);
      ctx.fill();
    });
    ctx.restore();
  }
}

class LiveNeuronField {
  count: number;
  fov: number;
  depth: number;
  width: number;
  height: number;
  nodes: Array<{
    angle: number;
    radius: number;
    z: number;
    spin: number;
    dz: number;
    jitter: number;
    baseSize: number;
  }>;

  constructor({ count, fov, depth }: { count: number; fov: number; depth: number }) {
    this.count = count;
    this.fov = fov;
    this.depth = depth;
    this.width = 1;
    this.height = 1;
    this.nodes = [];
  }

  setBounds(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.nodes = Array.from({ length: this.count }, () => this.spawn());
  }

  spawn() {
    const baseRadius = Math.min(this.width, this.height) * rand(0.18, 0.5);
    return {
      angle: rand(0, TWO_PI),
      radius: baseRadius,
      z: rand(-this.depth * 0.25, this.depth * 0.8),
      spin: rand(-0.00025, 0.00035),
      dz: rand(-24, 26),
      jitter: rand(0, TWO_PI),
      baseSize: rand(6, 14),
    };
  }

  update(dt: number) {
    const seconds = dt / 1000;
    this.nodes.forEach((node, idx) => {
      node.angle += node.spin * dt;
      node.z += node.dz * seconds;
      if (node.z < -this.depth * 0.4 || node.z > this.depth) {
        this.nodes[idx] = this.spawn();
      }
      if (Math.abs(node.spin) < 0.00008) {
        node.spin += rand(-0.00008, 0.00008);
      }
    });
  }

  project(node: { angle: number; radius: number; z: number }) {
    const perspective = this.fov / (this.fov + node.z + this.fov * 0.2);
    const x = Math.cos(node.angle) * node.radius;
    const y = Math.sin(node.angle) * node.radius * 0.6;
    return {
      x: this.width * 0.5 + x * perspective,
      y: this.height * 0.5 + y * perspective,
      scale: perspective,
    };
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    const sorted = this.nodes.slice().sort((a, b) => a.z - b.z);
    ctx.save();
    sorted.forEach((node, idx) => {
      const { x, y, scale } = this.project(node);
      const alpha = clamp01(0.18 + scale * 0.8);
      const radius = node.baseSize * scale * (1 + Math.sin(time * 0.001 + node.jitter) * 0.12);

      const glow = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
      glow.addColorStop(0, `rgba(215, 245, 255, ${0.35 + alpha * 0.3})`);
      glow.addColorStop(0.6, `rgba(140, 200, 240, ${0.22 + alpha * 0.35})`);
      glow.addColorStop(1, 'rgba(8, 16, 26, 0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TWO_PI);
      ctx.fill();

      if (idx > 1 && idx % 3 === 0) {
        const prev = sorted[(idx + sorted.length - 2) % sorted.length];
        const p = this.project(prev);
        ctx.globalAlpha = alpha * 0.45;
        ctx.strokeStyle = 'rgba(180, 230, 255, 0.35)';
        ctx.lineWidth = Math.max(0.6, 1.2 * scale);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    });
    ctx.restore();
  }
}

class DnaStrand {
  y: number;
  amplitude: number;
  frequency: number;
  speed: number;
  color: [number, number, number];
  thickness: number;

  constructor({
    y,
    amplitude,
    frequency,
    speed,
    color,
    thickness,
  }: {
    y: number;
    amplitude: number;
    frequency: number;
    speed: number;
    color: [number, number, number];
    thickness: number;
  }) {
    this.y = y;
    this.amplitude = amplitude;
    this.frequency = frequency;
    this.speed = speed;
    this.color = color;
    this.thickness = thickness;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
    const centerY = height * this.y;
    const amp = height * this.amplitude;
    const length = width;
    const segmentCount = Math.round(width / 12);
    const phase = time * this.speed;

    const drawStrand = (offset: number, thicknessMultiplier: number, transparency: number) => {
      ctx.save();
      ctx.lineWidth = this.thickness * thicknessMultiplier;
      ctx.strokeStyle = `rgba(${this.color.join(',')},${transparency})`;
      ctx.beginPath();
      for (let i = 0; i <= segmentCount; i += 1) {
        const t = i / segmentCount;
        const x = t * length;
        const angle = (t * this.frequency + offset) * TWO_PI + phase;
        const y = centerY + Math.sin(angle) * amp;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();
    };

    drawStrand(0, 1.6, 0.12);
    drawStrand(0, 1, 0.35);
    drawStrand(0.5, 1.6, 0.12);
    drawStrand(0.5, 1, 0.35);

    ctx.save();
    ctx.lineWidth = this.thickness * 0.6;
    ctx.strokeStyle = `rgba(${this.color.join(',')},0.4)`;
    for (let i = 0; i <= segmentCount; i += 6) {
      const t = i / segmentCount;
      const x = t * length;
      const angle = t * this.frequency * TWO_PI + phase;
      const y1 = centerY + Math.sin(angle) * amp;
      const y2 = centerY + Math.sin(angle + Math.PI) * amp;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

class HexField {
  size: number;
  stroke: string;
  alpha: number;
  hexes: Array<{ x: number; y: number; pulseOffset: number; scale: number; alpha: number }>;
  width: number;
  height: number;

  constructor({ size, stroke, alpha }: { size: number; stroke: string; alpha: number }) {
    this.size = size;
    this.stroke = stroke;
    this.alpha = alpha;
    this.hexes = [];
    this.width = 0;
    this.height = 0;
  }

  setBounds(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.generate();
  }

  generate() {
    this.hexes = [];
    const radius = this.size;
    const vert = radius * Math.sqrt(3);
    const horiz = radius * 1.5;
    const cols = Math.ceil(this.width / horiz) + 1;
    const rows = Math.ceil(this.height / vert) + 1;

    for (let row = -1; row <= rows; row += 1) {
      for (let col = -1; col <= cols; col += 1) {
        const x = col * horiz + (row % 2 === 0 ? 0 : horiz * 0.5);
        const y = row * (vert * 0.5);
        if (Math.random() > 0.65) {
          this.hexes.push({
            x,
            y,
            pulseOffset: Math.random() * TWO_PI,
            scale: rand(0.85, 1.25),
            alpha: rand(0.18, this.alpha),
          });
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = this.stroke;
    this.hexes.forEach((hex) => {
      const alpha = hex.alpha * (0.6 + Math.sin(time * 0.001 + hex.pulseOffset) * 0.4);
      ctx.globalAlpha = clamp01(alpha);
      this.drawHex(ctx, hex.x, hex.y, this.size * hex.scale);
    });
    ctx.restore();
  }

  drawHex(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.stroke();
  }
}

class Sparks {
  count: number;
  sparks: Array<{
    x: number;
    y: number;
    size: number;
    speed: number;
    alpha: number;
    phase: number;
  }>;
  width: number;
  height: number;

  constructor(count: number) {
    this.count = count;
    this.sparks = [];
    this.width = 0;
    this.height = 0;
  }

  setBounds(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.sparks = Array.from({ length: this.count }, () => this.spawn());
  }

  spawn() {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      size: rand(1.2, 2.7),
      speed: rand(10, 25),
      alpha: rand(0.2, 0.8),
      phase: rand(0, TWO_PI),
    };
  }

  update(dt: number) {
    const seconds = dt / 1000;
    this.sparks.forEach((spark, i) => {
      spark.x += spark.speed * seconds * 0.2;
      spark.y += Math.sin(spark.phase + spark.x * 0.01) * 0.2;
      spark.alpha = 0.45 + Math.sin(spark.phase + spark.x * 0.02) * 0.35;
      if (spark.x > this.width + 10) {
        this.sparks[i] = this.spawn();
        this.sparks[i].x = -10;
      }
    });
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = '#c8ecff';
    this.sparks.forEach((spark) => {
      ctx.globalAlpha = clamp01(spark.alpha);
      ctx.fillRect(spark.x, spark.y, spark.size, spark.size);
    });
    ctx.restore();
  }
}

type SceneOptions = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  logoTexture: LogoTexture | null;
  nodes: FrameNode[];
  variant?: FrameVariant;
  onModeChange?: (mode: 'start' | 'load' | 'main') => void;
  startDuration?: number;
  loadDuration?: number;
  getActiveNodeId?: () => string | null;
  getNodeAnchors?: () => Array<{ id: string; x: number; y: number }>;
  getCoreAnchor?: () => { x: number; y: number; radius?: number } | null;
};

class Scene {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  logoTexture: LogoTexture | null;
  nodes: FrameNode[];
  variant: FrameVariant;
  onModeChange: (mode: 'start' | 'load' | 'main') => void;
  startDuration: number;
  loadDuration: number;
  width: number;
  height: number;
  time: number;
  mode: 'start' | 'load' | 'main';
  modeTime: number;
  getActiveNodeId: () => string | null;
  getNodeAnchors: () => Array<{ id: string; x: number; y: number }>;
  getCoreAnchor: () => { x: number; y: number; radius?: number } | null;
  fogLayers: FogLayer[];
  neuronField: LiveNeuronField;
  dnaStrands: DnaStrand[];
  hexField: HexField;
  sparks: Sparks;
  resize: () => void;
  handlePointer: (event: PointerEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  modeHandle: number | null;
  frameHandle: number | null;

  constructor({
    canvas,
    ctx,
    logoTexture,
    nodes,
    variant,
    onModeChange,
    startDuration,
    loadDuration,
    getActiveNodeId,
    getNodeAnchors,
    getCoreAnchor,
  }: SceneOptions) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.logoTexture = logoTexture;
    this.nodes = nodes;
    this.variant = variant ?? 'interactive';
    this.onModeChange = onModeChange || (() => {});
    this.startDuration = startDuration ?? 6000;
    this.loadDuration = loadDuration ?? 9000;
    this.width = 0;
    this.height = 0;
    this.time = 0;
    this.mode = this.variant === 'decorative' ? 'main' : 'start';
    this.modeTime = 0;
    this.getActiveNodeId = getActiveNodeId || (() => null);
    this.getNodeAnchors = getNodeAnchors || (() => []);
    this.getCoreAnchor = getCoreAnchor || (() => null);

    this.fogLayers = [
      new FogLayer({
        count: 12,
        color: 'rgba(90, 135, 180, 0.08)',
        minRadius: 0.12,
        maxRadius: 0.35,
        speed: 0.0005,
      }),
      new FogLayer({
        count: 10,
        color: 'rgba(160, 205, 255, 0.08)',
        minRadius: 0.08,
        maxRadius: 0.24,
        speed: 0.00035,
      }),
    ];

    this.neuronField = new LiveNeuronField({
      count: this.variant === 'decorative' ? 0 : 120,
      fov: 900,
      depth: 1100,
    });

    this.dnaStrands = [
      new DnaStrand({
        y: 0.28,
        amplitude: 0.08,
        frequency: 1.1,
        speed: 0.0005,
        color: [190, 220, 255],
        thickness: 3.5,
      }),
      new DnaStrand({
        y: 0.72,
        amplitude: 0.07,
        frequency: 1.4,
        speed: -0.00045,
        color: [180, 215, 255],
        thickness: 3,
      }),
    ];

    this.hexField = new HexField({
      size: 22,
      stroke: 'rgba(100, 175, 235, 0.25)',
      alpha: 0.4,
    });

    this.sparks = new Sparks(this.variant === 'decorative' ? 46 : 90);

    this.resize = this._resize.bind(this);
    this.handlePointer = this._handlePointer.bind(this);
    this.handleKeyDown = this._handleKeyDown.bind(this);
    this.modeHandle = null;
    this.frameHandle = null;

    window.addEventListener('resize', this.resize);
    if (this.variant === 'interactive') {
      window.addEventListener('keydown', this.handleKeyDown);
      this.canvas.addEventListener('pointerdown', this.handlePointer);
    }

    this.resize();
    this.onModeChange(this.mode);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.removeEventListener('pointerdown', this.handlePointer);
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  setMode(mode: 'start' | 'load' | 'main', resetTime = true) {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    if (resetTime) {
      this.modeTime = 0;
    }
    this.onModeChange(this.mode);
  }

  advanceMode() {
    if (this.mode === 'start' || this.mode === 'load') {
      this.setMode('main');
    }
  }

  updateNodes(nodes: FrameNode[]) {
    this.nodes = nodes;
  }

  _handlePointer(event: PointerEvent) {
    if (this.mode === 'main') {
      return;
    }
    this.advanceMode();
    event.preventDefault();
  }

  _handleKeyDown() {
    if (this.mode !== 'main') {
      this.advanceMode();
    }
  }

  _resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = DPR();
    this.canvas.width = width * pixelRatio;
    this.canvas.height = height * pixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    this.width = width;
    this.height = height;

    this.fogLayers.forEach((layer) => layer.setBounds(width, height));
    this.neuronField.setBounds(width, height);
    this.hexField.setBounds(width, height);
    this.sparks.setBounds(width, height);
  }

  start() {
    let lastTime = performance.now();
    const loop = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      this.update(dt);
      this.render();
      this.frameHandle = requestAnimationFrame(loop);
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  update(dt: number) {
    this.time += dt;
    this.modeTime += dt;

    if (this.mode === 'start' && this.modeTime > this.startDuration) {
      this.setMode('main');
    } else if (this.mode === 'load' && this.modeTime > this.loadDuration) {
      this.setMode('main');
    }

    this.fogLayers.forEach((layer) => layer.update(dt));
    this.neuronField.update(dt);
    this.sparks.update(dt);
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground();
    this.hexField.draw(this.ctx, this.time);
    this.neuronField.draw(this.ctx, this.time);
    if (this.variant === 'decorative') {
      this.drawDecorativeSideNeurons();
    }
    this.fogLayers.forEach((layer) => layer.draw(this.ctx, this.time));
    if (this.variant === 'interactive') {
      this.dnaStrands.forEach((strand) =>
        strand.draw(this.ctx, this.width, this.height, this.time),
      );
    }
    this.sparks.draw(this.ctx);

    if (this.variant === 'decorative') {
      this.drawHeroNeuron();
      return;
    }

    if (this.mode === 'start') {
      this.drawStartOverlay();
    } else if (this.mode === 'load') {
      this.drawLoadingOverlay();
    } else {
      this.drawMainOverlay();
    }
    this.drawUIHints();
  }

  drawDecorativeSideNeurons() {
    const maxContentWidth = 1152;
    const gutter = Math.max(0, (this.width - maxContentWidth) / 2);
    if (gutter < 96) {
      return;
    }

    const visibility = clamp01((gutter - 96) / 260);
    const amplitude = Math.min(72, Math.max(18, gutter * 0.5 - 10));
    const radius = Math.min(14, Math.max(7, amplitude * 0.2));
    const alpha = 0.14 + visibility * 0.2;

    const top = this.height * 0.06;
    const helixHeight = this.height * 0.88;

    const leftX = gutter - amplitude - 16;
    const rightX = this.width - leftX;

    drawNeuronHelix({
      ctx: this.ctx,
      x: leftX,
      y: top,
      height: helixHeight,
      amplitude,
      radius,
      alpha,
      time: this.time,
    });
    drawNeuronHelix({
      ctx: this.ctx,
      x: rightX,
      y: top,
      height: helixHeight,
      amplitude,
      radius,
      alpha,
      time: this.time + 600,
    });
  }

  drawHeroNeuron() {
    const base = Math.min(this.width, this.height);
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;
    const time = this.time;

    const coreRadius = Math.max(34, base * 0.095);
    const driftX = Math.sin(time * 0.00022) * coreRadius * 0.12;
    const driftY = Math.cos(time * 0.00019) * coreRadius * 0.09;
    const x = centerX + driftX;
    const y = centerY + driftY;

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';

    const aura = this.ctx.createRadialGradient(x, y, coreRadius * 0.2, x, y, coreRadius * 2.3);
    aura.addColorStop(0, 'rgba(225, 248, 255, 0.06)');
    aura.addColorStop(0.5, 'rgba(110, 185, 235, 0.03)');
    aura.addColorStop(1, 'rgba(8, 16, 26, 0)');
    this.ctx.globalAlpha = 0.4;
    this.ctx.fillStyle = aura;
    this.ctx.beginPath();
    this.ctx.arc(x, y, coreRadius * 2.3, 0, TWO_PI);
    this.ctx.fill();

    const spokes = 6;
    for (let i = 0; i < spokes; i += 1) {
      const baseAngle = (i / spokes) * TWO_PI;
      const wobble = Math.sin(time * 0.0005 + i * 1.7) * 0.35;
      const angle = baseAngle + wobble;
      const reach = coreRadius * (1.4 + Math.sin(time * 0.00028 + i) * 0.08);
      const nodeX = x + Math.cos(angle) * reach;
      const nodeY = y + Math.sin(angle) * reach * 0.72;

      this.ctx.save();
      this.ctx.globalAlpha = 0.11;
      this.ctx.lineWidth = Math.max(0.8, coreRadius * 0.03);
      const gradient = this.ctx.createLinearGradient(x, y, nodeX, nodeY);
      gradient.addColorStop(0, 'rgba(210, 245, 255, 0.22)');
      gradient.addColorStop(1, 'rgba(120, 180, 230, 0)');
      this.ctx.strokeStyle = gradient;
      this.ctx.beginPath();
      const bend = coreRadius * 0.22;
      const bendAngle = angle + Math.PI / 2;
      this.ctx.moveTo(x, y);
      this.ctx.quadraticCurveTo(
        x + Math.cos(angle) * reach * 0.55 + Math.cos(bendAngle) * bend,
        y + Math.sin(angle) * reach * 0.55 + Math.sin(bendAngle) * bend * 0.72,
        nodeX,
        nodeY,
      );
      this.ctx.stroke();
      this.ctx.restore();

      const highlight = 0.12 + Math.sin(time * 0.0011 + i) * 0.04;
      this.ctx.save();
      this.ctx.globalAlpha = 0.32;
      drawMinimalNeuron({
        ctx: this.ctx,
        x: nodeX,
        y: nodeY,
        radius: coreRadius * 0.32,
        time: time + i * 140,
        highlight,
      });
      this.ctx.restore();
    }

    this.ctx.save();
    this.ctx.globalAlpha = 0.42;
    drawMinimalNeuron({ ctx: this.ctx, x, y, radius: coreRadius * 0.86, highlight: 0.58, time });
    this.ctx.restore();
    this.ctx.restore();
  }

  drawBackground() {
    const gradient = this.ctx.createRadialGradient(
      this.width * 0.45,
      this.height * 0.4,
      Math.min(this.width, this.height) * 0.2,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height),
    );
    gradient.addColorStop(0, '#22394b');
    gradient.addColorStop(0.4, '#142230');
    gradient.addColorStop(1, '#05080f');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawStartOverlay() {
    this.drawHeroNeuron();
  }

  drawProceduralLogo(size: number) {
    const ctx = this.ctx;
    const radius = size * 0.42;
    const ringWidth = size * 0.12;
    const gapStart = Math.PI * 0.82;
    const gapEnd = Math.PI * 1.24;
    const color = 'rgba(240, 250, 255, 0.95)';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.lineWidth = ringWidth;
    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI / 2, gapStart, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius, gapEnd, (Math.PI * 3) / 2, false);
    ctx.stroke();

    const arrowHeight = size * 0.34;
    const arrowWidth = arrowHeight * 0.72;
    ctx.beginPath();
    ctx.moveTo(0, -radius - arrowHeight * 0.6);
    ctx.lineTo(arrowWidth / 2, -radius + arrowHeight * 0.22);
    ctx.lineTo(-arrowWidth / 2, -radius + arrowHeight * 0.22);
    ctx.closePath();
    ctx.fill();

    const stemX = -size * 0.12;
    const dHeight = size * 0.62;
    const dRadius = size * 0.28;
    ctx.lineWidth = ringWidth * 0.75;
    ctx.beginPath();
    ctx.moveTo(stemX, -dHeight / 2);
    ctx.lineTo(stemX, dHeight / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(stemX + dRadius, 0, dRadius, -Math.PI / 2, Math.PI / 2, false);
    ctx.stroke();

    const connectorGap = size * 0.18;
    const connectorReach = radius * 1.08;
    const connectorRadius = ringWidth * 0.38;
    ctx.lineWidth = ringWidth * 0.6;
    ctx.beginPath();
    ctx.moveTo(stemX, -connectorGap);
    ctx.lineTo(-connectorReach, -connectorGap);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(stemX, connectorGap);
    ctx.lineTo(-connectorReach * 1.05, connectorGap);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-connectorReach - connectorRadius * 0.2, -connectorGap, connectorRadius, 0, TWO_PI);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      -connectorReach * 1.05 - connectorRadius * 0.2,
      connectorGap,
      connectorRadius,
      0,
      TWO_PI,
    );
    ctx.fill();

    ctx.restore();
  }

  drawLoadingOverlay() {
    const bannerWidth = Math.min(this.width * 0.78, 960);
    const bannerHeight = Math.max(60, bannerWidth * 0.12);
    const x = (this.width - bannerWidth) / 2;
    const y = this.height * 0.43;
    const progress = clamp01(this.modeTime / this.loadDuration);

    this.ctx.save();
    this.ctx.globalAlpha = 0.88;
    this.ctx.fillStyle = 'rgba(20, 54, 72, 0.68)';
    this.ctx.fillRect(x, y, bannerWidth, bannerHeight);

    this.ctx.strokeStyle = 'rgba(135, 205, 255, 0.35)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x + 1, y + 1, bannerWidth - 2, bannerHeight - 2);

    const scanX = x + ((this.modeTime * 0.15) % bannerWidth);
    const grad = this.ctx.createLinearGradient(scanX - 40, y, scanX + 40, y);
    grad.addColorStop(0, 'rgba(120, 220, 255, 0)');
    grad.addColorStop(0.5, 'rgba(170, 235, 255, 0.65)');
    grad.addColorStop(1, 'rgba(120, 220, 255, 0)');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(scanX - 40, y, 80, bannerHeight);

    this.ctx.globalAlpha = 0.35;
    this.ctx.fillStyle = 'rgba(180, 230, 255, 0.55)';
    this.ctx.fillRect(x + 24, y + bannerHeight - 14, bannerWidth - 48, 4);
    this.ctx.globalAlpha = 0.85;
    this.ctx.fillStyle = 'rgba(210, 245, 255, 0.85)';
    this.ctx.fillRect(x + 24, y + bannerHeight - 14, (bannerWidth - 48) * progress, 4);

    this.ctx.restore();

    const panelWidth = Math.min(bannerWidth * 0.4, 380);
    const panelHeight = bannerHeight * 0.8;
    const panelX = x + bannerWidth * 0.05;
    const panelY = y + bannerHeight + bannerHeight * 0.22;

    this.ctx.save();
    this.ctx.globalAlpha = 0.85;
    this.ctx.fillStyle = 'rgba(12, 32, 46, 0.75)';
    this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    this.ctx.strokeStyle = 'rgba(120, 205, 255, 0.35)';
    this.ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    const stripeWidth = panelWidth * 0.18;
    this.ctx.fillStyle = 'rgba(120, 205, 255, 0.45)';
    for (let i = 0; i < 4; i += 1) {
      const offset = (panelY * 0.5 + this.modeTime * 0.08 + i * 28) % (stripeWidth * 2);
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(panelX, panelY, stripeWidth, panelHeight);
      this.ctx.clip();
      this.ctx.globalAlpha = 0.3;
      this.ctx.translate(panelX - stripeWidth + offset, panelY);
      this.ctx.rotate(-Math.PI / 4);
      this.ctx.fillRect(-panelHeight, 0, panelHeight * 2.4, stripeWidth * 0.6);
      this.ctx.restore();
    }

    this.ctx.fillStyle = 'rgba(165, 215, 255, 0.75)';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.font = `${panelHeight * 0.22}px "Segoe UI", sans-serif`;
    this.ctx.fillText('DATA', panelX + stripeWidth + 18, panelY + 10);

    this.ctx.globalAlpha = 0.5;
    this.ctx.font = `${panelHeight * 0.14}px "Segoe UI", sans-serif`;

    const lines = [
      'COGNITIVE CHANNEL 04  >  AUTH SYNC',
      'TRACE VECTOR 18-AX  >  STABILIZING',
      'SUBJECT MEMORY INDEX 000142-3A',
    ];
    lines.forEach((line, index) => {
      this.ctx.fillText(line, panelX + stripeWidth + 18, panelY + 40 + index * 18);
    });
    this.ctx.restore();
  }

  drawMainOverlay() {
    const anchors = this.getNodeAnchors ? this.getNodeAnchors() : [];
    const coreAnchor = this.getCoreAnchor ? this.getCoreAnchor() : null;

    const defaultCenterX = this.width * 0.52;
    const defaultCenterY = this.height * 0.5;
    const centerX = coreAnchor?.x ?? defaultCenterX;
    const centerY = coreAnchor?.y ?? defaultCenterY;
    const baseRadius = Math.min(this.width, this.height) * 0.18;

    this.ctx.save();
    const glow = this.ctx.createRadialGradient(
      centerX,
      centerY,
      baseRadius * 0.22,
      centerX,
      centerY,
      baseRadius * 1.6,
    );
    glow.addColorStop(0, 'rgba(210, 240, 255, 0.72)');
    glow.addColorStop(0.5, 'rgba(90, 150, 200, 0.4)');
    glow.addColorStop(1, 'rgba(8, 18, 28, 0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(
      centerX - baseRadius * 2,
      centerY - baseRadius * 2,
      baseRadius * 4,
      baseRadius * 2.8,
    );

    this.ctx.globalAlpha = 0.45;
    this.ctx.strokeStyle = 'rgba(200, 235, 255, 0.32)';
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, baseRadius * 0.9, 0, TWO_PI);
    this.ctx.stroke();

    const activeNodeId = this.getActiveNodeId ? this.getActiveNodeId() : null;

    if (coreAnchor) {
      drawMinimalNeuron({
        ctx: this.ctx,
        x: centerX,
        y: centerY,
        radius: (coreAnchor.radius || baseRadius * 0.6) * 0.85,
        time: this.time,
        highlight: 1.2,
      });
    }

    if (anchors.length) {
      anchors.forEach((anchor, idx) => {
        const isActive = anchor.id === activeNodeId;
        const wave = Math.sin(this.time * 0.001 + idx * 0.85);

        this.ctx.save();
        const linkAlpha = clamp01(0.24 + wave * 0.16 + (isActive ? 0.3 : 0));
        this.ctx.globalAlpha = linkAlpha;
        this.ctx.lineWidth = isActive ? 2.1 : 1.4;
        this.ctx.strokeStyle = isActive ? 'rgba(205, 240, 255, 0.75)' : 'rgba(150, 198, 235, 0.45)';
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY);
        this.ctx.lineTo(anchor.x, anchor.y);
        this.ctx.stroke();
        this.ctx.restore();

        const midX = centerX + (anchor.x - centerX) * (0.52 + wave * 0.02);
        const midY = centerY + (anchor.y - centerY) * (0.52 + wave * 0.02);
        drawMinimalNeuron({
          ctx: this.ctx,
          x: midX,
          y: midY,
          radius: baseRadius * 0.18,
          time: this.time + idx * 80,
          highlight: isActive ? 0.55 : 0.18 + wave * 0.04,
        });

        drawMinimalNeuron({
          ctx: this.ctx,
          x: anchor.x,
          y: anchor.y,
          radius: baseRadius * (isActive ? 0.38 : 0.3),
          time: this.time + idx * 20,
          highlight: isActive ? 0.9 : 0.25 + wave * 0.08,
        });
      });
    } else {
      const pulse = 0.9 + Math.sin(this.time * 0.0012) * 0.04;
      this.nodes.forEach((node, idx) => {
        const angle = (node.angle * Math.PI) / 180;
        const length = baseRadius * (1.5 + node.offset * 0.32);
        const x = centerX + Math.cos(angle) * length * pulse;
        const y = centerY + Math.sin(angle) * length * pulse;
        const isActive = node.id === activeNodeId;
        const wave = Math.sin(this.time * 0.001 + idx * 0.85);

        this.ctx.save();
        const linkAlpha = clamp01(0.22 + wave * 0.16 + (isActive ? 0.22 : 0));
        this.ctx.globalAlpha = linkAlpha;
        this.ctx.lineWidth = baseRadius * (isActive ? 0.014 : 0.009);
        this.ctx.strokeStyle = isActive ? 'rgba(205, 240, 255, 0.58)' : 'rgba(150, 198, 235, 0.34)';
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        this.ctx.restore();

        const midLength = length * 0.58;
        const midX = centerX + Math.cos(angle) * midLength * (0.96 + wave * 0.02);
        const midY = centerY + Math.sin(angle) * midLength * (0.96 + wave * 0.02);
        drawMinimalNeuron({
          ctx: this.ctx,
          x: midX,
          y: midY,
          radius: baseRadius * 0.24,
          time: this.time + idx * 120,
          highlight: isActive ? 0.6 : 0.18 + wave * 0.05,
        });

        drawMinimalNeuron({
          ctx: this.ctx,
          x,
          y,
          radius: baseRadius * (isActive ? 0.62 : 0.54),
          time: this.time,
          highlight: isActive ? 1 : 0.2 + wave * 0.08,
        });
      });
    }

    this.ctx.restore();
  }

  drawUIHints() {
    this.ctx.save();
    this.ctx.globalAlpha = 0.45;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    this.ctx.font = '12px "Segoe UI", sans-serif';
    const hint =
      this.mode === 'start'
        ? 'НАЖМИТЕ, ЧТОБЫ АКТИВИРОВАТЬ ПАНЕЛЬ ИНСТРУМЕНТОВ'
        : 'ВЫБЕРИТЕ УЗЕЛ НА ОРБИТЕ, ЧТОБЫ ОТКРЫТЬ ИНСТРУМЕНТ';
    this.ctx.fillStyle = '#9ac8ff';
    this.ctx.fillText(hint, this.width / 2, this.height - 24);
    this.ctx.restore();
  }
}

type NodeAnchor = { id: string; x: number; y: number };

type UiController = {
  root: HTMLElement;
  selectNode: (id: string | null) => void;
  updateNodes: (nodes: FrameNode[]) => void;
  updateStatuses: (statuses: FrameStatus[]) => void;
  setInteractive: (enabled: boolean) => void;
  readonly activeId: string | null;
  getFirstNodeId: () => string | null;
  getNodeAnchors: () => NodeAnchor[];
  getCoreAnchor: () => { x: number; y: number; radius?: number } | null;
  dispose: () => void;
};

function setupMainUI({
  root,
  nodes,
  statuses,
  onAction,
  onCoreAction,
}: {
  root: HTMLElement;
  nodes: FrameNode[];
  statuses: FrameStatus[];
  onAction?: (action: string) => void;
  onCoreAction?: () => void;
}): UiController {
  const nodesContainer = root.querySelector<HTMLElement>('[data-role="nodes"]');
  const statusesList = root.querySelector<HTMLElement>('[data-role="statuses"]');
  const panelTitle = root.querySelector<HTMLElement>('[data-role="panel-title"]');
  const panelDescription = root.querySelector<HTMLElement>('[data-role="panel-description"]');
  const panelMeta = root.querySelector<HTMLElement>('[data-role="panel-meta"]');
  const panelActions = root.querySelector<HTMLElement>('[data-role="panel-actions"]');
  const coreButton = root.querySelector<HTMLButtonElement>('.main-ui__core');
  if (!nodesContainer || !panelTitle || !panelDescription || !panelMeta || !panelActions) {
    throw new Error('Frame root structure is incomplete');
  }

  let removeCoreListeners: (() => void) | null = null;
  if (coreButton) {
    const handleEnter = () => coreButton.classList.add('is-hover');
    const handleLeave = () => coreButton.classList.remove('is-hover');
    const handleClick = () => {
      onCoreAction?.();
    };
    coreButton.addEventListener('mouseenter', handleEnter);
    coreButton.addEventListener('mouseleave', handleLeave);
    coreButton.addEventListener('focus', handleEnter);
    coreButton.addEventListener('blur', handleLeave);
    coreButton.addEventListener('click', handleClick);
    removeCoreListeners = () => {
      coreButton.removeEventListener('mouseenter', handleEnter);
      coreButton.removeEventListener('mouseleave', handleLeave);
      coreButton.removeEventListener('focus', handleEnter);
      coreButton.removeEventListener('blur', handleLeave);
      coreButton.removeEventListener('click', handleClick);
      coreButton.classList.remove('is-hover');
    };
  }

  let buttons: HTMLButtonElement[] = [];
  let activeId: string | null = null;
  let currentNodes = nodes;
  let currentStatuses = statuses;

  const getNodeAnchors = () =>
    buttons
      .map<NodeAnchor | null>((btn) => {
        const dot = btn.querySelector<HTMLElement>('.main-ui__node-dot');
        if (!dot) {
          return null;
        }
        const rect = dot.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          return null;
        }
        return {
          id: btn.dataset.nodeId || '',
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      })
      .filter((anchor): anchor is NodeAnchor => Boolean(anchor?.id));

  const getCoreAnchor = () => {
    if (!coreButton) {
      return null;
    }
    const rect = coreButton.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return null;
    }
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      radius: rect.width / 2,
    };
  };

  const selectNode = (id: string | null) => {
    const node = id ? currentNodes.find((item) => item.id === id) : undefined;
    if (!node) {
      activeId = null;
      root.dataset.activeNode = '';
      panelTitle.textContent = 'Нет данных';
      panelDescription.textContent = 'Подождите, идёт синхронизация.';
      panelMeta.replaceChildren();
      panelActions.replaceChildren();
      buttons.forEach((btn) => btn.classList.remove('is-active'));
      return;
    }
    activeId = node.id;
    root.dataset.activeNode = node.id;
    panelTitle.textContent = node.label;
    panelDescription.textContent = node.description;

    panelMeta.replaceChildren();
    node.meta.forEach((metaItem) => {
      const dt = document.createElement('dt');
      dt.textContent = metaItem.label;
      const dd = document.createElement('dd');
      dd.textContent = metaItem.value;
      panelMeta.append(dt, dd);
    });

    panelActions.replaceChildren();
    node.actions.forEach((action) => {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = `main-ui__action${action.primary ? ' main-ui__action--primary' : ''}`;
      actionButton.textContent = action.label;
      actionButton.setAttribute('data-action', action.action);
      actionButton.addEventListener('click', () => {
        if (onAction) {
          onAction(action.action);
        } else {
          console.info('[frame] action triggered', action.action);
        }
      });
      panelActions.append(actionButton);
    });

    buttons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.nodeId === node.id);
    });
  };

  const renderStatuses = (items: FrameStatus[]) => {
    currentStatuses = items;
    if (!statusesList) {
      return;
    }
    statusesList.replaceChildren();
    currentStatuses.forEach((status) => {
      const li = document.createElement('li');
      li.className = 'main-ui__arc-item';
      li.innerHTML = `${status.label}<span>${status.value}</span>`;
      statusesList.appendChild(li);
    });
  };

  const renderNodes = (items: FrameNode[], preserveActive: boolean) => {
    currentNodes = items;
    nodesContainer.replaceChildren();
    buttons = [];

    currentNodes.forEach((node) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'main-ui__node';
      button.dataset.nodeId = node.id;
      button.tabIndex = -1;
      button.innerHTML = `
        <span class="main-ui__node-line" aria-hidden="true"></span>
        <span class="main-ui__node-dot" aria-hidden="true"></span>
        <span class="main-ui__node-label">${node.label}</span>
      `;

      const activate = () => selectNode(node.id);
      button.addEventListener('mouseenter', activate);
      button.addEventListener('focus', activate);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        activate();
      });

      nodesContainer.appendChild(button);
      buttons.push(button);
    });

    const desiredId =
      preserveActive && activeId && currentNodes.some((node) => node.id === activeId)
        ? activeId
        : (currentNodes[0]?.id ?? null);
    selectNode(desiredId);
  };

  const updateNodes = (items: FrameNode[]) => {
    renderNodes(items, true);
  };

  const updateStatuses = (items: FrameStatus[]) => {
    renderStatuses(items);
  };

  renderNodes(currentNodes, false);
  renderStatuses(currentStatuses);

  const setInteractive = (enabled: boolean) => {
    root.dataset.interactive = enabled ? 'true' : 'false';
    if (enabled) {
      root.removeAttribute('aria-hidden');
      root.dataset.visible = 'true';
      root.querySelectorAll('button').forEach((btn) => {
        btn.tabIndex = 0;
      });
      coreButton?.classList.remove('is-hover');
    } else {
      root.dataset.visible = 'false';
      root.setAttribute('aria-hidden', 'true');
      root.querySelectorAll('button').forEach((btn) => {
        btn.tabIndex = -1;
      });
      if (root.contains(document.activeElement)) {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      coreButton?.classList.remove('is-hover');
    }
  };

  setInteractive(false);

  return {
    root,
    selectNode,
    updateNodes,
    updateStatuses,
    setInteractive,
    get activeId() {
      return activeId;
    },
    getFirstNodeId: () => currentNodes[0]?.id ?? null,
    getNodeAnchors,
    getCoreAnchor,
    dispose: () => {
      removeCoreListeners?.();
    },
  };
}

async function loadLogoTexture(src: string): Promise<LogoTexture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => {
      resolve({
        image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    });
    image.addEventListener('error', reject);
    image.src = src;
  });
}

export async function initScene(options: FrameOptions): Promise<FrameSceneController> {
  const { canvas, root, nodes, statuses, logoSrc, variant, onAction, onCoreAction } = options;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) {
    throw new Error('2D context is not available');
  }

  const controller = setupMainUI({ root, nodes, statuses, onAction, onCoreAction });

  const handleModeChange = (mode: 'start' | 'load' | 'main') => {
    const enableUi = (variant ?? 'interactive') === 'interactive' && mode === 'main';
    controller.setInteractive(enableUi);
    if (enableUi) {
      controller.selectNode(controller.activeId ?? controller.getFirstNodeId());
    }
  };

  let logoTexture: LogoTexture | null = null;
  if (logoSrc) {
    try {
      logoTexture = await loadLogoTexture(logoSrc);
    } catch (error) {
      console.warn('[frame] Unable to load logo texture, using fallback', error);
    }
  }

  const scene = new Scene({
    canvas,
    ctx,
    logoTexture,
    nodes,
    variant,
    onModeChange: handleModeChange,
    getActiveNodeId: () => controller.activeId,
    getNodeAnchors: () => controller.getNodeAnchors(),
    getCoreAnchor: () => controller.getCoreAnchor(),
  });

  scene.start();

  return {
    update: ({
      nodes: nextNodes,
      statuses: nextStatuses,
    }: {
      nodes: FrameNode[];
      statuses: FrameStatus[];
    }) => {
      scene.updateNodes(nextNodes);
      controller.updateNodes(nextNodes);
      controller.updateStatuses(nextStatuses);
    },
    dispose: () => {
      scene.dispose();
      controller.dispose();
      controller.setInteractive(false);
    },
  };
}
