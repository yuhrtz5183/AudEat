package com.audeat.store;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

/** Persistence for {@link Store}. */
public interface StoreRepository extends JpaRepository<Store, Long> {

  /** {@code SELECT ... FOR UPDATE}: serializes starting an inspection at one store (AC 1.1). */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  Optional<Store> findWithLockById(long id);
}
