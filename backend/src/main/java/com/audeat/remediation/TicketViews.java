package com.audeat.remediation;

import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionRepository;
import com.audeat.inspection.InspectionResult;
import com.audeat.inspection.InspectionStatus;
import com.audeat.photo.PhotoRepository;
import com.audeat.store.Store;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Builds the ticket responses (DESIGN §4). Overdue, the day counts, resolved and the follow-up
 * fields are derived here, against today in {@code audeat.time-zone}. Call it inside the
 * service's transaction, because it walks lazy associations.
 */
@Component
public class TicketViews {

  private final InspectionRepository inspections;
  private final RemediationSubmissionRepository submissions;
  private final PhotoRepository photos;
  private final Clock clock;

  public TicketViews(
      InspectionRepository inspections,
      RemediationSubmissionRepository submissions,
      PhotoRepository photos,
      Clock clock) {
    this.inspections = inspections;
    this.submissions = submissions;
    this.photos = photos;
    this.clock = clock;
  }

  /** A ticket list, in the given order. The follow-ups of the whole list take one query. */
  public List<TicketSummaryResponse> summaries(List<RemediationTicket> tickets) {
    if (tickets.isEmpty()) {
      return List.of();
    }
    LocalDate today = LocalDate.now(clock);
    List<Long> resultIds = tickets.stream().map(ticket -> ticket.getResult().getId()).toList();
    Map<Long, Inspection> draftFollowUps =
        inspections.findByFollowUpOfIdInOrderByIdAsc(resultIds).stream()
            .filter(followUp -> followUp.getStatus() == InspectionStatus.DRAFT)
            .collect(
                Collectors.toMap(
                    followUp -> followUp.getFollowUpOf().getId(),
                    Function.identity(),
                    (first, second) -> first));
    return tickets.stream()
        .map(ticket -> summary(ticket, draftFollowUps.get(ticket.getResult().getId()), today))
        .toList();
  }

  /** One ticket with its issue photos, submissions and follow-ups. */
  public TicketDetailResponse detail(RemediationTicket ticket) {
    LocalDate today = LocalDate.now(clock);
    Long resultId = ticket.getResult().getId();
    List<Inspection> followUps = inspections.findByFollowUpOfIdInOrderByIdAsc(List.of(resultId));
    Inspection draftFollowUp =
        followUps.stream()
            .filter(followUp -> followUp.getStatus() == InspectionStatus.DRAFT)
            .findFirst()
            .orElse(null);
    TicketSummaryResponse summary = summary(ticket, draftFollowUp, today);
    List<RemediationSubmission> history =
        submissions.findByTicketIdOrderBySubmittedAtAscIdAsc(ticket.getId());
    Map<Long, List<Long>> evidence =
        history.isEmpty()
            ? Map.of()
            : photos.idsBySubmission(history.stream().map(RemediationSubmission::getId).toList());
    TicketSummaryResponse.Issue issue = summary.issue();
    return new TicketDetailResponse(
        summary.id(),
        summary.status(),
        summary.overdue(),
        summary.deadline(),
        summary.daysRemaining(),
        summary.daysOverdue(),
        summary.requiredRemediation(),
        new TicketDetailResponse.Issue(
            issue.resultId(),
            issue.requirement(),
            issue.comment(),
            issue.resolved(),
            photos.idsByResult(List.of(resultId)).getOrDefault(resultId, List.of())),
        summary.storeId(),
        summary.storeName(),
        summary.inspectionId(),
        summary.inspectionDate(),
        summary.followUpDate(),
        summary.followUpInspectionId(),
        ticket.getCreatedAt(),
        ticket.getApprovedAt(),
        history.stream()
            .map(
                submission ->
                    new SubmissionResponse(
                        submission.getId(),
                        submission.getComment(),
                        submission.getSubmittedAt(),
                        evidence.getOrDefault(submission.getId(), List.of()),
                        submission.getDecision(),
                        submission.getReviewComment(),
                        submission.getReviewedAt()))
            .toList(),
        followUps.stream().map(TicketViews::followUp).toList());
  }

  private static TicketSummaryResponse summary(
      RemediationTicket ticket, Inspection draftFollowUp, LocalDate today) {
    InspectionResult result = ticket.getResult();
    Inspection inspection = result.getInspection();
    Store store = inspection.getStore();
    return new TicketSummaryResponse(
        ticket.getId(),
        ticket.getStatus(),
        ticket.isOverdue(today),
        ticket.getDeadline(),
        ticket.daysRemaining(today),
        ticket.daysOverdue(today),
        ticket.getRequiredRemediation(),
        new TicketSummaryResponse.Issue(
            result.getId(),
            result.getRequirement().getDescription(),
            result.getComment(),
            !ticket.isOpen()),
        store.getId(),
        store.getName(),
        inspection.getId(),
        inspection.getInspectionDate(),
        draftFollowUp == null ? null : draftFollowUp.getInspectionDate(),
        draftFollowUp == null ? null : draftFollowUp.getId());
  }

  /** A follow-up re-checks one requirement, so it has exactly one result. */
  private static FollowUpResponse followUp(Inspection followUp) {
    InspectionResult result = followUp.getResults().get(0);
    return new FollowUpResponse(
        followUp.getId(),
        followUp.getInspectionDate(),
        followUp.getStatus(),
        result.getCompliant(),
        result.getComment());
  }
}
