package com.audeat.inspector;

import com.audeat.common.ApiExceptionHandler.ErrorResponse;
import com.audeat.remediation.TicketDetailResponse;
import com.audeat.remediation.TicketSummaryResponse;
import com.audeat.security.CurrentUser;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Inspector ticket endpoints (inspector role only, {@code SecurityConfig}): the review queue and
 * the decision on one ticket (US 6).
 */
@RestController
@RequestMapping("/api/tickets")
public class TicketController {

  private final ReviewService reviews;
  private final CurrentUser currentUser;

  public TicketController(ReviewService reviews, CurrentUser currentUser) {
    this.reviews = reviews;
    this.currentUser = currentUser;
  }

  @GetMapping
  public List<TicketSummaryResponse> queue(@RequestParam(required = false) String status) {
    return reviews.queue(status);
  }

  @GetMapping("/{ticketId}")
  public TicketDetailResponse ticket(@PathVariable long ticketId) {
    return reviews.ticket(ticketId);
  }

  @PostMapping("/{ticketId}/review")
  public TicketDetailResponse review(
      @PathVariable long ticketId,
      @RequestBody ReviewRequest request,
      @AuthenticationPrincipal Jwt jwt) {
    return reviews.review(ticketId, request, currentUser.require(jwt));
  }

  @ExceptionHandler(UnknownTicketStatus.class)
  @ResponseStatus(HttpStatus.BAD_REQUEST)
  ErrorResponse unknownStatus(UnknownTicketStatus exception) {
    return new ErrorResponse(exception.getMessage());
  }

  /** A ticket id that is not a number names no ticket: the same 404 as a missing id. */
  @ExceptionHandler(MethodArgumentTypeMismatchException.class)
  @ResponseStatus(HttpStatus.NOT_FOUND)
  ErrorResponse ticketIdNotANumber() {
    return new ErrorResponse("Ticket not found.");
  }
}
