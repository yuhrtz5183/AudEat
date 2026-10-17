package com.audeat.user;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Arrays;
import java.util.Optional;

/** The two kinds of AudEat users. Serialized as the lower-case values the frontend uses. */
public enum Role {
  INSPECTOR("inspector"),
  OWNER("owner");

  private final String value;

  Role(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  public static Optional<Role> fromValue(String value) {
    return Arrays.stream(values()).filter(role -> role.value.equals(value)).findFirst();
  }
}
