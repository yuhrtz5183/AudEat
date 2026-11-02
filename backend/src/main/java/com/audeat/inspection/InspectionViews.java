package com.audeat.inspection;

import com.audeat.photo.PhotoRepository;
import com.audeat.remediation.RemediationTicket;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.store.Store;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Builds the inspection responses (DESIGN §4), with the derived ticket fields computed against
 * today. Call it inside the service's transaction, because it walks lazy associations.
 */
@Component
public class InspectionViews {

  private final RemediationTicketRepository tickets;
  private final PhotoRepository photos;
  private final Clock clock;

  public InspectionViews(RemediationTicketRepository tickets, PhotoRepository photos, Clock clock) {
    this.tickets = tickets;
    this.photos = photos;
    this.clock = clock;
  }

  /** The inspection with every result; load it with {@code findWithResultsById}. */
  public InspectionDetailResponse detail(Inspection inspection) {
    LocalDate today = LocalDate.now(clock);
    List<InspectionResult> results = inspection.getResults();
    List<Long> resultIds = results.stream().map(InspectionResult::getId).toList();
    InspectionResult original = inspection.getFollowUpOf();
    List<Long> ticketResultIds = new ArrayList<>(resultIds);
    if (original != null) {
      ticketResultIds.add(original.getId());
    }
    Map<Long, RemediationTicket> ticketByResult =
        tickets.findByResultIdIn(ticketResultIds).stream()
            .collect(Collectors.toMap(ticket -> ticket.getResult().getId(), Function.identity()));
    Map<Long, List<Long>> photoIds = photos.idsByResult(resultIds);
    RemediationTicket originalTicket =
        original == null ? null : ticketByResult.get(original.getId());
    Store store = inspection.getStore();
    return new InspectionDetailResponse(
        inspection.getId(),
        store.getId(),
        store.getName(),
        inspection.getInspector().getName(),
        inspection.getInspectionDate(),
        inspection.getStatus(),
        inspection.getSubmittedAt(),
        originalTicket == null ? null : originalTicket.getId(),
        results.stream().filter(InspectionResult::isFlagged).count(),
        results.stream()
            .map(
                result ->
                    result(
                        result,
                        ticketByResult.get(result.getId()),
                        photoIds.getOrDefault(result.getId(), List.of()),
                        today))
            .toList());
  }

  /** One result, e.g. after the inspector edits it. */
  public ResultResponse result(InspectionResult result) {
    List<Long> ids = List.of(result.getId());
    RemediationTicket ticket = tickets.findByResultIdIn(ids).stream().findFirst().orElse(null);
    List<Long> photoIds = photos.idsByResult(ids).getOrDefault(result.getId(), List.of());
    return result(result, ticket, photoIds, LocalDate.now(clock));
  }

  private static ResultResponse result(
      InspectionResult result, RemediationTicket ticket, List<Long> photoIds, LocalDate today) {
    Boolean resolved = result.isFlagged() ? ticket != null && !ticket.isOpen() : null;
    return new ResultResponse(
        result.getId(),
        result.getRequirement().getId(),
        result.getRequirement().getDescription(),
        result.getCompliant(),
        result.getComment(),
        photoIds,
        resolved,
        ticket == null
            ? null
            : new ResultResponse.Ticket(
                ticket.getId(),
                ticket.getStatus(),
                ticket.isOverdue(today),
                ticket.getDeadline(),
                ticket.daysRemaining(today),
                ticket.daysOverdue(today),
                ticket.getRequiredRemediation()));
  }
}
