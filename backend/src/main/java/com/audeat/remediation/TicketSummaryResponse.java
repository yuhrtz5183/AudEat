package com.audeat.remediation;

import java.time.LocalDate;

/**
 * A ticket in a list (AC 4.1, 10.1, 10.2, 11.1). Overdue and the day counts are computed against
 * today in {@code audeat.time-zone}.
 *
 * @param followUpDate the date of the scheduled (draft) follow-up, if any (AC 7.1)
 * @param followUpInspectionId that draft follow-up's id, if any (AC 7.3)
 */
public record TicketSummaryResponse(
    Long id,
    TicketStatus status,
    boolean overdue,
    LocalDate deadline,
    long daysRemaining,
    long daysOverdue,
    String requiredRemediation,
    Issue issue,
    Long storeId,
    String storeName,
    Long inspectionId,
    LocalDate inspectionDate,
    LocalDate followUpDate,
    Long followUpInspectionId) {

  /** The flagged issue the ticket is for; resolved once the ticket is approved. */
  public record Issue(Long resultId, String requirement, String comment, boolean resolved) {}
}
