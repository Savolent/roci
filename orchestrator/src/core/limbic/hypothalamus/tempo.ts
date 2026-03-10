/**
 * Homeostatic timing parameters — how a domain configures the
 * tempo of the limbic system's cyclic regulation.
 */
export interface TempoConfig {
  /** Heartbeat rate of the system in seconds. */
  readonly tickIntervalSec: number
  /** Max event-loop turns before transitioning (state-machine domains). */
  readonly maxTurns?: number
  /** Max brain/body cycles per active phase (hypervisor domains). */
  readonly maxCycles?: number
  /** Rest duration in milliseconds between active phases. */
  readonly breakDurationMs?: number
  /** Poll interval during rest periods, in seconds. */
  readonly breakPollIntervalSec?: number
  /** Diary line count above which hippocampus consolidation triggers. */
  readonly dreamThreshold?: number
}
