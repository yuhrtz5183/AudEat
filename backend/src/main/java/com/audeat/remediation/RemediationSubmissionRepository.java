package com.audeat.remediation;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for {@link RemediationSubmission}. */
public interface RemediationSubmissionRepository
    extends JpaRepository<RemediationSubmission, Long> {

  List<RemediationSubmission> findByTicketIdOrderBySubmittedAtAscIdAsc(long ticketId);

  /** The one submission awaiting review, if any. */
  Optional<RemediationSubmission> findFirstByTicketIdAndDecisionIsNull(long ticketId);
}
