package com.audeat.inspection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.audeat.checklist.ChecklistRequirement;
import com.audeat.common.ApiExceptions.Conflict;
import com.audeat.store.Store;
import com.audeat.user.Role;
import com.audeat.user.UserAccount;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** Starting, editing and submitting inspections (US 1, 2, 7). */
class InspectionTest {

  private static final LocalDate TODAY = LocalDate.of(2026, 11, 2);
  private static final Instant NOW = Instant.parse("2026-11-02T15:00:00Z");

  private final Store store = new Store("Blue Plate Diner", "412 Main St");
  private final ChecklistRequirement temperatures = new ChecklistRequirement(1, "Temperatures.");
  private final ChecklistRequirement pests = new ChecklistRequirement(2, "No pests.");
  private final UserAccount ivy = inspector(1L, "Ivy");
  private final UserAccount ian = inspector(2L, "Ian");

  @Test
  @DisplayName("AC 1.1: starts a draft dated today with every requirement unmarked, in order")
  void startsRegularDraft() {
    Inspection inspection = regular();

    assertThat(inspection.getStatus()).isEqualTo(InspectionStatus.DRAFT);
    assertThat(inspection.getInspectionDate()).isEqualTo(TODAY);
    assertThat(inspection.getStore()).isSameAs(store);
    assertThat(inspection.getInspector()).isSameAs(ivy);
    assertThat(inspection.getCreatedAt()).isEqualTo(NOW);
    assertThat(inspection.getSubmittedAt()).isNull();
    assertThat(inspection.isFollowUp()).isFalse();
    assertThat(inspection.getResults())
        .extracting(InspectionResult::getRequirement)
        .containsExactly(temperatures, pests);
    assertThat(inspection.getResults())
        .allSatisfy(
            result -> {
              assertThat(result.getInspection()).isSameAs(inspection);
              assertThat(result.getCompliant()).isNull();
              assertThat(result.isFlagged()).isFalse();
            });
  }

  @Test
  @DisplayName("AC 2.1: only a non-compliant result is a flagged issue")
  void flaggedMeansNonCompliant() {
    InspectionResult result = regular().getResults().get(0);

    result.update(false, "Walk-in cooler read 48°F.");
    assertThat(result.isFlagged()).isTrue();
    assertThat(result.getComment()).isEqualTo("Walk-in cooler read 48°F.");

    result.update(true, null);
    assertThat(result.isFlagged()).isFalse();
  }

  @Test
  @DisplayName("AC 7.1: schedules a follow-up of one issue on the chosen date, at the same store")
  void schedulesFollowUp() {
    InspectionResult issue = regular().getResults().get(1);

    Inspection followUp = Inspection.scheduleFollowUp(issue, ivy, TODAY.plusDays(2), NOW);

    assertThat(followUp.isFollowUp()).isTrue();
    assertThat(followUp.getFollowUpOf()).isSameAs(issue);
    assertThat(followUp.getStatus()).isEqualTo(InspectionStatus.DRAFT);
    assertThat(followUp.getInspectionDate()).isEqualTo(TODAY.plusDays(2));
    assertThat(followUp.getStore()).isSameAs(store);
    assertThat(followUp.getInspector()).isSameAs(ivy);
    assertThat(followUp.getResults())
        .singleElement()
        .satisfies(
            result -> {
              assertThat(result.getRequirement()).isSameAs(pests);
              assertThat(result.getInspection()).isSameAs(followUp);
              assertThat(result.getCompliant()).isNull();
            });
  }

  @Test
  @DisplayName("only its own inspector may edit a regular inspection")
  void regularIsEditableByItsInspectorOnly() {
    Inspection inspection = regular();

    assertThat(inspection.isEditableBy(inspector(1L, "Ivy again"))).isTrue();
    assertThat(inspection.isEditableBy(ian)).isFalse();
  }

  @Test
  @DisplayName("AC 7.3: any inspector may complete a follow-up")
  void followUpIsEditableByAnyInspector() {
    Inspection followUp = followUp();

    assertThat(followUp.isEditableBy(ivy)).isTrue();
    assertThat(followUp.isEditableBy(ian)).isTrue();
  }

  @Test
  @DisplayName("AC 1.2: submitting keeps a regular inspection's date and inspector")
  void submitsRegular() {
    Inspection inspection = regular();

    inspection.submit(ian, TODAY.plusDays(1), NOW.plusSeconds(60));

    assertThat(inspection.getStatus()).isEqualTo(InspectionStatus.SUBMITTED);
    assertThat(inspection.getSubmittedAt()).isEqualTo(NOW.plusSeconds(60));
    assertThat(inspection.getInspectionDate()).isEqualTo(TODAY);
    assertThat(inspection.getInspector()).isSameAs(ivy);
  }

  @Test
  @DisplayName("AC 7.3, 8.1: a submitted follow-up is dated today and credited to its submitter")
  void submitsFollowUpAsCaller() {
    Inspection followUp = followUp();

    followUp.submit(ian, TODAY.plusDays(3), NOW.plusSeconds(60));

    assertThat(followUp.getStatus()).isEqualTo(InspectionStatus.SUBMITTED);
    assertThat(followUp.getSubmittedAt()).isEqualTo(NOW.plusSeconds(60));
    assertThat(followUp.getInspectionDate()).isEqualTo(TODAY.plusDays(3));
    assertThat(followUp.getInspector()).isSameAs(ian);
  }

  @Test
  @DisplayName("refuses to submit an inspection twice")
  void refusesSecondSubmit() {
    Inspection followUp = followUp();
    followUp.submit(ian, TODAY, NOW);

    assertThatThrownBy(() -> followUp.submit(ivy, TODAY.plusDays(1), NOW.plusSeconds(60)))
        .isInstanceOf(Conflict.class)
        .hasMessage("This inspection has already been submitted.");
    assertThat(followUp.getSubmittedAt()).isEqualTo(NOW);
    assertThat(followUp.getInspectionDate()).isEqualTo(TODAY);
    assertThat(followUp.getInspector()).isSameAs(ian);
  }

  private Inspection regular() {
    return Inspection.startRegular(store, ivy, TODAY, List.of(temperatures, pests), NOW);
  }

  private Inspection followUp() {
    return Inspection.scheduleFollowUp(regular().getResults().get(0), ivy, TODAY, NOW);
  }

  private static UserAccount inspector(long id, String name) {
    UserAccount inspector =
        new UserAccount(name, name + "@example.com", "hash", Role.INSPECTOR, null, NOW);
    ReflectionTestUtils.setField(inspector, "id", id);
    return inspector;
  }
}
