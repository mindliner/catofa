import { useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { fetchJSON } from './lib/api'

type TokenBundle = {
  amount: number
  token: string
  format?: string
  created_at?: string
}

type ClaimData = {
  status?: string
  already_claimed?: boolean
  total_amount?: number
  display_code?: string
  ticket_code?: string
  tokens?: TokenBundle[]
}

const AttendeeApp = () => {
  const [ticketCode, setTicketCode] = useState('')
  const [result, setResult] = useState<ClaimData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ticketCode.trim()) {
      setError('Enter your ticket code')
      return
    }

    setBusy(true)
    setError(null)
    setResult(null)
    setCopyMessage(null)

    try {
      const response = await fetchJSON<{ data: ClaimData }>('/attendee/claim', {
        method: 'POST',
        body: JSON.stringify({ ticketCode: ticketCode.trim() }),
      })
      setResult(response.data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token)
      setCopyMessage('Token copied to clipboard')
      setTimeout(() => setCopyMessage(null), 1600)
    } catch (err) {
      setCopyMessage((err as Error).message)
    }
  }

  const attendeeTokens = result?.tokens || []
  const totalAmount =
    result?.total_amount ?? attendeeTokens.reduce((sum, token) => sum + (token.amount || 0), 0)

  return (
    <div className="page attendee-page">
      <header>
        <div>
          <h1>Get your token</h1>
          <p>Enter your ticket code to retrieve your Cashu bundles.</p>
        </div>
      </header>

      <section className="card attendee-card">
        <form className="attendee-form" onSubmit={handleSubmit}>
          <label>
            Ticket code
            <input
              value={ticketCode}
              onChange={(event) => setTicketCode(event.target.value)}
              placeholder="e.g. AADJA-62BC3-1234"
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Checking…' : 'Show my tokens'}
          </button>
        </form>

        {error && <p className="error">{error}</p>}

        {result && (
          <div className="token-list">
            <div className="token-summary">
              <div>
                <strong>Status</strong>
                <span>{result.status}</span>
              </div>
              <div>
                <strong>Ticket</strong>
                <span>{result.display_code || result.ticket_code}</span>
              </div>
              <div>
                <strong>Total sats</strong>
                <span>{totalAmount}</span>
              </div>
              <div>
                <strong>Bundles</strong>
                <span>{attendeeTokens.length}</span>
              </div>
            </div>

            <div className="tokens-grid">
              {attendeeTokens.map((token, index) => (
                <div className="token-card" key={`${token.token}-${index}`}>
                  <div className="token-card__header">
                    <strong>Token #{index + 1}</strong>
                    <span>{token.amount} sats</span>
                  </div>
                  <textarea readOnly value={token.token} />
                  <button type="button" className="copy-btn" onClick={() => handleCopyToken(token.token)}>
                    Copy token
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {copyMessage && <p className="hint">{copyMessage}</p>}
      </section>
    </div>
  )
}

export default AttendeeApp
