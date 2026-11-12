package com.audeat.checklist;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One line of the inspection checklist (AC 1.1). Reference data seeded by Flyway. */
@Entity
@Table(name = "checklist_requirements")
public class ChecklistRequirement {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "sort_order", nullable = false)
  private int sortOrder;

  @Column(nullable = false)
  private String description;

  protected ChecklistRequirement() {}

  public ChecklistRequirement(int sortOrder, String description) {
    this.sortOrder = sortOrder;
    this.description = description;
  }

  public Long getId() {
    return id;
  }

  public int getSortOrder() {
    return sortOrder;
  }

  public String getDescription() {
    return description;
  }
}
