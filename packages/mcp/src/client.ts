/**
 * MCP Client
 *
 * High-level client for interacting with MCP servers.
 * Handles initialization, tool calls, resource reads, etc.
 */

import type { Transport } from './transport/types.js';
import type {
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCResponse,
  JSONRPCErrorResponse,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
  ServerInfo,
  MCPTool,
  ListToolsResult,
  CallToolParams,
  CallToolResult,
  MCPResource,
  ListResourcesResult,
  ReadResourceParams,
  ReadResourceResult,
  MCPPrompt,
  ListPromptsResult,
  GetPromptParams,
  GetPromptResult,
} from './types.js';
import { MCPError, MCP_VERSION } from './types.js';

/**
 * Client options
 */
export interface MCPClientOptions {
  /** Client name for identification */
  clientName?: string;
  /** Client version */
  clientVersion?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

const DEFAULT_OPTIONS: Required<MCPClientOptions> = {
  clientName: 'mustard',
  clientVersion: '0.0.0',
  timeout: 30000,
};

/**
 * MCP Client
 *
 * Provides a high-level interface for:
 * - Connecting to MCP servers
 * - Listing and calling tools
 * - Listing and reading resources
 * - Listing and getting prompts
 */
export class MCPClient {
  private options: Required<MCPClientOptions>;
  private requestId = 0;
  private initialized = false;
  private _capabilities: ServerCapabilities | null = null;
  private _serverInfo: ServerInfo | null = null;

  constructor(
    private transport: Transport,
    options: MCPClientOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Set up notification handler
    this.transport.onNotification = (notification) => {
      this.handleNotification(notification);
    };
  }

  /**
   * Get server capabilities (after initialization)
   */
  get capabilities(): ServerCapabilities | null {
    return this._capabilities;
  }

  /**
   * Get server info (after initialization)
   */
  get serverInfo(): ServerInfo | null {
    return this._serverInfo;
  }

  /**
   * Check if client is initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Connect to the server and perform initialization handshake
   */
  async connect(): Promise<InitializeResult> {
    // Start transport if not started
    if (this.transport.state === 'disconnected') {
      await this.transport.start();
    }

    // Send initialize request
    const initParams: InitializeParams = {
      protocolVersion: MCP_VERSION,
      capabilities: {
        roots: { listChanged: true },
      },
      clientInfo: {
        name: this.options.clientName,
        version: this.options.clientVersion,
      },
    };

    const response = await this.request('initialize', initParams);
    const result = response as InitializeResult;

    this._capabilities = result.capabilities;
    this._serverInfo = result.serverInfo;

    // Send initialized notification
    await this.notify('notifications/initialized', {});

    this.initialized = true;
    return result;
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    this.initialized = false;
    this._capabilities = null;
    this._serverInfo = null;
    await this.transport.close();
  }

  // ===========================================================================
  // Tools
  // ===========================================================================

  /**
   * List available tools
   */
  async listTools(): Promise<MCPTool[]> {
    this.ensureInitialized();

    if (!this._capabilities?.tools) {
      return [];
    }

    const response = await this.request('tools/list', {});
    const result = response as ListToolsResult;
    return result.tools;
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult> {
    this.ensureInitialized();

    const params: CallToolParams = {
      name,
      arguments: args,
    };

    const response = await this.request('tools/call', params);
    return response as CallToolResult;
  }

  // ===========================================================================
  // Resources
  // ===========================================================================

  /**
   * List available resources
   */
  async listResources(): Promise<MCPResource[]> {
    this.ensureInitialized();

    if (!this._capabilities?.resources) {
      return [];
    }

    const response = await this.request('resources/list', {});
    const result = response as ListResourcesResult;
    return result.resources;
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<ReadResourceResult> {
    this.ensureInitialized();

    const params: ReadResourceParams = { uri };
    const response = await this.request('resources/read', params);
    return response as ReadResourceResult;
  }

  // ===========================================================================
  // Prompts
  // ===========================================================================

  /**
   * List available prompts
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    this.ensureInitialized();

    if (!this._capabilities?.prompts) {
      return [];
    }

    const response = await this.request('prompts/list', {});
    const result = response as ListPromptsResult;
    return result.prompts;
  }

  /**
   * Get a prompt
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<GetPromptResult> {
    this.ensureInitialized();

    const params: GetPromptParams = {
      name,
      arguments: args,
    };

    const response = await this.request('prompts/get', params);
    return response as GetPromptResult;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Send a JSON-RPC request
   */
  private async request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.requestId;

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params: params as Record<string, unknown>,
    };

    const response = await this.transport.send(request, this.options.timeout);

    if (this.isErrorResponse(response)) {
      throw MCPError.fromJSONRPC(response.error);
    }

    return response.result;
  }

  /**
   * Send a JSON-RPC notification
   */
  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    await this.transport.notify(notification);
  }

  /**
   * Handle incoming notifications from the server
   */
  private handleNotification(notification: JSONRPCNotification): void {
    // Handle known notification types
    switch (notification.method) {
      case 'notifications/tools/list_changed':
        // Tools list changed, could emit event
        break;
      case 'notifications/resources/list_changed':
        // Resources list changed, could emit event
        break;
      case 'notifications/prompts/list_changed':
        // Prompts list changed, could emit event
        break;
      default:
        // Unknown notification
        break;
    }
  }

  /**
   * Check if response is an error
   */
  private isErrorResponse(response: JSONRPCResponse): response is JSONRPCErrorResponse {
    return 'error' in response;
  }

  /**
   * Ensure client is initialized before making requests
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new MCPError('Client not initialized. Call connect() first.', -32000);
    }
  }
}
