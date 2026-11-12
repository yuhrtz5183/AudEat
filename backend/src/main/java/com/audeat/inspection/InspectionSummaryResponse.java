package com.audeat.inspection;

import java.time.LocalDate;

/** One row of a store's inspection history (AC 8.1, 9.1). */
public record InspectionSummaryResponse(
    Long id, LocalDate inspectionDate, String inspectorName, long violationCount, boolean followUp) {}
