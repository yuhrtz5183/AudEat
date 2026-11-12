package com.audeat.common;

/** Failures any feature can throw; {@code ApiExceptionHandler} turns them into HTTP responses. */
public final class ApiExceptions {

  private ApiExceptions() {}

  /** The record is missing or outside the caller's scope; deliberately indistinguishable. 404. */
  public static class NotFound extends RuntimeException {
    public NotFound(String message) {
      super(message);
    }
  }

  /** The record exists but its current state does not allow the request. Maps to 409. */
  public static class Conflict extends RuntimeException {
    public Conflict(String message) {
      super(message);
    }
  }
}
