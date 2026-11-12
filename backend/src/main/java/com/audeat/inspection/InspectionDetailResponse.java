package com.audeat.inspection;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * An inspection with every result (AC 1.1, 2.2, 7.3, 8.2).
 *
 * @param followUpOfTicketId the original issue's ticket when this is a follow-up, else null
 * @param results in checklist order
 */
public record InspectionDetailResponse(
    Long id,
    Long storeId,
    String storeName,
    String inspectorName,
    LocalDate inspectionDate,
    InspectionStatus status,
    Instant submittedAt,
    Long followUpOfTicketId,
    long violationCount,
    List<ResultResponse> results) {}
