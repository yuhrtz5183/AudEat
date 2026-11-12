package com.audeat.owner;

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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Owner endpoints (owner role only, {@code SecurityConfig}). None takes a store id: the store is
 * always the signed-in owner's, so an owner cannot name another store (AC 9.2, 15.2).
 */
@RestController
@RequestMapping("/api/my-store")
public class MyStoreController {

  private final OwnerService owner;
  private final CurrentUser currentUser;

  public MyStoreController(OwnerService owner, CurrentUser currentUser) {
    this.owner = owner;
    this.currentUser = currentUser;
  }

  @GetMapping
  public MyStoreResponse myStore(@AuthenticationPrincipal Jwt jwt) {
    return owner.myStore(currentUser.ownerStoreId(jwt));
  }

  @GetMapping("/tickets")
  public List<TicketSummaryResponse> myTickets(@AuthenticationPrincipal Jwt jwt) {
    return owner.myTickets(currentUser.ownerStoreId(jwt));
  }

  @GetMapping("/tickets/{ticketId}")
  public TicketDetailResponse myTicket(
      @PathVariable long ticketId, @AuthenticationPrincipal Jwt jwt) {
    return owner.myTicket(currentUser.ownerStoreId(jwt), ticketId);
  }

  /** A ticket id that is not a number names no ticket: the same 404 as a missing id. */
  @ExceptionHandler(MethodArgumentTypeMismatchException.class)
  @ResponseStatus(HttpStatus.NOT_FOUND)
  ErrorResponse ticketIdNotANumber() {
    return new ErrorResponse("Ticket not found.");
  }
}
