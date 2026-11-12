package com.audeat;

import static com.audeat.TestData.result;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.checklist.ChecklistRequirementRepository;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionRepository;
import com.audeat.inspection.InspectionStatus;
import com.audeat.inspection.InspectionSummaryResponse;
import com.audeat.inspection.InspectionViews;
import com.audeat.photo.Photo;
import com.audeat.photo.PhotoRepository;
import com.audeat.remediation.RemediationSubmissionRepository;
import com.audeat.remediation.RemediationTicket;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.ReviewDecision;
import com.audeat.remediation.TicketStatus;
import com.audeat.remediation.TicketViews;
import com.audeat.store.Store;
import com.audeat.store.StoreRepository;
import com.audeat.user.UserAccount;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import java.time.Clock;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * The shared model (DESIGN §1-§4) against the real schema: one of each entity, every repository
 * query, the response assemblers' JSON, the ticket's optimistic lock and the role rules.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SchemaTest {

  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};

  @Autowired private MockMvc mvc;
  @Autowired private TestData testData;
  @Autowired private TransactionTemplate transaction;
  @Autowired private JsonMapper json;
  @Autowired private Clock clock;
  @Autowired private StoreRepository stores;
  @Autowired private ChecklistRequirementRepository requirements;
  @Autowired private InspectionRepository inspections;
  @Autowired private RemediationTicketRepository tickets;
  @Autowired private RemediationSubmissionRepository submissions;
  @Autowired private PhotoRepository photos;
  @Autowired private InspectionViews inspectionViews;
  @Autowired private TicketViews ticketViews;

  private LocalDate today;
  private Store bluePlate;
  private Store corner;
  private UserAccount inspector;
  private Inspection inspection;
  private RemediationTicket overdue;
  private RemediationTicket dueToday;
  private RemediationTicket followUp;
  private RemediationTicket approved;
  private long issuePhoto;

  @BeforeEach
  void createOneOfEach() {
    testData.cleanAll();
    today = LocalDate.now(clock);
    bluePlate = testData.store("Blue Plate Diner");
    corner = testData.store("Corner Bakery Co.");
    inspector = testData.inspector();
    // #1-#3 and #5 flagged; #4 compliant and without a ticket.
    inspection = testData.submittedInspection(bluePlate, inspector, 1, 2, 3, 5);
    overdue = testData.ticket(result(inspection, 1), TicketStatus.OPEN, today.minusDays(2));
    followUp =
        testData.ticket(
            result(inspection, 2), TicketStatus.FOLLOW_UP_SCHEDULED, today.plusDays(7));
    dueToday = testData.ticket(result(inspection, 3), TicketStatus.OPEN, today);
    approved =
        testData.ticket(result(inspection, 5), TicketStatus.APPROVED, today.minusDays(5));
    issuePhoto =
        photos
            .save(Photo.ofResult(result(inspection, 1), "image/png", PNG, clock.instant()))
            .getId();
  }

  @Test
  @DisplayName("every repository query runs against the V3 schema")
  void repositoriesMatchSchema() {
    long resultId = result(inspection, 1).getId();
    long followUpOf = result(inspection, 2).getId();
    transaction.executeWithoutResult(
        tx -> {
          assertThat(requirements.findAllByOrderBySortOrderAsc()).hasSize(8);
          assertThat(stores.findWithLockById(bluePlate.getId())).isPresent();

          Inspection loaded = inspections.findWithResultsById(inspection.getId()).orElseThrow();
          assertThat(loaded.getResults()).hasSize(8);
          assertThat(loaded.getResults().get(0).getRequirement().getSortOrder()).isEqualTo(1);
          assertThat(inspections.findHistory(bluePlate.getId()))
              .containsExactly(
                  new InspectionSummaryResponse(
                      inspection.getId(), today, "Ivy Inspector", 4, false));
          // The follow-up draft at the same store is not a regular draft to resume.
          assertThat(
                  inspections.findFirstByStoreIdAndInspectorIdAndStatusAndFollowUpOfIsNull(
                      bluePlate.getId(), inspector.getId(), InspectionStatus.DRAFT))
              .isEmpty();
          List<Inspection> followUps =
              inspections.findByFollowUpOfIdInOrderByIdAsc(List.of(followUpOf));
          assertThat(followUps).singleElement().satisfies(f -> assertThat(f.isFollowUp()).isTrue());

          assertThat(tickets.existsByResultId(resultId)).isTrue();
          assertThat(tickets.existsByResultId(result(inspection, 4).getId())).isFalse();
          assertThat(tickets.findByResultIdIn(List.of(resultId, followUpOf))).hasSize(2);
          assertThat(tickets.findForStore(bluePlate.getId()))
              .extracting(RemediationTicket::getId)
              .containsExactly(
                  overdue.getId(), dueToday.getId(), followUp.getId(), approved.getId());
          assertThat(tickets.findByIdForStore(overdue.getId(), bluePlate.getId())).isPresent();
          assertThat(tickets.findByIdForStore(overdue.getId(), corner.getId())).isEmpty();
          assertThat(
                  tickets.countForStore(
                      bluePlate.getId(), EnumSet.complementOf(EnumSet.of(TicketStatus.APPROVED))))
              .isEqualTo(3);
          assertThat(tickets.countForStore(bluePlate.getId(), List.of(TicketStatus.REJECTED)))
              .isZero();
          assertThat(tickets.findByStatusForInspector(TicketStatus.FOLLOW_UP_SCHEDULED))
              .extracting(RemediationTicket::getId)
              .containsExactly(followUp.getId());

          assertThat(submissions.findByTicketIdOrderBySubmittedAtAscIdAsc(followUp.getId()))
              .singleElement()
              .satisfies(s -> assertThat(s.getDecision()).isEqualTo(ReviewDecision.FOLLOW_UP));
          assertThat(submissions.findFirstByTicketIdAndDecisionIsNull(followUp.getId())).isEmpty();

          assertThat(photos.idsByResult(List.of(resultId, followUpOf)))
              .isEqualTo(Map.of(resultId, List.of(issuePhoto)));
          assertThat(photos.countByResultId(resultId)).isEqualTo(1);
        });
  }

  @Test
  @DisplayName("the inspection assembler builds the §4 JSON with derived ticket fields")
  void inspectionJson() {
    DocumentContext detail =
        toJson(
            () ->
                inspectionViews.detail(
                    inspections.findWithResultsById(inspection.getId()).orElseThrow()));

    assertThat(keys(detail, "$"))
        .containsExactlyInAnyOrder(
            "id", "storeId", "storeName", "inspectorName", "inspectionDate", "status",
            "submittedAt", "followUpOfTicketId", "violationCount", "results");
    assertThat(keys(detail, "$.results[0]"))
        .containsExactlyInAnyOrder(
            "id", "requirementId", "requirement", "compliant", "comment", "photoIds", "resolved",
            "ticket");
    assertThat(keys(detail, "$.results[0].ticket"))
        .containsExactlyInAnyOrder(
            "id", "status", "overdue", "deadline", "daysRemaining", "daysOverdue",
            "requiredRemediation");
    assertThat(detail.read("$.storeName", String.class)).isEqualTo("Blue Plate Diner");
    assertThat(detail.read("$.inspectionDate", String.class)).isEqualTo(today.toString());
    assertThat(detail.read("$.status", String.class)).isEqualTo("submitted");
    assertThat(detail.read("$.violationCount", Integer.class)).isEqualTo(4);
    assertThat(detail.read("$.followUpOfTicketId", Long.class)).isNull();

    // #1: overdue by two days, with its photo.
    assertThat(detail.read("$.results[0].compliant", Boolean.class)).isFalse();
    assertThat(detail.read("$.results[0].resolved", Boolean.class)).isFalse();
    assertThat(detail.read("$.results[0].photoIds", List.class)).containsExactly((int) issuePhoto);
    assertThat(detail.read("$.results[0].ticket.status", String.class)).isEqualTo("open");
    assertThat(detail.read("$.results[0].ticket.overdue", Boolean.class)).isTrue();
    assertThat(detail.read("$.results[0].ticket.daysRemaining", Integer.class)).isEqualTo(-2);
    assertThat(detail.read("$.results[0].ticket.daysOverdue", Integer.class)).isEqualTo(2);
    // #3: due today is not overdue (AC 11.3).
    assertThat(detail.read("$.results[2].ticket.overdue", Boolean.class)).isFalse();
    assertThat(detail.read("$.results[2].ticket.daysRemaining", Integer.class)).isZero();
    // #4: compliant, so neither resolved nor ticketed.
    assertThat(detail.read("$.results[3].resolved", Boolean.class)).isNull();
    assertThat(detail.read("$.results[3].ticket", Object.class)).isNull();
    // #5: approved past its deadline is resolved and never overdue (AC 11.2).
    assertThat(detail.read("$.results[4].resolved", Boolean.class)).isTrue();
    assertThat(detail.read("$.results[4].ticket.status", String.class)).isEqualTo("approved");
    assertThat(detail.read("$.results[4].ticket.overdue", Boolean.class)).isFalse();

    long followUpId =
        inspections
            .findByFollowUpOfIdInOrderByIdAsc(List.of(result(inspection, 2).getId()))
            .get(0)
            .getId();
    DocumentContext followUpDetail =
        toJson(
            () ->
                inspectionViews.detail(inspections.findWithResultsById(followUpId).orElseThrow()));
    assertThat(followUpDetail.read("$.followUpOfTicketId", Long.class)).isEqualTo(followUp.getId());
    assertThat(followUpDetail.read("$.status", String.class)).isEqualTo("draft");
    assertThat(followUpDetail.read("$.results.length()", Integer.class)).isEqualTo(1);
    assertThat(followUpDetail.read("$.results[0].compliant", Boolean.class)).isNull();
  }

  @Test
  @DisplayName("the ticket assembler builds the §4 JSON for lists and details")
  void ticketJson() {
    DocumentContext list =
        toJson(() -> ticketViews.summaries(tickets.findForStore(bluePlate.getId())));
    assertThat(keys(list, "$[0]"))
        .containsExactlyInAnyOrder(
            "id", "status", "overdue", "deadline", "daysRemaining", "daysOverdue",
            "requiredRemediation", "issue", "storeId", "storeName", "inspectionId",
            "inspectionDate", "followUpDate", "followUpInspectionId");
    assertThat(keys(list, "$[0].issue"))
        .containsExactlyInAnyOrder("resultId", "requirement", "comment", "resolved");
    assertThat(list.read("$[0].overdue", Boolean.class)).isTrue();
    assertThat(list.read("$[0].daysOverdue", Integer.class)).isEqualTo(2);
    assertThat(list.read("$[0].storeName", String.class)).isEqualTo("Blue Plate Diner");
    assertThat(list.read("$[0].inspectionId", Long.class)).isEqualTo(inspection.getId());
    assertThat(list.read("$[0].issue.comment", String.class)).isEqualTo("Flagged requirement 1.");
    assertThat(list.read("$[2].status", String.class)).isEqualTo("follow_up_scheduled");
    assertThat(list.read("$[2].followUpDate", String.class))
        .isEqualTo(today.plusDays(1).toString());
    assertThat(list.read("$[2].followUpInspectionId", Long.class)).isNotNull();
    assertThat(list.read("$[3].issue.resolved", Boolean.class)).isTrue();
    assertThat(list.read("$[3].overdue", Boolean.class)).isFalse();

    DocumentContext detail =
        toJson(() -> ticketViews.detail(tickets.findById(followUp.getId()).orElseThrow()));
    assertThat(keys(detail, "$"))
        .containsAll(keys(list, "$[0]"))
        .contains("createdAt", "approvedAt", "submissions", "followUps")
        .hasSize(18);
    assertThat(keys(detail, "$.issue"))
        .containsExactlyInAnyOrder("resultId", "requirement", "comment", "resolved", "photoIds");
    assertThat(keys(detail, "$.submissions[0]"))
        .containsExactlyInAnyOrder(
            "id", "comment", "submittedAt", "evidencePhotoIds", "decision", "reviewComment",
            "reviewedAt");
    assertThat(keys(detail, "$.followUps[0]"))
        .containsExactlyInAnyOrder(
            "inspectionId", "inspectionDate", "status", "compliant", "comment");
    assertThat(detail.read("$.submissions[0].decision", String.class)).isEqualTo("follow_up");
    assertThat(detail.read("$.followUps[0].status", String.class)).isEqualTo("draft");
    assertThat(detail.read("$.followUps[0].inspectionId", Long.class))
        .isEqualTo(detail.read("$.followUpInspectionId", Long.class));
    assertThat(detail.read("$.approvedAt", String.class)).isNull();
  }

  @Test
  @DisplayName("a transition on a stale ticket fails with the exception mapped to 409")
  void staleTicketUpdateFails() {
    RemediationTicket first = tickets.findById(overdue.getId()).orElseThrow();
    RemediationTicket second = tickets.findById(overdue.getId()).orElseThrow();
    first.submitEvidence();
    tickets.save(first);
    second.submitEvidence();

    assertThatThrownBy(() -> tickets.save(second))
        .isInstanceOf(ObjectOptimisticLockingFailureException.class);
  }

  @Test
  @DisplayName("AC 9.2, 15.2: the wrong role gets a JSON 403 before any data is read")
  void wrongRoleIsForbidden() throws Exception {
    UserAccount owner = testData.owner("Blue Plate Diner");

    mvc.perform(
            get("/api/stores/{id}/inspections", corner.getId())
                .header(HttpHeaders.AUTHORIZATION, testData.bearer(owner)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value("You are not authorized to view this page."));
    mvc.perform(get("/api/my-store").header(HttpHeaders.AUTHORIZATION, testData.bearer(inspector)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value("You are not authorized to view this page."));
  }

  /** Builds a view inside a transaction, as services do, and serializes it like the API does. */
  private DocumentContext toJson(Supplier<Object> view) {
    String body = transaction.execute(tx -> json.writeValueAsString(view.get()));
    return JsonPath.parse(body);
  }

  private static List<String> keys(DocumentContext document, String path) {
    Map<String, Object> object = document.read(path);
    return List.copyOf(object.keySet());
  }
}
