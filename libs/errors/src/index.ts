export class ApplicationError extends Error { constructor(message: string, public code: string) { super(message); } }
