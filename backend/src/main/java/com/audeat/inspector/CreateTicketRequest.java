package com.audeat.inspector;

import java.time.LocalDate;

/** What the owner must fix, and by when (US 3). */
public record CreateTicketRequest(String requiredRemediation, LocalDate deadline) {}
