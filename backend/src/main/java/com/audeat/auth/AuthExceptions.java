package com.audeat.auth;

import java.util.Map;

/** Failures the auth endpoints translate into HTTP responses in {@code ApiExceptionHandler}. */
public final class AuthExceptions {

  private AuthExceptions() {}

  /** The email already belongs to an account (AC 12.2). Maps to 409. */
  public static class EmailAlreadyRegistered extends RuntimeException {
    public EmailAlreadyRegistered() {
      super("This email is already registered.");
    }
  }

  /** Wrong password or unregistered email; deliberately indistinguishable (AC 13.2). Maps to 401. */
  public static class InvalidCredentials extends RuntimeException {
    public InvalidCredentials() {
      super("Invalid email or password.");
    }
  }

  /** The token is valid but its user no longer exists. Maps to 401. */
  public static class UnknownUser extends RuntimeException {
    public UnknownUser() {
      super("Authentication required.");
    }
  }

  /** Field errors found after bean validation, keyed like the request fields. Maps to 400. */
  public static class InvalidFields extends RuntimeException {
    private final Map<String, String> errors;

    public InvalidFields(Map<String, String> errors) {
      super("Invalid fields: " + errors.keySet());
      this.errors = Map.copyOf(errors);
    }

    public Map<String, String> errors() {
      return errors;
    }
  }
}
