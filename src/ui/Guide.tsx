import { useEffect, useState, type ReactNode } from "react";
import { Chance, Grade, Modal, Stars, TierBadge } from "./common";

interface Step {
  title: string;
  body: ReactNode;
}

const STEPS: Step[] = [
  {
    title: "What this does",
    body: (
      <>
        <p>
          Pick a trainee, a race and what you want it to inherit. The planner scores <b>every pair</b> of your veterans
          (plus a friend's rental) and shows the best one.
        </p>
        <p>
          Each veteran comes with its two parents, so you pick <b>two veterans</b> and get all six horses of the lineage.
          Your roster is read from an UmaExtractor export and stays in your browser.
        </p>
        <p className="muted small">Chances are approximations from the community model, not exact game numbers.</p>
      </>
    ),
  },
  {
    title: "1 · Trainee, race and style",
    body: (
      <>
        <p>Click the <b>Trainee</b> card to pick who you're training. Click the <b>Race</b> card for a Champions Meeting or a course.</p>
        <ul>
          <li>A Champions Meeting fills in track, distance, season, weather and ground for you.</li>
          <li>The line under the race is the course: blue = corners, pink = elevation.</li>
          <li><b>Style</b> is the running style you'll use. It decides which style skills fit.</li>
        </ul>
      </>
    ),
  },
  {
    title: "2 · Rentals",
    body: (
      <>
        <p>
          The <b>Rental</b> switch lets one of a friend's umas fill a parent slot. You can use <b>one rental per career</b>,
          and the game limits how many you can use per day.
        </p>
        <ul>
          <li>Turn it off to plan a run where you have no rental available.</li>
          <li>Click <b>friends</b> to see the rentals found in your export. Rentals show a <span className="badge rental">rental</span> badge.</li>
          <li>A rental is the version you borrowed before. Friends may have changed it since.</li>
        </ul>
      </>
    ),
  },
  {
    title: "3 · Goals",
    body: (
      <>
        <p>Press <b>+ Goal</b> to choose what the trainee should inherit:</p>
        <ul>
          <li><b>Skills</b> and <b>Race sparks</b> are your goals: they get an Inherit % and Spark % and the planner ranks pairs by them.</li>
          <li><b>Aptitude</b>: for example Long → S. Pink sparks raise the starting grade (up to A); pink procs during the run add more. Its chance is shown as a range, because how much a proc adds is hidden.</li>
          <li><b>Spark filters</b>: a minimum ★ for blue, pink or green sparks (for example dirt ★ to keep a loop's affinity up). Pairs below it are dropped.</li>
          <li>Aptitude targets and spark filters show in their own <b>Sparks</b> box under the goal table, not as goals. Aptitude targets rank first.</li>
        </ul>
        <p>
          Skills show a tier badge <TierBadge tier="T1" /> from the community list and "race ✓" if they fit your race.
          Nothing in the list is required: start with a few goals.
        </p>
      </>
    ),
  },
  {
    title: "4 · The lineage tree",
    body: (
      <>
        <p>The top row is your trainee, then the two parents, then their four grandparents.</p>
        <ul>
          <li>The number on each horse is its <b>affinity</b> with the trainee: more affinity, higher spark chances. A parent shows its own part (like uma.guide); hover it to see the full value its sparks roll at.</li>
          <li>The first chips are the horse's blue, pink and green sparks; the chips below them are the sparks that match your goals.</li>
          <li>Goal sparks look like <span className="mini chip-white">Uma Stan <Stars n={2} /></span></li>
          <li><b>Change</b> on a parent lets you pick another veteran to pair with the other parent.</li>
          <li>A grandparent can't be changed alone: it belongs to its parent. Each G1 it shares with that parent adds 3 affinity.</li>
          <li>Click "23 G1 · 23 wins" on any horse to see its wins on the race calendar. G1s it shares with the other parent (for a grandparent: with its parent) are outlined.</li>
        </ul>
      </>
    ),
  },
  {
    title: "5 · The goal table",
    body: (
      <>
        <ul>
          <li>
            <b>Inherit</b> <Chance value={0.61} />: the chance your trainee gets this over its two inspirations.
            Green is good, amber is okay, red is low.
          </li>
          <li>
            <b>Spark</b> <Chance value={0.32} />: the chance your trainee generates this spark itself, if it learns the
            skill. The ○/◎/G button picks which version it buys; it only changes this number.
          </li>
          <li><b>★</b>: the portraits show which horses carry it and with how many stars.</li>
          <li><b>!</b> marks a priority goal: pairs that pass on your ! goals come first (the best-pairs list gets a ! column). <b>✕</b> removes it.</li>
          <li>Click a column header to sort. Click again to reverse, once more to reset.</li>
          <li>Aptitude rows show the grade change, for example <Grade value={7} />→<Grade value={7} /> at start.</li>
        </ul>
      </>
    ),
  },
  {
    title: "6 · Best pairs",
    body: (
      <>
        <p>
          The list above the lineage ranks every valid pair (click its title to fold it away). Click a pair to see it in the tree. Choose the order above it:
          <b> Most goals</b>, <b>All goals</b> or <b>Affinity</b>. The summary above the tree shows:
        </p>
        <ul>
          <li><b>All inherited</b>: the chance every goal is inherited.</li>
          <li><b>All sparks</b>: the chance your trainee also generates every goal's own spark (goals that have a Spark %).</li>
          <li><b>Expected</b>: goals passed on on average.</li>
        </ul>
        <ul>
          <li><b>Hits</b>: how many of your goals the pair is expected to pass on, for example 5.1/8. Pairs are ordered by it, after your <b>!</b> goals.</li>
          <li><b>All</b>: the chance that <i>every</i> goal is inherited. With many goals this is small, even for the best pair.</li>
          <li><b>Affinity</b>: the lineage total, with the ◎ ○ △ rank. It breaks ties and drives spark chances.</li>
          <li>Without goals, pairs are simply ordered by affinity.</li>
        </ul>
      </>
    ),
  },
  {
    title: "7 · Loop",
    body: (
      <>
        <p>The <b>Loop</b> tab plans your next parent run so your goal skills never drop out of the loop.</p>
        <ul>
          <li><b>Add umas</b> you'd like to keep training as parents. Each card shows her aptitudes, unique skill and the tier-list skills she can learn herself.</li>
          <li>Your skill <b>goals</b> are shared with the Planner. Pick how much to race, then <b>Find best loop</b>.</li>
          <li>Each setup is an uma to train and her two parents. <b>Both</b>: goals both parents carry. <b>Loop</b>: the chance every goal ends up in her and both parents. <b>Next</b>: the affinity she brings to your next loop uma.</li>
          <li>The <b>race plan</b> keeps her career goals and adds the G1s her parents won (+3 affinity each), using Independent Training win chances. Orange % means she has raced 3+ times in a row.</li>
          <li><b>Affinity</b> ranking favours parents whose pink sparks lift her dirt or distance aptitude; each setup says what Dirt A (or a distance) would add.</li>
          <li><b>Fixed 4-uma loop</b>: the best four of your loop umas to train in rotation with one shared race plan, so every horse in every lineage shares the same G1s. Unlike <b>Find best loop</b> (your next run only), it plans the rotation for good, and suggests the best run to start it with the veterans you have now.</li>
        </ul>
      </>
    ),
  },
  {
    title: "8 · Tier list and Roster",
    body: (
      <>
        <ul>
          <li><b>Tier list</b>: the community's skill priorities for each running style. Click a skill to make it a goal.</li>
          <li><b>Roster</b>: everything you imported. <b>Exclude</b> veterans you don't want used (for example ones you're saving).</li>
          <li><b>Re-import</b> after your roster changes. The file is read in your browser and never uploaded.</li>
        </ul>
        <p className="muted small">Race details and portraits come from GameTora, odds from uma.guide.</p>
      </>
    ),
  },
];

export function Guide({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === STEPS.length - 1;
  const step = STEPS[i];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(STEPS.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Modal title="Guide" onClose={onClose}>
      <div className="guide">
        <h3 className="guide-title">{step.title}</h3>
        <div className="guide-body">{step.body}</div>
        <div className="guide-dots" role="tablist" aria-label="Guide steps">
          {STEPS.map((s, n) => (
            <button key={s.title} className={`dot-btn ${n === i ? "on" : ""}`} onClick={() => setI(n)} aria-label={`Step ${n + 1}: ${s.title}`} aria-selected={n === i} role="tab" />
          ))}
        </div>
        <div className="guide-nav">
          <button onClick={() => setI(i - 1)} disabled={i === 0}>Back</button>
          <span className="muted small">{i + 1} / {STEPS.length}</span>
          {last ? <button className="primary" onClick={onClose}>Done</button> : <button className="primary" onClick={() => setI(i + 1)}>Next</button>}
        </div>
      </div>
    </Modal>
  );
}
