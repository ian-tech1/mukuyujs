export const ACCESS_GROUPS = ["admin", "teacher", "parent", "student", "qr_guest"] as const;
export type AccessGroup = (typeof ACCESS_GROUPS)[number];
export const ACCESS_AREAS = ["reports", "analysis", "marklists", "familyResults", "parentDetails"] as const;
export type AccessArea = (typeof ACCESS_AREAS)[number];
export type AccessRule = { view: boolean; download: boolean };
export type RoleAccessPolicy = Record<AccessGroup, Record<AccessArea, AccessRule>>;

const rule = (view: boolean, download = view): AccessRule => ({ view, download });
const row = (reports: AccessRule, analysis: AccessRule, marklists: AccessRule, familyResults: AccessRule, parentDetails = rule(false, false)) => ({ reports, analysis, marklists, familyResults, parentDetails });

/** Defaults intentionally preserve the portal's current role visibility and capabilities. */
export const DEFAULT_ROLE_ACCESS: RoleAccessPolicy = {
  admin: row(rule(true), rule(true), rule(true), rule(true)),
  teacher: row(rule(true), rule(true), rule(true), rule(false, false)),
  parent: row(rule(false, false), rule(false, false), rule(false, false), rule(true)),
  student: row(rule(false, false), rule(false, false), rule(false, false), rule(true)),
  qr_guest: row(rule(true, false), rule(false, false), rule(false, false), rule(false, false)),
};

export function normalizeRoleAccess(value: unknown): RoleAccessPolicy {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result = structuredClone(DEFAULT_ROLE_ACCESS) as RoleAccessPolicy;
  for (const group of ACCESS_GROUPS) {
    const inputGroup = source[group] && typeof source[group] === "object" ? source[group] as Record<string, unknown> : {};
    for (const area of ACCESS_AREAS) {
      if (area === "parentDetails" && group !== "admin" && group !== "teacher") {
        result[group][area] = rule(false, false);
        continue;
      }
      const inputRule = inputGroup[area] && typeof inputGroup[area] === "object" ? inputGroup[area] as Record<string, unknown> : {};
      if (typeof inputRule.view === "boolean") result[group][area].view = inputRule.view;
      if (typeof inputRule.download === "boolean") result[group][area].download = inputRule.download;
      if (!result[group][area].view) result[group][area].download = false;
    }
  }
  return result;
}

export function canRoleAccess(policy: RoleAccessPolicy, group: AccessGroup, area: AccessArea, action: "view" | "download"): boolean {
  return policy[group][area][action];
}

export function policyForRole(policy: RoleAccessPolicy, role: string): AccessGroup | null {
  if (role === "super_admin") return null;
  if (role === "admin" || role === "teacher" || role === "parent" || role === "student" || role === "qr_guest") return role;
  return null;
}

/** Super Admin is deliberately outside editable group policy and always retains access. */
export function canActorAccess(policy: RoleAccessPolicy, role: string, area: AccessArea, action: "view" | "download"): boolean {
  if (role === "super_admin") return true;
  const group = policyForRole(policy, role);
  return group ? canRoleAccess(policy, group, area, action) : false;
}
