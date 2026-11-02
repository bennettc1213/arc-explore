import type { ReactNode } from "react";

import type { PortalArtId } from "@/lib/portal/destinations";

/**
 * One illustration per portal box.
 *
 * Drawn, not photographed, and for the reason the design system gives: a
 * placeholder photo is a claim about the product that nobody checked. These are
 * diagrams of what each tool does, built from the same pieces as the rest of
 * the interface — hairlines, near-black surfaces, pixel squares, and the one
 * accent at its three strengths.
 *
 * NO COLOURS HERE. Every shape takes a `pa-*` class and `portal.css` maps the
 * class to a token (`--surface`, `--line-strong`, `--accent` …), so re-theming
 * the accent re-themes the art, and there is no gradient `id` to collide when
 * two copies of one illustration share a page.
 *
 * NO RANDOMNESS. The grids below are literal digit strings. A `Math.random()`
 * here would render differently on the server and in the browser and trip a
 * hydration mismatch on every load.
 *
 * Decorative: the tile's own title is the accessible name, so the SVG is
 * `aria-hidden`. `.pa-float` groups lift a few pixels on hover, in steps — the
 * mechanical, un-eased motion the rest of the system uses for state changes.
 */

function Art({ children }: { children: ReactNode }) {
  return (
    <svg
      className="pa"
      viewBox="0 0 240 150"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const Baseline = () => <path className="pa-ln" d="M22 128H218" />;

function Merit() {
  return (
    <Art>
      <Baseline />
      <g className="pa-float">
        <rect className="pa-sf" x="34" y="102" width="34" height="26" rx="3" />
        <rect className="pa-sf" x="76" y="82" width="34" height="46" rx="3" />
        <rect className="pa-sf" x="118" y="60" width="34" height="68" rx="3" />
        <rect className="pa-acd" x="160" y="40" width="34" height="88" rx="3" />
        <rect className="pa-mt" x="42" y="110" width="18" height="3" rx="1.5" />
        <rect className="pa-mt" x="84" y="90" width="18" height="3" rx="1.5" />
        <rect className="pa-mt" x="126" y="68" width="18" height="3" rx="1.5" />
        <rect className="pa-acl" x="168" y="48" width="18" height="3" rx="1.5" />
      </g>
      <g className="pa-float pa-float-2">
        <path className="pa-acs" d="M171 14 167 3M183 14 187 3" />
        <circle className="pa-ac" cx="177" cy="23" r="11" />
        <path className="pa-on" d="M177 16.5l1.9 4 4.1 1.9-4.1 1.9-1.9 4.1-1.9-4.1-4.1-1.9 4.1-1.9z" />
      </g>
      <rect className="pa-acl" x="206" y="30" width="4" height="4" />
      <rect className="pa-acd" x="212" y="46" width="4" height="4" />
    </Art>
  );
}

function Scholarships() {
  return (
    <Art>
      <Baseline />
      <g className="pa-float">
        <path className="pa-sf" d="M76 66V88C76 98 93 106 110 106C127 106 144 98 144 88V66L110 80Z" />
        <path className="pa-sf2" d="M110 26 172 52 110 78 48 52Z" />
        <circle className="pa-ac" cx="110" cy="52" r="3.5" />
        <path className="pa-acs" d="M172 52V86" />
        <circle className="pa-ac" cx="172" cy="90" r="4" />
        <path className="pa-acs" d="M172 94V102" />
      </g>
      {[114, 105].map((cy) => (
        <g key={cy}>
          <path className="pa-sf" d={`M180 ${cy}v7a20 6.5 0 0 0 40 0v-7`} />
          <ellipse className="pa-sf2" cx="200" cy={cy} rx="20" ry="6.5" />
        </g>
      ))}
      <g className="pa-float pa-float-2">
        <path className="pa-sf" d="M180 96v7a20 6.5 0 0 0 40 0v-7" />
        <ellipse className="pa-acd" cx="200" cy="96" rx="20" ry="6.5" />
        <text className="pa-tx" x="200" y="99" textAnchor="middle">
          $
        </text>
      </g>
    </Art>
  );
}

function Internships() {
  return (
    <Art>
      <Baseline />
      <rect className="pa-sf" x="128" y="62" width="30" height="66" />
      <rect className="pa-sf" x="160" y="38" width="38" height="90" />
      <rect className="pa-sf" x="200" y="78" width="22" height="50" />
      {[0, 1, 2, 3].flatMap((r) =>
        [135, 146].map((x) => <rect key={`a${r}${x}`} className="pa-mt" x={x} y={72 + r * 14} width="5" height="5" />),
      )}
      {[0, 1, 2, 3, 4].flatMap((r) =>
        [167, 177, 187].map((x) => (
          <rect
            key={`b${r}${x}`}
            className={r === 2 && x === 177 ? "pa-ac" : "pa-mt"}
            x={x}
            y={48 + r * 14}
            width="5"
            height="5"
          />
        )),
      )}
      {[0, 1, 2].flatMap((r) =>
        [205, 214].map((x) => <rect key={`c${r}${x}`} className="pa-mt" x={x} y={88 + r * 14} width="5" height="5" />),
      )}
      <g className="pa-float">
        <path className="pa-ln2" d="M58 0 76 34M94 0 76 34" />
        <rect className="pa-sf2" x="44" y="34" width="64" height="88" rx="7" />
        <rect className="pa-sf" x="66" y="40" width="20" height="4" rx="2" />
        <circle className="pa-acd" cx="76" cy="66" r="12" />
        <rect className="pa-mt2" x="56" y="86" width="40" height="5" rx="2.5" />
        <rect className="pa-mt" x="56" y="96" width="28" height="4" rx="2" />
        <rect className="pa-ac" x="56" y="106" width="20" height="5" rx="2.5" />
      </g>
    </Art>
  );
}

function Tracker() {
  return (
    <Art>
      {[24, 92, 160].map((x) => (
        <g key={x}>
          <rect className="pa-sf" x={x} y="20" width="56" height="110" rx="6" />
          <rect className="pa-mt2" x={x + 8} y="29" width="22" height="4" rx="2" />
          <rect className="pa-mt" x={x + 42} y="29" width="6" height="4" rx="2" />
        </g>
      ))}
      {[
        [32, 42],
        [32, 68],
        [100, 42],
        [168, 42],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect className="pa-sf2" x={x} y={y} width="40" height="20" rx="3" />
          <rect className="pa-mt2" x={x + 6} y={y + 6} width="22" height="3" rx="1.5" />
          <rect className="pa-mt" x={x + 6} y={y + 12} width="14" height="3" rx="1.5" />
        </g>
      ))}
      <rect className="pa-ln pa-dash" x="168" y="68" width="40" height="20" rx="3" />
      <path className="pa-acs pa-dash" d="M76 78H96" />
      <g className="pa-float">
        <rect className="pa-acd" x="100" y="68" width="40" height="20" rx="3" />
        <rect className="pa-acl" x="106" y="74" width="22" height="3" rx="1.5" />
        <rect className="pa-ac" x="106" y="80" width="14" height="3" rx="1.5" />
      </g>
    </Art>
  );
}

function Resume() {
  return (
    <Art>
      <g className="pa-float">
        <rect className="pa-sf2" x="56" y="10" width="92" height="130" rx="6" />
        <circle className="pa-mt2" cx="74" cy="31" r="8" />
        <rect className="pa-mt2" x="88" y="25" width="44" height="5" rx="2.5" />
        <rect className="pa-mt" x="88" y="35" width="30" height="4" rx="2" />
        <path className="pa-ln" d="M66 50H138" />
        <rect className="pa-ac" x="66" y="58" width="22" height="4" rx="2" />
        {[
          [70, 56],
          [80, 62],
          [90, 46],
        ].map(([y, w]) => (
          <g key={y}>
            <circle className="pa-mt2" cx="68" cy={y + 2} r="1.6" />
            <rect className="pa-mt" x="74" y={y} width={w} height="4" rx="2" />
          </g>
        ))}
        <rect className="pa-mt2" x="66" y="104" width="22" height="4" rx="2" />
        <rect className="pa-mt" x="66" y="114" width="60" height="4" rx="2" />
        <rect className="pa-mt" x="66" y="124" width="42" height="4" rx="2" />
      </g>
      <circle className="pa-sf" cx="172" cy="42" r="22" />
      <circle className="pa-acr" cx="172" cy="42" r="15" transform="rotate(-90 172 42)" />
      <path className="pa-acs" d="M165 42l5 5 9-10" />
      <rect className="pa-acd" x="158" y="84" width="48" height="13" rx="6.5" />
      <rect className="pa-acl" x="168" y="89" width="28" height="3" rx="1.5" />
      <rect className="pa-sf" x="158" y="101" width="48" height="13" rx="6.5" />
      <rect className="pa-mt2" x="168" y="106" width="22" height="3" rx="1.5" />
      <rect className="pa-sf" x="158" y="118" width="48" height="13" rx="6.5" />
      <rect className="pa-mt2" x="168" y="123" width="30" height="3" rx="1.5" />
    </Art>
  );
}

function Extension() {
  return (
    <Art>
      <rect className="pa-sf" x="30" y="16" width="148" height="118" rx="7" />
      <rect className="pa-mt2" x="44" y="26" width="52" height="5" rx="2.5" />
      <rect className="pa-sf2" x="44" y="44" width="120" height="17" rx="3" />
      <rect className="pa-mt2" x="50" y="50" width="58" height="5" rx="2.5" />
      <rect className="pa-sf2" x="44" y="68" width="120" height="17" rx="3" />
      <rect className="pa-mt2" x="50" y="74" width="74" height="5" rx="2.5" />
      <rect className="pa-acd" x="44" y="92" width="120" height="17" rx="3" />
      <rect className="pa-mt2" x="50" y="98" width="28" height="5" rx="2.5" />
      <rect className="pa-ac" x="82" y="96" width="2" height="9" />
      <rect className="pa-ln pa-dash" x="44" y="115" width="52" height="14" rx="3" />
      <rect className="pa-mt" x="54" y="120" width="32" height="4" rx="2" />
      <path className="pa-acs pa-dash" d="M206 68V101H168" />
      <g className="pa-float">
        <path
          className="pa-acs"
          transform="translate(184 20) scale(1.9)"
          d="M9 3H4v6a3 3 0 1 1 0 6v6h6a3 3 0 1 1 6 0h5v-6a3 3 0 1 1 0-6V3h-6a3 3 0 1 1-6 0Z"
        />
      </g>
    </Art>
  );
}

/* Literal digit strings: 0 empty, 1-2 some activity, 3 a day worth noticing. */
const GITHUB_GRID = [
  "00120310210001",
  "01231203100210",
  "12130312301032",
  "01221031201121",
  "00110200110310",
];
const GITHUB_CELL = ["pa-c0", "pa-mt", "pa-mt2", "pa-ac"];

function Github() {
  return (
    <Art>
      <g className="pa-float">
        {GITHUB_GRID.flatMap((row, r) =>
          [...row].map((level, c) => (
            <rect
              key={`${r}-${c}`}
              className={GITHUB_CELL[Number(level)]}
              x={30 + c * 13}
              y={20 + r * 13}
              width="10"
              height="10"
              rx="2"
            />
          )),
        )}
      </g>
      <path className="pa-ln2" d="M30 118H210" />
      <path className="pa-acs" d="M90 118C100 102 110 102 120 102H150C160 102 165 110 170 118" />
      {[50, 90, 130, 170, 210].map((x) => (
        <circle key={x} className="pa-sf2" cx={x} cy="118" r="4" />
      ))}
      <circle className="pa-ac" cx="135" cy="102" r="4" />
    </Art>
  );
}

function Linkedin() {
  return (
    <Art>
      <rect className="pa-sf" x="44" y="8" width="152" height="18" rx="9" />
      <circle className="pa-acs" cx="56" cy="17" r="3.5" />
      <rect className="pa-mt2" x="66" y="15" width="40" height="4" rx="2" />
      <rect className="pa-acd" x="112" y="11" width="38" height="12" rx="3" />
      <rect className="pa-ac" x="118" y="15" width="26" height="4" rx="2" />
      <g className="pa-float">
        <rect className="pa-sf2" x="44" y="36" width="152" height="104" rx="7" />
        <path className="pa-c0" d="M44 43a7 7 0 0 1 7-7h138a7 7 0 0 1 7 7v22H44z" />
        <circle className="pa-sf" cx="76" cy="68" r="15" />
        <circle className="pa-mt2" cx="76" cy="64" r="5" />
        <path className="pa-mt2" d="M67 79a9 8 0 0 1 18 0z" />
        <rect className="pa-mt2" x="58" y="92" width="64" height="6" rx="3" />
        <rect className="pa-ac" x="58" y="104" width="22" height="4" rx="2" />
        <rect className="pa-mt" x="84" y="104" width="70" height="4" rx="2" />
        <rect className="pa-mt" x="58" y="114" width="84" height="4" rx="2" />
        <rect className="pa-sf" x="58" y="124" width="28" height="10" rx="5" />
        <rect className="pa-sf" x="90" y="124" width="34" height="10" rx="5" />
        <rect className="pa-acd" x="128" y="124" width="24" height="10" rx="5" />
      </g>
    </Art>
  );
}

function Essay() {
  const widths = [96, 84, 92, 70, 90, 78, 88, 60, 74];
  const marked = new Map<number, [number, number]>([
    [1, [30, 28]],
    [4, [52, 34]],
    [6, [18, 40]],
  ]);
  return (
    <Art>
      <g className="pa-float">
        <rect className="pa-sf2" x="34" y="10" width="112" height="130" rx="6" />
        <rect className="pa-mt2" x="46" y="22" width="50" height="5" rx="2.5" />
        {widths.map((w, i) => {
          const y = 38 + i * 11;
          const mark = marked.get(i);
          return (
            <g key={i}>
              {mark && <rect className="pa-acd" x={46 + mark[0]} y={y - 2} width={mark[1]} height="8" rx="2" />}
              <rect className="pa-mt" x="46" y={y} width={Math.min(w, 88)} height="4" rx="2" />
            </g>
          );
        })}
      </g>
      <rect className="pa-sf" x="124" y="34" width="86" height="82" rx="7" />
      {[0, 1, 2, 3].map((i) => {
        const y = 52 + i * 18;
        return (
          <g key={i}>
            <circle className={i < 3 ? "pa-acd" : "pa-sf2"} cx="140" cy={y} r="6" />
            {i < 3 && <path className="pa-acs pa-thin" d={`M137 ${y}l2.2 2.2 3.8-4.4`} />}
            <rect className="pa-mt2" x="152" y={y - 2} width={i === 3 ? 34 : 46} height="4" rx="2" />
          </g>
        );
      })}
    </Art>
  );
}

/* Deadline days, as (row, column) on a four-week month. */
const DEADLINES = new Set(["0-3", "1-1", "1-5", "2-2", "3-4"]);

function Triage() {
  return (
    <Art>
      <rect className="pa-sf" x="40" y="14" width="160" height="124" rx="7" />
      <rect className="pa-mt2" x="52" y="24" width="40" height="5" rx="2.5" />
      <rect className="pa-mt" x="170" y="23" width="8" height="7" rx="2" />
      <rect className="pa-mt" x="182" y="23" width="8" height="7" rx="2" />
      {[0, 1, 2, 3].flatMap((r) =>
        [0, 1, 2, 3, 4, 5, 6].map((c) => (
          <rect
            key={`${r}-${c}`}
            className={DEADLINES.has(`${r}-${c}`) ? "pa-ac" : "pa-c0"}
            x={54 + c * 20}
            y={44 + r * 20}
            width="14"
            height="14"
            rx="2"
          />
        )),
      )}
      <rect className="pa-acs pa-dash" x="48" y="58" width="146" height="26" rx="5" />
      <rect className="pa-mt" x="52" y="124" width="50" height="4" rx="2" />
    </Art>
  );
}

const ART: Record<PortalArtId, () => ReactNode> = {
  merit: Merit,
  scholarships: Scholarships,
  internships: Internships,
  tracker: Tracker,
  resume: Resume,
  extension: Extension,
  github: Github,
  linkedin: Linkedin,
  essay: Essay,
  triage: Triage,
};

export function PortalArt({ id }: { id: PortalArtId }) {
  const Illustration = ART[id];
  return <Illustration />;
}
