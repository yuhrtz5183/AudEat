package com.audeat.photo;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** Persistence for {@link Photo}. Lists return ids only, so image bytes stay out of them. */
public interface PhotoRepository extends JpaRepository<Photo, Long> {

  @Query(
      """
      select p.result.id as parentId, p.id as id from Photo p
      where p.result.id in :ids order by p.id""")
  List<PhotoRef> findRefsByResultIdIn(Collection<Long> ids);

  @Query(
      """
      select p.submission.id as parentId, p.id as id from Photo p
      where p.submission.id in :ids order by p.id""")
  List<PhotoRef> findRefsBySubmissionIdIn(Collection<Long> ids);

  long countByResultId(long resultId);

  /** Photo ids per result id, oldest first; results without photos are absent. */
  default Map<Long, List<Long>> idsByResult(Collection<Long> resultIds) {
    return byParent(findRefsByResultIdIn(resultIds));
  }

  /** Photo ids per submission id, oldest first; submissions without photos are absent. */
  default Map<Long, List<Long>> idsBySubmission(Collection<Long> submissionIds) {
    return byParent(findRefsBySubmissionIdIn(submissionIds));
  }

  private static Map<Long, List<Long>> byParent(List<PhotoRef> refs) {
    return refs.stream()
        .collect(
            Collectors.groupingBy(
                PhotoRef::getParentId, Collectors.mapping(PhotoRef::getId, Collectors.toList())));
  }

  /** A photo id and the id of the result or submission it belongs to. */
  interface PhotoRef {
    Long getParentId();

    Long getId();
  }
}
