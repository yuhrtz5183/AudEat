package com.audeat.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import com.audeat.TestData;
import com.audeat.inspection.InspectionRepository;
import com.audeat.inspection.InspectionSummaryResponse;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.TicketDetailResponse;
import com.audeat.remediation.TicketStatus;
import com.audeat.remediation.TicketSummaryResponse;
import com.audeat.remediation.TicketViews;
import com.audeat.store.Store;
import com.audeat.user.UserAccount;
import com.audeat.user.UserAccountRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

/** The demo dataset is exactly DESIGN §5, the same data the frontend mock seeds. */
@SpringBootTest
@ActiveProfiles({"test", "demo"})
class DemoDataSeederTest {

  @Autowired private DemoDataSeeder seeder;
  @Autowired private TestData testData;
  @Autowired private TransactionTemplate transaction;
  @Autowired private UserAccountRepository users;
  @Autowired private InspectionRepository inspections;
  @Autowired private RemediationTicketRepository tickets;
  @Autowired private TicketViews ticketViews;
  @Autowired private PasswordEncoder passwordEncoder;
  @Autowired private Clock clock;

  private LocalDate today;

  @BeforeEach
  void seed() {
    // Other test classes share the database, so start from a clean one.
    testData.cleanAll();
    seeder.run(null);
    today = LocalDate.now(clock);
  }

  @AfterEach
  void clean() {
    testData.cleanAll();
  }

  @Test
  @DisplayName("creates the four demo accounts once, with the demo password")
  void createsAccountsOnce() {
    seeder.run(null);

    assertThat(users.findAll())
        .extracting(UserAccount::getEmail)
        .containsExactlyInAnyOrder(
            "inspector@audeat.test",
            "owner.blueplate@audeat.test",
            "owner.corner@audeat.test",
            "owner.harbor@audeat.test");
    String hash = users.findByEmail("inspector@audeat.test").orElseThrow().getPasswordHash();
    assertThat(passwordEncoder.matches("audeat-demo", hash)).isTrue();
  }

  @Test
  @DisplayName("Blue Plate: tickets A, B, E, C, F, D; only A overdue; 5 open, 1 rejected")
  void bluePlateTickets() {
    long bluePlate = testData.store("Blue Plate Diner").getId();
    List<TicketSummaryResponse> list =
        transaction.execute(tx -> ticketViews.summaries(tickets.findForStore(bluePlate)));

    assertThat(list)
        .extracting(TicketSummaryResponse::status)
        .containsExactly(
            TicketStatus.OPEN,
            TicketStatus.OPEN,
            TicketStatus.REJECTED,
            TicketStatus.AWAITING_REVIEW,
            TicketStatus.FOLLOW_UP_SCHEDULED,
            TicketStatus.APPROVED);
    assertThat(list)
        .extracting(ticket -> ticket.issue().comment())
        .containsExactly(
            "Walk-in cooler read 48°F.",
            "No paper towels at the prep sink.",
            "Unlabeled containers in the walk-in.",
            "Cutting boards stained and not sanitized.",
            "Raw chicken stored above salad greens.",
            "Mouse droppings behind the dry-storage shelf.");
    assertThat(list)
        .extracting(TicketSummaryResponse::overdue)
        .containsExactly(true, false, false, false, false, false);
    assertThat(list.get(0).daysOverdue()).isEqualTo(2);
    assertThat(list.get(1).daysRemaining()).isZero();
    assertThat(list.get(4).followUpDate()).isEqualTo(today.plusDays(2));
    assertThat(list.get(4).followUpInspectionId()).isNotNull();
    EnumSet<TicketStatus> open = EnumSet.complementOf(EnumSet.of(TicketStatus.APPROVED));
    assertThat(tickets.countForStore(bluePlate, open)).isEqualTo(5);
    assertThat(tickets.countForStore(bluePlate, List.of(TicketStatus.REJECTED))).isEqualTo(1);

    TicketDetailResponse rejected =
        transaction.execute(
            tx -> ticketViews.detail(tickets.findById(list.get(2).id()).orElseThrow()));
    assertThat(rejected.submissions())
        .singleElement()
        .satisfies(
            submission -> {
              assertThat(submission.reviewComment())
                  .isEqualTo("The photo does not show the labels; please send a close-up.");
              assertThat(submission.evidencePhotoIds()).hasSize(1);
            });
  }

  @Test
  @DisplayName("history: Blue Plate I3, I2, I1; Corner I7, I6 (follow-up), I5; Harbor empty")
  void histories() {
    assertThat(history("Blue Plate Diner"))
        .extracting(
            InspectionSummaryResponse::inspectionDate, InspectionSummaryResponse::violationCount)
        .containsExactly(
            tuple(today.minusDays(10), 6L),
            tuple(today.minusDays(30), 0L),
            tuple(today.minusDays(60), 1L));
    assertThat(history("Corner Bakery Co."))
        .extracting(InspectionSummaryResponse::violationCount, InspectionSummaryResponse::followUp)
        .containsExactly(
            tuple(1L, false),
            tuple(0L, true),
            tuple(1L, false));
    assertThat(history("Harbor Noodle House")).isEmpty();
    assertThat(tickets.findForStore(testData.store("Harbor Noodle House").getId())).isEmpty();
  }

  @Test
  @DisplayName("inspector queues: C awaits review; F's follow-up is the I4 draft; H was approved")
  void inspectorQueues() {
    List<TicketSummaryResponse> awaiting =
        transaction.execute(
            tx ->
                ticketViews.summaries(
                    tickets.findByStatusForInspector(TicketStatus.AWAITING_REVIEW)));
    List<TicketSummaryResponse> followUps =
        transaction.execute(
            tx ->
                ticketViews.summaries(
                    tickets.findByStatusForInspector(TicketStatus.FOLLOW_UP_SCHEDULED)));

    assertThat(awaiting)
        .singleElement()
        .satisfies(t -> assertThat(t.issue().comment()).startsWith("Cutting boards"));
    assertThat(followUps)
        .singleElement()
        .satisfies(
            t -> {
              assertThat(t.issue().comment()).startsWith("Raw chicken");
              assertThat(inspections.findById(t.followUpInspectionId()).orElseThrow().isFollowUp())
                  .isTrue();
            });

    long corner = testData.store("Corner Bakery Co.").getId();
    TicketDetailResponse h =
        transaction.execute(
            tx ->
                ticketViews.detail(
                    tickets.findForStore(corner).stream()
                        .filter(t -> t.getStatus() == TicketStatus.APPROVED)
                        .findFirst()
                        .orElseThrow()));
    assertThat(h.approvedAt())
        .isEqualTo(today.minusDays(30).atTime(15, 0).toInstant(ZoneOffset.UTC));
    assertThat(h.followUps())
        .singleElement()
        .satisfies(f -> assertThat(f.comment()).isEqualTo("No flies seen; drain cleaned."));
  }

  private List<InspectionSummaryResponse> history(String storeName) {
    Store store = testData.store(storeName);
    return inspections.findHistory(store.getId());
  }
}
