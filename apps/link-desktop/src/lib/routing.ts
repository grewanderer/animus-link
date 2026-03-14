export function explainDecisionReason(reason: string) {
  switch (reason) {
    case "policy_forced_relay":
      return "Operator policy forced traffic through a relay even though a direct path may exist.";
    case "preferred_peer_relay":
      return "A preferred peer relay was pinned for this target and was available.";
    case "direct_candidate_available":
      return "A direct peer path was healthy, so the daemon stayed on the lowest-latency route.";
    case "managed_relay_fallback":
      return "No direct or peer relay path was usable, so the daemon fell back to the managed relay.";
    default:
      return "The daemon selected the best path from current policy and runtime availability.";
  }
}
