package com.audeat.remediation;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Arrays;
import java.util.Optional;

/** An inspector's decision on the owner's evidence (US 6). */
public enum ReviewDecision {
  APPROVED("approved"),
  REJECTED("rejected"),
  FOLLOW_UP("follow_up");

  private final String value;

  ReviewDecision(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  public static Optional<ReviewDecision> fromValue(String value) {
    return Arrays.stream(values()).filter(decision -> decision.value.equals(value)).findFirst();
  }
}
