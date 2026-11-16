package com.audeat.inspector;

import static com.audeat.TestData.result;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.TestData;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionRepository;
import com.audeat.remediation.RemediationTicket;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.TicketStatus;
import com.audeat.store.Store;
import com.audeat.user.UserAccount;
import java.time.Clock;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** The inspector's review of remediation evidence: {@code /api/tickets} (US 6). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReviewApiTest {

  private static final String NOT_AUTHORIZED = "You are not authorized to view this page.";
  private static final String NO_EVIDENCE = "This ticket has no evidence waiting for review.";

  @Autowired private MockMvc mvc;
  @Autowired private TestData testData;
  @Autowired private InspectionRepository inspections;
  @Autowired private RemediationTicketRepository tickets;
  @Autowired private Clock clock;

  private Store bluePlate;
  private UserAccount inspector;
  private UserAccount owner;
  private LocalDate today;

  @BeforeEach
  void cleanDatabase() {
    testData.cleanAll();
    bluePlate = testData.store("Blue Plate Diner");
    inspector = testData.inspector();
    owner = testData.owner("Blue Plate Diner");
    today = LocalDate.now(clock);
  }

  @Test
  @DisplayName("AC 6.1: approving the evidence resolves the issue and records the approval date")
  void approve() throws Exception {
    RemediationTicket ticket = awaiting(5);

    review(inspector, ticket.getId(), decision("approved", "Looks fixed."))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("approved"))
        .andExpect(jsonPath("$.issue.resolved").value(true))
        .andExpect(jsonPath("$.approvedAt").isNotEmpty())
        .andExpect(jsonPath("$.submissions[0].decision").value("approved"))
        .andExpect(jsonPath("$.submissions[0].reviewComment").value("Looks fixed."));

    RemediationTicket saved = tickets.findById(ticket.getId()).orElseThrow();
    org.assertj.core.api.Assertions.assertThat(saved.getStatus()).isEqualTo(TicketStatus.APPROVED);
    org.assertj.core.api.Assertions.assertThat(saved.getApprovedAt()).isNotNull();
  }

  @Test
  @DisplayName("AC 6.2: rejecting saves the reason and leaves the issue unresolved")
  void reject() throws Exception {
    RemediationTicket ticket = awaiting(5);

    review(inspector, ticket.getId(), decision("rejected", null))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.comment").value("Explain why further action is required."));
    org.assertj.core.api.Assertions.assertThat(tickets.findById(ticket.getId()).orElseThrow().getStatus())
        .isEqualTo(TicketStatus.AWAITING_REVIEW);

    review(inspector, ticket.getId(), decision("rejected", "The photo does not show the repair."))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("rejected"))
        .andExpect(jsonPath("$.issue.resolved").value(false))
        .andExpect(jsonPath("$.approvedAt").isEmpty())
        .andExpect(jsonPath("$.submissions[0].decision").value("rejected"))
        .andExpect(
            jsonPath("$.submissions[0].reviewComment")
                .value("The photo does not show the repair."));
  }

  @Test
  @DisplayName("AC 6.3: a follow-up in the future leaves the issue unresolved and schedules the visit")
  void scheduleFollowUp() throws Exception {
    RemediationTicket ticket = awaiting(5);
    LocalDate visit = today.plusDays(3);

    review(inspector, ticket.getId(), followUp(visit))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("follow_up_scheduled"))
        .andExpect(jsonPath("$.issue.resolved").value(false))
        .andExpect(jsonPath("$.approvedAt").isEmpty())
        .andExpect(jsonPath("$.followUpDate").value(visit.toString()))
        .andExpect(jsonPath("$.followUpInspectionId").isNumber())
        .andExpect(jsonPath("$.submissions[0].decision").value("follow_up"));

    org.assertj.core.api.Assertions.assertThat(inspections.findAll())
        .anyMatch(inspection -> inspection.isFollowUp() && inspection.getInspectionDate().equals(visit));
  }

  @Test
  @DisplayName("a follow-up dated today or earlier is refused and nothing is saved")
  void followUpMustBeInTheFuture() throws Exception {
    RemediationTicket ticket = awaiting(5);

    review(inspector, ticket.getId(), followUp(today))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.followUpDate").value("The follow-up date must be in the future."));
    review(inspector, ticket.getId(), "{\"decision\":\"follow_up\"}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.followUpDate").value("A follow-up date is required."));

    org.assertj.core.api.Assertions.assertThat(tickets.findById(ticket.getId()).orElseThrow().getStatus())
        .isEqualTo(TicketStatus.AWAITING_REVIEW);
  }

  @Test
  @DisplayName("the review queue lists tickets awaiting review, nearest deadline first")
  void queue() throws Exception {
    RemediationTicket later = awaiting(9);
    RemediationTicket sooner = awaiting(2);

    as(inspector, get("/api/tickets").param("status", "awaiting_review"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[*].id").value(contains(id(sooner), id(later))))
        .andExpect(jsonPath("$[0].status").value("awaiting_review"))
        .andExpect(jsonPath("$[0].storeName").value("Blue Plate Diner"));
  }

  @Test
  @DisplayName("an unknown status is rejected, and a missing ticket is a 404")
  void unknownStatusAndMissingTicket() throws Exception {
    as(inspector, get("/api/tickets").param("status", "overdue"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.message").value("Unknown ticket status."));
    as(inspector, get("/api/tickets/99999"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.message").value("Ticket not found."));
    as(inspector, get("/api/tickets/abc"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.message").value("Ticket not found."));
  }

  @Test
  @DisplayName("a ticket that is not awaiting review cannot be reviewed, and an owner gets 403")
  void onlyWaitingEvidenceAndOnlyInspectors() throws Exception {
    Inspection inspection = testData.submittedInspection(bluePlate, inspector, 1);
    RemediationTicket open =
        testData.ticket(result(inspection, 1), TicketStatus.OPEN, today.plusDays(4));

    review(inspector, open.getId(), decision("approved", null))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.message").value(NO_EVIDENCE));
    as(owner, get("/api/tickets").param("status", "awaiting_review"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value(NOT_AUTHORIZED));
    review(owner, open.getId(), decision("approved", null))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value(NOT_AUTHORIZED));
  }

  private RemediationTicket awaiting(int daysAhead) {
    Inspection inspection = testData.submittedInspection(bluePlate, inspector, 1);
    return testData.ticket(
        result(inspection, 1), TicketStatus.AWAITING_REVIEW, today.plusDays(daysAhead));
  }

  private static int id(RemediationTicket ticket) {
    return Math.toIntExact(ticket.getId());
  }

  private static String decision(String decision, String comment) {
    String text = comment == null ? "null" : "\"" + comment + "\"";
    return "{\"decision\":\"" + decision + "\",\"comment\":" + text + "}";
  }

  private static String followUp(LocalDate date) {
    return "{\"decision\":\"follow_up\",\"followUpDate\":\"" + date + "\"}";
  }

  private ResultActions review(UserAccount user, long ticketId, String json) throws Exception {
    return as(
        user,
        post("/api/tickets/{id}/review", ticketId)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json));
  }

  private ResultActions as(UserAccount user, MockHttpServletRequestBuilder request)
      throws Exception {
    return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, testData.bearer(user)));
  }
}
