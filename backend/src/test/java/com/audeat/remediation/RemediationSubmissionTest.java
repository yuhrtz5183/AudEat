package com.audeat.remediation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.audeat.common.ApiExceptions.Conflict;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** The inspector's single decision on a piece of evidence (US 6). */
class RemediationSubmissionTest {

  private static final Instant NOW = Instant.parse("2026-11-02T15:00:00Z");

  @Test
  @DisplayName("is awaiting review until an inspector records a decision")
  void recordsReview() {
    RemediationSubmission submission = new RemediationSubmission(null, "Fixed.", NOW);
    assertThat(submission.getDecision()).isNull();

    submission.review(ReviewDecision.REJECTED, "The photo is blurry.", NOW.plusSeconds(60));

    assertThat(submission.getDecision()).isEqualTo(ReviewDecision.REJECTED);
    assertThat(submission.getReviewComment()).isEqualTo("The photo is blurry.");
    assertThat(submission.getReviewedAt()).isEqualTo(NOW.plusSeconds(60));
  }

  @Test
  @DisplayName("refuses a second review")
  void refusesSecondReview() {
    RemediationSubmission submission = new RemediationSubmission(null, "Fixed.", NOW);
    submission.review(ReviewDecision.APPROVED, null, NOW);

    assertThatThrownBy(() -> submission.review(ReviewDecision.REJECTED, "No.", NOW))
        .isInstanceOf(Conflict.class)
        .hasMessage("This submission has already been reviewed.");
    assertThat(submission.getDecision()).isEqualTo(ReviewDecision.APPROVED);
  }
}
