import { ConnectorCapability, PlatformConnector } from './contracts';

export class ConnectorRegistry {
  private readonly connectors = new Map<string, PlatformConnector>();

  constructor(connectors: readonly PlatformConnector[] = []) { connectors.forEach((connector) => this.register(connector)); }
  register(connector: PlatformConnector): void {
    if (this.connectors.has(connector.descriptor.id)) throw new Error(`Connector '${connector.descriptor.id}' is already registered`);
    this.connectors.set(connector.descriptor.id, connector);
  }
  get(id: string): PlatformConnector {
    const connector = this.connectors.get(id);
    if (!connector) throw new Error(`Connector '${id}' is not registered`);
    return connector;
  }
  list(): readonly PlatformConnector[] { return [...this.connectors.values()]; }
  listByCapability(capability: ConnectorCapability): readonly PlatformConnector[] { return this.list().filter((item) => item.descriptor.capabilities.includes(capability)); }
}
