package com.audeat.remediation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.audeat.common.ApiExceptions.Conflict;
import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.EnumSource.Mode;
import org.springframework.test.util.ReflectionTestUtils;

/** The ticket state machine (US 5, 6, 7) and its derived overdue rules (US 10, 11). */
class RemediationTicketTest {

  private static final LocalDate TODAY = LocalDate.of(2026, 11, 2);
  private static final Instant NOW = Instant.parse("2026-11-02T15:00:00Z");
  private static final String NOT_WAITING_FOR_EVIDENCE = "This ticket is not waiting for evidence.";
  private static final String NO_EVIDENCE_TO_REVIEW =
      "This ticket has no evidence waiting for review.";
  private static final String NOT_WAITING_FOR_FOLLOW_UP =
      "This ticket is not waiting for a follow-up inspection.";

  @Test
  @DisplayName("AC 3.1: a new ticket is open")
  void startsOpen() {
    RemediationTicket ticket = new RemediationTicket(null, "Fix it.", TODAY, NOW);

    assertThat(ticket.getStatus()).isEqualTo(TicketStatus.OPEN);
    assertThat(ticket.isOpen()).isTrue();
    assertThat(ticket.getApprovedAt()).isNull();
  }

  @ParameterizedTest
  @EnumSource(names = {"OPEN", "REJECTED"})
  @DisplayName("AC 5.1: evidence on an open or rejected ticket puts it up for review")
  void submitEvidence(TicketStatus from) {
    RemediationTicket ticket = ticket(from, TODAY);

    ticket.submitEvidence();

    assertThat(ticket.getStatus()).isEqualTo(TicketStatus.AWAITING_REVIEW);
  }

  @ParameterizedTest
  @EnumSource(names = {"OPEN", "REJECTED"}, mode = Mode.EXCLUDE)
  @DisplayName("refuses evidence unless the ticket is open or rejected")
  void submitEvidenceRefused(TicketStatus from) {
    RemediationTicket ticket = ticket(from, TODAY);

    assertThatThrownBy(ticket::submitEvidence)
        .isInstanceOf(Conflict.class)
        .hasMessage(NOT_WAITING_FOR_EVIDENCE);
    assertThat(ticket.getStatus()).isEqualTo(from);
  }

  @Test
  @DisplayName("AC 6.1: approving the evidence approves the ticket and records the date")
  void approve() {
    RemediationTicket ticket = ticket(TicketStatus.AWAITING_REVIEW, TODAY);

    ticket.approve(NOW);

    assertThat(ticket.getStatus()).isEqualTo(TicketStatus.APPROVED);
    assertThat(ticket.getApprovedAt()).isEqualTo(NOW);
    assertThat(ticket.isOpen()).isFalse();
  }

  @Test
  @DisplayName("AC 6.2: rejecting the evidence sends the ticket back to the owner")
  void reject() {
    RemediationTicket ticket = ticket(TicketStatus.AWAITING_REVIEW, TODAY);

    ticket.reject();

    assertThat(ticket.getStatus()).isEqualTo(TicketStatus.REJECTED);
    assertThat(ticket.getApprovedAt()).isNull();
    assertThat(ticket.isOpen()).isTrue();
  }

  @Test
  @DisplayName("AC 6.3: scheduling a follow-up leaves the ticket unresolved")
  void scheduleFollowUp() {
    RemediationTicket ticket = ticket(TicketStatus.AWAITING_REVIEW, TODAY);

    ticket.scheduleFollowUp();

    assertThat(ticket.getStatus()).isEqualTo(TicketStatus.FOLLOW_UP_SCHEDULED);
    assertThat(ticket.getApprovedAt()).isNull();
    assertThat(ticket.isOpen()).isTrue();
  }

  @ParameterizedTest
  @EnumSource(names = "AWAITING_REVIEW", mode = Mode.EXCLUDE)
  @DisplayName("refuses to approve unless evidence is awaiting review")
  void approveRefused(TicketStatus from) {
    RemediationTicket ticket = ticket(from, TODAY);
    Instant approvedAt = ticket.getApprovedAt();

    assertThatThrownBy(() -> ticket.approve(NOW))
        .isInstanceOf(Conflict.class)
        .hasMessage(NO_EVIDENCE_TO_REVIEW);
    assertThat(ticket.getStatus()).isEqualTo(from);
    assertThat(ticket.getApprovedAt()).isEqualTo(approvedAt);
  }

  @ParameterizedTest
  @EnumSource(names = "AWAITING_REVIEW", mode = Mode.EXCLUDE)
  @DisplayName("refuses to reject unless evidence is awaiting review")
  void rejectRefused(TicketStatus from) {
    RemediationTicket ticket = ticket(from, TODAY);

    assertThatThrownBy(ticket::reject)
        .isInstanceOf(Conflict.class)
        .hasMessage(NO_EVIDENCE_TO_REVIEW);
    assertThat(ticket.getStatus()).isEqualTo(from);
  }

  @ParameterizedTest
  @EnumSource(names = "AWAITING_REVIEW", mode = Mode.EXCLUDE)
  @DisplayName("refuses to schedule a follow-up unless evidence is awaiting review")
  void scheduleFollowUpRefused(TicketStatus from) {
    RemediationTicket ticket = ticket(from, TODAY);

    assertThatThrownBy(ticket::scheduleFollowUp)
        .isInstanceOf(Conflict.class)
        .hasMessage(NO_EVIDENCE_TO_REVIEW);
    assertThat(ticket.getStatus()).isEqualTo(from);
  }

  @Test
  @DisplayName("AC 7.3: a compliant follow-up approves the ticket")
  void compliantFollowUpApproves() {
    RemediationTicket ticket = ticket(TicketStatus.FOLLOW_UP_SCHEDULED, TODAY);

    ticket.recordFollowUpResult(true, NOW);

    assertThat(ticket.getStatus()).isEqualTo(TicketStatus.APPROVED);
    assertThat(ticket.getApprovedAt()).isEqualTo(NOW);
  }

  @Test
  @DisplayName("AC 7.3: a non-compliant follow-up rejects the ticket")
  void nonCompliantFollowUpRejects() {
    RemediationTicket ticket = ticket(TicketStatus.FOLLOW_UP_SCHEDULED, TODAY);

    ticket.recordFollowUpResult(false, NOW);

    assertThat(ticket.getStatus()).isEqualTo(TicketStatus.REJECTED);
    assertThat(ticket.getApprovedAt()).isNull();
  }

  @ParameterizedTest
  @EnumSource(names = "FOLLOW_UP_SCHEDULED", mode = Mode.EXCLUDE)
  @DisplayName("refuses a follow-up result unless a follow-up is scheduled")
  void recordFollowUpResultRefused(TicketStatus from) {
    RemediationTicket ticket = ticket(from, TODAY);
    Instant approvedAt = ticket.getApprovedAt();

    assertThatThrownBy(() -> ticket.recordFollowUpResult(true, NOW))
        .isInstanceOf(Conflict.class)
        .hasMessage(NOT_WAITING_FOR_FOLLOW_UP);
    assertThatThrownBy(() -> ticket.recordFollowUpResult(false, NOW))
        .isInstanceOf(Conflict.class)
        .hasMessage(NOT_WAITING_FOR_FOLLOW_UP);
    assertThat(ticket.getStatus()).isEqualTo(from);
    assertThat(ticket.getApprovedAt()).isEqualTo(approvedAt);
  }

  @Test
  @DisplayName("AC 11.3: a ticket due today is not overdue")
  void dueTodayIsNotOverdue() {
    RemediationTicket ticket = ticket(TicketStatus.OPEN, TODAY);

    assertThat(ticket.isOverdue(TODAY)).isFalse();
    assertThat(ticket.daysRemaining(TODAY)).isZero();
    assertThat(ticket.daysOverdue(TODAY)).isZero();
  }

  @Test
  @DisplayName("AC 10.2, 11.1: an open ticket due yesterday is one day overdue")
  void dueYesterdayIsOverdue() {
    RemediationTicket ticket = ticket(TicketStatus.OPEN, TODAY.minusDays(1));

    assertThat(ticket.isOverdue(TODAY)).isTrue();
    assertThat(ticket.daysRemaining(TODAY)).isEqualTo(-1);
    assertThat(ticket.daysOverdue(TODAY)).isEqualTo(1);
  }

  @ParameterizedTest
  @EnumSource(names = "APPROVED", mode = Mode.EXCLUDE)
  @DisplayName("AC 10.2: every unapproved status counts as overdue past the deadline")
  void unapprovedPastDeadlineIsOverdue(TicketStatus status) {
    RemediationTicket ticket = ticket(status, TODAY.minusDays(2));

    assertThat(ticket.isOpen()).isTrue();
    assertThat(ticket.isOverdue(TODAY)).isTrue();
    assertThat(ticket.daysOverdue(TODAY)).isEqualTo(2);
  }

  @Test
  @DisplayName("AC 11.2: an approved ticket past its deadline is not overdue")
  void approvedIsNeverOverdue() {
    RemediationTicket ticket = ticket(TicketStatus.APPROVED, TODAY.minusDays(5));

    assertThat(ticket.isOpen()).isFalse();
    assertThat(ticket.isOverdue(TODAY)).isFalse();
    assertThat(ticket.daysOverdue(TODAY)).isZero();
    assertThat(ticket.daysRemaining(TODAY)).isEqualTo(-5);
  }

  @Test
  @DisplayName("AC 10.1: counts the days left before a future deadline")
  void daysRemainingBeforeDeadline() {
    RemediationTicket ticket = ticket(TicketStatus.OPEN, TODAY.plusDays(3));

    assertThat(ticket.isOverdue(TODAY)).isFalse();
    assertThat(ticket.daysRemaining(TODAY)).isEqualTo(3);
    assertThat(ticket.daysOverdue(TODAY)).isZero();
  }

  private static RemediationTicket ticket(TicketStatus status, LocalDate deadline) {
    RemediationTicket ticket = new RemediationTicket(null, "Fix it.", deadline, NOW);
    ReflectionTestUtils.setField(ticket, "status", status);
    if (status == TicketStatus.APPROVED) {
      ReflectionTestUtils.setField(ticket, "approvedAt", NOW.minusSeconds(60));
    }
    return ticket;
  }
}
