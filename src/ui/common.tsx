import { createContext, useContext, useState, type ReactNode } from "react";
import { aptitudeLetter } from "../domain/config";
import type { GameData } from "../domain/gameData";
import type { Quality } from "../domain/nodes";
import type { Evidence } from "../domain/types";

/** Whether to load character portraits from GameTora (falls back to initials). */
export const PortraitsContext = createContext(false);

export const portraitUrl = (charaId: number) => `https://gametora.com/images/umamusume/characters/icons/chr_icon_${charaId}.png`;

export function Avatar({ data, charaId, size = 44 }: { data: GameData; charaId: number | null; size?: number }) {
  const portraits = useContext(PortraitsContext);
  const [failed, setFailed] = useState(false);
  const chara = charaId != null ? data.charas.get(charaId) : undefined;
  const name = chara?.name ?? "?";
  if (portraits && charaId != null && chara && !failed) {
    return (
      <img
        className="avatar avatar-img"
        src={portraitUrl(charaId)}
        width={size}
        height={size}
        alt=""
        title={name}
        loading="lazy"
        referrerPolicy="no-referrer"
        style={{ background: chara.color ?? "var(--surface-3)" }}
        onError={() => setFailed(true)}
      />
    );
  }
  const initials = name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.36, background: chara?.color ?? "var(--surface-3)" }}
      title={name}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function AptBadge({ value, label, highlight }: { value: number; label?: string; highlight?: boolean }) {
  const letter = aptitudeLetter(value);
  return (
    <span className={`apt apt-${letter} ${highlight ? "apt-hl" : ""}`} title={label ? `${label}: ${letter}` : letter}>
      {label && <small>{label}</small>}
      {letter}
    </span>
  );
}

export function Stars({ n }: { n: number }) {
  return <span className="stars" aria-label={`${n} stars`}>{"★".repeat(n)}</span>;
}

const EVIDENCE_TEXT: Record<Evidence, string> = {
  verified: "Read directly from game data.",
  approximation: "Game data combined by an interpretation or community formula; not confirmed from game code.",
  preference: "A weighting choice you can change in the settings.",
};

export function EvidenceTag({ evidence }: { evidence: Evidence }) {
  return (
    <span className={`evidence ev-${evidence}`} title={EVIDENCE_TEXT[evidence]}>
      {evidence}
    </span>
  );
}

export function QualityTag({ q }: { q: Quality }) {
  return <span className={`quality q-${q}`}>{q}</span>;
}

export function ScoreBar({ value, label }: { value: number | null; label?: string }) {
  return (
    <div className="scorebar" title={label}>
      <div className="scorebar-fill" style={{ width: `${value ?? 0}%` }} />
      <span>{value == null ? "n/a" : value.toFixed(0)}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function SparkChip({ color, children, title }: { color: "blue" | "pink" | "green" | "white"; children: ReactNode; title?: string }) {
  return <span className={`chip chip-${color}`} title={title}>{children}</span>;
}
