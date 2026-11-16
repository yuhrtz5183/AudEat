package com.audeat.inspector;

import com.audeat.auth.AuthExceptions.InvalidFields;
import com.audeat.common.ApiExceptions.Conflict;
import com.audeat.common.ApiExceptions.NotFound;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionRepository;
import com.audeat.inspection.InspectionResult;
import com.audeat.remediation.RemediationSubmission;
import com.audeat.remediation.RemediationSubmissionRepository;
import com.audeat.remediation.RemediationTicket;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.ReviewDecision;
import com.audeat.remediation.TicketDetailResponse;
import com.audeat.remediation.TicketStatus;
import com.audeat.remediation.TicketSummaryResponse;
import com.audeat.remediation.TicketViews;
import com.audeat.user.UserAccount;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The inspector's review queue and decision (US 6). Read-only by default, because {@link
 * TicketViews} walks lazy associations; {@link #review} has its own read-write transaction.
 */
@Service
@Transactional(readOnly = true)
public class ReviewService {

  static final int MAX_COMMENT_LENGTH = 1000;

  private static final String NO_EVIDENCE = "This ticket has no evidence waiting for review.";

  private final RemediationTicketRepository tickets;
  private final RemediationSubmissionRepository submissions;
  private final InspectionRepository inspections;
  private final TicketViews views;
  private final Clock clock;

  public ReviewService(
      RemediationTicketRepository tickets,
      RemediationSubmissionRepository submissions,
      InspectionRepository inspections,
      TicketViews views,
      Clock clock) {
    this.tickets = tickets;
    this.submissions = submissions;
    this.inspections = inspections;
    this.views = views;
    this.clock = clock;
  }

  /** Tickets in one status, nearest deadline first (US 6, AC 7.3). */
  public List<TicketSummaryResponse> queue(String status) {
    TicketStatus parsed =
        TicketStatus.fromValue(status == null ? "" : status).orElseThrow(UnknownTicketStatus::new);
    return views.summaries(tickets.findByStatusForInspector(parsed));
  }

  /** Any ticket. A missing id is the same 404 the owner sees for a ticket outside their store. */
  public TicketDetailResponse ticket(long ticketId) {
    return views.detail(find(ticketId));
  }

  /**
   * AC 6.1, 6.2, 6.3. The checks run in this order: 404, then 409 when nothing is awaiting
   * review, then the 400 field errors. A ticket that cannot be reviewed says so before asking
   * for a decision. Any failure rolls the transaction back, so the submission, the ticket and a
   * follow-up inspection are saved together or not at all.
   */
  @Transactional
  public TicketDetailResponse review(long ticketId, ReviewRequest request, UserAccount inspector) {
    RemediationTicket ticket = find(ticketId);
    if (ticket.getStatus() != TicketStatus.AWAITING_REVIEW) {
      throw new Conflict(NO_EVIDENCE);
    }
    RemediationSubmission pending =
        submissions
            .findFirstByTicketIdAndDecisionIsNull(ticketId)
            .orElseThrow(() -> new Conflict(NO_EVIDENCE));

    ReviewDecision decision =
        request.decision() == null
            ? null
            : ReviewDecision.fromValue(request.decision()).orElse(null);
    String comment = request.comment() == null ? "" : request.comment().strip();
    Map<String, String> errors = new LinkedHashMap<>();
    if (decision == null) {
      errors.put("decision", "Choose approved, rejected, or a follow-up.");
    }
    if (comment.length() > MAX_COMMENT_LENGTH) {
      errors.put("comment", "Use " + MAX_COMMENT_LENGTH + " characters or fewer.");
    } else if (decision == ReviewDecision.REJECTED && comment.isEmpty()) {
      errors.put("comment", "Explain why further action is required.");
    }
    LocalDate followUpDate = request.followUpDate();
    if (decision == ReviewDecision.FOLLOW_UP) {
      if (followUpDate == null) {
        errors.put("followUpDate", "A follow-up date is required.");
      } else if (!followUpDate.isAfter(LocalDate.now(clock))) {
        errors.put("followUpDate", "The follow-up date must be in the future.");
      }
    }
    if (!errors.isEmpty()) {
      throw new InvalidFields(errors);
    }

    Instant now = clock.instant();
    pending.review(decision, comment.isEmpty() ? null : comment, now);
    switch (decision) {
      case APPROVED -> ticket.approve(now);
      case REJECTED -> ticket.reject();
      case FOLLOW_UP -> schedule(ticket, inspector, followUpDate, now);
    }
    tickets.flush();
    return views.detail(ticket);
  }

  /** AC 6.3, 7.1: a draft follow-up on the chosen date. The issue stays unresolved. */
  private void schedule(
      RemediationTicket ticket, UserAccount inspector, LocalDate date, Instant now) {
    ticket.scheduleFollowUp();
    InspectionResult issue = ticket.getResult();
    inspections.save(Inspection.scheduleFollowUp(issue, inspector, date, now));
  }

  private RemediationTicket find(long ticketId) {
    return tickets.findById(ticketId).orElseThrow(() -> new NotFound("Ticket not found."));
  }
}
