package com.audeat.remediation;

import com.audeat.common.ApiExceptions.Conflict;
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
import jakarta.persistence.Table;
import java.time.Instant;

/** The owner's evidence for a ticket (US 5) and, once reviewed, the inspector's decision (US 6). */
@Entity
@Table(name = "remediation_submissions")
public class RemediationSubmission {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "ticket_id")
  private RemediationTicket ticket;

  @Column(nullable = false)
  private String comment;

  @Column(name = "submitted_at", nullable = false)
  private Instant submittedAt;

  /** Null until reviewed. */
  @Enumerated(EnumType.STRING)
  private ReviewDecision decision;

  @Column(name = "review_comment")
  private String reviewComment;

  @Column(name = "reviewed_at")
  private Instant reviewedAt;

  protected RemediationSubmission() {}

  public RemediationSubmission(RemediationTicket ticket, String comment, Instant submittedAt) {
    this.ticket = ticket;
    this.comment = comment;
    this.submittedAt = submittedAt;
  }

  public void review(ReviewDecision decision, String reviewComment, Instant now) {
    if (this.decision != null) {
      throw new Conflict("This submission has already been reviewed.");
    }
    this.decision = decision;
    this.reviewComment = reviewComment;
    this.reviewedAt = now;
  }

  public Long getId() {
    return id;
  }

  public RemediationTicket getTicket() {
    return ticket;
  }

  public String getComment() {
    return comment;
  }

  public Instant getSubmittedAt() {
    return submittedAt;
  }

  public ReviewDecision getDecision() {
    return decision;
  }

  public String getReviewComment() {
    return reviewComment;
  }

  public Instant getReviewedAt() {
    return reviewedAt;
  }
}
