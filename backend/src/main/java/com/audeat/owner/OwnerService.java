package com.audeat.owner;

import com.audeat.common.ApiExceptions.NotFound;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.TicketDetailResponse;
import com.audeat.remediation.TicketStatus;
import com.audeat.remediation.TicketSummaryResponse;
import com.audeat.remediation.TicketViews;
import com.audeat.store.Store;
import com.audeat.store.StoreRepository;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads for the owner endpoints, always for the caller's own store (DESIGN Decision 8). Read-only
 * transactions, because {@link TicketViews} walks lazy associations.
 */
@Service
@Transactional(readOnly = true)
public class OwnerService {

  /** Every status except APPROVED: the ticket still needs the owner or an inspector. */
  private static final Set<TicketStatus> OPEN =
      EnumSet.complementOf(EnumSet.of(TicketStatus.APPROVED));

  private final StoreRepository stores;
  private final RemediationTicketRepository tickets;
  private final TicketViews ticketViews;

  public OwnerService(
      StoreRepository stores, RemediationTicketRepository tickets, TicketViews ticketViews) {
    this.stores = stores;
    this.tickets = tickets;
    this.ticketViews = ticketViews;
  }

  /** AC 15.1, plus the AC 6.2 rejected count for the "needs further action" notice. */
  public MyStoreResponse myStore(long storeId) {
    Store store = stores.findById(storeId).orElseThrow();
    return new MyStoreResponse(
        store.getId(),
        store.getName(),
        store.getAddress(),
        tickets.countForStore(storeId, OPEN),
        tickets.countForStore(storeId, EnumSet.of(TicketStatus.REJECTED)));
  }

  /** AC 4.1, 10.1, 10.2: open tickets by nearest deadline (overdue ones first), then approved. */
  public List<TicketSummaryResponse> myTickets(long storeId) {
    return ticketViews.summaries(tickets.findForStore(storeId));
  }

  /** AC 4.2. Another store's ticket gets the same 404 as a missing one. */
  public TicketDetailResponse myTicket(long storeId, long ticketId) {
    return ticketViews.detail(
        tickets
            .findByIdForStore(ticketId, storeId)
            .orElseThrow(() -> new NotFound("Ticket not found.")));
  }
}
