export class Html {
  constructor(readonly raw: string) {}
  toString(): string {
    return this.raw;
  }
}
