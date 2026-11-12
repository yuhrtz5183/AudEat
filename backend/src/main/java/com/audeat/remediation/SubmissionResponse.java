package com.audeat.remediation;

import java.time.Instant;
import java.util.List;

/** The owner's evidence (US 5) and the inspector's decision on it, null until reviewed (US 6). */
public record SubmissionResponse(
    Long id,
    String comment,
    Instant submittedAt,
    List<Long> evidencePhotoIds,
    ReviewDecision decision,
    String reviewComment,
    Instant reviewedAt) {}
