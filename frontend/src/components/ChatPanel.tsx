import { useEffect, useRef, useState } from 'react'
import { getTaskmanKey, subscribeTaskmanKey } from '../api/taskmanKey'

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: { label: string }[]
}

type Segment = { type: 'text'; text: string } | { type: 'code'; code: string }

function parseContent(content: string): Segment[] {
  const segments: Segment[] = []
  const re = /```(?:\w+)?\n([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      const t = content.slice(last, m.index).trim()
      if (t) segments.push({ type: 'text', text: t })
    }
    segments.push({ type: 'code', code: m[1].trim() })
    last = m.index + m[0].length
  }
  if (last < content.length) {
    const tail = content.slice(last).trim()
    if (tail) segments.push({ type: 'text', text: tail })
  }
  return segments
}

function ToolBadge({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      borderRadius: 999, border: '1px solid var(--clr-border)', background: 'var(--clr-bg)',
      padding: '2px 10px', fontSize: 11, color: 'var(--clr-muted)',
    }}>
      <span className="chat-dot-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--clr-primary)' }} />
      {label}
    </span>
  )
}

function Bubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '85%', borderRadius: 14, borderTopRightRadius: 4,
          background: 'var(--clr-primary)', color: '#fff', padding: '8px 12px', fontSize: 13,
          whiteSpace: 'pre-wrap',
        }}>{msg.content}</div>
      </div>
    )
  }
  const segments = msg.content ? parseContent(msg.content) : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {msg.toolCalls.map((tc, i) => <ToolBadge key={i} label={tc.label} />)}
        </div>
      )}
      {segments.map((seg, i) => seg.type === 'text' ? (
        <div key={i} style={{
          maxWidth: '90%', borderRadius: 14, borderTopLeftRadius: 4,
          border: '1px solid var(--clr-border)', background: 'var(--clr-surface)',
          padding: '8px 12px', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5,
        }}>{seg.text}</div>
      ) : (
        <pre key={i} style={{
          overflowX: 'auto', borderRadius: 10, border: '1px solid var(--clr-border)',
          background: 'var(--clr-bg)', padding: '10px 12px', fontSize: 12,
          fontFamily: "'SF Mono','Menlo',monospace", whiteSpace: 'pre', margin: 0,
        }}>{seg.code}</pre>
      ))}
    </div>
  )
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [rawHistory, setRawHistory] = useState<unknown[]>([])
  const [loading, setLoading] = useState(false)
  const [taskmanKey, setTaskmanKeyState] = useState(getTaskmanKey())
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeTaskmanKey(setTaskmanKeyState), [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const userMsg: Message = { role: 'user', content: text }
    const assistantMsg: Message = { role: 'assistant', content: '', toolCalls: [] }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setLoading(true)

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
    const body = rawHistory.length > 0 ? { messages: history, rawHistory } : { messages: history }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (taskmanKey) headers['X-Taskman-Key'] = taskmanKey
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok || !res.body) {
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { ...assistantMsg, content: `Error ${res.status}: ${res.statusText}` }
          return next
        })
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          let ev: Record<string, unknown>
          try { ev = JSON.parse(line) } catch { continue }
          if (ev.type === 'tool_call') {
            setMessages(prev => {
              const next = [...prev]; const last = next[next.length - 1]
              next[next.length - 1] = { ...last, toolCalls: [...(last.toolCalls ?? []), { label: ev.label as string }] }
              return next
            })
          } else if (ev.type === 'content') {
            setMessages(prev => {
              const next = [...prev]
              next[next.length - 1] = { ...next[next.length - 1], content: ev.text as string }
              return next
            })
          } else if (ev.type === 'history') {
            setRawHistory(ev.messages as unknown[])
          } else if (ev.type === 'error') {
            setMessages(prev => {
              const next = [...prev]
              next[next.length - 1] = { ...next[next.length - 1], content: `Error: ${ev.message as string}` }
              return next
            })
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { ...next[next.length - 1], content: `Error: ${String(err)}` }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  const last = messages[messages.length - 1]
  const showTyping = loading && last?.role === 'assistant' && !last?.content && (last?.toolCalls?.length ?? 0) === 0

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="AI Assistant"
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 50,
            width: 48, height: 48, borderRadius: 999, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--clr-primary)', color: '#fff',
            boxShadow: '0 4px 14px rgba(0,0,0,.2)', padding: 0,
          }}
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
        </button>
      )}

      {open && (
        <div style={{
          position: 'fixed', bottom: 0, right: 0, zIndex: 40,
          display: 'flex', flexDirection: 'column',
          width: 480, height: '92vh', maxWidth: '100vw',
          background: 'var(--clr-bg)', borderLeft: '1px solid var(--clr-border)',
          borderTop: '1px solid var(--clr-border)', borderTopLeftRadius: 16,
          boxShadow: '-4px 0 24px rgba(0,0,0,.12)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--clr-border)', padding: '12px 16px' }}>
            <div style={{ width: 28, height: 28, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--clr-primary)' }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600 }}>Moneta Assistant</p>
              <p style={{ fontSize: 11, color: 'var(--clr-muted)' }}>Ask about budgets, payment refs, or Taskman</p>
            </div>
            {messages.length > 0 && (
              <button className="secondary" style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => { setMessages([]); setInput(''); setRawHistory([]) }}>New chat</button>
            )}
            <button className="secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setOpen(false)}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', padding: 16 }}>
            {messages.length === 0 && (
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--clr-muted)', marginTop: 24 }}>
                Ask me about budget consumption, spend per payment ref, or developer hours from Taskman.
              </p>
            )}
            {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}
            {showTyping && (
              <div style={{ display: 'flex', gap: 4, paddingLeft: 4 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} className="chat-dot-bounce" style={{
                    width: 6, height: 6, borderRadius: 999, background: 'var(--clr-muted)',
                    animationDelay: `${i * 150}ms`,
                  }} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ borderTop: '1px solid var(--clr-border)', padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, borderRadius: 12, border: '1px solid var(--clr-border)', background: 'var(--clr-surface)', padding: '6px 10px' }}>
              <textarea
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Ask a question…"
                style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', fontSize: 13, padding: 0, minHeight: 22 }}
              />
              <button onClick={handleSend} disabled={!input.trim() || loading}
                style={{ width: 28, height: 28, padding: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: !input.trim() || loading ? 0.4 : 1 }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              </button>
            </div>
            <p style={{ marginTop: 6, textAlign: 'center', fontSize: 10, color: 'var(--clr-muted)' }}>Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}
    </>
  )
}
