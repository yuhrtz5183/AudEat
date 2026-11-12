package com.audeat.inspection;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** Persistence for {@link Inspection}. */
public interface InspectionRepository extends JpaRepository<Inspection, Long> {

  @EntityGraph(attributePaths = {"store", "inspector", "results", "results.requirement"})
  Optional<Inspection> findWithResultsById(long id);

  /** History (AC 8.1, 9.1, 7.3): submitted only, newest first, one query. */
  @Query(
      """
      select new com.audeat.inspection.InspectionSummaryResponse(
        i.id, i.inspectionDate, i.inspector.name,
        (select count(r) from InspectionResult r where r.inspection = i and r.compliant = false),
        case when i.followUpOf is null then false else true end)
      from Inspection i
      where i.store.id = :storeId and i.status = com.audeat.inspection.InspectionStatus.SUBMITTED
      order by i.inspectionDate desc, i.id desc""")
  List<InspectionSummaryResponse> findHistory(long storeId);

  /** The caller's unfinished regular inspection, resumed instead of duplicated (AC 1.1). */
  Optional<Inspection> findFirstByStoreIdAndInspectorIdAndStatusAndFollowUpOfIsNull(
      long storeId, long inspectorId, InspectionStatus status);

  /** Follow-ups of the given issues, for a whole ticket list at once. */
  List<Inspection> findByFollowUpOfIdInOrderByIdAsc(Collection<Long> resultIds);
}
