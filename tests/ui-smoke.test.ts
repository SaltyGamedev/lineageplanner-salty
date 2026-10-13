// Renders every view with real game data and the sample roster to catch
// runtime errors in the UI layer (no DOM needed: server rendering).
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_WEIGHTS, targetContext } from "../src/domain/config";
import { NO_CONSTRAINTS, optimize } from "../src/domain/optimizer";
import { SLOTS } from "../src/domain/nodes";
import type { PlannerConfig } from "../src/domain/types";
import { Rankings, ScoreBreakdown, SkillTable } from "../src/ui/Breakdown";
import { CharacterBrowser, SkillBrowser, VeteranBrowser } from "../src/ui/Browsers";
import { ConfigPanel } from "../src/ui/ConfigPanel";
import { DetailDrawer } from "../src/ui/DetailDrawer";
import { LineageTree } from "../src/ui/Lineage";
import { PlansView } from "../src/ui/Plans";
import { TierListView } from "../src/ui/TierList";
import { realData, sampleVeterans } from "./helpers";

const cfg: PlannerConfig = { ...DEFAULT_CONFIG, targetCardId: 100101, style: "sashi", distance: "middle", surface: "turf" };
const noop = () => {};

describe("UI smoke render", () => {
  const data = realData();
  const veterans = sampleVeterans();
  const res = optimize(data, veterans, cfg, DEFAULT_WEIGHTS);
  const ev = res.ranked[0];
  const focus = { surface: "turf", distance: "middle", style: "sashi" };

  it("renders planner pieces", () => {
    const html = [
      renderToString(h(ConfigPanel, { data, config: cfg, onConfig: noop, weights: DEFAULT_WEIGHTS, onWeights: noop, onResetWeights: noop })),
      renderToString(h(LineageTree, { data, target: res.context.target, ev, weights: DEFAULT_WEIGHTS, focus, selected: "p1", onSelect: noop })),
      renderToString(h(ScoreBreakdown, { ev })),
      renderToString(h(SkillTable, { data, ev })),
      renderToString(h(Rankings, { data, ranked: res.ranked, stats: res.stats, current: ev, onPick: noop })),
    ].join("");
    expect(html).toContain(data.charaName(ev.p1.charaId));
  });

  it("renders the drawer for every slot", () => {
    for (const slot of ["target", ...SLOTS]) {
      const html = renderToString(
        h(DetailDrawer, { data, sc: res.context, ev, slot, veterans, constraints: NO_CONSTRAINTS, onConstraints: noop, onPair: noop, onClose: noop }),
      );
      expect(html.length).toBeGreaterThan(100);
    }
  });

  it("renders browsers and plans", () => {
    renderToString(h(VeteranBrowser, { data, veterans, config: cfg, constraints: NO_CONSTRAINTS, onConstraints: noop }));
    renderToString(h(SkillBrowser, { data, veterans, ctx: targetContext(cfg, data), style: cfg.style }));
    for (const style of ["nige", "senko", "sashi", "oikomi"] as const) {
      const tl = renderToString(h(TierListView, { data, veterans, style, ctx: targetContext(cfg, data) }));
      expect(tl).toContain("Tier 0");
    }
    renderToString(h(CharacterBrowser, { data, veterans, config: cfg, constraints: NO_CONSTRAINTS, onConstraints: noop, onTarget: noop }));
    const plan = {
      id: "p", name: "Plan", savedAt: "2026-10-14T00:00:00Z", config: cfg, weights: DEFAULT_WEIGHTS, constraints: NO_CONSTRAINTS,
      pair: [ev.p1.trainedId, ev.p2.trainedId] as [number, number], scoreAtSave: ev.total, dataVersion: "x",
    };
    const html = renderToString(h(PlansView, { data, veterans, plans: [plan, { ...plan, id: "q", pair: [1, 2] }], onPlans: noop, onOpen: noop }));
    expect(html).toContain("not in the imported roster");
  });
});
