package com.audeat.owner;

import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.TicketStatus;
import com.audeat.store.Store;
import com.audeat.store.StoreRepository;
import java.util.EnumSet;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads for the owner endpoints, always for the caller's own store (DESIGN Decision 8). */
@Service
@Transactional(readOnly = true)
public class OwnerService {

  /** Every status except APPROVED: the ticket still needs the owner or an inspector. */
  private static final Set<TicketStatus> OPEN =
      EnumSet.complementOf(EnumSet.of(TicketStatus.APPROVED));

  private final StoreRepository stores;
  private final RemediationTicketRepository tickets;

  public OwnerService(StoreRepository stores, RemediationTicketRepository tickets) {
    this.stores = stores;
    this.tickets = tickets;
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
}
