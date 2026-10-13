import { useState } from 'react'
import { GemProgression } from '../pebble-art/GemProgression'
import { mineralStages, museumSide, museumSlots, type MuseumSpecimen } from './museum-model'

export function GeologyMuseum({ specimens }: { specimens: readonly MuseumSpecimen[] }) {
  const [selected, setSelected] = useState(0)
  const slots = museumSlots(specimens)
  const current = slots[selected]
  const positions = slots.map((specimen, index) => ({ specimen, index, row: Math.floor(index / museumSide), col: index % museumSide }))
  return <section className="pt-geology-museum" aria-label="Geology museum">
    <h2 className="pt-sr-only">Geology museum</h2>
    <svg className="pt-museum-scene" viewBox="0 0 800 550" role="group" aria-label="Sixteen display cases in four rows and four columns">
      <g className="pt-museum-room" stroke="#cbd1cd" strokeWidth="2" strokeLinejoin="miter">
        <path fill="#e0e4df" d="M60 305 400 475 400 505 60 335Z" />
        <path fill="#cdd5ce" d="M400 475 740 305 740 335 400 505Z" />
        <path fill="#fafcf9" d="M60 305 400 135 740 305 400 475Z" />
        <path fill="#f5f7f3" d="M60 305 60 175 400 5 400 135Z" />
        <path fill="#e9eeea" d="M400 5 740 175 740 305 400 135Z" />
        <path fill="none" stroke="#ffffff" strokeWidth="8" d="M64 175 400 9 736 175" />
        {Array.from({ length: 7 }, (_, i) => { const n = (i + 1) / 8; return <g key={i} stroke="#e3e8e0" strokeWidth="1"><path d={`M${400 - 340 * n} ${135 + 170 * n}l340 170`} /><path d={`M${400 + 340 * n} ${135 + 170 * n}l-340 170`} /></g> })}
        {[0, 1, 2].map(i => <g key={i} stroke="#dce3dc" fill="#ffffff"><path d={`M${118 + i * 86} ${179 - i * 43}l50-25v66l-50 25Z`} /><path d={`M${482 + i * 86} ${102 + i * 43}l50 25v66l-50-25Z`} /></g>)}
      </g>
      {positions.sort((a, b) => a.row + a.col - b.row - b.col).map(({ specimen, index, row, col }) => <g key={index} className="pt-museum-case" data-row={row} data-column={col} data-occupied={Boolean(specimen)} data-family={specimen?.family} data-stage={specimen?.stage} transform={`translate(${400 + (col - row) * 86} ${177 + (col + row) * 43})`} role="img" aria-label={`Case ${index + 1}, row ${row + 1}, column ${col + 1}: ${specimen ? `${specimen.name}, ${mineralStages[specimen.stage]}${specimen.stage === 3 ? `, ${specimen.expression}` : ''}` : 'Empty'}`}>
        <g stroke="#b7c2ba" strokeWidth="2" strokeLinejoin="miter">
          <path fill="#dce2dc" d="M-36 0 0 18 0 34-36 16Z" />
          <path fill="#c7d0c8" d="M0 18 36 0 36 16 0 34Z" />
          <path fill="#ffffff" d="M0-18 36 0 0 18-36 0Z" stroke={selected === index ? 'var(--pt-green)' : '#b7c2ba'} />
          <path fill="#edf6f3" fillOpacity=".4" stroke="none" d="M0-74 32-58 32-6 0 10-32-6-32-58Z" />
          <path fill="none" stroke="#bdccca" d="M0-74 32-58 0-42-32-58ZM-32-58v52L0 10 32-6v-52M0-42v52" />
          <path fill="none" stroke="#ffffff" strokeOpacity=".9" strokeWidth="3" d="m-27-54 21 11M5-45l22-11M-27-48v30" />
          {/* Keep glass seams behind the specimen so its small face stays legible. */}
          {specimen && <svg x="-29" y="-61" width="58" height="60" viewBox="0 0 58 60"><GemProgression stage={specimen.stage} family={specimen.family} /></svg>}
          <path fill="#879b8c" stroke="none" d="m7 23 16-8v4l-16 8Z" />
        </g>
      </g>)}
    </svg>
    <div className="pt-museum-inspector">
      <label className="pt-sr-only" htmlFor="museum-case">Display case</label>
      <select id="museum-case" value={selected} onChange={event => setSelected(Number(event.target.value))}>{slots.map((specimen, index) => <option key={index} value={index}>{specimen ? `${specimen.name} · ${specimen.stage + 1}/4` : `Case ${index + 1} · Empty`}</option>)}</select>
      <p role="status">{current ? `${mineralStages[current.stage]}${current.stage === 3 ? ` · ${current.expression}` : ''}` : 'Empty display case'}</p>
      <p className="pt-museum-caption">Four families · Rough to revealed, left to right</p>
    </div>
  </section>
}
