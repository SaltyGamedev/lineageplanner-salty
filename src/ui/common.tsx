import { useEffect, useState, type ReactNode } from "react";
import type { GameData } from "../domain/gameData";
import { GRADE_LETTER } from "../domain/goals";
import { TIERS } from "../domain/tiers";

/** Card portrait, self-hosted in public/img/cards (scripts/ingest/fetch_images.py). Falls back to initials. */
export function Portrait({ data, cardId, size = 44, title }: { data: GameData; cardId: number | null; size?: number; title?: string }) {
  const [failed, setFailed] = useState(false);
  const card = cardId != null ? data.cards.get(cardId) : undefined;
  const chara = card ? data.charas.get(card.charaId) : undefined;
  const name = title ?? chara?.name ?? "?";
  useEffect(() => setFailed(false), [cardId]);
  if (card && !failed) {
    return (
      <img
        className="portrait"
        src={`${import.meta.env.BASE_URL}img/cards/${card.id}.png`}
        width={size}
        height={size}
        alt=""
        title={name}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  const initials = name.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className="portrait initials" title={name} style={{ width: size, height: size, fontSize: size * 0.36, background: chara?.color ?? "var(--surface-3)" }}>
      {initials}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * The career rating badge (single_mode_rank id): G … SS+, then UG, UG1–UG9,
 * UF, UF1–UF9 and so on up to US9.
 */
export function rankLabel(rank: number): string {
  const low = ["G", "G+", "F", "F+", "E", "E+", "D", "D+", "C", "C+", "B", "B+", "A", "A+", "S", "S+", "SS", "SS+"];
  if (rank >= 1 && rank <= low.length) return low[rank - 1];
  const i = rank - 19;
  const letter = "GFEDCBAS"[Math.floor(i / 10)];
  return letter ? `U${letter}${i % 10 || ""}` : "?";
}

export function Rating({ rank }: { rank?: number }) {
  if (rank == null || rank < 1) return null;
  const label = rankLabel(rank);
  const tier = rank >= 19 ? "u" : rank >= 15 ? "s" : rank >= 13 ? "a" : "low";
  return <span className={`rating rating-${tier}`} title={`Rating ${label}`}>{label}</span>;
}

export function Stars({ n }: { n: number }) {
  return <span className="stars">{"★".repeat(Math.max(0, n))}</span>;
}

export function Grade({ value }: { value: number }) {
  const g = GRADE_LETTER[value] ?? "?";
  return <span className={`grade grade-${g}`}>{g}</span>;
}

export function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return <span className={`tier tier-${tier.replace(".", "_")}`} title={TIERS.find((t) => t.tier === tier)?.label}>{tier}</span>;
}

export const pct = (x: number) => (x >= 0.995 && x < 1 ? ">99%" : `${Math.round(x * 100)}%`);

/** Percentage that stays readable for tiny chances (combined odds of many goals). */
export const pctFine = (x: number) => {
  const v = x * 100;
  if (v <= 0) return "0%";
  if (v < 0.1) return "<0.1%";
  return v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`;
};

export function Chance({ value }: { value: number | null }) {
  if (value == null) return <span className="chance muted">–</span>;
  const cls = value >= 0.6 ? "hi" : value >= 0.3 ? "mid" : value > 0 ? "lo" : "zero";
  return <span className={`chance chance-${cls}`}>{pct(value)}</span>;
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
