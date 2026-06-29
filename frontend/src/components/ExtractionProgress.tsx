import { useEffect, useState } from 'react'

const STAGES = [
  { max: 20, label: 'Uploading PDF…' },
  { max: 50, label: 'Reading document…' },
  { max: 80, label: 'Analysing with AI…' },
  { max: 90, label: 'Extracting fields…' },
]

function stageLabel(p: number) {
  return STAGES.find(s => p < s.max)?.label ?? 'Almost there…'
}

export default function ExtractionProgress({ extracting }: { extracting: boolean }) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!extracting) { setProgress(0); return }
    setProgress(0)
    const id = setInterval(() => {
      setProgress(p => {
        const inc = p < 20 ? 4 : p < 50 ? 2 : p < 80 ? 1 : 0.3
        return Math.min(p + inc, 90)
      })
    }, 200)
    return () => clearInterval(id)
  }, [extracting])

  if (!extracting) return null

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="text-muted text-sm">{stageLabel(progress)}</span>
        <span className="text-muted text-sm">{Math.round(progress)}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--clr-border)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          borderRadius: 3,
          background: 'var(--clr-primary)',
          transition: 'width 0.2s ease',
        }} />
      </div>
    </div>
  )
}
