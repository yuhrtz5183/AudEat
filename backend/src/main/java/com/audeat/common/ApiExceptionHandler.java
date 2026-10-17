package com.audeat.common;

import com.audeat.auth.AuthExceptions.EmailAlreadyRegistered;
import com.audeat.auth.AuthExceptions.InvalidCredentials;
import com.audeat.auth.AuthExceptions.InvalidFields;
import com.audeat.auth.AuthExceptions.UnknownUser;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Translates failures into the JSON shapes the frontend reads: {@code {"message": ...}} for
 * request-level errors and {@code {"errors": {field: message}}} for field errors.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

  /** Constraints reported first when a field breaks several, e.g. blank and badly formatted. */
  private static final Set<String> PRESENCE_CODES = Set.of("NotNull", "NotBlank");

  /** {@code {"message": ...}} */
  public record ErrorResponse(String message) {}

  /** {@code {"errors": {field: message}}} */
  public record FieldErrorsResponse(Map<String, String> errors) {}

  @ExceptionHandler(MethodArgumentNotValidException.class)
  @ResponseStatus(HttpStatus.BAD_REQUEST)
  FieldErrorsResponse invalidBody(MethodArgumentNotValidException e) {
    Map<String, String> errors = new LinkedHashMap<>();
    e.getBindingResult().getFieldErrors().stream()
        .sorted(Comparator.comparing(error -> !PRESENCE_CODES.contains(error.getCode())))
        .forEach(error -> errors.putIfAbsent(error.getField(), message(error)));
    return new FieldErrorsResponse(errors);
  }

  @ExceptionHandler(InvalidFields.class)
  @ResponseStatus(HttpStatus.BAD_REQUEST)
  FieldErrorsResponse invalidFields(InvalidFields e) {
    return new FieldErrorsResponse(e.errors());
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  @ResponseStatus(HttpStatus.BAD_REQUEST)
  ErrorResponse unreadableBody() {
    return new ErrorResponse("Request body is missing or malformed.");
  }

  @ExceptionHandler(EmailAlreadyRegistered.class)
  @ResponseStatus(HttpStatus.CONFLICT)
  ErrorResponse emailTaken(EmailAlreadyRegistered e) {
    return new ErrorResponse(e.getMessage());
  }

  @ExceptionHandler({InvalidCredentials.class, UnknownUser.class})
  @ResponseStatus(HttpStatus.UNAUTHORIZED)
  ErrorResponse unauthorized(RuntimeException e) {
    return new ErrorResponse(e.getMessage());
  }

  private static String message(FieldError error) {
    return error.getDefaultMessage() == null ? "Invalid value." : error.getDefaultMessage();
  }
}
