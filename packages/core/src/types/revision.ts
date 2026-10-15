/** Allowlisted Git identity only; never contains commit content or authorship. */
export interface RevisionMetadata {
  sha?: string;
  shortSha?: string;
  branch?: string;
  detached?: boolean;
}
