declare module "undici" {
  export class Agent {
    constructor(options?: {
      connect?: {
        rejectUnauthorized?: boolean;
      };
    });
  }
}
