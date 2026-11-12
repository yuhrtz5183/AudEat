package com.audeat.inspection;

import com.audeat.checklist.ChecklistRequirement;
import com.audeat.common.ApiExceptions.Conflict;
import com.audeat.store.Store;
import com.audeat.user.UserAccount;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * A store inspection: an editable draft, then a read-only record. A follow-up inspection re-checks
 * one flagged issue of an earlier inspection (US 7).
 */
@Entity
@Table(name = "inspections")
public class Inspection {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "store_id")
  private Store store;

  /** Who started a regular inspection; for a follow-up, the scheduler until someone submits it. */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "inspector_id")
  private UserAccount inspector;

  @Column(name = "inspection_date", nullable = false)
  private LocalDate inspectionDate;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private InspectionStatus status;

  /** The flagged issue this follow-up re-checks; null for regular inspections. */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "follow_up_of_result_id")
  private InspectionResult followUpOf;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "submitted_at")
  private Instant submittedAt;

  @OneToMany(mappedBy = "inspection", cascade = CascadeType.ALL)
  @OrderBy("id")
  private List<InspectionResult> results = new ArrayList<>();

  protected Inspection() {}

  private Inspection(
      Store store,
      UserAccount inspector,
      LocalDate inspectionDate,
      InspectionResult followUpOf,
      Instant createdAt) {
    this.store = store;
    this.inspector = inspector;
    this.inspectionDate = inspectionDate;
    this.status = InspectionStatus.DRAFT;
    this.followUpOf = followUpOf;
    this.createdAt = createdAt;
  }

  /** A draft dated today with one unmarked result per requirement, in checklist order (AC 1.1). */
  public static Inspection startRegular(
      Store store,
      UserAccount inspector,
      LocalDate today,
      List<ChecklistRequirement> requirements,
      Instant now) {
    Inspection inspection = new Inspection(store, inspector, today, null, now);
    requirements.forEach(
        requirement -> inspection.results.add(new InspectionResult(inspection, requirement)));
    return inspection;
  }

  /** A draft on the chosen date that re-checks only the original issue's requirement (AC 7.1). */
  public static Inspection scheduleFollowUp(
      InspectionResult original, UserAccount inspector, LocalDate date, Instant now) {
    Inspection inspection =
        new Inspection(original.getInspection().getStore(), inspector, date, original, now);
    inspection.results.add(new InspectionResult(inspection, original.getRequirement()));
    return inspection;
  }

  public boolean isFollowUp() {
    return followUpOf != null;
  }

  /**
   * A regular draft belongs to its inspector; any inspector may complete a follow-up. Services
   * answer {@code false} with the same 404 as a missing id.
   */
  public boolean isEditableBy(UserAccount caller) {
    return isFollowUp() || Objects.equals(inspector.getId(), caller.getId());
  }

  /** Records the visit. A follow-up is re-dated to today and credited to the caller (AC 7.3). */
  public void submit(UserAccount caller, LocalDate today, Instant now) {
    if (status != InspectionStatus.DRAFT) {
      throw new Conflict("This inspection has already been submitted.");
    }
    status = InspectionStatus.SUBMITTED;
    submittedAt = now;
    if (isFollowUp()) {
      inspectionDate = today;
      inspector = caller;
    }
  }

  public Long getId() {
    return id;
  }

  public Store getStore() {
    return store;
  }

  public UserAccount getInspector() {
    return inspector;
  }

  public LocalDate getInspectionDate() {
    return inspectionDate;
  }

  public InspectionStatus getStatus() {
    return status;
  }

  public InspectionResult getFollowUpOf() {
    return followUpOf;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getSubmittedAt() {
    return submittedAt;
  }

  public List<InspectionResult> getResults() {
    return results;
  }
}
