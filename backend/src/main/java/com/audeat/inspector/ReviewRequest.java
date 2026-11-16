package com.audeat.inspector;

import java.time.LocalDate;

/**
 * An inspector's decision on evidence waiting for review (US 6). {@code followUpDate} is required
 * only when {@code decision} is {@code follow_up}.
 */
public record ReviewRequest(String decision, String comment, LocalDate followUpDate) {}
