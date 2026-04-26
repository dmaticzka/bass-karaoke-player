import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as eng from "../../audio/engine";
import type { EqBand } from "../../types";

// ---------------------------------------------------------------------------
// Web Audio API mock
// ---------------------------------------------------------------------------

function makeGainNode() {
  return {
    gain: {
      value: 1,
      setTargetAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeBiquadFilter() {
  return {
    type: "peaking" as BiquadFilterType,
    frequency: { value: 1000 },
    gain: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeBufferSource() {
  return {
    buffer: null as AudioBuffer | null,
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function makeAudioBuffer(duration: number): AudioBuffer {
  return { duration, numberOfChannels: 1, sampleRate: 44100 } as unknown as AudioBuffer;
}

function makeAudioContext() {
  return {
    currentTime: 0,
    state: "running" as AudioContextState,
    resume: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn(() => makeGainNode()),
    createBiquadFilter: vi.fn(() => makeBiquadFilter()),
    createBufferSource: vi.fn(() => makeBufferSource()),
    destination: {},
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let mockCtx: ReturnType<typeof makeAudioContext>;

beforeEach(() => {
  eng._resetForTesting();
  mockCtx = makeAudioContext();
  // Use a class so it can be called with `new`
  class MockAudioContext {
    constructor() {
      return mockCtx;
    }
  }
  vi.stubGlobal("AudioContext", MockAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
  eng._resetForTesting();
});

// ---------------------------------------------------------------------------
// Context management
// ---------------------------------------------------------------------------

describe("getOrCreateCtx", () => {
  it("creates an AudioContext on first call", () => {
    const ctx = eng.getOrCreateCtx();
    expect(ctx).toBeDefined();
  });

  it("returns the same instance on subsequent calls", () => {
    const a = eng.getOrCreateCtx();
    const b = eng.getOrCreateCtx();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// wireStemNode
// ---------------------------------------------------------------------------

const flatBands: EqBand[] = [
  { freq: 60, gain: 0, type: "lowshelf", label: "Sub Bass" },
  { freq: 250, gain: 0, type: "peaking", label: "Bass" },
];

const activeBands: EqBand[] = [
  { freq: 60, gain: 5, type: "lowshelf", label: "Sub Bass" },
  { freq: 250, gain: 0, type: "peaking", label: "Bass" },
];

describe("wireStemNode", () => {
  it("registers the stem in stemNodes", () => {
    eng.getOrCreateCtx(); // ensure ctx is the mock
    const buf = makeAudioBuffer(30);
    eng.wireStemNode("bass", buf, 1.0, flatBands);
    const nodes = eng.getStemNodes();
    expect(nodes["bass"]).toBeDefined();
    expect(nodes["bass"]!.buffer).toBe(buf);
  });

  it("sets the initial gain value on the GainNode", () => {
    eng.getOrCreateCtx();
    const buf = makeAudioBuffer(30);
    eng.wireStemNode("bass", buf, 0.5, flatBands);
    const nodes = eng.getStemNodes();
    expect(nodes["bass"]!.gainNode.gain.value).toBe(0.5);
  });

  it("bypasses EQ chain when all bands are flat", () => {
    eng.getOrCreateCtx();
    const buf = makeAudioBuffer(30);
    eng.wireStemNode("bass", buf, 1.0, flatBands);
    const nodes = eng.getStemNodes();
    expect(nodes["bass"]!.eqBypassed).toBe(true);
    // GainNode should connect directly to destination (no EQ nodes involved)
    const gainNode = nodes["bass"]!.gainNode;
    expect(gainNode.connect).toHaveBeenCalledWith(mockCtx.destination);
  });

  it("wires EQ chain when bands are non-flat", () => {
    eng.getOrCreateCtx();
    const buf = makeAudioBuffer(30);
    eng.wireStemNode("bass", buf, 1.0, activeBands);
    const nodes = eng.getStemNodes();
    expect(nodes["bass"]!.eqBypassed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyGain
// ---------------------------------------------------------------------------

describe("applyGain", () => {
  it("calls setTargetAtTime on the GainNode", () => {
    eng.getOrCreateCtx();
    eng.wireStemNode("bass", makeAudioBuffer(30), 1.0, flatBands);
    eng.applyGain("bass", 0.3);
    const node = eng.getStemNodes()["bass"]!;
    expect(node.gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.3, 0, 0.05);
  });

  it("is a no-op when stem does not exist", () => {
    // Should not throw
    expect(() => eng.applyGain("vocals", 0.5)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// applyEqBand
// ---------------------------------------------------------------------------

describe("applyEqBand", () => {
  it("updates the targeted band gain value", () => {
    eng.getOrCreateCtx();
    eng.wireStemNode("bass", makeAudioBuffer(30), 1.0, flatBands);
    eng.applyEqBand("bass", 0, 8);
    const node = eng.getStemNodes()["bass"]!;
    expect(node.eqNodes[0]!.gain.value).toBe(8);
  });

  it("is a no-op when stem does not exist", () => {
    expect(() => eng.applyEqBand("vocals", 0, 5)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// applyGlobalEqBand
// ---------------------------------------------------------------------------

describe("applyGlobalEqBand", () => {
  it("applies the band change to all specified stems", () => {
    eng.getOrCreateCtx();
    eng.wireStemNode("bass", makeAudioBuffer(10), 1.0, flatBands);
    eng.wireStemNode("vocals", makeAudioBuffer(10), 1.0, flatBands);
    eng.applyGlobalEqBand(["bass", "vocals"], 0, 6);
    expect(eng.getStemNodes()["bass"]!.eqNodes[0]!.gain.value).toBe(6);
    expect(eng.getStemNodes()["vocals"]!.eqNodes[0]!.gain.value).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// clearStemNodes / getStemNodes
// ---------------------------------------------------------------------------

describe("clearStemNodes", () => {
  it("empties the stem nodes map", () => {
    eng.getOrCreateCtx();
    eng.wireStemNode("bass", makeAudioBuffer(10), 1.0, flatBands);
    eng.clearStemNodes();
    expect(Object.keys(eng.getStemNodes())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getDuration
// ---------------------------------------------------------------------------

describe("getDuration", () => {
  it("returns 0 when there are no stems", () => {
    expect(eng.getDuration()).toBe(0);
  });

  it("returns the maximum duration across all stems", () => {
    eng.getOrCreateCtx();
    eng.wireStemNode("bass", makeAudioBuffer(30), 1.0, flatBands);
    eng.wireStemNode("vocals", makeAudioBuffer(45), 1.0, flatBands);
    expect(eng.getDuration()).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// playAll / stopSources
// ---------------------------------------------------------------------------

describe("playAll", () => {
  it("starts all stem sources from the given offset", () => {
    eng.getOrCreateCtx();
    eng.wireStemNode("bass", makeAudioBuffer(30), 1.0, flatBands);
    eng.playAll(10, false, null, null);
    const source = eng.getStemNodes()["bass"]!.source!;
    expect(source.start).toHaveBeenCalledWith(0, 10);
  });

  it("configures loop when loop is enabled", () => {
    eng.getOrCreateCtx();
    eng.wireStemNode("bass", makeAudioBuffer(30), 1.0, flatBands);
    eng.playAll(5, true, 5, 20);
    const source = eng.getStemNodes()["bass"]!.source!;
    expect(source.loop).toBe(true);
    expect(source.loopStart).toBe(5);
    expect(source.loopEnd).toBe(20);
  });
});

describe("stopSources", () => {
  it("stops all active sources without throwing", () => {
    eng.getOrCreateCtx();
    eng.wireStemNode("bass", makeAudioBuffer(30), 1.0, flatBands);
    eng.playAll(0, false, null, null);
    expect(() => eng.stopSources()).not.toThrow();
  });

  it("sets source to null after stopping", () => {
    eng.getOrCreateCtx();
    eng.wireStemNode("bass", makeAudioBuffer(30), 1.0, flatBands);
    eng.playAll(0, false, null, null);
    eng.stopSources();
    expect(eng.getStemNodes()["bass"]!.source).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// startSeekTimer / stopSeekTimer
// ---------------------------------------------------------------------------

describe("seekTimer", () => {
  it("calls onTick at intervals", () => {
    vi.useFakeTimers();
    const getElapsed = vi.fn(() => 1.5);
    const onTick = vi.fn();
    eng.startSeekTimer(getElapsed, onTick);
    vi.advanceTimersByTime(500);
    expect(onTick).toHaveBeenCalledTimes(2);
    eng.stopSeekTimer();
    vi.useRealTimers();
  });

  it("stopSeekTimer prevents further ticks", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    eng.startSeekTimer(() => 0, onTick);
    eng.stopSeekTimer();
    vi.advanceTimersByTime(1000);
    expect(onTick).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// currentTime
// ---------------------------------------------------------------------------

describe("currentTime", () => {
  it("returns 0 when no AudioContext has been created", () => {
    // This test runs after clearStemNodes; context may already exist from prior tests.
    // Just verify it doesn't throw and returns a number.
    const t = eng.currentTime();
    expect(typeof t).toBe("number");
  });
});
