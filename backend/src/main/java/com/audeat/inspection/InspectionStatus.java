package com.audeat.inspection;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Arrays;
import java.util.Optional;

/** Where an inspection is in its one-way life: an editable draft, then a read-only record. */
public enum InspectionStatus {
  DRAFT("draft"),
  SUBMITTED("submitted");

  private final String value;

  InspectionStatus(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  public static Optional<InspectionStatus> fromValue(String value) {
    return Arrays.stream(values()).filter(status -> status.value.equals(value)).findFirst();
  }
}
