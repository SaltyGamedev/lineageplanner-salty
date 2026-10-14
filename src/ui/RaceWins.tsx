// A horse's race wins on the three-year career calendar, with race banners.

import { useState } from "react";
import type { GameData } from "../domain/gameData";
import type { LineageMember, Saddle } from "../domain/types";
import { Modal, Portrait } from "./common";

export const YEARS = ["Junior", "Classic", "Senior"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GRADE: Record<number, string> = { 1: "G3", 2: "G2", 3: "G1" };

/** The race saddles a horse won (titles left out), each once. */
export function raceWins(data: GameData, m: LineageMember): Saddle[] {
  return [...new Set(m.winSaddleIds)].flatMap((id) => {
    const s = data.saddles.get(id);
    return s && s.type >= 1 && s.type <= 3 ? [s] : [];
  });
}

/**
 * Puts each win in a calendar slot ("year-month-half"). The export doesn't say
 * in which year a race was won, so races that run in several years take the
 * earliest free one: races with fewer options first, G1s before G2/G3.
 */
export function placeWins(wins: Saddle[]): Map<string, Saddle[]> {
  const at = new Map<string, Saddle[]>();
  const order = wins.filter((s) => s.years?.length).sort((a, b) => a.years!.length - b.years!.length || b.type - a.type || a.id - b.id);
  for (const s of order) {
    const keys = s.years!.map((y) => `${y}-${s.month}-${s.half}`);
    const key = keys.find((k) => !at.has(k)) ?? keys[0];
    at.set(key, [...(at.get(key) ?? []), s]);
  }
  return at;
}

export function winsLabel(data: GameData, m: LineageMember): string {
  const wins = raceWins(data, m);
  return `${wins.filter((s) => s.type === 3).length} G1 · ${wins.length} wins`;
}

/** A race banner (self-hosted), or the race name when there is none. */
export function RaceBanner({ raceId, name }: { raceId: number | null | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  return raceId != null && !failed ? (
    <img src={`${import.meta.env.BASE_URL}img/races/${raceId}.png`} alt={name} width={64} height={32} loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <span className="win-name">{name}</span>
  );
}

function Banner({ s, shared }: { s: Saddle; shared: boolean }) {
  const [failed, setFailed] = useState(false);
  const title = `${s.name} (${GRADE[s.type]})${shared ? " · shared, +3 affinity" : ""}`;
  return (
    <div className={`win ${shared ? "win-shared" : ""}`} title={title}>
      {s.raceId != null && !failed ? (
        <img src={`${import.meta.env.BASE_URL}img/races/${s.raceId}.png`} alt={s.name} width={64} height={32} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="win-name">{s.name}</span>
      )}
    </div>
  );
}

/**
 * Pop-up with the calendar. `shared` holds the G1s this horse shares with
 * `sharedWith` (each worth affinity); they get a ring.
 */
export function RaceWinsModal({
  data,
  member,
  shared = [],
  sharedWith,
  onClose,
}: {
  data: GameData;
  member: LineageMember;
  shared?: number[];
  sharedWith?: string;
  onClose: () => void;
}) {
  const wins = raceWins(data, member);
  const at = placeWins(wins);
  const unplaced = wins.filter((s) => !s.years?.length);
  const sharedSet = new Set(shared);
  return (
    <Modal title={data.charaName(member.charaId)} onClose={onClose} wide>
      <div className="wins-head">
        <Portrait data={data} cardId={member.cardId} size={40} />
        <div>
          <div>{winsLabel(data, member)}</div>
          {sharedWith && (
            <div className="muted small">
              <span className="win-key" /> {shared.length} G1 shared with {sharedWith} · +{shared.length * 3} affinity
            </div>
          )}
        </div>
      </div>
      <div className="wins-years">
        {YEARS.map((name, y) => (
          <section key={name} className="wins-year">
            <h3>{name}</h3>
            <div className="wins-grid">
              {MONTHS.flatMap((mon, mi) =>
                [1, 2].map((half) => {
                  const here = at.get(`${y + 1}-${mi + 1}-${half}`) ?? [];
                  return (
                    <div key={`${mi}-${half}`} className="wins-cell">
                      {here.map((s) => <Banner key={s.id} s={s} shared={sharedSet.has(s.id)} />)}
                      <span className="wins-date">{mon} {half === 1 ? "i" : "ii"}</span>
                    </div>
                  );
                }),
              )}
            </div>
          </section>
        ))}
      </div>
      {unplaced.length > 0 && (
        <div className="wins-other">
          <span className="muted small">Also won:</span>
          {unplaced.map((s) => <Banner key={s.id} s={s} shared={sharedSet.has(s.id)} />)}
        </div>
      )}
      <p className="muted small">The export doesn't say in which year a race was won; races held every year are placed in the earliest free year.</p>
    </Modal>
  );
}
