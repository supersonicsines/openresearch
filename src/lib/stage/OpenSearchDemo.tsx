import { useLayoutEffect, useMemo, useRef, useState } from 'react'
// Imported part by part, so that only what the demo uses is downloaded.
import type { Act } from './kit/act'
import { Collapse } from './kit/motion/Collapse'
import { Count } from './kit/motion/Count'
import { States } from './kit/motion/States'
import { Stream } from './kit/motion/Stream'
import { Avatar } from './kit/parts/Avatar'
import { Row } from './kit/parts/Row'
import { Stage } from './kit/stage'
import { Bar, Window } from './kit/window'
import './demo.css'

// A donation is made, a run is carried out in view, and its finding lands in the
// findings. The total rolls and the donor climbs the leaderboard. Figures only ever
// rise, so nothing rewinds at the seam: the next loop carries on from this one.

type Phase = 'searching' | 'writing' | 'editing'

type S = {
  dialog: boolean
  live: boolean
  phase: Phase
  words: number
  /** Re-renders after the ledger has changed. Back to 0 by the end of the loop. */
  tick: number
  /** Two rows are passing each other, so the one in front is lifted. */
  crossing: boolean
  still: boolean
}

const initial: S = { dialog: false, live: false, phase: 'searching', words: 0, tick: 0, crossing: false, still: false }
const POSTER: S = { ...initial, live: true, phase: 'editing', words: 999, tick: 1, still: true }

const RUNS = [
  {
    report:
      'Field trials in the United Kingdom report seasonal performance of around 2.5 to 3.0 in existing homes. Poor results are more often traced to installation than to outdoor temperature.',
    finding: 'Field trials report seasonal performance of around 2.5 to 3.0 in existing homes, with poor results traced mainly to installation.'
  },
  {
    report:
      'Defrost cycles reduce output near freezing, although the effect is modest in a well sized system. Larger radiators and lower flow temperatures account for most of the gain.',
    finding: 'Defrost cycles reduce output near freezing, although the effect is modest in a well sized system.'
  },
  {
    report:
      'Running costs depend mainly on the ratio of electricity to gas prices. At a seasonal performance of about 3, a saving appears once electricity costs under three times as much.',
    finding: 'Running costs depend mainly on the ratio of electricity to gas prices, with a saving once electricity costs under three times as much.'
  }
]

const ALREADY_KNOWN = [
  'Heat pumps in older homes are found to perform adequately where radiators have been enlarged and flow temperatures kept low.',
  'Solid-walled homes have higher heat losses, so larger emitters or some insulation are usually needed.',
  'Fabric improvements are the most cost-effective first step where walls are uninsulated, though they are not an absolute precondition.',
  'Time-of-use tariffs narrow the gap further where the system can pre-heat during cheaper periods.'
]

type Donor = { handle: string; amount: number }
type Note = { id: number; text: string; shown: boolean }

function makeLedger() {
  return {
    total: 48.2,
    runs: 4,
    run: 5,
    turn: 0,
    notes: [] as Note[],
    donors: [
      { handle: 'mira_kovacs', amount: 18.4 },
      { handle: 'j_whitlock', amount: 12.6 },
      { handle: 'h_ashworth', amount: 12.4 }
    ] as Donor[],
    /** The two lower donors take it in turns, each overtaking the other. */
    current: 'h_ashworth'
  }
}

type Ledger = ReturnType<typeof makeLedger>

const COST = 0.31
const money = (n: number) => `$${n.toFixed(2)}`
const ROW = { wide: 44, compact: 48 }
const REST = { wide: { x: 808, y: 118 }, compact: { x: 296, y: 98 } }

const cents = (n: number) => Math.round(n * 100) / 100

/** The run has been paid for: the figures rise, and its finding is made ready. */
function settle(ledger: Ledger) {
  ledger.total = cents(ledger.total + COST)
  ledger.runs += 1
  const donor = ledger.donors.find((d) => d.handle === ledger.current)!
  donor.amount = cents(donor.amount + COST)
  ledger.notes.unshift({ id: ledger.run, text: RUNS[ledger.turn].finding, shown: false })
}

/** The finding lands in the findings, and the oldest of those shown gives way to it. */
function land(ledger: Ledger) {
  ledger.notes[0].shown = true
  if (ledger.notes[2]) ledger.notes[2].shown = false
  ledger.notes.length = Math.min(ledger.notes.length, 3)
}

/** Out of view, the next loop's donor and report are made ready. */
function advance(ledger: Ledger) {
  ledger.run += 1
  ledger.turn = (ledger.turn + 1) % RUNS.length
  ledger.current = ledger.current === 'h_ashworth' ? 'j_whitlock' : 'h_ashworth'
}

const STATUS: Record<Phase, string> = {
  searching: 'The web is being searched.',
  writing: 'The report is being written.',
  editing: 'The findings are being updated.'
}

/** The report takes up room line by line as it is written, pushing the findings down. */
function GrowingReport({ text, count }: { text: string; count: number }) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const words = inner.current?.querySelectorAll<HTMLElement>('[data-on]')
    const last = words?.[words.length - 1]
    setHeight(last ? last.offsetTop + last.offsetHeight : 0)
  }, [text, count])
  return (
    <div className="osd-stream" style={{ height: height ? height + 10 : 0 }}>
      <div className="osd-stream-inner" ref={inner}>
        <Stream text={text} count={count} />
      </div>
    </div>
  )
}

export function OpenSearchDemo({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const ledger = useMemo(makeLedger, [])

  async function script(a: Act<S>) {
    const words = RUNS[ledger.turn].report.split(' ').length
    await a.wait(800)
    await a.move({ at: 'donate', x: 0.82, y: 0.62 })
    await a.wait(160)
    await a.click()
    await a.set({ dialog: true })
    await a.wait(800)
    await a.move({ at: 'confirm', x: 0.84, y: 0.62 })
    await a.wait(220)
    await a.click()
    await a.set({ dialog: false })
    a.move('rest')
    await a.wait(260)
    await a.set({ live: true, phase: 'searching', words: 0 })
    await a.wait(1000)
    await a.set({ phase: 'writing' })
    for (let i = 1; i <= words; i++) {
      await a.set({ words: i })
      await a.wait(52)
    }
    await a.wait(400)
    await a.set({ phase: 'editing' })
    await a.wait(700)
    settle(ledger)
    await a.set({ tick: 1, crossing: true })
    await a.mark('settled')
    await a.wait(800)
    await a.set({ crossing: false })
    await a.wait(300)
    land(ledger)
    await a.set({ live: false, tick: 2 })
    await a.wait(2100)
    advance(ledger)
    await a.set({ tick: 0, words: 0, phase: 'searching' })
  }

  return (
    <Stage
      width={960}
      height={530}
      compact={{ below: 640, width: 358, height: 580 }}
      initial={initial}
      poster={POSTER}
      script={script}
      theme={theme}
      fidelity="realistic"
      cursor={{ at: REST }}
      className="osd"
    >
      {(s, _rect, layout) => {
        // The poster shows the moment after the figures land.
        const view = s.still ? stillLedger() : ledger
        const order = [...view.donors].sort((x, y) => y.amount - x.amount)
        const shown = layout === 'compact' ? order.slice(1) : order
        const pitch = ROW[layout]
        const page = (
          <div className="osd-page">
            <div className="osd-content" data-crop>
              <div className="osd-prompt">How well do air-source heat pumps perform in cold, damp climates?</div>

              <div className="osd-grid">
                <aside className="osd-rail">
                  <div className="osd-funding">
                    <div className="osd-sum">
                      <Count value={view.total} format={money} />
                    </div>
                    <div className="osd-sub">raised</div>
                  </div>
                  <div className="osd-btn osd-primary" data-target="donate" data-open={s.dialog || undefined}>
                    Donate
                  </div>
                  {layout === 'wide' && <div className="osd-btn osd-quiet">Generate a card</div>}
                </aside>

                <div className="osd-main">
                  <div className="osd-tabs">
                    <span data-on>Findings</span>
                    <span>
                      Runs<span className="osd-tabcount"><Count value={view.runs} /></span>
                    </span>
                    <span>Repository</span>
                  </div>

                  <Collapse open={s.live}>
                    <div className="osd-live">
                      <div className="osd-status">
                        <span className="osd-dot" />
                        <span>Run {view.run}.</span>
                        <States value={s.phase} states={STATUS} align="start" />
                      </div>
                      <div className="osd-funded">Funded by @{view.current} with Claude Sonnet 5.5</div>
                      <GrowingReport text={RUNS[view.turn].report} count={s.words} />
                    </div>
                  </Collapse>

                  <div className="osd-findings" hidden={s.still && layout === 'compact'}>
                    <div className="osd-heading">Performance depends mainly on sizing and flow temperature</div>
                    <div className="osd-paras">
                      {view.notes.map((note, index) => (
                        <Collapse key={note.id} open={note.shown && (layout === 'wide' || index === 0)}>
                          <div className="osd-para">{note.text}</div>
                        </Collapse>
                      ))}
                      {layout === 'wide' ? (
                        ALREADY_KNOWN.map((text) => (
                          <div className="osd-para osd-known" key={text}>
                            {text}
                          </div>
                        ))
                      ) : (
                        // The phone card has room for one paragraph, so a new finding takes its place.
                        <Collapse open={!view.notes.some((note) => note.shown)}>
                          <div className="osd-para">{ALREADY_KNOWN[0]}</div>
                        </Collapse>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="osd-scrim" data-show={s.dialog || undefined} />
            <div className="osd-dialog" data-show={s.dialog || undefined}>
              <div className="osd-dialog-title">Donate to this project</div>
              <div className="osd-label">Amount</div>
              <div className="osd-amounts">
                <span>$1</span>
                <span data-on>$5</span>
                <span>$20</span>
                <span>Other</span>
              </div>
              <div className="osd-label">Model</div>
              <div className="osd-models">
                <div className="osd-model" data-on>
                  <span>Claude Sonnet 5.5</span>
                  <span className="osd-price">$2.00 / $10.00</span>
                </div>
                <div className="osd-model">
                  <span>Claude Opus 5.5</span>
                  <span className="osd-price">$4.00 / $20.00</span>
                </div>
              </div>
              <div className="osd-btn osd-primary osd-confirm" data-target="confirm">
                Donate $5.00
              </div>
            </div>
          </div>
        )
        return (
          <>
            {layout === 'wide' ? <Window className="osd-window">{page}</Window> : <div className="osd-card">{page}</div>}

            <div className="osd-board">
              <div className="osd-board-title">Donations</div>
              <div className="osd-ranks" style={{ height: (layout === 'compact' ? shown.length + 1 : shown.length) * pitch }}>
                {view.donors
                  .filter((d) => shown.includes(d))
                  .map((d) => (
                    <div
                      key={d.handle}
                      className="osd-rank"
                      style={{ height: pitch, transform: `translateY(${shown.indexOf(d) * pitch}px)` }}
                      data-moving={s.crossing && d.handle === view.current ? '' : undefined}
                    >
                      <Row
                        pad={layout === 'compact' ? 16 : 12}
                        lead={<Avatar name={d.handle} size={26} />}
                        title={`@${d.handle}`}
                        meta={
                          <span className="osd-amount">
                            <Count value={d.amount} format={money} />
                          </span>
                        }
                      />
                    </div>
                  ))}
                {layout === 'compact' && (
                  <div className="osd-rank" style={{ height: pitch, transform: `translateY(${shown.length * pitch}px)` }}>
                    <Row pad={16} lead={<Avatar plain size={26} />} title={<Bar w={84} h={7} tone={2} />} meta={<Bar w={44} h={7} tone={2} />} />
                  </div>
                )}
              </div>
            </div>

            <span data-target="rest" style={{ position: 'absolute', left: REST[layout].x, top: REST[layout].y }} />
          </>
        )
      }}
    </Stage>
  )
}

function stillLedger(): Ledger {
  const ledger = makeLedger()
  settle(ledger)
  return ledger
}
