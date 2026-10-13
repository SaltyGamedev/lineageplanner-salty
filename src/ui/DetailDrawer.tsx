import { useMemo } from "react";
import { RANK_SYMBOL } from "../domain/compatibility";
import type { GameData } from "../domain/gameData";
import { nodeContribution, nodeMember } from "../domain/nodes";
import { alternativesForSlot, type Constraints } from "../domain/optimizer";
import type { LineageEvaluation, ScoringContext } from "../domain/scoring";
import { procChance, slotAffinities } from "../domain/inheritance";
import { STAT_LABEL, sparkColor } from "../domain/sparks";
import { FactorType, type Card, type LineageMember, type Veteran } from "../domain/types";
import { TierBadge } from "./Breakdown";
import { AptBadge, Avatar, EvidenceTag, QualityTag, SparkChip, Stars } from "./common";

interface Props {
  data: GameData;
  sc: ScoringContext;
  ev: LineageEvaluation;
  slot: string;
  veterans: Veteran[];
  constraints: Constraints;
  onConstraints: (c: Constraints) => void;
  onPair: (pair: [number, number]) => void;
  onClose: () => void;
}

const APT_ROWS: [string, (keyof Card["aptitudes"])[]][] = [
  ["Surface", ["turf", "dirt"]],
  ["Distance", ["short", "mile", "middle", "long"]],
  ["Style", ["nige", "senko", "sashi", "oikomi"]],
];
const APT_SHORT: Record<string, string> = {
  turf: "Turf", dirt: "Dirt", short: "Sprint", mile: "Mile", middle: "Medium", long: "Long",
  nige: "Front", senko: "Pace", sashi: "Late", oikomi: "End",
};

function AptTable({ apts }: { apts: Card["aptitudes"] }) {
  return (
    <div className="apt-table">
      {APT_ROWS.map(([label, keys]) => (
        <div key={label} className="apt-row">
          <span className="muted">{label}</span>
          {keys.map((k) => <AptBadge key={k} label={APT_SHORT[k]} value={apts[k]} />)}
        </div>
      ))}
    </div>
  );
}

export function DetailDrawer(props: Props) {
  const { data, sc, slot, onClose } = props;
  return (
    <aside className="drawer" aria-label="Node details">
      <div className="drawer-head">
        <h2>{slot === "target" ? "Trainee" : slot.length === 2 ? "Parent" : "Grandparent"}</h2>
        <button className="icon" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {slot === "target" ? <TargetDetail data={data} target={sc.target} /> : <MemberDetail {...props} />}
    </aside>
  );
}

function TargetDetail({ data, target }: { data: GameData; target: Card }) {
  const unique = target.uniqueSkillId ? data.skills.get(target.uniqueSkillId) : undefined;
  return (
    <div className="drawer-body">
      <div className="detail-id">
        <Avatar data={data} charaId={target.charaId} size={56} />
        <div>
          <div className="node-name">{target.name}</div>
          <div className="node-title">{target.title}</div>
        </div>
      </div>
      <h3>Aptitudes <EvidenceTag evidence="verified" /></h3>
      <AptTable apts={target.aptitudes} />
      {unique && (
        <>
          <h3>Unique skill</h3>
          <p><b>{unique.name}</b></p>
          <p className="muted">{unique.desc}</p>
        </>
      )}
      <p className="note">The trainee's own skills are not part of the lineage score; pick parents in the tree to see their contribution.</p>
    </div>
  );
}

function SparkList({ data, member }: { data: GameData; member: LineageMember }) {
  const factors = member.factorIds.map((id) => ({ id, f: data.factors.get(id) }));
  return (
    <div className="spark-list">
      {factors.map(({ id, f }) =>
        f ? (
          <SparkChip key={id} color={sparkColor(f)} title={f.name}>
            {f.name} <Stars n={f.stars} />
          </SparkChip>
        ) : (
          <SparkChip key={id} color="white" title="Not in the game data">Unknown {id}</SparkChip>
        ),
      )}
    </div>
  );
}

function MemberDetail({ data, sc, ev, slot, veterans, constraints, onConstraints, onPair }: Props) {
  const c = nodeContribution(ev, slot, sc.weights);
  const member = nodeMember(ev, slot);
  const parentIndex = slot.startsWith("p1") ? 0 : 1;
  const owner = parentIndex === 0 ? ev.p1 : ev.p2;
  const other = parentIndex === 0 ? ev.p2 : ev.p1;
  const alternatives = useMemo(
    () => alternativesForSlot(sc, veterans, other, owner, constraints, 8),
    [sc, veterans, other, owner, constraints],
  );
  if (!c || !member) return <div className="drawer-body"><p className="muted">This grandparent is not recorded in the export.</p></div>;

  const card = data.cards.get(member.cardId);
  const isParent = slot.length === 2;
  const vet = isParent ? (member as Veteran) : null;
  const locked = constraints.locked.includes(owner.trainedId);
  const excluded = constraints.excluded.includes(owner.trainedId);
  const toggleLock = () =>
    onConstraints({
      ...constraints,
      locked: locked ? constraints.locked.filter((x) => x !== owner.trainedId) : [...constraints.locked, owner.trainedId].slice(-2),
    });
  const exclude = () =>
    onConstraints({
      ...constraints,
      locked: constraints.locked.filter((x) => x !== owner.trainedId),
      excluded: excluded ? constraints.excluded.filter((x) => x !== owner.trainedId) : [...constraints.excluded, owner.trainedId],
    });
  const compat = ev.compat.parents[parentIndex];
  const affinity = slotAffinities(ev.compat)[slot] ?? 0;
  const current = ev.total;

  return (
    <div className="drawer-body">
      <div className="detail-id">
        <Avatar data={data} charaId={member.charaId} size={56} />
        <div>
          <div className="node-name">{data.charaName(member.charaId)}</div>
          <div className="node-title">{card?.title ?? `Card ${member.cardId}`}</div>
          <div className="muted small">
            {isParent ? `Veteran #${owner.trainedId}` : `Parent of ${data.charaName(owner.charaId)} (veteran #${owner.trainedId})`}
          </div>
        </div>
        <QualityTag q={c.quality} />
      </div>

      {!isParent && (
        <p className="note">
          Grandparents come with their veteran: to change this horse you replace {data.charaName(owner.charaId)} as a whole.
        </p>
      )}

      <div className="btn-row">
        <button className={locked ? "on" : ""} onClick={toggleLock} title="Keep this veteran in every ranked result (max 2)">
          {locked ? "🔒 Locked" : "Lock veteran"}
        </button>
        <button className="danger" onClick={exclude}>{excluded ? "Un-exclude" : "Exclude veteran"}</button>
      </div>

      <h3>Contribution</h3>
      <p className="muted small">
        Node rating {c.score.toFixed(0)}/100 <EvidenceTag evidence="preference" /> — usable skill sparks (by tier) 45%, needed aptitude sparks 35%, stat sparks 20%.
        {" "}Affinity of this horse: <b>{affinity}</b>, so a 3★ white spark has {Math.round(procChance(FactorType.Skill, 3, affinity) * 100)}% per inspiration.
      </p>
      <ul className="contrib">
        {c.relevantSkills.map((s) => (
          <li key={s.name}>
            <SparkChip color="white">{s.name} <Stars n={s.stars} /></SparkChip>
            <TierBadge tier={s.tier} />
            <span className={`rel rel-${s.relevance}`}>{s.relevance === "match" ? "targets this race" : "works anywhere"}</span>
            {s.cmBoost && <span className="cm-tag">CM</span>}
          </li>
        ))}
        {c.aptitudeSparks.map((a, i) => (
          <li key={`a${i}`}>
            <SparkChip color="pink">{a.label} <Stars n={a.stars} /></SparkChip>
            <span className={`rel ${a.needed ? "rel-match" : "rel-generic"}`}>{a.needed ? "trainee needs it" : "trainee already S"}</span>
          </li>
        ))}
        {c.statSparks.map((s, i) => (
          <li key={`s${i}`}>
            <SparkChip color="blue">{STAT_LABEL[s.key as keyof typeof STAT_LABEL]} <Stars n={s.stars} /></SparkChip>
          </li>
        ))}
        {c.ruledOutSkills.length > 0 && (
          <li className="muted small">Ruled out by conditions: {c.ruledOutSkills.join(", ")}</li>
        )}
      </ul>

      <h3>All sparks <EvidenceTag evidence="verified" /></h3>
      <SparkList data={data} member={member} />

      {isParent && (
        <>
          <h3>Compatibility <EvidenceTag evidence="approximation" /></h3>
          <p>
            <span className={`compat r${compat.rank}`}>{RANK_SYMBOL[compat.rank]} {compat.total}</span>
          </p>
          <table className="terms">
            <tbody>
              {compat.terms.map((t, i) => (
                <tr key={i} className={t.complete ? "" : "muted"}>
                  <td>{t.label}</td>
                  <td className="num">{t.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {vet && (
        <>
          <h3>Veteran</h3>
          <div className="stat-row">
            {(["speed", "stamina", "power", "guts", "wiz"] as const).map((k) => (
              <span key={k}><small>{STAT_LABEL[k]}</small><b>{vet.stats[k]}</b></span>
            ))}
          </div>
          <AptTable apts={vet.aptitudes} />
          <p className="muted small">
            {vet.skillIds.length} skills learned · {vet.winSaddleIds.length} wins recorded · rank score {vet.rankScore}
            {vet.useType !== 0 && " · non-standard entry (use_type " + vet.useType + ")"}
          </p>
        </>
      )}

      <h3>Why this lineage</h3>
      <ul className="reasons">{ev.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>

      <h3>Alternatives for {data.charaName(owner.charaId)}</h3>
      <p className="muted small">Keeping {data.charaName(other.charaId)} as the other parent.</p>
      {alternatives.length === 0 ? (
        <p className="muted">No other valid veteran.</p>
      ) : (
        <ul className="alts">
          {alternatives.map((alt) => {
            const v = alt.p2;
            const delta = alt.total - current;
            return (
              <li key={v.trainedId}>
                <button onClick={() => onPair(parentIndex === 0 ? [v.trainedId, other.trainedId] : [other.trainedId, v.trainedId])}>
                  <Avatar data={data} charaId={v.charaId} size={28} />
                  <span className="alt-name">
                    {data.charaName(v.charaId)}
                    <small className="muted"> {data.cards.get(v.cardId)?.title ?? ""}</small>
                  </span>
                  <span className="alt-score">{alt.total.toFixed(1)}</span>
                  <span className={`delta ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
