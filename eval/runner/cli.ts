import type { EvalMode, EvalRunOptions, EvalSuite, LoadedEvalCase, OrbitEvalOutput } from './types';
import { DEFAULT_DATA_DIR, DEFAULT_RUNS_DIR, DEFAULT_WEB_RESULTS_DIR } from './paths';
import { datasetSpec, ensureDataset, loadCases } from './datasets';
import { runOrbitCurrentCase } from './orbit-current';
import { scoreCase } from './scoring';
import { createRunRecord } from './results';
import { createHyMemoryRuntime, type HyMemoryRuntime, runHyMemoryCase } from './hy-memory';

async function main(): Promise<void> {
  const [command = 'help', ...argv] = process.argv.slice(2);
  const flags = parseFlags(argv);
  if (command === 'sync') {
    await syncCommand(optionsFromFlags(flags));
    return;
  }
  if (command === 'run') {
    await runCommand(optionsFromFlags(flags));
    return;
  }
  printHelp();
}

async function syncCommand(options: EvalRunOptions): Promise<void> {
  const suites = suitesFromOption(options.suite);
  for (const suite of suites) {
    const split = suite === 'longmemeval' ? options.longmemevalSplit : options.personamemSplit;
    const spec = datasetSpec(suite, split, options.dataDir);
    console.log(`Syncing ${suite}/${split}`);
    await ensureDataset(spec);
  }
}

async function runCommand(options: EvalRunOptions): Promise<void> {
  await syncCommand(options);
  const startedAt = new Date().toISOString();
  const suites = suitesFromOption(options.suite);
  const suiteResults = [];
  const notes = [
    profileNote(options),
    'LongMemEval scoring is local exact/F1/context-containment, not the upstream LLM judge.',
    'PersonaMem scoring is exact multiple-choice option accuracy.'
  ];
  if (options.limit) notes.push(`Run limited to first ${options.limit} cases per suite.`);
  const hyRuntime = options.mode === 'hy-memory' ? await createHyMemoryRuntime(options, startedAt) : null;

  try {
    for (const suite of suites) {
      const split = suite === 'longmemeval' ? options.longmemevalSplit : options.personamemSplit;
      const cases = await loadCases(suite, split, options.dataDir, options.limit);
      console.log(`Running ${suite}/${split} (${cases.length} cases) with ${options.mode}`);
      const results = [];
      let index = 0;
      for (const loaded of cases) {
        index += 1;
        const output = await runCase(loaded, options, hyRuntime);
        const result = scoreCase({ loaded, output, suite, split, mode: options.mode });
        results.push(result);
        if (index === 1 || index % 10 === 0 || index === cases.length) {
          const correct = results.filter((item) => item.score.correct).length;
          console.log(`  ${suite}: ${index}/${cases.length} accuracy=${(correct / results.length).toFixed(3)}`);
        }
      }
      suiteResults.push({ suite, split, results });
    }
  } finally {
    await hyRuntime?.close();
  }

  const { runDir, summary } = await createRunRecord({
    runsDir: options.runsDir,
    webResultsDir: options.webResultsDir,
    mode: options.mode,
    startedAt,
    suiteResults,
    notes
  });
  console.log(`Run written to ${runDir}`);
  console.log(JSON.stringify(summary, null, 2));
}

function optionsFromFlags(flags: Record<string, string | boolean>): EvalRunOptions {
  const suite = stringFlag(flags, 'suite', 'both') as EvalRunOptions['suite'];
  if (!['both', 'longmemeval', 'personamem'].includes(suite)) throw new Error(`invalid_suite:${suite}`);
  const mode = stringFlag(flags, 'mode', 'orbit-current') as EvalMode;
  if (!['orbit-current', 'hy-memory'].includes(mode)) throw new Error(`invalid_mode:${mode}`);
  const hyMemoryPort = numberFlag(flags, 'hy-port') ?? 19527;
  return {
    suite,
    mode,
    longmemevalSplit: stringFlag(flags, 'longmemeval-split', stringFlag(flags, 'split', 'oracle')),
    personamemSplit: stringFlag(flags, 'personamem-split', stringFlag(flags, 'split', '32k')),
    limit: numberFlag(flags, 'limit'),
    concurrency: numberFlag(flags, 'concurrency') ?? 1,
    dataDir: stringFlag(flags, 'data-dir', DEFAULT_DATA_DIR),
    runsDir: stringFlag(flags, 'runs-dir', DEFAULT_RUNS_DIR),
    webResultsDir: stringFlag(flags, 'web-results-dir', DEFAULT_WEB_RESULTS_DIR),
    keepVaults: Boolean(flags['keep-vaults']),
    hyMemoryServerUrl: stringFlag(flags, 'hy-server-url', `http://127.0.0.1:${hyMemoryPort}`),
    hyMemoryPort,
    hyMemoryPythonPath: optionalStringFlag(flags, 'hy-python'),
    hyMemoryAutoStart: !Boolean(flags['hy-no-auto-start']),
    hyMemoryTopK: numberFlag(flags, 'hy-top-k') ?? 12,
    hyMemoryMinScore: floatFlag(flags, 'hy-min-score') ?? 0,
    hyMemoryUserPrefix: stringFlag(flags, 'hy-user-prefix', 'orbit-eval'),
    hyMemoryEnableAgent: !Boolean(flags['hy-disable-agent']),
    hyMemoryLocalEmbed: Boolean(flags['hy-local-embed']),
    keepHyMemories: Boolean(flags['hy-keep-memories'])
  };
}

function suitesFromOption(suite: EvalRunOptions['suite']): EvalSuite[] {
  return suite === 'both' ? ['longmemeval', 'personamem'] : [suite];
}

async function runCase(loaded: LoadedEvalCase, options: EvalRunOptions, hyRuntime: HyMemoryRuntime | null): Promise<OrbitEvalOutput> {
  if (options.mode === 'hy-memory') {
    if (!hyRuntime) throw new Error('hy_memory_runtime_missing');
    return await runHyMemoryCase(loaded, hyRuntime);
  }
  return await runOrbitCurrentCase(loaded, { keepVaults: options.keepVaults });
}

function profileNote(options: EvalRunOptions): string {
  if (options.mode === 'hy-memory') {
    if (options.hyMemoryLocalEmbed) {
      return 'hy-memory uses HY Memory pro mode with a local deterministic OpenAI-compatible model endpoint, then reuses the same local answer/scoring path as orbit-current.';
    }
    return 'hy-memory writes each benchmark conversation to HY Memory, searches the HY server, and uses the same local answer/scoring path as orbit-current.';
  }
  return 'orbit-current uses the checked-in PMIL MemoryStore, EvidenceChunkIndexStore, ContextPacket builder, and deterministic answer selection.';
}

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      index += 1;
    }
  }
  return out;
}

function stringFlag(flags: Record<string, string | boolean>, key: string, fallback: string): string {
  const value = flags[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function optionalStringFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberFlag(flags: Record<string, string | boolean>, key: string): number | undefined {
  const value = flags[key];
  if (typeof value !== 'string') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function floatFlag(flags: Record<string, string | boolean>, key: string): number | undefined {
  const value = flags[key];
  if (typeof value !== 'string') return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function printHelp(): void {
  console.log(`Orbit memory eval

Commands:
  sync  Download benchmark files
  run   Run an eval profile and publish web results

Examples:
  npm run eval:sync
  npm run eval:run -- --suite both
  npm run eval:run -- --mode hy-memory --suite personamem --limit 20
  npm run eval:run -- --mode hy-memory --hy-local-embed --suite personamem --limit 20
  npm run eval:run -- --suite personamem --personamem-split 32k --limit 50
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
