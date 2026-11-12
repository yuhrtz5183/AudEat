package com.audeat.inspection;

import com.audeat.remediation.TicketStatus;
import java.time.LocalDate;
import java.util.List;

/**
 * One checklist line of an inspection (AC 1.1, 2.x, 8.2).
 *
 * @param compliant null while a draft has not marked it
 * @param resolved whether the flagged issue's ticket is approved; null unless flagged
 * @param ticket the flagged issue's ticket, or null when it has none
 */
public record ResultResponse(
    Long id,
    Long requirementId,
    String requirement,
    Boolean compliant,
    String comment,
    List<Long> photoIds,
    Boolean resolved,
    Ticket ticket) {

  /** The ticket on a flagged issue, with the derived deadline fields. */
  public record Ticket(
      Long id,
      TicketStatus status,
      boolean overdue,
      LocalDate deadline,
      long daysRemaining,
      long daysOverdue,
      String requiredRemediation) {}
}
