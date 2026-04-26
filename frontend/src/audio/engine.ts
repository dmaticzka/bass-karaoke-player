/**
 * Web Audio API engine — module-level singleton.
 * Keeps imperative audio state out of React/Zustand.
 */

import type { EqBand, StemName } from "../types";

export interface StemNode {
  buffer: AudioBuffer;
  gainNode: GainNode;
  eqNodes: BiquadFilterNode[];
  source: AudioBufferSourceNode | null;
  eqBypassed: boolean;
}

interface Engine {
  ctx: AudioContext | null;
  stemNodes: Partial<Record<StemName, StemNode>>;
  seekTimerId: number | null;
}

const engine: Engine = {
  ctx: null,
  stemNodes: {},
  seekTimerId: null,
};

export function getOrCreateCtx(): AudioContext {
  if (!engine.ctx) {
    engine.ctx = new AudioContext();
  }
  return engine.ctx;
}

export function getStemNodes(): Partial<Record<StemName, StemNode>> {
  return engine.stemNodes;
}

export function clearStemNodes(): void {
  engine.stemNodes = {};
}

/** Reset the entire engine singleton. Only call from tests. */
export function _resetForTesting(): void {
  engine.ctx = null;
  engine.stemNodes = {};
  if (engine.seekTimerId !== null) {
    clearInterval(engine.seekTimerId);
    engine.seekTimerId = null;
  }
}

function buildEqChain(ctx: AudioContext, bands: EqBand[]): BiquadFilterNode[] {
  return bands.map((b) => {
    const f = ctx.createBiquadFilter();
    f.type = b.type as BiquadFilterType;
    f.frequency.value = b.freq;
    f.gain.value = b.gain;
    return f;
  });
}

function connectEqChain(
  ctx: AudioContext,
  gainNode: GainNode,
  eqNodes: BiquadFilterNode[],
): void {
  if (eqNodes.length === 0) {
    gainNode.connect(ctx.destination);
    return;
  }
  gainNode.connect(eqNodes[0]!);
  for (let i = 0; i < eqNodes.length - 1; i++) {
    eqNodes[i]!.connect(eqNodes[i + 1]!);
  }
  eqNodes[eqNodes.length - 1]!.connect(ctx.destination);
}

export function wireStemNode(stem: StemName, buffer: AudioBuffer, vol: number, eqBands: EqBand[]): void {
  const ctx = getOrCreateCtx();
  const gainNode = ctx.createGain();
  gainNode.gain.value = vol;
  const eqNodes = buildEqChain(ctx, eqBands);
  const allFlat = eqBands.every((b) => Math.abs(b.gain) < 0.001);
  if (allFlat) {
    gainNode.connect(ctx.destination);
  } else {
    connectEqChain(ctx, gainNode, eqNodes);
  }
  engine.stemNodes[stem] = { buffer, gainNode, eqNodes, source: null, eqBypassed: allFlat };
}

function rewireEq(stem: StemName, bypass: boolean): void {
  const node = engine.stemNodes[stem];
  const ctx = engine.ctx;
  if (!node || !ctx || node.eqBypassed === bypass) return;
  // disconnect() severs gainNode's outputs only (not the source→gainNode input).
  // The reconnect happens synchronously in the same JS task, so the audio
  // rendering thread never observes an intermediate disconnected state.
  node.gainNode.disconnect();
  if (bypass) {
    node.gainNode.connect(ctx.destination);
  } else {
    connectEqChain(ctx, node.gainNode, node.eqNodes);
  }
  node.eqBypassed = bypass;
}

export function applyGain(stem: StemName, value: number): void {
  const node = engine.stemNodes[stem];
  const ctx = engine.ctx;
  if (node?.gainNode && ctx) {
    node.gainNode.gain.setTargetAtTime(value, ctx.currentTime, 0.05);
  }
}

export function applyEqBand(stem: StemName, bandIndex: number, gainDb: number): void {
  const node = engine.stemNodes[stem];
  if (node?.eqNodes[bandIndex]) {
    node.eqNodes[bandIndex]!.gain.value = gainDb;
    const allFlat = node.eqNodes.every((n) => Math.abs(n.gain.value) < 0.001);
    rewireEq(stem, allFlat);
  }
}

export function applyGlobalEqBand(stems: StemName[], bandIndex: number, gainDb: number): void {
  for (const stem of stems) {
    applyEqBand(stem, bandIndex, gainDb);
  }
}

export function playAll(
  offset: number,
  loopEnabled: boolean,
  loopStart: number | null,
  loopEnd: number | null,
): void {
  const ctx = getOrCreateCtx();
  if (ctx.state === "suspended") void ctx.resume();

  const stems = Object.keys(engine.stemNodes) as StemName[];
  for (const stem of stems) {
    const node = engine.stemNodes[stem];
    if (!node) continue;
    const source = ctx.createBufferSource();
    source.buffer = node.buffer;
    source.connect(node.gainNode);

    if (loopEnabled && loopStart !== null && loopEnd !== null) {
      source.loop = true;
      source.loopStart = loopStart;
      source.loopEnd = loopEnd;
      const startFrom = Math.max(loopStart, Math.min(offset, loopEnd));
      source.start(0, startFrom);
    } else {
      source.start(0, offset);
    }
    node.source = source;
  }
}

export function stopSources(): void {
  for (const node of Object.values(engine.stemNodes)) {
    if (!node) continue;
    try {
      node.source?.stop();
    } catch {
      // already stopped
    }
    node.source = null;
  }
}

export function startSeekTimer(
  getElapsed: () => number,
  onTick: (elapsed: number) => void,
): void {
  stopSeekTimer();
  engine.seekTimerId = window.setInterval(() => {
    onTick(getElapsed());
  }, 250);
}

export function stopSeekTimer(): void {
  if (engine.seekTimerId !== null) {
    clearInterval(engine.seekTimerId);
    engine.seekTimerId = null;
  }
}

export function currentTime(): number {
  return engine.ctx?.currentTime ?? 0;
}

export function getDuration(): number {
  const durations = Object.values(engine.stemNodes)
    .filter(Boolean)
    .map((n) => n!.buffer.duration);
  return durations.length > 0 ? Math.max(...durations) : 0;
}
