export interface MessagePublisher { publish(topic: string, message: unknown): Promise<void>; }
