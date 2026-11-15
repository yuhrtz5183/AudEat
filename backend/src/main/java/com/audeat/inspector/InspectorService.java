package com.audeat.inspector;

import com.audeat.auth.AuthExceptions.InvalidFields;
import com.audeat.common.ApiExceptions.Conflict;
import com.audeat.common.ApiExceptions.NotFound;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionDetailResponse;
import com.audeat.inspection.InspectionRepository;
import com.audeat.inspection.InspectionResult;
import com.audeat.inspection.InspectionResultRepository;
import com.audeat.inspection.InspectionStatus;
import com.audeat.inspection.InspectionSummaryResponse;
import com.audeat.inspection.InspectionViews;
import com.audeat.remediation.RemediationTicket;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.TicketDetailResponse;
import com.audeat.remediation.TicketViews;
import com.audeat.store.StoreRepository;
import com.audeat.user.UserAccount;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inspector reads of a store's submitted inspections, and creating the remediation ticket for a
 * flagged issue (US 3).
 */
@Service
@Transactional(readOnly = true)
public class InspectorService {

  static final int MAX_REMEDIATION_LENGTH = 1000;

  private static final String NOT_A_FLAGGED_ISSUE =
      "Only a flagged issue on a submitted inspection can have a remediation ticket.";
  private static final String ALREADY_HAS_TICKET = "This issue already has a remediation ticket.";

  private final StoreRepository stores;
  private final InspectionRepository inspections;
  private final InspectionResultRepository results;
  private final RemediationTicketRepository tickets;
  private final InspectionViews inspectionViews;
  private final TicketViews ticketViews;
  private final Clock clock;

  public InspectorService(
      StoreRepository stores,
      InspectionRepository inspections,
      InspectionResultRepository results,
      RemediationTicketRepository tickets,
      InspectionViews inspectionViews,
      TicketViews ticketViews,
      Clock clock) {
    this.stores = stores;
    this.inspections = inspections;
    this.results = results;
    this.tickets = tickets;
    this.inspectionViews = inspectionViews;
    this.ticketViews = ticketViews;
    this.clock = clock;
  }

  /** Submitted inspections, newest first. A missing store is a 404. */
  public List<InspectionSummaryResponse> history(long storeId) {
    if (!stores.existsById(storeId)) {
      throw new NotFound("Store not found.");
    }
    return inspections.findHistory(storeId);
  }

  /**
   * One inspection. A draft the caller may not edit is the same 404 as a missing id, matching the
   * mock API.
   */
  public InspectionDetailResponse inspection(long inspectionId, UserAccount caller) {
    Inspection inspection =
        inspections
            .findWithResultsById(inspectionId)
            .orElseThrow(() -> new NotFound("Inspection not found."));
    if (inspection.getStatus() == InspectionStatus.DRAFT && !inspection.isEditableBy(caller)) {
      throw new NotFound("Inspection not found.");
    }
    return inspectionViews.detail(inspection);
  }

  /**
   * AC 3.1, 3.2. The checks run in this order: 404, then 409 when the result cannot take a ticket,
   * then the 400 field errors. A duplicate create, including one that races the unique constraint,
   * is a 409 and saves nothing.
   */
  @Transactional
  public TicketDetailResponse createTicket(long resultId, CreateTicketRequest request) {
    InspectionResult result =
        results.findById(resultId).orElseThrow(() -> new NotFound("Result not found."));
    Inspection inspection = result.getInspection();
    if (!result.isFlagged() || inspection.getStatus() != InspectionStatus.SUBMITTED) {
      throw new Conflict(NOT_A_FLAGGED_ISSUE);
    }
    if (tickets.existsByResultId(resultId)) {
      throw new Conflict(ALREADY_HAS_TICKET);
    }

    String text = request.requiredRemediation() == null ? "" : request.requiredRemediation().strip();
    Map<String, String> errors = new LinkedHashMap<>();
    if (text.isEmpty()) {
      errors.put("requiredRemediation", "Describe the required remediation.");
    } else if (text.length() > MAX_REMEDIATION_LENGTH) {
      errors.put("requiredRemediation", "Use " + MAX_REMEDIATION_LENGTH + " characters or fewer.");
    }
    if (request.deadline() == null) {
      errors.put("deadline", "A deadline is required.");
    }
    if (!errors.isEmpty()) {
      throw new InvalidFields(errors);
    }

    try {
      RemediationTicket ticket =
          tickets.saveAndFlush(
              new RemediationTicket(result, text, request.deadline(), clock.instant()));
      return ticketViews.detail(ticket);
    } catch (DataIntegrityViolationException alreadySaved) {
      throw new Conflict(ALREADY_HAS_TICKET);
    }
  }
}
