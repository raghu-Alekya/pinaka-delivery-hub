import { ConnectorRegistry } from '@pinaka-delivery-hub/connector-sdk';
import { DoorDashConnector } from '@pinaka-delivery-hub/connector-doordash';
import { GrubhubConnector } from '@pinaka-delivery-hub/connector-grubhub';
import { SwiggyConnector } from '@pinaka-delivery-hub/connector-swiggy';
import { UberEatsConnector } from '@pinaka-delivery-hub/connector-uber-eats';
import { ZomatoConnector } from '@pinaka-delivery-hub/connector-zomato';
import { OrderOutConnector } from '@pinaka-delivery-hub/connector-orderout';

export const connectorRegistry = new ConnectorRegistry([
  new DoorDashConnector(),
  new SwiggyConnector(),
  new GrubhubConnector(),
  new UberEatsConnector(),
  new ZomatoConnector(),
  new OrderOutConnector(),
]);

