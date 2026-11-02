package com.audeat.remediation;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** Persistence for {@link RemediationTicket}. Owner queries join through to the store. */
public interface RemediationTicketRepository extends JpaRepository<RemediationTicket, Long> {

  boolean existsByResultId(long resultId);

  /** Tickets on an inspection's issues (AC 8.2). */
  List<RemediationTicket> findByResultIdIn(Collection<Long> resultIds);

  /** Owner list (AC 4.1, 10.1, 10.2): open tickets by nearest deadline, approved last. */
  @Query(
      """
      select t from RemediationTicket t join fetch t.result r join fetch r.requirement
        join fetch r.inspection i join fetch i.store
      where i.store.id = :storeId
      order by case when t.status = com.audeat.remediation.TicketStatus.APPROVED then 1 else 0 end,
               t.deadline, t.id""")
  List<RemediationTicket> findForStore(long storeId);

  /** Owner isolation: another store's ticket is as missing as an unknown id. */
  @Query(
      """
      select t from RemediationTicket t join t.result r join r.inspection i
      where t.id = :id and i.store.id = :storeId""")
  Optional<RemediationTicket> findByIdForStore(long id, long storeId);

  /** AC 15.1 open count and the AC 6.2 rejected count. */
  @Query(
      """
      select count(t) from RemediationTicket t join t.result r join r.inspection i
      where i.store.id = :storeId and t.status in :statuses""")
  long countForStore(long storeId, Collection<TicketStatus> statuses);

  /** Inspector queues across all stores (US 6, AC 7.3). */
  @Query(
      """
      select t from RemediationTicket t join fetch t.result r join fetch r.requirement
        join fetch r.inspection i join fetch i.store
      where t.status = :status order by t.deadline, t.id""")
  List<RemediationTicket> findByStatusForInspector(TicketStatus status);
}
