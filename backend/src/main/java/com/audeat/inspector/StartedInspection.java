package com.audeat.inspector;

import com.audeat.inspection.InspectionDetailResponse;

/**
 * The caller's draft for a store (AC 1.1). {@code created} is false when they already had one and
 * it was resumed.
 */
public record StartedInspection(boolean created, InspectionDetailResponse inspection) {}
