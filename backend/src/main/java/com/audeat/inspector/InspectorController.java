package com.audeat.inspector;

import com.audeat.common.ApiExceptionHandler.ErrorResponse;
import com.audeat.inspection.InspectionDetailResponse;
import com.audeat.inspection.InspectionSummaryResponse;
import com.audeat.inspection.ResultResponse;
import com.audeat.remediation.TicketDetailResponse;
import com.audeat.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** Inspector inspections (US 1) and remediation-ticket creation (US 3). */
@RestController
public class InspectorController {

  private final InspectorService inspector;
  private final CurrentUser currentUser;

  public InspectorController(InspectorService inspector, CurrentUser currentUser) {
    this.inspector = inspector;
    this.currentUser = currentUser;
  }

  @GetMapping("/api/stores/{storeId}/inspections")
  public List<InspectionSummaryResponse> history(@PathVariable long storeId) {
    return inspector.history(storeId);
  }

  /** AC 1.1: 201 for a new draft, 200 when the caller's existing draft is resumed. */
  @PostMapping("/api/stores/{storeId}/inspections")
  public ResponseEntity<InspectionDetailResponse> start(
      @PathVariable long storeId, @AuthenticationPrincipal Jwt jwt) {
    StartedInspection started = inspector.start(storeId, currentUser.require(jwt));
    HttpStatus status = started.created() ? HttpStatus.CREATED : HttpStatus.OK;
    return ResponseEntity.status(status).body(started.inspection());
  }

  @GetMapping("/api/inspections/{inspectionId}")
  public InspectionDetailResponse inspection(
      @PathVariable long inspectionId, @AuthenticationPrincipal Jwt jwt) {
    return inspector.inspection(inspectionId, currentUser.require(jwt));
  }

  @PutMapping("/api/results/{resultId}")
  public ResultResponse updateResult(
      @PathVariable long resultId,
      @RequestBody UpdateResultRequest request,
      @AuthenticationPrincipal Jwt jwt) {
    return inspector.updateResult(resultId, request, currentUser.require(jwt));
  }

  @PostMapping("/api/inspections/{inspectionId}/submit")
  public InspectionDetailResponse submit(
      @PathVariable long inspectionId, @AuthenticationPrincipal Jwt jwt) {
    return inspector.submit(inspectionId, currentUser.require(jwt));
  }

  @PostMapping("/api/results/{resultId}/ticket")
  @ResponseStatus(HttpStatus.CREATED)
  public TicketDetailResponse createTicket(
      @PathVariable long resultId, @RequestBody CreateTicketRequest request) {
    return inspector.createTicket(resultId, request);
  }

  /** An id that is not a number names no record: the same 404 as a missing id. */
  @ExceptionHandler(MethodArgumentTypeMismatchException.class)
  @ResponseStatus(HttpStatus.NOT_FOUND)
  ErrorResponse idNotANumber(HttpServletRequest request) {
    String uri = request.getRequestURI();
    if (uri.contains("/results/")) {
      return new ErrorResponse("Result not found.");
    }
    if (uri.contains("/stores/")) {
      return new ErrorResponse("Store not found.");
    }
    return new ErrorResponse("Inspection not found.");
  }
}
