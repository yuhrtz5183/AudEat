package com.audeat.owner;

import static com.audeat.TestData.result;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.TestData;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionResult;
import com.audeat.photo.Photo;
import com.audeat.photo.PhotoRepository;
import com.audeat.remediation.RemediationSubmission;
import com.audeat.remediation.RemediationSubmissionRepository;
import com.audeat.remediation.RemediationTicket;
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

/** The owner's remediation tickets: {@code /api/my-store/tickets} (US 4, 10). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OwnerTicketsApiTest {

  private static final String NOT_AUTHORIZED = "You are not authorized to view this page.";
  private static final String TICKET_NOT_FOUND = "Ticket not found.";

  /** "RIFF", a size, "WEBP": enough for the type check. */
  private static final byte[] WEBP = {'R', 'I', 'F', 'F', 4, 0, 0, 0, 'W', 'E', 'B', 'P'};

  @Autowired private MockMvc mvc;
  @Autowired private TestData testData;
  @Autowired private PhotoRepository photos;
  @Autowired private RemediationSubmissionRepository submissions;
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
      "AC 4.1: an owner's list shows each ticket's flagged issue, deadline, status and"
          + " required remediation, and no other store's tickets")
  void ownerSeesOwnTickets() throws Exception {
    Inspection blue = testData.submittedInspection(bluePlate, inspector, 1, 2);
    InspectionResult cooler = result(blue, 1);
    RemediationTicket open = testData.ticket(cooler, TicketStatus.OPEN, today.plusDays(3));
    RemediationTicket rejected =
        testData.ticket(result(blue, 2), TicketStatus.REJECTED, today.plusDays(5));
    Inspection other = testData.submittedInspection(corner, inspector, 1);
    RemediationTicket foreign =
        testData.ticket(result(other, 1), TicketStatus.OPEN, today.plusDays(1));

    myTickets(owner)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2))
        .andExpect(
            jsonPath("$[*].id")
                .value(containsInAnyOrder(open.getId().intValue(), rejected.getId().intValue())))
        .andExpect(jsonPath("$[0].id").value(open.getId()))
        .andExpect(jsonPath("$[0].status").value("open"))
        .andExpect(jsonPath("$[0].deadline").value(today.plusDays(3).toString()))
        .andExpect(jsonPath("$[0].requiredRemediation").value("Fix it."))
        .andExpect(jsonPath("$[0].issue.resultId").value(cooler.getId()))
        .andExpect(
            jsonPath("$[0].issue.requirement").value(cooler.getRequirement().getDescription()))
        .andExpect(jsonPath("$[0].issue.comment").value("Flagged requirement 1."))
        .andExpect(jsonPath("$[0].issue.resolved").value(false))
        .andExpect(jsonPath("$[0].storeName").value("Blue Plate Diner"))
        .andExpect(jsonPath("$[0].inspectionId").value(blue.getId()))
        .andExpect(jsonPath("$[1].id").value(rejected.getId()))
        .andExpect(jsonPath("$[1].status").value("rejected"))
        .andExpect(jsonPath("$[1].issue.comment").value("Flagged requirement 2."));
    // The other store's owner sees only that store's ticket.
    myTickets(testData.owner("Corner Bakery Co."))
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].id").value(foreign.getId()));
  }

  @Test
  @DisplayName("AC 4.1: a store with no tickets gets an empty list")
  void storeWithoutTicketsGetsEmptyList() throws Exception {
    testData.submittedInspection(bluePlate, inspector);

    myTickets(owner).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  @DisplayName("AC 10.1: open tickets come nearest deadline first, each with its days remaining")
  void nearestDeadlineFirst() throws Exception {
    Inspection blue = testData.submittedInspection(bluePlate, inspector, 1, 2, 3, 4);
    RemediationTicket inNine =
        testData.ticket(result(blue, 1), TicketStatus.OPEN, today.plusDays(9));
    RemediationTicket inTwo =
        testData.ticket(result(blue, 2), TicketStatus.AWAITING_REVIEW, today.plusDays(2));
    RemediationTicket inFive =
        testData.ticket(result(blue, 3), TicketStatus.REJECTED, today.plusDays(5));
    RemediationTicket inOne =
        testData.ticket(result(blue, 4), TicketStatus.OPEN, today.plusDays(1));

    myTickets(owner)
        .andExpect(status().isOk())
        .andExpect(
            jsonPath("$[*].id")
                .value(
                    contains(
                        inOne.getId().intValue(),
                        inTwo.getId().intValue(),
                        inFive.getId().intValue(),
                        inNine.getId().intValue())))
        .andExpect(
            jsonPath("$[*].deadline")
                .value(
                    contains(
                        today.plusDays(1).toString(),
                        today.plusDays(2).toString(),
                        today.plusDays(5).toString(),
                        today.plusDays(9).toString())))
        .andExpect(jsonPath("$[*].daysRemaining").value(contains(1, 2, 5, 9)))
        .andExpect(jsonPath("$[*].overdue").value(contains(false, false, false, false)))
        .andExpect(jsonPath("$[*].daysOverdue").value(contains(0, 0, 0, 0)));
  }

  @Test
  @DisplayName(
      "AC 10.2: a past-deadline ticket that is not approved is overdue and listed first; due"
          + " today is not overdue; an approved ticket is never overdue and comes last")
  void overdueTicketsFirst() throws Exception {
    Inspection blue = testData.submittedInspection(bluePlate, inspector, 1, 2, 3, 4, 5);
    RemediationTicket dueToday = testData.ticket(result(blue, 1), TicketStatus.OPEN, today);
    RemediationTicket approvedLongAgo =
        testData.ticket(result(blue, 2), TicketStatus.APPROVED, today.minusDays(10));
    RemediationTicket inThree =
        testData.ticket(result(blue, 3), TicketStatus.OPEN, today.plusDays(3));
    RemediationTicket awaitingPastDeadline =
        testData.ticket(result(blue, 4), TicketStatus.AWAITING_REVIEW, today.minusDays(1));
    RemediationTicket overdue =
        testData.ticket(result(blue, 5), TicketStatus.OPEN, today.minusDays(3));

    myTickets(owner)
        .andExpect(status().isOk())
        .andExpect(
            jsonPath("$[*].id")
                .value(
                    contains(
                        overdue.getId().intValue(),
                        awaitingPastDeadline.getId().intValue(),
                        dueToday.getId().intValue(),
                        inThree.getId().intValue(),
                        approvedLongAgo.getId().intValue())))
        // Overdue, at the top, with the current status still reported.
        .andExpect(jsonPath("$[0].overdue").value(true))
        .andExpect(jsonPath("$[0].status").value("open"))
        .andExpect(jsonPath("$[0].daysRemaining").value(-3))
        .andExpect(jsonPath("$[0].daysOverdue").value(3))
        .andExpect(jsonPath("$[1].overdue").value(true))
        .andExpect(jsonPath("$[1].status").value("awaiting_review"))
        .andExpect(jsonPath("$[1].daysOverdue").value(1))
        // A deadline of today is not past (DESIGN Decision 3).
        .andExpect(jsonPath("$[2].overdue").value(false))
        .andExpect(jsonPath("$[2].daysRemaining").value(0))
        .andExpect(jsonPath("$[2].daysOverdue").value(0))
        .andExpect(jsonPath("$[3].overdue").value(false))
        // Approved is resolved, so its old deadline does not make it overdue.
        .andExpect(jsonPath("$[4].status").value("approved"))
        .andExpect(jsonPath("$[4].overdue").value(false))
        .andExpect(jsonPath("$[4].daysOverdue").value(0))
        .andExpect(jsonPath("$[4].issue.resolved").value(true));
  }

  @Test
  @DisplayName(
      "AC 4.2: a ticket's details show the issue, the inspector's comments, every picture of"
          + " the issue (oldest first) and the current status")
  void ownerSeesTicketDetails() throws Exception {
    Inspection blue = testData.submittedInspection(bluePlate, inspector, 1);
    InspectionResult cooler = result(blue, 1);
    long first = issuePhoto(cooler);
    long second = issuePhoto(cooler);
    long third = issuePhoto(cooler);
    RemediationTicket ticket =
        testData.ticket(cooler, TicketStatus.REJECTED, today.plusDays(4));

    myTicket(owner, ticket.getId())
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(ticket.getId()))
        .andExpect(jsonPath("$.status").value("rejected"))
        .andExpect(jsonPath("$.overdue").value(false))
        .andExpect(jsonPath("$.deadline").value(today.plusDays(4).toString()))
        .andExpect(jsonPath("$.daysRemaining").value(4))
        .andExpect(jsonPath("$.requiredRemediation").value("Fix it."))
        .andExpect(jsonPath("$.issue.resultId").value(cooler.getId()))
        .andExpect(jsonPath("$.issue.requirement").value(cooler.getRequirement().getDescription()))
        .andExpect(jsonPath("$.issue.comment").value("Flagged requirement 1."))
        .andExpect(
            jsonPath("$.issue.photoIds").value(contains((int) first, (int) second, (int) third)))
        .andExpect(jsonPath("$.storeName").value("Blue Plate Diner"))
        .andExpect(jsonPath("$.inspectionId").value(blue.getId()))
        .andExpect(jsonPath("$.inspectionDate").value(today.toString()))
        // The owner's evidence and the inspector's review comment on it (AC 6.2 notice).
        .andExpect(jsonPath("$.submissions.length()").value(1))
        .andExpect(jsonPath("$.submissions[0].comment").value("Fixed it."))
        .andExpect(jsonPath("$.submissions[0].decision").value("rejected"))
        .andExpect(jsonPath("$.submissions[0].reviewComment").value("Not fixed yet."))
        .andExpect(jsonPath("$.followUps.length()").value(0));
  }

  @Test
  @DisplayName(
      "AC 4.2: the issue's pictures are those of the original issue only, not the evidence or"
          + " another issue's")
  void issuePhotosAreTheOriginalIssuesOnly() throws Exception {
    Inspection blue = testData.submittedInspection(bluePlate, inspector, 1, 2);
    InspectionResult cooler = result(blue, 1);
    InspectionResult rawMeat = result(blue, 2);
    long coolerPhoto = issuePhoto(cooler);
    issuePhoto(rawMeat);
    RemediationTicket ticket =
        testData.ticket(cooler, TicketStatus.AWAITING_REVIEW, today.plusDays(4));
    testData.ticket(rawMeat, TicketStatus.OPEN, today.plusDays(6));
    RemediationSubmission submission =
        submissions.findByTicketIdOrderBySubmittedAtAscIdAsc(ticket.getId()).get(0);
    long evidencePhoto =
        photos.save(Photo.ofSubmission(submission, "image/webp", WEBP, clock.instant())).getId();

    myTicket(owner, ticket.getId())
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.issue.photoIds").value(contains((int) coolerPhoto)))
        .andExpect(jsonPath("$.submissions.length()").value(1))
        .andExpect(
            jsonPath("$.submissions[0].evidencePhotoIds").value(contains((int) evidencePhoto)));
  }

  @Test
  @DisplayName("AC 4.2: an overdue ticket's details show it as overdue, with no submissions yet")
  void overdueTicketDetails() throws Exception {
    Inspection blue = testData.submittedInspection(bluePlate, inspector, 1);
    RemediationTicket ticket =
        testData.ticket(result(blue, 1), TicketStatus.OPEN, today.minusDays(2));

    myTicket(owner, ticket.getId())
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("open"))
        .andExpect(jsonPath("$.overdue").value(true))
        .andExpect(jsonPath("$.daysOverdue").value(2))
        .andExpect(jsonPath("$.issue.photoIds.length()").value(0))
        .andExpect(jsonPath("$.submissions.length()").value(0));
  }

  @Test
  @DisplayName("AC 7.1: the owner sees the date of a scheduled follow-up inspection")
  void ownerSeesFollowUpDate() throws Exception {
    Inspection blue = testData.submittedInspection(bluePlate, inspector, 1);
    RemediationTicket ticket =
        testData.ticket(result(blue, 1), TicketStatus.FOLLOW_UP_SCHEDULED, today.plusDays(7));
    String tomorrow = today.plusDays(1).toString();

    myTickets(owner)
        .andExpect(jsonPath("$[0].status").value("follow_up_scheduled"))
        .andExpect(jsonPath("$[0].followUpDate").value(tomorrow));
    myTicket(owner, ticket.getId())
        .andExpect(jsonPath("$.followUpDate").value(tomorrow))
        .andExpect(jsonPath("$.submissions[0].decision").value("follow_up"))
        .andExpect(jsonPath("$.followUps[0].inspectionDate").value(tomorrow))
        .andExpect(jsonPath("$.followUps[0].status").value("draft"));
  }

  @Test
  @DisplayName("the owner sees a draft follow-up's date, but not the inspector's unsubmitted result")
  void draftFollowUpResultIsHiddenFromOwner() throws Exception {
    Inspection blue = testData.submittedInspection(bluePlate, inspector, 1);
    RemediationTicket ticket =
        testData.ticket(result(blue, 1), TicketStatus.FOLLOW_UP_SCHEDULED, today.plusDays(7));
    testData.markDraftFollowUp(ticket, false, "Shelving still not installed.");

    myTicket(owner, ticket.getId())
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.followUps.length()").value(1))
        .andExpect(jsonPath("$.followUps[0].inspectionDate").value(today.plusDays(1).toString()))
        .andExpect(jsonPath("$.followUps[0].status").value("draft"))
        .andExpect(jsonPath("$.followUps[0].compliant").value(nullValue()))
        .andExpect(jsonPath("$.followUps[0].comment").value(nullValue()))
        .andExpect(content().string(not(containsString("Shelving still not installed."))));
  }

  @Test
  @DisplayName(
      "another store's ticket, a missing id and a non-numeric id all get the same 404 (AC 9.2)")
  void otherStoresTicketIsNotFound() throws Exception {
    Inspection other = testData.submittedInspection(corner, inspector, 1);
    RemediationTicket foreign =
        testData.ticket(result(other, 1), TicketStatus.OPEN, today.plusDays(3));

    for (Object id : new Object[] {foreign.getId(), foreign.getId() + 1000, "abc"}) {
      as(owner, get("/api/my-store/tickets/{id}", id))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.length()").value(1))
          .andExpect(jsonPath("$.message").value(TICKET_NOT_FOUND));
    }
  }

  @Test
  @DisplayName("an inspector gets the JSON 403 on the owner's ticket routes")
  void inspectorCannotOpenOwnerTickets() throws Exception {
    Inspection blue = testData.submittedInspection(bluePlate, inspector, 1);
    RemediationTicket ticket =
        testData.ticket(result(blue, 1), TicketStatus.OPEN, today.plusDays(3));

    myTickets(inspector)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value(NOT_AUTHORIZED));
    myTicket(inspector, ticket.getId())
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value(NOT_AUTHORIZED));
  }

  @Test
  @DisplayName("AC 13.3: the ticket routes require a token")
  void requiresToken() throws Exception {
    for (String url : new String[] {"/api/my-store/tickets", "/api/my-store/tickets/1"}) {
      mvc.perform(get(url))
          .andExpect(status().isUnauthorized())
          .andExpect(jsonPath("$.message").value("Authentication required."));
    }
  }

  private long issuePhoto(InspectionResult result) {
    return photos.save(Photo.ofResult(result, "image/webp", WEBP, clock.instant())).getId();
  }

  private ResultActions myTickets(UserAccount user) throws Exception {
    return as(user, get("/api/my-store/tickets"));
  }

  private ResultActions myTicket(UserAccount user, long ticketId) throws Exception {
    return as(user, get("/api/my-store/tickets/{id}", ticketId));
  }

  private ResultActions as(UserAccount user, MockHttpServletRequestBuilder request)
      throws Exception {
    return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, testData.bearer(user)));
  }
}
