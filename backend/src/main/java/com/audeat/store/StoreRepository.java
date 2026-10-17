package com.audeat.store;

import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for {@link Store}. */
public interface StoreRepository extends JpaRepository<Store, Long> {}
