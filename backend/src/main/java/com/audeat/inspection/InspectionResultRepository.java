package com.audeat.inspection;

import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for {@link InspectionResult}. */
public interface InspectionResultRepository extends JpaRepository<InspectionResult, Long> {}
