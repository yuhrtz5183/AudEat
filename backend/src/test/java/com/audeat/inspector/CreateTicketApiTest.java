package com.audeat.inspector;

import static com.audeat.TestData.result;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.TestData;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionResult;
import com.audeat.remediation.RemediationTicketRepository;
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

/** Creating a remediation ticket for a flagged issue: {@code POST /api/results/{id}/ticket} (US 3). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CreateTicketApiTest {

  private static final String FIX = "Require hair restraints on every shift.";

  @Autowired private MockMvc mvc;
  @Autowired private TestData testData;
  @Autowired private RemediationTicketRepository tickets;
  @Autowired private Clock clock;

  private Store bluePlate;
  private UserAccount inspector;
  private UserAccount owner;
  private LocalDate deadline;

  @BeforeEach
  void cleanDatabase() {
    testData.cleanAll();
    bluePlate = testData.store("Blue Plate Diner");
    inspector = testData.inspector();
    owner = testData.owner("Blue Plate Diner");
    deadline = LocalDate.now(clock).plusDays(7);
  }

  @Test
  @DisplayName("AC 3.1: a flagged issue gets a ticket the store owner can see")
  void createTicketForFlaggedIssue() throws Exception {
    InspectionResult issue = flaggedIssue();

    as(inspector, get("/api/stores/{id}/inspections", bluePlate.getId()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value(issue.getInspection().getId().intValue()))
        .andExpect(jsonPath("$[0].violationCount").value(1));
    as(inspector, get("/api/inspections/{id}", issue.getInspection().getId()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[?(@.id == " + issue.getId() + ")].compliant").value(hasItem(false)))
        .andExpect(jsonPath("$.results[?(@.id == " + issue.getId() + ")].ticket").value(hasItem(nullValue())));

    create(inspector, issue.getId(), body(FIX, deadline))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.status").value("open"))
        .andExpect(jsonPath("$.requiredRemediation").value(FIX))
        .andExpect(jsonPath("$.deadline").value(deadline.toString()))
        .andExpect(jsonPath("$.issue.resultId").value(issue.getId().intValue()))
        .andExpect(jsonPath("$.issue.resolved").value(false))
        .andExpect(jsonPath("$.storeName").value("Blue Plate Diner"));

    as(owner, get("/api/my-store/tickets"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].requiredRemediation").value(FIX))
        .andExpect(jsonPath("$[0].issue.requirement").value(issue.getRequirement().getDescription()));
  }

  @Test
  @DisplayName("AC 3.2: a missing deadline does not create a ticket")
  void deadlineIsRequired() throws Exception {
    InspectionResult issue = flaggedIssue();

    create(inspector, issue.getId(), "{\"requiredRemediation\":\"" + FIX + "\"}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.deadline").value("A deadline is required."));
    assertThat(tickets.count()).isZero();
  }

  @Test
  @DisplayName("a second ticket for the same issue is refused")
  void oneTicketPerIssue() throws Exception {
    InspectionResult issue = flaggedIssue();
    create(inspector, issue.getId(), body(FIX, deadline)).andExpect(status().isCreated());

    create(inspector, issue.getId(), body("Do it again.", deadline.plusDays(1)))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.message").value("This issue already has a remediation ticket."));
    assertThat(tickets.count()).isEqualTo(1);
  }

  @Test
  @DisplayName("a compliant result and an owner cannot create a ticket")
  void onlyFlaggedIssuesAndInspectors() throws Exception {
    Inspection inspection = testData.submittedInspection(bluePlate, inspector, 4);
    InspectionResult compliant = result(inspection, 1);

    create(inspector, compliant.getId(), body(FIX, deadline))
        .andExpect(status().isConflict())
        .andExpect(
            jsonPath("$.message")
                .value(
                    "Only a flagged issue on a submitted inspection can have a remediation ticket."));
    create(owner, result(inspection, 4).getId(), body(FIX, deadline))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value("You are not authorized to view this page."));
    assertThat(tickets.count()).isZero();
  }

  private InspectionResult flaggedIssue() {
    return result(testData.submittedInspection(bluePlate, inspector, 4), 4);
  }

  private static String body(String remediation, LocalDate date) {
    return "{\"requiredRemediation\":\"" + remediation + "\",\"deadline\":\"" + date + "\"}";
  }

  private ResultActions create(UserAccount user, long resultId, String json) throws Exception {
    return as(
        user,
        post("/api/results/{id}/ticket", resultId)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json));
  }

  private ResultActions as(UserAccount user, MockHttpServletRequestBuilder request)
      throws Exception {
    return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, testData.bearer(user)));
  }
}
