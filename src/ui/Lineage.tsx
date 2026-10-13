import { RANK_SYMBOL } from "../domain/compatibility";
import type { GameData } from "../domain/gameData";
import { nodeContribution, type NodeContribution } from "../domain/nodes";
import type { LineageEvaluation } from "../domain/scoring";
import { sparkColor } from "../domain/sparks";
import type { Card, LineageMember, ScoreWeights } from "../domain/types";
import { AptBadge, Avatar, QualityTag, SparkChip, Stars } from "./common";

interface Props {
  data: GameData;
  target: Card;
  ev: LineageEvaluation;
  weights: ScoreWeights;
  focus: { surface: string; distance: string; style: string };
  selected: string | null;
  onSelect: (slot: string) => void;
}

export function LineageTree({ data, target, ev, weights, focus, selected, onSelect }: Props) {
  const node = (slot: string) => nodeContribution(ev, slot, weights);
  return (
    <div className="tree">
      <div className="tree-row">
        <TargetNode data={data} target={target} focus={focus} selected={selected === "target"} onClick={() => onSelect("target")} />
      </div>
      <div className="tree-row two">
        {(["p1", "p2"] as const).map((slot, i) => (
          <MemberNode
            key={slot}
            data={data}
            c={node(slot)}
            focus={focus}
            compat={ev.compat.parents[i]}
            selected={selected === slot}
            onClick={() => onSelect(slot)}
          />
        ))}
      </div>
      <div className="tree-row four">
        {(["p1g1", "p1g2", "p2g1", "p2g2"] as const).map((slot) => (
          <MemberNode key={slot} data={data} c={node(slot)} focus={focus} selected={selected === slot} onClick={() => onSelect(slot)} small />
        ))}
      </div>
    </div>
  );
}

function TargetNode({ data, target, focus, selected, onClick }: { data: GameData; target: Card; focus: Props["focus"]; selected: boolean; onClick: () => void }) {
  const unique = target.uniqueSkillId ? data.skills.get(target.uniqueSkillId) : undefined;
  return (
    <button className={`node node-target ${selected ? "sel" : ""}`} onClick={onClick}>
      <div className="node-head">
        <Avatar data={data} charaId={target.charaId} />
        <div>
          <div className="node-role">Trainee</div>
          <div className="node-name">{target.name}</div>
          <div className="node-title">{target.title}</div>
        </div>
      </div>
      <div className="node-apts">
        <AptBadge label="Surf" value={target.aptitudes[focus.surface as keyof Card["aptitudes"]]} highlight />
        <AptBadge label="Dist" value={target.aptitudes[focus.distance as keyof Card["aptitudes"]]} highlight />
        <AptBadge label="Style" value={target.aptitudes[focus.style as keyof Card["aptitudes"]]} highlight />
      </div>
      {unique && <div className="node-unique" title={unique.desc}>✦ {unique.name}</div>}
    </button>
  );
}

function memberSparks(data: GameData, m: LineageMember) {
  return m.factorIds.map((id) => data.factors.get(id)).filter((f): f is NonNullable<typeof f> => !!f);
}

function MemberNode({
  data, c, focus, compat, selected, onClick, small,
}: {
  data: GameData;
  c: NodeContribution | null;
  focus: Props["focus"];
  compat?: { total: number; rank: number };
  selected: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  if (!c) {
    return (
      <div className="node node-missing">
        <div className="node-role">Grandparent</div>
        <p className="muted">Not recorded in the export.</p>
      </div>
    );
  }
  const m = c.member;
  const card = data.cards.get(m.cardId);
  const sparks = memberSparks(data, m);
  const colored = sparks.filter((f) => sparkColor(f) !== "white");
  const vet = "aptitudes" in m ? (m as { aptitudes: Card["aptitudes"] }) : null;
  const apts = vet?.aptitudes ?? card?.aptitudes;
  return (
    <button className={`node ${small ? "node-small" : ""} ${selected ? "sel" : ""}`} onClick={onClick}>
      <div className="node-head">
        <Avatar data={data} charaId={m.charaId} size={small ? 34 : 44} />
        <div className="node-id">
          <div className="node-role">
            {c.role === "parent" ? "Parent" : "Grandparent"}
            {compat && <span className={`compat r${compat.rank}`} title={`Compatibility ${compat.total} (approximation)`}>{RANK_SYMBOL[compat.rank]} {compat.total}</span>}
          </div>
          <div className="node-name">{data.charaName(m.charaId)}</div>
          {!small && <div className="node-title">{card?.title ?? `Card ${m.cardId}`}</div>}
        </div>
        <QualityTag q={c.quality} />
      </div>
      {apts && !small && (
        <div className="node-apts">
          <AptBadge label="Surf" value={apts[focus.surface as keyof Card["aptitudes"]]} />
          <AptBadge label="Dist" value={apts[focus.distance as keyof Card["aptitudes"]]} />
          <AptBadge label="Style" value={apts[focus.style as keyof Card["aptitudes"]]} />
        </div>
      )}
      <div className="node-sparks">
        {colored.map((f) => (
          <SparkChip key={f.id} color={sparkColor(f)} title={f.name}>
            <span className="chip-name">{f.name}</span> <Stars n={f.stars} />
          </SparkChip>
        ))}
      </div>
      <div className="node-foot">
        <span title="Skill sparks that can apply to this race">{c.relevantSkills.length} usable skill sparks</span>
        {c.ruledOutSkills.length > 0 && <span className="muted"> · {c.ruledOutSkills.length} ruled out</span>}
      </div>
    </button>
  );
}
