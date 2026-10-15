package com.audeat.user;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for {@link UserAccount}. Emails are stored normalized (trimmed, lower-case). */
public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {

  Optional<UserAccount> findByEmail(String email);

  boolean existsByEmail(String email);
}
