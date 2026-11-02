package com.audeat.remediation;

import com.audeat.common.ApiExceptions.Conflict;
import com.audeat.inspection.InspectionResult;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * What a store owner must fix for one flagged issue, and by when (US 3). The transition methods are
 * the ticket state machine; every transition bumps {@code version}, so a concurrent one fails.
 */
@Entity
@Table(name = "remediation_tickets")
public class RemediationTicket {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @OneToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "result_id")
  private InspectionResult result;

  @Column(name = "required_remediation", nullable = false)
  private String requiredRemediation;

  @Column(nullable = false)
  private LocalDate deadline;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private TicketStatus status;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "approved_at")
  private Instant approvedAt;

  @Version private long version;

  protected RemediationTicket() {}

  public RemediationTicket(
      InspectionResult result, String requiredRemediation, LocalDate deadline, Instant createdAt) {
    this.result = result;
    this.requiredRemediation = requiredRemediation;
    this.deadline = deadline;
    this.status = TicketStatus.OPEN;
    this.createdAt = createdAt;
  }

  /** The owner sent evidence of the fix (AC 5.1). */
  public void submitEvidence() {
    if (status != TicketStatus.OPEN && status != TicketStatus.REJECTED) {
      throw new Conflict("This ticket is not waiting for evidence.");
    }
    status = TicketStatus.AWAITING_REVIEW;
  }

  /** The inspector accepted the evidence (AC 6.1). */
  public void approve(Instant now) {
    requireAwaitingReview();
    status = TicketStatus.APPROVED;
    approvedAt = now;
  }

  /** The inspector sent the ticket back to the owner (AC 6.2). */
  public void reject() {
    requireAwaitingReview();
    status = TicketStatus.REJECTED;
  }

  /** The inspector will verify the fix in person (AC 6.3, 7.1). */
  public void scheduleFollowUp() {
    requireAwaitingReview();
    status = TicketStatus.FOLLOW_UP_SCHEDULED;
  }

  /** The follow-up inspection was submitted; its result decides the ticket (AC 7.3). */
  public void recordFollowUpResult(boolean compliant, Instant now) {
    if (status != TicketStatus.FOLLOW_UP_SCHEDULED) {
      throw new Conflict("This ticket is not waiting for a follow-up inspection.");
    }
    if (compliant) {
      status = TicketStatus.APPROVED;
      approvedAt = now;
    } else {
      status = TicketStatus.REJECTED;
    }
  }

  public boolean isOpen() {
    return status != TicketStatus.APPROVED;
  }

  /** Strictly past the deadline, so a ticket due today is not overdue (AC 11.3). */
  public boolean isOverdue(LocalDate today) {
    return isOpen() && deadline.isBefore(today);
  }

  /** 0 when due today, negative once past the deadline. */
  public long daysRemaining(LocalDate today) {
    return ChronoUnit.DAYS.between(today, deadline);
  }

  public long daysOverdue(LocalDate today) {
    return isOverdue(today) ? -daysRemaining(today) : 0;
  }

  private void requireAwaitingReview() {
    if (status != TicketStatus.AWAITING_REVIEW) {
      throw new Conflict("This ticket has no evidence waiting for review.");
    }
  }

  public Long getId() {
    return id;
  }

  public InspectionResult getResult() {
    return result;
  }

  public String getRequiredRemediation() {
    return requiredRemediation;
  }

  public LocalDate getDeadline() {
    return deadline;
  }

  public TicketStatus getStatus() {
    return status;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getApprovedAt() {
    return approvedAt;
  }
}
