package com.audeat.owner;

import static com.audeat.TestData.result;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.TestData;
import com.audeat.checklist.ChecklistRequirementRepository;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionRepository;
import com.audeat.inspection.InspectionResult;
import com.audeat.remediation.TicketStatus;
import com.audeat.store.Store;
import com.audeat.user.UserAccount;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Arrays;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;

/** The owner's inspection history: {@code /api/my-store/inspections} (US 9). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OwnerInspectionsApiTest {

  private static final String NOT_AUTHORIZED = "You are not authorized to view this page.";

  @Autowired private MockMvc mvc;
  @Autowired private TestData testData;
  @Autowired private InspectionRepository inspections;
  @Autowired private ChecklistRequirementRepository requirements;
  @Autowired private TransactionTemplate transaction;
  @Autowired private Clock clock;

  private Store bluePlate;
  private Store corner;
  private UserAccount inspector;
  private UserAccount owner;
  private LocalDate today;

  @BeforeEach
  void cleanDatabase() {
    testData.cleanAll();
    bluePlate = testData.store("Blue Plate Diner");
    corner = testData.store("Corner Bakery Co.");
    inspector = testData.inspector();
    owner = testData.owner("Blue Plate Diner");
    today = LocalDate.now(clock);
  }

  @Test
  @DisplayName(
      "AC 9.1: an owner's history lists only their store's submitted inspections, newest first,"
          + " with each date and number of violations")
  void ownerSeesOwnHistoryNewestFirst() throws Exception {
    // Saved out of date order, so the order comes from the query, not from insertion.
    Inspection month = submitted(bluePlate, today.minusDays(30));
    Inspection twoMonths = submitted(bluePlate, today.minusDays(60), 6);
    Inspection tenDays = submitted(bluePlate, today.minusDays(10), 1, 3, 5);
    draft(bluePlate, today.minusDays(2));
    submitted(corner, today.minusDays(1), 2, 4);

    myHistory(owner)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(3))
        .andExpect(jsonPath("$[*].id").value(contains(id(tenDays), id(month), id(twoMonths))))
        .andExpect(
            jsonPath("$[*].inspectionDate")
                .value(
                    contains(
                        today.minusDays(10).toString(),
                        today.minusDays(30).toString(),
                        today.minusDays(60).toString())))
        .andExpect(jsonPath("$[*].violationCount").value(contains(3, 0, 1)))
        .andExpect(jsonPath("$[*].followUp").value(contains(false, false, false)))
        .andExpect(jsonPath("$[0].inspectorName").value(inspector.getName()))
        .andExpect(jsonPath("$[0].length()").value(5));
  }

  @Test
  @DisplayName("AC 9.1: inspections on the same day are listed newest (latest id) first")
  void sameDayInspectionsNewestFirst() throws Exception {
    Inspection first = submitted(bluePlate, today.minusDays(7), 1);
    Inspection second = submitted(bluePlate, today.minusDays(7), 2, 3);

    myHistory(owner)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[*].id").value(contains(id(second), id(first))))
        .andExpect(jsonPath("$[*].violationCount").value(contains(2, 1)));
  }

  @Test
  @DisplayName(
      "AC 9.1: a completed follow-up is listed and marked as one; a scheduled follow-up is not")
  void followUpsInHistory() throws Exception {
    Inspection original = submitted(bluePlate, today.minusDays(20), 2);
    // A FOLLOW_UP_SCHEDULED ticket comes with a draft follow-up dated tomorrow.
    testData.ticket(result(original, 2), TicketStatus.FOLLOW_UP_SCHEDULED, today.plusDays(5));
    Inspection done = completedFollowUp(original, 2, today.minusDays(5));

    myHistory(owner)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[*].id").value(contains(id(done), id(original))))
        .andExpect(jsonPath("$[*].followUp").value(contains(true, false)))
        .andExpect(jsonPath("$[*].violationCount").value(contains(0, 1)));
  }

  @Test
  @DisplayName("AC 9.1: two owners each see only their own store's history")
  void eachOwnerSeesOnlyOwnHistory() throws Exception {
    UserAccount cornerOwner = testData.owner("Corner Bakery Co.");
    Inspection blue = submitted(bluePlate, today.minusDays(3), 1);
    Inspection bakery = submitted(corner, today.minusDays(4), 7, 8);

    myHistory(owner).andExpect(jsonPath("$[*].id").value(contains(id(blue))));
    myHistory(cornerOwner)
        .andExpect(jsonPath("$[*].id").value(contains(id(bakery))))
        .andExpect(jsonPath("$[0].violationCount").value(2));
  }

  @Test
  @DisplayName("AC 9.1: a store with no completed inspections gets an empty list")
  void emptyHistory() throws Exception {
    draft(bluePlate, today);
    submitted(corner, today.minusDays(1), 1);

    myHistory(owner).andExpect(status().isOk()).andExpect(content().json("[]"));
  }

  @Test
  @DisplayName(
      "AC 9.2: an owner asking for another store's history is denied with the not-authorized"
          + " message and no data from that store")
  void otherStoresHistoryIsDenied() throws Exception {
    Inspection bakery = submitted(corner, today.minusDays(4), 7, 8);

    for (MockHttpServletRequestBuilder request :
        new MockHttpServletRequestBuilder[] {
          get("/api/stores/{id}/inspections", corner.getId()),
          get("/api/inspections/{id}", bakery.getId())
        }) {
      as(owner, request)
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.length()").value(1))
          .andExpect(jsonPath("$.message").value(NOT_AUTHORIZED));
    }
    // The owner's own endpoint takes no store id, so it can only ever return their own store.
    as(owner, get("/api/my-store/inspections").param("storeId", String.valueOf(corner.getId())))
        .andExpect(status().isOk())
        .andExpect(content().json("[]"));
  }

  @Test
  @DisplayName("an inspector gets the JSON 403 on the owner's history, and no token gets 401")
  void onlyOwnersMayOpenMyHistory() throws Exception {
    myHistory(inspector)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value(NOT_AUTHORIZED));
    mvc.perform(get("/api/my-store/inspections"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.message").value("Authentication required."));
  }

  /** A regular inspection submitted on {@code date}, flagging the given checklist numbers. */
  private Inspection submitted(Store store, LocalDate date, int... flagged) {
    return transaction.execute(
        tx -> {
          Inspection inspection = start(store, date, flagged);
          inspection.submit(inspector, date, clock.instant());
          return inspections.save(inspection);
        });
  }

  private void draft(Store store, LocalDate date) {
    transaction.executeWithoutResult(tx -> inspections.save(start(store, date, 1)));
  }

  private Inspection start(Store store, LocalDate date, int... flagged) {
    Inspection inspection =
        Inspection.startRegular(
            store, inspector, date, requirements.findAllByOrderBySortOrderAsc(), clock.instant());
    for (InspectionResult result : inspection.getResults()) {
      int sortOrder = result.getRequirement().getSortOrder();
      boolean isFlagged = Arrays.stream(flagged).anyMatch(order -> order == sortOrder);
      result.update(!isFlagged, isFlagged ? "Flagged requirement " + sortOrder + "." : null);
    }
    return inspection;
  }

  /** A follow-up of one issue, found fixed and submitted on {@code date}. */
  private Inspection completedFollowUp(Inspection original, int sortOrder, LocalDate date) {
    return transaction.execute(
        tx -> {
          InspectionResult issue =
              result(inspections.findWithResultsById(original.getId()).orElseThrow(), sortOrder);
          Inspection followUp =
              Inspection.scheduleFollowUp(issue, inspector, date, clock.instant());
          followUp.getResults().get(0).update(true, "Fixed.");
          followUp.submit(inspector, date, clock.instant());
          return inspections.save(followUp);
        });
  }

  /** JSON numbers come back as Integer, so compare ids as ints. */
  private static int id(Inspection inspection) {
    return Math.toIntExact(inspection.getId());
  }

  private ResultActions myHistory(UserAccount user) throws Exception {
    return as(user, get("/api/my-store/inspections"));
  }

  private ResultActions as(UserAccount user, MockHttpServletRequestBuilder request)
      throws Exception {
    return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, testData.bearer(user)));
  }
}
