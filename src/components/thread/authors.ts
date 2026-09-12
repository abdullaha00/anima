import type { CaseState, Participant } from "@/lib/domain/types";

export interface AuthorInfo {
  name: string;
  /** Role label and organisation, shown as prominently as the name. */
  role?: string;
  organisation?: string;
  simulated: boolean;
  system: boolean;
}

/**
 * Resolves a message author to a name, role and organisation. Removed participants still
 * resolve, because their earlier contributions stay in the thread. 'cairn' is the system.
 */
export function resolveAuthor(caseState: CaseState, authorId: string): AuthorInfo {
  if (authorId === "cairn") return { name: "Cairn (system)", simulated: false, system: true };
  const p: Participant | undefined =
    caseState.participants.find((x) => x.id === authorId) ??
    caseState.removedParticipants.find((r) => r.participant.id === authorId)?.participant;
  if (!p) return { name: authorId, simulated: false, system: false };
  return {
    name: p.name,
    role: p.roleLabel ?? p.role,
    organisation: p.organisation,
    simulated: p.simulated === true,
    system: false,
  };
}
