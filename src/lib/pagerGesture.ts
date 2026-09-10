/** Shared release decision for pointer dragging and trackpad scrolling. */
export function pagerStep(distance: number, velocity: number, height: number) {
  const farEnough = Math.abs(distance) >= Math.min(120, height * 0.2);
  const flick = Math.abs(distance) >= 24 && Math.abs(velocity) >= 0.4 && Math.sign(velocity) === Math.sign(distance);
  return farEnough || flick ? Math.sign(distance) : 0;
}

/** Wheel events do not include finger-up; recognize a sustained momentum tail. */
export class TrackpadRelease {
  private previous = 0;
  private direction = 0;
  private falling = 0;
  released = false;

  sample(delta: number, gap: number) {
    const size = Math.abs(delta);
    const reversal = this.direction !== 0 && Math.sign(delta) !== this.direction;
    const renewed = this.released && size > Math.max(4, this.previous * 1.6);
    const fresh = gap > 140 || reversal || renewed;
    if (fresh) { this.released = false; this.falling = 0; }
    if (!this.released) {
      this.falling = !fresh && gap <= 35 && size > 0 && size < this.previous * 0.9 ? this.falling + 1 : 0;
      if (this.falling >= 3) this.released = true;
    }
    this.previous = size;
    this.direction = Math.sign(delta);
    return { fresh, released: this.released };
  }
}
