#!/usr/bin/env node

/**
 * Mustard CLI
 *
 * Command-line interface for interacting with Mustard.
 * Connects the agent loop with LLM providers and tools.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

// ─── Type-only imports (free at runtime — TypeScript erases them) ──────
import type { LLMProvider } from '@pram1t/mustard-llm';
import type { ToolRegistry, Tool, ToolParameters, ToolResult, ExecutionContext } from '@pram1t/mustard-tools';
import type { PermissionMode, ApprovalCallback, SessionData } from '@pram1t/mustard-core';
import type { HooksConfig } from '@pram1t/mustard-config';
import type { HookExecutor } from '@pram1t/mustard-hooks';
import type { ServerConfig, StdioServerConfig, HttpServerConfig, AggregatedTool, CallToolResult, ContentItem, MCPRegistry as MCPRegistryT } from '@pram1t/mustard-mcp';

// ─── cli-ui imports (light, kept eager for fast --help/--version) ──────
import {
  banner,
  renderHelp,
  bootBanner,
  setTitle,
  success,
  warn,
  error as uiError,
  info,
  theme,
  term,
} from '@pram1t/mustard-cli-ui';

// ─── Lazy-loaded value bindings — populated by loadHeavyDeps() ─────────
// These are populated on first use; for `--help` / `--version` they
// stay undefined and the heavy modules are never loaded. Drops cold
// startup from ~1.4s to ~200ms on the fast paths.
let OpenAIProvider!: typeof import('@pram1t/mustard-llm').OpenAIProvider;
let AnthropicProvider!: typeof import('@pram1t/mustard-llm').AnthropicProvider;
let GeminiProvider!: typeof import('@pram1t/mustard-llm').GeminiProvider;
let OllamaProvider!: typeof import('@pram1t/mustard-llm').OllamaProvider;
let OpenAICompatibleProvider!: typeof import('@pram1t/mustard-llm').OpenAICompatibleProvider;
let createRouter!: typeof import('@pram1t/mustard-llm').createRouter;
let createDefaultRegistry!: typeof import('@pram1t/mustard-tools').createDefaultRegistry;
let AgentLoop!: typeof import('@pram1t/mustard-core').AgentLoop;
let PermissionManager!: typeof import('@pram1t/mustard-core').PermissionManager;
let SessionManager!: typeof import('@pram1t/mustard-core').SessionManager;
let createLogger!: typeof import('@pram1t/mustard-logger').createLogger;
let setDefaultLogger!: typeof import('@pram1t/mustard-logger').setDefaultLogger;
let loadConfig!: typeof import('@pram1t/mustard-config').loadConfig;
let validateStartup!: typeof import('@pram1t/mustard-config').validateStartup;
let loadResolvedConfig!: typeof import('@pram1t/mustard-config').loadResolvedConfig;
let createHookExecutor!: typeof import('@pram1t/mustard-hooks').createHookExecutor;
let MCPRegistry!: typeof import('@pram1t/mustard-mcp').MCPRegistry;
let createRegistry!: typeof import('@pram1t/mustard-mcp').createRegistry;
let initCommand: any, configCommand: any, plansCommand: any, orchestrateCommand: any;
let workerCommand: any, requestCommand: any, serverCommand: any;

let _heavyDepsLoaded = false;
async function loadHeavyDeps(): Promise<void> {
  if (_heavyDepsLoaded) return;
  // Use require() rather than dynamic import() — both are lazy in CJS
  // output, but require() avoids Node's CJS-importing-CJS-via-ESM-loader
  // edge case that throws "Cannot read properties of undefined (reading
  // 'async')" on certain mixed-module workspace setups.
  const llm = require('@pram1t/mustard-llm');
  const tools = require('@pram1t/mustard-tools');
  const core = require('@pram1t/mustard-core');
  const logger = require('@pram1t/mustard-logger');
  const config = require('@pram1t/mustard-config');
  const hooks = require('@pram1t/mustard-hooks');
  const mcp = require('@pram1t/mustard-mcp');
  const cmds = require('./commands/index.js');
  ({ OpenAIProvider, AnthropicProvider, GeminiProvider, OllamaProvider, OpenAICompatibleProvider, createRouter } = llm);
  ({ createDefaultRegistry } = tools);
  ({ AgentLoop, PermissionManager, SessionManager } = core);
  ({ createLogger, setDefaultLogger } = logger);
  ({ loadConfig, validateStartup, loadResolvedConfig } = config);
  ({ createHookExecutor } = hooks);
  ({ MCPRegistry, createRegistry } = mcp);
  ({ initCommand, configCommand, plansCommand, orchestrateCommand, workerCommand, requestCommand, serverCommand } = cmds);
  _heavyDepsLoaded = true;
}

// Read version from our own package.json so `--version` always reflects
// the published version. CLI compiles to CommonJS, so __dirname is a
// global at runtime. dist/index.js → ../package.json.
const PKG_JSON = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
);
const VERSION: string = PKG_JSON.version ?? '0.0.0';

/**
 * MCP config file location
 */
const MCP_CONFIG_DIR = path.join(os.homedir(), '.mustard');
const MCP_CONFIG_FILE = path.join(MCP_CONFIG_DIR, 'mcp.json');

/**
 * MCP configuration format
 */
interface MCPConfig {
  servers: Record<string, ServerConfig>;
}

/**
 * Load MCP configuration from file
 */
function loadMCPConfig(): MCPConfig {
  try {
    if (fs.existsSync(MCP_CONFIG_FILE)) {
      const content = fs.readFileSync(MCP_CONFIG_FILE, 'utf-8');
      return JSON.parse(content) as MCPConfig;
    }
  } catch {
    // Ignore errors, return empty config
  }
  return { servers: {} };
}

/**
 * Save MCP configuration to file
 */
function saveMCPConfig(config: MCPConfig): void {
  if (!fs.existsSync(MCP_CONFIG_DIR)) {
    fs.mkdirSync(MCP_CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(MCP_CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Supported providers
 */
type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openai-compatible';

/**
 * MCP subcommand arguments
 */
interface MCPSubcommand {
  action: 'add' | 'remove' | 'list';
  name?: string;
  type?: 'stdio' | 'http';
  command?: string;
  url?: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Session subcommand arguments
 */
interface SessionSubcommand {
  action: 'list' | 'show' | 'delete';
  id?: string;
}

/**
 * Init subcommand arguments
 */
interface InitSubcommand {
  global?: boolean;
  model?: string;
  provider?: string;
}

/**
 * Config subcommand arguments
 */
interface ConfigSubcommand {
  action: 'list' | 'get' | 'set' | 'edit' | 'path';
  key?: string;
  value?: string;
  global?: boolean;
}

/**
 * Plans subcommand arguments
 */
interface PlansSubcommand {
  action: 'list' | 'show' | 'delete';
  id?: string;
  status?: 'draft' | 'approved' | 'completed' | 'abandoned';
}

/**
 * Worker subcommand arguments
 */
interface WorkerSubcommand {
  action: 'list' | 'info';
  role?: string;
}

/**
 * Request subcommand arguments
 */
interface RequestSubcommand {
  action: 'submit' | 'execute';
  prompt: string;
}

/**
 * Server subcommand arguments
 */
interface ServerSubcommand {
  action: 'start';
  port?: number;
  host?: string;
  apiKey?: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): {
  help: boolean;
  version: boolean;
  model: string;
  provider: ProviderName;
  baseUrl: string;
  prompt: string;
  verbose: boolean;
  mcpSubcommand?: MCPSubcommand;
  sessionSubcommand?: SessionSubcommand;
  initSubcommand?: InitSubcommand;
  configSubcommand?: ConfigSubcommand;
  plansSubcommand?: PlansSubcommand;
  workerSubcommand?: WorkerSubcommand;
  requestSubcommand?: RequestSubcommand;
  serverSubcommand?: ServerSubcommand;
  resume?: string;
  noSave: boolean;
  permissionMode: PermissionMode;
  allowTools: string[];
  denyTools: string[];
  orchestrate: boolean;
  approve: boolean;
  maxWorkers: number;
} {
  const args = process.argv.slice(2);
  let help = false;
  let version = false;
  let model = '';
  let provider: ProviderName = 'openai';
  let baseUrl = '';
  let verbose = false;
  const promptParts: string[] = [];
  let mcpSubcommand: MCPSubcommand | undefined;
  let sessionSubcommand: SessionSubcommand | undefined;
  let initSubcommand: InitSubcommand | undefined;
  let configSubcommand: ConfigSubcommand | undefined;
  let plansSubcommand: PlansSubcommand | undefined;
  let workerSubcommand: WorkerSubcommand | undefined;
  let requestSubcommand: RequestSubcommand | undefined;
  let serverSubcommand: ServerSubcommand | undefined;
  let resume: string | undefined;
  let noSave = false;
  let orchestrate = false;
  let approve = false;
  let maxWorkers = 3;
  let permissionMode: PermissionMode = 'default';
  const allowTools: string[] = [];
  const denyTools: string[] = [];

  // Check for MCP subcommand
  if (args[0] === 'mcp') {
    const mcpAction = args[1];
    if (mcpAction === 'list') {
      mcpSubcommand = { action: 'list' };
    } else if (mcpAction === 'add' && args[2]) {
      const name = args[2];
      let type: 'stdio' | 'http' = 'stdio';
      let command = '';
      let url = '';
      const serverArgs: string[] = [];
      const env: Record<string, string> = {};

      for (let i = 3; i < args.length; i++) {
        if (args[i] === '--type' || args[i] === '-t') {
          type = args[++i] as 'stdio' | 'http';
        } else if (args[i] === '--command' || args[i] === '-c') {
          command = args[++i] || '';
        } else if (args[i] === '--url' || args[i] === '-u') {
          url = args[++i] || '';
        } else if (args[i] === '--arg') {
          serverArgs.push(args[++i] || '');
        } else if (args[i] === '--env') {
          const envPair = args[++i] || '';
          const [key, value] = envPair.split('=');
          if (key && value) {
            env[key] = value;
          }
        }
      }

      mcpSubcommand = { action: 'add', name, type, command, url, args: serverArgs, env };
    } else if (mcpAction === 'remove' && args[2]) {
      mcpSubcommand = { action: 'remove', name: args[2] };
    } else {
      // Show MCP help
      help = true;
    }

    return { help, version, model, provider, baseUrl, prompt: '', verbose, mcpSubcommand, sessionSubcommand, initSubcommand, configSubcommand, plansSubcommand, workerSubcommand, requestSubcommand, serverSubcommand, resume, noSave, permissionMode, allowTools, denyTools, orchestrate, approve, maxWorkers };
  }

  // Check for session subcommand
  if (args[0] === 'session' || args[0] === 'sessions') {
    const sessionAction = args[1];
    if (sessionAction === 'list' || !sessionAction) {
      sessionSubcommand = { action: 'list' };
    } else if (sessionAction === 'show' && args[2]) {
      sessionSubcommand = { action: 'show', id: args[2] };
    } else if (sessionAction === 'delete' && args[2]) {
      sessionSubcommand = { action: 'delete', id: args[2] };
    } else {
      // Show session help
      help = true;
    }

    return { help, version, model, provider, baseUrl, prompt: '', verbose, mcpSubcommand, sessionSubcommand, initSubcommand, configSubcommand, plansSubcommand, workerSubcommand, requestSubcommand, serverSubcommand, resume, noSave, permissionMode, allowTools, denyTools, orchestrate, approve, maxWorkers };
  }

  // Check for init subcommand
  if (args[0] === 'init') {
    const initOpts: InitSubcommand = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--global' || args[i] === '-g') {
        initOpts.global = true;
      } else if (args[i] === '--model' || args[i] === '-m') {
        initOpts.model = args[++i];
      } else if (args[i] === '--provider' || args[i] === '-p') {
        initOpts.provider = args[++i];
      }
    }
    initSubcommand = initOpts;
    return { help, version, model, provider, baseUrl, prompt: '', verbose, mcpSubcommand, sessionSubcommand, initSubcommand, configSubcommand, plansSubcommand, workerSubcommand, requestSubcommand, serverSubcommand, resume, noSave, permissionMode, allowTools, denyTools, orchestrate, approve, maxWorkers };
  }

  // Check for config subcommand
  if (args[0] === 'config') {
    const action = args[1] as ConfigSubcommand['action'] || 'list';
    const configOpts: ConfigSubcommand = { action };

    if (action === 'get' || action === 'set') {
      configOpts.key = args[2];
      if (action === 'set') {
        configOpts.value = args[3];
      }
    }

    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--global' || args[i] === '-g') {
        configOpts.global = true;
      }
    }

    configSubcommand = configOpts;
    return { help, version, model, provider, baseUrl, prompt: '', verbose, mcpSubcommand, sessionSubcommand, initSubcommand, configSubcommand, plansSubcommand, workerSubcommand, requestSubcommand, serverSubcommand, resume, noSave, permissionMode, allowTools, denyTools, orchestrate, approve, maxWorkers };
  }

  // Check for plans subcommand
  if (args[0] === 'plans' || args[0] === 'plan') {
    const action = (args[1] || 'list') as PlansSubcommand['action'];
    const plansOpts: PlansSubcommand = { action };

    if (action === 'show' || action === 'delete') {
      plansOpts.id = args[2];
    }

    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--status' || args[i] === '-s') {
        plansOpts.status = args[++i] as PlansSubcommand['status'];
      }
    }

    plansSubcommand = plansOpts;
    return { help, version, model, provider, baseUrl, prompt: '', verbose, mcpSubcommand, sessionSubcommand, initSubcommand, configSubcommand, plansSubcommand, workerSubcommand, requestSubcommand, serverSubcommand, resume, noSave, permissionMode, allowTools, denyTools, orchestrate, approve, maxWorkers };
  }

  // Check for worker subcommand
  if (args[0] === 'worker' || args[0] === 'workers') {
    const workerAction = (args[1] || 'list') as WorkerSubcommand['action'];
    const workerOpts: WorkerSubcommand = { action: workerAction };

    if (workerAction === 'info') {
      workerOpts.role = args[2];
    }

    workerSubcommand = workerOpts;
    return { help, version, model, provider, baseUrl, prompt: '', verbose, mcpSubcommand, sessionSubcommand, initSubcommand, configSubcommand, plansSubcommand, workerSubcommand, requestSubcommand, serverSubcommand, resume, noSave, permissionMode, allowTools, denyTools, orchestrate, approve, maxWorkers };
  }

  // Check for request subcommand
  if (args[0] === 'request') {
    const reqAction = (args[1] || 'submit') as RequestSubcommand['action'];
    const reqPrompt = args.slice(2).join(' ');

    requestSubcommand = { action: reqAction, prompt: reqPrompt };
    return { help, version, model, provider, baseUrl, prompt: '', verbose, mcpSubcommand, sessionSubcommand, initSubcommand, configSubcommand, plansSubcommand, workerSubcommand, requestSubcommand, serverSubcommand, resume, noSave, permissionMode, allowTools, denyTools, orchestrate, approve, maxWorkers };
  }

  // Check for server subcommand
  if (args[0] === 'server') {
    const srvAction = (args[1] || 'start') as ServerSubcommand['action'];
    const srvOpts: ServerSubcommand = { action: srvAction };

    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--port') {
        srvOpts.port = parseInt(args[++i] || '3100', 10);
      } else if (args[i] === '--host') {
        srvOpts.host = args[++i];
      } else if (args[i] === '--api-key') {
        srvOpts.apiKey = args[++i];
      }
    }

    serverSubcommand = srvOpts;
    return { help, version, model, provider, baseUrl, prompt: '', verbose, mcpSubcommand, sessionSubcommand, initSubcommand, configSubcommand, plansSubcommand, workerSubcommand, requestSubcommand, serverSubcommand, resume, noSave, permissionMode, allowTools, denyTools, orchestrate, approve, maxWorkers };
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--version' || arg === '-v') {
      version = true;
    } else if (arg === '--verbose' || arg === '-V') {
      verbose = true;
    } else if (arg === '--model' || arg === '-m') {
      model = args[++i] || model;
    } else if (arg === '--provider' || arg === '-p') {
      provider = (args[++i] || 'openai') as ProviderName;
    } else if (arg === '--base-url') {
      baseUrl = args[++i] || '';
    } else if (arg === '--permission-mode' || arg === '-P') {
      const mode = args[++i] || 'default';
      if (['permissive', 'default', 'strict'].includes(mode)) {
        permissionMode = mode as PermissionMode;
      }
    } else if (arg === '--allow-tool') {
      const tool = args[++i];
      if (tool) allowTools.push(tool);
    } else if (arg === '--deny-tool') {
      const tool = args[++i];
      if (tool) denyTools.push(tool);
    } else if (arg === '--resume' || arg === '-r') {
      resume = args[++i];
    } else if (arg === '--no-save') {
      noSave = true;
    } else if (arg === '--orchestrate' || arg === '-O') {
      orchestrate = true;
    } else if (arg === '--approve' || arg === '-A') {
      approve = true;
    } else if (arg === '--max-workers') {
      maxWorkers = parseInt(args[++i] || '3', 10) || 3;
    } else if (!arg.startsWith('-')) {
      promptParts.push(arg);
    }
  }

  return {
    help,
    version,
    model,
    provider,
    baseUrl,
    prompt: promptParts.join(' '),
    verbose,
    mcpSubcommand,
    sessionSubcommand,
    initSubcommand,
    configSubcommand,
    plansSubcommand,
    workerSubcommand,
    requestSubcommand,
    serverSubcommand,
    resume,
    noSave,
    permissionMode,
    allowTools,
    denyTools,
    orchestrate,
    approve,
    maxWorkers,
  };
}

/**
 * Print help message — rendered via @pram1t/mustard-cli-ui.
 */
function printHelp(): void {
  process.stdout.write(
    renderHelp({
      version: VERSION,
      sections: [
        {
          title: 'USAGE',
          lines: [
            'mustard [options] <prompt>',
            'mustard <subcommand> [options]',
          ],
        },
        {
          title: 'COMMANDS',
          rows: [
            ['init', 'create a project or global .mustard/ folder'],
            ['config', 'inspect / edit your config'],
            ['plans', 'list, show, or delete saved plans'],
            ['worker', 'list available worker roles'],
            ['request', 'submit or execute a multi-worker request'],
            ['server', 'start the API server'],
            ['session', 'list / show / delete saved sessions'],
            ['mcp', 'add / list / remove MCP servers'],
            ['collab', 'multiplayer fields + sown intents (live)'],
          ],
        },
        {
          title: 'OPTIONS',
          rows: [
            ['-h, --help', 'show this help'],
            ['-v, --version', 'show version'],
            ['-m, --model <name>', 'model (provider-specific default)'],
            ['-p, --provider <name>', 'openai · anthropic · gemini · ollama · openai-compatible'],
            ['--base-url <url>', 'for ollama / openai-compatible'],
            ['-r, --resume <id>', 'resume a previous session'],
            ['--no-save', "don't save the session"],
            ['-P, --permission-mode <mode>', 'permissive · default · strict'],
            ['--allow-tool <name>', 'always allow a tool (repeatable)'],
            ['--deny-tool <name>', 'always deny a tool (repeatable)'],
            ['-O, --orchestrate', 'multi-worker orchestrated execution'],
            ['-A, --approve', 'require plan approval (with -O)'],
            ['--max-workers <n>', 'parallel workers (default 3)'],
            ['-V, --verbose', 'verbose output'],
          ],
        },
        {
          title: 'PROVIDERS',
          rows: [
            ['openai', 'OpenAI GPT models (default gpt-4o)'],
            ['anthropic', 'Anthropic Claude models (default claude-sonnet-4)'],
            ['gemini', 'Google Gemini (default gemini-1.5-pro)'],
            ['ollama', 'Local Ollama (default qwen2.5-coder:7b)'],
            ['openai-compatible', 'any OpenAI-compatible API (needs --base-url)'],
          ],
        },
        {
          title: 'EXAMPLES',
          lines: [
            '$ mustard "Hello, who are you?"',
            '$ mustard --provider anthropic "Explain this code"',
            '$ mustard --orchestrate "Build a REST API with auth, tests, docs"',
            '$ mustard collab login --as alice',
            '$ mustard collab room create "auth refactor"',
            '$ mustard collab tail <field-id>',
          ],
        },
        {
          title: 'ENV',
          rows: [
            ['OPENAI_API_KEY', 'openai + openai-compatible'],
            ['ANTHROPIC_API_KEY', 'anthropic'],
            ['GOOGLE_API_KEY', 'gemini'],
            ['LOG_LEVEL', 'trace · debug · info · warn · error'],
          ],
        },
        {
          title: 'LINKS',
          rows: [
            ['docs', 'github.com/pram1t/Mustard#readme'],
            ['issues', 'github.com/pram1t/Mustard/issues'],
            ['npm', 'npmjs.com/package/@pram1t/mustard'],
          ],
        },
      ],
    }),
  );
}

/**
 * Create LLM provider based on configuration
 */
function createProvider(
  providerName: ProviderName,
  model: string,
  baseUrl: string
): LLMProvider {
  switch (providerName) {
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required for openai provider.');
      }
      return new OpenAIProvider({
        apiKey,
        model: model || 'gpt-4o',
      });
    }

    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required for anthropic provider.');
      }
      return new AnthropicProvider({
        apiKey,
        model: model || 'claude-sonnet-4-20250514',
      });
    }

    case 'gemini': {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error('GOOGLE_API_KEY environment variable is required for gemini provider.');
      }
      return new GeminiProvider({
        apiKey,
        model: model || 'gemini-1.5-pro',
      });
    }

    case 'ollama': {
      return new OllamaProvider({
        baseURL: baseUrl || 'http://localhost:11434',
        model: model || 'qwen2.5-coder:7b',
      });
    }

    case 'openai-compatible': {
      if (!baseUrl) {
        throw new Error('--base-url is required for openai-compatible provider.');
      }
      return new OpenAICompatibleProvider({
        baseURL: baseUrl,
        apiKey: process.env.OPENAI_API_KEY,
        model: model || 'gpt-3.5-turbo',
      });
    }

    default:
      throw new Error(`Unknown provider: ${providerName}. Use --help to see available providers.`);
  }
}

/**
 * Handle MCP subcommands
 */
async function handleMCPSubcommand(subcommand: MCPSubcommand): Promise<void> {
  const mcpConfig = loadMCPConfig();

  switch (subcommand.action) {
    case 'list': {
      const servers = Object.entries(mcpConfig.servers);
      if (servers.length === 0) {
        console.log('No MCP servers configured.');
        console.log('Use "mustard mcp add <name> ..." to add a server.');
      } else {
        console.log('Configured MCP servers:\n');
        for (const [name, config] of servers) {
          if (config.type === 'stdio') {
            const stdioConfig = config as StdioServerConfig;
            console.log(`  ${name} (stdio)`);
            console.log(`    Command: ${stdioConfig.command}`);
            if (stdioConfig.args?.length) {
              console.log(`    Args: ${stdioConfig.args.join(' ')}`);
            }
            if (stdioConfig.env && Object.keys(stdioConfig.env).length) {
              console.log(`    Env: ${Object.keys(stdioConfig.env).join(', ')}`);
            }
          } else {
            const httpConfig = config as HttpServerConfig;
            console.log(`  ${name} (http)`);
            console.log(`    URL: ${httpConfig.url}`);
          }
          console.log('');
        }
      }
      break;
    }

    case 'add': {
      if (!subcommand.name) {
        console.error('Error: Server name is required.');
        process.exit(1);
      }

      if (mcpConfig.servers[subcommand.name]) {
        console.error(`Error: Server '${subcommand.name}' already exists. Remove it first.`);
        process.exit(1);
      }

      let config: ServerConfig;
      if (subcommand.type === 'http') {
        if (!subcommand.url) {
          console.error('Error: --url is required for http servers.');
          process.exit(1);
        }
        config = {
          type: 'http',
          url: subcommand.url,
        } as HttpServerConfig;
      } else {
        if (!subcommand.command) {
          console.error('Error: --command is required for stdio servers.');
          process.exit(1);
        }
        config = {
          type: 'stdio',
          command: subcommand.command,
          args: subcommand.args?.length ? subcommand.args : undefined,
          env: subcommand.env && Object.keys(subcommand.env).length ? subcommand.env : undefined,
        } as StdioServerConfig;
      }

      mcpConfig.servers[subcommand.name] = config;
      saveMCPConfig(mcpConfig);
      console.log(`Added MCP server '${subcommand.name}'.`);
      break;
    }

    case 'remove': {
      if (!subcommand.name) {
        console.error('Error: Server name is required.');
        process.exit(1);
      }

      if (!mcpConfig.servers[subcommand.name]) {
        console.error(`Error: Server '${subcommand.name}' not found.`);
        process.exit(1);
      }

      delete mcpConfig.servers[subcommand.name];
      saveMCPConfig(mcpConfig);
      console.log(`Removed MCP server '${subcommand.name}'.`);
      break;
    }
  }
}

/**
 * Handle session subcommands
 */
async function handleSessionSubcommand(subcommand: SessionSubcommand): Promise<void> {
  const sessionManager = new SessionManager();

  switch (subcommand.action) {
    case 'list': {
      const sessions = sessionManager.list();
      if (sessions.length === 0) {
        console.log('No saved sessions found.');
        console.log('Sessions are automatically saved when you run mustard.');
      } else {
        console.log('Saved sessions:\n');
        for (const session of sessions) {
          console.log(`  ${session.id}`);
          console.log(`    Messages: ${session.messageCount}`);
          console.log(`    Updated: ${session.updatedAt}`);
          console.log(`    CWD: ${session.cwd}\n`);
        }
      }
      break;
    }

    case 'show': {
      if (!subcommand.id) {
        console.error('Error: Session ID is required.');
        process.exit(1);
      }

      const data = sessionManager.load(subcommand.id);
      if (!data) {
        console.error(`Session not found: ${subcommand.id}`);
        process.exit(1);
      }

      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case 'delete': {
      if (!subcommand.id) {
        console.error('Error: Session ID is required.');
        process.exit(1);
      }

      if (sessionManager.delete(subcommand.id)) {
        console.log(`Deleted session: ${subcommand.id}`);
      } else {
        console.error(`Session not found: ${subcommand.id}`);
        process.exit(1);
      }
      break;
    }
  }
}

/**
 * Wrapper class for MCP tools to work with ToolRegistry
 */
class MCPToolWrapper implements Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;

  constructor(
    private mcpTool: AggregatedTool,
    private registry: MCPRegistryT
  ) {
    this.name = mcpTool.name;
    this.description = mcpTool.description;
    this.parameters = mcpTool.parameters as ToolParameters;
  }

  async execute(params: Record<string, unknown>, _context: ExecutionContext): Promise<ToolResult> {
    try {
      const result: CallToolResult = await this.registry.callTool(this.name, params);

      // Convert MCP content to string output
      const output = result.content
        .map((item: ContentItem) => {
          if (item.type === 'text') {
            return item.text;
          } else if (item.type === 'image') {
            return `[Image: ${item.mimeType}]`;
          } else if (item.type === 'resource') {
            return item.resource.text || `[Resource: ${item.resource.uri}]`;
          }
          return '';
        })
        .join('\n');

      return {
        success: !result.isError,
        output,
        error: result.isError ? output : undefined,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Create MCP registry and connect to servers
 */
async function createMCPRegistry(verbose: boolean): Promise<MCPRegistryT | null> {
  const mcpConfig = loadMCPConfig();

  if (Object.keys(mcpConfig.servers).length === 0) {
    return null;
  }

  const registry = createRegistry(mcpConfig.servers);

  if (verbose) {
    console.log(`[MCP] Connecting to ${Object.keys(mcpConfig.servers).length} server(s)...`);
  }

  await registry.connectAll();

  const tools = registry.getAllTools();
  if (verbose && tools.length > 0) {
    console.log(`[MCP] Loaded ${tools.length} tool(s) from MCP servers`);
  }

  return registry;
}

/**
 * Get wrapped MCP tools as Tool instances
 */
function getMCPTools(registry: MCPRegistryT): Tool[] {
  return registry.getAllTools().map((tool) => new MCPToolWrapper(tool, registry));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Early intercept for `mustard collab ...` — handles its own argv and
  // exits directly. Avoids threading a new subcommand through the
  // monolithic parseArgs() below.
  const rawArgv = process.argv.slice(2);
  if (rawArgv[0] === 'collab') {
    const { collabMain } = await import('./commands/collab.js');
    process.exit(await collabMain(rawArgv.slice(1)));
  }

  const args = parseArgs();

  // Handle help and version flags
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    process.stdout.write(banner({ size: 'inline', version: VERSION }));
    process.exit(0);
  }

  // No-args fast path — show banner and exit (don't load heavy deps).
  if (
    !args.help &&
    !args.requestSubcommand &&
    !args.serverSubcommand &&
    !args.mcpSubcommand &&
    !args.sessionSubcommand &&
    !args.initSubcommand &&
    !args.configSubcommand &&
    !args.plansSubcommand &&
    !args.workerSubcommand &&
    !args.prompt
  ) {
    await bootBanner({ version: VERSION });
    process.exit(0);
  }

  // Past the fast-paths — load the heavy deps (LLM SDKs, tools, MCP, etc.)
  // This is the cold-startup hit; ~1.2s on first call, near-zero after.
  await loadHeavyDeps();

  // Handle MCP subcommands
  if (args.mcpSubcommand) {
    await handleMCPSubcommand(args.mcpSubcommand);
    process.exit(0);
  }

  // Handle session subcommands
  if (args.sessionSubcommand) {
    await handleSessionSubcommand(args.sessionSubcommand);
    process.exit(0);
  }

  // Handle init subcommand
  if (args.initSubcommand) {
    await initCommand(process.cwd(), {
      global: args.initSubcommand.global,
      model: args.initSubcommand.model,
      provider: args.initSubcommand.provider,
    });
    process.exit(0);
  }

  // Handle config subcommand
  if (args.configSubcommand) {
    await configCommand(
      process.cwd(),
      args.configSubcommand.action,
      args.configSubcommand.key,
      args.configSubcommand.value,
      { global: args.configSubcommand.global }
    );
    process.exit(0);
  }

  // Handle plans subcommand
  if (args.plansSubcommand) {
    await plansCommand(
      process.cwd(),
      args.plansSubcommand.action,
      args.plansSubcommand.id,
      { status: args.plansSubcommand.status }
    );
    process.exit(0);
  }

  // Handle worker subcommand (no LLM needed)
  if (args.workerSubcommand) {
    await workerCommand(args.workerSubcommand.action, {
      role: args.workerSubcommand.role,
      verbose: args.verbose,
    });
    process.exit(0);
  }

  // Handle request subcommand (needs LLM — initialized below)
  if (args.requestSubcommand) {
    if (!args.requestSubcommand.prompt) {
      console.error('Error: A prompt is required for request commands.');
      console.error('Usage: mustard request submit "<prompt>"');
      process.exit(1);
    }

    // Request commands need LLM infrastructure — fall through to provider setup
    // and handle after router/tools are created
  }

  // Require a prompt (for both single-agent and orchestrate modes; request/server have their own args)
  if (!args.requestSubcommand && !args.serverSubcommand && !args.prompt) {
    // Should be caught by the fast-path no-args check above, but kept
    // as a safety net for combinations like `mustard --provider openai`
    // (which has no prompt).
    process.stdout.write(uiError('no prompt provided', {
      hints: [{ cmd: 'mustard --help', desc: 'see all commands' }],
    }));
    process.exit(1);
  }

  // Initialize configuration
  const config = loadConfig();

  // Initialize logger
  const logLevel = args.verbose ? 'debug' : config.logging.level;
  const logFormat = config.logging.format || 'pretty';
  const logger = createLogger({ level: logLevel, format: logFormat });
  setDefaultLogger(logger);

  // Validate required configuration (skip provider-specific checks since we handle them)
  try {
    // Don't call validateStartup since it checks for provider API keys
    // We handle that in createProvider
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Configuration error:', errorMsg);
    process.exit(1);
  }

  logger.debug('Starting Mustard CLI', {
    provider: args.provider,
    model: args.model || '(default)',
    promptLength: args.prompt.length,
  });

  try {
    // Create provider
    const provider = createProvider(args.provider, args.model, args.baseUrl);

    logger.debug('Provider created', {
      name: provider.name,
      model: provider.model,
      capabilities: provider.capabilities,
    });

    // Create router
    const router = createRouter(provider);

    // Create tool registry with Task tool for subagent support
    const tools = createDefaultRegistry({ includeTaskTool: true });

    logger.debug('Built-in tools registered', { count: tools.count, tools: tools.getNames() });

    // Load MCP tools
    let mcpRegistry: MCPRegistryT | null = null;
    try {
      mcpRegistry = await createMCPRegistry(args.verbose);
      if (mcpRegistry) {
        const mcpTools = getMCPTools(mcpRegistry);
        tools.registerAll(mcpTools);
        logger.debug('MCP tools registered', {
          count: mcpTools.length,
          tools: mcpTools.map((t) => t.name),
        });
      }
    } catch (error) {
      logger.warn('Failed to load MCP tools', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (args.verbose) {
        console.warn(`[MCP] Warning: Failed to load MCP tools: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Handle server subcommand — start the API server
    if (args.serverSubcommand) {
      await serverCommand(args.serverSubcommand.action, {
        router,
        tools,
        port: args.serverSubcommand.port,
        host: args.serverSubcommand.host,
        apiKey: args.serverSubcommand.apiKey,
        maxWorkers: args.maxWorkers,
        verbose: args.verbose,
      });
      return; // Server runs until killed
    }

    // Handle request subcommand — V2 multi-worker with plan approval
    if (args.requestSubcommand) {
      await requestCommand(args.requestSubcommand.action, args.requestSubcommand.prompt, {
        router,
        tools,
        verbose: args.verbose,
        maxParallelWorkers: args.maxWorkers,
        cwd: process.cwd(),
      });

      if (mcpRegistry) {
        await mcpRegistry.disconnectAll();
      }
      return;
    }

    // Handle orchestrate mode — branch to multi-worker execution
    if (args.orchestrate) {
      // If --approve flag is set, use the interactive request submit flow
      if (args.approve) {
        await requestCommand('submit', args.prompt, {
          router,
          tools,
          verbose: args.verbose,
          maxParallelWorkers: args.maxWorkers,
          cwd: process.cwd(),
        });

        if (mcpRegistry) {
          await mcpRegistry.disconnectAll();
        }
        return;
      }

      await orchestrateCommand(args.prompt, {
        router,
        tools,
        verbose: args.verbose,
        maxParallelWorkers: args.maxWorkers,
        cwd: process.cwd(),
      });

      // Cleanup MCP connections
      if (mcpRegistry) {
        await mcpRegistry.disconnectAll();
      }
      return;
    }

    // Session management
    const sessionManager = new SessionManager();
    let existingSession: SessionData | null = null;
    let sessionId: string;

    // Handle session resume
    if (args.resume) {
      existingSession = sessionManager.load(args.resume);
      if (!existingSession) {
        console.error(`Session not found: ${args.resume}`);
        process.exit(1);
      }
      sessionId = args.resume;
      console.log(`Resuming session: ${sessionId}\n`);
    } else {
      sessionId = sessionManager.generateId();
      if (!args.noSave) {
        console.log(`Session: ${sessionId}\n`);
      }
    }

    // Create hook executor if hooks are configured
    let hookExecutor: HookExecutor | undefined;

    if (config.hooks && Object.values(config.hooks).some(arr => arr && arr.length > 0)) {
      hookExecutor = createHookExecutor(config.hooks, {
        sessionId,
        cwd: process.cwd(),
      });

      const hookCount = Object.values(config.hooks).reduce((sum, arr) => sum + (arr?.length || 0), 0);
      logger.debug('Hooks loaded', { count: hookCount });
      if (args.verbose) {
        console.log(`[Hooks] Loaded ${hookCount} hook(s)`);
      }
    }

    // Create permission manager
    const permissions = new PermissionManager({
      mode: args.permissionMode,
    });

    // Add custom allow rules
    for (const tool of args.allowTools) {
      permissions.addAllowRule({ tool, reason: `Allowed via --allow-tool ${tool}` });
    }

    // Add custom deny rules
    for (const tool of args.denyTools) {
      permissions.addDenyRule({ tool, reason: `Denied via --deny-tool ${tool}` });
    }

    // Set up approval callback for interactive prompts
    const approvalCallback: ApprovalCallback = async (tool, params, reason) => {
      return new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        console.log(`\n[Permission Required]`);
        console.log(`  Tool: ${tool}`);
        console.log(`  Reason: ${reason}`);
        if (args.verbose) {
          console.log(`  Params: ${JSON.stringify(params).slice(0, 200)}`);
        }

        rl.question('  Allow? (y/N): ', (answer) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
      });
    };

    permissions.setApprovalCallback(approvalCallback);

    logger.debug('Permission manager created', {
      mode: args.permissionMode,
      allowTools: args.allowTools,
      denyTools: args.denyTools,
    });

    if (args.verbose) {
      console.log(`[Permissions] Mode: ${args.permissionMode}`);
      if (args.allowTools.length) {
        console.log(`[Permissions] Allowed: ${args.allowTools.join(', ')}`);
      }
      if (args.denyTools.length) {
        console.log(`[Permissions] Denied: ${args.denyTools.join(', ')}`);
      }
    }

    // Create agent - system prompt is auto-generated with OS awareness by @pram1t/mustard-core
    const agent = new AgentLoop(router, {
      tools,
      cwd: process.cwd(),
      sessionId,
      hooks: hookExecutor,
      permissions,
      enableSubagents: true, // Enable Task tool for spawning subagents
      // systemPrompt is automatically generated with:
      // - OS detection (Windows/macOS/Linux)
      // - Shell information (cmd.exe vs Bash)
      // - Working directory
      // - Cross-platform tool preferences
    });

    // Restore session context if resuming
    if (existingSession) {
      await agent.getContext().restore(existingSession.context);
      logger.debug('Session context restored', {
        messageCount: existingSession.metadata.messageCount,
      });
    }

    // Run the agent and stream output
    for await (const event of agent.run(args.prompt)) {
      switch (event.type) {
        case 'text':
          process.stdout.write(event.content);
          break;

        case 'thinking':
          if (args.verbose && event.iteration > 1) {
            console.log(`\n[Iteration ${event.iteration}]`);
          }
          break;

        case 'tool_call':
          console.log(`\n[Calling ${event.tool_call.name}...]`);
          if (args.verbose) {
            console.log(`  Args: ${JSON.stringify(event.tool_call.arguments)}`);
          }
          break;

        case 'tool_result':
          const status = event.result.success ? 'OK' : 'FAILED';
          if (args.verbose || !event.result.success) {
            console.log(`[${event.tool_name}: ${status}]`);
            if (!event.result.success) {
              console.log(`  ${event.result.error}`);
            }
          } else {
            console.log(`[${event.tool_name}: ${status}]`);
          }
          break;

        case 'error':
          console.error(`\nError: ${event.error}`);
          if (!event.recoverable) {
            process.exit(1);
          }
          break;

        case 'compaction':
          if (args.verbose) {
            console.log(`\n[Context compacted: ${event.messagesRemoved} messages removed]`);
          }
          break;

        case 'hook_triggered':
          if (args.verbose) {
            console.log(`\n[Hook: ${event.event} (${event.hookCount} hook(s))]`);
          }
          break;

        case 'hook_blocked':
          console.log(`\n[Hook blocked: ${event.event}]`);
          if (event.reason) {
            console.log(`  Reason: ${event.reason}`);
          }
          break;

        case 'hook_output':
          if (args.verbose && event.output) {
            console.log(`[Hook output: ${event.output}]`);
          }
          break;

        case 'permission_denied':
          console.log(`\n[Permission Denied] ${event.tool}: ${event.reason}`);
          break;

        case 'permission_ask':
          if (args.verbose) {
            const status = event.approved ? 'Approved' : 'Denied';
            console.log(`[Permission ${status}] ${event.tool}: ${event.reason}`);
          }
          break;

        case 'done':
          // Ensure output ends with newline
          console.log('');
          if (args.verbose) {
            console.log(`[Done: ${event.totalIterations} iterations, ${event.totalToolCalls} tool calls]`);
          }

          // Auto-save session
          if (!args.noSave) {
            const contextState = agent.getContext().getState();
            const createdAt = existingSession?.metadata.createdAt || new Date().toISOString();

            sessionManager.save({
              id: sessionId,
              version: 1,
              metadata: {
                cwd: process.cwd(),
                createdAt,
                updatedAt: new Date().toISOString(),
                messageCount: contextState.messages.length,
                provider: provider.name,
                model: provider.model,
              },
              context: contextState,
            });

            if (args.verbose) {
              console.log(`[Session saved: ${sessionId}]`);
            }
          }
          break;
      }
    }

    // Cleanup MCP connections
    if (mcpRegistry) {
      await mcpRegistry.disconnectAll();
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('CLI error', { error: errorMsg });
    console.error(`\nError: ${errorMsg}`);
    process.exit(1);
  }
}

// Run main
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
