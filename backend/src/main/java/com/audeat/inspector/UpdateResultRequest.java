package com.audeat.inspector;

/** One checklist line while an inspection is still a draft (US 1). {@code compliant} is null when it is not marked yet. */
public record UpdateResultRequest(Boolean compliant, String comment) {}
