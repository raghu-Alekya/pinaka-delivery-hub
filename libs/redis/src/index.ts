export interface RedisCache { get(key: string): Promise<string | null>; set(key: string, val: string): Promise<void>; }
