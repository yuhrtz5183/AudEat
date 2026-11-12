package com.audeat.photo;

import com.audeat.inspection.InspectionResult;
import com.audeat.remediation.RemediationSubmission;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A picture of a flagged issue (AC 2.2) or of the owner's fix (AC 5.1); exactly one parent is set.
 */
@Entity
@Table(name = "photos")
public class Photo {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "result_id")
  private InspectionResult result;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "submission_id")
  private RemediationSubmission submission;

  /** Detected from the file's first bytes, never taken from the client. */
  @Column(name = "content_type", nullable = false)
  private String contentType;

  // Plain byte[] (no @Lob) maps to bytea on PostgreSQL; @Lob would map to oid and fail validation.
  @Column(nullable = false)
  private byte[] data;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected Photo() {}

  private Photo(
      InspectionResult result,
      RemediationSubmission submission,
      String contentType,
      byte[] data,
      Instant createdAt) {
    this.result = result;
    this.submission = submission;
    this.contentType = contentType;
    this.data = data;
    this.createdAt = createdAt;
  }

  public static Photo ofResult(
      InspectionResult result, String contentType, byte[] data, Instant createdAt) {
    return new Photo(result, null, contentType, data, createdAt);
  }

  public static Photo ofSubmission(
      RemediationSubmission submission, String contentType, byte[] data, Instant createdAt) {
    return new Photo(null, submission, contentType, data, createdAt);
  }

  public Long getId() {
    return id;
  }

  public InspectionResult getResult() {
    return result;
  }

  public RemediationSubmission getSubmission() {
    return submission;
  }

  public String getContentType() {
    return contentType;
  }

  public byte[] getData() {
    return data;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
