/** Touch input: invisible floating joystick on the left half, hold-buttons on the right. */
export interface Tap {
  x: number;
  y: number;
}

export class Input {
  joyId: number | null = null;
  ox = 0;
  oy = 0;
  jx = 0;
  jy = 0;
  readonly radius = 56;
  attack = false;
  skills = [false, false, false, false];
  /** presses since the last game step, so a tap shorter than one frame still counts */
  pressedSkills = [false, false, false, false];
  pressedAttack = false;
  taps: Tap[] = [];
  private starts = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
  onFirstTouch: (() => void) | null = null;
  onJoyChange: (() => void) | null = null;
  enabled = true;

  constructor(private surface: HTMLElement) {
    surface.addEventListener("pointerdown", (e) => this.down(e), { passive: false });
    surface.addEventListener("pointermove", (e) => this.move(e), { passive: false });
    surface.addEventListener("pointerup", (e) => this.up(e), { passive: false });
    surface.addEventListener("pointercancel", (e) => this.up(e, true), { passive: false });
  }

  private down(e: PointerEvent) {
    e.preventDefault();
    this.onFirstTouch?.();
    if (!this.enabled) return;
    this.starts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers */
    }
    if (this.joyId === null && e.clientX < window.innerWidth * 0.5) {
      this.joyId = e.pointerId;
      this.ox = this.jx = e.clientX;
      this.oy = this.jy = e.clientY;
      this.onJoyChange?.();
    }
  }

  private move(e: PointerEvent) {
    e.preventDefault();
    const s = this.starts.get(e.pointerId);
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) s.moved = true;
    if (e.pointerId !== this.joyId) return;
    this.jx = e.clientX;
    this.jy = e.clientY;
    // drag the origin along if the thumb travels past the rim
    const dx = this.jx - this.ox;
    const dy = this.jy - this.oy;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      this.ox = this.jx - (dx / d) * this.radius;
      this.oy = this.jy - (dy / d) * this.radius;
    }
    this.onJoyChange?.();
  }

  private up(e: PointerEvent, cancel = false) {
    e.preventDefault();
    const s = this.starts.get(e.pointerId);
    this.starts.delete(e.pointerId);
    if (s && !cancel && !s.moved && performance.now() - s.t < 350) this.taps.push({ x: e.clientX, y: e.clientY });
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.onJoyChange?.();
    }
  }

  /** Normalized joystick vector in screen space. */
  vector(): { mx: number; my: number; mag: number } {
    if (this.joyId === null) return { mx: 0, my: 0, mag: 0 };
    const dx = this.jx - this.ox;
    const dy = this.jy - this.oy;
    const d = Math.hypot(dx, dy);
    if (d < 7) return { mx: 0, my: 0, mag: 0 };
    return { mx: dx / d, my: dy / d, mag: Math.min(1, d / (this.radius * 0.7)) };
  }

  reset() {
    this.joyId = null;
    this.attack = false;
    this.skills = [false, false, false, false];
    this.pressedSkills = [false, false, false, false];
    this.pressedAttack = false;
    this.starts.clear();
    this.taps = [];
    this.onJoyChange?.();
  }

  /** Make an element a hold button that sets a flag while pressed. */
  static holdButton(el: HTMLElement, set: (v: boolean) => void, onPress?: () => void) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      el.classList.add("pressed");
      set(true);
      onPress?.();
    });
    const off = (e: PointerEvent) => {
      e.preventDefault();
      el.classList.remove("pressed");
      set(false);
    };
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
    el.addEventListener("lostpointercapture", off);
  }

  /** A tap button (fires once on press). */
  static tapButton(el: HTMLElement, fn: () => void) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add("pressed");
      fn();
    });
    const off = () => el.classList.remove("pressed");
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
    el.addEventListener("pointerleave", off);
  }
}
