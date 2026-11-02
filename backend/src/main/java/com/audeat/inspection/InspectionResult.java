package com.audeat.inspection;

import com.audeat.checklist.ChecklistRequirement;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * The outcome of one checklist requirement in one inspection. A non-compliant result is a flagged
 * issue (AC 2.1), which can get a remediation ticket.
 */
@Entity
@Table(name = "inspection_results")
public class InspectionResult {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "inspection_id")
  private Inspection inspection;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "requirement_id")
  private ChecklistRequirement requirement;

  /** Null while a draft has not marked the requirement yet. */
  private Boolean compliant;

  private String comment;

  protected InspectionResult() {}

  InspectionResult(Inspection inspection, ChecklistRequirement requirement) {
    this.inspection = inspection;
    this.requirement = requirement;
  }

  public boolean isFlagged() {
    return Boolean.FALSE.equals(compliant);
  }

  public void update(Boolean compliant, String comment) {
    this.compliant = compliant;
    this.comment = comment;
  }

  public Long getId() {
    return id;
  }

  public Inspection getInspection() {
    return inspection;
  }

  public ChecklistRequirement getRequirement() {
    return requirement;
  }

  public Boolean getCompliant() {
    return compliant;
  }

  public String getComment() {
    return comment;
  }
}
