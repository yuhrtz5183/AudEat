package com.audeat.remediation;

import com.audeat.inspection.InspectionStatus;
import java.time.LocalDate;

/** A follow-up inspection of a ticket's issue and its one result (AC 7.1, 7.3). */
public record FollowUpResponse(
    Long inspectionId,
    LocalDate inspectionDate,
    InspectionStatus status,
    Boolean compliant,
    String comment) {}
