type PebbleSceneProps = {
  state: 'idle' | 'matching'
}

function PebbleScene({ state }: PebbleSceneProps) {
  const matching = state === 'matching'

  return (
    <svg
      aria-label={matching ? 'Pebble looking around the meadow' : 'Pebble resting in a quiet meadow'}
      className="h-auto w-full max-w-[22rem]"
      role="img"
      shapeRendering="crispEdges"
      viewBox="0 0 320 224"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="var(--color-surface)" height="208" rx="24" width="320" y="8" />
      <path d="M0 152h320v40a24 24 0 0 1-24 24H24A24 24 0 0 1 0 192z" fill="var(--color-meadow)" />
      <path d="M0 176h320v16a24 24 0 0 1-24 24H24A24 24 0 0 1 0 192z" fill="var(--color-pine)" opacity=".2" />
      <path d="M28 152v-20m0 12-8-8m8 0 8-8M286 152v-24m0 12-8-8m8 0 8-8" fill="none" stroke="var(--color-pine)" strokeWidth="8" />
      {matching && (
        <path d="M86 108h24m-32 20h20" fill="none" stroke="var(--color-pine)" strokeLinecap="square" strokeWidth="6" />
      )}
      <g transform={matching ? 'translate(20 0)' : undefined}>
        <path d="M112 140c0-34 20-56 48-56s48 22 48 56v20h-96z" fill="var(--color-stone)" />
        <path d="M128 108h64v-8h-16v-8h-32v8h-16z" fill="var(--color-stone)" />
        <rect fill="var(--color-ink)" height="8" width="8" x="136" y="124" />
        <rect fill="var(--color-ink)" height="8" width="8" x="176" y="124" />
        <path d={matching ? 'M144 144h24v8h-24z' : 'M144 144h32v8h-32z'} fill="var(--color-ink)" />
      </g>
      <path d="M56 180h32m144 8h40" stroke="var(--color-surface)" strokeWidth="8" />
    </svg>
  )
}

export default PebbleScene
export type { PebbleSceneProps }
