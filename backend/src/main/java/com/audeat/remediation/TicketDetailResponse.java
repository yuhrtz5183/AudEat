package com.audeat.remediation;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * One ticket with its history (AC 4.2, 6.x, 7.x): every {@link TicketSummaryResponse} field, the
 * issue's photos, the owner's submissions and the follow-up inspections.
 */
public record TicketDetailResponse(
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
    Long followUpInspectionId,
    Instant createdAt,
    Instant approvedAt,
    List<SubmissionResponse> submissions,
    List<FollowUpResponse> followUps) {

  /** The flagged issue, with its photos (AC 4.2). */
  public record Issue(
      Long resultId, String requirement, String comment, boolean resolved, List<Long> photoIds) {}
}
