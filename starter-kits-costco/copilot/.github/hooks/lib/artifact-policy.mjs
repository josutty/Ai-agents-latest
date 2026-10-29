export function checkText(text, policy, filePath = "") {
  const findings = [];
  if (text && text.trim().length < (policy.minChars || 0)) {
    findings.push(`below minChars ${policy.minChars}`);
  }
  for (const p of policy.blockedPlaceholders || []) {
    if (text && text.includes(p)) findings.push(`placeholder ${p}`);
  }
  const auditPrefix = policy.auditPathPrefix;
  if (auditPrefix && filePath.startsWith(auditPrefix)) {
    for (const marker of policy.auditRequiredMarkers || []) {
      if (!text || !text.includes(marker)) {
        findings.push(`audit missing required marker: ${marker}`);
      }
    }
  }
  return findings;
}
