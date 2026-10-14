// Renders every view and pop-up with real game data and the sample roster.
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, targetContext } from "../src/domain/config";
import { createPlanContext } from "../src/domain/goals";
import type { Goal, PlannerConfig } from "../src/domain/types";
import { FriendsPicker, GoalPicker, RacePicker, TraineePicker, VeteranPicker } from "../src/ui/pickers";
import { Guide } from "../src/ui/Guide";
import { Loop, SetupDetail } from "../src/ui/Loop";
import { optimizeLoop } from "../src/domain/loop";
import { Planner } from "../src/ui/Planner";
import { Roster } from "../src/ui/Roster";
import { TierListView } from "../src/ui/TierList";
import { realData, sampleVeterans } from "./helpers";

const noop = () => {};
const cfg: PlannerConfig = { ...DEFAULT_CONFIG, targetCardId: 100101, style: "sashi" };
const goals: Goal[] = [
  { kind: "skill", groupId: 20159, priority: 1, sparkTier: "white" },
  { kind: "aptitude", key: "long", grade: 8, priority: 3 },
];

describe("UI smoke", () => {
  const data = realData();
  const vets = sampleVeterans();

  it("renders the planner with goals and filters", () => {
    const html = renderToString(
      h(Planner, {
        data, own: vets, rentals: [], config: cfg, onConfig: noop, goals, onGoals: noop,
        filters: [{ color: "blue", groupId: 1, minStars: 1 }], onFilters: noop, excluded: [],
        apiKey: "", onApiKey: noop, onLookup: async () => {}, onRemoveRental: noop,
      }),
    );
    expect(html).toContain("Inherit");
    expect(html).toContain("aria-sort"); // sortable headers
    expect(html).toContain("prio-btn"); // priority lives in the list
    expect(html).toContain("Best pairs");
  });

  it("renders the planner without a trainee", () => {
    const html = renderToString(
      h(Planner, {
        data, own: vets, rentals: [], config: DEFAULT_CONFIG, onConfig: noop, goals: [], onGoals: noop, filters: [], onFilters: noop,
        excluded: [], apiKey: "", onApiKey: noop, onLookup: async () => {}, onRemoveRental: noop,
      }),
    );
    expect(html).toContain("Choose a trainee");
  });

  it("renders every picker", () => {
    renderToString(h(TraineePicker, { data, value: 100101, onPick: noop, onClose: noop }));
    const cm = data.extras.championsMeetings[0];
    renderToString(h(RacePicker, { data, config: { ...cfg, cmId: cm.id }, onChange: noop, onClose: noop }));
    const ctx = targetContext(cfg, data);
    renderToString(h(GoalPicker, { data, pool: vets, style: "sashi", ctx, traineeApt: data.cards.get(100101)!.aptitudes, goals, filters: [], onGoals: noop, onFilters: noop, onClose: noop }));
    const pc = createPlanContext(data, cfg, goals, []);
    renderToString(h(VeteranPicker, { data, pc, fixed: vets[1], candidates: vets, excluded: [], current: vets[2], onPick: noop, onClose: noop }));
    renderToString(h(FriendsPicker, { data, rentals: [], apiKey: "", onApiKey: noop, onLookup: async () => {}, onRemove: noop, onClose: noop }));
  });

  it("renders the loop view and a setup with its race plan", () => {
    const html = renderToString(
      h(Loop, {
        data, own: vets, rentals: [], config: cfg, onConfig: noop, goals, onGoals: noop, filters: [], onFilters: noop,
        excluded: [], loopCards: [100101, 100601], onLoopCards: noop,
      }),
    );
    expect(html).toContain("Loop umas");
    expect(html).toContain("career goals");
    const res = optimizeLoop(data, [100101, 100601], vets, [], cfg, goals, { excluded: [] }, { limit: 3 });
    const detail = renderToString(h(SetupDetail, { data, s: res.setups[0] }));
    expect(detail).toContain("Race plan");
    expect(detail).toContain("Junior");
  });

  it("renders the guide", () => {
    const html = renderToString(h(Guide, { onClose: noop }));
    expect(html).toContain("What this does");
    expect(html.match(/role="tab"/g)).toHaveLength(9); // one dot per step
  });

  it("renders the tier list and roster", () => {
    for (const style of ["nige", "senko", "sashi", "oikomi"] as const) {
      expect(renderToString(h(TierListView, { data, pool: vets, style, goals, onGoals: noop }))).toContain("Tier 0");
    }
    renderToString(h(Roster, { data, own: vets, rentals: [], excluded: [], onExcluded: noop }));
  });
});
