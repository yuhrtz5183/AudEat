package com.audeat.inspector;

import static com.audeat.TestData.result;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.TestData;
import com.audeat.checklist.ChecklistRequirementRepository;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionRepository;
import com.audeat.photo.Photo;
import com.audeat.photo.PhotoRepository;
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

/** A store's inspection history and inspection details for inspectors (US 8). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class InspectionHistoryApiTest {

  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};

  @Autowired private MockMvc mvc;
  @Autowired private TestData testData;
  @Autowired private InspectionRepository inspections;
  @Autowired private ChecklistRequirementRepository requirements;
  @Autowired private PhotoRepository photos;
  @Autowired private TransactionTemplate transaction;
  @Autowired private Clock clock;

  private Store bluePlate;
  private Store harbor;
  private UserAccount inspector;
  private LocalDate today;

  @BeforeEach
  void cleanDatabase() {
    testData.cleanAll();
    bluePlate = testData.store("Blue Plate Diner");
    harbor = testData.store("Harbor Noodle House");
    inspector = testData.inspector();
    today = LocalDate.now(clock);
  }

  @Test
  @DisplayName(
      "AC 8.1: an inspector views a store's inspection history, newest first, showing date, inspector, and violations")
  void inspectorViewsStoreHistoryNewestFirst() throws Exception {
    Inspection month = submitted(bluePlate, today.minusDays(30));
    Inspection twoMonths = submitted(bluePlate, today.minusDays(60), 6);
    Inspection tenDays = submitted(bluePlate, today.minusDays(10), 1, 3, 5);

    as(inspector, get("/api/stores/{id}/inspections", bluePlate.getId()))
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
        .andExpect(jsonPath("$[*].inspectorName").value(contains(inspector.getName(), inspector.getName(), inspector.getName())));
  }

  @Test
  @DisplayName("AC 8.2: an inspector views an inspection's details with results, comments, photos, and ticket status")
  void inspectorViewsInspectionDetails() throws Exception {
    Inspection inspection = submitted(bluePlate, today.minusDays(5), 1);
    long resultId = result(inspection, 1).getId();
    Photo photo = photos.save(Photo.ofResult(result(inspection, 1), "image/png", PNG, clock.instant()));
    testData.ticket(result(inspection, 1), TicketStatus.OPEN, today.plusDays(7));

    as(inspector, get("/api/inspections/{id}", inspection.getId()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(inspection.getId()))
        .andExpect(jsonPath("$.storeName").value("Blue Plate Diner"))
        .andExpect(jsonPath("$.inspectorName").value(inspector.getName()))
        .andExpect(jsonPath("$.status").value("submitted"))
        .andExpect(jsonPath("$.results", hasSize(8)))
        .andExpect(jsonPath("$.results[0].id").value(resultId))
        .andExpect(jsonPath("$.results[0].compliant").value(false))
        .andExpect(jsonPath("$.results[0].photoIds[0]").value(photo.getId()))
        .andExpect(jsonPath("$.results[0].ticket.status").value("open"))
        .andExpect(jsonPath("$.results[0].ticket.requiredRemediation").value("Fix it."));
  }

  @Test
  @DisplayName("AC 8.3: a store with no completed inspections returns an empty list, and a missing store returns 404")
  void emptyHistoryAndMissingStore() throws Exception {
    as(inspector, get("/api/stores/{id}/inspections", harbor.getId()))
        .andExpect(status().isOk())
        .andExpect(content().json("[]"));

    as(inspector, get("/api/stores/{id}/inspections", 99999))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.message").value("Store not found."));
  }

  private Inspection submitted(Store store, LocalDate date, int... flagged) {
    return transaction.execute(
        tx -> {
          var now = clock.instant();
          Inspection ins =
              Inspection.startRegular(
                  store,
                  inspector,
                  date,
                  requirements.findAllByOrderBySortOrderAsc(),
                  now);
          var flaggedSet = Arrays.stream(flagged).boxed().toList();
          for (var res : ins.getResults()) {
            boolean compliant = !flaggedSet.contains(res.getRequirement().getSortOrder());
            res.update(compliant, compliant ? null : "Issue with requirement " + res.getRequirement().getSortOrder());
          }
          ins.submit(inspector, date, now);
          return inspections.save(ins);
        });
  }

  private static int id(Inspection inspection) {
    return inspection.getId().intValue();
  }

  private ResultActions as(UserAccount user, MockHttpServletRequestBuilder request)
      throws Exception {
    return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, testData.bearer(user)));
  }
}
