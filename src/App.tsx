import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import './App.css'
import { fetchJSON, HttpError, registerUnauthorizedHandler } from './lib/api'
import { clearControlRoomKey, getStoredControlRoomKey, saveControlRoomKey } from './lib/auth'

type Ticket = {
  display_code: string
  status: 'claimed' | 'unclaimed'
  metadata?: Record<string, string>
  claimed_at?: string | null
  token_bundles?: { amount: number }[]
}

type TicketStore = {
  updated_at?: string
  tickets?: Ticket[]
}

type FaucetStatus = {
  running: boolean
  startedAt?: string | null
  options?: Record<string, unknown> | null
  logs: string[]
}

type ConfigResponse = {
  ticketsStore: string
  walletDir: string
  faucetUrl: string
  lakesideBin: string
  lakesideCwd: string
  controlRoomKeyRequired?: boolean
}

type WalletJobStatus = 'idle' | 'running' | 'done' | 'error'

type WalletLogResponse = {
  id: string
  logs: string[]
  status: 'running' | 'error' | 'done'
  error?: string
  startedAt?: string
  finishedAt?: string
}

const extractInvoice = (lines: string[]): string | null => {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = lines[i]?.match(/(lnbc[a-z0-9]+)/i)
    if (match) {
      return match[1]
    }
  }
  return null
}

function App() {
  const [authState, setAuthState] = useState<'checking' | 'locked' | 'unlocked'>('checking')
  const [keyInput, setKeyInput] = useState(getStoredControlRoomKey() || '')
  const [keyError, setKeyError] = useState<string | null>(null)
  const [keyBusy, setKeyBusy] = useState(false)
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [tickets, setTickets] = useState<TicketStore | null>(null)
  const [ticketsMessage, setTicketsMessage] = useState<string | null>(null)
  const [csvInput, setCsvInput] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [codeColumn, setCodeColumn] = useState('ticket_code')
  const [metadataColumn, setMetadataColumn] = useState('holder_name')
  const [walletMessage, setWalletMessage] = useState<string | null>(null)
  const [fundAmount, setFundAmount] = useState(50000)
  const [fundMint, setFundMint] = useState('https://m7.mountainlake.io')
  const [useBolt12, setUseBolt12] = useState(false)
  const [balanceOutput, setBalanceOutput] = useState<string>('')
  const [walletJobId, setWalletJobId] = useState<string | null>(null)
  const [walletJobLogs, setWalletJobLogs] = useState<string[]>([])
  const [walletJobStatus, setWalletJobStatus] = useState<WalletJobStatus>('idle')
  const [walletInvoice, setWalletInvoice] = useState<string | null>(null)
  const [faucetMint, setFaucetMint] = useState('https://m7.mountainlake.io')
  const [faucetBind, setFaucetBind] = useState('0.0.0.0:8080')
  const [tokenCount, setTokenCount] = useState(1)
  const [payoutMode, setPayoutMode] = useState<'fixed' | 'range'>('fixed')
  const [fixedAmount, setFixedAmount] = useState(1212)
  const [lowerBound, setLowerBound] = useState(1000)
  const [upperBound, setUpperBound] = useState(4000)
  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus | null>(null)
  const [faucetMessage, setFaucetMessage] = useState<string | null>(null)
  const [claimTicketCode, setClaimTicketCode] = useState('')
  const [claimUrl, setClaimUrl] = useState('http://127.0.0.1:8080')
  const [claimResult, setClaimResult] = useState<string>('')
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [busySection, setBusySection] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const resetControlRoomState = useCallback(() => {
    setConfig(null)
    setTickets(null)
    setTicketsMessage(null)
    setWalletMessage(null)
    setBalanceOutput('')
    setWalletJobId(null)
    setWalletJobLogs([])
    setWalletJobStatus('idle')
    setWalletInvoice(null)
    setFaucetStatus(null)
    setFaucetMessage(null)
    setClaimResult('')
    setBusySection(null)
  }, [])

  useEffect(() => {
    const unsubscribe = registerUnauthorizedHandler((error) => {
      resetControlRoomState()
      setAuthState('locked')
      setKeyError(error.message || 'Control room key required')
    })
    return unsubscribe
  }, [resetControlRoomState])

  const loadConfig = useCallback(async () => {
    const data = await fetchJSON<ConfigResponse>('/api/config')
    setConfig(data)
    setClaimUrl(data.faucetUrl)
    return data
  }, [])

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true)
    setTicketsMessage(null)
    try {
      const data = await fetchJSON<TicketStore>('/api/tickets')
      setTickets(data)
      return data
    } catch (error) {
      setTickets(null)
      setTicketsMessage((error as Error).message)
      if (error instanceof HttpError && error.status === 401) {
        throw error
      }
      return null
    } finally {
      setLoadingTickets(false)
    }
  }, [])

  const loadFaucetStatus = useCallback(async () => {
    try {
      const status = await fetchJSON<FaucetStatus>('/api/faucet/status')
      setFaucetStatus(status)
      return status
    } catch (error) {
      setFaucetStatus(null)
      setFaucetMessage((error as Error).message)
      if (error instanceof HttpError && error.status === 401) {
        throw error
      }
      return null
    }
  }, [])

  useEffect(() => {
    let canceled = false
    const bootstrap = async () => {
      try {
        await loadConfig()
        if (!canceled) {
          setAuthState('unlocked')
        }
        await Promise.all([loadTickets(), loadFaucetStatus()])
        setGlobalError(null)
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) {
          if (!canceled) {
            setAuthState('locked')
            setKeyError('Enter the control room key to continue.')
          }
          return
        }
        setGlobalError((error as Error).message)
      }
    }
    bootstrap()
    return () => {
      canceled = true
    }
  }, [loadConfig, loadTickets, loadFaucetStatus])

  useEffect(() => {
    if (authState !== 'unlocked') {
      return undefined
    }
    const poll = setInterval(() => {
      loadFaucetStatus().catch(() => undefined)
    }, 5000)
    return () => clearInterval(poll)
  }, [authState, loadFaucetStatus])

  useEffect(() => {
    if (!walletJobId) {
      setWalletJobStatus('idle')
      return
    }

    let active = true
    let timer: number | undefined

    const poll = async () => {
      try {
        const data = await fetchJSON<WalletLogResponse>(`/api/wallet/fund/logs?id=${walletJobId}`)
        if (!active) return
        setWalletJobLogs(data.logs || [])
        if (data.logs?.length) {
          const invoice = extractInvoice(data.logs)
          if (invoice) {
            setWalletInvoice(invoice)
          }
        }
        if (data.status === 'running') {
          setWalletJobStatus('running')
          timer = window.setTimeout(poll, 1500)
        } else {
          setWalletJobStatus(data.status)
          if (data.status === 'done') {
            setWalletMessage('Funding finished – proofs minted')
          } else if (data.status === 'error') {
            setWalletMessage(data.error || 'Funding failed')
          }
        }
      } catch (error) {
        if (!active) return
        setWalletJobStatus('error')
        setWalletMessage((error as Error).message)
      }
    }

    poll()

    return () => {
      active = false
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [walletJobId])

  const handleInitTickets = async () => {
    setBusySection('tickets')
    setTicketsMessage('Initializing tickets store…')
    try {
      await fetchJSON('/api/tickets/init', { method: 'POST', body: JSON.stringify({}) })
      setTicketsMessage('tickets.json initialized')
      await loadTickets()
    } catch (error) {
      setTicketsMessage((error as Error).message)
    } finally {
      setBusySection(null)
    }
  }

  const handleImportTickets = async (event: FormEvent) => {
    event.preventDefault()
    if (!csvInput.trim()) {
      setTicketsMessage('Paste CSV content before importing')
      return
    }

    setBusySection('tickets')
    setTicketsMessage('Importing attendees…')
    try {
      await fetchJSON('/api/tickets/import', {
        method: 'POST',
        body: JSON.stringify({ csv: csvInput, codeColumn, metadataColumn }),
      })
      setTicketsMessage('Attendees imported')
      setCsvInput('')
      await loadTickets()
    } catch (error) {
      setTicketsMessage((error as Error).message)
    } finally {
      setBusySection(null)
    }
  }

  const handleUploadTickets = async () => {
    if (!csvFile) {
      setTicketsMessage('Choose a CSV file to upload')
      return
    }

    setBusySection('tickets')
    setTicketsMessage('Uploading CSV file…')
    try {
      const formData = new FormData()
      formData.append('csv', csvFile)
      formData.append('codeColumn', codeColumn)
      if (metadataColumn) {
        formData.append('metadataColumn', metadataColumn)
      }

      await fetchJSON('/api/tickets/import/upload', {
        method: 'POST',
        body: formData,
      })

      setTicketsMessage('CSV imported')
      setCsvFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      await loadTickets()
    } catch (error) {
      setTicketsMessage((error as Error).message)
    } finally {
      setBusySection(null)
    }
  }

  const handleFundWallet = async (event: FormEvent) => {
    event.preventDefault()
    setBusySection('wallet')
    setWalletMessage('Requesting invoice…')
    try {
      const response = await fetchJSON<{ jobId: string }>('/api/wallet/fund', {
        method: 'POST',
        body: JSON.stringify({ amount: fundAmount, mint: fundMint, bolt12: useBolt12 }),
      })
      setWalletMessage('Invoice requested – watch the funding log below for the BOLT11 string.')
      setWalletJobLogs([])
      setWalletJobStatus('running')
      setWalletInvoice(null)
      setWalletJobId(response.jobId)
    } catch (error) {
      setWalletMessage((error as Error).message)
    } finally {
      setBusySection(null)
    }
  }

  const handleWalletBalance = async () => {
    setBusySection('wallet')
    setWalletMessage('Checking balance…')
    try {
      const data = await fetchJSON<{ output: string }>(`/api/wallet/balance?mint=${encodeURIComponent(fundMint)}`)
      setBalanceOutput(data.output)
      setWalletMessage('Balance refreshed')
    } catch (error) {
      setWalletMessage((error as Error).message)
    } finally {
      setBusySection(null)
    }
  }

  const handleInvoiceCopy = async () => {
    if (!walletInvoice) return
    try {
      await navigator.clipboard.writeText(walletInvoice)
      setWalletMessage('Invoice copied to clipboard')
    } catch (error) {
      setWalletMessage((error as Error).message)
    }
  }

  const handleStartFaucet = async (event: FormEvent) => {
    event.preventDefault()
    setBusySection('faucet')
    setFaucetMessage('Starting faucet…')
    const payload: Record<string, unknown> = {
      mint: faucetMint,
      bind: faucetBind,
      tokenCount,
    }

    if (payoutMode === 'fixed') {
      payload.fixedAmount = fixedAmount
    } else {
      payload.lowerBound = lowerBound
      payload.upperBound = upperBound
    }

    try {
      await fetchJSON('/api/faucet/start', { method: 'POST', body: JSON.stringify(payload) })
      setFaucetMessage('Faucet launched')
      await loadFaucetStatus()
    } catch (error) {
      setFaucetMessage((error as Error).message)
    } finally {
      setBusySection(null)
    }
  }

  const handleStopFaucet = async () => {
    setBusySection('faucet')
    setFaucetMessage('Stopping faucet…')
    try {
      await fetchJSON('/api/faucet/stop', { method: 'POST' })
      setFaucetMessage('Faucet stopped')
      await loadFaucetStatus()
    } catch (error) {
      setFaucetMessage((error as Error).message)
    } finally {
      setBusySection(null)
    }
  }

  const handleClaim = async (event: FormEvent) => {
    event.preventDefault()
    setBusySection('claim')
    setClaimResult('Submitting claim…')
    try {
      const response = await fetchJSON<{ data: Record<string, unknown> }>('/api/claim', {
        method: 'POST',
        body: JSON.stringify({ ticketCode: claimTicketCode, faucetUrl: claimUrl }),
      })
      setClaimResult(JSON.stringify(response.data, null, 2))
    } catch (error) {
      setClaimResult((error as Error).message)
    } finally {
      setBusySection(null)
    }
  }

  const attendees = useMemo(() => tickets?.tickets || [], [tickets])
  const claimedCount = attendees.filter((ticket) => ticket.status === 'claimed').length

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault()
    if (!keyInput.trim()) {
      setKeyError('Enter the control room key')
      return
    }

    setKeyBusy(true)
    setKeyError(null)
    saveControlRoomKey(keyInput.trim())

    try {
      await loadConfig()
      await Promise.all([loadTickets(), loadFaucetStatus()])
      setAuthState('unlocked')
      setGlobalError(null)
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        setKeyError('Incorrect key')
      } else {
        setKeyError((error as Error).message)
      }
      clearControlRoomKey()
    } finally {
      setKeyBusy(false)
    }
  }

  const handleLockControlRoom = () => {
    clearControlRoomKey()
    resetControlRoomState()
    setAuthState('locked')
  }

  return (
    <div className={`page ${authState !== 'unlocked' ? 'page-locked' : ''}`}>
      <header>
        <div>
          <h1>catofa</h1>
          <p>Cashu Token Faucet UI for the lakeside CLI</p>
        </div>
        <div className="status-pill">
          <span>{claimedCount}</span>
          <label>claimed / {attendees.length} tickets</label>
        </div>
      </header>

      <div className="control-room-header">
        <a href="/attendee" target="_blank" rel="noreferrer">
          Open attendee portal
        </a>
        {authState === 'unlocked' && (
          <button type="button" onClick={handleLockControlRoom}>
            Lock control room
          </button>
        )}
      </div>

      {globalError && <p className="error global-error">{globalError}</p>}

      {authState === 'unlocked' ? (
        <>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>1. Tickets</h2>
                <p>Initialize the datastore, import attendees, and view claim status.</p>
              </div>
              <button onClick={handleInitTickets} disabled={busySection === 'tickets'}>
                Initialize store
              </button>
            </div>

            <form className="grid" onSubmit={handleImportTickets}>
              <label className="span-2">
                CSV export (paste)
                <textarea
                  value={csvInput}
                  onChange={(event) => setCsvInput(event.target.value)}
                  placeholder="Paste CSV rows here"
                  rows={5}
                />
              </label>
              <label>
                Ticket code column
                <input value={codeColumn} onChange={(event) => setCodeColumn(event.target.value)} />
              </label>
              <label>
                Metadata column (optional)
                <input value={metadataColumn} onChange={(event) => setMetadataColumn(event.target.value)} />
              </label>
              <label className="file-input">
                Or upload CSV file
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setCsvFile(event.target.files?.[0] || null)}
                />
              </label>
              <button type="submit" className="primary" disabled={busySection === 'tickets'}>
                Import pasted CSV
              </button>
              <button type="button" onClick={handleUploadTickets} disabled={busySection === 'tickets'}>
                Upload file
              </button>
              <button type="button" onClick={loadTickets} disabled={loadingTickets}>
                Refresh list
              </button>
            </form>

            {ticketsMessage && <p className="hint">{ticketsMessage}</p>}

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Status</th>
                    <th>Holder</th>
                    <th>Claims</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((ticket) => (
                    <tr key={ticket.display_code}>
                      <td>{ticket.display_code}</td>
                      <td>
                        <span className={`badge ${ticket.status}`}>{ticket.status}</span>
                      </td>
                      <td>{ticket.metadata?.holder_name || '—'}</td>
                      <td>{ticket.token_bundles?.length || 0}</td>
                    </tr>
                  ))}
                  {attendees.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty">
                        {loadingTickets ? 'Loading tickets…' : 'No tickets in store yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>2. Wallet</h2>
                <p>Fund and inspect the persistent lakeside wallet.</p>
              </div>
              <button onClick={handleWalletBalance} disabled={busySection === 'wallet'}>
                Refresh balance
              </button>
            </div>

            <form className="grid" onSubmit={handleFundWallet}>
              <label>
                Amount (sats)
                <input
                  type="number"
                  min={1}
                  value={fundAmount}
                  onChange={(event) => setFundAmount(Number(event.target.value))}
                />
              </label>
              <label>
                Mint URL
                <input value={fundMint} onChange={(event) => setFundMint(event.target.value)} />
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={useBolt12} onChange={(event) => setUseBolt12(event.target.checked)} />
                Use Bolt12 invoices
              </label>
              <button type="submit" className="primary" disabled={busySection === 'wallet'}>
                Fund wallet
              </button>
            </form>

            {walletMessage && <p className="hint">{walletMessage}</p>}
            {(walletJobLogs.length > 0 || walletJobStatus === 'running') && (
              <div className="wallet-logs" aria-live="polite">
                <div className="wallet-status">
                  Funding status:{' '}
                  {walletJobStatus === 'running'
                    ? 'waiting for payment'
                    : walletJobStatus === 'done'
                      ? 'completed'
                      : walletJobStatus === 'error'
                        ? 'error'
                        : 'idle'}
                </div>
                <pre className="output">
                  {walletJobLogs.length
                    ? walletJobLogs.join('\n')
                    : 'Logs will appear here as soon as Lakeside prints the invoice.'}
                </pre>
              </div>
            )}
            {walletInvoice && (
              <div className="invoice-qr">
                <QRCodeSVG value={walletInvoice} size={180} bgColor="#090e1a" fgColor="#59f0b5" />
                <div>
                  <p>Scan or copy this invoice.</p>
                  <button type="button" className="copy-btn" onClick={handleInvoiceCopy}>
                    Copy invoice text
                  </button>
                </div>
              </div>
            )}
            {balanceOutput && (
              <pre className="output" aria-live="polite">
                {balanceOutput}
              </pre>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>3. Faucet</h2>
                <p>Launch or stop `lakeside faucet serve` and inspect its logs.</p>
              </div>
              <div className="status-pill small">
                <span className={faucetStatus?.running ? 'online' : 'offline'}>
                  {faucetStatus?.running ? 'RUNNING' : 'STOPPED'}
                </span>
                <label>{faucetStatus?.startedAt ? new Date(faucetStatus.startedAt).toLocaleString() : 'idle'}</label>
              </div>
            </div>

            <form className="grid" onSubmit={handleStartFaucet}>
              <label>
                Mint URL
                <input value={faucetMint} onChange={(event) => setFaucetMint(event.target.value)} />
              </label>
              <label>
                Bind address
                <input value={faucetBind} onChange={(event) => setFaucetBind(event.target.value)} />
              </label>
              <label>
                Tokens per ticket
                <input
                  type="number"
                  min={1}
                  value={tokenCount}
                  onChange={(event) => setTokenCount(Number(event.target.value))}
                />
              </label>
              <label className="radio-group">
                <span>Payout mode</span>
                <div>
                  <label>
                    <input
                      type="radio"
                      name="payout"
                      value="fixed"
                      checked={payoutMode === 'fixed'}
                      onChange={() => setPayoutMode('fixed')}
                    />
                    Fixed amount
                  </label>
                  {payoutMode === 'fixed' && (
                    <input
                      type="number"
                      min={1}
                      value={fixedAmount}
                      onChange={(event) => setFixedAmount(Number(event.target.value))}
                    />
                  )}
                </div>
                <div>
                  <label>
                    <input
                      type="radio"
                      name="payout"
                      value="range"
                      checked={payoutMode === 'range'}
                      onChange={() => setPayoutMode('range')}
                    />
                    Random range
                  </label>
                  {payoutMode === 'range' && (
                    <div className="range-inputs">
                      <input
                        type="number"
                        min={1}
                        value={lowerBound}
                        onChange={(event) => setLowerBound(Number(event.target.value))}
                      />
                      <span>to</span>
                      <input
                        type="number"
                        min={1}
                        value={upperBound}
                        onChange={(event) => setUpperBound(Number(event.target.value))}
                      />
                    </div>
                  )}
                </div>
              </label>
              <div className="button-row">
                <button type="submit" className="primary" disabled={busySection === 'faucet'}>
                  Start faucet
                </button>
                <button type="button" onClick={handleStopFaucet} disabled={busySection === 'faucet'}>
                  Stop faucet
                </button>
                <button type="button" onClick={loadFaucetStatus}>
                  Refresh
                </button>
              </div>
            </form>

            {faucetMessage && <p className="hint">{faucetMessage}</p>}
            <pre className="output logs" aria-live="polite">
              {faucetStatus?.logs?.length
                ? faucetStatus.logs.join('\n')
                : 'No faucet output yet. Logs will appear once the process starts.'}
            </pre>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>4. Claim tester</h2>
                <p>Run a sample POST /claim request against the faucet.</p>
              </div>
            </div>

            <form className="grid" onSubmit={handleClaim}>
              <label>
                Ticket code
                <input value={claimTicketCode} onChange={(event) => setClaimTicketCode(event.target.value)} />
              </label>
              <label>
                Faucet URL
                <input value={claimUrl} onChange={(event) => setClaimUrl(event.target.value)} />
              </label>
              <button type="submit" className="primary" disabled={busySection === 'claim'}>
                Claim tokens
              </button>
            </form>

            {claimResult && (
              <pre className="output" aria-live="polite">
                {claimResult}
              </pre>
            )}
          </section>
        </>
      ) : (
        <div className="auth-overlay" aria-live="polite">
          {authState === 'checking' ? (
            <div className="auth-card">
              <p>Checking access…</p>
            </div>
          ) : (
            <form className="auth-card" onSubmit={handleUnlock}>
              <h2>Enter control room key</h2>
              <p>Only organizers can access the control room. Share the attendee portal link for everyone else.</p>
              <label>
                Control room key
                <input value={keyInput} onChange={(event) => setKeyInput(event.target.value)} placeholder="••••••" />
              </label>
              {keyError && <p className="error">{keyError}</p>}
              <button type="submit" className="primary" disabled={keyBusy}>
                {keyBusy ? 'Verifying…' : 'Unlock'}
              </button>
            </form>
          )}
        </div>
      )}

      <footer>
        <small>
          Configured store: {config?.ticketsStore || 'n/a'} · Lakeside bin: {config?.lakesideBin} (cwd {config?.lakesideCwd})
        </small>
      </footer>
    </div>
  )
}

export default App
