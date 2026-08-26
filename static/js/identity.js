const ROLE_IDENTITIES = {
  analyst: "analyst.rao",
  senior: "senior.iyer",
  auditor: "auditor.mehta",
};

export function currentRole() {
  const select = document.getElementById("role-switcher");
  return select ? select.value : "analyst";
}

export function currentIdentity() {
  return ROLE_IDENTITIES[currentRole()] || ROLE_IDENTITIES.analyst;
}

export function identityForRole(role) {
  return ROLE_IDENTITIES[role] || ROLE_IDENTITIES.analyst;
}
