package com.audeat.demo;

import com.audeat.checklist.ChecklistRequirementRepository;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionRepository;
import com.audeat.inspection.InspectionResult;
import com.audeat.photo.Photo;
import com.audeat.photo.PhotoRepository;
import com.audeat.remediation.RemediationSubmission;
import com.audeat.remediation.RemediationSubmissionRepository;
import com.audeat.remediation.RemediationTicket;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.ReviewDecision;
import com.audeat.store.Store;
import com.audeat.store.StoreRepository;
import com.audeat.user.Role;
import com.audeat.user.UserAccount;
import com.audeat.user.UserAccountRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo accounts, inspections, tickets and photos for local runs, CI's full-stack e2e job and the
 * class demo (DESIGN §5). Dates are relative to today. The frontend mock ({@code
 * frontend/mock/seed.js}) seeds exactly the same data, so the e2e specs pass on both. Runs once:
 * it does nothing when the demo inspector already exists.
 */
@Component
@Profile({"dev", "demo"})
public class DemoDataSeeder implements ApplicationRunner {

  static final String PASSWORD = "audeat-demo";
  static final String INSPECTOR_EMAIL = "inspector@audeat.test";

  private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

  /** A 1x1 PNG, the same bytes as the mock's {@code PNG_1x1}. */
  private static final byte[] PNG_1X1 =
      Base64.getDecoder()
          .decode(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAA"
                  + "AABJRU5ErkJggg==");

  private final UserAccountRepository users;
  private final StoreRepository stores;
  private final ChecklistRequirementRepository requirements;
  private final InspectionRepository inspections;
  private final RemediationTicketRepository tickets;
  private final RemediationSubmissionRepository submissions;
  private final PhotoRepository photos;
  private final PasswordEncoder passwordEncoder;
  private final Clock clock;

  // Set at the start of run(); every date and timestamp below is relative to today.
  private LocalDate today;
  private UserAccount ivy;

  public DemoDataSeeder(
      UserAccountRepository users,
      StoreRepository stores,
      ChecklistRequirementRepository requirements,
      InspectionRepository inspections,
      RemediationTicketRepository tickets,
      RemediationSubmissionRepository submissions,
      PhotoRepository photos,
      PasswordEncoder passwordEncoder,
      Clock clock) {
    this.users = users;
    this.stores = stores;
    this.requirements = requirements;
    this.inspections = inspections;
    this.tickets = tickets;
    this.submissions = submissions;
    this.photos = photos;
    this.passwordEncoder = passwordEncoder;
    this.clock = clock;
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) {
    if (users.existsByEmail(INSPECTOR_EMAIL)) {
      return;
    }
    today = LocalDate.now(clock);
    Store bluePlate = store("Blue Plate Diner");
    Store corner = store("Corner Bakery Co.");
    Store harbor = store("Harbor Noodle House");

    ivy = user("Ivy Inspector", INSPECTOR_EMAIL, Role.INSPECTOR, null);
    user("Bea Owner", "owner.blueplate@audeat.test", Role.OWNER, bluePlate);
    user("Cora Owner", "owner.corner@audeat.test", Role.OWNER, corner);
    user("Hal Owner", "owner.harbor@audeat.test", Role.OWNER, harbor);

    // I1: one issue, fixed and approved (ticket D).
    Inspection i1 =
        inspection(bluePlate, -60, Map.of(6, "Mouse droppings behind the dry-storage shelf."));
    photo(result(i1, 6), -60);
    RemediationTicket d =
        ticket(
            result(i1, 6),
            "Seal the gaps behind the shelf and book a pest-control visit.",
            -40,
            -60);
    evidence(d, "Sealed the gaps and the pest-control visit found no activity.", -46)
        .review(ReviewDecision.APPROVED, null, at(-45));
    d.approve(at(-45));

    // I2: no violations (AC 1.2).
    inspection(bluePlate, -30, Map.of());

    // I3: six issues covering every ticket status, and one issue without a ticket.
    Inspection i3 =
        inspection(
            bluePlate,
            -10,
            Map.of(
                1, "Walk-in cooler read 48°F.",
                2, "Raw chicken stored above salad greens.",
                3, "No paper towels at the prep sink.",
                4, "Prep cook working without a hair restraint.",
                5, "Cutting boards stained and not sanitized.",
                7, "Unlabeled containers in the walk-in."));
    photo(result(i3, 1), -10);
    ticket(result(i3, 1), "Repair the cooler and log temperatures twice daily.", -2, -10);
    ticket(result(i3, 3), "Restock the prep sink and check it at every shift change.", 0, -10);
    RemediationTicket c =
        ticket(
            result(i3, 5),
            "Replace the stained cutting boards and sanitize them after each use.",
            5,
            -10);
    evidence(c, "Replaced all cutting boards and added a sanitizer log.", -1);
    RemediationTicket e =
        ticket(result(i3, 7), "Label and date every container in the walk-in.", 3, -10);
    evidence(e, "Labeled every container in the walk-in.", -4)
        .review(
            ReviewDecision.REJECTED,
            "The photo does not show the labels; please send a close-up.",
            at(-3));
    e.reject();
    RemediationTicket f =
        ticket(
            result(i3, 2), "Store raw meat on the bottom shelf, below ready-to-eat food.", 7, -10);
    evidence(f, "Installed new shelving and moved raw chicken to the bottom shelf.", -2)
        .review(ReviewDecision.FOLLOW_UP, "I need to see the new shelving in person.", at(-1));
    f.scheduleFollowUp();
    // I4: the scheduled follow-up of I3 #2, not done yet.
    inspections.save(Inspection.scheduleFollowUp(result(i3, 2), ivy, day(2), at(-1)));

    // I5: one issue, approved through a follow-up (ticket H); I6 is that follow-up.
    Inspection i5 = inspection(corner, -40, Map.of(6, "Fruit flies near the dish station."));
    RemediationTicket h =
        ticket(result(i5, 6), "Clean the dish-station drain and set fly traps.", -28, -40);
    evidence(h, "Cleaned the drain and set fly traps.", -35)
        .review(ReviewDecision.FOLLOW_UP, null, at(-34));
    h.scheduleFollowUp();
    Inspection i6 = Inspection.scheduleFollowUp(result(i5, 6), ivy, day(-30), at(-34));
    i6.getResults().get(0).update(true, "No flies seen; drain cleaned.");
    i6.submit(ivy, day(-30), at(-30));
    inspections.save(i6);
    h.recordFollowUpResult(true, at(-30));

    // I7: one open issue (ticket G).
    Inspection i7 = inspection(corner, -5, Map.of(8, "Dumpster lid left open."));
    ticket(result(i7, 8), "Keep the dumpster lid closed and empty the bins daily.", 10, -5);

    log.info("Seeded demo data; demo accounts use the password '{}'.", PASSWORD);
  }

  private Store store(String name) {
    return stores.findAll().stream()
        .filter(store -> store.getName().equals(name))
        .findFirst()
        .orElseThrow(() -> new IllegalStateException("Seeded store missing: " + name));
  }

  private UserAccount user(String name, String email, Role role, Store store) {
    return users.save(
        new UserAccount(name, email, passwordEncoder.encode(PASSWORD), role, store, at(-90)));
  }

  /** A submitted regular inspection; {@code flagged} maps checklist numbers to the comment. */
  private Inspection inspection(Store store, int offset, Map<Integer, String> flagged) {
    Inspection inspection =
        Inspection.startRegular(
            store, ivy, day(offset), requirements.findAllByOrderBySortOrderAsc(), at(offset));
    for (InspectionResult result : inspection.getResults()) {
      String comment = flagged.get(result.getRequirement().getSortOrder());
      result.update(comment == null, comment);
    }
    inspection.submit(ivy, day(offset), at(offset));
    return inspections.save(inspection);
  }

  private static InspectionResult result(Inspection inspection, int sortOrder) {
    return inspection.getResults().stream()
        .filter(result -> result.getRequirement().getSortOrder() == sortOrder)
        .findFirst()
        .orElseThrow();
  }

  private RemediationTicket ticket(
      InspectionResult result, String requiredRemediation, int deadline, int createdOffset) {
    return tickets.save(
        new RemediationTicket(result, requiredRemediation, day(deadline), at(createdOffset)));
  }

  /** The owner's evidence for the ticket, with one photo; the caller records the review. */
  private RemediationSubmission evidence(RemediationTicket ticket, String comment, int offset) {
    ticket.submitEvidence();
    RemediationSubmission submission =
        submissions.save(new RemediationSubmission(ticket, comment, at(offset)));
    photos.save(Photo.ofSubmission(submission, "image/png", PNG_1X1, at(offset)));
    return submission;
  }

  private void photo(InspectionResult result, int offset) {
    photos.save(Photo.ofResult(result, "image/png", PNG_1X1, at(offset)));
  }

  private LocalDate day(int offset) {
    return today.plusDays(offset);
  }

  /** 15:00 UTC on that day, like the mock. */
  private Instant at(int offset) {
    return day(offset).atTime(15, 0).toInstant(ZoneOffset.UTC);
  }
}
