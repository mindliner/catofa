import cors from 'cors';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = Number(process.env.PORT || 4077);
const DATA_DIR = process.env.CATOFA_DATA_DIR || path.join(process.cwd(), 'runtime');
const DEFAULT_TICKETS_STORE = process.env.CATOFA_TICKETS || path.join(DATA_DIR, 'tickets.json');
const DEFAULT_WALLET_DIR = process.env.CATOFA_WALLET || path.join(os.homedir(), '.lakeside');
const DEFAULT_FAUCET_URL = process.env.CATOFA_FAUCET_URL || 'http://127.0.0.1:8080';
const LAKESIDE_BINARY_NAME = process.platform === 'win32' ? 'lakeside.exe' : 'lakeside';

const resolveLakesideCwd = () => {
  if (process.env.LAKESIDE_CWD) {
    return process.env.LAKESIDE_CWD;
  }
  const candidates = [
    path.resolve(process.cwd(), '..', 'lakeside'),
    path.resolve(process.cwd(), '..', '..'),
    path.resolve(process.cwd(), '..'),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'Cargo.toml'))) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), '..', 'lakeside');
};

const LAKESIDE_CWD = resolveLakesideCwd();

const detectLakesideBin = () => {
  if (process.env.LAKESIDE_BIN) {
    return process.env.LAKESIDE_BIN;
  }
  const release = path.join(LAKESIDE_CWD, 'target', 'release', LAKESIDE_BINARY_NAME);
  if (existsSync(release)) {
    return release;
  }
  const debug = path.join(LAKESIDE_CWD, 'target', 'debug', LAKESIDE_BINARY_NAME);
  if (existsSync(debug)) {
    return debug;
  }
  return 'cargo';
};

const LAKESIDE_BIN = detectLakesideBin();
const userArgs = process.env.LAKESIDE_ARGS?.split(' ').filter(Boolean);
const LAKESIDE_ARGS = userArgs ?? (LAKESIDE_BIN === 'cargo' ? ['run', '--quiet', '--'] : []);

let faucetProcess: ReturnType<typeof spawn> | null = null;
let faucetLogs: string[] = [];
let faucetStartedAt: string | null = null;
let faucetOptions: Record<string, unknown> | null = null;

type WalletJobStatus = 'running' | 'error' | 'done';
type WalletJob = {
  id: string;
  logs: string[];
  startedAt: string;
  finishedAt?: string;
  status: WalletJobStatus;
  error?: string;
  args: { amount: number; mint: string; bolt12?: boolean };
  child?: ReturnType<typeof spawn> | null;
};

const walletJobs = new Map<string, WalletJob>();

await fs.mkdir(DATA_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ensureParentDir = async (filePath: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const appendLog = (line: string) => {
  const entry = `[${new Date().toISOString()}] ${line.trim()}`;
  faucetLogs.push(entry);
  if (faucetLogs.length > 400) {
    faucetLogs = faucetLogs.slice(-400);
  }
};

const appendWalletLog = (job: WalletJob, lines: string | string[]) => {
  const chunks = Array.isArray(lines) ? lines : [lines];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    job.logs.push(trimmed);
  }
  if (job.logs.length > 400) {
    job.logs = job.logs.slice(-400);
  }
};

const serializeWalletJob = (job: WalletJob) => ({
  id: job.id,
  logs: job.logs,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  status: job.status,
  error: job.error,
  args: job.args,
});

const scheduleWalletCleanup = (id: string) => {
  setTimeout(() => {
    walletJobs.delete(id);
  }, 10 * 60 * 1000);
};

const runLakeside = (args: string[]) => {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(LAKESIDE_BIN, [...LAKESIDE_ARGS, ...args], {
      cwd: LAKESIDE_CWD,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        reject(new Error(`lakeside exited with code ${code}: ${stderr || stdout}`));
      }
    });
  });
};

const importTicketsCsv = async (options: {
  csv: string;
  codeColumn: string;
  metadataColumn?: string;
  storePath?: string;
}) => {
  const { csv, codeColumn, metadataColumn, storePath } = options;
  if (!csv || !codeColumn) {
    throw new Error('csv and codeColumn are required');
  }
  const finalStorePath = storePath || DEFAULT_TICKETS_STORE;
  const uploadPath = path.join(DATA_DIR, `upload-${Date.now()}.csv`);
  await ensureParentDir(finalStorePath);
  await fs.writeFile(uploadPath, csv, 'utf-8');
  const args = ['tickets', 'import', '--csv', uploadPath, '--code-column', codeColumn, '--store', finalStorePath];
  if (metadataColumn) {
    args.push('--metadata-column', metadataColumn);
  }
  try {
    const result = await runLakeside(args);
    return { result, storePath: finalStorePath };
  } finally {
    await fs.unlink(uploadPath).catch(() => undefined);
  }
};

app.get('/api/config', (_req: Request, res: Response) => {
  res.json({
    ticketsStore: DEFAULT_TICKETS_STORE,
    walletDir: DEFAULT_WALLET_DIR,
    faucetUrl: DEFAULT_FAUCET_URL,
    lakesideBin: LAKESIDE_BIN,
    lakesideCwd: LAKESIDE_CWD,
  });
});

app.get('/api/tickets', async (_req: Request, res: Response) => {
  try {
    const raw = await fs.readFile(DEFAULT_TICKETS_STORE, 'utf-8');
    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ message: 'tickets store not found' });
      return;
    }
    res.status(500).json({ message: 'Unable to load tickets', error: (error as Error).message });
  }
});

app.post('/api/tickets/init', async (req: Request, res: Response) => {
  const storePath = req.body?.storePath || DEFAULT_TICKETS_STORE;

  try {
    await ensureParentDir(storePath);
    const result = await runLakeside(['tickets', 'init', '--output', storePath]);
    res.json({ ok: true, output: result.stdout || result.stderr, storePath });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

app.post('/api/tickets/import/upload', upload.single('csv'), async (req: Request, res: Response) => {
  const codeColumn = (req.body?.codeColumn as string) || 'ticket_code';
  const metadataColumn = req.body?.metadataColumn as string | undefined;
  const storePath = req.body?.storePath as string | undefined;
  const csvBuffer = req.file?.buffer;

  if (!csvBuffer) {
    res.status(400).json({ message: 'CSV file is required' });
    return;
  }

  try {
    const csv = csvBuffer.toString('utf-8');
    const { result, storePath: finalStorePath } = await importTicketsCsv({
      csv,
      codeColumn,
      metadataColumn,
      storePath,
    });
    res.json({ ok: true, output: result.stdout || result.stderr, storePath: finalStorePath });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

app.post('/api/tickets/import', async (req: Request, res: Response) => {
  const { csv, codeColumn, metadataColumn, storePath } = req.body;

  if (!csv || !codeColumn) {
    res.status(400).json({ message: 'csv and codeColumn are required' });
    return;
  }

  try {
    const { result, storePath: finalStorePath } = await importTicketsCsv({ csv, codeColumn, metadataColumn, storePath });
    res.json({ ok: true, output: result.stdout || result.stderr, storePath: finalStorePath });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

app.post('/api/wallet/fund', (req: Request, res: Response) => {
  const { amount, mint, bolt12 } = req.body;

  if (!amount || !mint) {
    res.status(400).json({ message: 'amount and mint are required' });
    return;
  }

  const args = ['wallet', 'fund', '--amount', String(amount), '--mint', mint];
  if (bolt12) {
    args.push('--bolt12');
  }

  const id = randomUUID();
  const job: WalletJob = {
    id,
    logs: [],
    startedAt: new Date().toISOString(),
    status: 'running',
    args: { amount: Number(amount), mint, bolt12: Boolean(bolt12) },
    child: null,
  };
  walletJobs.set(id, job);

  try {
    const child = spawn(LAKESIDE_BIN, [...LAKESIDE_ARGS, ...args], {
      cwd: LAKESIDE_CWD,
      env: process.env,
    });
    job.child = child;

    const handleChunk = (chunk: Buffer) => {
      const lines = chunk.toString().split(/\r?\n/);
      appendWalletLog(job, lines);
    };

    child.stdout?.on('data', handleChunk);
    child.stderr?.on('data', handleChunk);

    child.on('error', (error) => {
      appendWalletLog(job, error.message);
      job.status = 'error';
      job.error = error.message;
      job.finishedAt = new Date().toISOString();
      job.child = null;
      scheduleWalletCleanup(id);
    });

    child.on('close', (code) => {
      appendWalletLog(job, `wallet fund exited with code ${code}`);
      job.status = code === 0 ? 'done' : 'error';
      if (code !== 0) {
        job.error = `Process exited with code ${code}`;
      }
      job.finishedAt = new Date().toISOString();
      job.child = null;
      scheduleWalletCleanup(id);
    });

    res.json({ ok: true, jobId: id });
  } catch (error) {
    job.status = 'error';
    job.error = (error as Error).message;
    job.finishedAt = new Date().toISOString();
    job.child = null;
    appendWalletLog(job, job.error);
    scheduleWalletCleanup(id);
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

app.get('/api/wallet/fund/logs', (req: Request, res: Response) => {
  const id = req.query.id as string | undefined;
  if (!id) {
    res.status(400).json({ message: 'job id is required' });
    return;
  }
  const job = walletJobs.get(id);
  if (!job) {
    res.status(404).json({ message: 'job not found' });
    return;
  }
  res.json(serializeWalletJob(job));
});

app.get('/api/wallet/balance', async (req: Request, res: Response) => {
  const mint = req.query.mint as string | undefined;
  const args = ['wallet', 'balance'];
  if (mint) {
    args.push('--mint', mint);
  }

  try {
    const result = await runLakeside(args);
    res.json({ ok: true, output: result.stdout || result.stderr });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

app.post('/api/faucet/start', async (req: Request, res: Response) => {
  if (faucetProcess) {
    res.status(409).json({ message: 'faucet already running' });
    return;
  }

  const {
    mint,
    bind = '0.0.0.0:8080',
    tokenCount,
    fixedAmount,
    lowerBound,
    upperBound,
    storePath,
  } = req.body;

  if (!mint || !tokenCount) {
    res.status(400).json({ message: 'mint and tokenCount are required' });
    return;
  }

  const finalStorePath = storePath || DEFAULT_TICKETS_STORE;
  const args = ['faucet', 'serve', '--tickets', finalStorePath, '--bind', bind, '--mint', mint, '--token-count', String(tokenCount)];

  if (fixedAmount) {
    args.push('--fixed-amount', String(fixedAmount));
  } else if (lowerBound && upperBound) {
    args.push('--lower-bound', String(lowerBound), '--upper-bound', String(upperBound));
  } else {
    res.status(400).json({ message: 'Provide either fixedAmount or lowerBound + upperBound' });
    return;
  }

  try {
    faucetLogs = [];
    faucetStartedAt = new Date().toISOString();
    faucetOptions = { mint, bind, tokenCount, fixedAmount, lowerBound, upperBound, storePath: finalStorePath };

    const child = spawn(LAKESIDE_BIN, [...LAKESIDE_ARGS, ...args], {
      cwd: LAKESIDE_CWD,
      env: process.env,
    });

    faucetProcess = child;

    child.stdout?.on('data', (chunk) => {
      appendLog(chunk.toString());
    });

    child.stderr?.on('data', (chunk) => {
      appendLog(chunk.toString());
    });

    child.on('close', (code) => {
      appendLog(`faucet exited with code ${code}`);
      if (faucetProcess === child) {
        faucetProcess = null;
      }
      faucetStartedAt = null;
    });

    res.json({ ok: true, args });
  } catch (error) {
    faucetProcess = null;
    faucetStartedAt = null;
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

app.post('/api/faucet/stop', (_req: Request, res: Response) => {
  if (!faucetProcess) {
    res.status(400).json({ message: 'faucet is not running' });
    return;
  }

  faucetProcess.kill('SIGINT');
  faucetProcess = null;
  faucetStartedAt = null;
  appendLog('faucet process requested to stop');
  res.json({ ok: true });
});

app.get('/api/faucet/status', (_req: Request, res: Response) => {
  res.json({
    running: Boolean(faucetProcess),
    startedAt: faucetStartedAt,
    options: faucetOptions,
    logs: faucetLogs.slice(-100),
  });
});

app.post('/api/claim', async (req: Request, res: Response) => {
  const { ticketCode, faucetUrl } = req.body;

  if (!ticketCode) {
    res.status(400).json({ message: 'ticketCode is required' });
    return;
  }

  const baseUrl = faucetUrl || DEFAULT_FAUCET_URL;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket_code: ticketCode }),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      res.status(response.status).json({ message: data.message || 'claim failed', data });
      return;
    }

    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

app.get('/api/status', async (_req: Request, res: Response) => {
  const status: Record<string, unknown> = {
    faucet: {
      running: Boolean(faucetProcess),
      startedAt: faucetStartedAt,
      options: faucetOptions,
    },
  };

  try {
    const raw = await fs.readFile(DEFAULT_TICKETS_STORE, 'utf-8');
    const parsed = JSON.parse(raw);
    const total = parsed.tickets?.length || 0;
    const claimed = parsed.tickets?.filter((ticket: any) => ticket.status === 'claimed').length || 0;
    status.tickets = { total, claimed };
  } catch (error) {
    status.tickets = { message: (error as Error).message };
  }

  res.json(status);
});

const distDir = path.join(process.cwd(), 'dist');
const indexHtml = path.join(distDir, 'index.html');

try {
  await fs.access(indexHtml);
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(indexHtml);
  });
} catch {
  // ignore in dev mode
}

app.listen(PORT, () => {
  console.log(`catofa server listening on http://localhost:${PORT}`);
});
