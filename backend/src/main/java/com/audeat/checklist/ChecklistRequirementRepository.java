package com.audeat.checklist;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for {@link ChecklistRequirement}. */
public interface ChecklistRequirementRepository extends JpaRepository<ChecklistRequirement, Long> {

  List<ChecklistRequirement> findAllByOrderBySortOrderAsc();
}
