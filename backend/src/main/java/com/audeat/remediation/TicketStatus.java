package com.audeat.remediation;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Arrays;
import java.util.Optional;

/** The stored state of a remediation ticket. Overdue is derived, never stored. */
public enum TicketStatus {
  OPEN("open"),
  AWAITING_REVIEW("awaiting_review"),
  REJECTED("rejected"),
  FOLLOW_UP_SCHEDULED("follow_up_scheduled"),
  APPROVED("approved");

  private final String value;

  TicketStatus(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  public static Optional<TicketStatus> fromValue(String value) {
    return Arrays.stream(values()).filter(status -> status.value.equals(value)).findFirst();
  }
}
