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
