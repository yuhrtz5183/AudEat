package com.audeat.inspector;

import com.audeat.auth.AuthExceptions.InvalidFields;
import com.audeat.checklist.ChecklistRequirementRepository;
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
import com.audeat.inspection.ResultResponse;
import com.audeat.remediation.RemediationTicket;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.TicketDetailResponse;
import com.audeat.remediation.TicketViews;
import com.audeat.store.Store;
import com.audeat.store.StoreRepository;
import com.audeat.user.UserAccount;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inspector inspections (US 1) and creating the remediation ticket for a flagged issue (US 3).
 */
@Service
@Transactional(readOnly = true)
public class InspectorService {

  static final int MAX_REMEDIATION_LENGTH = 1000;
  static final int MAX_COMMENT_LENGTH = 1000;

  private static final String ALREADY_SUBMITTED = "This inspection has already been submitted.";
  private static final String MARK_THIS = "Mark this requirement.";

  private static final String NOT_A_FLAGGED_ISSUE =
      "Only a flagged issue on a submitted inspection can have a remediation ticket.";
  private static final String ALREADY_HAS_TICKET = "This issue already has a remediation ticket.";

  private final StoreRepository stores;
  private final ChecklistRequirementRepository requirements;
  private final InspectionRepository inspections;
  private final InspectionResultRepository results;
  private final RemediationTicketRepository tickets;
  private final InspectionViews inspectionViews;
  private final TicketViews ticketViews;
  private final Clock clock;

  public InspectorService(
      StoreRepository stores,
      ChecklistRequirementRepository requirements,
      InspectionRepository inspections,
      InspectionResultRepository results,
      RemediationTicketRepository tickets,
      InspectionViews inspectionViews,
      TicketViews ticketViews,
      Clock clock) {
    this.stores = stores;
    this.requirements = requirements;
    this.inspections = inspections;
    this.results = results;
    this.tickets = tickets;
    this.inspectionViews = inspectionViews;
    this.ticketViews = ticketViews;
    this.clock = clock;
  }

  /**
   * AC 1.1. The store row is locked so two requests cannot create two drafts for the same
   * inspector. A draft they already have is returned instead.
   */
  @Transactional
  public StartedInspection start(long storeId, UserAccount inspector) {
    Store store =
        stores.findWithLockById(storeId).orElseThrow(() -> new NotFound("Store not found."));
    return inspections
        .findFirstByStoreIdAndInspectorIdAndStatusAndFollowUpOfIsNull(
            storeId, inspector.getId(), InspectionStatus.DRAFT)
        .map(existing -> new StartedInspection(false, detailOf(existing.getId())))
        .orElseGet(
            () -> {
              Inspection created =
                  inspections.saveAndFlush(
                      Inspection.startRegular(
                          store,
                          inspector,
                          LocalDate.now(clock),
                          requirements.findAllByOrderBySortOrderAsc(),
                          clock.instant()));
              return new StartedInspection(true, inspectionViews.detail(created));
            });
  }

  /**
   * AC 1.2, 1.3, 2.1. A draft the caller may not edit is a 404. A submitted inspection is a 409.
   * The comment is optional; a blank one is stored as null.
   */
  @Transactional
  public ResultResponse updateResult(long resultId, UpdateResultRequest request, UserAccount caller) {
    InspectionResult result =
        results.findById(resultId).orElseThrow(() -> new NotFound("Result not found."));
    Inspection inspection = requireDraft(result.getInspection(), caller, "Result not found.");
    if (inspection.getStatus() != InspectionStatus.DRAFT) {
      throw new Conflict(ALREADY_SUBMITTED);
    }
    String comment = request.comment() == null ? "" : request.comment().strip();
    if (comment.length() > MAX_COMMENT_LENGTH) {
      throw new InvalidFields(Map.of("comment", "Use " + MAX_COMMENT_LENGTH + " characters or fewer."));
    }
    result.update(request.compliant(), comment.isEmpty() ? null : comment);
    return inspectionViews.result(result);
  }

  /**
   * AC 1.2, 1.3, 7.3. Every line must be compliant or flagged before the visit is recorded. A
   * follow-up's result also resolves its ticket.
   */
  @Transactional
  public InspectionDetailResponse submit(long inspectionId, UserAccount caller) {
    Inspection inspection =
        inspections
            .findWithResultsById(inspectionId)
            .orElseThrow(() -> new NotFound("Inspection not found."));
    requireDraft(inspection, caller, "Inspection not found.");
    if (inspection.getStatus() != InspectionStatus.DRAFT) {
      throw new Conflict(ALREADY_SUBMITTED);
    }
    Map<String, String> errors = new LinkedHashMap<>();
    for (InspectionResult result : inspection.getResults()) {
      if (result.getCompliant() == null) {
        errors.put("results." + result.getId(), MARK_THIS);
      }
    }
    if (!errors.isEmpty()) {
      throw new InvalidFields(errors);
    }
    Instant now = clock.instant();
    inspection.submit(caller, LocalDate.now(clock), now);
    if (inspection.isFollowUp()) {
      long originalId = inspection.getFollowUpOf().getId();
      RemediationTicket ticket =
          tickets.findByResultIdIn(List.of(originalId)).stream()
              .findFirst()
              .orElseThrow(
                  () -> new Conflict("This ticket is not waiting for a follow-up inspection."));
      ticket.recordFollowUpResult(inspection.getResults().get(0).getCompliant(), now);
    }
    return inspectionViews.detail(inspection);
  }

  private InspectionDetailResponse detailOf(long inspectionId) {
    return inspectionViews.detail(
        inspections
            .findWithResultsById(inspectionId)
            .orElseThrow(() -> new NotFound("Inspection not found.")));
  }

  /** A regular draft belongs to its inspector. Anyone else gets the same 404 as a missing id. */
  private static Inspection requireDraft(Inspection inspection, UserAccount caller, String missing) {
    if (inspection.getStatus() == InspectionStatus.DRAFT && !inspection.isEditableBy(caller)) {
      throw new NotFound(missing);
    }
    return inspection;
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
