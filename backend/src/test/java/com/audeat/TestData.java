package com.audeat;

import com.audeat.checklist.ChecklistRequirementRepository;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionRepository;
import com.audeat.inspection.InspectionResult;
import com.audeat.inspection.InspectionResultRepository;
import com.audeat.remediation.RemediationSubmission;
import com.audeat.remediation.RemediationSubmissionRepository;
import com.audeat.remediation.RemediationTicket;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.ReviewDecision;
import com.audeat.remediation.TicketStatus;
import com.audeat.security.TokenService;
import com.audeat.store.Store;
import com.audeat.store.StoreRepository;
import com.audeat.user.Role;
import com.audeat.user.UserAccount;
import com.audeat.user.UserAccountRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds test records through the real entities and transitions. API tests call {@link
 * #cleanAll()} in {@code @BeforeEach} and use the three seeded stores. Dates come from the app's
 * {@link Clock}, so "today" matches the server's.
 */
@Component
public class TestData {

  private static final AtomicInteger SEQUENCE = new AtomicInteger();

  private final UserAccountRepository users;
  private final StoreRepository stores;
  private final ChecklistRequirementRepository requirements;
  private final InspectionRepository inspections;
  private final InspectionResultRepository results;
  private final RemediationTicketRepository tickets;
  private final RemediationSubmissionRepository submissions;
  private final TokenService tokens;
  private final Clock clock;

  public TestData(
      UserAccountRepository users,
      StoreRepository stores,
      ChecklistRequirementRepository requirements,
      InspectionRepository inspections,
      InspectionResultRepository results,
      RemediationTicketRepository tickets,
      RemediationSubmissionRepository submissions,
      TokenService tokens,
      Clock clock) {
    this.users = users;
    this.stores = stores;
    this.requirements = requirements;
    this.inspections = inspections;
    this.results = results;
    this.tickets = tickets;
    this.submissions = submissions;
    this.tokens = tokens;
    this.clock = clock;
  }

  /** Deletes every inspection (the database cascades the rest), then every user. */
  @Transactional
  public void cleanAll() {
    inspections.deleteAllInBatch();
    users.deleteAllInBatch();
  }

  public Store store(String name) {
    return stores.findAll().stream()
        .filter(store -> store.getName().equals(name))
        .findFirst()
        .orElseThrow();
  }

  public UserAccount inspector() {
    return user("Ivy Inspector", Role.INSPECTOR, null);
  }

  public UserAccount owner(String storeName) {
    return user("Bea Owner", Role.OWNER, store(storeName));
  }

  /** Submitted today; the given checklist numbers are flagged, the rest compliant. */
  @Transactional
  public Inspection submittedInspection(
      Store store, UserAccount inspector, int... flaggedSortOrders) {
    LocalDate today = LocalDate.now(clock);
    Instant now = clock.instant();
    Inspection inspection =
        Inspection.startRegular(
            store, inspector, today, requirements.findAllByOrderBySortOrderAsc(), now);
    for (InspectionResult result : inspection.getResults()) {
      int sortOrder = result.getRequirement().getSortOrder();
      boolean flagged = Arrays.stream(flaggedSortOrders).anyMatch(order -> order == sortOrder);
      result.update(!flagged, flagged ? "Flagged requirement " + sortOrder + "." : null);
    }
    inspection.submit(inspector, today, now);
    return inspections.save(inspection);
  }

  /** The result for one checklist number of an inspection built here. */
  public static InspectionResult result(Inspection inspection, int sortOrder) {
    return inspection.getResults().stream()
        .filter(result -> result.getRequirement().getSortOrder() == sortOrder)
        .findFirst()
        .orElseThrow();
  }

  /**
   * A ticket on a flagged issue, moved to {@code status} through the real transitions: one
   * submission when it got that far, and for FOLLOW_UP_SCHEDULED a draft follow-up tomorrow.
   */
  @Transactional
  public RemediationTicket ticket(
      InspectionResult result, TicketStatus status, LocalDate deadline) {
    InspectionResult issue = results.findById(result.getId()).orElseThrow();
    Instant now = clock.instant();
    RemediationTicket ticket = tickets.save(new RemediationTicket(issue, "Fix it.", deadline, now));
    if (status == TicketStatus.OPEN) {
      return ticket;
    }
    ticket.submitEvidence();
    RemediationSubmission submission =
        submissions.save(new RemediationSubmission(ticket, "Fixed it.", now));
    switch (status) {
      case APPROVED -> {
        submission.review(ReviewDecision.APPROVED, null, now);
        ticket.approve(now);
      }
      case REJECTED -> {
        submission.review(ReviewDecision.REJECTED, "Not fixed yet.", now);
        ticket.reject();
      }
      case FOLLOW_UP_SCHEDULED -> {
        submission.review(ReviewDecision.FOLLOW_UP, null, now);
        ticket.scheduleFollowUp();
        UserAccount inspector = issue.getInspection().getInspector();
        LocalDate tomorrow = LocalDate.now(clock).plusDays(1);
        inspections.save(Inspection.scheduleFollowUp(issue, inspector, tomorrow, now));
      }
      default -> {}
    }
    return ticket;
  }

  public String bearer(UserAccount user) {
    return "Bearer " + tokens.issue(user);
  }

  private UserAccount user(String name, Role role, Store store) {
    String email = role.value() + "-" + SEQUENCE.incrementAndGet() + "@example.com";
    return users.save(new UserAccount(name, email, "unused", role, store, clock.instant()));
  }
}
