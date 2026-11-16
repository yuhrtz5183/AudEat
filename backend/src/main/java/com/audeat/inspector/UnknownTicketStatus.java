package com.audeat.inspector;

/** {@code GET /api/tickets?status=} named something that is not a ticket status. Maps to 400. */
public class UnknownTicketStatus extends RuntimeException {

  public UnknownTicketStatus() {
    super("Unknown ticket status.");
  }
}
