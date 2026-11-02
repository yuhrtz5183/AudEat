package com.audeat.owner;

import static com.audeat.TestData.result;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.TestData;
import com.audeat.inspection.Inspection;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Owner endpoints under {@code /api/my-store} (US 15). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OwnerApiTest {

  private static final String NOT_AUTHORIZED = "You are not authorized to view this page.";

  @Autowired private MockMvc mvc;
  @Autowired private TestData testData;
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
  @DisplayName("AC 15.1: an owner sees their store's name, address and open ticket count")
  void ownerSeesOwnStore() throws Exception {
    // Blue Plate: tickets in every status (two open, one of them overdue; two rejected), and an
    // issue with no ticket yet. Open = every status but approved = 6; rejected = 2.
    Inspection blue = testData.submittedInspection(bluePlate, inspector, 1, 2, 3, 4, 5, 6, 7, 8);
    testData.ticket(result(blue, 1), TicketStatus.OPEN, today.minusDays(2));
    testData.ticket(result(blue, 2), TicketStatus.OPEN, today.plusDays(3));
    testData.ticket(result(blue, 3), TicketStatus.AWAITING_REVIEW, today.plusDays(3));
    testData.ticket(result(blue, 4), TicketStatus.REJECTED, today.plusDays(3));
    testData.ticket(result(blue, 5), TicketStatus.REJECTED, today.plusDays(3));
    testData.ticket(result(blue, 6), TicketStatus.FOLLOW_UP_SCHEDULED, today.plusDays(3));
    testData.ticket(result(blue, 7), TicketStatus.APPROVED, today.plusDays(3));
    // Another store's tickets, which must not leak into Blue Plate's counts.
    Inspection other = testData.submittedInspection(corner, inspector, 1, 2, 3);
    testData.ticket(result(other, 1), TicketStatus.OPEN, today.plusDays(3));
    testData.ticket(result(other, 2), TicketStatus.REJECTED, today.plusDays(3));
    testData.ticket(result(other, 3), TicketStatus.AWAITING_REVIEW, today.plusDays(3));

    myStore(owner)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(5))
        .andExpect(jsonPath("$.id").value(bluePlate.getId()))
        .andExpect(jsonPath("$.name").value("Blue Plate Diner"))
        .andExpect(jsonPath("$.address").value("412 Main St"))
        .andExpect(jsonPath("$.openTicketCount").value(6))
        .andExpect(jsonPath("$.rejectedCount").value(2));
  }

  @Test
  @DisplayName("AC 15.1: a store with no tickets shows zero open and zero rejected")
  void storeWithoutTicketsShowsZero() throws Exception {
    testData.submittedInspection(bluePlate, inspector);

    myStore(owner)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Blue Plate Diner"))
        .andExpect(jsonPath("$.openTicketCount").value(0))
        .andExpect(jsonPath("$.rejectedCount").value(0));
  }

  @Test
  @DisplayName("AC 15.1: owners of different stores each see only their own store")
  void eachOwnerSeesOnlyOwnStore() throws Exception {
    UserAccount cornerOwner = testData.owner("Corner Bakery Co.");
    Inspection blue = testData.submittedInspection(bluePlate, inspector, 1);
    testData.ticket(result(blue, 1), TicketStatus.REJECTED, today.plusDays(3));
    Inspection other = testData.submittedInspection(corner, inspector, 1, 2);
    testData.ticket(result(other, 1), TicketStatus.OPEN, today.plusDays(3));
    testData.ticket(result(other, 2), TicketStatus.OPEN, today.plusDays(3));

    myStore(owner)
        .andExpect(jsonPath("$.id").value(bluePlate.getId()))
        .andExpect(jsonPath("$.name").value("Blue Plate Diner"))
        .andExpect(jsonPath("$.openTicketCount").value(1))
        .andExpect(jsonPath("$.rejectedCount").value(1));
    myStore(cornerOwner)
        .andExpect(jsonPath("$.id").value(corner.getId()))
        .andExpect(jsonPath("$.name").value("Corner Bakery Co."))
        .andExpect(jsonPath("$.openTicketCount").value(2))
        .andExpect(jsonPath("$.rejectedCount").value(0));
  }

  @Test
  @DisplayName("AC 15.2: an owner is refused the inspector's store routes with a JSON 403")
  void ownerCannotBrowseStores() throws Exception {
    for (MockHttpServletRequestBuilder request :
        new MockHttpServletRequestBuilder[] {
          get("/api/stores/{id}/inspections", corner.getId()),
          get("/api/stores/{id}/inspections", bluePlate.getId()),
          get("/api/tickets").param("status", "awaiting_review")
        }) {
      as(owner, request)
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.message").value(NOT_AUTHORIZED));
    }
    // Registration needs the plain store list, so it stays public and returns only names.
    as(owner, get("/api/stores")).andExpect(status().isOk());
  }

  @Test
  @DisplayName("an inspector gets the same JSON 403 on the owner's store page")
  void inspectorCannotOpenMyStore() throws Exception {
    myStore(inspector)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value(NOT_AUTHORIZED));
  }

  @Test
  @DisplayName("AC 13.3: requires a token")
  void requiresToken() throws Exception {
    mvc.perform(get("/api/my-store"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.message").value("Authentication required."));
  }

  private ResultActions myStore(UserAccount user) throws Exception {
    return as(user, get("/api/my-store"));
  }

  private ResultActions as(UserAccount user, MockHttpServletRequestBuilder request)
      throws Exception {
    return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, testData.bearer(user)));
  }
}
