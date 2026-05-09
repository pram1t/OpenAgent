/**
 * MCP Registry
 *
 * Manages multiple MCP server connections and aggregates their tools.
 * Tools are prefixed with the server name to avoid conflicts.
 */

import { MCPClient } from './client.js';
import { StdioTransport } from './transport/stdio.js';
import { HttpTransport } from './transport/http.js';
import type { Transport } from './transport/types.js';
import type {
  ServerConfig,
  StdioServerConfig,
  HttpServerConfig,
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPServerState,
  CallToolResult,
  JSONSchema,
} from './types.js';
import { MCPError } from './types.js';

/**
 * Tool definition compatible with @pram1t/mustard-tools
 */
export interface AggregatedTool {
  name: string;
  description: string;
  parameters: JSONSchema;
  serverName: string;
  originalName: string;
}

/**
 * MCP Registry
 *
 * Manages multiple MCP servers and provides:
 * - Server lifecycle management (add, remove, connect, disconnect)
 * - Tool aggregation with prefixed names
 * - Unified tool execution across servers
 */
export class MCPRegistry {
  private servers: Map<string, MCPServerState> = new Map();
  private clients: Map<string, MCPClient> = new Map();

  /**
   * Separator used to prefix tool names with server name
   */
  static readonly TOOL_SEPARATOR = '__';

  /**
   * Add a server configuration (does not connect yet)
   */
  addServerConfig(name: string, config: ServerConfig): void {
    if (this.servers.has(name)) {
      throw new MCPError(`Server '${name}' already exists`, -32000);
    }

    this.servers.set(name, {
      name,
      config,
      connected: false,
    });
  }

  /**
   * Remove a server (disconnects if connected)
   */
  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
    }

    this.servers.delete(name);
  }

  /**
   * Connect to a server
   */
  async connectServer(name: string): Promise<void> {
    const state = this.servers.get(name);
    if (!state) {
      throw new MCPError(`Server '${name}' not found`, -32000);
    }

    if (state.connected) {
      return; // Already connected
    }

    // Create transport based on config type
    const transport = this.createTransport(state.config);

    // Create and connect client
    const client = new MCPClient(transport, {
      clientName: 'mustard',
      clientVersion: '0.0.0',
    });

    const result = await client.connect();

    // Update state
    state.connected = true;
    state.capabilities = result.capabilities;
    state.serverInfo = result.serverInfo;

    // Cache tools if available
    if (result.capabilities.tools) {
      state.tools = await client.listTools();
    }

    // Cache resources if available
    if (result.capabilities.resources) {
      state.resources = await client.listResources();
    }

    // Cache prompts if available
    if (result.capabilities.prompts) {
      state.prompts = await client.listPrompts();
    }

    this.clients.set(name, client);
  }

  /**
   * Disconnect from a server
   */
  async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
    }

    const state = this.servers.get(name);
    if (state) {
      state.connected = false;
      state.tools = undefined;
      state.resources = undefined;
      state.prompts = undefined;
    }
  }

  /**
   * Connect to all configured servers
   */
  async connectAll(): Promise<void> {
    const errors: Array<{ name: string; error: Error }> = [];

    for (const name of this.servers.keys()) {
      try {
        await this.connectServer(name);
      } catch (error) {
        errors.push({
          name,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    if (errors.length > 0) {
      const messages = errors.map((e) => `${e.name}: ${e.error.message}`);
      console.warn(`[MCP] Failed to connect to some servers:\n${messages.join('\n')}`);
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    for (const name of this.clients.keys()) {
      await this.disconnectServer(name);
    }
  }

  /**
   * Get all aggregated tools from all connected servers
   *
   * Tools are prefixed with the server name:
   * e.g., "filesystem__read_file"
   */
  getAllTools(): AggregatedTool[] {
    const tools: AggregatedTool[] = [];

    for (const [name, state] of this.servers) {
      if (!state.connected || !state.tools) continue;

      for (const tool of state.tools) {
        tools.push({
          name: `${name}${MCPRegistry.TOOL_SEPARATOR}${tool.name}`,
          description: tool.description || `Tool from ${name} server`,
          parameters: tool.inputSchema,
          serverName: name,
          originalName: tool.name,
        });
      }
    }

    return tools;
  }

  /**
   * Call a tool by its prefixed name
   *
   * @param prefixedName - Tool name with server prefix (e.g., "filesystem__read_file")
   * @param args - Tool arguments
   */
  async callTool(prefixedName: string, args?: Record<string, unknown>): Promise<CallToolResult> {
    const { serverName, toolName } = this.parseToolName(prefixedName);

    const client = this.clients.get(serverName);
    if (!client) {
      throw new MCPError(`Server '${serverName}' not connected`, -32000);
    }

    return client.callTool(toolName, args);
  }

  /**
   * Get all resources from all connected servers
   */
  getAllResources(): Array<MCPResource & { serverName: string }> {
    const resources: Array<MCPResource & { serverName: string }> = [];

    for (const [name, state] of this.servers) {
      if (!state.connected || !state.resources) continue;

      for (const resource of state.resources) {
        resources.push({
          ...resource,
          serverName: name,
        });
      }
    }

    return resources;
  }

  /**
   * Get all prompts from all connected servers
   */
  getAllPrompts(): Array<MCPPrompt & { serverName: string }> {
    const prompts: Array<MCPPrompt & { serverName: string }> = [];

    for (const [name, state] of this.servers) {
      if (!state.connected || !state.prompts) continue;

      for (const prompt of state.prompts) {
        prompts.push({
          ...prompt,
          serverName: name,
        });
      }
    }

    return prompts;
  }

  /**
   * Get server state
   */
  getServerState(name: string): MCPServerState | undefined {
    return this.servers.get(name);
  }

  /**
   * Get all server states
   */
  getAllServerStates(): MCPServerState[] {
    return Array.from(this.servers.values());
  }

  /**
   * Check if a tool name belongs to an MCP server
   */
  isMCPTool(name: string): boolean {
    return name.includes(MCPRegistry.TOOL_SEPARATOR);
  }

  /**
   * Parse a prefixed tool name into server and tool parts
   */
  parseToolName(prefixedName: string): { serverName: string; toolName: string } {
    const separatorIndex = prefixedName.indexOf(MCPRegistry.TOOL_SEPARATOR);
    if (separatorIndex === -1) {
      throw new MCPError(`Invalid tool name: ${prefixedName}. Expected format: serverName${MCPRegistry.TOOL_SEPARATOR}toolName`, -32000);
    }

    return {
      serverName: prefixedName.substring(0, separatorIndex),
      toolName: prefixedName.substring(separatorIndex + MCPRegistry.TOOL_SEPARATOR.length),
    };
  }

  /**
   * Create a transport based on server config
   */
  private createTransport(config: ServerConfig): Transport {
    switch (config.type) {
      case 'stdio':
        return new StdioTransport(config as StdioServerConfig);
      case 'http':
        return new HttpTransport(config as HttpServerConfig);
      default:
        throw new MCPError(`Unknown transport type: ${(config as any).type}`, -32000);
    }
  }
}

/**
 * Create a registry from a configuration object
 */
export function createRegistry(
  configs: Record<string, ServerConfig>
): MCPRegistry {
  const registry = new MCPRegistry();

  for (const [name, config] of Object.entries(configs)) {
    registry.addServerConfig(name, config);
  }

  return registry;
}
