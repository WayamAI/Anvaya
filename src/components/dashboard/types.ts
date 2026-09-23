/**
 * Shapes shared by the dashboard components.
 *
 * Both the fleet and the plant screens feed the same components, so the data
 * contract lives here rather than in either screen's data module.
 */

/** Maps onto the feedback token family: critical -> error, info -> neutral. */
export type Severity = "critical" | "warning" | "info";

export type QueueState = "open" | "in-progress" | "resolved";

export interface ActionItem {
  id: string;
  severity: Severity;
  /** Primary identifier shown in the Asset column, e.g. "EXT-002". */
  subject: string;
  /** Qualifier under the identifier, e.g. "Line 4 - Extruder". */
  subjectDetail: string;
  description: string;
  /** Clock time, e.g. "14:32". */
  timestamp: string;
  /** Relative time, e.g. "2 min ago". */
  time: string;
  assignee: string;
  assigneeInitials: string;
  state: QueueState;
}

export interface QueueFilter {
  id: string;
  label: string;
  count: number;
}

/** `nominal` is a reading that is fine — no feedback colour applied. */
export type TelemetrySeverity = Severity | "nominal";

export interface TelemetryReading {
  label: string;
  value: string;
  unit: string;
  severity: TelemetrySeverity;
  /** Signed change against the nominal value, e.g. "+31". */
  delta?: string;
}

export interface IncidentPerson {
  name: string;
  initials: string;
  role: string;
}

export interface Incident {
  id: string;
  /** Noun shown after the id, e.g. "Incident" or "Exception". */
  title: string;
  severity: Severity;
  /** One-line summary of the primary issue. */
  headline: string;
  location: string;
  detectedAt: string;
  /** The thing the incident is about, e.g. "SIM-0001". */
  subject: string;
  /** Human description of the subject, e.g. "Long-haul tractor unit". */
  subjectType: string;
  person: IncidentPerson;
  telemetry: TelemetryReading[];
}
